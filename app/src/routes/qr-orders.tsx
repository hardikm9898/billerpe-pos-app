import { createFileRoute } from "@tanstack/react-router";
import { Check, QrCode, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { PullToRefresh } from "@/components/pos/PullToRefresh";
import { Chip, EmptyState, Spinner, VegMark } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { elapsed, money, qty } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import { useNow } from "@/lib/pos/useNow";
import type { QrOrder } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/qr-orders")({
  component: QrOrdersPage,
});

const REASONS = ["Out of stock", "Not available right now", "Kitchen closed"];

/**
 * Customer QR rounds (owner decision, issue list 3 #9): accept or reject
 * each item; rejected items need a reason the customer sees, and never
 * reach the order, KOT or bill. All rejected = the round is rejected.
 */
function QrOrdersPage() {
  const pos = usePos();
  const now = useNow(15000);
  const qr = pos.data?.qrOrders ?? [];
  const pending = qr
    .filter((q) => q.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const done = qr
    .filter((q) => q.status !== "pending")
    .slice(-10)
    .reverse();
  return (
    <AppShell title="QR orders" subtitle={`${pending.length} waiting`}>
      <PullToRefresh onRefresh={pos.reload}>
        {!pos.data?.settings.qrOrdering ? (
          <p className="mb-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            QR ordering is switched off in Settings. Guests can only see the menu.
          </p>
        ) : null}
        <div className="space-y-3">
          {pending.length === 0 ? (
            <EmptyState
              icon={<QrCode className="size-6" />}
              title="No QR orders waiting"
              body="When a guest orders from the table QR, it shows up here to accept."
            />
          ) : (
            pending.map((q) => <QrCard key={q.id} q={q} now={now} />)
          )}
        </div>
        {done.length ? (
          <div className="mt-6 space-y-2">
            <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Handled
            </p>
            {done.map((q) => (
              <div key={q.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <p className="font-semibold">
                  {pos.tableById(q.tableId)?.name} · {q.customerName} ·{" "}
                  <span
                    className={cn(
                      q.status === "rejected"
                        ? "text-destructive"
                        : q.status === "partial"
                          ? "text-status-hold"
                          : "text-status-ready",
                    )}
                  >
                    {q.status === "accepted"
                      ? "Accepted"
                      : q.status === "partial"
                        ? "Partly accepted"
                        : "Rejected"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {q.items
                    .map(
                      (i) =>
                        `${i.qty}× ${i.name}${i.decision === "rejected" ? ` (rejected: ${i.rejectReason})` : ""}`,
                    )
                    .join(", ")}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </PullToRefresh>
    </AppShell>
  );
}

function QrCard({ q, now }: { q: QrOrder; now: number }) {
  const pos = usePos();
  const table = pos.tableById(q.tableId);
  const [dec, setDec] = useState<Record<string, { accept: boolean; reason: string }>>({});
  const [busy, setBusy] = useState(false);
  useEffect(
    () => setDec(Object.fromEntries(q.items.map((i) => [i.key, { accept: true, reason: "" }]))),
    [q.id],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = q.items.find(
    (i) => dec[i.key] && !dec[i.key]!.accept && !dec[i.key]!.reason.trim(),
  );
  const accepted = q.items.filter((i) => dec[i.key]?.accept);
  const submit = async (all?: "reject") => {
    const decisions = q.items.map((i) => ({
      key: i.key,
      accept: all === "reject" ? false : (dec[i.key]?.accept ?? true),
      reason: all === "reject" ? dec[i.key]?.reason || "Kitchen closed" : dec[i.key]?.reason,
    }));
    setBusy(true);
    const r = await pos.act((b) => b.decideQr(q.id, decisions));
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(
      decisions.some((d) => d.accept)
        ? `Sent to the kitchen · ${table?.name}`
        : "QR order rejected — the guest sees the reason",
    );
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-card p-3 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-lg font-bold">
          {table?.name ?? "Table"}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            · {q.customerName} · round {q.round}
          </span>
        </p>
        <span className="text-xs text-muted-foreground">{elapsed(q.createdAt, now)} ago</span>
      </div>
      <ul className="mt-2 space-y-2">
        {q.items.map((i) => {
          const d = dec[i.key] ?? { accept: true, reason: "" };
          return (
            <li
              key={i.key}
              className={cn(
                "rounded-md border p-2",
                d.accept ? "border-border" : "border-destructive/40 bg-primary-soft/40",
              )}
            >
              <div className="flex items-center gap-2">
                <VegMark type={i.dietary} />
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  {qty(i.qty)}× <span translate="no">{i.name}</span>
                  {i.variantName ? ` (${i.variantName})` : ""}
                  {i.note ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      Note: {i.note}
                    </span>
                  ) : null}
                </span>
                <span className="num text-sm">{money(i.price * i.qty)}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Accept ${i.name}`}
                    onClick={() => setDec((x) => ({ ...x, [i.key]: { accept: true, reason: "" } }))}
                    className={cn(
                      "tap inline-flex items-center justify-center rounded-md border px-2",
                      d.accept
                        ? "border-status-ready bg-status-ready-soft text-status-ready"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Reject ${i.name}`}
                    onClick={() =>
                      setDec((x) => ({
                        ...x,
                        [i.key]: { accept: false, reason: x[i.key]?.reason ?? "" },
                      }))
                    }
                    className={cn(
                      "tap inline-flex items-center justify-center rounded-md border px-2",
                      !d.accept
                        ? "border-destructive bg-primary-soft text-destructive"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              {!d.accept ? (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {REASONS.map((r) => (
                      <Chip
                        key={r}
                        active={d.reason === r}
                        onClick={() =>
                          setDec((x) => ({ ...x, [i.key]: { accept: false, reason: r } }))
                        }
                      >
                        {r}
                      </Chip>
                    ))}
                  </div>
                  <Input
                    className="tap"
                    placeholder="Other reason"
                    value={REASONS.includes(d.reason) ? "" : d.reason}
                    onChange={(e) =>
                      setDec((x) => ({ ...x, [i.key]: { accept: false, reason: e.target.value } }))
                    }
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="tap"
          disabled={busy}
          onClick={() => void submit("reject")}
        >
          Reject all
        </Button>
        <Button className="tap" disabled={busy || Boolean(missing)} onClick={() => void submit()}>
          {busy ? <Spinner /> : null}{" "}
          {missing
            ? "Pick a reason"
            : accepted.length === q.items.length
              ? "Accept & send KOT"
              : `Send ${accepted.length} to kitchen`}
        </Button>
      </div>
    </div>
  );
}
