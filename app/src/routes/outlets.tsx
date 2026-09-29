import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { RequireAuth } from "@/components/pos/AppShell";
import { Spinner, Wordmark } from "@/components/pos/primitives";
import { backend, usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/outlets")({
  component: OutletPicker,
});

/** Owners with more than one outlet pick where to work after logging in. */
function OutletPicker() {
  const pos = usePos();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <RequireAuth>
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto w-full max-w-sm">
          <Wordmark size={40} />
          <h1 className="mt-6 font-display text-xl">Choose an outlet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You can switch later from the dashboard.
          </p>
          <div className="mt-5 space-y-3">
            {(pos.data?.outlets ?? []).map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(o.id);
                  const r = await backend
                    .selectOutlet(o.id)
                    .catch(() => ({ ok: false as const, error: "No internet connection" }));
                  setBusy(null);
                  if (!r.ok) return void toast.error(r.error);
                  sessionStorage.setItem("billerpe.outletPicked", o.id);
                  await pos.reload();
                  void navigate({ to: pos.home });
                }}
                className="tap flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-soft hover:border-primary"
              >
                <span className="inline-flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground">
                  <Store className="size-5" />
                </span>
                <span className="min-w-0 flex-1 font-display text-sm font-bold">
                  <span translate="no">{o.name}</span>
                </span>
                {busy === o.id ? (
                  <Spinner />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}
