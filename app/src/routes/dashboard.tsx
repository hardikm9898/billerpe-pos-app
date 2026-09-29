import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BadgePercent,
  ChefHat,
  ChevronRight,
  CircleX,
  IndianRupee,
  ReceiptText,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Card } from "@/components/pos/kit";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/pos/primitives";
import { defaultCustom, RangeFilter, rangeOptions } from "@/components/pos/RangeFilter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardResult, RangeKey } from "@/lib/pos/backend/types";
import { money, qty } from "@/lib/pos/format";
import { backend, usePos } from "@/lib/pos/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
];
const short = (n: number) =>
  n >= 100000
    ? `₹${(n / 100000).toFixed(1)}L`
    : n >= 1000
      ? `₹${(n / 1000).toFixed(1)}k`
      : `₹${Math.round(n)}`;
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h >= 12 ? "pm" : "am"}`;

/** 7-day sales line for the hero tile; the last point (the latest day) is marked. */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 120;
  const h = 44;
  const max = Math.max(...points, 1);
  const xy = points.map((v, i) => [
    (i / (points.length - 1)) * (w - 6) + 3,
    h - 4 - (v / max) * (h - 10),
  ]);
  const line = xy.map(([x, y]) => `${x!.toFixed(1)},${y!.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-[120px]" aria-hidden>
      <polygon points={`3,${h} ${line} ${w - 3},${h}`} fill="white" fillOpacity={0.14} />
      <polyline
        points={line}
        fill="none"
        stroke="white"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lx} cy={ly} r={3.5} fill="white" />
    </svg>
  );
}

