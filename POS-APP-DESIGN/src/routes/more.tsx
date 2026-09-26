import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, moreModules } from "@/components/pos/AppShell";
import { can } from "@/lib/pos/permissions";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/more")({
  head: () => ({
    meta: [
      { title: "More — BillerPe POS" },
      { name: "description", content: "All BillerPe POS modules you can use." },
      { property: "og:title", content: "More — BillerPe POS" },
      { property: "og:description", content: "All BillerPe POS modules you can use." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MorePage,
});

function MorePage() {
  const pos = usePos();
  const items = moreModules.filter((m) => can(pos.permissions, m.moduleKey, m.to === "/due" || m.to === "/tokens" ? "create" : "view"));
  return (
    <AppShell title="More">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {items.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-2 text-center text-xs font-semibold shadow-soft">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary"><Icon className="size-5" /></span>
            {label}
          </Link>
        ))}
      </div>
      <button type="button" onClick={pos.logout} className="tap mt-6 w-full rounded-md border border-border bg-card text-sm font-semibold text-destructive">
        Log out
      </button>
    </AppShell>
  );
}
