import { VegMark } from "@/components/pos/primitives";
import { orderLines } from "@/lib/pos/bill";
import { engineLineTotal } from "@/lib/pos/billEngine";
import { dateTime, money, qty } from "@/lib/pos/format";
import { ORDER_TYPE_LABEL, type Dietary, type Order, type Outlet } from "@/lib/pos/types";

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${strong ? "font-display text-lg font-extrabold" : "text-sm"} ${muted ? "text-muted-foreground" : ""}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="num shrink-0">{value}</span>
    </div>
  );
}

interface BillLine {
  key: string;
  name: string;
  detail: string;
  qty: number;
  rate: number;
  amount: number;
  dietary: Dietary;
}

/** Identical lines from different rounds print as one line on the bill. */
export function groupedLines(order: Order): BillLine[] {
  const map = new Map<string, BillLine>();
  for (const l of orderLines(order)) {
    const detail = [l.variantName, ...l.addons.map((a) => a.name)].filter(Boolean).join(", ");
    const key = `${l.name}~${detail}~${l.price}`;
    const cur = map.get(key);
    const amount = engineLineTotal({ price: l.price, qty: l.qty, addons: l.addons });
    if (cur) {
      cur.qty = Math.round((cur.qty + l.qty) * 100) / 100;
      cur.amount = Math.round((cur.amount + amount) * 100) / 100;
    } else
      map.set(key, {
        key,
        name: l.name,
        detail,
        qty: l.qty,
        rate: l.price,
        amount,
        dietary: l.dietary,
      });
  }
  return [...map.values()];
}

/** Paper-style bill preview - the figures are the server's (the one bill engine). */
export function BillReceipt({
  order,
  outlet,
  tableName,
}: {
  order: Order;
  outlet: Outlet;
  tableName?: string | undefined;
}) {
  const t = order.totals;
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-soft">
      <div className="border-b border-dashed border-border pb-3 text-center">
        <p className="font-display text-lg font-extrabold">
          <span translate="no">{outlet.name}</span>
        </p>
        <p className="text-xs text-muted-foreground">{outlet.address}</p>
        {outlet.gstin ? (
          <p className="text-xs text-muted-foreground">GSTIN {outlet.gstin}</p>
        ) : null}
        {outlet.fssai ? (
          <p className="text-xs text-muted-foreground">FSSAI {outlet.fssai}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-1 border-b border-dashed border-border py-3 text-xs">
        <span className="text-muted-foreground">Bill no.</span>
        <span className="num text-right">{order.billNo}</span>
        <span className="text-muted-foreground">{order.type === "dinin" ? "Table" : "Order"}</span>
        <span className="text-right font-semibold">
          {order.type === "dinin" ? (tableName ?? "—") : ORDER_TYPE_LABEL[order.type]}
        </span>
        {order.token ? (
          <>
            <span className="text-muted-foreground">Token</span>
            <span className="text-right font-semibold">{order.token}</span>
          </>
        ) : null}
        <span className="text-muted-foreground">Date</span>
        {/* Bill prints the actual date and time (owner decision), not the business day. */}
        <span className="text-right font-semibold">
          {dateTime(order.billPrintedAt ?? new Date())}
        </span>
        {order.customerName ? (
          <>
            <span className="text-muted-foreground">Customer</span>
            <span className="text-right font-semibold">
              {order.customerName}
              {order.customerMobile ? ` · ${order.customerMobile}` : ""}
            </span>
          </>
        ) : null}
      </div>

      <ul className="space-y-2 border-b border-dashed border-border py-3">
        {groupedLines(order).map((l) => (
          <li key={l.key} className="flex items-start gap-2 text-sm">
            <VegMark type={l.dietary} className="mt-1" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">
                <span translate="no">{l.name}</span>
              </p>
              {l.detail ? <p className="text-xs text-muted-foreground">{l.detail}</p> : null}
              <p className="num text-xs text-muted-foreground">
                {qty(l.qty)} × {money(l.rate)}
              </p>
            </div>
            <span className="num">{money(l.amount)}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-1.5 pt-3">
        <Row label="Subtotal" value={money(t.subtotal)} />
        {t.discount > 0 ? (
          <Row
            label={order.discount?.reason ?? "Discount"}
            value={`− ${money(t.discount)}`}
            muted
          />
        ) : null}
        {t.service > 0 ? <Row label="Service charge" value={money(t.service)} muted /> : null}
        {t.packaging > 0 ? <Row label="Packaging" value={money(t.packaging)} muted /> : null}
        {t.taxLines.map((x) => (
          <Row
            key={x.id}
            label={`${x.name}${x.type === "pr" ? ` ${x.rate}%` : ""}`}
            value={money(x.amount)}
            muted
          />
        ))}
        {t.roundOff ? (
          <Row
            label="Round-off"
            value={`${t.roundOff < 0 ? "− " : ""}${money(Math.abs(t.roundOff))}`}
            muted
          />
        ) : null}
        <div className="border-t border-border pt-2">
          <Row label="Grand total" value={money(t.grand)} strong />
        </div>
      </div>
    </div>
  );
}
