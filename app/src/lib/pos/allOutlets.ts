import type { DashboardResult, ReportResult } from "./backend/types";

// "All outlets" (owner list 2026-09-29 #14): one outlet's dashboard / report
// results added up. The same rules as the cloud (uat-backend-v2
// appv1/domains/reports.js dashboardAll / reportAll).

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = <T>(xs: T[], f: (x: T) => number | undefined) =>
  r2(xs.reduce((a, x) => a + (Number(f(x)) || 0), 0));

function mergeBy<T>(lists: T[][], keyOf: (x: T) => string, add: (a: T, b: T) => T): T[] {
  const map = new Map<string, T>();
  for (const x of lists.flat()) {
    const k = keyOf(x);
    const cur = map.get(k);
    map.set(k, cur ? add(cur, x) : { ...x });
  }
  return [...map.values()];
}

export interface OutletPart<R> {
  outlet: { id: string; name: string };
  result: R;
}

export function combineDashboards(parts: OutletPart<DashboardResult>[]): DashboardResult {
  const R = parts.map((p) => p.result);
  const net = sum(R, (x) => x.net);
  const bills = sum(R, (x) => x.bills);
  return {
    net,
    bills,
    avgBill: bills ? r2(net / bills) : 0,
    guests: sum(R, (x) => x.guests),
    runningCount: sum(R, (x) => x.runningCount),
    runningAmount: sum(R, (x) => x.runningAmount),
    cancelledCount: sum(R, (x) => x.cancelledCount),
    cancelledAmount: sum(R, (x) => x.cancelledAmount),
    discounts: sum(R, (x) => x.discounts),
    expenses: sum(R, (x) => x.expenses),
    // Payment modes by name: each outlet has its own mode ids.
    byMode: mergeBy(
      R.map((x) => x.byMode),
      (m) => m.name.toLowerCase(),
      (a, b) => ({ ...a, amount: r2(a.amount + b.amount) }),
    ).sort((a, b) => b.amount - a.amount),
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      amount: sum(R, (x) => x.hourly[hour]?.amount),
    })),
    trend: (R[0]?.trend ?? []).map((t, i) => ({
      day: t.day,
      amount: sum(R, (x) => x.trend[i]?.amount),
    })),
    topItems: mergeBy(
      R.map((x) => x.topItems),
      (t) => t.name,
      (a, b) => ({ ...a, qty: r2(a.qty + b.qty), amount: r2(a.amount + b.amount) }),
    )
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
    byType: (R[0]?.byType ?? []).map((t, i) => ({
      label: t.label,
      amount: sum(R, (x) => x.byType[i]?.amount),
    })),
    outlets: parts.map((p) => ({
      id: p.outlet.id,
      name: p.outlet.name,
      net: p.result.net,
      bills: p.result.bills,
    })),
  };
}

// Summary lines that are not a sum over outlets (a count of kinds, a name).
const NOT_ADDED = new Set(["Days", "Modes", "Tables used", "Staff", "Top", "Items"]);

export function combineReports(parts: OutletPart<ReportResult>[]): ReportResult {
  const first = parts[0]?.result ?? { title: "Report", columns: [], rows: [], summary: [] };
  const adds = first.columns.filter((c) => c.money || c.num).map((c) => c.key);
  const rows: Record<string, string | number>[] = parts.flatMap((p) =>
    p.result.rows.map((row) => ({ outlet: p.outlet.name, ...row })),
  );
  const totals = first.totals
    ? {
        outlet: "Total",
        ...Object.fromEntries(
          first.columns.map((c) => [
            c.key,
            adds.includes(c.key) ? sum(rows, (x) => Number(x[c.key])) : "",
          ]),
        ),
      }
    : undefined;
  const headline = first.summary.find((s) => s.money) ?? first.summary[0];
  const valueOf = (p: OutletPart<ReportResult>, label: string) =>
    Number(p.result.summary.find((x) => x.label === label)?.value) || 0;
  return {
    title: first.title,
    columns: [{ key: "outlet", label: "Outlet" }, ...first.columns],
    rows,
    totals,
    summary: [
      { label: "Outlets", value: parts.length },
      ...first.summary
        .filter((s) => typeof s.value === "number" && !NOT_ADDED.has(s.label))
        .map((s) => ({ ...s, value: sum(parts, (p) => valueOf(p, s.label)) })),
    ],
    outlets: headline
      ? parts.map((p) => ({
          name: p.outlet.name,
          label: headline.label,
          money: Boolean(headline.money),
          value: valueOf(p, headline.label),
        }))
      : [],
  };
}
