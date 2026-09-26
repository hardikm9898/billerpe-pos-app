import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BadgePercent, CreditCard, MessageSquareText, Printer, Share2, Tag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { BillReceipt } from "@/components/pos/billing/BillReceipt";
import { DiscountSheet, EbillSheet, PromoSheet, ShareSheet } from "@/components/pos/billing/BillSheets";
import { SettleSheet, SettleSuccess, type SettleResult } from "@/components/pos/billing/SettleSheet";
import { shareWhatsApp } from "@/components/pos/billing/share";
import { EmptyState, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { money } from "@/lib/pos/format";
import { can } from "@/lib/pos/permissions";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/bill/$orderId")({
  head: () => ({
    meta: [
      { title: "Bill preview — BillerPe POS" },
      { name: "description", content: "Preview the bill, apply discounts and promo codes, print, share and settle payment." },
      { property: "og:title", content: "Bill preview — BillerPe POS" },
      { property: "og:description", content: "Preview the bill, apply discounts and promo codes, print, share and settle payment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BillPage,
});

function BillPage() {
  const { orderId } = Route.useParams();
  const pos = usePos();
  const navigate = useNavigate();
  const order = pos.orderById(orderId);
  const [sheet, setSheet] = useState<"discount" | "promo" | "ebill" | "share" | "settle" | null>(null);
  const [printing, setPrinting] = useState(false);
  const [result, setResult] = useState<SettleResult | null>(null);

  const back = (
    <Link to="/orders" aria-label="Back" className="tap -ml-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
      <ArrowLeft className="size-5" />
    </Link>
  );

  if (!order) {
    return (
      <AppShell title="Bill" topBarLeft={back}>
        <EmptyState title="Bill not found" body="It may have been merged or cancelled." action={<Button asChild><Link to="/orders">Go to orders</Link></Button>} />
      </AppShell>
    );
  }

  const bill = pos.billFor(order);
  const table = order.tableId ? pos.tableById(order.tableId) : undefined;
  const canSettle = can(pos.permissions, "billing", "create");
  const canDiscount = can(pos.permissions, "billing", "edit");
  const editable = order.status !== "settled" && order.status !== "cancelled";
  const newOrderPath = pos.user?.role === "cashier" ? "/counter" : "/tables";
  const shareMsg = `${pos.outlet.restaurant} — Bill ${order.code}\nTotal ${money(bill.grandTotal)}\nThank you for dining with us!`;

  const print = async () => {
    setPrinting(true);
    const res = order.status === "settled" ? await pos.reprintBill(order.id) : await pos.printBill(order.id);
    setPrinting(false);
    if (res.ok) toast.success(`Bill ${order.code} printed`);
    else toast.error(res.error ?? "Could not print");
  };

  if (result) {
    return (
      <AppShell title="Payment received" topBarLeft={back}>
        <SettleSuccess
          result={result}
          onPrint={() => void print()}
          onShare={() => setSheet("share")}
          onNew={() => void navigate({ to: newOrderPath })}
        />
        <ShareSheet open={sheet === "share"} onOpenChange={(o) => setSheet(o ? "share" : null)} onPdf={() => toast.success("PDF ready to share")} onWhatsApp={() => shareWhatsApp(shareMsg, order.customerMobile)} />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`Bill ${order.code}`}
      subtitle={table ? `${table.name} · ${order.guests} guests` : `Token ${order.tokenNo ?? "—"}`}
      topBarLeft={back}
      noTabs
    >
      <div className="mx-auto max-w-xl space-y-3 pb-28">
        {order.draftLines.length > 0 ? (
          <div className="rounded-lg border border-status-hold/40 bg-status-hold-soft p-3 text-sm font-semibold text-status-hold">
            {order.draftLines.length} item(s) not sent to the kitchen yet.{" "}
            <Link to="/order/$orderId" params={{ orderId: order.id }} className="underline">Send KOT</Link>
          </div>
        ) : null}

        <BillReceipt order={order} bill={bill} outlet={pos.outlet} tableName={table?.name} />

        {editable && canDiscount ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="tap" onClick={() => setSheet("discount")}>
              <BadgePercent className="size-4" /> {order.discount ? "Edit discount" : "Apply discount"}
            </Button>
            <Button variant="outline" className="tap" onClick={() => setSheet("promo")}>
              <Tag className="size-4" /> {order.promoCode ?? "Promo code"}
            </Button>
          </div>
        ) : null}

        {editable && order.type === "dine-in" && canDiscount ? (
          <label className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold">
            Service charge 5%
            <Switch checked={order.serviceChargeOn !== false} onCheckedChange={(v) => void pos.setServiceCharge(order.id, v)} />
          </label>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="tap" disabled={printing} onClick={() => void print()}>
            {printing ? <Spinner /> : <Printer className="size-4" />} Print
          </Button>
          <Button variant="outline" className="tap" onClick={() => setSheet("share")}>
            <Share2 className="size-4" /> Share
          </Button>
          <Button variant="outline" className="tap" onClick={() => setSheet("ebill")}>
            <MessageSquareText className="size-4" /> E-bill
          </Button>
        </div>
      </div>

      {editable && canSettle ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Grand total</p>
              <p className="num font-display text-xl font-extrabold">{money(bill.grandTotal)}</p>
            </div>
            <Button className="tap h-12 flex-1 text-base" disabled={order.rounds.length === 0} onClick={() => setSheet("settle")}>
              <CreditCard className="size-5" /> Settle payment
            </Button>
          </div>
        </div>
      ) : null}

      <DiscountSheet order={order} open={sheet === "discount"} onOpenChange={(o) => setSheet(o ? "discount" : null)} />
      <PromoSheet order={order} open={sheet === "promo"} onOpenChange={(o) => setSheet(o ? "promo" : null)} />
      <EbillSheet order={order} open={sheet === "ebill"} onOpenChange={(o) => setSheet(o ? "ebill" : null)} />
      <ShareSheet open={sheet === "share"} onOpenChange={(o) => setSheet(o ? "share" : null)} onPdf={() => toast.success("PDF ready to share")} onWhatsApp={() => shareWhatsApp(shareMsg, order.customerMobile)} />
      <SettleSheet order={order} open={sheet === "settle"} onOpenChange={(o) => setSheet(o ? "settle" : null)} onSettled={(r) => { setSheet(null); setResult(r); }} />
    </AppShell>
  );
}
