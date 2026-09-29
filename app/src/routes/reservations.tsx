import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarClock, Phone, Plus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Field, FormError } from "@/components/pos/kit";
import { PullToRefresh } from "@/components/pos/PullToRefresh";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dayLabel, money, time } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type { Reservation, ReservationStatus } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reservations")({
  component: ReservationsPage,
});

const statusCls: Record<ReservationStatus, string> = {
  booked: "bg-status-reserved-soft text-status-reserved",
  seated: "bg-status-ready-soft text-status-ready",
  noshow: "bg-status-hold-soft text-status-hold",
  cancelled: "bg-muted text-muted-foreground",
};
const statusLabel: Record<ReservationStatus, string> = {
  booked: "Booked",
  seated: "Seated",
  noshow: "No-show",
  cancelled: "Cancelled",
};

type Tab = "today" | "upcoming" | "past";

function ReservationsPage() {
  const pos = usePos();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("today");
  const [editing, setEditing] = useState<Reservation | "new" | null>(null);
  const list = pos.data?.reservations ?? [];
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const shown = list
    .filter((r) => {
      const at = new Date(r.at);
      if (tab === "today") return at >= startOfDay && at < endOfDay;
      if (tab === "upcoming") return at >= endOfDay && r.status === "booked";
      return at < startOfDay || r.status === "noshow" || r.status === "cancelled";
    })
    .sort((a, b) => (tab === "past" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)));
  const canEdit = pos.can("reservations", "edit");

  const seat = async (r: Reservation) => {
    const tableId = r.tableIds[0];
    const res = await pos.act((b) => b.setReservationStatus(r.id, "seated"));
    if (!res.ok) return void toast.error(res.error);
    if (tableId && pos.can("biller", "create")) {
      const key = pos.draftKeyForTable(tableId);
      pos.openDraft(key, { type: "dinin", tableId, guests: r.guests });
      pos.updateDraft(key, (d) => ({ ...d, customerName: r.name, customerMobile: r.mobile }));
      void navigate({ to: "/order/$key", params: { key } });
    } else toast.success(`${r.name} seated`);
  };

  return (
    <AppShell title="Reservations">
      <PullToRefresh onRefresh={pos.reload}>
        <div className="flex items-center gap-2">
          <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
            {(["today", "upcoming", "past"] as Tab[]).map((t) => (
              <Chip key={t} active={tab === t} onClick={() => setTab(t)}>
                {t === "today" ? "Today" : t === "upcoming" ? "Upcoming" : "Past"}
              </Chip>
            ))}
          </div>
          {pos.can("reservations", "create") ? (
            <Button size="sm" className="tap shrink-0" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Book
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          A booked table is held from 30 min before the time. If nobody arrives within 30 min, it is
          marked no-show and released.
        </p>
        <div className="mt-3 space-y-2">
          {shown.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="size-6" />}
              title="No reservations here"
              body={tab === "today" ? "Tap Book to add one." : undefined}
            />
          ) : (
            shown.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card p-3 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display font-bold">
                      <span translate="no">{r.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dayLabel(r.at)} · {time(r.at)}–{time(r.endAt)} ·{" "}
                      <Users className="inline size-3" /> {r.guests}
                      {r.tableIds.length
                        ? ` · ${r.tableIds
                            .map((id) => pos.tableById(id)?.name)
                            .filter(Boolean)
                            .join(", ")}`
                        : " · no table"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <Phone className="inline size-3" /> {r.mobile}
                      {r.advance ? ` · advance ${money(r.advance)}` : ""}
                      {r.note ? ` · ${r.note}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      statusCls[r.status],
                    )}
                  >
                    {statusLabel[r.status]}
                  </span>
                </div>
                {r.status === "booked" && canEdit ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" className="tap" onClick={() => void seat(r)}>
                      Seat now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="tap"
                      onClick={() => setEditing(r)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="tap"
                      onClick={() => void pos.act((b) => b.setReservationStatus(r.id, "noshow"))}
                    >
                      No-show
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="tap text-destructive"
                      onClick={() => void pos.act((b) => b.setReservationStatus(r.id, "cancelled"))}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </PullToRefresh>
      <ReservationSheet value={editing} onClose={() => setEditing(null)} />
    </AppShell>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function ReservationSheet({
  value,
  onClose,
}: {
  value: Reservation | "new" | null;
  onClose: () => void;
}) {
  const pos = usePos();
  const existing = value && value !== "new" ? value : undefined;
  const start = existing ? new Date(existing.at) : new Date(Date.now() + 3600000);
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    email: "",
    guests: 2,
    date: "",
    from: "",
    to: "",
    tableIds: [] as string[],
    advance: 0,
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const key = value ? (existing?.id ?? "new") : null;
  if (key !== openKey) {
    setOpenKey(key);
    if (value) {
      const end = existing ? new Date(existing.endAt) : new Date(start.getTime() + 90 * 60000);
      setForm({
        name: existing?.name ?? "",
        mobile: existing?.mobile ?? "",
        email: existing?.email ?? "",
        guests: existing?.guests ?? 2,
        date: toDateInput(start),
        from: toTimeInput(start),
        to: toTimeInput(end),
        tableIds: existing?.tableIds ?? [],
        advance: existing?.advance ?? 0,
        note: existing?.note ?? "",
      });
      setError(null);
    }
  }
  const save = async () => {
    const at = new Date(`${form.date}T${form.from}`);
    const endAt = new Date(`${form.date}T${form.to}`);
    if (Number.isNaN(at.getTime()) || Number.isNaN(endAt.getTime()))
      return setError("Pick the date and time");
    setBusy(true);
    const r = await pos.act((b) =>
      b.saveReservation({
        id: existing?.id,
        name: form.name,
        mobile: form.mobile,
        email: form.email || undefined,
        guests: form.guests,
        at: at.toISOString(),
        endAt: endAt.toISOString(),
        tableIds: form.tableIds,
        advance: form.advance,
        note: form.note || undefined,
      }),
    );
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(existing ? "Reservation updated" : "Reservation booked");
    onClose();
  };
  return (
    <ResponsiveSheet
      open={Boolean(value)}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Edit reservation" : "New reservation"}
      footer={
        <Button className="tap w-full" disabled={busy} onClick={() => void save()}>
          {busy ? <Spinner /> : null} Save
        </Button>
      }
    >
      <div className="space-y-3 py-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Guest name *" htmlFor="r-name">
            <Input
              id="r-name"
              className="tap"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Mobile *" htmlFor="r-mobile">
            <Input
              id="r-mobile"
              className="tap"
              inputMode="numeric"
              maxLength={10}
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date" htmlFor="r-date">
            <Input
              id="r-date"
              type="date"
              className="tap"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label="From" htmlFor="r-from">
            <Input
              id="r-from"
              type="time"
              className="tap"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
            />
          </Field>
          <Field label="To" htmlFor="r-to">
            <Input
              id="r-to"
              type="time"
              className="tap"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Guests" htmlFor="r-guests">
            <NumberField
              id="r-guests"
              value={form.guests}
              onChange={(v) => setForm({ ...form, guests: v })}
              decimals={0}
            />
          </Field>
          <Field label="Advance ₹" htmlFor="r-adv">
            <NumberField
              id="r-adv"
              value={form.advance}
              onChange={(v) => setForm({ ...form, advance: v })}
            />
          </Field>
        </div>
        <Field label="Tables (optional)">
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {(pos.data?.tables ?? []).map((t) => (
              <Chip
                key={t.id}
                active={form.tableIds.includes(t.id)}
                onClick={() =>
                  setForm({
                    ...form,
                    tableIds: form.tableIds.includes(t.id)
                      ? form.tableIds.filter((x) => x !== t.id)
                      : [...form.tableIds, t.id],
                  })
                }
              >
                <span translate="no">{t.name}</span>
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Email" htmlFor="r-email">
          <Input
            id="r-email"
            type="email"
            className="tap"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Note" htmlFor="r-note">
          <Textarea
            id="r-note"
            rows={2}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Birthday, window seat…"
          />
        </Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}
