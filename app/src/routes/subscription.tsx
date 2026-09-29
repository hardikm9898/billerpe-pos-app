import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, MessageSquareText, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Card, Field, FormError } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { dateTime, money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/subscription")({
  component: SubscriptionPage,
});

const plans = ["App Lite", "App Standard", "App Pro", "Web POS + Captain App"];

function SubscriptionPage() {
  const pos = usePos();
  const data = pos.data!;
  const sub = data.subscription;
  const tickets = data.tickets.filter((t) => t.kind !== "support");
  const days = Math.max(0, Math.ceil((new Date(sub.expiresAt).getTime() - Date.now()) / 86400000));
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  return (
    <AppShell title="Subscription">
      <div className="mx-auto max-w-2xl space-y-3">
        <Card>
          <p className="text-sm text-muted-foreground">Current plan</p>
          <p className="font-display text-2xl font-extrabold">{sub.plan}</p>
          <p
            className={`mt-1 flex items-center gap-1.5 text-sm font-semibold ${days <= 30 ? "text-status-hold" : "text-status-ready"}`}
          >
            <CalendarClock className="size-4" /> Expires in {days} days · {dateTime(sub.expiresAt)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              className="tap"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await pos.act((b) =>
                  b.raiseTicket(`Renew ${sub.plan}`, "Please renew my subscription", "renewal"),
                );
                setBusy(false);
                if (r.ok) toast.success("Renewal requested — our customer care team will call you");
                else toast.error(r.error);
              }}
            >
              {busy ? <Spinner /> : null} Renew
            </Button>
            <Button
              variant="outline"
              className="tap"
              onClick={() => {
                setPlan("");
                setNote("");
                setError(null);
                setDone(null);
                setOpen(true);
              }}
            >
              Request plan change
            </Button>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-2">
          <Card>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Smartphone className="size-4" /> Devices
            </p>
            <p className="num font-display text-xl font-extrabold">
              {data.devices.length} of {data.outlet.deviceLimit}
            </p>
            <Progress
              className="mt-2"
              value={(data.devices.length / data.outlet.deviceLimit) * 100}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Set by BillerPe support</p>
          </Card>
          <Card>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MessageSquareText className="size-4" /> E-bill credits
            </p>
            <p className="num font-display text-xl font-extrabold">{sub.ebillCredits}</p>
            <p className="text-xs text-muted-foreground">SMS e-bills left</p>
          </Card>
        </div>
        <section className="space-y-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Invoices
          </h2>
          {sub.invoices.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => toast.success(`${i.id} PDF downloaded`)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-3 text-left shadow-soft"
            >
              <span>
                <span className="block font-semibold">{i.id}</span>
                <span className="text-xs text-muted-foreground">
                  {dateTime(i.at)} · {i.plan}
                </span>
              </span>
              <span className="num">{money(i.amount)}</span>
            </button>
          ))}
        </section>
        {tickets.length ? (
          <section className="space-y-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Your requests
            </h2>
            {tickets.map((t) => (
              <p key={t.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <b>{t.id}</b> · {t.subject} · {dateTime(t.at)} ·{" "}
                {t.status === "open" ? "Open" : "Closed"}
              </p>
            ))}
          </section>
        ) : null}
      </div>

      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title="Request plan change"
        footer={
          done ? (
            <Button className="tap w-full" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <Button
              className="tap w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                if (!plan) {
                  setBusy(false);
                  return setError("Pick the plan you want");
                }
                const r = await pos.act((b) =>
                  b.raiseTicket(`Plan change to ${plan}`, note, "plan-change"),
                );
                setBusy(false);
                if (r.ok) setDone(r.ticketId);
                else setError(r.error);
              }}
            >
              {busy ? <Spinner /> : null} Send request
            </Button>
          )
        }
      >
        {done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 className="size-10 text-status-ready" />
            <p className="font-display text-lg font-bold">Request {done} created</p>
            <p className="text-sm text-muted-foreground">Our customer care team will call you.</p>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <Field label="Plan you want *">
              <div className="flex flex-wrap gap-2">
                {plans
                  .filter((p) => p !== sub.plan)
                  .map((p) => (
                    <Chip
                      key={p}
                      active={plan === p}
                      onClick={() => {
                        setPlan(p);
                        setError(null);
                      }}
                    >
                      {p}
                    </Chip>
                  ))}
              </div>
            </Field>
            <Field label="Note">
              <Textarea
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. We need a captain app for 3 more waiters"
              />
            </Field>
            <FormError error={error} />
          </div>
        )}
      </ResponsiveSheet>
    </AppShell>
  );
}
