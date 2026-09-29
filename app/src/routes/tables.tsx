import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Ban,
  CalendarClock,
  Clock,
  Merge,
  Printer,
  QrCode,
  ReceiptText,
  Send,
  ShoppingCart,
  Table2,
  Users,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { PullToRefresh } from "@/components/pos/PullToRefresh";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import {
  Chip,
  EmptyState,
  NumberField,
  StatusPill,
  statusLabel,
} from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { elapsed, money, time } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import { useNow } from "@/lib/pos/useNow";
import type { Order, PosTable, TableStatus } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tables")({
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

// The whole card in the state's colour, like the Web POS table grid.
const fill: Record<TableStatus, string> = {
  free: "border-border bg-card",
  running: "border-transparent bg-status-running-soft text-status-running",
  hold: "border-transparent bg-status-hold-soft text-status-hold",
  billed: "border-transparent bg-status-billed-soft text-status-billed",
  reserved: "border-transparent bg-status-reserved-soft text-status-reserved",
};

function TableCard({
  table,
  order,
  cartItems,
  onOpen,
  onLongPress,
}: {
  table: PosTable;
  order: Order | undefined;
  cartItems: number;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const now = useNow();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const long = useRef(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (long.current) {
          long.current = false;
          return;
        }
        onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress();
      }}
      onTouchStart={() => {
        long.current = false;
        timer.current = setTimeout(() => {
          long.current = true;
          onLongPress();
        }, 500);
      }}
      onTouchEnd={() => clearTimeout(timer.current)}
      onTouchMove={() => clearTimeout(timer.current)}
      aria-label={`${table.name}, ${statusLabel(table.status)}`}
      className={cn(
        "flex min-h-28 flex-col gap-2 rounded-lg border p-3 text-left shadow-soft transition-[filter] active:brightness-95",
        fill[table.status],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="num text-lg">
          <span translate="no">{table.name}</span>
        </span>
        {table.status === "free" ? (
          <StatusPill status={table.status} />
        ) : (
          <span className="text-[11px] font-semibold opacity-90">{statusLabel(table.status)}</span>
        )}
      </div>
      {!order ? (
        <span
          className={cn(
            "text-xs",
            table.status === "free" ? "text-muted-foreground" : "opacity-80",
          )}
        >
          {table.seats} seats
        </span>
      ) : (
        <div className="space-y-1">
          <span className="num block text-base">{money(order.totals.grand)}</span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] opacity-80">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" /> {order.guests}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" /> {elapsed(order.createdAt, now)}
            </span>
            <span className="truncate">{order.captainName.split(" ")[0]}</span>
          </div>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-1">
        {cartItems > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-card/80 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
            <ShoppingCart className="size-3" /> {cartItems} not sent
          </span>
        ) : null}
        {table.qrWaiting ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary-soft-foreground">
            <QrCode className="size-3" /> QR
          </span>
        ) : null}
        {table.reservation ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-status-reserved-soft px-1.5 py-0.5 text-[10px] font-bold text-status-reserved">
            <CalendarClock className="size-3" /> {time(table.reservation.at)}
          </span>
        ) : null}
      </div>
    </button>
  );
}

type Mode = "actions" | "transfer" | "merge" | "movekot" | "movekot-to" | "guests" | "cancel";

