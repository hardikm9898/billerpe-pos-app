import {
  Beaker,
  ClipboardList,
  NotebookPen,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Trash,
  Trash2,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, Field, FormError, ListRow, Segmented } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { dateTime, money, qty } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type {
  PermissionModule,
  PurchaseLine,
  PurchaseOrder,
  RawMaterial,
  Recipe,
  RecipeLine,
  SemiFinished,
  Supplier,
} from "@/lib/pos/types";
import { cn } from "@/lib/utils";

// Stock & inventory (first release, owner decision 25 Sep 2026). Rules:
// sales never block on short stock (it goes negative, shown in red);
// deduction at settle (pickup at creation); supplier payments can be
// recorded as expenses; cash payments can come out of the drawer.

export const STOCK_SECTIONS: {
  id: string;
  title: string;
  body: string;
  icon: LucideIcon;
  module: PermissionModule;
}[] = [
  {
    id: "items",
    title: "Stock items",
    body: "Raw materials, units, reorder levels",
    icon: Package,
    module: "stock-masters",
  },
  {
    id: "suppliers",
    title: "Suppliers",
    body: "Who you buy from, what you owe",
    icon: Truck,
    module: "stock-masters",
  },
  {
    id: "purchases",
    title: "Purchases",
    body: "Goods received and supplier payments",
    icon: ShoppingBag,
    module: "stock-transactions",
  },
  {
    id: "entries",
    title: "Stock in / out / count",
    body: "Manual entries and movements",
    icon: ClipboardList,
    module: "stock-transactions",
  },
  {
    id: "wastage",
    title: "Wastage",
    body: "Spoiled, expired, spilled",
    icon: Trash,
    module: "stock-transactions",
  },
  {
    id: "recipes",
    title: "Recipes",
    body: "What each dish uses",
    icon: NotebookPen,
    module: "stock-recipes",
  },
  {
    id: "semi",
    title: "Semi-finished",
    body: "Batches: gravies, doughs",
    icon: Beaker,
    module: "stock-recipes",
  },
];

const usePosData = () => usePos().data!;
const unitShort = (data: ReturnType<typeof usePosData>, id: string) =>
  data.stock.units.find((u) => u.id === id)?.short ?? "";

export function StockStatus({ m }: { m: Pick<RawMaterial, "stock" | "reorderLevel"> }) {
  if (m.stock < 0)
    return (
      <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">
        Negative
      </span>
    );
  if (m.stock <= m.reorderLevel)
    return (
      <span className="rounded-md bg-status-hold-soft px-2 py-0.5 text-[11px] font-bold text-status-hold">
        Low
      </span>
    );
  return (
    <span className="rounded-md bg-status-ready-soft px-2 py-0.5 text-[11px] font-bold text-status-ready">
      OK
    </span>
  );
}

