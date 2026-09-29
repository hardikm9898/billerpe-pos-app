import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Segmented } from "@/components/pos/kit";
import { Chip, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money, round2 } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type { Order, Payment } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

interface Row {
  id: number;
  mode: string;
  amount: number;
}

let rowSeq = 1;

/**
 * The original payment moved to the new total (Web POS prefillEditSplits):
 * more to pay goes on the default mode; less comes off the Due first, then
 * off the other modes, last one first.
 */
export function prefillEditPayments(previous: Payment[], total: number, defaultMode = "cash") {
  const rows = previous.filter((p) => p.amount > 0).map((p) => ({ ...p }));
  if (!rows.length) return [{ modeId: defaultMode, amount: round2(total) }];
  let diff = round2(total - rows.reduce((a, p) => a + p.amount, 0));
  if (diff > 0) {
    const row = rows.find((p) => p.modeId === defaultMode);
    if (row) row.amount = round2(row.amount + diff);
    else rows.push({ modeId: defaultMode, amount: diff });
  } else if (diff < 0) {
    const order = [
      ...rows.filter((p) => p.modeId === "due"),
      ...rows.filter((p) => p.modeId !== "due").reverse(),
    ];
    for (const row of order) {
      if (diff >= 0) break;
      const cut = Math.min(row.amount, -diff);
      row.amount = round2(row.amount - cut);
      diff = round2(diff + cut);
    }
  }
  return rows.filter((p) => p.amount > 0);
}

export interface EditPayment {
  payments: Payment[];
  refundLater: number;
  customerName: string;
  customerMobile: string;
}

