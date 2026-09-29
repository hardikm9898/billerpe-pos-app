import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { AppShell, moreModules, tabsFor } from "@/components/pos/AppShell";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/more")({
  component: MorePage,
});

function MorePage() {
  const pos = usePos();
  const navigate = useNavigate();
  const tabs = pos.session ? tabsFor(pos.session.user.role, pos.canOpen).map((t) => t.to) : [];
  // Only what this person can open, minus what is already a bottom tab.
  const items = moreModules.filter((m) => pos.canOpen(m.to) && !tabs.includes(m.to));
  const groups = [...new Set(items.map((m) => m.group))];
  return (
    <AppShell title="More">
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g}>
            <p className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {g}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {items
                .filter((m) => m.group === g)
                .map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-2 text-center text-xs font-semibold shadow-soft"
                  >
                    <span className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary">
                      <Icon className="size-5" />
                    </span>
                    {label}
                  </Link>
                ))}
            </div>
          </section>
        ))}
      </div>
      <button
        type="button"
        onClick={async () => {
          await pos.logout();
          void navigate({ to: "/" });
        }}
        className="tap mt-6 w-full rounded-md border border-border bg-card text-sm font-semibold text-destructive"
      >
        Log out
      </button>
    </AppShell>
  );
}
