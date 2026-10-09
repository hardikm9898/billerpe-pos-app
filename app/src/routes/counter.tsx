import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Plus, Printer, Search, ShoppingCart, Table2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { ItemSearch } from "@/components/pos/ItemSearch";
import { billShareText, ShareSheet } from "@/components/pos/billing/BillSheets";
import {
  SettleSheet,
  SettleSuccess,
  type SettleResult,
} from "@/components/pos/billing/SettleSheet";
import { shareBillPdf, shareWhatsApp } from "@/components/pos/billing/share";
import { CustomItemSheet, KotResultSheet, OptionsSheet } from "@/components/pos/ordering";
import { ItemThumb } from "@/components/pos/menu/Photos";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, QtyStepper, Spinner, VegMark } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { billTotals } from "@/lib/pos/bill";
import { money, qty } from "@/lib/pos/format";
import { usePos, type SendResult } from "@/lib/pos/store";
import type { DraftLine, MenuItem, OrderType } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/counter")({
  component: CounterPage,
});

/**
 * Quick counter billing (QSR). Same rules as Web POS keyboard billing:
 * Dine-in is always given a table, Pickup has none. Saving creates the order
 * and sends the KOT in one step; the token is shown once saved.
 */
function CounterPage() {
  const pos = usePos();
  const data = pos.data!;
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [type, setType] = useState<OrderType>("pickup");
  const [tableId, setTableId] = useState<string | undefined>();
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [picker, setPicker] = useState<MenuItem | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [tablePick, setTablePick] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState<"print" | "settle" | null>(null);
  const [settleId, setSettleId] = useState<string | null>(null);
  const [kotResult, setKotResult] = useState<SendResult | null>(null);
  const [result, setResult] = useState<SettleResult | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const menuId = pos.menuFor(type, tableId);
  const table = pos.tableById(tableId);
  const categories = pos.categoriesFor(menuId);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pos
      .itemsFor(menuId)
      .filter(
        (i) =>
          (cat === "all" || i.categoryId === cat) &&
          (!q ||
            i.name.toLowerCase().includes(q) ||
            i.shortCode.toLowerCase().startsWith(q) ||
            i.barcode?.trim().toLowerCase() === q),
      )
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }, [pos, menuId, query, cat]);
  const totals = billTotals({ type, sectionId: table?.sectionId, lines }, data.settings);
  const count = lines.reduce((a, l) => a + l.qty, 0);

  const add = (l: Omit<DraftLine, "key">) =>
    setLines((ls) => {
      const same = ls.find(
        (x) =>
          !x.custom &&
          !l.custom &&
          x.itemId === l.itemId &&
          x.variantId === l.variantId &&
          x.addons.map((a) => a.id).join() === l.addons.map((a) => a.id).join() &&
          (x.note ?? "") === (l.note ?? ""),
      );
      return same
        ? ls.map((x) => (x === same ? { ...x, qty: Math.round((x.qty + l.qty) * 100) / 100 } : x))
        : [...ls, { ...l, key: crypto.randomUUID() }];
    });

  const tapItem = (item: MenuItem) => {
    if (item.outOfStock) return;
    if (item.variants.length || item.addonGroupIds.length) return setPicker(item);
    add({
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

  const reset = () => {
    setLines([]);
    setName("");
    setMobile("");
    setTableId(undefined);
    setCartOpen(false);
  };

  const save = async (mode: "print" | "settle") => {
    if (type === "dinin" && !tableId) {
      setTablePick(true);
      return void toast.error("Pick a table for a dine-in order");
    }
    if (mobile && !/^\d{10}$/.test(mobile))
      return void toast.error("Enter a 10-digit mobile number or leave it empty");
    setBusy(mode);
    const res = await pos.counterSave({
      type,
      tableId,
      lines,
      customerName: name,
      customerMobile: mobile,
    });
    if (!res.ok || !res.orderId) {
      setBusy(null);
      return void toast.error(res.error ?? "Could not save");
    }
    if (mode === "print") {
      const pb = await pos.printBill(res.orderId);
      setBusy(null);
      setKotResult(res);
      if (!pb.ok) toast.error(pb.error ?? "Bill not printed");
      else if (pb.print?.noPrinter) toast.info("Saved. This device has no bill printer.");
      reset();
      return;
    }
    setBusy(null);
    setCartOpen(false);
    setSettleId(res.orderId);
  };

  const settleOrder = pos.orderById(settleId ?? undefined);

  const cart = (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
        {(["pickup", "dinin"] as OrderType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setType(t);
              if (t === "pickup") setTableId(undefined);
              else setTablePick(true);
            }}
            className={cn(
              "tap rounded-md text-sm font-semibold",
              type === t ? "bg-card text-primary shadow-soft" : "text-muted-foreground",
            )}
          >
            {t === "pickup" ? "Pickup" : "Dine-in"}
          </button>
        ))}
      </div>
      {type === "dinin" ? (
        <button
          type="button"
          onClick={() => setTablePick(true)}
          className="mt-3 flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-sm"
        >
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Table2 className="size-4" /> Table
          </span>
          <span className="font-display font-bold">{table?.name ?? "Pick a table"}</span>
        </button>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Input
          className="tap"
          placeholder="Customer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          className="tap"
          inputMode="numeric"
          placeholder="Mobile"
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
        />
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="size-6" />}
            title="Cart is empty"
            body="Tap items to add them."
          />
        ) : (
          <ul className="divide-y divide-border">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-2 py-2">
                <VegMark type={l.dietary} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    <span translate="no">{l.name}</span>
                    {l.variantName ? ` (${l.variantName})` : ""}
                  </p>
                  <p className="num truncate text-xs text-muted-foreground">
                    {l.addons.length ? `+ ${l.addons.map((a) => a.name).join(", ")} · ` : ""}
                    {money(l.price)}
                  </p>
                </div>
                <QtyStepper
                  size="sm"
                  value={l.qty}
                  onChange={(v) =>
                    setLines((ls) =>
                      v <= 0
                        ? ls.filter((x) => x.key !== l.key)
                        : ls.map((x) => (x.key === l.key ? { ...x, qty: v } : x)),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>{qty(count)} items · subtotal</span>
          <span className="num text-foreground">{money(totals.subtotal)}</span>
        </div>
        {totals.packaging ? (
          <div className="flex justify-between text-muted-foreground">
            <span>Packaging</span>
            <span className="num text-foreground">{money(totals.packaging)}</span>
          </div>
        ) : null}
        <div className="flex justify-between text-muted-foreground">
          <span>Tax</span>
          <span className="num text-foreground">{money(totals.tax)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-display font-bold">Total</span>
          <span className="num text-lg">{money(totals.grand)}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="tap h-12"
          disabled={lines.length === 0 || busy !== null}
          onClick={() => void save("print")}
        >
          {busy === "print" ? <Spinner /> : <Printer className="size-4" />} Save & Print
        </Button>
        <Button
          className="tap h-12"
          disabled={lines.length === 0 || busy !== null || !pos.can("biller", "edit")}
          onClick={() => void save("settle")}
        >
          {busy === "settle" ? <Spinner /> : <CreditCard className="size-4" />} Save & Settle
        </Button>
      </div>
      {lines.length > 0 ? (
        <button
          type="button"
          onClick={() => setLines([])}
          className="mt-2 inline-flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground"
        >
          <Trash2 className="size-3.5" /> Clear cart
        </button>
      ) : null}
    </div>
  );

  return (
    <AppShell
      title="Counter"
      subtitle={`${data.outlet.name} · ${data.menus.find((m) => m.id === menuId)?.name ?? ""}`}
    >
      <div className="md:flex md:gap-4">
        <div className="min-w-0 flex-1 pb-16 md:pb-0">
          <div className="flex">
            <ItemSearch
              value={query}
              onChange={setQuery}
              items={pos.itemsFor(menuId)}
              onPick={tapItem}
            />
          </div>
          <div className="no-scrollbar -mx-3 mt-3 flex gap-2 overflow-x-auto px-3">
            <Chip active={cat === "all"} onClick={() => setCat("all")}>
              All
            </Chip>
            {categories.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                <span translate="no">{c.name}</span>
              </Chip>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {items.length === 0 ? (
              <div className="col-span-full">
                <EmptyState title="No items match" body="Try another name or short code." />
              </div>
            ) : (
              items.map((i) => {
                const inCart = lines
                  .filter((l) => l.itemId === i.id)
                  .reduce((a, l) => a + l.qty, 0);
                return (
                  <button
                    key={i.id}
                    type="button"
                    disabled={i.outOfStock}
                    onClick={() => tapItem(i)}
                    className={cn(
                      "relative flex min-h-24 flex-col justify-between rounded-lg border bg-card p-3 text-left shadow-soft transition active:scale-[0.98]",
                      inCart ? "border-primary" : "border-border",
                      i.outOfStock && "opacity-50",
                    )}
                  >
                    {data.settings.billingPhotos ? (
                      <ItemThumb name={i.name} url={i.imageUrl} className="-mx-3 -mt-3 mb-2 aspect-[16/10] max-w-none self-stretch rounded-t-lg text-2xl" />
                    ) : null}
                    <div className="flex items-start gap-1.5">
                      <VegMark type={i.dietary} className="mt-1" />
                      <span className="text-sm font-semibold leading-tight">
                        <span translate="no">{i.name}</span>
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="num text-sm">{money(i.variants[0]?.price ?? i.price)}</span>
                      {i.outOfStock ? null : (
                        <span className="truncate text-[11px] font-bold text-muted-foreground">
                          {i.shortCode}
                        </span>
                      )}
                    </div>
                    {i.outOfStock ? (
                      <span className="mt-1 self-start rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                        Out of stock
                      </span>
                    ) : null}
                    {inCart ? (
                      <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-6 justify-center rounded-full bg-primary px-1.5 text-xs font-bold leading-6 text-primary-foreground">
                        {qty(inCart)}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card p-3 text-sm font-semibold text-muted-foreground"
            >
              <Plus className="size-5" /> Custom item
            </button>
          </div>
        </div>
        <aside className="sticky top-18 hidden h-[calc(100vh-9rem)] w-96 shrink-0 rounded-lg border border-border bg-card p-4 shadow-soft md:block">
          {cart}
        </aside>
      </div>

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-16 z-20 px-3 md:hidden">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="tap flex w-full items-center justify-between rounded-lg bg-primary px-4 py-3 text-primary-foreground shadow-soft"
          >
            <span className="font-semibold">
              {qty(count)} items · {type === "dinin" ? (table?.name ?? "Dine-in") : "Pickup"}
            </span>
            <span className="num font-display text-lg">{money(totals.grand)}</span>
          </button>
        </div>
      ) : null}

      <ResponsiveSheet open={cartOpen} onOpenChange={setCartOpen} title="Counter cart">
        <div className="py-2">{cart}</div>
      </ResponsiveSheet>

      <ResponsiveSheet
        open={tablePick}
        onOpenChange={setTablePick}
        title="Pick a table"
        description="Only free tables can take a new counter order."
      >
        <div className="grid grid-cols-3 gap-2 py-2 sm:grid-cols-4">
          {data.tables.filter((t) => !t.orderId).length === 0 ? (
            <p className="col-span-full text-sm text-muted-foreground">No free table right now.</p>
          ) : (
            data.tables
              .filter((t) => !t.orderId)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTableId(t.id);
                    setType("dinin");
                    setTablePick(false);
                  }}
                  className={cn(
                    "tap rounded-md border py-2 font-display text-sm font-bold",
                    tableId === t.id ? "border-primary bg-primary-soft" : "border-border",
                  )}
                >
                  <span translate="no">{t.name}</span>
                </button>
              ))
          )}
        </div>
      </ResponsiveSheet>

      <OptionsSheet
        item={picker}
        groups={data.addonGroups}
        onClose={() => setPicker(null)}
        onAdd={(l) => {
          add(l);
          setPicker(null);
        }}
      />
      <CustomItemSheet
        open={customOpen}
        onOpenChange={setCustomOpen}
        kitchens={data.settings.kitchens}
        printers={pos.thisDevice?.printers ?? []}
        onAdd={(l) => {
          add(l);
          setCustomOpen(false);
        }}
      />
      <KotResultSheet
        result={kotResult}
        onClose={() => setKotResult(null)}
        onRetry={pos.retryPending}
        pending={pos.pendingPrints}
      />

      {settleOrder ? (
        <SettleSheet
          order={settleOrder}
          open={Boolean(settleId) && !result}
          onOpenChange={(o) => {
            if (!o && !result) {
              toast("Order saved — settle it later from Orders");
              setSettleId(null);
              reset();
            }
          }}
          onSettled={(r) => setResult(r)}
        />
      ) : null}
      <ResponsiveSheet
        open={Boolean(result)}
        onOpenChange={(o) => {
          if (!o) {
            setResult(null);
            setSettleId(null);
            reset();
          }
        }}
        title="Payment received"
      >
        {result && settleOrder ? (
          <>
            {settleOrder.token ? (
              <p className="text-center text-sm font-semibold text-muted-foreground">
                Token #{settleOrder.token}
              </p>
            ) : null}
            <SettleSuccess
              result={result}
              onPrint={() =>
                void pos
                  .printBill(settleOrder.id)
                  .then((r) =>
                    toast[r.ok ? "success" : "error"](
                      r.ok ? "Bill printed" : (r.error ?? "Not printed"),
                    ),
                  )
              }
              onShare={() => setShareOpen(true)}
              onNew={() => {
                setResult(null);
                setSettleId(null);
                reset();
              }}
            />
          </>
        ) : null}
      </ResponsiveSheet>
      {settleOrder ? (
        <ShareSheet
          open={shareOpen}
          onOpenChange={setShareOpen}
          onPdf={() => void shareBillPdf(pos.thisDevice, settleOrder)}
          onWhatsApp={() =>
            shareWhatsApp(billShareText(settleOrder, data.outlet.name), settleOrder.customerMobile)
          }
        />
      ) : null}
    </AppShell>
  );
}
