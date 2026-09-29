import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppShell } from "@/components/pos/AppShell";
import {
  Purchases,
  Recipes,
  SemiFinishedSection,
  StockEntries,
  StockItems,
  STOCK_SECTIONS,
  Suppliers,
  WastageSection,
} from "@/components/pos/stock/StockSections";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/stock/$section")({
  component: StockSectionPage,
});

const VIEWS: Record<string, () => React.ReactElement> = {
  items: StockItems,
  suppliers: Suppliers,
  purchases: Purchases,
  entries: StockEntries,
  wastage: WastageSection,
  recipes: Recipes,
  semi: SemiFinishedSection,
};

/** One stock section; each needs its own stock permission (never a "no access" page). */
function StockSectionPage() {
  const { section } = Route.useParams();
  const pos = usePos();
  const navigate = useNavigate();
  const def = STOCK_SECTIONS.find((s) => s.id === section);
  const allowed = def ? pos.can(def.module) : false;
  useEffect(() => {
    if (!allowed) void navigate({ to: "/stock", replace: true });
  }, [allowed, navigate]);
  const View = VIEWS[section];
  if (!def || !View || !allowed)
    return (
      <AppShell title="Stock">
        <span />
      </AppShell>
    );
  return (
    <AppShell title={def.title}>
      <div className="mx-auto max-w-3xl">
        <View />
      </div>
    </AppShell>
  );
}
