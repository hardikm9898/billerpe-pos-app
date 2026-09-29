import { Link } from "@tanstack/react-router";

import { dateTime, money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import { ORDER_TYPE_LABEL, type Order, type OrderStatus } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

const statusCls: Record<OrderStatus, { label: string; cls: string }> = {
  running: { label: "Running", cls: "bg-status-running-soft text-status-running" },
  hold: { label: "Hold", cls: "bg-status-hold-soft text-status-hold" },
  billed: { label: "Bill generated", cls: "bg-status-billed-soft text-status-billed" },
  settled: { label: "Settled", cls: "bg-status-ready-soft text-status-ready" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const m = statusCls[status];
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", m.cls)}>{m.label}</span>
  );
}

/** Table name, or "#token" for a pickup order. */
export function orderBadge(order: Order, tableName?: string): string {
  if (tableName) return tableName;
  return order.token ? `#${order.token}` : "PU";
}

export function OrderRow({ order }: { order: Order }) {
  const pos = usePos();
  const table = pos.tableById(order.tableId);
  return (
    <Link
      to="/orders/$orderId"
      params={{ orderId: order.id }}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary-soft font-display text-sm font-extrabold text-primary-soft-foreground">
        {orderBadge(order, table?.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display font-bold">Bill {order.billNo}</span>
          <OrderStatusPill status={order.status} />
          {(order.dueOutstanding ?? 0) > 0 ? (
            <span className="rounded-md bg-status-hold-soft px-2 py-0.5 text-[11px] font-semibold text-status-hold">
              Due
            </span>
          ) : null}
          {order.fromQr ? (
            <span className="rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-soft-foreground">
              QR
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {dateTime(order.settledAt ?? order.createdAt)} · {ORDER_TYPE_LABEL[order.type]}
          {order.token && order.tableId ? ` · token ${order.token}` : ""}
          {order.customerMobile ? ` · ${order.customerMobile}` : ""}
        </p>
      </div>
      <span className="num shrink-0">{money(order.totals.grand)}</span>
    </Link>
  );
}
