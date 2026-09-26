import { CheckCircle2, Maximize2, Plus, Printer, QrCode, Share2, Trash2, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";

import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upiLink } from "@/lib/pos/billing";
import { money, round2 } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type { Order, PaymentModeId } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

interface Row {
  id: number;
  mode: PaymentModeId;
  amount: number;
  /** UPI rows must be confirmed by the cashier */
  confirmed: boolean;
}

let rowSeq = 1;

export interface SettleResult {
  code: string;
  change: number;
  total: number;
}

export function SettleSheet({
  order,
  open,
  onOpenChange,
  onSettled,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSettled: (r: SettleResult) => void;
}) {
  const pos = usePos();
  const bill = pos.billFor(order);
  const total = bill.grandTotal;
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [qrRow, setQrRow] = useState<Row | null>(null);
  const [customerSide, setCustomerSide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows([{ id: rowSeq++, mode: "cash", amount: total, confirmed: true }]);
      setName(order.customerName ?? "");
      setMobile(order.customerMobile ?? "");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cash = round2(rows.filter((r) => r.mode === "cash").reduce((a, r) => a + r.amount, 0));
  const nonCash = round2(rows.filter((r) => r.mode !== "cash").reduce((a, r) => a + r.amount, 0));
  const paid = round2(cash + nonCash);
  const remaining = round2(Math.max(0, total - paid));
  const change = round2(Math.max(0, paid - total));
  const nonCashOver = nonCash > total;
  const changeWithoutCash = change > 0 && cash < change;
  const hasDue = rows.some((r) => r.mode === "due" && r.amount > 0);
  const dueInvalid = hasDue && (!name.trim() || !/^\d{10}$/.test(mobile));
  const unconfirmedUpi = rows.some((r) => r.mode === "upi" && r.amount > 0 && !r.confirmed);

  const problem = useMemo(() => {
    if (nonCashOver) return "Only cash can be more than the bill. Reduce the UPI / Card / Due amount.";
    if (changeWithoutCash) return "Only cash may exceed the bill.";
    if (remaining > 0) return `${money(remaining)} still to collect`;
    if (dueInvalid) return "Due needs the customer's name and 10-digit mobile.";
    if (unconfirmedUpi) return "Tap “Mark as paid” once the UPI payment arrives.";
    return null;
  }, [nonCashOver, changeWithoutCash, remaining, dueInvalid, unconfirmedUpi]);

  const addRow = (mode: PaymentModeId) => {
    setRows((rs) => {
      const existing = rs.find((r) => r.mode === mode);
      if (existing) return rs;
      const left = round2(Math.max(0, total - rs.reduce((a, r) => a + r.amount, 0)));
      // single cash row covering everything: move the balance to the new mode
      if (rs.length === 1 && rs[0]!.mode === "cash" && rs[0]!.amount === total) {
        return [{ id: rowSeq++, mode, amount: total, confirmed: mode !== "upi" }];
      }
      return [...rs, { id: rowSeq++, mode, amount: left, confirmed: mode !== "upi" }];
    });
  };

  const updateRow = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch, ...(patch.amount !== undefined && r.mode === "upi" ? { confirmed: false } : {}) } : r)));

  const settle = async () => {
    setBusy(true);
    const res = await pos.settleBill(order.id, {
      payments: rows.map((r) => ({ mode: r.mode, amount: r.amount })),
      customerName: name,
      customerMobile: mobile,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not settle");
      return;
    }
    onSettled({ code: res.code ?? order.code, change: res.change ?? 0, total });
  };

  const upiUrl = qrRow ? upiLink(pos.outlet.upiId, pos.outlet.restaurant, qrRow.amount, `Bill ${order.code}`) : "";

  return (
    <>
      <ResponsiveSheet
        open={open}
        onOpenChange={onOpenChange}
        title={`Settle ${order.code}`}
        description="Split across modes if the customer pays in parts."
        footer={
          <div className="space-y-2">
            {problem ? (
              <p className={cn("text-sm font-semibold", nonCashOver || changeWithoutCash ? "text-destructive" : "text-status-hold")}>{problem}</p>
            ) : change > 0 ? (
              <p className="rounded-md bg-status-ready-soft px-3 py-2 text-sm font-bold text-status-ready">Return change {money(change)}</p>
            ) : null}
            {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
            <Button className="tap h-12 w-full text-base" disabled={busy || Boolean(problem)} onClick={() => void settle()}>
              {busy ? <Spinner /> : <CheckCircle2 className="size-5" />} Settle {money(total)}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <div className="flex items-end justify-between rounded-lg bg-primary-soft p-3 text-primary-soft-foreground">
            <span className="text-sm font-semibold">Bill total</span>
            <span className="num font-display text-2xl font-extrabold">{money(total)}</span>
          </div>

          <div>
            <Label>Add payment mode</Label>
            <div className="no-scrollbar mt-1.5 flex gap-2 overflow-x-auto">
              {pos.billingSettings.paymentModes.filter((m) => !m.disabled).map((m) => (
                <Chip key={m.id} active={rows.some((r) => r.mode === m.id)} onClick={() => addRow(m.id)}>
                  {rows.some((r) => r.mode === m.id) ? null : <Plus className="size-3.5" />} {m.label}
                </Chip>
              ))}
            </div>
          </div>

          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="w-16 font-display text-sm font-bold">{pos.modeLabel(r.mode)}</span>
                  <NumberField value={r.amount} onChange={(v) => updateRow(r.id, { amount: v })} className="h-11 flex-1" />
                  {rows.length > 1 ? (
                    <button type="button" aria-label="Remove payment" className="tap inline-flex items-center justify-center text-muted-foreground" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
                {r.mode === "upi" && r.amount > 0 ? (
                  <div className="mt-2 flex gap-2">
                    <Button variant="outline" className="tap flex-1" onClick={() => setQrRow(r)}>
                      <QrCode className="size-4" /> Show UPI QR
                    </Button>
                    {r.confirmed ? (
                      <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-status-ready-soft text-sm font-bold text-status-ready">
                        <CheckCircle2 className="size-4" /> Paid
                      </span>
                    ) : (
                      <Button className="tap flex-1" onClick={() => updateRow(r.id, { confirmed: true })}>Mark as paid</Button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md bg-muted p-2"><p className="text-muted-foreground">Paid</p><p className="num text-sm">{money(paid)}</p></div>
            <div className="rounded-md bg-muted p-2"><p className="text-muted-foreground">Remaining</p><p className={cn("num text-sm", remaining > 0 && "text-status-hold")}>{money(remaining)}</p></div>
            <div className="rounded-md bg-muted p-2"><p className="text-muted-foreground">Change</p><p className={cn("num text-sm", change > 0 && "text-status-ready")}>{money(change)}</p></div>
          </div>

          {hasDue ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-bold">Due — customer details</p>
              <Input className="tap" placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input className="tap" inputMode="numeric" placeholder="10-digit mobile" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} />
            </div>
          ) : null}
        </div>
      </ResponsiveSheet>

      <ResponsiveSheet open={Boolean(qrRow) && !customerSide} onOpenChange={(o) => !o && setQrRow(null)} title="Scan to pay with any UPI app">
        {qrRow ? (
          <div className="flex flex-col items-center gap-3 py-3 text-center">
            <div className="rounded-lg border border-border bg-white p-4">
              <QRCodeSVG value={upiUrl} size={220} level="M" />
            </div>
            <p className="num font-display text-3xl font-extrabold">{money(qrRow.amount)}</p>
            <p className="text-sm text-muted-foreground">{pos.outlet.upiId} · Bill {order.code}</p>
            <div className="grid w-full grid-cols-2 gap-2">
              <Button variant="outline" className="tap" onClick={() => setCustomerSide(true)}>
                <Maximize2 className="size-4" /> Show on customer side
              </Button>
              <Button
                className="tap"
                onClick={() => {
                  updateRow(qrRow.id, { confirmed: true });
                  setQrRow(null);
                }}
              >
                <CheckCircle2 className="size-4" /> Mark as paid
              </Button>
            </div>
          </div>
        ) : null}
      </ResponsiveSheet>

      {customerSide && qrRow ? (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-background p-6 text-center">
          <button type="button" aria-label="Close customer view" onClick={() => setCustomerSide(false)} className="tap absolute right-4 top-4 inline-flex items-center justify-center rounded-md text-muted-foreground">
            <X className="size-6" />
          </button>
          <p className="font-display text-xl font-bold">{pos.outlet.restaurant}</p>
          <div className="rounded-xl border border-border bg-white p-5 shadow-soft">
            <QRCodeSVG value={upiUrl} size={300} level="M" />
          </div>
          <p className="num font-display text-5xl font-extrabold">{money(qrRow.amount)}</p>
          <p className="text-base text-muted-foreground">Scan with any UPI app · {pos.outlet.upiId}</p>
        </div>
      ) : null}
    </>
  );
}

export function SettleSuccess({
  result,
  onPrint,
  onShare,
  onNew,
}: {
  result: SettleResult;
  onPrint: () => void;
  onShare: () => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-status-ready-soft text-status-ready">
        <CheckCircle2 className="size-9" />
      </div>
      <h2 className="font-display text-2xl font-extrabold">Bill #{result.code} settled</h2>
      <p className="num text-lg">{money(result.total)}</p>
      {result.change > 0 ? (
        <p className="rounded-md bg-status-ready-soft px-3 py-1.5 text-sm font-bold text-status-ready">Return change {money(result.change)}</p>
      ) : null}
      <div className="mt-2 grid w-full max-w-sm grid-cols-3 gap-2">
        <Button variant="outline" className="tap" onClick={onPrint}><Printer className="size-4" /> Print</Button>
        <Button variant="outline" className="tap" onClick={onShare}><Share2 className="size-4" /> Share</Button>
        <Button className="tap" onClick={onNew}><Plus className="size-4" /> New order</Button>
      </div>
    </div>
  );
}
