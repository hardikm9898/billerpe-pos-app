import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FormError, Segmented } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import {
  ORDER_TYPE_LABEL,
  type ChargeRule,
  type Kitchen,
  type OrderType,
  type PromoCode,
  type TaxRule,
} from "@/lib/pos/types";

// Editors for the outlet's billing rules. Same shapes as the Web POS /
// exe (tax rules, hms_bill_charge_msts charge rules, kitchens), so an
// outlet's configuration means the same thing in both products.

const TYPES: OrderType[] = ["dinin", "pickup"];

function TypeChips({
  value,
  onChange,
  disabled,
}: {
  value: OrderType[];
  onChange: (v: OrderType[]) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <div className="flex gap-1.5">
      {TYPES.map((t) => (
        <Chip
          key={t}
          active={value.includes(t)}
          onClick={() => {
            if (!disabled)
              onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
          }}
        >
          {ORDER_TYPE_LABEL[t]}
        </Chip>
      ))}
    </div>
  );
}

function IdChips({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { id: string; name: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
      {options.map((o) => (
        <Chip
          key={o.id}
          active={value.includes(o.id)}
          onClick={() => {
            if (!disabled)
              onChange(value.includes(o.id) ? value.filter((x) => x !== o.id) : [...value, o.id]);
          }}
        >
          <span translate="no">{o.name}</span>
        </Chip>
      ))}
    </div>
  );
}

/* ------------------------------ taxes ------------------------------ */

export function TaxList({ editable }: { editable: boolean }) {
  const pos = usePos();
  const s = pos.data!.settings;
  const [editing, setEditing] = useState<TaxRule | "new" | null>(null);
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-3 text-sm font-semibold">
        <span>
          Charge GST / tax on bills
          <span className="block text-xs font-normal text-muted-foreground">
            Master switch. Off = no tax lines on any bill.
          </span>
        </span>
        <Switch
          disabled={!editable}
          checked={s.gstOn}
          onCheckedChange={async (v) => {
            const r = await pos.act((b) => b.updateSettings({ gstOn: v }));
            if (!r.ok) toast.error(r.error);
          }}
        />
      </label>
      {s.taxes.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={!editable}
          onClick={() => setEditing(t)}
          className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left"
        >
          <span>
            <span className="font-semibold">
              <span translate="no">{t.name}</span>
            </span>{" "}
            <span className="text-sm">{t.type === "pr" ? `${t.rate}%` : money(t.rate)}</span>
            <span className="block text-xs text-muted-foreground">
              {t.orderTypes.length
                ? t.orderTypes.map((x) => ORDER_TYPE_LABEL[x]).join(", ")
                : "All orders"}{" "}
              · {t.sectionIds.length ? `${t.sectionIds.length} section(s)` : "all sections"} ·{" "}
              {t.itemIds.length ? `${t.itemIds.length} item(s) only` : "all items"}
            </span>
          </span>
          <span
            className={
              t.active ? "text-xs font-semibold text-status-ready" : "text-xs text-muted-foreground"
            }
          >
            {t.active ? "On" : "Off"}
          </span>
        </button>
      ))}
      {editable ? (
        <Button variant="outline" className="tap w-full" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add tax
        </Button>
      ) : null}
      {editing ? (
        <TaxSheet initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function TaxSheet({ initial, onClose }: { initial: TaxRule | null; onClose: () => void }) {
  const pos = usePos();
  const data = pos.data!;
  const [f, setF] = useState<Omit<TaxRule, "id">>(
    initial ?? {
      name: "",
      type: "pr",
      rate: 0,
      active: true,
      orderTypes: [],
      sectionIds: [],
      itemIds: [],
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const items = data.items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit ${initial.name}` : "New tax"}
      footer={
        <div className="flex gap-2">
          {initial ? (
            <Button
              variant="outline"
              className="tap text-destructive"
              onClick={async () => {
                const r = await pos.act((b) => b.deleteTax(initial.id));
                if (r.ok) onClose();
                else setError(r.error);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
          <Button
            className="tap flex-1"
            onClick={async () => {
              const r = await pos.act((b) => b.saveTax({ ...f, id: initial?.id }));
              if (r.ok) {
                toast.success("Tax saved");
                onClose();
              } else setError(r.error);
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name *">
            <Input
              className="tap"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="CGST"
            />
          </Field>
          <Field label={f.type === "pr" ? "Rate %" : "Amount ₹"}>
            <NumberField value={f.rate} onChange={(v) => setF({ ...f, rate: v })} />
          </Field>
        </div>
        <Segmented
          value={f.type}
          onChange={(v) => setF({ ...f, type: v })}
          options={[
            { id: "pr", label: "Percent" },
            { id: "fix", label: "Fixed ₹" },
          ]}
        />
        <label className="flex items-center justify-between text-sm font-semibold">
          Active <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />
        </label>
        <Field label="Order types (none = all)">
          <TypeChips value={f.orderTypes} onChange={(v) => setF({ ...f, orderTypes: v })} />
        </Field>
        <Field label="Table sections (none = all)">
          <IdChips
            options={data.sections}
            value={f.sectionIds}
            onChange={(v) => setF({ ...f, sectionIds: v })}
          />
        </Field>
        <Field
          label="Only these items (none = every item)"
          hint="e.g. a liquor tax on bar items only"
        >
          <Input
            className="tap mb-2"
            placeholder="Search items"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <IdChips options={items} value={f.itemIds} onChange={(v) => setF({ ...f, itemIds: v })} />
        </Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

/* ------------------------------ charge rules ------------------------------ */

export function ChargeRuleEditor({
  which,
  editable,
}: {
  which: "service" | "packaging";
  editable: boolean;
}) {
  const pos = usePos();
  const current =
    which === "service" ? pos.data!.settings.serviceCharge : pos.data!.settings.packagingCharge;
  const [f, setF] = useState<ChargeRule>(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<ChargeRule>) => {
    setF((x) => ({ ...x, ...p }));
    setError(null);
  };
  return (
    <fieldset disabled={!editable} className="space-y-3">
      <label className="flex items-center justify-between text-sm font-semibold">
        {which === "service" ? "Service charge" : "Packaging charge"} on{" "}
        <Switch checked={f.active} onCheckedChange={(v) => set({ active: v })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Segmented
          value={f.type}
          onChange={(v) => set({ type: v })}
          options={[
            { id: "percentage", label: "%" },
            { id: "fixed", label: "₹ fixed" },
          ]}
        />
        <NumberField value={f.value} onChange={(v) => set({ value: v })} />
      </div>
      <Field
        label={
          which === "service"
            ? "Automatic for (none ticked = added by hand on each bill)"
            : "Applies to (none = all orders)"
        }
      >
        <TypeChips
          value={f.orderTypes}
          onChange={(v) => set({ orderTypes: v })}
          disabled={!editable}
        />
      </Field>
      {f.type === "percentage" ? (
        <Field label="Calculated on">
          <Segmented
            value={f.calculationOn}
            onChange={(v) => set({ calculationOn: v })}
            options={[
              { id: "core", label: "Subtotal" },
              { id: "total", label: "After discount" },
            ]}
          />
        </Field>
      ) : null}
      <Field label="When">
        <Segmented
          value={f.condition}
          onChange={(v) => set({ condition: v })}
          options={[
            { id: "3", label: "Always" },
            { id: "1", label: "Bill above" },
            { id: "2", label: "Bill below" },
          ]}
        />
      </Field>
      {f.condition !== "3" ? (
        <Field label="Bill amount ₹">
          <NumberField value={f.threshold} onChange={(v) => set({ threshold: v })} />
        </Field>
      ) : null}
      <label className="flex items-center justify-between text-sm font-semibold">
        Charge GST on it too{" "}
        <Switch checked={f.taxOnCharge} onCheckedChange={(v) => set({ taxOnCharge: v })} />
      </label>
      <FormError error={error} />
      {editable ? (
        <Button
          className="tap w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await pos.act((b) => b.saveCharge(which, f));
            setBusy(false);
            if (r.ok) toast.success("Saved");
            else setError(r.error);
          }}
        >
          {busy ? <Spinner /> : null} Save
        </Button>
      ) : null}
    </fieldset>
  );
}

/* ------------------------------ payment modes & promos ------------------------------ */

export function PaymentModes({ editable }: { editable: boolean }) {
  const pos = usePos();
  const [name, setName] = useState("");
  const modes = pos.data!.settings.paymentModes;
  const save = async (m: { id?: string; name: string; active: boolean }) => {
    const r = await pos.act((b) => b.savePaymentMode(m));
    if (!r.ok) toast.error(r.error);
    return r.ok;
  };
  return (
    <div className="space-y-2">
      {modes.map((m) => (
        <div key={m.id} className="flex items-center gap-2">
          <Input
            className="tap flex-1"
            disabled={m.locked || !editable}
            defaultValue={m.name}
            onBlur={(e) =>
              e.target.value.trim() !== m.name &&
              void save({ id: m.id, name: e.target.value, active: m.active })
            }
          />
          {m.locked ? (
            <span className="w-16 text-center text-xs font-semibold text-muted-foreground">
              Always on
            </span>
          ) : (
            <Switch
              disabled={!editable}
              aria-label={`${m.name} on`}
              checked={m.active}
              onCheckedChange={(v) => void save({ id: m.id, name: m.name, active: v })}
            />
          )}
          {m.custom && editable ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${m.name}`}
              onClick={async () => {
                const r = await pos.act((b) => b.removePaymentMode(m.id));
                if (!r.ok) toast.error(r.error);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Cash and Due are always on. Custom modes show as their own line in reports and never count
        as cash in the drawer.
      </p>
      {editable ? (
        <div className="flex gap-2">
          <Input
            className="tap flex-1"
            placeholder="e.g. PhonePe, Swiggy"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            className="tap"
            onClick={async () => {
              if (await save({ name, active: true })) setName("");
            }}
          >
            <Plus className="size-4" /> Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function PromoList({ editable }: { editable: boolean }) {
  const pos = usePos();
  const [editing, setEditing] = useState<PromoCode | "new" | null>(null);
  const promos = pos.data!.settings.promoCodes;
  return (
    <div className="space-y-2">
      {promos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No promo codes yet.</p>
      ) : null}
      {promos.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={!editable}
          onClick={() => setEditing(p)}
          className="tap flex w-full items-center justify-between rounded-md border border-dashed border-border px-3 text-left"
        >
          <span className="font-display font-bold">{p.code}</span>
          <span className="text-xs text-muted-foreground">
            <span translate="no">{p.name}</span> ·{" "}
            {p.type === "pr" ? `${p.value}%` : money(p.value)} · {p.active ? "on" : "off"}
          </span>
        </button>
      ))}
      {editable ? (
        <Button variant="outline" className="tap w-full" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Promo code
        </Button>
      ) : null}
      {editing ? (
        <PromoSheet initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function PromoSheet({ initial, onClose }: { initial: PromoCode | null; onClose: () => void }) {
  const pos = usePos();
  const [f, setF] = useState<Omit<PromoCode, "id">>(
    initial ?? { name: "", code: "", type: "pr", value: 10, active: true },
  );
  const [error, setError] = useState<string | null>(null);
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit ${initial.code}` : "New promo code"}
      footer={
        <div className="flex gap-2">
          {initial ? (
            <Button
              variant="outline"
              className="tap text-destructive"
              onClick={async () => {
                await pos.act((b) => b.deletePromo(initial.id));
                onClose();
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
          <Button
            className="tap flex-1"
            onClick={async () => {
              const r = await pos.act((b) => b.savePromo({ ...f, id: initial?.id }));
              if (r.ok) {
                toast.success("Promo saved");
                onClose();
              } else setError(r.error);
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Name *">
          <Input
            className="tap"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="Weekday offer"
          />
        </Field>
        <Field label="Code *">
          <Input
            className="tap uppercase"
            maxLength={12}
            value={f.code}
            onChange={(e) => {
              setF({ ...f, code: e.target.value.toUpperCase() });
              setError(null);
            }}
          />
        </Field>
        <Segmented
          value={f.type}
          onChange={(v) => setF({ ...f, type: v })}
          options={[
            { id: "pr", label: "Percent %" },
            { id: "fix", label: "Flat ₹" },
          ]}
        />
        <Field label="Value">
          <NumberField value={f.value} onChange={(v) => setF({ ...f, value: v })} />
        </Field>
        <label className="flex items-center justify-between text-sm font-semibold">
          Active <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />
        </label>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

/* ------------------------------ kitchens ------------------------------ */

export function KitchenList({ editable }: { editable: boolean }) {
  const pos = usePos();
  const [editing, setEditing] = useState<Kitchen | "new" | null>(null);
  const data = pos.data!;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Kitchen screens (KDS). Each shows the KOT items that match its filters; an item no kitchen
        takes goes to the first one. Printers on each phone have the same filters.
      </p>
      {data.settings.kitchens.map((k) => (
        <button
          key={k.id}
          type="button"
          disabled={!editable}
          onClick={() => setEditing(k)}
          className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left"
        >
          <span>
            <span className="font-semibold">
              <span translate="no">{k.name}</span>
            </span>
            <span className="block text-xs text-muted-foreground">
              {k.categoryIds.length ? `${k.categoryIds.length} categories` : "all items"} ·{" "}
              {k.sectionIds.length ? `${k.sectionIds.length} section(s)` : "all sections"} ·{" "}
              {k.orderTypes.length
                ? k.orderTypes.map((t) => ORDER_TYPE_LABEL[t]).join(", ")
                : "all orders"}
            </span>
          </span>
        </button>
      ))}
      {editable ? (
        <Button variant="outline" className="tap w-full" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add kitchen
        </Button>
      ) : null}
      {editing ? (
        <KitchenSheet
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function KitchenSheet({ initial, onClose }: { initial: Kitchen | null; onClose: () => void }) {
  const pos = usePos();
  const data = pos.data!;
  const [f, setF] = useState<Omit<Kitchen, "id">>(
    initial ?? { name: "", categoryIds: [], sectionIds: [], orderTypes: [] },
  );
  const [error, setError] = useState<string | null>(null);
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit ${initial.name}` : "New kitchen"}
      footer={
        <div className="flex gap-2">
          {initial ? (
            <Button
              variant="outline"
              className="tap text-destructive"
              onClick={async () => {
                await pos.act((b) => b.deleteKitchen(initial.id));
                onClose();
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
          <Button
            className="tap flex-1"
            onClick={async () => {
              const r = await pos.act((b) => b.saveKitchen({ ...f, id: initial?.id }));
              if (r.ok) {
                toast.success("Kitchen saved");
                onClose();
              } else setError(r.error);
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Kitchen name *">
          <Input
            className="tap"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="Tandoor"
          />
        </Field>
        {data.menus.map((m) => (
          <Field key={m.id} label={`Categories · ${m.name} (none = all)`}>
            <IdChips
              options={data.categories.filter((c) => c.menuId === m.id)}
              value={f.categoryIds}
              onChange={(v) => setF({ ...f, categoryIds: v })}
            />
          </Field>
        ))}
        <Field label="Table sections (none = all)">
          <IdChips
            options={data.sections}
            value={f.sectionIds}
            onChange={(v) => setF({ ...f, sectionIds: v })}
          />
        </Field>
        <Field label="Order types (none = all)">
          <TypeChips value={f.orderTypes} onChange={(v) => setF({ ...f, orderTypes: v })} />
        </Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}
