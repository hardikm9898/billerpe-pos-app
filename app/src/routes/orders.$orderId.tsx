import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Ban, Pencil, Printer, ReceiptText, UtensilsCrossed } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { groupedLines } from "@/components/pos/billing/BillReceipt";
import { RefundSheet } from "@/components/pos/billing/RefundSheet";
import { OrderStatusPill } from "@/components/pos/OrderRow";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { EmptyState, SectionTitle, Spinner, VegMark } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { dateTime, money, qty } from "@/lib/pos/format";
import { printBillOnDevice } from "@/lib/pos/printing";
import { backend, usePos } from "@/lib/pos/store";
import type { Order } from "@/lib/pos/types";
import { ORDER_TYPE_LABEL } from "@/lib/pos/types";

export const Route = createFileRoute("/orders/$orderId")({
  component: OrderDetail,
});

function OrderDetail() {
  const { orderId } = Route.useParams();
  const pos = usePos();
  const navigate = useNavigate();
  const data = pos.data!;
  const loaded = pos.orderById(orderId);
  // Older orders (from the Orders list pages) are not in the loaded data: ask the server.
  const [fetched, setFetched] = useState<Order | null | undefined>(undefined);
  useEffect(() => {
    if (loaded) return;
    let live = true;
    backend.getOrder(orderId).then(
      (o) => live && setFetched(o),
      () => live && setFetched(null),
    );
    return () => {
      live = false;
    };
  }, [orderId, loaded, pos.data]);
  const order = loaded ?? fetched ?? undefined;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);

  if (!order) {
    return (
      <AppShell title="Order">
        {fetched === undefined && !loaded ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <EmptyState title="Order not found" body="It may have been merged into another table." />
        )}
      </AppShell>
    );
  }

  const table = pos.tableById(order.tableId);
  const open = order.status === "running" || order.status === "hold" || order.status === "billed";
  const canBill = pos.can("biller", "edit");
  const modeName = (id: string) => data.settings.paymentModes.find((m) => m.id === id)?.name ?? id;
  const orderKey = order.tableId ? pos.draftKeyForTable(order.tableId) : `o.${order.id}`;

  const run = async (
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string | undefined }>,
    msg: string,
  ) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.ok) toast.success(msg);
    else toast.error(res.error ?? "Something went wrong");
    return res.ok;
  };

  return (
    <AppShell
      title={`Bill ${order.billNo}`}
      subtitle={
        table
          ? `${table.name} · ${order.guests} guests`
          : `${ORDER_TYPE_LABEL[order.type]}${order.token ? ` · token ${order.token}` : ""}`
      }
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-soft">
          <div className="min-w-0">
            <OrderStatusPill status={order.status} />
            <p className="mt-1 text-xs text-muted-foreground">
              {order.captainName}
              {order.customerName ? ` · ${order.customerName}` : ""}
              {order.customerMobile ? ` · ${order.customerMobile}` : ""}
            </p>
            {order.cancelReason ? (
              <p className="mt-1 text-xs font-semibold text-destructive">
                Reason: {order.cancelReason}
              </p>
            ) : null}
          </div>
          <p className="num shrink-0 font-display text-2xl font-extrabold">
            {money(order.totals.grand)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {open && pos.can("biller") ? (
            <Button
              variant="outline"
              className="tap"
              onClick={() => {
                pos.openDraft(orderKey, {
                  type: order.type,
                  tableId: order.tableId,
                  orderId: order.id,
                });
                void navigate({ to: "/order/$key", params: { key: orderKey } });
              }}
            >
              <UtensilsCrossed className="size-4" /> Open order
            </Button>
          ) : null}
          {canBill && open ? (
            <Button className="tap" asChild>
              <Link to="/bill/$orderId" params={{ orderId: order.id }}>
                <ReceiptText className="size-4" /> Bill & settle
              </Link>
            </Button>
          ) : null}
          {canBill && (order.billPrintedAt || order.status === "settled") ? (
            <Button
              variant="outline"
              className="tap"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  "rb",
                  async () => {
                    const r = await printBillOnDevice(pos.thisDevice, order);
                    void pos.act((b) => b.logReprint(order.id, "Bill"));
                    if (r.noPrinter) return { ok: false, error: "No bill printer on this device" };
                    return {
                      ok: r.outcomes.every((o) => o.ok),
                      error: r.outcomes.find((o) => !o.ok)?.error,
                    };
                  },
                  `Bill ${order.billNo} reprinted`,
                )
              }
            >
              {busy === "rb" ? <Spinner /> : <Printer className="size-4" />} Reprint bill
            </Button>
          ) : null}
          {order.status === "settled" && pos.canSpecial("orders.reopenSettled") ? (
            <Button variant="outline" className="tap" asChild>
              <Link to="/edit-bill/$orderId" params={{ orderId: order.id }}>
                <Pencil className="size-4" /> Edit settled bill
              </Link>
            </Button>
          ) : null}
          {open && pos.canSpecial("orders.deleteOrder") ? (
            <Button
              variant="outline"
              className="tap text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              <Ban className="size-4" /> Cancel
            </Button>
          ) : null}
        </div>

        <section className="space-y-2">
          <SectionTitle>Items</SectionTitle>
          {groupedLines(order).length === 0 ? (
            <p className="text-sm text-muted-foreground">No items.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card px-3">
              {groupedLines(order).map((l) => (
                <li key={l.key} className="flex items-center gap-2 py-2.5 text-sm">
                  <VegMark type={l.dietary} />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">
                      <span translate="no">{l.name}</span>
                    </span>
                    {l.detail ? <span className="text-muted-foreground"> · {l.detail}</span> : null}
                  </span>
                  <span className="num text-muted-foreground">{qty(l.qty)} ×</span>
                  <span className="num w-20 text-right">{money(l.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {order.heldLines.length ? (
            <p className="text-xs font-semibold text-status-hold">
              {order.heldLines.length} item(s) held — not sent to the kitchen.
            </p>
          ) : null}
        </section>

        <section className="space-y-2">
          <SectionTitle>KOT rounds</SectionTitle>
          {order.kots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No KOT sent yet.</p>
          ) : (
            order.kots.map((k) => (
              <div
                key={k.kotNo}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold">
                    KOT #{k.kotNo} · Round {k.round}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {dateTime(k.firedAt)} · {k.firedByName} ·{" "}
                    {k.lines.map((l) => `${qty(l.qty)} ${l.name}`).join(", ")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="tap"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      `k${k.kotNo}`,
                      async () => {
                        const r = await pos.reprintKot(order.id, k.kotNo);
                        return {
                          ok: r.ok,
                          error: r.noPrinter
                            ? "No KOT printer on this device"
                            : r.outcomes.find((o) => !o.ok)?.error,
                        };
                      },
                      `KOT #${k.kotNo} reprinted`,
                    )
                  }
                >
                  {busy === `k${k.kotNo}` ? <Spinner /> : <Printer className="size-4" />} Reprint
                </Button>
              </div>
            ))
          )}
        </section>

        {order.payments.length ? (
          <section className="space-y-2">
            <SectionTitle>Payments</SectionTitle>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card px-3">
              {order.payments.map((p, i) => (
                <li key={i} className="flex justify-between py-2.5 text-sm">
                  <span className="font-semibold">{modeName(p.modeId)}</span>
                  <span className="num">{money(p.amount)}</span>
                </li>
              ))}
              {order.changeReturned ? (
                <li className="flex justify-between py-2.5 text-sm text-muted-foreground">
                  <span>Change returned</span>
                  <span className="num">{money(order.changeReturned)}</span>
                </li>
              ) : null}
              {(order.refundOwed ?? 0) > 0 ? (
                <li className="flex items-center justify-between gap-2 py-2.5 text-sm font-semibold text-status-billed">
                  <span>Refund owed</span>
                  <span className="flex items-center gap-2">
                    <span className="num">{money(order.refundOwed!)}</span>
                    {pos.can("ops-ledger", "edit") ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="tap"
                        onClick={() => setRefundOpen(true)}
                      >
                        Hand back
                      </Button>
                    ) : null}
                  </span>
                </li>
              ) : null}
              {(order.dueOutstanding ?? 0) > 0 ? (
                <li className="flex justify-between py-2.5 text-sm font-semibold text-status-hold">
                  <span>Still due</span>
                  <span className="num">{money(order.dueOutstanding!)}</span>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        <section className="space-y-2">
          <SectionTitle>Timeline</SectionTitle>
          <ol className="relative ml-2 space-y-3 border-l border-border pl-4">
            {order.timeline.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" />
                <p className="text-sm font-semibold">{e.label}</p>
                <p className="text-xs text-muted-foreground">
                  {dateTime(e.at)} · {e.by}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <RefundSheet
        refund={
          refundOpen && order.refundOwed
            ? {
                orderId: order.id,
                billNo: order.billNo,
                amount: order.refundOwed,
                customerName: order.customerName,
              }
            : null
        }
        onClose={() => setRefundOpen(false)}
      />

      <ResponsiveSheet
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel bill ${order.billNo}?`}
        description="A reason is required and is saved in the audit log."
        footer={
          <Button
            variant="destructive"
            className="tap w-full"
            disabled={!reason.trim() || busy !== null}
            onClick={async () => {
              const ok = await run(
                "cancel",
                () => pos.act((b) => b.cancelOrder(order.id, reason)),
                "Order cancelled",
              );
              if (ok) setCancelOpen(false);
            }}
          >
            Cancel order
          </Button>
        }
      >
        <Textarea
          className="my-2"
          placeholder="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </ResponsiveSheet>
    </AppShell>
  );
}