/** How the whole edited bill is paid: must add up to the new total. */
export function EditPaySheet({
  order,
  total,
  open,
  onOpenChange,
  onSave,
}: {
  order: Order;
  total: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Resolves to an error message, or null when saved. */
  onSave: (p: EditPayment) => Promise<string | null>;
}) {
  const pos = usePos();
  const data = pos.data!;
  const modeName = (id: string) => data.settings.paymentModes.find((m) => m.id === id)?.name ?? id;
  const previous = useMemo(() => order.payments.filter((p) => p.amount > 0), [order.payments]);
  const collected = round2(
    previous.filter((p) => p.modeId !== "due").reduce((a, p) => a + p.amount, 0),
  );
  const oldTotal = order.totals.grand;
  const oldCash = round2(
    previous.filter((p) => p.modeId === "cash").reduce((a, p) => a + p.amount, 0),
  );
  // Paid more than the new bill even after the due is gone: the rest goes back.
  const giveBack = round2(Math.max(0, collected - total));

  const [how, setHow] = useState<"now" | "later">("now");
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (next: "now" | "later") => {
    const base =
      next === "later"
        ? previous.filter((p) => p.modeId !== "due")
        : prefillEditPayments(previous, total);
    setRows(base.map((p) => ({ id: rowSeq++, mode: p.modeId, amount: p.amount })));
    setHow(next);
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    reset("now");
    setName(order.customerName ?? "");
    setMobile(order.customerMobile ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const later = how === "later" && giveBack > 0;
  const paid = round2(rows.reduce((a, r) => a + r.amount, 0));
  const target = round2(total + (later ? giveBack : 0));
  const gap = round2(target - paid);
  const hasDue = rows.some((r) => r.mode === "due" && r.amount > 0);
  const dueInvalid = hasDue && (!name.trim() || !/^\d{10}$/.test(mobile));
  const newCash = round2(rows.filter((r) => r.mode === "cash").reduce((a, r) => a + r.amount, 0));
  const cashDelta = round2(newCash - oldCash);

  const problem =
    gap > 0
      ? `${money(gap)} still to add`
      : gap < 0
        ? `Payments are ${money(-gap)} over the new bill`
        : dueInvalid
          ? "Due needs the customer's name and 10-digit mobile."
          : null;

  const addRow = (mode: string) =>
    setRows((rs) =>
      rs.some((r) => r.mode === mode)
        ? rs
        : [...rs, { id: rowSeq++, mode, amount: Math.max(0, round2(target - paid)) }],
    );

  const save = async () => {
    setBusy(true);
    const err = await onSave({
      payments: rows.filter((r) => r.amount > 0).map((r) => ({ modeId: r.mode, amount: r.amount })),
      refundLater: later ? giveBack : 0,
      customerName: name.trim(),
      customerMobile: mobile,
    });
    setBusy(false);
    setError(err);
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={`Payment for bill ${order.billNo}`}
      description="How the whole edited bill is paid. It starts from the original payment."
      footer={
        <div className="space-y-2">
          {problem ? (
            <p className="text-sm font-semibold text-status-billed">{problem}</p>
          ) : cashDelta < 0 ? (
            <p className="rounded-md bg-status-billed-soft px-3 py-2 text-sm font-bold text-status-billed">
              Hand back {money(-cashDelta)} cash — it comes out of the cash drawer
            </p>
          ) : cashDelta > 0 ? (
            <p className="rounded-md bg-status-ready-soft px-3 py-2 text-sm font-bold text-status-ready">
              Collect {money(cashDelta)} more cash
            </p>
          ) : null}
          {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
          <Button
            className="tap h-12 w-full text-base"
            disabled={busy || Boolean(problem)}
            onClick={() => void save()}
          >
            {busy ? <Spinner /> : <CheckCircle2 className="size-5" />} Save bill {money(total)}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="space-y-1.5 rounded-lg bg-muted p-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Originally paid</span>
            <span className="num text-right">
              {previous.length
                ? previous.map((p) => `${modeName(p.modeId)} ${money(p.amount)}`).join(" + ")
                : money(0)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Old bill</span>
            <span className="num">{money(oldTotal)}</span>
          </div>
          <div className="flex justify-between gap-3 font-semibold">
            <span>New bill</span>
            <span className="num">{money(total)}</span>
          </div>
          {total !== oldTotal ? (
            <p
              className={cn(
                "flex items-center gap-1.5 pt-1 text-xs font-bold",
                total > oldTotal ? "text-status-ready" : "text-status-billed",
              )}
            >
              {total > oldTotal ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownLeft className="size-3.5" />
              )}
              {total > oldTotal
                ? `${money(round2(total - oldTotal))} more to pay`
                : `${money(round2(oldTotal - total))} less than before`}
            </p>
          ) : null}
        </div>

        {giveBack > 0 ? (
          <div className="space-y-2">
            <Label>The customer paid {money(giveBack)} more than the new bill</Label>
            <Segmented
              value={how}
              onChange={reset}
              options={[
                { id: "now" as const, label: "Refund now" },
                { id: "later" as const, label: "Refund later" },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {later
                ? "The payment stays as it was. The bill is listed under Refunds owed (Due ledger) until the money is handed back."
                : "Lower the payment below to what the customer keeps paid. Cash taken off comes out of the cash drawer."}
            </p>
          </div>
        ) : null}

        {!later ? (
          <div>
            <Label>Add payment mode</Label>
            <div className="no-scrollbar mt-1.5 flex gap-2 overflow-x-auto">
              {data.settings.paymentModes
                .filter((m) => m.active)
                .map((m) => (
                  <Chip
                    key={m.id}
                    active={rows.some((r) => r.mode === m.id)}
                    onClick={() => addRow(m.id)}
                  >
                    {rows.some((r) => r.mode === m.id) ? null : <Plus className="size-3.5" />}{" "}
                    {m.name}
                  </Chip>
                ))}
            </div>
          </div>
        ) : null}

        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-card p-3"
            >
              <span className="w-16 font-display text-sm font-bold">{modeName(r.mode)}</span>
              {later ? (
                <span className="num flex-1 text-right">{money(r.amount)}</span>
              ) : (
                <NumberField
                  value={r.amount}
                  onChange={(v) =>
                    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, amount: v } : x)))
                  }
                  className="h-11 flex-1"
                />
              )}
              {!later && rows.length > 1 ? (
                <button
                  type="button"
                  aria-label="Remove payment"
                  className="tap inline-flex items-center justify-center text-muted-foreground"
                  onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
          {later ? (
            <li className="flex items-center justify-between rounded-lg border border-dashed border-status-billed px-3 py-2.5 text-sm font-semibold text-status-billed">
              <span>Refund owed</span>
              <span className="num">− {money(giveBack)}</span>
            </li>
          ) : null}
        </ul>

        {hasDue ? (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-bold">Due — customer details</p>
            <Input
              className="tap"
              placeholder="Customer name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              className="tap"
              inputMode="numeric"
              placeholder="10-digit mobile"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>
        ) : null}
      </div>
    </ResponsiveSheet>
  );
}
