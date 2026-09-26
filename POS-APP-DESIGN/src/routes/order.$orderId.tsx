import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  PauseCircle,
  Plus,
  Printer,
  PrinterCheck,
  ReceiptText,
  Search,
  Send,
  ShoppingCart,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
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
import { money, time } from "@/lib/pos/format";
import { can, canSpecial } from "@/lib/pos/permissions";
import { usePos, type SendKotResult } from "@/lib/pos/store";
import type { AddonGroup, CartLine, LineStatus, MenuItem } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/order/$orderId")({
  head: () => ({
    meta: [
      { title: "Take order — BillerPe POS" },
      {
        name: "description",
        content: "Build the round, send the KOT to the kitchen and request the bill.",
      },
      { property: "og:title", content: "Take order — BillerPe POS" },
      {
        property: "og:description",
        content: "Build the round, send the KOT to the kitchen and request the bill.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrderPage,
});

const lineStatusCls: Record<LineStatus, string> = {
  new: "bg-muted text-muted-foreground",
  sent: "bg-status-billed-soft text-status-billed",
  preparing: "bg-status-hold-soft text-status-hold",
  ready: "bg-status-ready-soft text-status-ready",
  served: "bg-muted text-muted-foreground",
};

function ItemRow({ item, onAdd, draftQty }: { item: MenuItem; onAdd: () => void; draftQty: number }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-border px-1 py-3 last:border-0",
        item.outOfStock && "opacity-55",
      )}
    >
      <VegMark type={item.vegType} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {item.shortCode} · {item.kitchen}
          {item.variants?.length ? " · variants" : ""}
          {item.outOfStock ? " · Out of stock" : ""}
        </p>
      </div>
      <span className="num text-sm">{money(item.price)}</span>
      {item.outOfStock ? (
        <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
          Out of stock
        </span>
      ) : draftQty > 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="tap inline-flex items-center gap-1 rounded-md border border-primary bg-primary-soft px-2 font-display text-sm font-bold text-primary-soft-foreground"
        >
          <Plus className="size-3" /> {draftQty}
        </button>
      ) : (
        <Button size="sm" className="tap px-3" onClick={onAdd}>
          <Plus className="size-4" /> Add
        </Button>
      )}
    </div>
  );
}

