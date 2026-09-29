import { createFileRoute } from "@tanstack/react-router";
import { History, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { beep } from "@/lib/pos/sound";
import { AppShell } from "@/components/pos/AppShell";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, VegMark } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { elapsed, qty, time } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import { useNow } from "@/lib/pos/useNow";
import { routeToKitchens } from "@/lib/pos/routing";
import type { LineStatus, Order, OrderLine } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kds")({
  component: KdsPage,
});

type Stage = "new" | "preparing" | "ready" | "served";
const rank: Record<LineStatus, number> = { sent: 0, preparing: 1, ready: 2, served: 3 };
const stages: Stage[] = ["new", "preparing", "ready", "served"];

interface KdsCard {
  key: string;
  order: Order;
  kotNo: number;
  sentAt: string;
  lines: OrderLine[];
  stage: Stage;
  label: string;
}

function KdsPage() {
  const pos = usePos();
  const now = useNow(15000);
  const data = pos.data!;
  const kitchens = data.settings.kitchens;
  const [kitchenId, setKitchen] = useState(kitchens[0]?.id ?? "");
  const kitchen = kitchens.find((k) => k.id === kitchenId) ?? kitchens[0];
  const [sound, setSound] = useState(true);
  const [recallOpen, setRecallOpen] = useState(false);
  const seen = useRef<Set<string> | null>(null);

  const cards = useMemo(() => {
    const out: KdsCard[] = [];
    if (!kitchen) return out;
    // Finished orders (settled or cancelled) leave every kitchen screen (owner rule).
    for (const o of data.orders) {
      if (o.status !== "running" && o.status !== "hold" && o.status !== "billed") continue;
      const table = pos.tableById(o.tableId);
      for (const k of o.kots) {
        // A KOT printed with the bill (bill-with-KOT) never goes to a KDS.
        if (!k.kitchenIds.includes(kitchen.id)) continue;
        const lines =
          routeToKitchens(kitchens, k.lines, o.type, table).find((r) => r.kitchen.id === kitchen.id)
            ?.lines ?? [];
        if (!lines.length) continue;
        const min = Math.min(...lines.map((l) => rank[l.status]));
        out.push({
          key: `${o.id}-${k.kotNo}`,
          order: o,
          kotNo: k.kotNo,
          sentAt: k.firedAt,
          lines,
          stage: stages[min]!,
          label: table?.name ?? `Token #${o.token || "—"}`,
        });
      }
    }
    return out.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  }, [data, pos, kitchen, kitchens]);

  useEffect(() => {
    const ids = new Set(cards.filter((c) => c.stage === "new").map((c) => c.key));
    if (seen.current) {
      const fresh = [...ids].some((id) => !seen.current!.has(id));
      if (fresh && sound) beep();
    }
    seen.current = ids;
  }, [cards, sound]);

  const served = cards
    .filter((c) => c.stage === "served")
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, 20);
  const cols: { stage: Stage; title: string; cls: string }[] = [
    { stage: "new", title: "New", cls: "bg-status-running-soft text-status-running" },
    { stage: "preparing", title: "Preparing", cls: "bg-status-hold-soft text-status-hold" },
    { stage: "ready", title: "Ready", cls: "bg-status-ready-soft text-status-ready" },
  ];

  return (
    <AppShell
      title="Kitchen display"
      subtitle={`${data.outlet.name} · ${kitchen?.name ?? "No kitchen"}`}
      noTabs={pos.session?.user.role === "Kitchen Staff"}
      fullBleed
    >
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
            {kitchens.map((k) => (
              <Chip
                key={k.id}
                active={k.id === kitchen?.id}
                onClick={() => setKitchen(k.id)}
                className="h-11 px-4 text-base"
              >
                <span translate="no">{k.name}</span>
              </Chip>
            ))}
          </div>
          <Button
            variant="outline"
            className="tap"
            onClick={() => setSound((s) => !s)}
            aria-pressed={sound}
          >
            {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />} Sound{" "}
            {sound ? "on" : "off"}
          </Button>
          <Button variant="outline" className="tap" onClick={() => setRecallOpen(true)}>
            <History className="size-5" /> Recall
          </Button>
        </div>

        {kitchens.length === 0 ? (
          <EmptyState
            title="No kitchens set up"
            body="The owner can add kitchens in Settings → Kitchens."
          />
        ) : null}
        <div className="grid gap-3 md:grid-cols-3">
          {cols.map((col) => {
            const list = cards.filter((c) => c.stage === col.stage);
            return (
              <section
                key={col.stage}
                className="flex min-h-[50vh] flex-col rounded-lg border border-border bg-muted/40"
              >
                <h2
                  className={cn(
                    "flex items-center justify-between rounded-t-lg px-4 py-3 font-display text-xl font-extrabold",
                    col.cls,
                  )}
                >
                  {col.title} <span className="num">{list.length}</span>
                </h2>
                <div className="space-y-3 p-3">
                  {list.length === 0 ? (
                    <EmptyState
                      title="Nothing here"
                      body={
                        col.stage === "new"
                          ? "New KOTs from captains and the counter appear here."
                          : undefined
                      }
                    />
                  ) : (
                    list.map((c) => (
                      <KotCard key={c.key} card={c} kitchenId={kitchen!.id} now={now} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Tap a card to move all its items forward, or tap one item. Ready tells the captain.
        </p>
      </div>

      <ResponsiveSheet
        open={recallOpen}
        onOpenChange={setRecallOpen}
        title="Recall"
        description="Last 20 served KOTs. Recall one to put it back in Ready."
      >
        <div className="space-y-2 py-2">
          {served.length === 0 ? (
            <EmptyState title="No served KOTs yet" />
          ) : (
            served.map((c) => (
              <div
                key={c.key}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold">
                    KOT #{c.kotNo} · {c.label}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {time(c.sentAt)} · {c.lines.map((l) => `${qty(l.qty)} ${l.name}`).join(", ")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="tap"
                  onClick={() => void pos.act((b) => b.kdsRecall(c.order.id, c.kotNo, kitchen!.id))}
                >
                  <RotateCcw className="size-4" /> Recall
                </Button>
              </div>
            ))
          )}
        </div>
      </ResponsiveSheet>
    </AppShell>
  );
}

function KotCard({ card, kitchenId, now }: { card: KdsCard; kitchenId: string; now: number }) {
  const pos = usePos();
  const mins = (now - new Date(card.sentAt).getTime()) / 60000;
  const fresh = card.stage === "new" && mins < 1;
  const timeCls =
    mins >= 20
      ? "bg-destructive text-primary-foreground"
      : mins >= 10
        ? "bg-status-hold text-primary-foreground"
        : "bg-muted text-foreground";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => void pos.act((b) => b.kdsAdvance(card.order.id, card.kotNo, kitchenId))}
      onKeyDown={(e) =>
        e.key === "Enter" && void pos.act((b) => b.kdsAdvance(card.order.id, card.kotNo, kitchenId))
      }
      className={cn(
        "cursor-pointer rounded-lg border-2 bg-card p-3 shadow-soft transition active:scale-[0.99]",
        fresh
          ? "animate-pulse border-primary"
          : mins >= 20
            ? "border-destructive"
            : mins >= 10
              ? "border-status-hold"
              : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-2xl font-extrabold leading-none">{card.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            KOT #{card.kotNo} · {card.order.captainName}
          </p>
        </div>
        <span className={cn("num rounded-md px-2 py-1 text-base", timeCls)}>
          {elapsed(card.sentAt, now)}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {card.lines.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void pos.act((b) => b.kdsAdvance(card.order.id, card.kotNo, kitchenId, l.id));
              }}
              className={cn(
                "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-lg hover:bg-muted",
                rank[l.status] > rank[card.stage === "new" ? "sent" : card.stage] &&
                  "text-status-ready line-through decoration-2",
              )}
            >
              <span className="num w-12 shrink-0 text-xl">{qty(l.qty)}×</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-semibold">
                  <VegMark type={l.dietary} /> <span translate="no">{l.name}</span>
                  {l.custom ? (
                    <span className="rounded bg-status-reserved-soft px-1.5 text-xs font-bold text-status-reserved">
                      CUSTOM
                    </span>
                  ) : null}
                </span>
                {l.variantName || l.addons.length ? (
                  <span className="block text-sm text-muted-foreground">
                    {[l.variantName, ...l.addons.map((a) => a.name)].filter(Boolean).join(", ")}
                  </span>
                ) : null}
                {l.note ? (
                  <span className="block text-base font-extrabold text-primary">
                    Note: {l.note}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-xs font-bold uppercase text-muted-foreground">
                {l.status === "sent" ? "new" : l.status}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
