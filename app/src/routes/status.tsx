import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ListOrdered } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { PullToRefresh } from "@/components/pos/PullToRefresh";
import { Chip, EmptyState, VegMark } from "@/components/pos/primitives";
import { elapsed, money, qty } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import { useNow } from "@/lib/pos/useNow";
import type { LineStatus } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/status")({
  component: StatusPage,
});

const chip: Record<LineStatus, string> = {
  sent: "bg-status-billed-soft text-status-billed",
  preparing: "bg-status-hold-soft text-status-hold",
  ready: "bg-status-ready-soft text-status-ready",
  served: "bg-muted text-muted-foreground",
};
const label: Record<LineStatus, string> = {
  sent: "Sent",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
};

/** Running orders with each round's kitchen progress. */
function StatusPage() {
  const pos = usePos();
  const navigate = useNavigate();
  const now = useNow(20000);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const me = pos.session?.user.id;
  const orders = (pos.data?.orders ?? [])
    .filter(
      (o) =>
        (o.status === "running" || o.status === "hold" || o.status === "billed") &&
        o.kots.length > 0,
    )
    .filter((o) => scope === "all" || o.captainId === me || o.kots.some((k) => k.firedById === me))
    .sort((a, b) => {
      const ready = (x: typeof a) => x.kots.some((k) => k.lines.some((l) => l.status === "ready"));
      return Number(ready(b)) - Number(ready(a)) || b.createdAt.localeCompare(a.createdAt);
    });

  return (
    <AppShell title="Order status">
      <PullToRefresh onRefresh={pos.reload}>
        <div className="flex gap-2">
          <Chip active={scope === "mine"} onClick={() => setScope("mine")}>
            My orders
          </Chip>
          <Chip active={scope === "all"} onClick={() => setScope("all")}>
            All running
          </Chip>
        </div>
        <div className="mt-3 space-y-3">
          {orders.length === 0 ? (
            <EmptyState
              icon={<ListOrdered className="size-6" />}
              title="Nothing cooking"
              body={
                scope === "mine"
                  ? "Orders you send to the kitchen show here."
                  : "No running orders with a KOT."
              }
            />
          ) : (
            orders.map((o) => {
              const table = pos.tableById(o.tableId);
              const key = o.tableId ? pos.draftKeyForTable(o.tableId) : `o.${o.id}`;
              return (
                <div key={o.id} className="rounded-lg border border-border bg-card p-3 shadow-soft">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => {
                      pos.openDraft(key, { type: o.type, tableId: o.tableId, orderId: o.id });
                      void navigate({ to: "/order/$key", params: { key } });
                    }}
                  >
                    <span className="font-display text-base font-bold">
                      {table?.name ?? `Token ${o.token || "—"}`}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        · Bill {o.billNo} · {elapsed(o.createdAt, now)}
                      </span>
                    </span>
                    <span className="num text-sm">{money(o.totals.grand)}</span>
                  </button>
                  <div className="mt-2 space-y-2">
                    {o.kots.map((k) => {
                      const open = k.lines.some((l) => l.status !== "served");
                      return (
                        <div
                          key={k.kotNo}
                          className={cn(
                            "rounded-md border p-2",
                            k.lines.some((l) => l.status === "ready")
                              ? "border-status-ready/50 bg-status-ready-soft/40"
                              : "border-border",
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                              Round {k.round} · KOT #{k.kotNo}
                            </p>
                            {open ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  const r = await pos.act((b) => b.markServed(o.id, k.kotNo));
                                  toast[r.ok ? "success" : "error"](
                                    r.ok ? `Round ${k.round} served` : r.error,
                                  );
                                }}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                              >
                                <CheckCircle2 className="size-3.5" /> Mark served
                              </button>
                            ) : null}
                          </div>
                          <ul className="mt-1 space-y-1">
                            {k.lines.map((l) => (
                              <li key={l.id} className="flex items-center gap-2 text-sm">
                                <VegMark type={l.dietary} />
                                <span className="min-w-0 flex-1 truncate">
                                  {qty(l.qty)}× <span translate="no">{l.name}</span>
                                  {l.variantName ? ` (${l.variantName})` : ""}
                                </span>
                                <span
                                  className={cn(
                                    "rounded px-1.5 py-0.5 text-[10px] font-bold",
                                    chip[l.status],
                                  )}
                                >
                                  {label[l.status]}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PullToRefresh>
    </AppShell>
  );
}
