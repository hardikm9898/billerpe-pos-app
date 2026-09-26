import { createFileRoute } from "@tanstack/react-router";
import { Camera, Plus, Receipt, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Field, FormError, readImage } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dateTime, money } from "@/lib/pos/format";
import { can } from "@/lib/pos/permissions";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses — BillerPe POS" },
      { name: "description", content: "Record expenses by head and payment mode with bill photos and a monthly total." },
      { property: "og:title", content: "Expenses — BillerPe POS" },
      { property: "og:description", content: "Record expenses by head and payment mode with bill photos and a monthly total." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const pos = usePos();
  const canAdd = can(pos.permissions, "expenses", "create");
  const canDelete = can(pos.permissions, "expenses", "delete");
  const [head, setHead] = useState("all");
  const [open, setOpen] = useState(false);
  const [headOpen, setHeadOpen] = useState(false);
  const [headName, setHeadName] = useState("");
  const [f, setF] = useState({ headId: "", amount: 0, mode: "cash", note: "", photo: undefined as string | undefined });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthTotal = pos.expenses.filter((e) => new Date(e.at) >= monthStart).reduce((a, e) => a + e.amount, 0);
  const list = useMemo(() => pos.expenses.filter((e) => head === "all" || e.headId === head), [pos.expenses, head]);
  const headName_ = (id: string) => pos.expenseHeads.find((h) => h.id === id)?.name ?? "—";

  return (
    <AppShell title="Expenses">
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="rounded-lg bg-primary-soft p-4 text-primary-soft-foreground">
          <p className="text-sm font-semibold">This month</p>
          <p className="num font-display text-3xl font-extrabold">{money(monthTotal)}</p>
        </div>
        {canAdd ? (
          <div className="grid grid-cols-2 gap-2">
            <Button className="tap" onClick={() => { setF({ headId: pos.expenseHeads[0]?.id ?? "", amount: 0, mode: "cash", note: "", photo: undefined }); setError(null); setOpen(true); }}><Plus className="size-4" /> Expense</Button>
            <Button variant="outline" className="tap" onClick={() => { setHeadName(""); setError(null); setHeadOpen(true); }}><Plus className="size-4" /> Head</Button>
          </div>
        ) : null}
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
          <Chip active={head === "all"} onClick={() => setHead("all")}>All</Chip>
          {pos.expenseHeads.map((h) => <Chip key={h.id} active={head === h.id} onClick={() => setHead(h.id)}>{h.name}</Chip>)}
        </div>
        {list.length === 0 ? <EmptyState icon={<Receipt className="size-6" />} title="No expenses" body="Record purchases, bills and salaries here." /> : (
          <ul className="space-y-2">
            {list.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft">
                {e.photo ? <img src={e.photo} alt="Bill" className="size-11 rounded-md object-cover" /> : <span className="flex size-11 items-center justify-center rounded-md bg-muted"><Receipt className="size-4 text-muted-foreground" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{headName_(e.headId)}{e.note ? ` · ${e.note}` : ""}</p>
                  <p className="truncate text-xs text-muted-foreground">{dateTime(e.at)} · {pos.modeLabel(e.mode)} · {e.by}</p>
                </div>
                <span className="num">{money(e.amount)}</span>
                {canDelete ? <Button variant="ghost" size="icon" aria-label="Delete expense" onClick={() => void pos.deleteExpense(e.id)}><Trash2 className="size-4" /></Button> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Add expense" footer={
        <Button className="tap w-full" disabled={busy} onClick={async () => {
          if (f.note.length > 120) return setError("Note is too long");
          setBusy(true); const r = await pos.addExpense(f); setBusy(false);
          if (r.ok) { toast.success("Expense saved"); setOpen(false); } else setError(r.error ?? "");
        }}>{busy ? <Spinner /> : null} Save</Button>
      }>
        <div className="space-y-3 py-2">
          <Field label="Amount ₹ *"><NumberField className="h-12 text-xl" value={f.amount} onChange={(v) => { setF({ ...f, amount: v }); setError(null); }} /></Field>
          <Field label="Head *"><div className="flex flex-wrap gap-2">{pos.expenseHeads.map((h) => <Chip key={h.id} active={f.headId === h.id} onClick={() => setF({ ...f, headId: h.id })}>{h.name}</Chip>)}</div></Field>
          <Field label="Paid by"><div className="flex flex-wrap gap-2">{pos.billingSettings.paymentModes.filter((m) => m.id !== "due").map((m) => <Chip key={m.id} active={f.mode === m.id} onClick={() => setF({ ...f, mode: m.id })}>{m.label}</Chip>)}</div></Field>
          <Field label="Note"><Input className="tap" maxLength={120} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <label className="tap inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold">
            <Camera className="size-4" /> {f.photo ? "Change bill photo" : "Add bill photo"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { setF({ ...f, photo: await readImage(file) }); } catch (err) { setError((err as Error).message); } }} />
          </label>
          {f.photo ? <img src={f.photo} alt="Bill" className="h-24 rounded-md object-cover" /> : null}
          <FormError error={error} />
        </div>
      </ResponsiveSheet>

      <ResponsiveSheet open={headOpen} onOpenChange={setHeadOpen} title="Add expense head" footer={
        <Button className="tap w-full" onClick={async () => { const r = await pos.addExpenseHead(headName); if (r.ok) { toast.success("Head added"); setHeadOpen(false); } else setError(r.error ?? ""); }}>Save</Button>
      }>
        <div className="space-y-2 py-2">
          <Input className="tap" maxLength={30} placeholder="e.g. Electricity" value={headName} onChange={(e) => { setHeadName(e.target.value); setError(null); }} />
          <FormError error={error} />
        </div>
      </ResponsiveSheet>
    </AppShell>
  );
}
