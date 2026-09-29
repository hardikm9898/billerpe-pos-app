import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShoppingBag, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/pos/AppShell";
import { Card, Field, FormError } from "@/components/pos/kit";
import { EmptyState } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { elapsed, money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import { useNow } from "@/lib/pos/useNow";

export const Route = createFileRoute("/takeaway")({
  component: PickupPage,
});

/** Pickup (takeaway) orders. The token is given by the server when the order is saved. */
function PickupPage() {
  const pos = usePos();
  const navigate = useNavigate();
  const now = useNow();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);

  const running = (pos.data?.orders ?? [])
    .filter(
      (o) =>
        o.type === "pickup" &&
        (o.status === "running" || o.status === "hold" || o.status === "billed"),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const carts = Object.values(pos.drafts).filter(
    (d) => d.type === "pickup" && !d.orderId && d.lines.length > 0,
  );

  const start = () => {
    if (mobile && !/^\d{10}$/.test(mobile))
      return setError("Enter a 10-digit mobile number or leave it empty");
    const key = `p.${crypto.randomUUID()}`;
    pos.openDraft(key, { type: "pickup" });
    pos.updateDraft(key, (d) => ({ ...d, customerName: name.trim(), customerMobile: mobile }));
    setName("");
    setMobile("");
    void navigate({ to: "/order/$key", params: { key } });
  };

  const openOrder = (orderId: string) => {
    const key = `o.${orderId}`;
    pos.openDraft(key, { type: "pickup", orderId });
    void navigate({ to: "/order/$key", params: { key } });
  };

  return (
    <AppShell title="Pickup" subtitle="Takeaway orders">
      <div className="mx-auto max-w-2xl space-y-4">
        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer name" htmlFor="ta-name">
              <Input
                id="ta-name"
                className="tap"
                maxLength={60}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="Optional"
              />
            </Field>
            <Field label="Mobile" htmlFor="ta-mobile">
              <Input
                id="ta-mobile"
                className="tap"
                inputMode="numeric"
                value={mobile}
                onChange={(e) => {
                  setMobile(e.target.value.replace(/\D/g, "").slice(0, 10));
                  setError(null);
                }}
                placeholder="Optional, 10 digits"
              />
            </Field>
          </div>
          <FormError error={error} />
          <Button className="tap h-12 w-full text-base" onClick={start}>
            <ShoppingBag className="size-5" /> Start pickup order
          </Button>
        </Card>

        {carts.length ? (
          <div className="space-y-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Carts on this phone (not sent)
            </h2>
            {carts.map((d) => (
              <Link
                key={d.key}
                to="/order/$key"
                params={{ key: d.key }}
                className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-card p-3"
              >
                <ShoppingCart className="size-5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {d.customerName || "Walk-in"} · {d.lines.length} item(s)
                </span>
                <span className="text-xs text-muted-foreground">
                  {elapsed(d.updatedAt, now)} ago
                </span>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Running pickups
          </h2>
          {running.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag className="size-6" />}
              title="No pickup orders running"
              body="Start one above — it shows here and in Orders → Running."
            />
          ) : (
            running.map((o) => {
              const ready =
                Boolean(o.readyAt) ||
                (o.kots.length > 0 &&
                  o.kots
                    .flatMap((k) => k.lines)
                    .every((l) => l.status === "ready" || l.status === "served"));
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => openOrder(o.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-soft"
                >
                  <span className="num flex size-12 shrink-0 items-center justify-center rounded-md bg-primary-soft font-display text-lg text-primary-soft-foreground">
                    {o.token ? `#${o.token}` : "PU"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {o.customerName ?? "Walk-in"} · Bill {o.billNo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {o.kots.length} KOT · {elapsed(o.createdAt, now)}
                    </p>
                  </div>
                  {ready ? (
                    <span className="rounded-md bg-status-ready-soft px-2 py-0.5 text-[11px] font-bold text-status-ready">
                      Ready
                    </span>
                  ) : null}
                  <span className="num text-sm">{money(o.totals.grand)}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
