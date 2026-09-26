import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/pos/AppShell";
import { Card, Field, FormError, Segmented } from "@/components/pos/kit";
import { EmptyState, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { elapsed, money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import { useNow } from "@/lib/pos/useNow";
import type { OrderType } from "@/lib/pos/types";

export const Route = createFileRoute("/takeaway")({
  head: () => ({
    meta: [
      { title: "Takeaway — BillerPe POS" },
      { name: "description", content: "Start a takeaway or delivery order, send the KOT and hand over a token." },
      { property: "og:title", content: "Takeaway — BillerPe POS" },
      { property: "og:description", content: "Start a takeaway or delivery order, send the KOT and hand over a token." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TakeawayPage,
});

function TakeawayPage() {
  const pos = usePos();
  const navigate = useNavigate();
  const now = useNow();
  const [type, setType] = useState<OrderType>("takeaway");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const running = pos.orders
    .filter((o) => o.type !== "dine-in" && ["running", "hold", "billed"].includes(o.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const start = async () => {
    if (name.length > 60) return setError("Name is too long");
    if (mobile && !/^\d{10}$/.test(mobile)) return setError("Enter a 10-digit mobile number or leave it empty");
    if (type === "delivery" && (!name.trim() || !mobile)) return setError("Delivery needs the customer's name and mobile");
    setBusy(true);
    const res = await pos.createTakeaway({ type, name: name.trim(), mobile });
    setBusy(false);
    if (!res.ok || !res.orderId) return setError(res.error ?? "Could not start the order");
    void navigate({ to: "/order/$orderId", params: { orderId: res.orderId } });
  };

  return (
    <AppShell title="Takeaway" subtitle={`Next token #${pos.nextTokenNo}`}>
      <div className="mx-auto max-w-2xl space-y-4">
        <Card className="space-y-3">
          <Segmented value={type} onChange={setType} options={[{ id: "takeaway", label: "Takeaway" }, { id: "delivery", label: "Delivery" }]} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={type === "delivery" ? "Customer name *" : "Customer name"} htmlFor="ta-name">
              <Input id="ta-name" className="tap" maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="Optional" />
            </Field>
            <Field label={type === "delivery" ? "Mobile *" : "Mobile"} htmlFor="ta-mobile">
              <Input id="ta-mobile" className="tap" inputMode="numeric" value={mobile} onChange={(e) => { setMobile(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(null); }} placeholder="10-digit mobile" />
            </Field>
          </div>
          <FormError error={error} />
          <Button className="tap h-12 w-full text-base" disabled={busy} onClick={() => void start()}>
            {busy ? <Spinner /> : <ShoppingBag className="size-5" />} Start order · token #{pos.nextTokenNo}
          </Button>
        </Card>

        <div className="space-y-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Running takeaways</h2>
          {running.length === 0 ? (
            <EmptyState icon={<ShoppingBag className="size-6" />} title="No takeaway orders running" body="Start one above — it shows here and in Orders → Running." />
          ) : (
            running.map((o) => {
              const ready = o.rounds.length > 0 && o.rounds.flatMap((r) => r.lines).every((l) => l.status === "ready" || l.status === "served");
              return (
                <Link key={o.id} to="/order/$orderId" params={{ orderId: o.id }} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft">
                  <span className="num flex size-12 items-center justify-center rounded-md bg-primary-soft font-display text-lg text-primary-soft-foreground">#{o.tokenNo}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{o.customerName ?? "Walk-in"} · {o.type === "delivery" ? "Delivery" : "Takeaway"}</p>
                    <p className="text-xs text-muted-foreground">{o.rounds.length ? `${o.rounds.length} KOT` : "No KOT yet"} · {elapsed(o.createdAt, now)}</p>
                  </div>
                  {ready ? <span className="rounded-md bg-status-ready-soft px-2 py-0.5 text-[11px] font-bold text-status-ready">Ready</span> : null}
                  <span className="num text-sm">{money(pos.billFor(o).grandTotal)}</span>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
