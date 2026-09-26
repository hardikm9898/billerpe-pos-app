import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgePercent, Ban, BarChart3, CalendarDays, ChefHat, CreditCard, Landmark, LayoutGrid, Receipt, Table2, Users, Wallet } from "lucide-react";
import type { ComponentType } from "react";

import { AppShell } from "@/components/pos/AppShell";
import { reportDefs, type ReportId } from "@/lib/pos/analytics";

export const Route = createFileRoute("/reports/")({
  head: () => ({
    meta: [
      { title: "Reports — BillerPe POS" },
      { name: "description", content: "Sales, items, payment modes, GST, discounts, KOTs, staff, tables, cash and expense reports." },
      { property: "og:title", content: "Reports — BillerPe POS" },
      { property: "og:description", content: "Sales, items, payment modes, GST, discounts, KOTs, staff, tables, cash and expense reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

const icons: Record<ReportId, ComponentType<{ className?: string }>> = {
  "day-wise": CalendarDays, "item-wise": BarChart3, "category-wise": LayoutGrid, "payment-mode": CreditCard,
  tax: Landmark, discount: BadgePercent, kot: ChefHat, cancelled: Ban, staff: Users, table: Table2,
  "cash-session": Wallet, expense: Receipt,
};

function ReportsPage() {
  return (
    <AppShell title="Reports">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {reportDefs.map((r) => {
          const Icon = icons[r.id];
          return (
            <Link key={r.id} to="/reports/$reportId" params={{ reportId: r.id }} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><Icon className="size-5" /></span>
              <span className="min-w-0">
                <span className="block font-semibold">{r.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.body}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