function ItemPicker({
  value,
  onChange,
  allowSemi,
}: {
  value: { kind: "raw" | "semi"; id: string } | null;
  onChange: (v: { kind: "raw" | "semi"; id: string }) => void;
  allowSemi?: boolean | undefined;
}) {
  const data = usePosData();
  const opts = [
    ...data.stock.raw
      .filter((r) => r.active)
      .map((r) => ({ key: `raw:${r.id}`, label: `${r.name} (${unitShort(data, r.unitId)})` })),
    ...(allowSemi
      ? data.stock.semi.map((s) => ({
          key: `semi:${s.id}`,
          label: `${s.name} (semi, ${unitShort(data, s.unitId)})`,
        }))
      : []),
  ];
  return (
    <Select
      value={value ? `${value.kind}:${value.id}` : ""}
      onValueChange={(v) => {
        const [kind, id] = v.split(":");
        onChange({ kind: kind as "raw" | "semi", id: id! });
      }}
    >
      <SelectTrigger className="tap">
        <SelectValue placeholder="Pick an item" />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ------------------------------ items (raw materials) ------------------------------ */

export function StockItems() {
  const pos = usePos();
  const data = usePosData();
  const canEdit = pos.can("stock-masters", "edit");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<RawMaterial | "new" | null>(null);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const list = data.stock.raw
    .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.stock - a.reorderLevel - (b.stock - b.reorderLevel));
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="tap pl-9"
            placeholder="Search items"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {pos.can("stock-masters", "create") ? (
          <Button className="tap" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Item
          </Button>
        ) : null}
      </div>
      <Button variant="outline" size="sm" className="tap" onClick={() => setUnitsOpen(true)}>
        Units ({data.stock.units.length})
      </Button>
      {list.length === 0 ? (
        <EmptyState title="No stock items" body="Add raw materials like paneer, rice, oil." />
      ) : (
        list.map((m) => (
          <ListRow
            key={m.id}
            muted={!m.active}
            title={m.name}
            subtitle={`${m.category} · ${qty(m.stock)} ${unitShort(data, m.unitId)} · reorder at ${qty(m.reorderLevel)} · ${money(m.rate)}/${unitShort(data, m.unitId)}`}
            onClick={canEdit ? () => setEditing(m) : undefined}
            right={<StockStatus m={m} />}
          />
        ))
      )}
      {editing ? (
        <RawSheet initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      <UnitsSheet open={unitsOpen} onClose={() => setUnitsOpen(false)} />
    </div>
  );
}

function RawSheet({ initial, onClose }: { initial: RawMaterial | null; onClose: () => void }) {
  const pos = usePos();
  const data = usePosData();
  const [f, setF] = useState({
    name: initial?.name ?? "",
    category: initial?.category ?? "",
    unitId: initial?.unitId ?? data.stock.units[0]?.id ?? "",
    purchaseUnitId: initial?.purchaseUnitId ?? data.stock.units[0]?.id ?? "",
    conversion: initial?.conversion ?? 1,
    reorderLevel: initial?.reorderLevel ?? 0,
    active: initial?.active ?? true,
    openingStock: 0,
    openingRate: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unitSelect = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="tap">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {data.stock.units.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            <span translate="no">{u.name}</span> ({u.short})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit ${initial.name}` : "New stock item"}
      footer={
        <Button
          className="tap w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await pos.act((b) =>
              b.saveRaw({
                ...f,
                id: initial?.id,
                openingStock: initial ? undefined : f.openingStock * f.conversion,
                openingRate: initial ? undefined : f.conversion ? f.openingRate / f.conversion : 0,
              }),
            );
            setBusy(false);
            if (!r.ok) return setError(r.error);
            onClose();
          }}
        >
          {busy ? <Spinner /> : null} Save
        </Button>
      }
    >
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name *">
            <Input
              className="tap"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>
          <Field label="Group">
            <Input
              className="tap"
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value })}
              placeholder="Dairy"
            />
          </Field>
          <Field label="Used in (usage unit)">
            {unitSelect(f.unitId, (v) => setF({ ...f, unitId: v }))}
          </Field>
          <Field label="Bought in (purchase unit)">
            {unitSelect(f.purchaseUnitId, (v) => setF({ ...f, purchaseUnitId: v }))}
          </Field>
        </div>
        <Field
          label={`1 ${unitShort(data, f.purchaseUnitId)} = how many ${unitShort(data, f.unitId)}?`}
        >
          <NumberField value={f.conversion} onChange={(v) => setF({ ...f, conversion: v })} />
        </Field>
        <Field label={`Reorder when below (${unitShort(data, f.unitId)})`}>
          <NumberField value={f.reorderLevel} onChange={(v) => setF({ ...f, reorderLevel: v })} />
        </Field>
        {!initial ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label={`Opening stock (${unitShort(data, f.purchaseUnitId)})`}>
              <NumberField
                value={f.openingStock}
                onChange={(v) => setF({ ...f, openingStock: v })}
              />
            </Field>
            <Field label={`Rate per ${unitShort(data, f.purchaseUnitId)} ₹`}>
              <NumberField value={f.openingRate} onChange={(v) => setF({ ...f, openingRate: v })} />
            </Field>
          </div>
        ) : null}
        <label className="flex items-center justify-between text-sm font-semibold">
          Active <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />
        </label>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

function UnitsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pos = usePos();
  const data = usePosData();
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  return (
    <ResponsiveSheet open={open} onOpenChange={(o) => !o && onClose()} title="Units">
      <div className="space-y-2 py-2">
        {data.stock.units.map((u) => (
          <p key={u.id} className="rounded-md border border-border px-3 py-2 text-sm">
            <span translate="no">{u.name}</span>{" "}
            <span className="text-muted-foreground">({u.short})</span>
          </p>
        ))}
        {pos.can("stock-masters", "create") ? (
          <div className="flex gap-2">
            <Input
              className="tap flex-1"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              className="tap w-20"
              placeholder="Short"
              value={short}
              onChange={(e) => setShort(e.target.value)}
            />
            <Button
              className="tap"
              onClick={async () => {
                const r = await pos.act((b) => b.saveUnit({ name, short }));
                if (!r.ok) return void toast.error(r.error);
                setName("");
                setShort("");
              }}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </ResponsiveSheet>
  );
}

/* ------------------------------ suppliers ------------------------------ */

export function Suppliers() {
  const pos = usePos();
  const data = usePosData();
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  return (
    <div className="space-y-2">
      {pos.can("stock-masters", "create") ? (
        <Button className="tap" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Supplier
        </Button>
      ) : null}
      {data.stock.suppliers.length === 0 ? (
        <EmptyState title="No suppliers" />
      ) : (
        data.stock.suppliers.map((s) => (
          <ListRow
            key={s.id}
            title={s.name}
            subtitle={`${s.contact}${s.phone ? ` · ${s.phone}` : ""}${s.gstin ? ` · ${s.gstin}` : ""}`}
            onClick={pos.can("stock-masters", "edit") ? () => setEditing(s) : undefined}
            right={
              s.outstanding > 0 ? (
                <span className="num text-sm text-status-hold">{money(s.outstanding)} to pay</span>
              ) : (
                <span className="text-xs text-muted-foreground">Paid up</span>
              )
            }
          />
        ))
      )}
      {editing ? (
        <SupplierSheet
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function SupplierSheet({ initial, onClose }: { initial: Supplier | null; onClose: () => void }) {
  const pos = usePos();
  const [f, setF] = useState({
    name: initial?.name ?? "",
    contact: initial?.contact ?? "",
    phone: initial?.phone ?? "",
    gstin: initial?.gstin ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit ${initial.name}` : "New supplier"}
      footer={
        <Button
          className="tap w-full"
          onClick={async () => {
            const r = await pos.act((b) => b.saveSupplier({ ...f, id: initial?.id }));
            if (r.ok) onClose();
            else setError(r.error);
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Name *">
          <Input
            className="tap"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Contact person">
            <Input
              className="tap"
              value={f.contact}
              onChange={(e) => setF({ ...f, contact: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              className="tap"
              inputMode="numeric"
              maxLength={10}
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
        </div>
        <Field label="GSTIN">
          <Input
            className="tap uppercase"
            maxLength={15}
            value={f.gstin}
            onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })}
          />
        </Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

/* ------------------------------ purchases ------------------------------ */

export function Purchases() {
  const pos = usePos();
  const data = usePosData();
  const [editing, setEditing] = useState<PurchaseOrder | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const list = [...data.stock.purchases].sort((a, b) => b.date.localeCompare(a.date));
  const supplierName = (id: string) => data.stock.suppliers.find((s) => s.id === id)?.name ?? "";
  const po = list.find((p) => p.id === viewing);
  return (
    <div className="space-y-2">
      {pos.can("stock-transactions", "create") ? (
        <Button
          className="tap"
          disabled={!data.stock.suppliers.length}
          onClick={() => setEditing("new")}
        >
          <Plus className="size-4" /> Purchase (goods received)
        </Button>
      ) : null}
      {!data.stock.suppliers.length ? (
        <p className="text-xs text-muted-foreground">Add a supplier first.</p>
      ) : null}
      {list.length === 0 ? (
        <EmptyState title="No purchases yet" body="Stock goes up as soon as a purchase is saved." />
      ) : (
        list.map((p) => {
          const paid = p.payments.reduce((a, x) => a + x.amount, 0);
          const status = paid <= 0 ? "Unpaid" : paid >= p.total ? "Paid" : "Part paid";
          return (
            <ListRow
              key={p.id}
              title={`${p.poNo} · ${supplierName(p.supplierId)}`}
              subtitle={`${p.date}${p.invoiceNo ? ` · inv ${p.invoiceNo}` : ""} · ${p.lines.length} item(s) · ${money(p.total)}`}
              onClick={() => setViewing(p.id)}
              right={
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-bold",
                    status === "Paid"
                      ? "bg-status-ready-soft text-status-ready"
                      : status === "Unpaid"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-status-hold-soft text-status-hold",
                  )}
                >
                  {status}
                </span>
              }
            />
          );
        })
      )}
      {editing ? (
        <PurchaseSheet
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {po ? (
        <PurchaseDetail
          po={po}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setViewing(null);
            setEditing(po);
          }}
        />
      ) : null}
    </div>
  );
}

function payModes(data: ReturnType<typeof usePosData>) {
  return [
    ...data.settings.paymentModes
      .filter((m) => m.active && m.id !== "due")
      .map((m) => ({ id: m.id, name: m.name })),
    { id: "cheque", name: "Cheque" },
    { id: "bank", name: "Bank transfer" },
  ];
}

function PurchaseSheet({
  initial,
  onClose,
}: {
  initial: PurchaseOrder | null;
  onClose: () => void;
}) {
  const pos = usePos();
  const data = usePosData();
  const [supplierId, setSupplierId] = useState(
    initial?.supplierId ?? data.stock.suppliers[0]?.id ?? "",
  );
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [invoiceNo, setInvoiceNo] = useState(initial?.invoiceNo ?? "");
  const [lines, setLines] = useState<PurchaseLine[]>(
    initial?.lines ?? [{ rawId: data.stock.raw[0]?.id ?? "", qty: 1, rate: 0, taxPct: 0 }],
  );
  const [discType, setDiscType] = useState<"flat" | "percent">(initial?.discountType ?? "flat");
  const [discValue, setDiscValue] = useState(initial?.discountValue ?? 0);
  const [pay, setPay] = useState({ amount: 0, modeId: "cash", ref: "", fromDrawer: true });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const gross = lines.reduce((a, l) => a + l.qty * l.rate * (1 + l.taxPct / 100), 0);
  const total = Math.max(
    0,
    gross - (discType === "percent" ? (gross * discValue) / 100 : discValue),
  );
  const setLine = (i: number, p: Partial<PurchaseLine>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit ${initial.poNo}` : "Goods received"}
      description="Saving adds the stock straight away (weighted average cost)."
      footer={
        <Button
          className="tap w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await pos.act((b) =>
              b.savePurchase({
                id: initial?.id,
                supplierId,
                date,
                invoiceNo: invoiceNo || undefined,
                lines,
                discountType: discValue ? discType : undefined,
                discountValue: discValue || undefined,
                firstPayment:
                  !initial && pay.amount > 0
                    ? {
                        amount: pay.amount,
                        modeId: pay.modeId,
                        ref: pay.ref || undefined,
                        fromDrawer: pay.modeId === "cash" && pay.fromDrawer,
                      }
                    : undefined,
              }),
            );
            setBusy(false);
            if (!r.ok) return setError(r.error);
            if (r.warning) toast.warning(`Saved. Note: ${r.warning}`);
            else toast.success("Purchase saved — stock updated");
            onClose();
          }}
        >
          {busy ? <Spinner /> : null} Save · {money(total)}
        </Button>
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Supplier *">
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="tap">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.stock.suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span translate="no">{s.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date">
            <Input
              type="date"
              className="tap"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Supplier invoice no">
            <Input
              className="tap"
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
            />
          </Field>
        </div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">Items</p>
        {lines.map((l, i) => {
          const raw = data.stock.raw.find((r) => r.id === l.rawId);
          return (
            <div key={i} className="space-y-2 rounded-md border border-border p-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <ItemPicker
                    value={l.rawId ? { kind: "raw", id: l.rawId } : null}
                    onChange={(v) => setLine(i, { rawId: v.id })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove line"
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label={`Qty (${raw ? unitShort(data, raw.purchaseUnitId) : ""})`}>
                  <NumberField value={l.qty} onChange={(v) => setLine(i, { qty: v })} />
                </Field>
                <Field label="Rate ₹">
                  <NumberField value={l.rate} onChange={(v) => setLine(i, { rate: v })} />
                </Field>
                <Field label="Tax %">
                  <NumberField value={l.taxPct} onChange={(v) => setLine(i, { taxPct: v })} />
                </Field>
              </div>
            </div>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          className="tap"
          onClick={() =>
            setLines([...lines, { rawId: data.stock.raw[0]?.id ?? "", qty: 1, rate: 0, taxPct: 0 }])
          }
        >
          <Plus className="size-4" /> Add item
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Segmented
            value={discType}
            onChange={setDiscType}
            options={[
              { id: "flat", label: "Discount ₹" },
              { id: "percent", label: "Discount %" },
            ]}
          />
          <NumberField value={discValue} onChange={setDiscValue} />
        </div>
        {!initial ? (
          <Card className="space-y-2">
            <p className="text-sm font-semibold">Paid now (optional)</p>
            <NumberField
              value={pay.amount}
              onChange={(v) => setPay({ ...pay, amount: Math.min(v, total) })}
            />
            <div className="flex flex-wrap gap-1.5">
              {payModes(data).map((m) => (
                <Chip
                  key={m.id}
                  active={pay.modeId === m.id}
                  onClick={() => setPay({ ...pay, modeId: m.id })}
                >
                  <span translate="no">{m.name}</span>
                </Chip>
              ))}
            </div>
            {pay.modeId !== "cash" ? (
              <Input
                className="tap"
                placeholder="Reference no (cheque / UTR)"
                value={pay.ref}
                onChange={(e) => setPay({ ...pay, ref: e.target.value })}
              />
            ) : null}
            {pay.modeId === "cash" && data.cashSession ? (
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={pay.fromDrawer}
                  onChange={(e) => setPay({ ...pay, fromDrawer: e.target.checked })}
                />{" "}
                Take from the cash drawer
              </label>
            ) : null}
            {data.settings.supplierPaymentsAsExpense ? (
              <p className="text-xs text-muted-foreground">
                Recorded as an expense under “Supplier payment”.
              </p>
            ) : null}
          </Card>
        ) : null}
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

function PurchaseDetail({
  po,
  onClose,
  onEdit,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onEdit: () => void;
}) {
  const pos = usePos();
  const data = usePosData();
  const [pay, setPay] = useState({ amount: 0, modeId: "upi", ref: "", fromDrawer: true });
  const paid = po.payments.reduce((a, x) => a + x.amount, 0);
  const due = Math.round((po.total - paid) * 100) / 100;
  const modeName = (id: string) => payModes(data).find((m) => m.id === id)?.name ?? id;
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${po.poNo} · ${data.stock.suppliers.find((s) => s.id === po.supplierId)?.name ?? ""}`}
      description={`${po.date} · total ${money(po.total)} · by ${po.by}`}
    >
      <div className="space-y-3 py-2">
        <ul className="divide-y divide-border rounded-md border border-border">
          {po.lines.map((l, i) => {
            const raw = data.stock.raw.find((r) => r.id === l.rawId);
            return (
              <li key={i} className="flex justify-between px-3 py-2 text-sm">
                <span>
                  {raw?.name} · {qty(l.qty)} {raw ? unitShort(data, raw.purchaseUnitId) : ""} ×{" "}
                  {money(l.rate)}
                  {l.taxPct ? ` + ${l.taxPct}%` : ""}
                </span>
                <span className="num">{money(l.qty * l.rate * (1 + l.taxPct / 100))}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-sm font-semibold">
          Payments ·{" "}
          {due > 0 ? (
            <span className="text-status-hold">{money(due)} to pay</span>
          ) : (
            <span className="text-status-ready">paid</span>
          )}
        </p>
        {po.payments.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
          >
            <span>
              {money(p.amount)} · {modeName(p.modeId)}
              {p.ref ? ` · ${p.ref}` : ""} · {p.date}
              {p.fromDrawer ? " · from drawer" : ""}
            </span>
            {pos.can("stock-transactions", "delete") ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete payment"
                onClick={async () => {
                  const r = await pos.act((b) => b.deletePurchasePayment(po.id, p.id));
                  if (!r.ok) toast.error(r.error);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        ))}
        {due > 0 && pos.can("stock-transactions", "edit") ? (
          <Card className="space-y-2">
            <p className="text-sm font-semibold">Record a payment</p>
            <NumberField
              value={pay.amount}
              onChange={(v) => setPay({ ...pay, amount: Math.min(v, due) })}
            />
            <div className="flex flex-wrap gap-1.5">
              {payModes(data).map((m) => (
                <Chip
                  key={m.id}
                  active={pay.modeId === m.id}
                  onClick={() => setPay({ ...pay, modeId: m.id })}
                >
                  <span translate="no">{m.name}</span>
                </Chip>
              ))}
            </div>
            {pay.modeId !== "cash" ? (
              <Input
                className="tap"
                placeholder="Reference no"
                value={pay.ref}
                onChange={(e) => setPay({ ...pay, ref: e.target.value })}
              />
            ) : null}
            {pay.modeId === "cash" && data.cashSession ? (
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={pay.fromDrawer}
                  onChange={(e) => setPay({ ...pay, fromDrawer: e.target.checked })}
                />{" "}
                Take from the cash drawer
              </label>
            ) : null}
            <Button
              className="tap w-full"
              disabled={!(pay.amount > 0)}
              onClick={async () => {
                const r = await pos.act((b) =>
                  b.addPurchasePayment(po.id, {
                    amount: pay.amount,
                    modeId: pay.modeId,
                    date: new Date().toISOString().slice(0, 10),
                    ref: pay.ref || undefined,
                    fromDrawer: pay.modeId === "cash" && pay.fromDrawer,
                  }),
                );
                if (!r.ok) return void toast.error(r.error);
                toast.success("Payment recorded");
                setPay({ ...pay, amount: 0, ref: "" });
              }}
            >
              Save payment
            </Button>
          </Card>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {pos.can("stock-transactions", "edit") ? (
            <Button variant="outline" className="tap" onClick={onEdit}>
              Edit purchase
            </Button>
          ) : null}
          {pos.can("stock-transactions", "delete") ? (
            <Button
              variant="outline"
              className="tap text-destructive"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Delete ${po.poNo}? Its stock comes out again${po.payments.length ? " and its payments are removed" : ""}.`,
                  )
                )
                  return;
                const r = await pos.act((b) => b.deletePurchase(po.id));
                if (!r.ok) return void toast.error(r.error);
                if (r.warning) toast.warning(`Deleted. Note: ${r.warning}`);
                onClose();
              }}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </div>
    </ResponsiveSheet>
  );
}

/* ------------------------------ stock in / out / count ------------------------------ */

export function StockEntries() {
  const pos = usePos();
  const data = usePosData();
  const [kind, setKind] = useState<"in" | "out" | "count">("in");
  const [item, setItem] = useState<{ kind: "raw" | "semi"; id: string } | null>(null);
  const [amount, setAmount] = useState(0);
  const [rate, setRate] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nameOf = (k: "raw" | "semi", id: string) =>
    (k === "raw" ? data.stock.raw : data.stock.semi).find((x) => x.id === id)?.name ?? "";
  const unitOf = (k: "raw" | "semi", id: string) =>
    unitShort(
      data,
      (k === "raw" ? data.stock.raw : data.stock.semi).find((x) => x.id === id)?.unitId ?? "",
    );
  const current = item
    ? (item.kind === "raw" ? data.stock.raw : data.stock.semi).find((x) => x.id === item.id)
    : undefined;
  return (
    <div className="space-y-3">
      {pos.can("stock-transactions", "create") ? (
        <Card className="space-y-3">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { id: "in", label: "Stock in" },
              { id: "out", label: "Stock out" },
              { id: "count", label: "Physical count" },
            ]}
          />
          <ItemPicker value={item} onChange={setItem} allowSemi />
          {current ? (
            <p className="text-xs text-muted-foreground">
              Now: {qty(current.stock)} {item ? unitOf(item.kind, item.id) : ""}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label={kind === "count" ? "Counted quantity" : "Quantity"}>
              <NumberField value={amount} onChange={setAmount} />
            </Field>
            {kind === "in" && item?.kind === "raw" ? (
              <Field label="Rate per unit ₹ (optional)">
                <NumberField value={rate} onChange={setRate} />
              </Field>
            ) : null}
          </div>
          <Input
            className="tap"
            placeholder={kind === "in" ? "Note (optional)" : "Note (required)"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <FormError error={error} />
          <Button
            className="tap w-full"
            disabled={!item}
            onClick={async () => {
              if (!item) return;
              const r = await pos.act((b) =>
                b.stockEntry({
                  kind,
                  refKind: item.kind,
                  refId: item.id,
                  qty: amount,
                  rate: kind === "in" && rate ? rate : undefined,
                  note,
                }),
              );
              if (!r.ok) return setError(r.error);
              toast.success("Stock updated");
              setAmount(0);
              setRate(0);
              setNote("");
              setError(null);
            }}
          >
            Save
          </Button>
        </Card>
      ) : null}
      <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Recent movements
      </p>
      {data.stock.movements.slice(0, 60).map((m) => (
        <div
          key={m.id}
          className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <span className="min-w-0">
            <span className="font-semibold">{nameOf(m.refKind, m.refId)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {m.kind.replace("-", " ")} · {m.reference} · {dateTime(m.at)} · {m.by}
            </span>
          </span>
          <span
            className={cn("num shrink-0", m.qty < 0 ? "text-destructive" : "text-status-ready")}
          >
            {m.qty > 0 ? "+" : ""}
            {qty(m.qty)} {unitOf(m.refKind, m.refId)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ wastage ------------------------------ */

const WASTE_REASONS = ["Spoiled", "Expired", "Spilled", "Burnt", "Returned by guest"];

export function WastageSection() {
  const pos = usePos();
  const data = usePosData();
  const [item, setItem] = useState<{ kind: "raw" | "semi"; id: string } | null>(null);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const nameOf = (k: "raw" | "semi", id: string) =>
    (k === "raw" ? data.stock.raw : data.stock.semi).find((x) => x.id === id)?.name ?? "";
  return (
    <div className="space-y-3">
      {pos.can("stock-transactions", "create") ? (
        <Card className="space-y-3">
          <ItemPicker value={item} onChange={setItem} allowSemi />
          <Field label="Quantity wasted">
            <NumberField value={amount} onChange={setAmount} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {WASTE_REASONS.map((r) => (
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
          <Button
            className="tap w-full"
            disabled={!item}
            onClick={async () => {
              if (!item) return;
              const r = await pos.act((b) =>
                b.recordWastage({ refKind: item.kind, refId: item.id, qty: amount, reason }),
              );
              if (!r.ok) return void toast.error(r.error);
              toast.success("Wastage recorded");
              setAmount(0);
              setReason("");
            }}
          >
            Record wastage
          </Button>
        </Card>
      ) : null}
      {data.stock.wastage.length === 0 ? (
        <EmptyState title="No wastage recorded" />
      ) : (
        data.stock.wastage.map((w) => (
          <div
            key={w.id}
            className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <span>
              <span className="font-semibold">{nameOf(w.refKind, w.refId)}</span> · {qty(w.qty)} ·{" "}
              {w.reason}
              <span className="block text-xs text-muted-foreground">
                {dateTime(w.at)} · {w.by} · {money(w.cost)}
              </span>
            </span>
            {pos.can("stock-transactions", "delete") ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete wastage"
                onClick={() => void pos.act((b) => b.deleteWastage(w.id))}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

/* ------------------------------ recipes ------------------------------ */

export function Recipes() {
  const pos = usePos();
  const data = usePosData();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const items = useMemo(
    () =>
      data.items
        .filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data.items, q],
  );
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        What one portion uses. Stock comes out when the bill is settled (pickup: when it is saved).
        Items without a recipe don't touch stock.
      </p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="tap pl-9"
          placeholder="Search menu items"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {items.map((i) => {
        const r = data.stock.recipes.find((x) => x.itemId === i.id);
        return (
          <ListRow
            key={i.id}
            title={i.name}
            subtitle={
              r
                ? `${r.base.length} ingredient(s)${Object.keys(r.byVariant).length ? " · per variant" : ""}${Object.keys(r.byAddon).length ? " · add-ons" : ""}`
                : "No recipe"
            }
            onClick={pos.can("stock-recipes", "edit") ? () => setEditing(i.id) : undefined}
            right={
              r ? (
                <span className="text-xs font-semibold text-status-ready">Set</span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )
            }
          />
        );
      })}
      {editing ? <RecipeSheet itemId={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function LinesEditor({
  lines,
  onChange,
}: {
  lines: RecipeLine[];
  onChange: (l: RecipeLine[]) => void;
}) {
  const data = usePosData();
  return (
    <div className="space-y-2">
      {lines.map((l, i) => {
        const unit = unitShort(
          data,
          (l.kind === "raw" ? data.stock.raw : data.stock.semi).find((x) => x.id === l.refId)
            ?.unitId ?? "",
        );
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1">
              <ItemPicker
                value={{ kind: l.kind, id: l.refId }}
                allowSemi
                onChange={(v) =>
                  onChange(lines.map((x, j) => (j === i ? { ...x, kind: v.kind, refId: v.id } : x)))
                }
              />
            </div>
            <NumberField
              className="w-24"
              value={l.qty}
              onChange={(v) => onChange(lines.map((x, j) => (j === i ? { ...x, qty: v } : x)))}
            />
            <span className="w-8 text-xs text-muted-foreground">{unit}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove ingredient"
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        className="tap"
        disabled={!data.stock.raw.length}
        onClick={() => onChange([...lines, { kind: "raw", refId: data.stock.raw[0]!.id, qty: 0 }])}
      >
        <Plus className="size-4" /> Ingredient
      </Button>
    </div>
  );
}

function RecipeSheet({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const pos = usePos();
  const data = usePosData();
  const item = data.items.find((i) => i.id === itemId)!;
  const existing = data.stock.recipes.find((r) => r.itemId === itemId);
  const [r, setR] = useState<Omit<Recipe, "id">>(
    existing ?? { itemId, base: [], byVariant: {}, byAddon: {} },
  );
  const [error, setError] = useState<string | null>(null);
  const addons = data.addonGroups
    .filter((g) => item.addonGroupIds.includes(g.id))
    .flatMap((g) => g.options);
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Recipe · ${item.name}`}
      footer={
        <Button
          className="tap w-full"
          onClick={async () => {
            const res = await pos.act((b) => b.saveRecipe({ ...r, id: existing?.id }));
            if (res.ok) {
              toast.success("Recipe saved");
              onClose();
            } else setError(res.error);
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-4 py-2">
        <Field label="One portion uses">
          <LinesEditor lines={r.base} onChange={(base) => setR({ ...r, base })} />
        </Field>
        {item.variants.map((v) => (
          <Field
            key={v.variantId}
            label={`Variant ${v.name} uses (instead of the above; leave empty to use the above)`}
          >
            <LinesEditor
              lines={r.byVariant[v.variantId] ?? []}
              onChange={(l) => setR({ ...r, byVariant: { ...r.byVariant, [v.variantId]: l } })}
            />
          </Field>
        ))}
        {addons.map((a) => (
          <Field key={a.id} label={`Add-on ${a.name} also uses`}>
            <LinesEditor
              lines={r.byAddon[a.id] ?? []}
              onChange={(l) => setR({ ...r, byAddon: { ...r.byAddon, [a.id]: l } })}
            />
          </Field>
        ))}
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

/* ------------------------------ semi-finished ------------------------------ */

export function SemiFinishedSection() {
  const pos = usePos();
  const data = usePosData();
  const [editing, setEditing] = useState<SemiFinished | "new" | null>(null);
  const [producing, setProducing] = useState<SemiFinished | null>(null);
  const [amount, setAmount] = useState(0);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Things you prepare in batches (gravies, doughs). Making a batch takes its raw materials out
        of stock.
      </p>
      {pos.can("stock-recipes", "create") ? (
        <Button className="tap" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Semi-finished item
        </Button>
      ) : null}
      {data.stock.semi.length === 0 ? (
        <EmptyState title="None yet" />
      ) : (
        data.stock.semi.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-card p-3 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="min-w-0 text-left"
                disabled={!pos.can("stock-recipes", "edit")}
                onClick={() => setEditing(s)}
              >
                <p className="font-semibold">
                  <span translate="no">{s.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {qty(s.stock)} {unitShort(data, s.unitId)} · min {qty(s.minStock)}
                </p>
              </button>
              <StockStatus m={{ stock: s.stock, reorderLevel: s.minStock }} />
            </div>
            {pos.can("stock-transactions", "create") ? (
              <Button
                variant="outline"
                size="sm"
                className="tap mt-2"
                onClick={() => {
                  setAmount(0);
                  setProducing(s);
                }}
              >
                Make a batch
              </Button>
            ) : null}
          </div>
        ))
      )}
      {editing ? (
        <SemiSheet initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      <ResponsiveSheet
        open={Boolean(producing)}
        onOpenChange={(o) => !o && setProducing(null)}
        title={producing ? `Make ${producing.name}` : ""}
        footer={
          <Button
            className="tap w-full"
            onClick={async () => {
              if (!producing) return;
              const r = await pos.act((b) => b.produceSemi(producing.id, amount));
              if (!r.ok) return void toast.error(r.error);
              toast.success("Batch added to stock");
              setProducing(null);
            }}
          >
            Save
          </Button>
        }
      >
        <div className="space-y-2 py-2">
          <Field label={`Quantity made (${producing ? unitShort(data, producing.unitId) : ""})`}>
            <NumberField value={amount} onChange={setAmount} />
          </Field>
        </div>
      </ResponsiveSheet>
    </div>
  );
}

function SemiSheet({ initial, onClose }: { initial: SemiFinished | null; onClose: () => void }) {
  const pos = usePos();
  const data = usePosData();
  const [f, setF] = useState({
    name: initial?.name ?? "",
    unitId: initial?.unitId ?? data.stock.units[0]?.id ?? "",
    minStock: initial?.minStock ?? 0,
    components: initial?.components ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit ${initial.name}` : "New semi-finished item"}
      footer={
        <Button
          className="tap w-full"
          onClick={async () => {
            const r = await pos.act((b) =>
              b.saveSemi({
                ...f,
                components: f.components.filter((c) => c.kind === "raw"),
                id: initial?.id,
              }),
            );
            if (r.ok) onClose();
            else setError(r.error);
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Name *">
          <Input
            className="tap"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Unit">
            <Select value={f.unitId} onValueChange={(v) => setF({ ...f, unitId: v })}>
              <SelectTrigger className="tap">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.stock.units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <span translate="no">{u.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Minimum stock">
            <NumberField value={f.minStock} onChange={(v) => setF({ ...f, minStock: v })} />
          </Field>
        </div>
        <Field label={`To make 1 ${unitShort(data, f.unitId)} you use (raw materials)`}>
          <LinesEditor lines={f.components} onChange={(components) => setF({ ...f, components })} />
        </Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}
