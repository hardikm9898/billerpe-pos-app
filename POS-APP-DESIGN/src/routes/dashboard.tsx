import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { AppShell } from "@/components/pos/AppShell";
import { Card } from "@/components/pos/kit";
import { EmptyState } from "@/components/pos/primitives";
import { defaultCustom, RangeFilter } from "@/components/pos/RangeFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hourly, itemSales, kpis, paymentSplit, rangeFor, trend, typeSplit, type RangeKey } from "@/lib/pos/analytics";
import { money, qty } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — BillerPe POS" },
      { name: "description", content: "Net sales, bills, payment split, hourly sales, top items and live tables." },
      { property: "og:title", content: "Dashboard — BillerPe POS" },
      { property: "og:description", content: "Net sales, bills, payment split, hourly sales, top items and live tables." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--primary)"];
const short = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`);

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-soft">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="num mt-1 truncate font-display text-xl font-extrabold">{value}</p>
      {sub ? <p className="truncate text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function DashboardPage() {
  const pos = usePos();
  const [range, setRange] = useState<RangeKey>("today");
  const [custom, setCustom] = useState(defaultCustom);
  const s = pos.billingSettings;
  const r = useMemo(() => rangeFor(range, s.businessDayStart, custom), [range, s.businessDayStart, custom]);

  const k = useMemo(() => kpis(pos.orders, r, s, pos.expenses), [pos.orders, r, s, pos.expenses]);
  const pay = useMemo(() => paymentSplit(pos.orders, r, pos.modeLabel), [pos.orders, r, pos]);
  const hours = useMemo(() => hourly(pos.orders, r, s), [pos.orders, r, s]);
  const days = useMemo(() => trend(pos.orders, 7, s, s.businessDayStart), [pos.orders, s]);
  const top = useMemo(() => itemSales(pos.orders, r, pos.menuItems, pos.categories).slice(0, 5), [pos.orders, r, pos.menuItems, pos.categories]);
  const types = useMemo(() => typeSplit(pos.orders, r, s), [pos.orders, r, s]);
  const typeTotal = types.reduce((a, t) => a + t.value, 0);
  const isOwner = pos.user?.role === "owner";

  return (
    <AppShell title="Dashboard">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <RangeFilter value={range} onChange={setRange} custom={custom} onCustom={setCustom} businessDayStart={s.businessDayStart} />
          </div>
          {isOwner && pos.outlets.length > 1 ? (
            <Select value={pos.outlet.id} onValueChange={pos.selectOutlet}>
              <SelectTrigger className="tap w-44" aria-label="Outlet"><SelectValue /></SelectTrigger>
              <SelectContent>{pos.outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
            </Select>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Net sales" value={money(k.net)} />
          <Kpi label="Bills" value={String(k.bills)} />
          <Kpi label="Avg bill" value={money(k.avg)} />
          <Kpi label="Guests" value={String(k.guests)} />
          <Kpi label="Running orders" value={String(k.runningCount)} sub={money(k.runningAmount)} />
          <Kpi label="Cancelled" value={String(k.cancelled)} sub={money(k.cancelledAmount)} />
          <Kpi label="Discounts" value={money(k.discounts)} />
          <Kpi label="Expenses" value={money(k.expenses)} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <h2 className="font-display font-bold">Payment split</h2>
            {pay.length === 0 ? (
              <EmptyState title="No payments in this period" />
            ) : (
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <div className="h-44 w-44 shrink-0">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pay} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                        {pay.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => money(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="w-full space-y-1.5 text-sm">
                  {pay.map((p, i) => (
                    <li key={p.mode} className="flex items-center gap-2">
                      <span className="size-3 rounded-sm" style={{ background: chartColors[i % chartColors.length] }} />
                      <span className="flex-1">{p.name}</span>
                      <span className="num">{money(p.value)}</span>
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
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" stroke="var(--muted-foreground)" />
                  <YAxis tickFormatter={short} tick={{ fontSize: 10 }} width={44} stroke="var(--muted-foreground)" />
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
                <LineChart data={days}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis tickFormatter={short} tick={{ fontSize: 10 }} width={44} stroke="var(--muted-foreground)" />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Line type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <h2 className="font-display font-bold">Top 5 items</h2>
            {top.length === 0 ? (
              <EmptyState title="No items sold in this period" />
            ) : (
              <ol className="mt-2 space-y-2">
                {top.map((t, i) => (
                  <li key={t.name} className="flex items-center gap-2 text-sm">
                    <span className="num w-5 text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
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
              {types.map((t, i) => (
                <div key={t.name}>
                  <div className="flex justify-between text-sm"><span>{t.name}</span><span className="num">{money(t.value)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full" style={{ width: `${typeTotal ? (t.value / typeTotal) * 100 : 0}%`, background: chartColors[i] }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold">Live tables</h2>
              <Link to="/tables" className="text-sm font-semibold text-primary">Open tables</Link>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-7">
              {pos.tables.map((t) => (
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
                  {t.name}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
