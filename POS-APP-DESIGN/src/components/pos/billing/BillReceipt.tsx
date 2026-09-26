import type { Bill } from "@/lib/pos/billing";
import { dateTime, money, qty } from "@/lib/pos/format";
import type { Order, Outlet } from "@/lib/pos/types";
import { VegMark } from "@/components/pos/primitives";

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-display text-lg font-extrabold" : "text-sm"} ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

/** Paper-style bill preview. */
export function BillReceipt({
  order,
  bill,
  outlet,
  tableName,
}: {
  order: Order;
  bill: Bill;
  outlet: Outlet;
  tableName?: string | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="border-b border-dashed border-border pb-3 text-center">
        <p className="font-display text-lg font-extrabold">{outlet.restaurant}</p>
        <p className="text-xs text-muted-foreground">{outlet.name} · {outlet.address}</p>
        <p className="text-xs text-muted-foreground">GSTIN {outlet.gstin}</p>
      </div>

      <div className="grid grid-cols-2 gap-1 border-b border-dashed border-border py-3 text-xs">
        <span className="text-muted-foreground">Bill no.</span>
        <span className="num text-right">{order.code}</span>
        <span className="text-muted-foreground">{order.type === "dine-in" ? "Table" : "Token"}</span>
        <span className="text-right font-semibold">
          {order.type === "dine-in" ? tableName ?? "—" : `${order.tokenNo ?? "—"} · ${order.type === "delivery" ? "Delivery" : "Takeaway"}`}
        </span>
        <span className="text-muted-foreground">Date</span>
        <span className="text-right font-semibold">{dateTime(order.billPrintedAt ?? new Date())}</span>
        {order.customerName ? (
          <>
            <span className="text-muted-foreground">Customer</span>
            <span className="text-right font-semibold">{order.customerName}{order.customerMobile ? ` · ${order.customerMobile}` : ""}</span>
          </>
        ) : null}
      </div>

      <ul className="space-y-2 border-b border-dashed border-border py-3">
        {bill.lines.map((l) => (
          <li key={l.key} className="flex items-start gap-2 text-sm">
            <VegMark type={l.vegType} className="mt-1" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{l.name}</p>
              {l.detail ? <p className="text-xs text-muted-foreground">{l.detail}</p> : null}
              <p className="num text-xs text-muted-foreground">{qty(l.quantity)} × {money(l.rate)}</p>
            </div>
            <span className="num">{money(l.amount)}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-1.5 pt-3">
        <Row label="Subtotal" value={money(bill.subtotal)} />
        {bill.discount > 0 ? <Row label={bill.discountLabel} value={`− ${money(bill.discount)}`} muted /> : null}
        {bill.promo > 0 ? <Row label={bill.promoLabel} value={`− ${money(bill.promo)}`} muted /> : null}
        {bill.serviceCharge > 0 ? <Row label="Service charge 5%" value={money(bill.serviceCharge)} muted /> : null}
        {bill.packaging > 0 ? <Row label="Packaging" value={money(bill.packaging)} muted /> : null}
        {bill.delivery > 0 ? <Row label="Delivery charge" value={money(bill.delivery)} muted /> : null}
        <Row label="CGST 2.5%" value={money(bill.cgst)} muted />
        <Row label="SGST 2.5%" value={money(bill.sgst)} muted />
        <Row label="Round-off" value={`${bill.roundOff < 0 ? "− " : ""}${money(Math.abs(bill.roundOff))}`} muted />
        <div className="border-t border-border pt-2">
          <Row label="Grand total" value={money(bill.grandTotal)} strong />
        </div>
      </div>
    </div>
  );
}
