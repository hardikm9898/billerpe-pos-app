import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  BadgePercent,
  CreditCard,
  HandPlatter,
  MessageSquareText,
  Printer,
  Share2,
  Tag,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { BillReceipt } from "@/components/pos/billing/BillReceipt";
import {
  billShareText,
  DiscountSheet,
  EbillSheet,
  PromoSheet,
  ServiceChargeSheet,
  ShareSheet,
} from "@/components/pos/billing/BillSheets";
import {
  SettleSheet,
  SettleSuccess,
  type SettleResult,
} from "@/components/pos/billing/SettleSheet";
import { shareBillPdf, shareWhatsApp } from "@/components/pos/billing/share";
import { EmptyState, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { serviceIsManual } from "@/lib/pos/bill";
import { money } from "@/lib/pos/format";
import { printBillOnDevice } from "@/lib/pos/printing";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/bill/$orderId")({
  component: BillPage,
});

function BillPage() {
  const { orderId } = Route.useParams();
  const pos = usePos();
  const navigate = useNavigate();
  const data = pos.data!;
  const order = pos.orderById(orderId);
  const [sheet, setSheet] = useState<
    "discount" | "promo" | "service" | "ebill" | "share" | "settle" | null
  >(null);
  const [printing, setPrinting] = useState(false);
  const [result, setResult] = useState<SettleResult | null>(null);

  if (!order) {
    return (
      <AppShell title="Bill">
        <EmptyState
          title="Bill not found"
          body="It may have been merged into another table or removed."
          action={
            <Button asChild className="tap">
              <Link to="/orders">Go to orders</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }

  const table = pos.tableById(order.tableId);
  const canSettle = pos.can("biller", "edit");
  const editable =
    order.status === "running" || order.status === "billed" || order.status === "hold";
  const newOrderPath =
    pos.canOpen("/counter") && pos.session?.user.role === "Cashier" ? "/counter" : "/tables";
  const shareMsg = billShareText(order, data.outlet.name);
  const draftKey = order.tableId ? pos.draftKeyForTable(order.tableId) : `o.${order.id}`;
  const unsent = (pos.draft(draftKey)?.lines.length ?? 0) + order.heldLines.length;

  const print = async () => {
    setPrinting(true);
    if (order.status === "settled" || order.status === "billed") {
      // Reprint: the bill already exists on the server.
      const res = await printBillOnDevice(pos.thisDevice, order);
      void pos.act((b) => b.logReprint(order.id, "Bill"));
      setPrinting(false);
      if (res.noPrinter)
        return void toast.error("No bill printer is set up on this device (More → Printers)");
      return void (res.outcomes.every((o) => o.ok)
        ? toast.success(`Bill ${order.billNo} printed`)
        : toast.error(res.outcomes.find((o) => !o.ok)?.error ?? "Could not print"));
    }
    const r = await pos.printBill(order.id);
    setPrinting(false);
    if (!r.ok) return void toast.error(r.error ?? "Could not print");
    if (r.print?.noPrinter)
      toast.info(
        "Bill generated. This device has no bill printer — share it or print from the counter.",
      );
    else if (r.print?.outcomes.some((o) => !o.ok))
      toast.error("Bill generated but the printer did not respond. Tap Print to try again.");
    else toast.success(`Bill ${order.billNo} printed`);
  };

  if (result) {
    return (
      <AppShell title="Payment received">
        <SettleSuccess
          result={result}
          onPrint={() => void print()}
          onShare={() => setSheet("share")}
          onNew={() => void navigate({ to: newOrderPath })}
        />
        <ShareSheet
          open={sheet === "share"}
          onOpenChange={(o) => setSheet(o ? "share" : null)}
          onPdf={() => void shareBillPdf(pos.thisDevice, order)}
          onWhatsApp={() => shareWhatsApp(shareMsg, order.customerMobile)}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`Bill ${order.billNo}`}
      subtitle={
        table
          ? `${table.name} · ${order.guests} guests`
          : order.token
            ? `Token ${order.token}`
            : "Pickup"
      }
      noTabs
    >
      <div className="mx-auto max-w-xl space-y-3 pb-28">
        {unsent > 0 ? (
          <div className="rounded-lg border border-status-hold/40 bg-status-hold-soft p-3 text-sm font-semibold text-status-hold">
            {unsent} item(s) are not sent to the kitchen yet.{" "}
            <Link to="/order/$key" params={{ key: draftKey }} className="underline">
              Open the order
            </Link>
          </div>
        ) : null}
        {order.status === "settled" ? (
          <p className="rounded-md bg-status-ready-soft px-3 py-2 text-sm font-semibold text-status-ready">
            Settled · {order.settledBy}
          </p>
        ) : null}
        {order.status === "cancelled" ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm font-semibold text-muted-foreground">
            Cancelled — {order.cancelReason}
          </p>
        ) : null}

        <BillReceipt order={order} outlet={data.outlet} tableName={table?.name} />

        {editable && canSettle ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="tap" onClick={() => setSheet("discount")}>
              <BadgePercent className="size-4" />{" "}
              {order.discount && !order.promoCode ? "Edit discount" : "Discount"}
            </Button>
            <Button variant="outline" className="tap" onClick={() => setSheet("promo")}>
              <Tag className="size-4" /> {order.promoCode ?? "Promo code"}
            </Button>
            {serviceIsManual(data.settings, order.type) ? (
              <Button
                variant="outline"
                className="tap col-span-2"
                onClick={() => setSheet("service")}
              >
                <HandPlatter className="size-4" />{" "}
                {order.serviceOverride != null
                  ? `Service charge ${money(order.serviceOverride)}`
                  : "Add service charge"}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="tap"
            disabled={printing || order.status === "cancelled"}
            onClick={() => void print()}
          >
            {printing ? <Spinner /> : <Printer className="size-4" />}{" "}
            {order.status === "running" || order.status === "hold" ? "Print" : "Reprint"}
          </Button>
          <Button variant="outline" className="tap" onClick={() => setSheet("share")}>
            <Share2 className="size-4" /> Share
          </Button>
          <Button
            variant="outline"
            className="tap"
            disabled={order.status === "cancelled"}
            onClick={() => setSheet("ebill")}
          >
            <MessageSquareText className="size-4" /> E-bill
          </Button>
        </div>
      </div>

      {editable && canSettle ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Grand total</p>
              <p className="num font-display text-xl font-extrabold">{money(order.totals.grand)}</p>
            </div>
            <Button
              className="tap h-12 flex-1 text-base"
              disabled={unsent > 0}
              onClick={() => setSheet("settle")}
            >
              <CreditCard className="size-5" /> Settle payment
            </Button>
          </div>
        </div>
      ) : null}

      <DiscountSheet
        order={order}
        open={sheet === "discount"}
        onOpenChange={(o) => setSheet(o ? "discount" : null)}
      />
      <PromoSheet
        order={order}
        open={sheet === "promo"}
        onOpenChange={(o) => setSheet(o ? "promo" : null)}
      />
      <ServiceChargeSheet
        order={order}
        open={sheet === "service"}
        onOpenChange={(o) => setSheet(o ? "service" : null)}
      />
      <EbillSheet
        order={order}
        open={sheet === "ebill"}
        onOpenChange={(o) => setSheet(o ? "ebill" : null)}
      />
      <ShareSheet
        open={sheet === "share"}
        onOpenChange={(o) => setSheet(o ? "share" : null)}
        onPdf={() => void shareBillPdf(pos.thisDevice, order)}
        onWhatsApp={() => shareWhatsApp(shareMsg, order.customerMobile)}
      />
      <SettleSheet
        order={order}
        open={sheet === "settle"}
        onOpenChange={(o) => setSheet(o ? "settle" : null)}
        onSettled={(r) => {
          setSheet(null);
          setResult(r);
        }}
      />
    </AppShell>
  );
}
