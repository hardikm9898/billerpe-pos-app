import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";

/** Hand back a refund owed on an edited bill (Web POS "Refunds due" → Mark refunded). */
export function RefundSheet({
  refund,
  onClose,
}: {
  refund: {
    orderId: string;
    billNo: string;
    amount: number;
    customerName?: string | undefined;
  } | null;
  onClose: () => void;
}) {
  const pos = usePos();
  const modes = (pos.data?.settings.paymentModes ?? []).filter((m) => m.active && m.id !== "due");
  const [mode, setMode] = useState("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!refund) return;
    setMode(modes.some((m) => m.id === "cash") ? "cash" : (modes[0]?.id ?? "cash"));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refund]);

  return (
    <ResponsiveSheet
      open={Boolean(refund)}
      onOpenChange={(o) => !o && !busy && onClose()}
      title={refund ? `Refund on bill ${refund.billNo}` : "Refund"}
      description={
        refund
          ? `${money(refund.amount)} back to ${refund.customerName || "the customer"}`
          : undefined
      }
      footer={
        <Button
          className="tap w-full"
          disabled={busy || !refund}
          onClick={async () => {
            if (!refund) return;
            setBusy(true);
            const r = await pos.act((b) => b.settleRefund(refund.orderId, mode));
            setBusy(false);
            if (!r.ok) return setError(r.error);
            toast.success(`Refund ${money(refund.amount)} recorded`);
            onClose();
          }}
        >
          {busy ? <Spinner /> : null} Mark {refund ? money(refund.amount) : ""} refunded
        </Button>
      }
    >
      <div className="space-y-2 py-2">
        <Label>Handed back by</Label>
        <div className="flex flex-wrap gap-2">
          {modes.map((m) => (
            <Chip key={m.id} active={mode === m.id} onClick={() => setMode(m.id)}>
              {m.name}
            </Chip>
          ))}
        </div>
        {mode === "cash" ? (
          <p className="text-xs text-muted-foreground">
            The cash comes out of the open cash drawer.
          </p>
        ) : null}
        {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
      </div>
    </ResponsiveSheet>
  );
}
