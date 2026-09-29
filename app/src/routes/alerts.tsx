import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BellRing,
  CalendarClock,
  CheckCheck,
  QrCode,
  ReceiptText,
  Utensils,
  PrinterX,
  ShieldAlert,
} from "lucide-react";

import { AppShell } from "@/components/pos/AppShell";
import { EmptyState } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { dateTime } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type { AlertKind } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/alerts")({
  component: AlertsPage,
});

const kindMeta: Record<AlertKind, { icon: typeof Utensils; cls: string }> = {
  "food-ready": { icon: Utensils, cls: "bg-status-ready-soft text-status-ready" },
  "bill-requested": { icon: ReceiptText, cls: "bg-status-billed-soft text-status-billed" },
  "qr-order": { icon: QrCode, cls: "bg-primary-soft text-primary-soft-foreground" },
  "reservation-due": { icon: CalendarClock, cls: "bg-status-reserved-soft text-status-reserved" },
  "print-failed": { icon: PrinterX, cls: "bg-primary-soft text-primary-soft-foreground" },
  "owner-alert": { icon: ShieldAlert, cls: "bg-status-hold-soft text-status-hold" },
};

function AlertsPage() {
  const pos = usePos();
  const navigate = useNavigate();
  const alerts = pos.data?.alerts ?? [];

  return (
    <AppShell title="Alerts" subtitle={`${pos.unreadAlerts} unread`}>
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="tap"
          disabled={pos.unreadAlerts === 0}
          onClick={() => void pos.act((b) => b.markAlertsRead("all"))}
        >
          <CheckCheck className="size-4" /> Mark all read
        </Button>
      </div>

      <div className="mt-3 space-y-3">
        {alerts.length === 0 ? (
          <EmptyState
            icon={<BellRing className="size-6" />}
            title="Nothing to see yet"
            body="Food ready and bill requests will show up here."
          />
        ) : (
          alerts
            .slice()
            .sort((a, b) => +new Date(b.at) - +new Date(a.at))
            .map((a) => {
              const { icon: Icon, cls } = kindMeta[a.kind];
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    if (!a.read) void pos.act((b) => b.markAlertsRead([a.id]));
                    if (a.link) void navigate({ to: a.link });
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-left shadow-soft",
                    a.read ? "border-border" : "border-primary/30",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-9 shrink-0 items-center justify-center rounded-md",
                      cls,
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold">{a.title}</span>
                      {a.read ? null : <span className="size-2 rounded-full bg-primary" />}
                    </span>
                    <span className="block text-xs text-muted-foreground">{a.body}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {dateTime(a.at)}
                    </span>
                  </span>
                </button>
              );
            })
        )}
      </div>
    </AppShell>
  );
}
