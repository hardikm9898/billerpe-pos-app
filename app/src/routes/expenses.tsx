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
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/expenses")({
  component: ExpensesPage,
});

function ExpensesPage() {
  const pos = usePos();
  const data = pos.data!;
  const canAdd = pos.can("expense", "create");
  const canDelete = pos.can("expense", "delete");
  const heads = data.expenseHeads.filter((h) => h.active);
  const addable = heads.filter((h) => !h.system);
  const modeLabel = (id: string) => data.settings.paymentModes.find((m) => m.id === id)?.name ?? id;
  const [headType, setHeadType] = useState<"Fixed" | "Variable">("Variable");
  const [head, setHead] = useState("all");
  const [open, setOpen] = useState(false);
  const [headOpen, setHeadOpen] = useState(false);
  const [headName, setHeadName] = useState("");
  const [f, setF] = useState({
    headId: "",
    amount: 0,
    mode: "cash",
    note: "",
    photo: undefined as string | undefined,
    fromDrawer: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthTotal = data.expenses
    .filter((e) => new Date(e.at) >= monthStart)
    .reduce((a, e) => a + e.amount, 0);
  const list = useMemo(
    () =>
      [...data.expenses]
        .filter((e) => head === "all" || e.headId === head)
        .sort((a, b) => b.at.localeCompare(a.at)),
    [data.expenses, head],
  );
  const headName_ = (id: string) => data.expenseHeads.find((h) => h.id === id)?.name ?? "—";

  return (
    <AppShell title="Expenses">
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="rounded-lg bg-primary-soft p-4 text-primary-soft-foreground">
          <p className="text-sm font-semibold">This month</p>
          <p className="num font-display text-3xl font-extrabold">{money(monthTotal)}</p>
        </div>
        {canAdd ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="tap"
              onClick={() => {
                setF({
                  headId: addable[0]?.id ?? "",
                  amount: 0,
                  mode: "cash",
                  note: "",
                  photo: undefined,
                  fromDrawer: true,
                });
                setError(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" /> Expense
            </Button>
            <Button
              variant="outline"
              className="tap"
              onClick={() => {
                setHeadName("");
                setError(null);
                setHeadOpen(true);
              }}
            >
              <Plus className="size-4" /> Head
            </Button>
          </div>
        ) : null}
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
          <Chip active={head === "all"} onClick={() => setHead("all")}>
            All
          </Chip>
          {heads.map((h) => (
            <Chip key={h.id} active={head === h.id} onClick={() => setHead(h.id)}>
              <span translate="no">{h.name}</span>
            </Chip>
          ))}
        </div>
        {list.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-6" />}
            title="No expenses"
            body="Record purchases, bills and salaries here."
          />
        ) : (
          <ul className="space-y-2">
            {list.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft"
              >
                {e.photoUrl ? (
                  <img src={e.photoUrl} alt="Bill" className="size-11 rounded-md object-cover" />
                ) : (
                  <span className="flex size-11 items-center justify-center rounded-md bg-muted">
                    <Receipt className="size-4 text-muted-foreground" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {headName_(e.headId)}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {dateTime(e.at)} · {modeLabel(e.modeId)}
                    {e.fromDrawer ? " (drawer)" : ""} · {e.by}
                    {e.fromPurchase ? " · from purchase" : ""}
                  </p>
                </div>
                <span className="num">{money(e.amount)}</span>
                {canDelete && !e.fromPurchase ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete expense"
                    onClick={async () => {
                      const r = await pos.act((b) => b.deleteExpense(e.id));
                      if (!r.ok) toast.error(r.error);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title="Add expense"
        footer={
          <Button
            className="tap w-full"
            disabled={busy}
            onClick={async () => {
              if (f.note.length > 120) return setError("Note is too long");
              setBusy(true);
              const r = await pos.act((b) =>
                b.saveExpense({
                  headId: f.headId,
                  amount: f.amount,
                  modeId: f.mode,
                  note: f.note,
                  photoUrl: f.photo,
                  fromDrawer: f.mode === "cash" && f.fromDrawer,
                }),
              );
              setBusy(false);
              if (r.ok) {
                toast.success("Expense saved");
                setOpen(false);
              } else setError(r.error);
            }}
          >
            {busy ? <Spinner /> : null} Save
          </Button>
        }
      >
        <div className="space-y-3 py-2">
          <Field label="Amount ₹ *">
            <NumberField
              className="h-12 text-xl"
              value={f.amount}
              onChange={(v) => {
                setF({ ...f, amount: v });
                setError(null);
              }}
            />
          </Field>
          <Field label="Head *">
            <div className="flex flex-wrap gap-2">
              {addable.map((h) => (
                <Chip
                  key={h.id}
                  active={f.headId === h.id}
                  onClick={() => setF({ ...f, headId: h.id })}
                >
                  <span translate="no">{h.name}</span>
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Paid by">
            <div className="flex flex-wrap gap-2">
              {data.settings.paymentModes
                .filter((m) => m.id !== "due" && m.active)
                .map((m) => (
                  <Chip
                    key={m.id}
                    active={f.mode === m.id}
                    onClick={() => setF({ ...f, mode: m.id })}
                  >
                    {m.name}
                  </Chip>
                ))}
            </div>
          </Field>
          {f.mode === "cash" && data.cashSession ? (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={f.fromDrawer}
                onChange={(e) => setF({ ...f, fromDrawer: e.target.checked })}
              />{" "}
              Take from the cash drawer
            </label>
          ) : null}
          <Field label="Note">
            <Input
              className="tap"
              maxLength={120}
              value={f.note}
              onChange={(e) => setF({ ...f, note: e.target.value })}
            />
          </Field>
          <label className="tap inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold">
            <Camera className="size-4" /> {f.photo ? "Change bill photo" : "Add bill photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setF({ ...f, photo: await readImage(file) });
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </label>
          {f.photo ? (
            <img src={f.photo} alt="Bill" className="h-24 rounded-md object-cover" />
          ) : null}
          <FormError error={error} />
        </div>
      </ResponsiveSheet>

      <ResponsiveSheet
        open={headOpen}
        onOpenChange={setHeadOpen}
        title="Add expense head"
        footer={
          <Button
            className="tap w-full"
            onClick={async () => {
              const r = await pos.act((b) =>
                b.saveExpenseHead({ name: headName, type: headType, active: true }),
              );
              if (r.ok) {
                toast.success("Head added");
                setHeadOpen(false);
              } else setError(r.error);
            }}
          >
            Save
          </Button>
        }
      >
        <div className="space-y-2 py-2">
          <Input
            className="tap"
            maxLength={30}
            placeholder="e.g. Electricity"
            value={headName}
            onChange={(e) => {
              setHeadName(e.target.value);
              setError(null);
            }}
          />
          <div className="flex gap-2">
            <Chip active={headType === "Variable"} onClick={() => setHeadType("Variable")}>
              Variable
            </Chip>
            <Chip active={headType === "Fixed"} onClick={() => setHeadType("Fixed")}>
              Fixed (rent, salary)
            </Chip>
          </div>
          <FormError error={error} />
        </div>
      </ResponsiveSheet>
    </AppShell>
  );
}
