import { History, Repeat, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Field, FormError } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerInput } from "@/lib/pos/backend/types";
import { dayLabel, money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type { Order } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

// The Web POS customer (components/billing/customer-details-dialog.tsx):
// mobile first - saved customers are suggested as it is typed and picking
// one fills the rest - then name, address and GSTIN. With a full number it
// shows what the customer owes and their last order, which can be repeated
// (components/billing/customer-history.tsx).

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The bar at the top of the order screen: who the order is for. */
export function CustomerBar({
  name,
  mobile,
  onOpen,
  disabled,
}: {
  name?: string | undefined;
  mobile?: string | undefined;
  onOpen: () => void;
  disabled?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className="tap flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm shadow-soft disabled:opacity-60"
    >
      <User className="size-4 shrink-0 text-muted-foreground" />
      {mobile || name ? (
        <span className="min-w-0 flex-1 truncate font-semibold">
          {name || "Customer"}
          {mobile ? (
            <span className="num ml-1 font-normal text-muted-foreground">· {mobile}</span>
          ) : null}
        </span>
      ) : (
        <span className="flex-1 text-muted-foreground">Add customer (optional)</span>
      )}
    </button>
  );
}

export function CustomerSheet({
  open,
  onOpenChange,
  initial,
  orderId,
  onSave,
  onRepeat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CustomerInput;
  /** The order being billed - never suggested as its own "last order". */
  orderId?: string | undefined;
  onSave: (c: CustomerInput) => Promise<boolean>;
  onRepeat?: ((order: Order) => void) | undefined;
}) {
  const pos = usePos();
  const data = pos.data!;
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMobile(initial.mobile ?? "");
    setName(initial.name ?? "");
    setAddress(initial.address ?? "");
    setGstin((initial.gstin ?? "").toUpperCase());
    setError(null);
    setListOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Saved customers whose number starts with (or contains) what is typed.
  const suggestions = useMemo(() => {
    if (mobile.length < 3) return [];
    return data.customers
      .filter((c) => c.mobile.includes(mobile) && c.mobile !== mobile)
      .sort((a, b) => Number(!a.mobile.startsWith(mobile)) - Number(!b.mobile.startsWith(mobile)))
      .slice(0, 6);
  }, [data.customers, mobile]);

  const pick = (c: (typeof data.customers)[number]) => {
    setMobile(c.mobile);
    setName(c.name ?? "");
    setAddress(c.address ?? "");
    setGstin((c.gstin ?? "").toUpperCase());
    setListOpen(false);
  };

  // A full number of a known customer fills the empty fields (Web POS).
  const exact = mobile.length === 10 ? data.customers.find((c) => c.mobile === mobile) : undefined;
  useEffect(() => {
    if (exact && !name && !address && !gstin) {
      setName(exact.name ?? "");
      setAddress(exact.address ?? "");
      setGstin((exact.gstin ?? "").toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exact?.id]);

  const lastOrder = useMemo(
    () =>
      mobile.length === 10
        ? data.orders
            .filter(
              (o) => o.customerMobile === mobile && o.id !== orderId && o.status !== "cancelled",
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        : undefined,
    [data.orders, mobile, orderId],
  );

  const save = async () => {
    if (mobile && !/^\d{10}$/.test(mobile)) return setError("Enter a 10-digit mobile number");
    if (!mobile && (name || address || gstin))
      return setError("Enter the customer's mobile number");
    if (gstin && !GSTIN_PATTERN.test(gstin)) return setError("Enter a valid 15-character GSTIN");
    setBusy(true);
    const ok = await onSave({ mobile, name: name.trim(), address: address.trim(), gstin });
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  const lastLines = lastOrder
    ? [...lastOrder.kots.flatMap((k) => k.lines), ...lastOrder.heldLines]
    : [];

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Customer"
      description="Mobile first: saved customers show up as you type."
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="tap"
            disabled={busy || (!initial.mobile && !initial.name)}
            onClick={async () => {
              setBusy(true);
              const ok = await onSave({ mobile: "", name: "", address: "", gstin: "" });
              setBusy(false);
              if (ok) onOpenChange(false);
            }}
          >
            Remove
          </Button>
          <Button className="tap" disabled={busy} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Mobile number *">
          <div className="relative">
            <Input
              className="tap num"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              placeholder="10-digit mobile number"
              value={mobile}
              onFocus={() => setListOpen(true)}
              onChange={(e) => {
                setMobile(e.target.value.replace(/\D/g, "").slice(0, 10));
                setListOpen(true);
                setError(null);
              }}
            />
            {listOpen && suggestions.length ? (
              <div className="mt-1 divide-y divide-border overflow-hidden rounded-md border border-border bg-card shadow-soft">
                {suggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pick(c)}
                    className="tap flex w-full flex-col items-start px-3 py-2 text-left"
                  >
                    <span className="text-sm font-semibold">
                      {c.name || "Customer"}{" "}
                      <span className="num font-normal text-muted-foreground">{c.mobile}</span>
                    </span>
                    {c.address || c.gstin ? (
                      <span className="text-[11px] text-muted-foreground">
                        {[c.address, c.gstin].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </Field>

        {mobile.length === 10 ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            {exact && exact.dueOutstanding > 0 ? (
              <p className="font-semibold text-status-running">
                Owes {money(exact.dueOutstanding)}
              </p>
            ) : exact ? (
              <p className="text-muted-foreground">
                {exact.visits} visit{exact.visits === 1 ? "" : "s"} · nothing due
              </p>
            ) : (
              <p className="text-muted-foreground">New customer</p>
            )}
            {lastOrder ? (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <History className="size-3.5" /> Last order · {dayLabel(lastOrder.businessDate)} ·{" "}
                  {money(lastOrder.totals.grand)}
                </p>
                <p className="mt-1 text-xs">
                  {lastLines
                    .slice(0, 6)
                    .map((l) => `${l.qty}× ${l.name}${l.variantName ? ` (${l.variantName})` : ""}`)
                    .join(", ")}
                  {lastLines.length > 6 ? "…" : ""}
                </p>
                {onRepeat ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="tap mt-2"
                    onClick={() => onRepeat(lastOrder)}
                  >
                    <Repeat className="size-4" /> Repeat this order
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <Field label="Name">
          <Input
            className="tap"
            value={name}
            placeholder="Customer name"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Address">
          <Input
            className="tap"
            value={address}
            placeholder="Optional"
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <Field label="GSTIN">
          <Input
            className={cn(
              "tap uppercase",
              gstin && !GSTIN_PATTERN.test(gstin) && "border-destructive",
            )}
            value={gstin}
            maxLength={15}
            placeholder="Optional"
            onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))}
          />
        </Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}
