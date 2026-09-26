import { FileText, MessageSquareText, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { discountPercent } from "@/lib/pos/billing";
import { money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type { Order } from "@/lib/pos/types";

const reasons = ["Regular guest", "Food delay", "Staff meal", "Complaint", "Owner's guest"];

export function DiscountSheet({ order, open, onOpenChange }: { order: Order; open: boolean; onOpenChange: (o: boolean) => void }) {
  const pos = usePos();
  const [kind, setKind] = useState<"flat" | "percent">("percent");
  const [value, setValue] = useState(0);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [needsPin, setNeedsPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setKind(order.discount?.kind ?? "percent");
      setValue(order.discount?.value ?? 0);
      setReason(order.discount?.reason ?? "");
      setPin("");
      setNeedsPin(false);
      setError(null);
    }
  }, [open, order.discount]);

  const subtotal = pos.billFor({ ...order, discount: undefined, promoCode: undefined }).subtotal;
  const limit = pos.myDiscountLimit;
  const pct = discountPercent(kind, value, subtotal);
  const overLimit = limit !== null && pct > limit && !pos.permissions.special.discountBeyondLimit;
  const discountAmt = kind === "flat" ? Math.min(value, subtotal) : (subtotal * Math.min(value, 100)) / 100;

  const apply = async () => {
    setBusy(true);
    const res = await pos.applyDiscount(order.id, { kind, value, reason }, needsPin ? pin : undefined);
    setBusy(false);
    if (res.ok) {
      toast.success("Discount applied");
      onOpenChange(false);
      return;
    }
    if (res.needsPin) setNeedsPin(true);
    setError(res.error ?? "Could not apply discount");
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Apply discount"
      description={`On subtotal ${money(subtotal)}`}
      footer={
        <div className="flex gap-2">
          {order.discount ? (
            <Button variant="outline" className="tap" onClick={() => { void pos.removeDiscount(order.id); onOpenChange(false); }}>
              Remove
            </Button>
          ) : null}
          <Button className="tap flex-1" disabled={busy || value <= 0 || !reason.trim() || (needsPin && pin.length !== 4)} onClick={() => void apply()}>
            {busy ? <Spinner /> : null} Apply {money(discountAmt)} off
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-2">
          <Chip active={kind === "percent"} onClick={() => setKind("percent")} className="justify-center">Percent %</Chip>
          <Chip active={kind === "flat"} onClick={() => setKind("flat")} className="justify-center">Flat ₹</Chip>
        </div>
        <div>
          <Label htmlFor="disc-value">{kind === "percent" ? "Discount %" : "Discount amount ₹"}</Label>
          <NumberField id="disc-value" value={value} onChange={(v) => { setValue(v); setNeedsPin(false); setError(null); }} className="mt-1.5 h-12 text-xl" />
          <p className="mt-1 text-xs text-muted-foreground">{limit === null ? "No discount limit for your role" : `Your limit: ${limit}% of the bill`}</p>
        </div>
        <div>
          <Label>Reason</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {reasons.map((r) => (
              <Chip key={r} active={reason === r} onClick={() => setReason(r)}>{r}</Chip>
            ))}
          </div>
          <Input className="tap mt-2" placeholder="Or type a reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        {overLimit ? (
          <div className="rounded-lg border border-status-hold/40 bg-status-hold-soft p-3">
            <p className="flex items-center gap-2 text-sm font-bold text-status-hold">
              <ShieldAlert className="size-4" /> Limit exceeded — needs manager PIN
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pct.toFixed(1)}% is above your {limit}% limit. A manager or owner can approve with their PIN.
            </p>
            {needsPin ? (
              <Input
                autoFocus
                inputMode="numeric"
                type="password"
                maxLength={4}
                placeholder="Manager PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="tap mt-2 text-center font-display text-lg tracking-[0.5em]"
              />
            ) : null}
          </div>
        ) : null}
        {error && !(overLimit && !needsPin) ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
      </div>
    </ResponsiveSheet>
  );
}

export function PromoSheet({ order, open, onOpenChange }: { order: Order; open: boolean; onOpenChange: (o: boolean) => void }) {
  const pos = usePos();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = async (c: string) => {
    setBusy(true);
    const res = await pos.applyPromo(order.id, c);
    setBusy(false);
    if (res.ok) {
      toast.success(`Promo ${c.toUpperCase()} applied`);
      onOpenChange(false);
      setCode("");
    } else setError(res.error ?? "Invalid code");
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Promo code"
      footer={
        <Button className="tap w-full" disabled={busy || !code.trim()} onClick={() => void apply(code)}>
          {busy ? <Spinner /> : null} Apply code
        </Button>
      }
    >
      <div className="space-y-3 py-2">
        {order.promoCode ? (
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary-soft p-3 text-sm font-semibold text-primary-soft-foreground">
            {order.promoCode} applied
            <button type="button" aria-label="Remove promo" className="tap inline-flex items-center justify-center" onClick={() => void pos.removePromo(order.id)}>
              <X className="size-4" />
            </button>
          </div>
        ) : null}
        <Input className="tap uppercase" placeholder="Enter code" value={code} onChange={(e) => { setCode(e.target.value); setError(null); }} />
        {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
        <div className="space-y-2">
          {pos.billingSettings.promoCodes.map((p) => (
            <button key={p.code} type="button" onClick={() => void apply(p.code)} className="tap flex w-full items-center justify-between rounded-lg border border-dashed border-border bg-card px-3 text-left">
              <span className="font-display font-bold">{p.code}</span>
              <span className="text-xs text-muted-foreground">{p.label}</span>
            </button>
          ))}
        </div>
      </div>
    </ResponsiveSheet>
  );
}

export function EbillSheet({ order, open, onOpenChange }: { order: Order; open: boolean; onOpenChange: (o: boolean) => void }) {
  const pos = usePos();
  const [mobile, setMobile] = useState(order.customerMobile ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Send e-bill by SMS"
      description="The customer gets a link to their bill."
      footer={
        <Button
          className="tap w-full"
          disabled={busy || mobile.length !== 10}
          onClick={async () => {
            setBusy(true);
            const res = await pos.sendEbill(order.id, mobile);
            setBusy(false);
            if (res.ok) {
              toast.success(`E-bill sent to ${mobile}`);
              onOpenChange(false);
            } else setError(res.error ?? "Could not send");
          }}
        >
          {busy ? <Spinner /> : null} Send SMS
        </Button>
      }
    >
      <div className="space-y-2 py-2">
        <Label htmlFor="ebill-mobile">Customer mobile</Label>
        <Input id="ebill-mobile" inputMode="numeric" className="tap" placeholder="10-digit mobile" value={mobile} onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(null); }} />
        {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
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
      <div className="grid grid-cols-2 gap-2 py-3">
        <Button variant="outline" className="tap h-16 flex-col" onClick={() => { onPdf(); onOpenChange(false); }}>
          <FileText className="size-5" /> PDF
        </Button>
        <Button variant="outline" className="tap h-16 flex-col" onClick={() => { onWhatsApp(); onOpenChange(false); }}>
          <MessageSquareText className="size-5" /> WhatsApp
        </Button>
      </div>
    </ResponsiveSheet>
  );
}
