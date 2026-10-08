import { CalendarPlus, CreditCard, LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Logo, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { usePos } from "@/lib/pos/store";

// The outlet's BillerPe plan (owner 2026-10-08): when it ends the whole app
// locks at once. The lock screen offers the renewal payment link, and ONE
// "Extend 1 day"; once that day is used, only paying unlocks it. While the
// extra day runs, a banner says so on every screen.

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

async function openPay(pos: ReturnType<typeof usePos>, setError: (e: string | null) => void) {
  const r = await pos.planPayLink();
  if (!r.ok || !r.url) return setError(r.error || "Could not make the payment link. Call BillerPe.");
  // Outside the app: the phone's browser / UPI app.
  window.open(r.url, "_blank");
}

export function PlanLockScreen() {
  const pos = usePos();
  const plan = pos.plan;
  const [busy, setBusy] = useState<"" | "pay" | "extend" | "check">("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const run = async (kind: "pay" | "extend" | "check", fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } finally {
      setBusy("");
    }
  };
  return (
    <div role="alertdialog" aria-label="BillerPe plan ended" className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-10 text-center">
      <Logo size={56} />
      <h1 className="mt-6 text-2xl font-bold text-foreground">Your BillerPe plan has ended</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{plan?.message || "The app is locked until the plan is renewed."}</p>
      {plan?.outlet ? <p className="mt-1 text-sm font-semibold text-foreground">{plan.outlet}{plan.paidUntil ? ` · ended ${when(plan.paidUntil)}` : ""}</p> : null}
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Button size="lg" disabled={!!busy} onClick={() => void run("pay", () => openPay(pos, setError))}>
          {busy === "pay" ? <Spinner /> : <CreditCard className="size-5" />} Renew now (pay online)
        </Button>
        {plan?.canExtend ? (
          <Button
            size="lg"
            variant="outline"
            disabled={!!busy}
            onClick={() =>
              void run("extend", async () => {
                const r = await pos.extendPlan();
                if (!r.ok) setError(r.error || "Could not extend.");
              })
            }
          >
            {busy === "extend" ? <Spinner /> : <CalendarPlus className="size-5" />} Extend 1 day (once)
          </Button>
        ) : (
          <p className="text-xs font-semibold text-muted-foreground">The 1-day extension is already used.</p>
        )}
        <Button
          size="lg"
          variant="outline"
          disabled={!!busy}
          onClick={() =>
            void run("check", async () => {
              const p = await pos.refreshPlan();
              if (p && !p.expired) await pos.reload();
              else setNote("Not renewed yet. After paying online it unlocks within a minute.");
            })
          }
        >
          {busy === "check" ? <Spinner /> : <RefreshCw className="size-5" />} I have paid: check again
        </Button>
        <Button variant="ghost" onClick={() => void pos.logout()}>
          <LogOut className="size-5" /> Log out
        </Button>
      </div>
      {error ? <p role="alert" className="mt-4 max-w-sm text-sm font-semibold text-destructive">{error}</p> : null}
      {note ? <p className="mt-4 max-w-sm text-sm text-muted-foreground">{note}</p> : null}
      <p className="mt-8 max-w-sm text-xs text-muted-foreground">Bills already made are safe. Call BillerPe support if you need help renewing.</p>
    </div>
  );
}

/** While the one extra day runs: on top of every screen. */
export function PlanBanner() {
  const pos = usePos();
  const [error, setError] = useState<string | null>(null);
  return (
    <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center gap-2 bg-primary px-3 py-2 text-primary-foreground">
      <p className="min-w-0 flex-1 text-xs font-semibold">{error || pos.plan?.message || "Your plan was extended by 1 day."}</p>
      <button type="button" onClick={() => void openPay(pos, setError)} className="rounded-full bg-background px-3 py-1 text-xs font-bold text-primary">
        Renew now
      </button>
    </div>
  );
}