/** Net sales, the one number the dashboard leads with, plus its three companions. */
function SalesHero({ k, period }: { k: DashboardResult; period: string }) {
  const trend = k.trend.map((t) => t.amount);
  const week = trend.reduce((a, v) => a + v, 0);
  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl bg-[linear-gradient(135deg,oklch(0.53_0.2_25),oklch(0.36_0.15_22))] p-4 text-white shadow-soft">
      <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-16 right-16 size-32 rounded-full bg-white/5" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
            <IndianRupee className="size-3.5" /> Net sales · {period}
          </p>
          <p className="mt-1 truncate font-display text-[32px] font-extrabold leading-tight tracking-tight lg:text-[40px]">
            {money(k.net)}
          </p>
        </div>
        {trend.length > 1 ? (
          <div
            className="shrink-0 text-right"
            role="img"
            aria-label={`Last 7 days sales ${money(week)}`}
          >
            <Sparkline points={trend} />
            <p className="text-[10px] font-medium text-white/70">Last 7 days</p>
          </div>
        ) : null}
      </div>
      <div className="relative mt-4 grid lg:mt-auto grid-cols-3 divide-x divide-white/20 rounded-lg bg-white/12 py-2.5 backdrop-blur-sm">
        {(
          [
            [ReceiptText, "Bills", String(k.bills)],
            [TrendingUp, "Avg bill", money(k.avgBill)],
            [Users, "Guests", String(k.guests)],
          ] as const
        ).map(([Icon, label, value]) => (
          <div key={label} className="min-w-0 px-2 text-center">
            <p className="flex items-center justify-center gap-1 text-[11px] text-white/75">
              <Icon className="size-3" /> {label}
            </p>
            <p className="mt-0.5 truncate font-display text-base font-bold">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const tone = {
  running: "bg-status-running-soft text-status-running",
  cancelled: "bg-status-hold-soft text-status-hold",
  discount: "bg-status-billed-soft text-status-billed",
  expense: "bg-status-reserved-soft text-status-reserved",
} as const;

function Kpi({
  icon: Icon,
  tone: t,
  label,
  value,
  sub,
  to,
}: {
  icon: LucideIcon;
  tone: keyof typeof tone;
  label: string;
  value: string;
  sub?: string | undefined;
  to?: "/tables" | undefined;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("flex size-9 items-center justify-center rounded-lg", tone[t])}>
          <Icon className="size-[18px]" />
        </span>
        {to ? <ChevronRight className="size-4 text-muted-foreground" /> : null}
      </div>
      <p className="mt-3 truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p className="truncate font-display text-xl font-extrabold leading-tight">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{sub ?? " "}</p>
    </>
  );
  const cls =
    "block rounded-xl border border-border bg-card p-3 shadow-soft transition-colors hover:bg-muted/40";
  return to ? (
    <Link to={to} className={cn(cls, "tap")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** All outlets: each outlet's share of net sales. */
function OutletBreakdown({ outlets }: { outlets: NonNullable<DashboardResult["outlets"]> }) {
  const max = Math.max(1, ...outlets.map((o) => o.net));
  return (
    <Card>
      <h2 className="font-display font-bold">By outlet</h2>
      <ul className="mt-3 space-y-3">
        {[...outlets]
          .sort((a, b) => b.net - a.net)
          .map((o) => (
            <li key={o.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-semibold" translate="no">
                  {o.name}
                </span>
                <span className="num shrink-0">
                  {money(o.net)}{" "}
                  <span className="text-xs text-muted-foreground">· {o.bills} bills</span>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${(o.net / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
      </ul>
    </Card>
  );
}

/** Figures come from the server, by business day (outlet day start time). */
function DashboardPage() {
  const pos = usePos();
  const data = pos.data!;
  const [range, setRange] = useState<RangeKey>("today");
  const [custom, setCustom] = useState(defaultCustom);
  const [k, setK] = useState<DashboardResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // "All outlets" (owner): every outlet they own, added up; stays on this outlet's session.
  const [allOutlets, setAllOutlets] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    const r = { key: range, from: custom.from, to: custom.to };
    (allOutlets ? backend.dashboardAll(r) : backend.dashboard(r))
      .then((r) => live && setK(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [range, custom, data.orders, attempt, allOutlets]);

  const isOwner = pos.session?.user.isOwner;
  const typeTotal = k ? k.byType.reduce((a, t) => a + t.amount, 0) : 0;
  const hours = k
    ? k.hourly
        .filter((h) => h.hour >= 8)
        .map((h) => ({ label: hourLabel(h.hour), sales: h.amount }))
    : [];

  return (
    <AppShell title="Dashboard">
      <div className="space-y-4">
        {/* Outlet picker on its own row: the date chips scroll edge to edge (negative margins). */}
        {isOwner && data.outlets.length > 1 ? (
          <Select
            value={allOutlets ? "all" : data.outlet.id}
            onValueChange={async (id) => {
              setK(null);
              if (id === "all") return setAllOutlets(true);
              setAllOutlets(false);
              if (id === data.outlet.id) return;
              const r = await backend
                .selectOutlet(id)
                .catch(() => ({ ok: false as const, error: "No internet connection" }));
              if (!r.ok) toast.error(r.error);
              else await pos.reload();
            }}
          >
            <SelectTrigger className="tap w-full sm:w-64" aria-label="Outlet">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outlets</SelectItem>
              {data.outlets.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  <span translate="no">{o.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <RangeFilter
          value={range}
          onChange={setRange}
          custom={custom}
          onCustom={setCustom}
          businessDayStart={data.settings.businessDayStart}
        />

        {failed ? (
          <ErrorState
            message="Could not load the dashboard."
            onRetry={() => setAttempt((a) => a + 1)}
          />
        ) : !k ? (
          <ListSkeleton rows={4} />
        ) : (
          <>
            <div className="grid gap-2 lg:grid-cols-2">
              <SalesHero k={k} period={rangeOptions.find((o) => o.id === range)?.label ?? ""} />
              <div className="grid grid-cols-2 gap-2">
                <Kpi
                  icon={ChefHat}
                  tone="running"
                  label="Running orders"
                  value={String(k.runningCount)}
                  sub={money(k.runningAmount)}
                  to={!allOutlets && pos.canOpen("/tables") ? "/tables" : undefined}
                />
                <Kpi
                  icon={CircleX}
                  tone="cancelled"
                  label="Cancelled"
                  value={String(k.cancelledCount)}
                  sub={money(k.cancelledAmount)}
                />
                <Kpi
                  icon={BadgePercent}
                  tone="discount"
                  label="Discounts"
                  value={money(k.discounts)}
                />
                <Kpi icon={Wallet} tone="expense" label="Expenses" value={money(k.expenses)} />
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <Card>
                <h2 className="font-display font-bold">Payment split</h2>
                {k.byMode.length === 0 ? (
                  <EmptyState title="No payments in this period" />
                ) : (
                  <div className="flex flex-col items-center gap-3 sm:flex-row">
                    <div className="h-44 w-44 shrink-0">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={k.byMode}
                            dataKey="amount"
                            nameKey="name"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={2}
                          >
                            {k.byMode.map((_, i) => (
                              <Cell key={i} fill={chartColors[i % chartColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => money(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="w-full space-y-1.5 text-sm">
                      {k.byMode.map((p, i) => (
                        <li key={p.modeId} className="flex items-center gap-2">
                          <span
                            className="size-3 rounded-sm"
                            style={{ background: chartColors[i % chartColors.length] }}
                          />
                          <span className="flex-1">{p.name}</span>
                          <span className="num">{money(p.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>

              <Card>
                <h2 className="font-display font-bold">Hourly sales</h2>
                <div className="mt-2 h-48">
                  <ResponsiveContainer>
                    <BarChart data={hours}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10 }}
                        interval="preserveStartEnd"
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis
                        tickFormatter={short}
                        tick={{ fontSize: 10 }}
                        width={44}
                        stroke="var(--muted-foreground)"
                      />
                      <Tooltip formatter={(v: number) => money(v)} />
                      <Bar dataKey="sales" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card>
                <h2 className="font-display font-bold">Last 7 days</h2>
                <div className="mt-2 h-48">
                  <ResponsiveContainer>
                    <LineChart data={k.trend}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10 }}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis
                        tickFormatter={short}
                        tick={{ fontSize: 10 }}
                        width={44}
                        stroke="var(--muted-foreground)"
                      />
                      <Tooltip formatter={(v: number) => money(v)} />
                      <Line
                        type="monotone"
                        dataKey="amount"
                        stroke="var(--primary)"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card>
                <h2 className="font-display font-bold">Top 5 items</h2>
                {k.topItems.length === 0 ? (
                  <EmptyState title="No items sold in this period" />
                ) : (
                  <ol className="mt-2 space-y-2">
                    {k.topItems.map((t, i) => (
                      <li key={t.name} className="flex items-center gap-2 text-sm">
                        <span className="num w-5 text-muted-foreground">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          <span translate="no">{t.name}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{qty(t.qty)} sold</span>
                        <span className="num w-24 text-right">{money(t.amount)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>

              <Card>
                <h2 className="font-display font-bold">Order type</h2>
                <div className="mt-3 space-y-2">
                  {k.byType.map((t, i) => (
                    <div key={t.label}>
                      <div className="flex justify-between text-sm">
                        <span>{t.label}</span>
                        <span className="num">{money(t.amount)}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${typeTotal ? (t.amount / typeTotal) * 100 : 0}%`,
                            background: chartColors[i],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {k.outlets ? <OutletBreakdown outlets={k.outlets} /> : null}
              {!allOutlets && pos.canOpen("/tables") ? (
                <Card>
                  <div className="flex items-center justify-between">
                    <h2 className="font-display font-bold">Live tables</h2>
                    <Link to="/tables" className="text-sm font-semibold text-primary">
                      Open tables
                    </Link>
                  </div>
                  <div className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-7">
                    {data.tables.map((t) => (
                      <div
                        key={t.id}
                        title={t.status}
                        className={cn(
                          "flex aspect-square items-center justify-center rounded-md text-xs font-bold",
                          t.status === "free" && "bg-muted text-muted-foreground",
                          t.status === "running" && "bg-status-running-soft text-status-running",
                          t.status === "hold" && "bg-status-hold-soft text-status-hold",
                          t.status === "billed" && "bg-status-billed-soft text-status-billed",
                          t.status === "reserved" && "bg-status-reserved-soft text-status-reserved",
                        )}
                      >
                        <span translate="no">{t.name}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
