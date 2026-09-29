import { ChefHat, Printer, PrinterCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, NumberField, QtyStepper, VegMark } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { engineLineTotal } from "@/lib/pos/billEngine";
import { money, qty as fmtQty } from "@/lib/pos/format";
import { customItemTargets } from "@/lib/pos/routing";
import type { SendResult } from "@/lib/pos/store";
import {
  DIETARY_LABEL,
  type AddonGroup,
  type DevicePrinter,
  type Dietary,
  type DraftLine,
  type Kitchen,
  type LineAddon,
  type MenuItem,
  type PendingPrint,
} from "@/lib/pos/types";
import { cn } from "@/lib/utils";

// Sheets shared by the order screen and counter billing.

/** Variant + addon groups (min/max) + note + qty. */
export function OptionsSheet({
  item,
  groups,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  groups: AddonGroup[];
  onClose: () => void;
  onAdd: (l: Omit<DraftLine, "key">) => void;
}) {
  const itemGroups = item
    ? groups.filter((g) => g.active && item.addonGroupIds.includes(g.id))
    : [];
  const [variantId, setVariantId] = useState<string | undefined>();
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);
  useEffect(() => {
    if (!item) return;
    setVariantId(item.variants[0]?.variantId);
    setPicked(Object.fromEntries(itemGroups.map((g) => [g.id, []])));
    setNote("");
    setQty(1);
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;
  const variant = item.variants.find((v) => v.variantId === variantId);
  const addons: LineAddon[] = itemGroups.flatMap((g) =>
    (picked[g.id] ?? []).map((id) => {
      const o = g.options.find((x) => x.id === id)!;
      return { id: o.id, groupId: g.id, name: o.name, price: o.price, qty: 1 };
    }),
  );
  const problem = itemGroups
    .map((g) => {
      const n = (picked[g.id] ?? []).length;
      return n < g.min
        ? `${g.name}: choose ${g.min === g.max ? g.min : `at least ${g.min}`}`
        : n > g.max
          ? `${g.name}: at most ${g.max}`
          : null;
    })
    .find(Boolean);
  const price = variant?.price ?? item.price;
  const total = engineLineTotal({ price, qty, addons });

  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={item.name}
      footer={
        <Button
          className="tap w-full"
          disabled={Boolean(problem) || !(qty > 0)}
          onClick={() =>
            onAdd({
              itemId: item.id,
              name: item.name,
              categoryId: item.categoryId,
              dietary: item.dietary,
              variantId: variant?.variantId,
              variantName: variant?.name,
              addons,
              note: note.trim() || undefined,
              price,
              qty,
              custom: false,
            })
          }
        >
          {problem ?? `Add to round · ${money(total)}`}
        </Button>
      }
    >
      <div className="space-y-4 py-2">
        {item.variants.length ? (
          <div>
            <p className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Variant
            </p>
            <div className="space-y-2">
              {item.variants.map((v) => (
                <button
                  key={v.variantId}
                  type="button"
                  onClick={() => setVariantId(v.variantId)}
                  className={cn(
                    "tap flex w-full items-center justify-between rounded-md border px-3 text-sm font-semibold",
                    variantId === v.variantId
                      ? "border-primary bg-primary-soft text-primary-soft-foreground"
                      : "border-border",
                  )}
                >
                  <span translate="no">{v.name}</span>
                  <span className="num">{money(v.price)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {itemGroups.map((g) => (
          <div key={g.id}>
            <p className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <span translate="no">{g.name}</span>{" "}
              <span className="font-normal normal-case">
                (
                {g.min === g.max
                  ? `pick ${g.max}`
                  : g.min
                    ? `pick ${g.min}–${g.max}`
                    : `optional, up to ${g.max}`}
                )
              </span>
            </p>
            <div className="space-y-2">
              {g.options.map((o) => {
                const on = (picked[g.id] ?? []).includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() =>
                      setPicked((p) => {
                        const cur = p[g.id] ?? [];
                        if (g.max === 1) return { ...p, [g.id]: on ? [] : [o.id] };
                        if (on) return { ...p, [g.id]: cur.filter((x) => x !== o.id) };
                        return cur.length >= g.max ? p : { ...p, [g.id]: [...cur, o.id] };
                      })
                    }
                    className={cn(
                      "tap flex w-full items-center justify-between rounded-md border px-3 text-sm font-semibold",
                      on
                        ? "border-primary bg-primary-soft text-primary-soft-foreground"
                        : "border-border",
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      <VegMark type={o.dietary} /> <span translate="no">{o.name}</span>
                    </span>
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
          <QtyStepper value={qty} onChange={setQty} min={0} />
        </div>
      </div>
    </ResponsiveSheet>
  );
}

export function CustomItemSheet({
  open,
  onOpenChange,
  kitchens,
  printers,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kitchens: Kitchen[];
  printers: DevicePrinter[];
  onAdd: (l: Omit<DraftLine, "key">) => void;
}) {
  const t = customItemTargets(kitchens, printers);
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  const [qty, setQty] = useState(1);
  const [dietary, setDietary] = useState<Dietary>("veg");
  const [kitchenId, setKitchenId] = useState<string | undefined>();
  const [printerId, setPrinterId] = useState<string | undefined>();
  useEffect(() => {
    if (open) {
      setName("");
      setPrice(0);
      setQty(1);
      setKitchenId(t.kitchens[0]?.id);
      setPrinterId(t.printers[0]?.id);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Custom item"
      description="Tax is the outlet's default tax."
      footer={
        <Button
          className="tap w-full"
          onClick={() => {
            if (!name.trim()) return void toast.error("Enter a name");
            if (!(price > 0)) return void toast.error("Enter a price");
            if (!(qty > 0)) return void toast.error("Enter a quantity");
            onAdd({
              name: name.trim(),
              dietary,
              addons: [],
              price,
              qty,
              custom: true,
              routeKitchenId: t.askKitchen ? kitchenId : undefined,
              routePrinterId: t.askPrinter ? printerId : undefined,
            });
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
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="c-price">Price ₹</Label>
            <NumberField id="c-price" value={price} onChange={setPrice} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="c-qty">Quantity</Label>
            <NumberField id="c-qty" value={qty} onChange={setQty} className="mt-1.5" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["veg", "nonveg", "egg"] as Dietary[]).map((d) => (
            <Chip key={d} active={dietary === d} onClick={() => setDietary(d)}>
              <VegMark type={d} /> {DIETARY_LABEL[d]}
            </Chip>
          ))}
        </div>
        {t.askKitchen ? (
          <div>
            <Label>Kitchen</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {t.kitchens.map((k) => (
                <Chip key={k.id} active={kitchenId === k.id} onClick={() => setKitchenId(k.id)}>
                  <ChefHat className="size-3.5" /> <span translate="no">{k.name}</span>
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
        {t.askPrinter ? (
          <div>
            <Label>KOT printer</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {t.printers.map((p) => (
                <Chip key={p.id} active={printerId === p.id} onClick={() => setPrinterId(p.id)}>
                  <Printer className="size-3.5" /> <span translate="no">{p.name}</span>
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </ResponsiveSheet>
  );
}

export function KotResultSheet({
  result,
  onClose,
  onRetry,
  pending,
}: {
  result: SendResult | null;
  onClose: () => void;
  onRetry: (id: string) => Promise<boolean>;
  pending: PendingPrint[];
}) {
  const kot = result?.kot;
  const print = result?.print;
  const failed = kot
    ? pending.filter((p) => p.kotNo === kot.kot.kotNo && p.orderId === kot.orderId)
    : [];
  return (
    <ResponsiveSheet
      open={Boolean(result)}
      onOpenChange={(o) => !o && onClose()}
      title={kot ? `KOT #${kot.kot.kotNo} sent` : ""}
      description={kot ? `Bill ${kot.billNo}` : undefined}
    >
      {kot ? (
        <div className="space-y-3 py-2">
          {kot.token ? (
            <div className="rounded-lg bg-primary-soft p-4 text-center text-primary-soft-foreground">
              <p className="text-sm font-semibold">Token number</p>
              <p className="num font-display text-5xl font-extrabold">#{kot.token}</p>
              <p className="text-xs">Tell the customer this number</p>
            </div>
          ) : null}
          <div className="flex items-start gap-3 rounded-md border border-border p-3">
            <ChefHat className="mt-0.5 size-5 text-muted-foreground" />
            <p className="text-sm">
              {kot.kitchens.length
                ? `On the kitchen screen: ${kot.kitchens.join(", ")}`
                : "No kitchen screen is set up for these items."}
            </p>
          </div>
          {print?.noPrinter ? (
            <div className="flex items-start gap-3 rounded-md border border-border p-3">
              <Printer className="mt-0.5 size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                This device has no KOT printer for these items — the kitchen screen has them.
              </p>
            </div>
          ) : (
            print?.outcomes.map((o) =>
              o.ok ? (
                <div
                  key={o.printer.id}
                  className="flex items-start gap-3 rounded-md bg-status-ready-soft p-3"
                >
                  <PrinterCheck className="mt-0.5 size-5 text-status-ready" />
                  <p className="text-sm text-status-ready">Printed on {o.printer.name}</p>
                </div>
              ) : (
                <div key={o.printer.id} className="space-y-2 rounded-md bg-primary-soft p-3">
                  <p className="text-sm text-primary-soft-foreground">
                    <TriangleAlert className="mr-1 inline size-4" />
                    Saved but NOT printed on {o.printer.name}. {o.error}
                  </p>
                  {failed.find((f) => f.printerId === o.printer.id) ? (
                    <Button
                      size="sm"
                      className="tap"
                      onClick={async () => {
                        const f = failed.find((x) => x.printerId === o.printer.id)!;
                        const ok = await onRetry(f.id);
                        toast[ok ? "success" : "error"](
                          ok ? "Printed" : "Still not reachable — it stays in the Not printed list",
                        );
                      }}
                    >
                      <Printer className="size-4" /> Retry
                    </Button>
                  ) : (
                    <p className="text-xs font-semibold text-status-ready">Printed on retry</p>
                  )}
                </div>
              ),
            )
          )}
          <div className="rounded-md border border-border p-3">
            <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Round {kot.kot.round}
            </p>
            <div className="mt-2 space-y-1">
              {kot.kot.lines.map((l) => (
                <p key={l.id} className="flex items-center gap-2 text-sm">
                  <VegMark type={l.dietary} />
                  <span className="num">{fmtQty(l.qty)}×</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span translate="no">{l.name}</span>
                    {l.variantName ? ` (${l.variantName})` : ""}
                  </span>
                </p>
              ))}
            </div>
          </div>
          <Button className="tap w-full" onClick={onClose}>
            Continue
          </Button>
        </div>
      ) : null}
    </ResponsiveSheet>
  );
}
