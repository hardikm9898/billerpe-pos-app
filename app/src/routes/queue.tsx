import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BellRing, Plus, TimerReset, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Field, FormError } from "@/components/pos/kit";
import { PullToRefresh } from "@/components/pos/PullToRefresh";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { EmptyState, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { elapsed } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import { useNow } from "@/lib/pos/useNow";
import type { QueueEntry } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/queue")({
  component: QueuePage,
});

/** Walk-in waitlist: add, call, seat at a free table, no-show. */
function QueuePage() {
  const pos = usePos();
  const navigate = useNavigate();
  const now = useNow(15000);
  const [adding, setAdding] = useState(false);
  const [seating, setSeating] = useState<QueueEntry | null>(null);
  const waiting = (pos.data?.queue ?? [])
    .filter((q) => q.status === "waiting" || q.status === "called")
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const done = (pos.data?.queue ?? [])
    .filter((q) => q.status !== "waiting" && q.status !== "called")
    .slice(-8)
    .reverse();
  const canEdit = pos.can("queue", "edit");
  const freeTables = (pos.data?.tables ?? []).filter((t) => !t.orderId && t.status === "free");

  return (
    <AppShell title="Waitlist" subtitle={`${waiting.length} waiting`}>
      <PullToRefresh onRefresh={pos.reload}>
        {pos.can("queue", "create") ? (
          <Button className="tap w-full" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add to waitlist
          </Button>
        ) : null}
        <div className="mt-3 space-y-2">
          {waiting.length === 0 ? (
            <EmptyState
              icon={<TimerReset className="size-6" />}
              title="Nobody is waiting"
              body="Add walk-in guests here when the tables are full."
            />
          ) : (
            waiting.map((q, i) => (
              <div
                key={q.id}
                className={cn(
                  "rounded-lg border bg-card p-3 shadow-soft",
                  q.status === "called" ? "border-status-ready/50" : "border-border",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="num flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft font-display text-primary-soft-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold">
                      <span translate="no">{q.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <Users className="inline size-3" /> {q.guests} · waiting{" "}
                      {elapsed(q.joinedAt, now)}
                      {q.mobile ? ` · ${q.mobile}` : ""}
                      {q.status === "called" && q.calledAt
                        ? ` · called ${elapsed(q.calledAt, now)} ago`
                        : ""}
                    </p>
                    {q.note ? <p className="text-xs text-muted-foreground">{q.note}</p> : null}
                  </div>
                </div>
                {canEdit ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {q.status === "waiting" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="tap"
                        onClick={() => void pos.act((b) => b.setQueueStatus(q.id, "called"))}
                      >
                        <BellRing className="size-4" /> Call
                      </Button>
                    ) : null}
                    <Button size="sm" className="tap" onClick={() => setSeating(q)}>
                      Seat
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="tap"
                      onClick={() => void pos.act((b) => b.setQueueStatus(q.id, "noshow"))}
                    >
                      No-show
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="tap text-destructive"
                      onClick={() => void pos.act((b) => b.setQueueStatus(q.id, "cancelled"))}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
        {done.length ? (
          <div className="mt-6 space-y-1">
            <p className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Earlier
            </p>
            {done.map((q) => (
              <p key={q.id} className="text-sm text-muted-foreground">
                <span translate="no">{q.name}</span> · {q.guests} ·{" "}
                {q.status === "seated" ? "Seated" : q.status === "noshow" ? "No-show" : "Removed"}
              </p>
            ))}
          </div>
        ) : null}
      </PullToRefresh>

      <AddSheet open={adding} onClose={() => setAdding(false)} />

      <ResponsiveSheet
        open={Boolean(seating)}
        onOpenChange={(o) => !o && setSeating(null)}
        title={seating ? `Seat ${seating.name} (${seating.guests})` : ""}
        description="Pick a free table — the order starts there."
      >
        <div className="grid grid-cols-3 gap-2 py-2 sm:grid-cols-4">
          {freeTables.length === 0 ? (
            <p className="col-span-full text-sm text-muted-foreground">No free table right now.</p>
          ) : (
            freeTables.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={async () => {
                  if (!seating) return;
                  const r = await pos.act((b) => b.setQueueStatus(seating.id, "seated"));
                  if (!r.ok) return void toast.error(r.error);
                  const key = pos.draftKeyForTable(t.id);
                  pos.openDraft(key, { type: "dinin", tableId: t.id, guests: seating.guests });
                  pos.updateDraft(key, (d) => ({
                    ...d,
                    customerName: seating.name,
                    customerMobile: seating.mobile,
                  }));
                  setSeating(null);
                  if (pos.can("biller", "create"))
                    void navigate({ to: "/order/$key", params: { key } });
                }}
                className="tap rounded-md border border-border py-2 font-display text-sm font-bold hover:border-primary"
              >
                <span translate="no">{t.name}</span>
                <span className="block text-[10px] font-normal text-muted-foreground">
                  {t.seats} seats
                </span>
              </button>
            ))
          )}
        </div>
      </ResponsiveSheet>
    </AppShell>
  );
}

function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pos = usePos();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [guests, setGuests] = useState(2);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Add to waitlist"
      footer={
        <Button
          className="tap w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await pos.act((b) =>
              b.addToQueue({ name, mobile, guests, note: note || undefined }),
            );
            setBusy(false);
            if (!r.ok) return setError(r.error);
            setName("");
            setMobile("");
            setGuests(2);
            setNote("");
            setError(null);
            onClose();
          }}
        >
          {busy ? <Spinner /> : null} Add
        </Button>
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Name *" htmlFor="q-name">
          <Input
            id="q-name"
            className="tap"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile" htmlFor="q-mobile">
            <Input
              id="q-mobile"
              className="tap"
              inputMode="numeric"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="Guests" htmlFor="q-guests">
            <NumberField id="q-guests" value={guests} onChange={setGuests} decimals={0} />
          </Field>
        </div>
        <Field label="Note" htmlFor="q-note">
          <Input
            id="q-note"
            className="tap"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="High chair, outdoor…"
          />
        </Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}
