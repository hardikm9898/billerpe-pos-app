import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  PauseCircle,
  Minus,
  Plus,
  Printer,
  PrinterCheck,
  ReceiptText,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { ItemSearch } from "@/components/pos/ItemSearch";
import { CustomItemSheet, KotResultSheet, OptionsSheet } from "@/components/pos/ordering";
import { CustomerBar, CustomerSheet } from "@/components/pos/CustomerSheet";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import {
  Chip,
  EmptyState,
  NumberField,
  QtyStepper,
  Spinner,
  VegMark,
} from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { engineLineTotal } from "@/lib/pos/billEngine";
import { money, qty as fmtQty, time } from "@/lib/pos/format";
import { customItemTargets } from "@/lib/pos/routing";
import { usePos, type SendResult } from "@/lib/pos/store";
import {
  DIETARY_LABEL,
  type AddonGroup,
  type Dietary,
  type DraftLine,
  type LineAddon,
  type LineStatus,
  type MenuItem,
  type Order,
  type OrderLine,
  type OrderTotals,
} from "@/lib/pos/types";
import { cn } from "@/lib/utils";

// One screen for every cart: a table ("t.<tableId>"), an existing pickup
// order ("o.<orderId>") or a new pickup ("p.<id>"). The cart lives on this
// phone until Send KOT / Hold - the table does not change before that.

export const Route = createFileRoute("/order/$key")({
  component: OrderPage,
});

const lineStatus: Record<LineStatus, { label: string; cls: string }> = {
  sent: { label: "Sent", cls: "bg-status-billed-soft text-status-billed" },
  preparing: { label: "Preparing", cls: "bg-status-hold-soft text-status-hold" },
  ready: { label: "Ready", cls: "bg-status-ready-soft text-status-ready" },
  served: { label: "Served", cls: "bg-muted text-muted-foreground" },
};

function lineMoney(l: Pick<OrderLine, "price" | "qty" | "addons">) {
  return engineLineTotal({ price: l.price, qty: l.qty, addons: l.addons });
}

