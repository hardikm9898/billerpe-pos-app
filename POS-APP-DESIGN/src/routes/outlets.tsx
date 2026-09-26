import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Store } from "lucide-react";

import { RequireAuth } from "@/components/pos/AppShell";
import { Wordmark } from "@/components/pos/primitives";
import { usePos } from "@/lib/pos/store";
import { roleHome } from "@/lib/pos/permissions";

export const Route = createFileRoute("/outlets")({
  head: () => ({
    meta: [
      { title: "Choose outlet — BillerPe POS" },
      { name: "description", content: "Pick the outlet you want to bill from in BillerPe POS." },
      { property: "og:title", content: "Choose outlet — BillerPe POS" },
      { property: "og:description", content: "Pick the outlet you want to bill from." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OutletPicker,
});

function OutletPicker() {
  const { outlets, selectOutlet, user } = usePos();
  const navigate = useNavigate();

  return (
    <RequireAuth>
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto w-full max-w-sm">
          <Wordmark size={40} />
          <h1 className="mt-6 font-display text-xl">Choose an outlet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You can switch outlets later from the dashboard.
          </p>
          <div className="mt-5 space-y-3">
            {outlets.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  selectOutlet(o.id);
                  void navigate({ to: user ? roleHome[user.role] : "/tables" });
                }}
                className="tap flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-soft hover:border-primary"
              >
                <span className="inline-flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground">
                  <Store className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-sm font-bold">{o.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{o.address}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}
