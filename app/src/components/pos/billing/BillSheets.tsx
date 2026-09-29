import { FileText, MessageSquareText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type { Order, OrderDiscount } from "@/lib/pos/types";

const reasons = ["Regular guest", "Food delay", "Staff meal", "Complaint", "Owner's guest"];

/** Discount (flat or %) with a reason. Allowed by permission only (owner decision: no limits, no PIN). */
export function DiscountSheet({
  order,
  open,
  onOpenChange,
  local,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Editing a settled bill: the discount stays on the screen until the bill is saved. */
  local?:
    | {
        subtotal: number;
        discount: OrderDiscount | null;
        onChange: (d: OrderDiscount | null) => void;
      }
    | undefined;
}) {
  const pos = usePos();
  const [type, setType] = useState<"fix" | "pr">("pr");
  const [value, setValue] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      const manual = local
        ? (local.discount ?? undefined)
        : order.discount && !order.promoCode
          ? order.discount
          : undefined;
      setType(manual?.type ?? "pr");
      setValue(manual?.value ?? 0);
      setReason(manual?.reason ?? "");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order.discount, order.promoCode]);

  const subtotal = local ? local.subtotal : order.totals.subtotal;
  const amount =
    type === "fix" ? Math.min(value, subtotal) : (subtotal * Math.min(value, 100)) / 100;
  const problem = !(value > 0)
    ? "Enter a discount"
    : type === "pr" && value > 100
      ? "A discount cannot be above 100%"
      : type === "fix" && value > subtotal
        ? "A discount cannot be more than the bill"
        : !reason.trim()
          ? "Pick or type a reason"
          : null;

  const apply = async () => {
    if (local) {
      local.onChange({ type, value, reason: reason.trim() });
      onOpenChange(false);
      return;
    }
    setBusy(true);
    const r = await pos.act((b) => b.setDiscount(order.id, { type, value, reason }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success("Discount applied");
    onOpenChange(false);
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Apply discount"
      description={
        order.promoCode && !local
          ? `Replaces promo ${order.promoCode} — one discount per bill.`
          : `On subtotal ${money(subtotal)}`
      }
      footer={
        <div className="flex gap-2">
          {(local ? local.discount : order.discount) ? (
            <Button
              variant="outline"
              className="tap"
              onClick={async () => {
                if (local) {
                  local.onChange(null);
                  onOpenChange(false);
                  return;
                }
                const r = await pos.act((b) => b.setDiscount(order.id, null));
                if (!r.ok) return void toast.error(r.error);
                onOpenChange(false);
              }}
            >
              Remove
            </Button>
          ) : null}
          <Button
            className="tap flex-1"
            disabled={busy || Boolean(problem)}
            onClick={() => void apply()}
          >
            {busy ? <Spinner /> : null} {problem ?? `Apply − ${money(amount)}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-2">
          <Chip active={type === "pr"} onClick={() => setType("pr")} className="justify-center">
            Percent %
          </Chip>
          <Chip active={type === "fix"} onClick={() => setType("fix")} className="justify-center">
            Flat ₹
          </Chip>
        </div>
        <div>
          <Label htmlFor="disc">{type === "pr" ? "Discount %" : "Discount ₹"}</Label>
          <NumberField id="disc" value={value} onChange={setValue} className="mt-1.5" />
        </div>
        <div>
          <Label>Reason</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {reasons.map((r) => (
              <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
                {r}
              </Chip>
            ))}
          </div>
          <Input
            className="tap mt-2"
            placeholder="Or type a reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
      </div>
    </ResponsiveSheet>
  );
}

/** Promo codes: the order's one discount, carrying the code (same as the Web POS). */
export function PromoSheet({
  order,
  open,
  onOpenChange,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const pos = usePos();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const promos = pos.data!.settings.promoCodes.filter((p) => p.active);
  const apply = async (c: string | null) => {
    setBusy(true);
    const r = await pos.act((b) => b.applyPromo(order.id, c));
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(c ? `Promo ${c.toUpperCase()} applied` : "Promo removed");
    onOpenChange(false);
  };
  useEffect(() => {
    if (open) setCode("");
  }, [open]);
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Promo code"
      description={
        order.discount && !order.promoCode
          ? "Replaces the manual discount — one discount per bill."
          : undefined
      }
      footer={
        <Button
          className="tap w-full"
          disabled={busy || !code.trim()}
          onClick={() => void apply(code)}
        >
          {busy ? <Spinner /> : null} Apply code
        </Button>
      }
    >
      <div className="space-y-3 py-2">
        {order.promoCode ? (
          <div className="flex items-center justify-between rounded-md bg-status-ready-soft px-3 py-2 text-sm font-semibold text-status-ready">
            {order.promoCode} applied
            <button
              type="button"
              aria-label="Remove promo"
              className="tap inline-flex items-center justify-center"
              onClick={() => void apply(null)}
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}
        <Input
          className="tap uppercase"
          placeholder="Type a code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        {promos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No promo codes are active. The owner can add them in Settings.
          </p>
        ) : (
          promos.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => void apply(p.code)}
              className="tap flex w-full items-center justify-between rounded-lg border border-border px-3 text-left hover:border-primary"
            >
              <span className="font-display font-bold">{p.code}</span>
              <span className="text-xs text-muted-foreground">
                <span translate="no">{p.name}</span> ·{" "}
                {p.type === "pr" ? `${p.value}% off` : `${money(p.value)} off`}
              </span>
            </button>
          ))
        )}
      </div>
    </ResponsiveSheet>
  );
}

/** Manual service charge - only when the outlet's service charge is not automatic for this order type. */
export function ServiceChargeSheet({
  order,
  open,
  onOpenChange,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const pos = usePos();
  const [amount, setAmount] = useState(0);
  const rule = pos.data!.settings.serviceCharge;
  useEffect(() => {
    if (open)
      setAmount(
        order.serviceOverride ??
          (rule.type === "percentage"
            ? Math.round(order.totals.subtotal * rule.value) / 100
            : rule.value),
      );
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (v: number | null) => {
    const r = await pos.act((b) => b.setServiceCharge(order.id, v));
    if (!r.ok) return void toast.error(r.error);
    onOpenChange(false);
  };
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Service charge"
      description="Added by hand on this bill."
      footer={
        <div className="flex gap-2">
          {order.serviceOverride != null ? (
            <Button variant="outline" className="tap" onClick={() => void save(null)}>
              Remove
            </Button>
          ) : null}
          <Button className="tap flex-1" onClick={() => void save(amount)}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-2 py-2">
        <Label htmlFor="svc">Amount ₹</Label>
        <NumberField id="svc" value={amount} onChange={setAmount} />
      </div>
    </ResponsiveSheet>
  );
}

export function EbillSheet({
  order,
  open,
  onOpenChange,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const pos = usePos();
  const [mobile, setMobile] = useState(order.customerMobile ?? "");
  const [busy, setBusy] = useState(false);
  const credits = pos.data!.subscription.ebillCredits;
  useEffect(() => {
    if (open) setMobile(order.customerMobile ?? "");
  }, [open, order.customerMobile]);
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Send e-bill by SMS"
      description={`${credits} SMS e-bill credits left`}
      footer={
        <Button
          className="tap w-full"
          disabled={busy || !/^\d{10}$/.test(mobile)}
          onClick={async () => {
            setBusy(true);
            const r = await pos.act((b) => b.sendEbill(order.id, mobile));
            setBusy(false);
            if (!r.ok) return void toast.error(r.error);
            toast.success(`E-bill sent to ${mobile}`);
            onOpenChange(false);
          }}
        >
          {busy ? <Spinner /> : <MessageSquareText className="size-4" />} Send
        </Button>
      }
    >
      <div className="space-y-2 py-2">
        <Label htmlFor="eb">Customer mobile</Label>
        <Input
          id="eb"
          className="tap"
          inputMode="numeric"
          maxLength={10}
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
        />
      </div>
    </ResponsiveSheet>
  );
}

export function ShareSheet({
  open,
  onOpenChange,
  onPdf,
  onWhatsApp,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPdf: () => void;
  onWhatsApp: () => void;
}) {
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Share bill">
      <div className="grid grid-cols-2 gap-2 py-2">
        <Button
          variant="outline"
          className="tap h-16 flex-col"
          onClick={() => {
            onPdf();
            onOpenChange(false);
          }}
        >
          <FileText className="size-5" /> PDF
        </Button>
        <Button
          variant="outline"
          className="tap h-16 flex-col"
          onClick={() => {
            onWhatsApp();
            onOpenChange(false);
          }}
        >
          <MessageSquareText className="size-5" /> WhatsApp
        </Button>
      </div>
    </ResponsiveSheet>
  );
}

export function billShareText(order: Order, outletName: string): string {
  return `${outletName}\nBill ${order.billNo}\nTotal ${money(order.totals.grand)}\nThank you, visit again!`;
}