function TablesPage() {
  const pos = usePos();
  const navigate = useNavigate();
  const data = pos.data!;
  const [filter, setFilter] = useState<TableStatus | "all">("all");
  const [sheetTable, setSheetTable] = useState<PosTable | null>(null);
  const [mode, setMode] = useState<Mode>("actions");
  const [kotNo, setKotNo] = useState<number | null>(null);
  const [guests, setGuests] = useState(2);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Sections in rank order. "All" (the default) shows every table: as one
  // grid ("tabs" view) or grouped under each section ("sections" view) -
  // the outlet's Table grid view setting, like the Web POS.
  const sections = [...data.sections].sort((a, b) => a.rank - b.rank);
  const grouped = data.settings.tableGridView === "sections";
  const sectionId =
    !grouped && sections.some((s) => s.id === pos.lastSectionId) ? pos.lastSectionId! : "all";
  const sectionTables = useMemo(
    () =>
      sectionId === "all" ? data.tables : data.tables.filter((t) => t.sectionId === sectionId),
    [data.tables, sectionId],
  );
  const counts = useMemo(() => {
    const base: Record<string, number> = { all: sectionTables.length };
    for (const t of sectionTables) base[t.status] = (base[t.status] ?? 0) + 1;
    return base;
  }, [sectionTables]);
  const visible = sectionTables.filter((t) => filter === "all" || t.status === filter);
  const card = (t: PosTable) => (
    <TableCard
      key={t.id}
      table={t}
      order={pos.orderForTable(t.id)}
      cartItems={pos.draft(pos.draftKeyForTable(t.id))?.lines.length ?? 0}
      onOpen={() => openTable(t)}
      onLongPress={() => {
        setSheetTable(t);
        setMode("actions");
      }}
    />
  );

  const order = sheetTable ? pos.orderForTable(sheetTable.id) : undefined;
  const canMergeTransfer = pos.canSpecial("tables.mergeTransfer");
  const canPrint = pos.can("biller", "create");
  const hasInvoicePrinter = Boolean(pos.thisDevice?.printers.some((p) => p.printsInvoice));
  const canOrder = pos.can("biller", "create");

  const closeSheet = () => {
    setSheetTable(null);
    setMode("actions");
    setReason("");
    setKotNo(null);
  };

  const openTable = (table: PosTable) => {
    const existing = pos.orderForTable(table.id);
    const key = pos.draftKeyForTable(table.id);
    const cart = pos.draft(key);
    if (existing || (cart && cart.lines.length > 0)) {
      pos.openDraft(key, { type: "dinin", tableId: table.id });
      void navigate({ to: "/order/$key", params: { key } });
      return;
    }
    if (!canOrder) return void toast.info("You can view tables but not take orders.");
    // Straight to the order, 1 guest (changed there with - / +), like the
    // Web POS - no "how many guests" question first (owner, 2026-09-26).
    // Only a cart on this phone: the table stays Free until the first KOT or Hold.
    if (table.reservation)
      toast.info(
        `${table.name} is reserved for ${table.reservation.name} at ${time(table.reservation.at)}`,
      );
    pos.openDraft(key, { type: "dinin", tableId: table.id, guests: 1 });
    void navigate({ to: "/order/$key", params: { key } });
  };

  const run = async (
    fn: () => Promise<{ ok: boolean; error?: string | undefined }>,
    success: string,
  ) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) {
      toast.success(success);
      closeSheet();
    } else toast.error(r.error ?? "Could not complete this");
  };

  const targets =
    mode === "transfer"
      ? data.tables.filter((t) => !t.orderId && t.id !== sheetTable?.id)
      : mode === "merge"
        ? data.tables.filter((t) => t.id !== sheetTable?.id && t.orderId && t.status !== "hold")
        : data.tables.filter((t) => t.id !== sheetTable?.id && t.status !== "hold");

  return (
    <AppShell title={data.outlet.name} subtitle="Tables">
      <PullToRefresh onRefresh={pos.reload}>
        {sections.length === 0 ? (
          <EmptyState
            icon={<Table2 className="size-6" />}
            title="No tables yet"
            body="Add sections and tables from Tables setup."
          />
        ) : (
          <>
            {grouped ? null : (
              <div className="no-scrollbar -mx-3 mb-3 flex gap-2 overflow-x-auto px-3">
                <Chip active={sectionId === "all"} onClick={() => pos.setLastSection("all")}>
                  All
                </Chip>
                {sections.map((s) => (
                  <Chip
                    key={s.id}
                    active={s.id === sectionId}
                    onClick={() => pos.setLastSection(s.id)}
                  >
                    <span translate="no">{s.name}</span>
                  </Chip>
                ))}
              </div>
            )}
            <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
              {filters.map((f) => (
                <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
                  {f.label}
                  <span className="num text-[11px] opacity-80">{counts[f.key] ?? 0}</span>
                </Chip>
              ))}
            </div>
            <div className="mt-4">
              {visible.length === 0 ? (
                <EmptyState
                  icon={<Table2 className="size-6" />}
                  title="No tables here"
                  body="Change the filter, or add tables from Tables setup."
                />
              ) : grouped ? (
                <div className="space-y-5">
                  {sections.map((s) => {
                    const list = visible.filter((t) => t.sectionId === s.id);
                    if (!list.length) return null;
                    return (
                      <section key={s.id}>
                        <h2 className="mb-2 flex items-baseline gap-2 font-display text-sm font-bold">
                          <span translate="no">{s.name}</span>
                          <span className="text-xs font-semibold text-muted-foreground">
                            {list.length} table{list.length === 1 ? "" : "s"}
                          </span>
                        </h2>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                          {list.map(card)}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                  {visible.map(card)}
                </div>
              )}
            </div>
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Tap a table to take an order · long-press for table actions
            </p>
          </>
        )}
      </PullToRefresh>

      <ResponsiveSheet
        open={Boolean(sheetTable)}
        onOpenChange={(o) => !o && closeSheet()}
        title={
          sheetTable ? `${sheetTable.name} · ${statusLabel(sheetTable.status)}` : "Table actions"
        }
        description={
          mode === "actions"
            ? order
              ? `Bill ${order.billNo} · ${money(order.totals.grand)}`
              : "This table is free."
            : undefined
        }
      >
        {mode === "actions" && sheetTable ? (
          <div className="space-y-2 py-2">
            {!order ? (
              <p className="py-2 text-sm text-muted-foreground">
                Tap the table to seat guests and start an order.
              </p>
            ) : (
              <>
                {canMergeTransfer ? (
                  <>
                    <ActionRow
                      icon={ArrowLeftRight}
                      label="Transfer to another table"
                      onClick={() => setMode("transfer")}
                    />
                    <ActionRow
                      icon={Merge}
                      label="Merge with another table"
                      disabled={order.status === "hold"}
                      hint={
                        order.status === "hold"
                          ? "Held tables cannot be merged — send or clear the held items first."
                          : undefined
                      }
                      onClick={() => setMode("merge")}
                    />
                    {order.kots.length ? (
                      <ActionRow
                        icon={Send}
                        label="Move a KOT to another table"
                        onClick={() => setMode("movekot")}
                      />
                    ) : null}
                  </>
                ) : null}
                <ActionRow
                  icon={Users}
                  label="Change guests"
                  onClick={() => {
                    setGuests(order.guests);
                    setMode("guests");
                  }}
                />
                {pos.can("biller", "edit") && order.status === "billed" ? (
                  <ActionRow
                    icon={ReceiptText}
                    label="Open bill & settle"
                    onClick={() =>
                      void navigate({ to: "/bill/$orderId", params: { orderId: order.id } })
                    }
                  />
                ) : null}
                {canPrint && order.status !== "billed" ? (
                  hasInvoicePrinter ? (
                    <ActionRow
                      icon={Printer}
                      label="Print bill"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const r = await pos.printBill(order.id);
                          if (r.ok && r.print && r.print.outcomes.some((o) => !o.ok))
                            toast.error("Bill saved but the printer did not respond");
                          return r;
                        }, `Bill ${order.billNo} printed`)
                      }
                    />
                  ) : (
                    <ActionRow
                      icon={ReceiptText}
                      label="Send bill to the counter"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => pos.act((b) => b.requestBill(order.id)),
                          "Bill sent to the counter",
                        )
                      }
                    />
                  )
                ) : null}
                {pos.canSpecial("orders.deleteOrder") ? (
                  <ActionRow
                    icon={Ban}
                    label="Cancel order"
                    danger
                    onClick={() => setMode("cancel")}
                  />
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {mode === "movekot" && order ? (
          <div className="space-y-2 py-2">
            <p className="text-xs text-muted-foreground">Which KOT should move?</p>
            {order.kots.map((k) => (
              <button
                key={k.kotNo}
                type="button"
                onClick={() => {
                  setKotNo(k.kotNo);
                  setMode("movekot-to");
                }}
                className="tap flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary"
              >
                <span className="font-semibold">
                  KOT #{k.kotNo} · round {k.round}
                </span>
                <span className="truncate pl-2 text-xs text-muted-foreground">
                  {k.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {(mode === "transfer" || mode === "merge" || mode === "movekot-to") &&
        sheetTable &&
        order ? (
          <div className="space-y-2 py-2">
            <p className="text-xs text-muted-foreground">
              {mode === "merge"
                ? "Pick the table to merge into (held tables are not listed)."
                : mode === "movekot-to"
                  ? `Move KOT #${kotNo} to — it joins that table's order, or starts a new one on a free table.`
                  : "Pick a free table."}
            </p>
            {targets.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No table can take this right now.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {targets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          pos.act((b) =>
                            mode === "transfer"
                              ? b.transferTable(order.id, t.id)
                              : mode === "merge"
                                ? b.mergeTables(sheetTable.id, t.id)
                                : b.moveKot(order.id, kotNo!, t.id),
                          ),
                        mode === "transfer"
                          ? `Moved to ${t.name}`
                          : mode === "merge"
                            ? `${sheetTable.name} merged into ${t.name}`
                            : `KOT #${kotNo} moved to ${t.name}`,
                      )
                    }
                    className="tap rounded-md border border-border py-2 font-display text-sm font-bold hover:border-primary"
                  >
                    <span translate="no">{t.name}</span>
                    {t.orderId ? (
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        {statusLabel(t.status)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {mode === "guests" && order ? (
          <div className="space-y-3 py-2">
            <Label htmlFor="new-guests">Guests</Label>
            <NumberField id="new-guests" value={guests} onChange={setGuests} decimals={0} />
            <Button
              className="tap w-full"
              disabled={busy}
              onClick={() =>
                void run(
                  () => pos.act((b) => b.setGuests(order.id, guests)),
                  `Guests updated to ${guests}`,
                )
              }
            >
              Save
            </Button>
          </div>
        ) : null}

        {mode === "cancel" && order ? (
          <div className="space-y-3 py-2">
            <Label htmlFor="reason">Reason for cancelling</Label>
            <div className="flex flex-wrap gap-2">
              {["Guest left", "Duplicate order", "Wrong table"].map((r) => (
                <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
                  {r}
                </Chip>
              ))}
            </div>
            <Input
              id="reason"
              className="tap"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Or type a reason"
            />
            <Button
              variant="destructive"
              className="tap w-full"
              disabled={busy || !reason.trim()}
              onClick={() =>
                void run(() => pos.act((b) => b.cancelOrder(order.id, reason)), "Order cancelled")
              }
            >
              Cancel order
            </Button>
          </div>
        ) : null}
      </ResponsiveSheet>
    </AppShell>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
  hint,
}: {
  icon: typeof Ban;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string | undefined;
}) {
  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "tap flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm font-semibold disabled:opacity-50",
          danger
            ? "border-primary/30 bg-primary-soft text-primary-soft-foreground"
            : "border-border hover:bg-muted",
        )}
      >
        <Icon className={cn("size-4", danger ? "" : "text-muted-foreground")} /> {label}
      </button>
      {hint ? <p className="mt-1 px-1 text-[11px] text-status-hold">{hint}</p> : null}
    </div>
  );
}
