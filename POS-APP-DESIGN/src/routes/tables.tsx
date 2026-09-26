import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Ban,
  Clock,
  Merge,
  Printer,
  QrCode,
  Send,
  Table2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { PullToRefresh } from "@/components/pos/PullToRefresh";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import {
  Chip,
  EmptyState,
  GridSkeleton,
  NumberField,
  StatusPill,
  statusLabel,
} from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { can, canSpecial } from "@/lib/pos/permissions";
import { elapsed, money, time } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import { useNow } from "@/lib/pos/useNow";
import type { PosTable, TableStatus } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tables")({
  head: () => ({
    meta: [
      { title: "Tables — BillerPe POS" },
      {
        name: "description",
        content:
          "Live table plan with running amounts, held orders, reservations and waiting QR orders.",
      },
      { property: "og:title", content: "Tables — BillerPe POS" },
      {
        property: "og:description",
        content: "Live table plan with running amounts, held orders and reservations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TablesPage,
});

const filters: { key: TableStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "free", label: "Free" },
  { key: "running", label: "Running" },
  { key: "hold", label: "Hold" },
  { key: "billed", label: "Bill generated" },
  { key: "reserved", label: "Reserved" },
];

const ring: Record<TableStatus, string> = {
  free: "border-border",
  running: "border-status-running/45",
  hold: "border-status-hold/50",
  billed: "border-status-billed/45",
  reserved: "border-status-reserved/45",
};

function TableCard({
  table,
  onOpen,
  onLongPress,
}: {
  table: PosTable;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const pos = usePos();
  const now = useNow();
  const order = pos.orderForTable(table.id);
  const amountDue = order ? pos.totalsFor(order).total : 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress();
      }}
      onTouchStart={() => {
        timer = setTimeout(onLongPress, 500);
      }}
      onTouchEnd={() => clearTimeout(timer)}
      onTouchMove={() => clearTimeout(timer)}
      className={cn(
        "flex min-h-28 flex-col gap-2 rounded-lg border bg-card p-3 text-left shadow-soft transition-colors active:bg-muted",
        ring[table.status],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="num text-lg">{table.name}</span>
        <StatusPill status={table.status} />
      </div>

      {table.status === "free" ? (
        <span className="text-xs text-muted-foreground">{table.seats} seats</span>
      ) : (
        <div className="space-y-1">
          <span className="num block text-base">{money(amountDue)}</span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" /> {table.guests}
            </span>
            {table.openedAt ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" /> {elapsed(table.openedAt, now)}
              </span>
            ) : null}
            {table.captainName ? <span className="truncate">{table.captainName.split(" ")[0]}</span> : null}
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-1">
        {table.qrOrderWaiting ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary-soft-foreground">
            <QrCode className="size-3" /> QR
          </span>
        ) : null}
        {table.reservedFor ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-status-reserved-soft px-1.5 py-0.5 text-[10px] font-bold text-status-reserved">
            Reserved {time(table.reservedFor)}
          </span>
        ) : null}
        {table.mergedWith?.length ? (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
            + {table.mergedWith.join(", ")}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function TablesPage() {
  const pos = usePos();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<TableStatus | "all">("all");
  const [sheetTable, setSheetTable] = useState<PosTable | null>(null);
  const [mode, setMode] = useState<"actions" | "transfer" | "merge" | "movekot" | "guests" | "cancel">(
    "actions",
  );
  const [guests, setGuests] = useState(2);
  const [reason, setReason] = useState("");
  const [openGuests, setOpenGuests] = useState<PosTable | null>(null);
  const [busy, setBusy] = useState(false);

  const sectionId = pos.lastSectionId;
  const sectionTables = useMemo(
    () => pos.tables.filter((t) => t.sectionId === sectionId),
    [pos.tables, sectionId],
  );
  const counts = useMemo(() => {
    const base: Record<string, number> = { all: sectionTables.length };
    for (const f of filters) if (f.key !== "all") base[f.key] = 0;
    for (const t of sectionTables) base[t.status] = (base[t.status] ?? 0) + 1;
    return base;
  }, [sectionTables]);

  const visible = sectionTables.filter((t) => filter === "all" || t.status === filter);
  const canMergeTransfer = canSpecial(pos.permissions, "mergeTransferTables");
  const freeTables = pos.tables.filter((t) => t.status === "free" && t.id !== sheetTable?.id);
  const order = sheetTable ? pos.orderForTable(sheetTable.id) : undefined;

  const closeSheet = () => {
    setSheetTable(null);
    setMode("actions");
    setReason("");
  };

  const openTable = async (table: PosTable, guestCount: number) => {
    setBusy(true);
    const res = await pos.openTable(table.id, guestCount);
    setBusy(false);
    setOpenGuests(null);
    if (res.ok && res.orderId) void navigate({ to: "/order/$orderId", params: { orderId: res.orderId } });
  };

  const handleTap = (table: PosTable) => {
    const existing = pos.orderForTable(table.id);
    if (existing) {
      void navigate({ to: "/order/$orderId", params: { orderId: existing.id } });
      return;
    }
    setGuests(Math.min(table.seats, 2));
    setOpenGuests(table);
  };

  return (
    <AppShell title={pos.outlet.name} subtitle="Tables">
      <PullToRefresh onRefresh={pos.refresh}>
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
          {pos.sections.map((s) => (
            <Chip
              key={s.id}
              active={s.id === sectionId}
              onClick={() => pos.setLastSection(s.id)}
            >
              {s.name}
            </Chip>
          ))}
        </div>

        <div className="no-scrollbar -mx-3 mt-3 flex gap-2 overflow-x-auto px-3">
          {filters.map((f) => (
            <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
              <span className="num text-[11px] opacity-80">{counts[f.key] ?? 0}</span>
            </Chip>
          ))}
        </div>

        <div className="mt-4">
          {pos.booting ? (
            <GridSkeleton />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Table2 className="size-6" />}
              title="No tables here"
              body="Change the filter, or add tables to this section from Tables setup."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {visible.map((t) => (
                <TableCard
                  key={t.id}
                  table={t}
                  onOpen={() => handleTap(t)}
                  onLongPress={() => {
                    setSheetTable(t);
                    setMode("actions");
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Tap a table to take an order · long-press for table actions
        </p>
      </PullToRefresh>

      {/* Guests before opening a free table */}
      <ResponsiveSheet
        open={Boolean(openGuests)}
        onOpenChange={(o) => !o && setOpenGuests(null)}
        title={openGuests ? `Open ${openGuests.name}` : "Open table"}
        description="How many guests are seated?"
        footer={
          <Button
            className="tap w-full"
            disabled={busy}
            onClick={() => openGuests && void openTable(openGuests, guests)}
          >
            Start order
          </Button>
        }
      >
        <div className="space-y-2 py-2">
          <Label htmlFor="guests">Guests</Label>
          <NumberField id="guests" value={guests} onChange={setGuests} decimals={0} />
        </div>
      </ResponsiveSheet>

      {/* Table actions */}
      <ResponsiveSheet
        open={Boolean(sheetTable)}
        onOpenChange={(o) => !o && closeSheet()}
        title={sheetTable ? `${sheetTable.name} · ${statusLabel(sheetTable.status)}` : "Table actions"}
        description={
          mode === "actions"
            ? order
              ? `${order.code} · ${money(pos.totalsFor(order).total)}`
              : "This table is free."
            : undefined
        }
      >
        {mode === "actions" ? (
          <div className="space-y-2 py-2">
            {[
              {
                key: "transfer",
                label: "Transfer table",
                icon: ArrowLeftRight,
                show: Boolean(order) && canMergeTransfer,
              },
              { key: "merge", label: "Merge tables", icon: Merge, show: Boolean(order) && canMergeTransfer },
              { key: "movekot", label: "Move KOT to another table", icon: Send, show: Boolean(order?.rounds.length) },
              { key: "guests", label: "Change guests", icon: Users, show: Boolean(order) },
            ]
              .filter((a) => a.show)
              .map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setGuests(order?.guests ?? 2);
                    setMode(key as typeof mode);
                  }}
                  className="tap flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted"
                >
                  <Icon className="size-4 text-muted-foreground" /> {label}
                </button>
              ))}

            {order && (canSpecial(pos.permissions, "printBill") || can(pos.permissions, "billing", "create")) ? (
              <button
                type="button"
                onClick={async () => {
                  const r = await pos.printBill(order.id);
                  if (r.ok) { toast.success(`Bill ${order.code} printed`); closeSheet(); } else toast.error(r.error ?? "Could not print");
                }}
                className="tap flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted"
              >
                <Printer className="size-4 text-muted-foreground" /> Print bill
              </button>
            ) : null}

            {order && canSpecial(pos.permissions, "deleteOrder") ? (
              <button
                type="button"
                onClick={() => setMode("cancel")}
                className="tap flex w-full items-center gap-3 rounded-md border border-primary/30 bg-primary-soft px-3 py-2.5 text-left text-sm font-semibold text-primary-soft-foreground"
              >
                <Ban className="size-4" /> Cancel order
              </button>
            ) : null}

            {sheetTable?.status === "hold" ? (
              <p className="rounded-md bg-status-hold-soft p-3 text-xs text-status-hold">
                This table is on hold. Held tables cannot be merged — resume the order first.
              </p>
            ) : null}

            {!order ? (
              <p className="py-2 text-sm text-muted-foreground">
                Tap the table to seat guests and start an order.
              </p>
            ) : null}
          </div>
        ) : null}

        {mode === "transfer" || mode === "merge" || mode === "movekot" ? (
          <div className="space-y-2 py-2">
            <p className="text-xs text-muted-foreground">
              {mode === "merge"
                ? "Pick the table to merge into (both need a running order)."
                : mode === "movekot"
                  ? "Pick the table to move the latest KOT to."
                  : "Pick a free table."}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(mode === "merge"
                ? pos.tables.filter((t) => t.id !== sheetTable?.id && t.status === "running")
                : freeTables
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (!sheetTable || !order) return;
                    setBusy(true);
                    const res =
                      mode === "transfer"
                        ? await pos.transferTable(order.id, t.id)
                        : mode === "merge"
                          ? await pos.mergeTables(sheetTable.id, t.id)
                          : await pos.moveKot(order.id, order.rounds[order.rounds.length - 1]!.kotNo, t.id);
                    setBusy(false);
                    if (res.ok) {
                      toast.success(
                        mode === "transfer"
                          ? `Moved to ${t.name}`
                          : mode === "merge"
                            ? `${sheetTable.name} merged into ${t.name}`
                            : `KOT moved to ${t.name}`,
                      );
                      closeSheet();
                    } else {
                      toast.error(res.error ?? "Could not complete this");
                    }
                  }}
                  className="tap rounded-md border border-border py-2 font-display text-sm font-bold hover:border-primary"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {mode === "guests" ? (
          <div className="space-y-3 py-2">
            <Label htmlFor="new-guests">Guests</Label>
            <NumberField id="new-guests" value={guests} onChange={setGuests} decimals={0} />
            <Button
              className="tap w-full"
              onClick={async () => {
                if (!order) return;
                await pos.setGuests(order.id, guests);
                toast.success(`Guests updated to ${guests}`);
                closeSheet();
              }}
            >
              Save
            </Button>
          </div>
        ) : null}

        {mode === "cancel" ? (
          <div className="space-y-3 py-2">
            <Label htmlFor="reason">Reason for cancelling</Label>
            <Input
              id="reason"
              className="tap"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Guest left, duplicate order…"
            />
            <Button
              variant="destructive"
              className="tap w-full"
              onClick={async () => {
                if (!order) return;
                const res = await pos.cancelOrder(order.id, reason);
                if (res.ok) {
                  toast.success("Order cancelled");
                  closeSheet();
                } else toast.error(res.error ?? "Could not cancel");
              }}
            >
              Cancel order
            </Button>
          </div>
        ) : null}
      </ResponsiveSheet>
    </AppShell>
  );
}
