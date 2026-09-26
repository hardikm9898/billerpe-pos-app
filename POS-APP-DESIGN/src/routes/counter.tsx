import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Printer, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { ShareSheet } from "@/components/pos/billing/BillSheets";
import { SettleSheet, SettleSuccess, type SettleResult } from "@/components/pos/billing/SettleSheet";
import { shareWhatsApp } from "@/components/pos/billing/share";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, QtyStepper, Spinner, VegMark } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money, qty, round2, taxBreakup } from "@/lib/pos/format";
import { usePos, type CounterLineInput } from "@/lib/pos/store";
import type { MenuItem, OrderType } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/counter")({
  head: () => ({
    meta: [
      { title: "Counter billing — BillerPe POS" },
      { name: "description", content: "Quick QSR counter billing with tokens, dine-in, takeaway and delivery." },
      { property: "og:title", content: "Counter billing — BillerPe POS" },
      { property: "og:description", content: "Quick QSR counter billing with tokens, dine-in, takeaway and delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CounterPage,
});

interface Line extends CounterLineInput {
  key: string;
}

const types: { id: OrderType; label: string }[] = [
  { id: "dine-in", label: "Dine-in" },
  { id: "takeaway", label: "Takeaway" },
  { id: "delivery", label: "Delivery" },
];

function CounterPage() {
  const pos = usePos();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [type, setType] = useState<OrderType>("takeaway");
  const [lines, setLines] = useState<Line[]>([]);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [picker, setPicker] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState<"print" | "settle" | null>(null);
  const [settleId, setSettleId] = useState<string | null>(null);
  const [result, setResult] = useState<SettleResult | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pos.itemsForMenu("menu-main").filter(
      (i) => (cat === "all" || i.categoryId === cat) && (!q || i.name.toLowerCase().includes(q) || i.shortCode.toLowerCase() === q),
    );
  }, [pos, query, cat]);

  const subtotal = round2(lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0));
  const est = useMemo(() => {
    const extra = type === "dine-in" || subtotal === 0 ? 0 : pos.billingSettings.packagingCharge + (type === "delivery" ? pos.billingSettings.deliveryCharge : 0);
    const taxable = subtotal + extra;
    return Math.round(taxable + taxBreakup(taxable).total);
  }, [subtotal, type, pos.billingSettings]);
  const count = lines.reduce((a, l) => a + l.quantity, 0);

  const add = (item: MenuItem, variantName?: string, price?: number, addonNames: string[] = [], addonPrice = 0) => {
    const key = [item.id, variantName ?? "", addonNames.join("|")].join("~");
    setLines((ls) => {
      const found = ls.find((l) => l.key === key);
      if (found) return ls.map((l) => (l.key === key ? { ...l, quantity: round2(l.quantity + 1) } : l));
      return [
        ...ls,
        { key, itemId: item.id, name: item.name, variantName, addonNames, unitPrice: (price ?? item.price) + addonPrice, quantity: 1, kitchen: item.kitchen, vegType: item.vegType },
      ];
    });
  };

  const tapItem = (item: MenuItem) => {
    if (item.outOfStock) return;
    if (item.variants?.length || item.addonGroups?.length) setPicker(item);
    else add(item);
  };

  const reset = () => {
    setLines([]);
    setName("");
    setMobile("");
    setCartOpen(false);
  };

  const save = async (mode: "print" | "settle") => {
    setBusy(mode);
    const res = await pos.createCounterOrder({ type, lines, customerName: name, customerMobile: mobile });
    if (!res.ok || !res.orderId) {
      setBusy(null);
      toast.error(res.error ?? "Could not save");
      return;
    }
    if (mode === "print") {
      await pos.printBill(res.orderId);
      setBusy(null);
      toast.success(`Token ${res.tokenNo} saved · KOT and bill printed`);
      reset();
      return;
    }
    setBusy(null);
    setCartOpen(false);
    setSettleId(res.orderId);
  };

  const settleOrder = settleId ? pos.orderById(settleId) : undefined;

  const cart = (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
        {types.map((t) => (
          <button key={t.id} type="button" onClick={() => setType(t.id)} className={cn("tap rounded-md text-sm font-semibold", type === t.id ? "bg-card text-primary shadow-soft" : "text-muted-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2">
        <span className="text-sm text-muted-foreground">Token</span>
        <span className="num font-display text-2xl font-extrabold text-primary">#{pos.nextTokenNo}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Input className="tap" placeholder={type === "delivery" ? "Customer name *" : "Customer name"} value={name} onChange={(e) => setName(e.target.value)} />
        <Input className="tap" inputMode="numeric" placeholder={type === "delivery" ? "Mobile *" : "Mobile"} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} />
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <EmptyState icon={<ShoppingCart className="size-6" />} title="Cart is empty" body="Tap items to add them." />
        ) : (
          <ul className="divide-y divide-border">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-2 py-2">
                <VegMark type={l.vegType} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{l.name}</p>
                  <p className="num text-xs text-muted-foreground">
                    {[l.variantName, ...l.addonNames].filter(Boolean).join(", ")} {money(l.unitPrice)}
                  </p>
                </div>
                <QtyStepper size="sm" value={l.quantity} onChange={(v) => setLines((ls) => (v <= 0 ? ls.filter((x) => x.key !== l.key) : ls.map((x) => (x.key === l.key ? { ...x, quantity: v } : x))))} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
        <div className="flex justify-between text-muted-foreground"><span>{qty(count)} items · subtotal</span><span className="num text-foreground">{money(subtotal)}</span></div>
        <div className="flex items-center justify-between"><span className="font-display font-bold">Approx. total incl. GST</span><span className="num text-lg">{money(est)}</span></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" className="tap h-12" disabled={lines.length === 0 || busy !== null} onClick={() => void save("print")}>
          {busy === "print" ? <Spinner /> : <Printer className="size-4" />} Save & Print
        </Button>
        <Button className="tap h-12" disabled={lines.length === 0 || busy !== null} onClick={() => void save("settle")}>
          {busy === "settle" ? <Spinner /> : <CreditCard className="size-4" />} Save & Settle
        </Button>
      </div>
      {lines.length > 0 ? (
        <button type="button" onClick={() => setLines([])} className="mt-2 inline-flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground">
          <Trash2 className="size-3.5" /> Clear cart
        </button>
      ) : null}
    </div>
  );

  return (
    <AppShell title="Counter" subtitle={`${pos.outlet.name} · Token #${pos.nextTokenNo}`}>
      <div className="md:flex md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="tap pl-9" placeholder="Search item or short code" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="no-scrollbar -mx-3 mt-3 flex gap-2 overflow-x-auto px-3">
            <Chip active={cat === "all"} onClick={() => setCat("all")}>All</Chip>
            {pos.categories.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</Chip>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {items.length === 0 ? (
              <div className="col-span-full"><EmptyState title="No items match" body="Try another name or short code." /></div>
            ) : (
              items.map((i) => {
                const inCart = lines.filter((l) => l.itemId === i.id).reduce((a, l) => a + l.quantity, 0);
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
                    <div className="flex items-start gap-1.5">
                      <VegMark type={i.vegType} className="mt-1" />
                      <span className="text-sm font-semibold leading-tight">{i.name}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="num text-sm">{money(i.price)}</span>
                      <span className="text-[11px] font-bold text-muted-foreground">{i.outOfStock ? "Out of stock" : i.shortCode}</span>
                    </div>
                    {inCart ? (
                      <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-6 justify-center rounded-full bg-primary px-1.5 text-xs font-bold leading-6 text-primary-foreground">{qty(inCart)}</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
        <aside className="sticky top-18 hidden h-[calc(100vh-9rem)] w-96 shrink-0 rounded-lg border border-border bg-card p-4 shadow-soft md:block">{cart}</aside>
      </div>

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-16 z-20 px-3 md:hidden">
          <button type="button" onClick={() => setCartOpen(true)} className="tap flex w-full items-center justify-between rounded-lg bg-primary px-4 py-3 text-primary-foreground shadow-sheet">
            <span className="font-semibold">{qty(count)} items · Token #{pos.nextTokenNo}</span>
            <span className="num font-display text-lg">{money(est)}</span>
          </button>
        </div>
      ) : null}

      <ResponsiveSheet open={cartOpen} onOpenChange={setCartOpen} title="Counter cart">
        <div className="py-2">{cart}</div>
      </ResponsiveSheet>

      <ItemPicker item={picker} onClose={() => setPicker(null)} onAdd={(v, p, a, ap) => { if (picker) add(picker, v, p, a, ap); setPicker(null); }} />

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

      <ResponsiveSheet open={Boolean(result)} onOpenChange={(o) => { if (!o) { setResult(null); setSettleId(null); reset(); } }} title="Payment received">
        {result ? (
          <SettleSuccess
            result={result}
            onPrint={() => { if (settleId) void pos.reprintBill(settleId).then(() => toast.success("Bill printed")); }}
            onShare={() => setShareOpen(true)}
            onNew={() => { setResult(null); setSettleId(null); reset(); }}
          />
        ) : null}
      </ResponsiveSheet>
      <ShareSheet open={shareOpen} onOpenChange={setShareOpen} onPdf={() => toast.success("PDF ready to share")} onWhatsApp={() => shareWhatsApp(`${pos.outlet.restaurant} — Bill ${result?.code ?? ""}\nTotal ${money(result?.total ?? 0)}`, mobile)} />
    </AppShell>
  );
}

function ItemPicker({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (variantName: string | undefined, price: number | undefined, addons: string[], addonPrice: number) => void;
}) {
  const [variant, setVariant] = useState<string | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const v = item?.variants?.find((x) => x.id === (variant ?? item.variants?.[0]?.id));
  const allOptions = item?.addonGroups?.flatMap((g) => g.options) ?? [];
  const addonPrice = allOptions.filter((o) => addons.includes(o.id)).reduce((a, o) => a + o.price, 0);
  const valid = (item?.addonGroups ?? []).every((g) => {
    const n = g.options.filter((o) => addons.includes(o.id)).length;
    return n >= g.min && n <= g.max;
  });

  return (
    <ResponsiveSheet
      open={Boolean(item)}
      onOpenChange={(o) => { if (!o) { onClose(); setVariant(null); setAddons([]); } }}
      title={item?.name ?? ""}
      footer={
        <Button
          className="tap w-full"
          disabled={!valid}
          onClick={() => {
            onAdd(v?.name, v?.price, allOptions.filter((o) => addons.includes(o.id)).map((o) => o.name), addonPrice);
            setVariant(null);
            setAddons([]);
          }}
        >
          Add · {money((v?.price ?? item?.price ?? 0) + addonPrice)}
        </Button>
      }
    >
      <div className="space-y-4 py-2">
        {item?.variants?.length ? (
          <div className="flex flex-wrap gap-2">
            {item.variants.map((x) => (
              <Chip key={x.id} active={v?.id === x.id} onClick={() => setVariant(x.id)}>{x.name} · {money(x.price)}</Chip>
            ))}
          </div>
        ) : null}
        {item?.addonGroups?.map((g) => (
          <div key={g.id}>
            <p className="text-sm font-bold">{g.name} <span className="font-normal text-muted-foreground">{g.min > 0 ? `pick ${g.min}` : "optional"}{g.max > 1 ? `, up to ${g.max}` : ""}</span></p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {g.options.map((o) => {
                const on = addons.includes(o.id);
                return (
                  <Chip
                    key={o.id}
                    active={on}
                    onClick={() =>
                      setAddons((as) => {
                        if (on) return as.filter((x) => x !== o.id);
                        const inGroup = g.options.filter((x) => as.includes(x.id)).map((x) => x.id);
                        if (g.max === 1) return [...as.filter((x) => !inGroup.includes(x)), o.id];
                        return inGroup.length >= g.max ? as : [...as, o.id];
                      })
                    }
                  >
                    {o.name}{o.price ? ` +${money(o.price)}` : ""}
                  </Chip>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ResponsiveSheet>
  );
}
