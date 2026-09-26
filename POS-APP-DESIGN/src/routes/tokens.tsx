import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";

import { RequireAuth } from "@/components/pos/AppShell";
import { Logo } from "@/components/pos/primitives";
import { time } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import { useNow } from "@/lib/pos/useNow";
import type { Order } from "@/lib/pos/types";

export const Route = createFileRoute("/tokens")({
  head: () => ({
    meta: [
      { title: "Token display — BillerPe POS" },
      { name: "description", content: "Customer-facing token screen with Preparing and Ready columns." },
      { property: "og:title", content: "Token display — BillerPe POS" },
      { property: "og:description", content: "Customer-facing token screen with Preparing and Ready columns." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <TokenDisplay />
    </RequireAuth>
  ),
});

function isReady(o: Order) {
  const lines = o.rounds.flatMap((r) => r.lines);
  return lines.length > 0 && lines.every((l) => l.status === "ready" || l.status === "served");
}

function TokenDisplay() {
  const pos = usePos();
  const now = useNow(30000);
  const { preparing, ready } = useMemo(() => {
    const recent = pos.orders.filter(
      (o) => o.tokenNo && o.status !== "cancelled" && now - new Date(o.createdAt).getTime() < 3 * 3600000,
    );
    return {
      preparing: recent.filter((o) => !isReady(o)).sort((a, b) => a.tokenNo! - b.tokenNo!),
      ready: recent
        .filter((o) => isReady(o) && (!o.readyAt || now - new Date(o.readyAt).getTime() < 30 * 60000))
        .sort((a, b) => (b.readyAt ?? "").localeCompare(a.readyAt ?? "")),
    };
  }, [pos.orders, now]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Link to="/orders" aria-label="Back" className="tap inline-flex items-center justify-center rounded-md text-muted-foreground"><ArrowLeft className="size-5" /></Link>
        <Logo size={32} />
        <p className="flex-1 font-display text-lg font-bold">{pos.outlet.restaurant}</p>
        <p className="num text-muted-foreground">{time(now)}</p>
      </header>
      <p className="px-4 pt-2 text-center text-xs text-muted-foreground">Tap a token to mark it ready or back to preparing (demo).</p>
      <div className="grid flex-1 grid-cols-2 gap-2 p-2 sm:gap-4 sm:p-4">
        <Column title="Preparing" tone="hold" orders={preparing} onTap={(o) => void pos.markOrderReady(o.id, true)} />
        <Column title="Ready" tone="ready" orders={ready} onTap={(o) => void pos.markOrderReady(o.id, false)} />
      </div>
    </div>
  );
}

function Column({ title, tone, orders, onTap }: { title: string; tone: "hold" | "ready"; orders: Order[]; onTap: (o: Order) => void }) {
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-soft">
      <h2 className={`rounded-t-lg py-3 text-center font-display text-2xl font-extrabold uppercase tracking-wide md:text-4xl ${tone === "ready" ? "bg-status-ready text-primary-foreground" : "bg-status-hold-soft text-status-hold"}`}>
        {title}
      </h2>
      <div className="grid flex-1 content-start grid-cols-1 gap-2 p-2 sm:grid-cols-2 sm:gap-3 sm:p-4 lg:grid-cols-3">
        {orders.length === 0 ? (
          <p className="col-span-full py-10 text-center text-muted-foreground">No tokens</p>
        ) : (
          orders.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onTap(o)}
              className={`num rounded-lg border py-4 text-center font-display text-4xl font-extrabold sm:text-5xl md:text-7xl ${tone === "ready" ? "animate-in fade-in border-status-ready bg-status-ready-soft text-status-ready" : "border-border text-foreground"}`}
            >
              {o.tokenNo}
            </button>
          ))
        )}
      </div>
    </section>
  );
}
