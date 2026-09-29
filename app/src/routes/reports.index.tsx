import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BadgePercent,
  Ban,
  BarChart3,
  Boxes,
  CalendarDays,
  ChefHat,
  Contact,
  CreditCard,
  Landmark,
  LayoutGrid,
  NotebookTabs,
  Receipt,
  ShoppingBag,
  Table2,
  Trash,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { AppShell } from "@/components/pos/AppShell";
import { REPORTS } from "@/lib/pos/reportList";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/reports/")({
  component: ReportsPage,
});

const icons: Record<string, LucideIcon> = {
  "day-wise": CalendarDays,
  "item-wise": BarChart3,
  "category-wise": LayoutGrid,
  "payment-mode": CreditCard,
  tax: Landmark,
  discount: BadgePercent,
  kot: ChefHat,
  cancelled: Ban,
  staff: Users,
  table: Table2,
  "cash-session": Wallet,
  expense: Receipt,
  "due-collected": Contact,
  purchase: ShoppingBag,
  "closing-stock": Boxes,
  "stock-ledger": NotebookTabs,
  wastage: Trash,
};

function ReportsPage() {
  const pos = usePos();
  const allowed = REPORTS.filter((r) => pos.can(r.module));
  const groups = [...new Set(allowed.map((r) => r.group))];
  return (
    <AppShell title="Reports">
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g}>
            <p className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {g}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {allowed
                .filter((r) => r.group === g)
                .map((r) => {
                  const Icon = icons[r.id] ?? BarChart3;
                  return (
                    <Link
                      key={r.id}
                      to="/reports/$reportId"
                      params={{ reportId: r.id }}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-soft"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{r.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.body}
                        </span>
                      </span>
                    </Link>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
