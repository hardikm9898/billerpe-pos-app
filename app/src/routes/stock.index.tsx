import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes } from "lucide-react";

import { AppShell } from "@/components/pos/AppShell";
import { STOCK_SECTIONS, StockStatus } from "@/components/pos/stock/StockSections";
import { SectionTitle } from "@/components/pos/primitives";
import { money, qty } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/stock/")({
  component: StockHome,
});

function StockHome() {
  const pos = usePos();
  const data = pos.data!;
  const raw = data.stock.raw.filter((r) => r.active);
  const negative = raw.filter((r) => r.stock < 0);
  const low = raw.filter((r) => r.stock >= 0 && r.stock <= r.reorderLevel);
  const value = raw.reduce((a, r) => a + Math.max(0, r.stock) * r.rate, 0);
  const unit = (id: string) => data.stock.units.find((u) => u.id === id)?.short ?? "";
  const sections = STOCK_SECTIONS.filter((s) => pos.can(s.module));
  return (
    <AppShell title="Stock">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Stock value</p>
            <p className="num font-display text-lg font-extrabold">{money(value)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Low</p>
            <p className="num font-display text-lg font-extrabold text-status-hold">{low.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Negative</p>
            <p className="num font-display text-lg font-extrabold text-destructive">
              {negative.length}
            </p>
          </div>
        </div>

        {negative.length || low.length ? (
          <section className="space-y-2">
            <SectionTitle>Needs attention</SectionTitle>
            <p className="text-xs text-muted-foreground">
              Sales are never blocked by stock; items used beyond what you have go negative. Record
              the purchase or a stock count to correct them.
            </p>
            {[...negative, ...low].map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-semibold">
                    <span translate="no">{r.name}</span>
                  </span>{" "}
                  · {qty(r.stock)} {unit(r.unitId)}{" "}
                  <span className="text-xs text-muted-foreground">
                    (reorder at {qty(r.reorderLevel)})
                  </span>
                </span>
                <StockStatus m={r} />
              </div>
            ))}
          </section>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <Link
              key={s.id}
              to="/stock/$section"
              params={{ section: s.id }}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                <s.icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{s.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.body}</span>
              </span>
            </Link>
          ))}
          {pos.can("stock-reports") ? (
            <Link
              to="/reports"
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                <Boxes className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">Stock reports</span>
                <span className="block truncate text-xs text-muted-foreground">
                  Ledger, closing stock, purchases, wastage
                </span>
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