function OrderPage() {
  const { orderId } = Route.useParams();
  const pos = usePos();
  const navigate = useNavigate();
  const canBill = can(pos.permissions, "billing", "create");
  const canPrintBill = !canBill && canSpecial(pos.permissions, "printBill");

  const order = pos.orderById(orderId);
  const table = order?.tableId ? pos.tableById(order.tableId) : undefined;

  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [optionItem, setOptionItem] = useState<MenuItem | null>(null);
  const [variantId, setVariantId] = useState<string>("");
  const [addonPick, setAddonPick] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState("");
  const [optQty, setOptQty] = useState(1);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ name: "", price: 0, quantity: 1, kitchen: "Main Kitchen" });
  const [busy, setBusy] = useState<null | "kot" | "hold" | "bill">(null);
  const [kotResult, setKotResult] = useState<SendKotResult | null>(null);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [guests, setGuests] = useState(order?.guests ?? 2);
  const [customer, setCustomer] = useState({
    name: order?.customerName ?? "",
    mobile: order?.customerMobile ?? "",
  });

  const items = useMemo(() => {
    if (!order) return [];
    const base = pos.itemsForMenu(order.menuId);
    const q = query.trim().toLowerCase();
    return base.filter((i) => {
      const inCat = categoryId === "all" || i.categoryId === categoryId;
      const inQuery =
        !q || i.name.toLowerCase().includes(q) || i.shortCode.toLowerCase().includes(q);
      return inCat && inQuery;
    });
  }, [order, pos, query, categoryId]);

  if (!order) {
    return (
      <AppShell title="Order">
        <EmptyState
          title="This order is no longer open"
          body="It may have been settled, cancelled or merged into another table."
          action={
            <Button asChild className="tap">
              <Link to="/tables">Back to tables</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const totals = pos.totalsFor(order);
  const draftCount = order.draftLines.reduce((n, l) => n + l.quantity, 0);

  const addSimple = (item: MenuItem) => {
    if (item.variants?.length || item.addonGroups?.length) {
      setOptionItem(item);
      setVariantId(item.variants?.[0]?.id ?? "");
      setAddonPick(
        Object.fromEntries(
          (item.addonGroups ?? []).map((g) => [
            g.id,
            g.min > 0 && g.options[0] ? [g.options[0].id] : [],
          ]),
        ),
      );
      setNote("");
      setOptQty(1);
      return;
    }
    void pos.addLine(order.id, {
      itemId: item.id,
      name: item.name,
      addonNames: [],
      unitPrice: item.price,
      quantity: 1,
      kitchen: item.kitchen,
      vegType: item.vegType,
    });
  };

  const confirmOptions = () => {
    if (!optionItem) return;
    const groups = optionItem.addonGroups ?? [];
    for (const g of groups) {
      const picked = addonPick[g.id] ?? [];
      if (picked.length < g.min) {
        toast.error(`${g.name}: choose at least ${g.min}`);
        return;
      }
      if (picked.length > g.max) {
        toast.error(`${g.name}: choose at most ${g.max}`);
        return;
      }
    }
    const variant = optionItem.variants?.find((v) => v.id === variantId);
    const addonNames: string[] = [];
    let addonPrice = 0;
    for (const g of groups) {
      for (const id of addonPick[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === id);
        if (opt) {
          addonNames.push(opt.name);
          addonPrice += opt.price;
        }
      }
    }
    void pos.addLine(order.id, {
      itemId: optionItem.id,
      name: optionItem.name,
      variantName: variant?.name,
      addonNames,
      note: note.trim() || undefined,
      unitPrice: (variant?.price ?? optionItem.price) + addonPrice,
      quantity: optQty,
      kitchen: optionItem.kitchen,
      vegType: optionItem.vegType,
    });
    setOptionItem(null);
  };

  const toggleAddon = (group: AddonGroup, optionId: string) => {
    setAddonPick((prev) => {
      const current = prev[group.id] ?? [];
      if (group.max === 1) return { ...prev, [group.id]: [optionId] };
      return {
        ...prev,
        [group.id]: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      };
    });
  };

  const sendKot = async () => {
    setBusy("kot");
    const res = await pos.sendKot(order.id);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error ?? "Could not send the KOT");
      return;
    }
    setCartOpen(false);
    setKotResult(res);
  };

  const Cart = (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto">
        {order.rounds.map((r) => (
          <div key={r.kotNo} className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Round {r.roundNo} · Sent {time(r.sentAt)}
              </p>
              {r.printed ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <PrinterCheck className="size-3" /> KOT #{r.kotNo}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary-soft-foreground">
                  <TriangleAlert className="size-3" /> Not printed
                </span>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {r.lines.map((l) => (
                <LineRow key={l.id} line={l} locked />
              ))}
            </div>
          </div>
        ))}

        <div>
          <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
            New round
          </p>
          <div className="mt-2 space-y-2">
            {order.draftLines.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Add items from the menu to start a round.
              </p>
            ) : (
              order.draftLines.map((l) => (
                <LineRow
                  key={l.id}
                  line={l}
                  onQty={(q) => void pos.updateLineQty(order.id, l.id, q)}
                  onNote={(n) => void pos.updateLineNote(order.id, l.id, n)}
                  onRemove={() => void pos.removeLine(order.id, l.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="num text-foreground">{money(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>CGST 2.5% + SGST 2.5%</span>
          <span className="num text-foreground">{money(totals.cgst + totals.sgst)}</span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="font-display font-bold">Total</span>
          <span className="num text-lg">{money(totals.total)}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="tap"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("hold");
            const res = await pos.holdOrder(order.id);
            setBusy(null);
            if (res.ok) {
              toast.success("Order held");
              void navigate({ to: "/tables" });
            }
          }}
        >
          <PauseCircle className="size-4" /> Hold
        </Button>
        <Button
          variant="outline"
          className="tap"
          disabled={busy !== null}
          onClick={async () => {
            if (canBill || canPrintBill) {
              if (canPrintBill && !canBill) {
                setBusy("bill");
                const pr = await pos.printBill(order.id);
                setBusy(null);
                if (!pr.ok) return void toast.error(pr.error ?? "Could not print");
                toast.success(`Bill ${order.code} printed`);
              }
              if (order.rounds.length === 0) {
                toast.error("Send a KOT before billing");
                return;
              }
              void navigate({ to: "/bill/$orderId", params: { orderId: order.id } });
              return;
            }
            setBusy("bill");
            const res = await pos.requestBill(order.id);
            setBusy(null);
            if (res.ok) {
              toast.success("Bill requested at the counter");
              void navigate({ to: "/tables" });
            } else toast.error(res.error ?? "Could not request the bill");
          }}
        >
          <ReceiptText className="size-4" /> {canBill ? "Bill" : canPrintBill ? "Print bill" : "Request bill"}
        </Button>
        <Button
          className="tap col-span-2"
          disabled={busy !== null || order.draftLines.length === 0}
          onClick={() => void sendKot()}
        >
          {busy === "kot" ? <Spinner /> : <Send className="size-4" />} Send KOT
        </Button>
      </div>
    </div>
  );

  return (
    <AppShell
      title={table ? `${table.name} · ${order.code}` : `Token ${order.tokenNo} · ${order.code}`}
      subtitle={`${order.captainName} · ${pos.menus.find((m) => m.id === order.menuId)?.name}`}
      topBarLeft={
        <Link
          to={order.type === "dine-in" ? "/tables" : pos.user?.role === "cashier" ? "/orders" : "/takeaway"}
          aria-label="Back"
          className="tap -ml-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
      }
    >
      <div className="md:flex md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setGuests(order.guests);
                setGuestsOpen(true);
              }}
              className="tap inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-semibold"
            >
              <Users className="size-4 text-muted-foreground" /> {order.guests} guests
            </button>
            {pos.menus.map((m) => (
              <Chip
                key={m.id}
                active={m.id === order.menuId}
                onClick={() => void pos.setOrderMenu(order.id, m.id)}
              >
                {m.name}
              </Chip>
            ))}
          </div>

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="tap pl-9"
              placeholder="Search item or short code"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="no-scrollbar -mx-3 mt-3 flex gap-2 overflow-x-auto px-3 md:hidden">
            <Chip active={categoryId === "all"} onClick={() => setCategoryId("all")}>
              All
            </Chip>
            {pos.categories.map((c) => (
              <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>

          <div className="mt-3 flex gap-3">
            <div className="hidden w-40 shrink-0 space-y-1 md:block">
              <button
                type="button"
                onClick={() => setCategoryId("all")}
                className={cn(
                  "tap w-full rounded-md px-3 text-left text-sm font-semibold",
                  categoryId === "all" ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground",
                )}
              >
                All items
              </button>
              {pos.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    "tap w-full rounded-md px-3 text-left text-sm font-semibold",
                    categoryId === c.id ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 shadow-soft">
              {items.length === 0 ? (
                <div className="py-8">
                  <EmptyState title="No items match" body="Try another search or category." />
                </div>
              ) : (
                items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    draftQty={order.draftLines
                      .filter((l) => l.itemId === item.id)
                      .reduce((n, l) => n + l.quantity, 0)}
                    onAdd={() => addSimple(item)}
                  />
                ))
              )}
              <div className="border-t border-border py-3">
                <Button variant="outline" className="tap w-full" onClick={() => setCustomOpen(true)}>
                  <Plus className="size-4" /> Custom item
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-card p-3 shadow-soft">
            <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Customer (optional)
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Input
                className="tap"
                placeholder="Name"
                value={customer.name}
                onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                onBlur={() => void pos.setCustomer(order.id, customer.name, customer.mobile)}
              />
              <Input
                className="tap"
                inputMode="numeric"
                maxLength={10}
                placeholder="Mobile"
                value={customer.mobile}
                onChange={(e) => setCustomer((c) => ({ ...c, mobile: e.target.value.replace(/\D/g, "") }))}
                onBlur={() => void pos.setCustomer(order.id, customer.name, customer.mobile)}
              />
            </div>
          </div>
        </div>

        {/* Tablet cart panel */}
        <aside className="hidden w-80 shrink-0 md:block">
          <div className="sticky top-20 rounded-lg border border-border bg-card p-4 shadow-soft">
            <p className="font-display text-sm font-bold">Cart</p>
            <div className="mt-3 max-h-[70vh]">{Cart}</div>
          </div>
        </aside>
      </div>

      {/* Phone cart bar */}
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="fixed inset-x-3 bottom-20 z-20 flex items-center gap-3 rounded-lg bg-primary px-4 py-3 text-primary-foreground shadow-soft md:hidden"
      >
        <ShoppingCart className="size-5" />
        <span className="flex-1 text-left text-sm font-semibold">
          {draftCount > 0 ? `${draftCount} item${draftCount > 1 ? "s" : ""} in new round` : "View cart"}
        </span>
        <span className="num text-base">{money(totals.total)}</span>
        <ChevronDown className="size-4 rotate-180" />
      </button>

      <ResponsiveSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        title={table ? `${table.name} cart` : `Token ${order.tokenNo}`}
        description={`${order.rounds.length} round${order.rounds.length === 1 ? "" : "s"} sent`}
      >
        <div className="py-2">{Cart}</div>
      </ResponsiveSheet>

      {/* Variants + addons */}
      <ResponsiveSheet
        open={Boolean(optionItem)}
        onOpenChange={(o) => !o && setOptionItem(null)}
        title={optionItem?.name ?? "Choose options"}
        footer={
          <Button className="tap w-full" onClick={confirmOptions}>
            Add to round
          </Button>
        }
      >
        {optionItem ? (
          <div className="space-y-4 py-2">
            {optionItem.variants?.length ? (
              <div>
                <p className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Variant
                </p>
                <div className="space-y-2">
                  {optionItem.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVariantId(v.id)}
                      className={cn(
                        "tap flex w-full items-center justify-between rounded-md border px-3 text-sm font-semibold",
                        variantId === v.id ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border",
                      )}
                    >
                      {v.name}
                      <span className="num">{money(v.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {(optionItem.addonGroups ?? []).map((g) => (
              <div key={g.id}>
                <p className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {g.name}{" "}
                  <span className="font-normal normal-case">
                    ({g.min === g.max ? `pick ${g.max}` : `min ${g.min}, max ${g.max}`})
                  </span>
                </p>
                <div className="space-y-2">
                  {g.options.map((o) => {
                    const picked = (addonPick[g.id] ?? []).includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => toggleAddon(g, o.id)}
                        className={cn(
                          "tap flex w-full items-center justify-between rounded-md border px-3 text-sm font-semibold",
                          picked ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border",
                        )}
                      >
                        {o.name}
                        <span className="num">{o.price ? `+${money(o.price)}` : "Free"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div>
              <Label htmlFor="opt-note">Note for the kitchen</Label>
              <Textarea
                id="opt-note"
                className="mt-1.5"
                rows={2}
                placeholder="Less spicy, no onion…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Quantity</span>
              <QtyStepper value={optQty} onChange={setOptQty} min={1} />
            </div>
          </div>
        ) : null}
      </ResponsiveSheet>

      {/* Custom item */}
      <ResponsiveSheet
        open={customOpen}
        onOpenChange={setCustomOpen}
        title="Custom item"
        footer={
          <Button
            className="tap w-full"
            onClick={() => {
              if (!custom.name.trim() || custom.price <= 0) {
                toast.error("Enter a name and a price");
                return;
              }
              void pos.addLine(order.id, {
                name: custom.name.trim(),
                addonNames: [],
                unitPrice: custom.price,
                quantity: custom.quantity || 1,
                kitchen: custom.kitchen,
                vegType: "veg",
                custom: true,
              });
              setCustom({ name: "", price: 0, quantity: 1, kitchen: "Main Kitchen" });
              setCustomOpen(false);
            }}
          >
            Add to round
          </Button>
        }
      >
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="c-name">Item name</Label>
            <Input
              id="c-name"
              className="tap mt-1.5"
              value={custom.name}
              onChange={(e) => setCustom((c) => ({ ...c, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="c-price">Price</Label>
              <NumberField
                id="c-price"
                value={custom.price}
                onChange={(price) => setCustom((c) => ({ ...c, price }))}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="c-qty">Quantity</Label>
              <NumberField
                id="c-qty"
                value={custom.quantity}
                onChange={(quantity) => setCustom((c) => ({ ...c, quantity }))}
                className="mt-1.5"
              />
            </div>
          </div>
          {pos.outlet.kitchens.length > 1 ? (
            <div>
              <Label>Kitchen</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {pos.outlet.kitchens.map((k) => (
                  <Chip
                    key={k}
                    active={custom.kitchen === k}
                    onClick={() => setCustom((c) => ({ ...c, kitchen: k }))}
                  >
                    {k}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </ResponsiveSheet>

      {/* Guests */}
      <ResponsiveSheet
        open={guestsOpen}
        onOpenChange={setGuestsOpen}
        title="Change guests"
        footer={
          <Button
            className="tap w-full"
            onClick={async () => {
              await pos.setGuests(order.id, guests);
              setGuestsOpen(false);
              toast.success(`Guests updated to ${guests}`);
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

      {/* KOT confirmation */}
      <ResponsiveSheet
        open={Boolean(kotResult)}
        onOpenChange={(o) => !o && setKotResult(null)}
        title={kotResult?.printed ? "KOT sent" : "KOT saved, not printed"}
      >
        {kotResult ? (
          <>
          {order.tokenNo && order.type !== "dine-in" ? (
            <div className="mb-3 rounded-lg bg-primary-soft p-4 text-center text-primary-soft-foreground">
              <p className="text-sm font-semibold">Token number</p>
              <p className="num font-display text-5xl font-extrabold">#{order.tokenNo}</p>
              <p className="text-xs">Hand this token to the customer</p>
            </div>
          ) : null}
          <div className="space-y-4 py-2">
            {kotResult.printed ? (
              <div className="flex items-start gap-3 rounded-md bg-status-ready-soft p-3">
                <CheckCircle2 className="mt-0.5 size-5 text-status-ready" />
                <p className="text-sm text-status-ready">
                  KOT #{kotResult.kotNo} sent · printed on {kotResult.printerName} (192.168.1.50)
                </p>
              </div>
            ) : (
              <div className="space-y-3 rounded-md bg-primary-soft p-3">
                <p className="text-sm text-primary-soft-foreground">
                  KOT #{kotResult.kotNo} saved but NOT printed — {kotResult.printerName} not reachable.
                  Are you on the outlet Wi-Fi?
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="tap"
                    onClick={async () => {
                      const res = await pos.retryPrintKot(order.id, kotResult.kotNo!, kotResult.printerName);
                      toast[res.ok ? "success" : "error"](
                        res.ok ? "Printed" : (res.error ?? "Still not reachable"),
                      );
                    }}
                  >
                    <Printer className="size-4" /> Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="tap"
                    onClick={async () => {
                      const res = await pos.retryPrintKot(order.id, kotResult.kotNo!, "Kitchen Printer");
                      toast[res.ok ? "success" : "error"](
                        res.ok ? "Printed on Kitchen Printer" : (res.error ?? "Could not print"),
                      );
                    }}
                  >
                    Print on another printer
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-md border border-border p-3">
              <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Round {kotResult.roundNo} summary
              </p>
              <div className="mt-2 space-y-1">
                {order.rounds
                  .find((r) => r.kotNo === kotResult.kotNo)
                  ?.lines.map((l) => (
                    <p key={l.id} className="flex items-center gap-2 text-sm">
                      <VegMark type={l.vegType} />
                      <span className="num">{l.quantity}×</span>
                      <span className="min-w-0 flex-1 truncate">
                        {l.name}
                        {l.variantName ? ` (${l.variantName})` : ""}
                      </span>
                    </p>
                  ))}
              </div>
            </div>

            <Button className="tap w-full" onClick={() => setKotResult(null)}>
              Continue
            </Button>
          </div>
          </>
        ) : null}
      </ResponsiveSheet>
    </AppShell>
  );
}

function LineRow({
  line,
  locked,
  onQty,
  onNote,
  onRemove,
}: {
  line: CartLine;
  locked?: boolean;
  onQty?: (q: number) => void;
  onNote?: (n: string) => void;
  onRemove?: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="flex items-start gap-2">
        <VegMark type={line.vegType} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {line.name}
            {line.custom ? (
              <span className="ml-1 rounded bg-muted px-1 text-[10px] font-bold uppercase">custom</span>
            ) : null}
          </p>
          {line.variantName || line.addonNames.length ? (
            <p className="truncate text-[11px] text-muted-foreground">
              {[line.variantName, ...line.addonNames].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {line.note ? <p className="text-[11px] font-semibold">Note: {line.note}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="num text-sm">{money(line.unitPrice * line.quantity)}</span>
          {locked ? (
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold capitalize", lineStatusCls[line.status])}>
              {line.status}
            </span>
          ) : null}
        </div>
      </div>

      {locked ? (
        <p className="mt-1 pl-6 text-[11px] text-muted-foreground">
          {line.quantity} × {money(line.unitPrice)}
        </p>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2 pl-6">
          <QtyStepper size="sm" value={line.quantity} onChange={(q) => onQty?.(q)} />
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
      )}

      {noteOpen && !locked ? (
        <Input
          autoFocus
          className="mt-2"
          placeholder="Note for the kitchen"
          defaultValue={line.note ?? ""}
          onBlur={(e) => {
            onNote?.(e.target.value);
            setNoteOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
