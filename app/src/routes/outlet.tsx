import { createFileRoute } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Card, Field, FormError, readImage } from "@/components/pos/kit";
import { Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { upiLink } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/outlet")({
  component: OutletPage,
});

/** Outlet details printed on bills, and the UPI ID behind the "Scan to pay" QR. */
function OutletPage() {
  const pos = usePos();
  const o = pos.data!.outlet;
  const editable = pos.can("ops-billing", "edit");
  const [f, setF] = useState({
    name: o.name,
    address: o.address,
    phone: o.phone,
    gstin: o.gstin,
    fssai: o.fssai,
    upiId: o.upiId,
    logoUrl: o.logoUrl,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...p }));
    setError(null);
  };
  return (
    <AppShell title="Outlet details">
      <fieldset disabled={!editable} className="mx-auto max-w-xl space-y-3">
        {!editable ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Only the owner can change outlet details.
          </p>
        ) : null}
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            {f.logoUrl ? (
              <img src={f.logoUrl} alt="Logo" className="size-16 rounded-md object-contain" />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                Logo
              </span>
            )}
            <label className="tap inline-flex cursor-pointer items-center rounded-md border border-border px-3 text-sm font-semibold">
              {f.logoUrl ? "Change logo" : "Upload logo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    set({ logoUrl: await readImage(file) });
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              />
            </label>
          </div>
          <Field label="Outlet name *">
            <Input className="tap" value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Address">
            <Input
              className="tap"
              value={f.address}
              onChange={(e) => set({ address: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              className="tap"
              inputMode="tel"
              value={f.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="GSTIN">
              <Input
                className="tap uppercase"
                maxLength={15}
                value={f.gstin}
                onChange={(e) => set({ gstin: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="FSSAI">
              <Input
                className="tap"
                inputMode="numeric"
                maxLength={14}
                value={f.fssai}
                onChange={(e) => set({ fssai: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
          </div>
        </Card>
        <Card className="space-y-3">
          <Field
            label="UPI ID"
            hint="Customers scan a QR with the exact bill amount; money goes to this UPI ID. Payment is marked by the cashier (no gateway)."
          >
            <Input
              className="tap"
              autoCapitalize="none"
              placeholder="name@bank"
              value={f.upiId}
              onChange={(e) => set({ upiId: e.target.value.trim() })}
            />
          </Field>
          {f.upiId ? (
            <div className="flex items-center gap-3">
              <div className="rounded-md border border-border bg-white p-2">
                <QRCodeSVG value={upiLink(f.upiId, f.name, 1, "Test")} size={88} />
              </div>
              <p className="text-xs text-muted-foreground">
                Test: scan with any UPI app — it should show <span translate="no">{f.name}</span>{" "}
                and ₹1.00. Don't pay.
              </p>
            </div>
          ) : null}
        </Card>
        <FormError error={error} />
        {editable ? (
          <Button
            className="tap w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await pos.act((b) => b.updateOutlet(f));
              setBusy(false);
              if (r.ok) toast.success("Outlet details saved");
              else setError(r.error);
            }}
          >
            {busy ? <Spinner /> : null} Save
          </Button>
        ) : null}
      </fieldset>
    </AppShell>
  );
}