function OrderPage() {
  const { key } = Route.useParams();
  const pos = usePos();
  const navigate = useNavigate();
  const data = pos.data!;

  // Make sure the cart exists (deep link / refresh).
  const kind = key.slice(0, 2);
  const ref = key.slice(2);
  const hasDraft = Boolean(pos.draft(key));
  useEffect(() => {
    if (hasDraft) return;
    if (kind === "t.") pos.openDraft(key, { type: "dinin", tableId: ref });
    else if (kind === "o.") pos.openDraft(key, { type: "pickup", orderId: ref });
    else pos.openDraft(key, { type: "pickup" });
  }, [key, hasDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = pos.draft(key);
  const table = kind === "t." ? pos.tableById(ref) : undefined;
  const order: Order | undefined = draft?.orderId
    ? pos.orderById(draft.orderId)
    : table
      ? pos.orderForTable(table.id)
      : kind === "o."
        ? pos.orderById(ref)
        : undefined;

  // Link the cart to the server order once it exists (e.g. another phone fired first).
  useEffect(() => {
    if (draft && order && draft.orderId !== order.id)
      pos.updateDraft(key, (d) => ({ ...d, orderId: order.id }));
  }, [draft, order, key, pos]);

  // Empty carts are dropped when the app starts (store) and re-asked on the
  // Tables screen - never on unmount, which React also runs on a remount.

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [optionItem, setOptionItem] = useState<MenuItem | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [busy, setBusy] = useState<null | "kot" | "hold" | "bill">(null);
  const [kotResult, setKotResult] = useState<SendResult | null>(null);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [guests, setGuests] = useState(2);
  /** Guests on this phone's cart and, once the order exists, on the server (kept equal: the next KOT sends the cart's count). */
  const changeGuests = async (n: number): Promise<boolean> => {
    if (!Number.isInteger(n) || n < 1) return false;
    if (order) {
      const r = await pos.act((b) => b.setGuests(order.id, n));
      if (!r.ok) {
        toast.error(r.error);
        return false;
      }
    }
    pos.updateDraft(key, (d) => ({ ...d, guests: n }));
    return true;
  };
  const [removing, setRemoving] = useState<{ line: OrderLine; kotNo: number } | null>(null);

  const menuId = draft?.menuId ?? order?.menuId ?? "";
  const categories = pos.categoriesFor(menuId);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pos
      .itemsFor(menuId)
      .filter(
        (i) =>
          (categoryId === "all" || i.categoryId === categoryId) &&
          (!q ||
            i.name.toLowerCase().includes(q) ||
            i.shortCode.toLowerCase().startsWith(q) ||
            i.barcode?.trim().toLowerCase() === q),
      )
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }, [pos, menuId, query, categoryId]);

  if (!draft) {
    return (
      <AppShell title="Order">
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </AppShell>
    );
  }

  if (order && (order.status === "settled" || order.status === "cancelled")) {
    return (
      <AppShell title="Order">
        <EmptyState
          title={
            order.status === "settled"
              ? `Bill ${order.billNo} is settled`
              : `Bill ${order.billNo} was cancelled`
          }
          body="Someone closed this order on another device."
          action={
            <Button
              className="tap"
              onClick={() => {
                pos.discardDraft(key);
                void navigate({ to: kind === "t." ? "/tables" : "/takeaway" });
              }}
            >
              Back
            </Button>
          }
        />
      </AppShell>
    );
  }

  const totals: OrderTotals = pos.preview(key);
  const draftCount = draft.lines.reduce((n, l) => n + l.qty, 0);
  const canBill = pos.can("biller", "edit");
  const canPrintBill = pos.can("biller", "create");
  const hasInvoicePrinter = Boolean(pos.thisDevice?.printers.some((p) => p.printsInvoice));
  const isBoss = pos.session?.user.role === "Owner" || pos.session?.user.role === "Manager";
  const me = pos.session?.user.id;
  const label = table ? table.name : order?.token ? `Token ${order.token}` : "Pickup";

  const addItem = (item: MenuItem) => {
    const groups = data.addonGroups.filter((g) => g.active && item.addonGroupIds.includes(g.id));
    if (item.variants.length || groups.length) return setOptionItem(item);
    pos.addLine(key, {
      itemId: item.id,
      name: item.name,
      categoryId: item.categoryId,
      dietary: item.dietary,
      addons: [],
      price: item.price,
      qty: 1,
      custom: false,
    });
  };

  const sendKot = async () => {
    setBusy("kot");
    const r = await pos.sendKot(key);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error ?? "Could not send the KOT");
    setCartOpen(false);
    setKotResult(r);
  };

  const holdOrder = async () => {
    setBusy("hold");
    const r = await pos.hold(key);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Held — bill ${r.billNo}. Items are saved, not sent to the kitchen.`);
    void navigate({ to: kind === "t." ? "/tables" : "/takeaway" });
  };

  // Billing does not need a KOT first (Web POS "Save" / "Bill Print"): items
  // still only in this cart go on the bill without going to the kitchen.
  const goBill = async () => {
    if (!draft.lines.length && !order) return void toast.error("Add items to the order first");
    if (canBill && !draft.lines.length && order)
      return void navigate({ to: "/bill/$orderId", params: { orderId: order.id } });
    setBusy("bill");
    const printHere = !canBill && hasInvoicePrinter && canPrintBill;
    const r = await pos.billFromCart(key, { print: printHere, request: !canBill && !printHere });
    setBusy(null);
    if (!r.ok) return void toast.error(r.error ?? "Could not do this");
    setCartOpen(false);
    if (canBill && r.orderId)
      return void navigate({ to: "/bill/$orderId", params: { orderId: r.orderId } });
    if (printHere && r.print && !r.print.noPrinter && r.print.outcomes.some((o) => !o.ok))
      toast.error("The bill was saved but did not print — reprint it from the order.");
    else toast.success(printHere ? "Bill printed" : "Bill sent to the counter");
    void navigate({ to: kind === "t." ? "/tables" : "/takeaway" });
  };

  const Cart = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
        {order?.kots.map((k) => (
          <div key={k.kotNo} className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Round {k.round} · KOT #{k.kotNo} · {time(k.firedAt)}
              </p>
              <div className="flex items-center gap-1">
                {pos.pendingPrints.some((p) => p.orderId === order.id && p.kotNo === k.kotNo) ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary-soft-foreground">
                    <TriangleAlert className="size-3" /> Not printed
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Reprint KOT ${k.kotNo}`}
                  onClick={async () => {
                    const r = await pos.reprintKot(order.id, k.kotNo);
                    toast[r.ok ? "success" : "error"](
                      r.noPrinter
                        ? "No KOT printer on this device"
                        : r.ok
                          ? `KOT #${k.kotNo} reprinted`
                          : "Printer not reachable",
                    );
                  }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <Printer className="size-4" />
                </button>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {k.lines.map((l) => {
                const canRemove = l.status !== "served" && (isBoss || l.firedById === me);
                return (
                  <div key={l.id} className="rounded-md border border-border bg-card p-2">
                    <div className="flex items-start gap-2">
                      <VegMark type={l.dietary} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {fmtQty(l.qty)} × <span translate="no">{l.name}</span>
                          {l.variantName ? ` (${l.variantName})` : ""}
                          {l.custom ? (
                            <span className="ml-1 rounded bg-muted px-1 text-[10px] font-bold uppercase">
                              custom
                            </span>
                          ) : null}
                        </p>
                        {l.addons.length ? (
                          <p className="text-[11px] text-muted-foreground">
                            + {l.addons.map((a) => a.name).join(", ")}
                          </p>
                        ) : null}
                        {l.note ? (
                          <p className="text-[11px] font-semibold">Note: {l.note}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="num text-sm">{money(lineMoney(l))}</span>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-bold",
                            lineStatus[l.status].cls,
                          )}
                        >
                          {lineStatus[l.status].label}
                        </span>
                      </div>
                    </div>
                    {canRemove ? (
                      <button
                        type="button"
                        onClick={() => setRemoving({ line: l, kotNo: k.kotNo })}
                        className="mt-1 inline-flex items-center gap-1 pl-6 text-[11px] font-semibold text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" /> Remove
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {k.lines.some((l) => l.status !== "served") ? (
              <button
                type="button"
                onClick={async () => {
                  const r = await pos.act((b) => b.markServed(order.id, k.kotNo));
                  if (!r.ok) toast.error(r.error);
                }}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"
              >
                <CheckCircle2 className="size-3.5" /> Mark round {k.round} served
              </button>
            ) : null}
          </div>
        ))}

        <div>
          <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {order?.status === "hold" ? "Held items (not sent yet)" : "New round"}
          </p>
          <div className="mt-2 space-y-2">
            {draft.lines.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Add items from the menu to start a round.
              </p>
            ) : (
              draft.lines.map((l) => (
                <DraftRow
                  key={l.key}
                  line={l}
                  onQty={(q) => pos.setLineQty(key, l.key, q)}
                  onNote={(n) => pos.setLineNote(key, l.key, n)}
                  onRemove={() => pos.removeDraftLine(key, l.key)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
        <Row label="Subtotal" value={totals.subtotal} />
        {totals.discount ? (
          <Row label={order?.discount?.reason ?? "Discount"} value={-totals.discount} />
        ) : null}
        {totals.service ? <Row label="Service charge" value={totals.service} /> : null}
        {totals.packaging ? <Row label="Packaging" value={totals.packaging} /> : null}
        {totals.taxLines.map((t) => (
          <Row
            key={t.id}
            label={`${t.name}${t.type === "pr" ? ` ${t.rate}%` : ""}`}
            value={t.amount}
          />
        ))}
        <div className="flex items-center justify-between pt-1">
          <span className="font-display font-bold">Total</span>
          <span className="num text-lg">{money(totals.grand)}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="tap"
          disabled={busy !== null || draft.lines.length === 0 || order?.status === "billed"}
          onClick={() => void holdOrder()}
        >
          {busy === "hold" ? <Spinner /> : <PauseCircle className="size-4" />} Hold
        </Button>
        <Button
          variant="outline"
          className="tap"
          disabled={busy !== null || (!order && draft.lines.length === 0)}
          onClick={() => void goBill()}
        >
          {busy === "bill" ? <Spinner /> : <ReceiptText className="size-4" />}{" "}
          {canBill ? "Bill" : hasInvoicePrinter && canPrintBill ? "Print bill" : "Bill to counter"}
        </Button>
        <Button
          className="tap col-span-2"
          disabled={busy !== null || draft.lines.length === 0}
          onClick={() => void sendKot()}
        >
          {busy === "kot" ? <Spinner /> : <Send className="size-4" />} Send KOT
        </Button>
      </div>
    </div>
  );

  return (
    <AppShell
      title={`${label}${order ? ` · Bill ${order.billNo}` : " · New order"}`}
      subtitle={`${order?.captainName ?? pos.session?.user.name ?? ""} · ${data.menus.find((m) => m.id === menuId)?.name ?? ""}`}
      topBarLeft={
        <Link
          to={kind === "t." ? "/tables" : "/takeaway"}
          aria-label="Back"
          className="tap -ml-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
      }
    >
      <div className="md:flex md:gap-4">
        <div className="min-w-0 flex-1 pb-20 md:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            {draft.type === "dinin" ? (
              // Guests right here with - / + (Web POS); tap the number to type a big party.
              <div className="inline-flex items-center rounded-md border border-border bg-card">
                <button
                  type="button"
                  aria-label="Fewer guests"
                  disabled={(order?.guests ?? draft.guests) <= 1}
                  onClick={() => void changeGuests((order?.guests ?? draft.guests) - 1)}
                  className="tap inline-flex items-center justify-center text-muted-foreground disabled:opacity-40"
                >
                  <Minus className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGuests(order?.guests ?? draft.guests);
                    setGuestsOpen(true);
                  }}
                  className="tap inline-flex items-center gap-1.5 px-1 text-sm font-semibold"
                >
                  <Users className="size-4 text-muted-foreground" />
                  <span className="num">{order?.guests ?? draft.guests}</span> guests
                </button>
                <button
                  type="button"
                  aria-label="More guests"
                  onClick={() => void changeGuests((order?.guests ?? draft.guests) + 1)}
                  className="tap inline-flex items-center justify-center text-muted-foreground"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            ) : null}
            {data.menus.filter((m) => m.active).length > 1
              ? data.menus
                  .filter((m) => m.active)
                  .map((m) => (
                    <Chip
                      key={m.id}
                      active={m.id === menuId}
                      onClick={() => {
                        pos.updateDraft(key, (d) => ({ ...d, menuId: m.id }));
                        setCategoryId("all");
                      }}
                    >
                      <span translate="no">{m.name}</span>
                    </Chip>
                  ))
              : null}
          </div>

          {/* Who the order is for - top of the screen (owner, 2026-09-26). */}
          <div className="mt-3">
            <CustomerBar
              name={order?.customerName ?? draft.customerName}
              mobile={order?.customerMobile ?? draft.customerMobile}
              onOpen={() => setCustomerOpen(true)}
            />
          </div>

          {/* Custom item sits beside the search, where the Web POS has it. */}
          <div className="mt-3 flex gap-2">
            <ItemSearch
              value={query}
              onChange={setQuery}
              items={pos.itemsFor(menuId)}
              onPick={addItem}
            />
            <Button
              variant="outline"
              className="tap shrink-0 px-3"
              onClick={() => setCustomOpen(true)}
            >
              <Plus className="size-4" /> Custom
            </Button>
          </div>

          <div className="no-scrollbar -mx-3 mt-3 flex gap-2 overflow-x-auto px-3 md:hidden">
            <Chip active={categoryId === "all"} onClick={() => setCategoryId("all")}>
              All
            </Chip>
            {categories.map((c) => (
              <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                <span translate="no">{c.name}</span>
              </Chip>
            ))}
          </div>

          <div className="mt-3 flex gap-3">
            <div className="hidden w-40 shrink-0 space-y-1 md:block">
              {[{ id: "all", name: "All items" }, ...categories].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    "tap w-full rounded-md px-3 text-left text-sm font-semibold",
                    categoryId === c.id
                      ? "bg-primary-soft text-primary-soft-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <span translate="no">{c.name}</span>
                </button>
              ))}
            </div>
            <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 shadow-soft">
              {items.length === 0 ? (
                <div className="py-8">
                  <EmptyState title="No items match" body="Try another search or category." />
                </div>
              ) : (
                items.map((item) => {
                  const inCart = draft.lines
                    .filter((l) => l.itemId === item.id)
                    .reduce((n, l) => n + l.qty, 0);
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-3 border-b border-border px-1 py-3 last:border-0",
                        item.outOfStock && "opacity-55",
                      )}
                    >
                      <VegMark type={item.dietary} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          <span translate="no">{item.name}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.shortCode}
                          {item.variants.length ? " · variants" : ""}
                          {item.addonGroupIds.length ? " · add-ons" : ""}
                        </p>
                      </div>
                      <span className="num text-sm">
                        {money(item.variants[0]?.price ?? item.price)}
                      </span>
                      {item.outOfStock ? (
                        <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                          Out of stock
                        </span>
                      ) : inCart > 0 ? (
                        <button
                          type="button"
                          onClick={() => addItem(item)}
                          className="tap inline-flex items-center gap-1 rounded-md border border-primary bg-primary-soft px-2 font-display text-sm font-bold text-primary-soft-foreground"
                        >
                          <Plus className="size-3" /> {fmtQty(inCart)}
                        </button>
                      ) : (
                        <Button size="sm" className="tap px-3" onClick={() => addItem(item)}>
                          <Plus className="size-4" /> Add
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <aside className="hidden w-80 shrink-0 md:block">
          {/* A column capped at the screen: the rounds scroll, the buttons stay. */}
          <div className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col supports-[height:100dvh]:max-h-[calc(100dvh-6rem)] rounded-lg border border-border bg-card p-4 shadow-soft">
            <p className="shrink-0 font-display text-sm font-bold">Cart</p>
            <div className="mt-3 flex min-h-0 flex-1 flex-col">{Cart}</div>
          </div>
        </aside>
      </div>

      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="fixed inset-x-3 bottom-20 z-20 flex items-center gap-3 rounded-lg bg-primary px-4 py-3 text-primary-foreground shadow-soft md:hidden"
      >
        <ShoppingCart className="size-5" />
        <span className="flex-1 text-left text-sm font-semibold">
          {draftCount > 0
            ? `${fmtQty(draftCount)} item${draftCount === 1 ? "" : "s"} not sent`
            : "View cart"}
        </span>
        <span className="num text-base">{money(totals.grand)}</span>
        <ChevronDown className="size-4 rotate-180" />
      </button>

      <ResponsiveSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        title={`${label} cart`}
        description={
          order
            ? `${order.kots.length} round${order.kots.length === 1 ? "" : "s"} sent`
            : "Nothing sent yet"
        }
      >
        <div className="flex min-h-0 flex-1 flex-col py-2">{Cart}</div>
      </ResponsiveSheet>

      <OptionsSheet
        item={optionItem}
        groups={data.addonGroups}
        onClose={() => setOptionItem(null)}
        onAdd={(l) => {
          pos.addLine(key, l);
          setOptionItem(null);
        }}
      />

      <CustomItemSheet
        open={customOpen}
        onOpenChange={setCustomOpen}
        kitchens={data.settings.kitchens}
        printers={pos.thisDevice?.printers ?? []}
        onAdd={(l) => {
          pos.addLine(key, l);
          setCustomOpen(false);
        }}
      />

      <CustomerSheet
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        orderId={order?.id}
        initial={{
          name: order?.customerName ?? draft.customerName,
          mobile: order?.customerMobile ?? draft.customerMobile,
          address: order?.customerAddress ?? draft.customerAddress,
          gstin: order?.customerGstin ?? draft.customerGstin,
        }}
        onSave={async (c) => {
          if (order) {
            const r = await pos.act((b) => b.setCustomer(order.id, c));
            if (!r.ok) {
              toast.error(r.error);
              return false;
            }
          }
          pos.updateDraft(key, (d) => ({
            ...d,
            customerName: c.name,
            customerMobile: c.mobile,
            customerAddress: c.address,
            customerGstin: c.gstin,
          }));
          return true;
        }}
        onRepeat={(last) => {
          // The customer's usual order into this cart, at today's prices;
          // items no longer on the menu (or out of stock) are skipped.
          let added = 0;
          let skipped = 0;
          for (const l of [...last.kots.flatMap((k) => k.lines), ...last.heldLines]) {
            const item = l.itemId ? data.items.find((i) => i.id === l.itemId) : undefined;
            if (!item || !item.active || item.outOfStock) {
              skipped += 1;
              continue;
            }
            const variant = l.variantId
              ? item.variants.find((v) => v.variantId === l.variantId)
              : undefined;
            pos.addLine(key, {
              itemId: item.id,
              name: item.name,
              categoryId: item.categoryId,
              dietary: item.dietary,
              variantId: variant?.variantId,
              variantName: variant?.name,
              addons: l.addons,
              note: l.note,
              price: variant?.price ?? item.price,
              qty: l.qty,
              custom: false,
            });
            added += 1;
          }
          setCustomerOpen(false);
          toast.success(
            `${added} item${added === 1 ? "" : "s"} added to the cart${skipped ? ` · ${skipped} not on the menu now` : ""}`,
          );
        }}
      />

      <ResponsiveSheet
        open={guestsOpen}
        onOpenChange={setGuestsOpen}
        title="Change guests"
        footer={
          <Button
            className="tap w-full"
            onClick={async () => {
              if (guests < 1) return void toast.error("Guests must be at least 1");
              if (await changeGuests(guests)) setGuestsOpen(false);
            }}
          >
            Save
          </Button>
        }
      >
        <div className="space-y-2 py-2">
          <Label htmlFor="g">Guests</Label>
          <NumberField id="g" value={guests} onChange={setGuests} decimals={0} />
        </div>
      </ResponsiveSheet>

      <RemoveLineSheet
        target={removing}
        onClose={() => setRemoving(null)}
        onRemove={async (reason) => {
          if (!removing || !order) return;
          const r = await pos.act((b) => b.removeLine(order.id, removing.line.id, reason));
          if (!r.ok) return void toast.error(r.error);
          toast.success(`${removing.line.name} removed`);
          setRemoving(null);
        }}
      />

      <KotResultSheet
        result={kotResult}
        onClose={() => setKotResult(null)}
        onRetry={pos.retryPending}
        pending={pos.pendingPrints}
      />
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span className="truncate pr-2">{label}</span>
      <span className="num text-foreground">{value < 0 ? `− ${money(-value)}` : money(value)}</span>
    </div>
  );
}

function DraftRow({
  line,
  onQty,
  onNote,
  onRemove,
}: {
  line: DraftLine;
  onQty: (q: number) => void;
  onNote: (n: string) => void;
  onRemove: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="flex items-start gap-2">
        <VegMark type={line.dietary} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            <span translate="no">{line.name}</span>
            {line.variantName ? ` (${line.variantName})` : ""}
            {line.custom ? (
              <span className="ml-1 rounded bg-muted px-1 text-[10px] font-bold uppercase">
                custom
              </span>
            ) : null}
          </p>
          {line.addons.length ? (
            <p className="text-[11px] text-muted-foreground">
              + {line.addons.map((a) => a.name).join(", ")}
            </p>
          ) : null}
          {line.note ? <p className="text-[11px] font-semibold">Note: {line.note}</p> : null}
        </div>
        <span className="num text-sm">{money(lineMoney(line))}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 pl-6">
        <QtyStepper size="sm" value={line.qty} onChange={onQty} />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            className="rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
          >
            {line.note ? "Edit note" : "Add note"}
          </button>
          <button
            type="button"
            aria-label="Remove item"
            onClick={onRemove}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      {noteOpen ? (
        <Input
          autoFocus
          className="mt-2"
          placeholder="Note for the kitchen"
          defaultValue={line.note ?? ""}
          onBlur={(e) => {
            onNote(e.target.value);
            setNoteOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function RemoveLineSheet({
  target,
  onClose,
  onRemove,
}: {
  target: { line: OrderLine; kotNo: number } | null;
  onClose: () => void;
  onRemove: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setReason(""), [target]);
  return (
    <ResponsiveSheet
      open={Boolean(target)}
      onOpenChange={(o) => !o && onClose()}
      title={target ? `Remove ${target.line.name}?` : ""}
      description={
        target
          ? `From KOT #${target.kotNo}. The kitchen screen updates; the reason is saved in the audit log.`
          : undefined
      }
      footer={
        <Button
          variant="destructive"
          className="tap w-full"
          disabled={!reason.trim() || busy}
          onClick={async () => {
            setBusy(true);
            await onRemove(reason);
            setBusy(false);
          }}
        >
          Remove item
        </Button>
      }
    >
      <div className="space-y-3 py-2">
        <div className="flex flex-wrap gap-2">
          {["Punched by mistake", "Customer cancelled", "Out of stock"].map((r) => (
            <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
              {r}
            </Chip>
          ))}
        </div>
        <Input
          className="tap"
          placeholder="Or type a reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </ResponsiveSheet>
  );
}
