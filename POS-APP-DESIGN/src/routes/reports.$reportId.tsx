import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, FileText, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { shareText } from "@/components/pos/billing/share";
import { BackLink } from "@/components/pos/kit";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/pos/primitives";
import { defaultCustom, RangeFilter } from "@/components/pos/RangeFilter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildReport, rangeFor, reportDefs, type RangeKey, type ReportId } from "@/lib/pos/analytics";
import { money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports/$reportId")({
  head: ({ params }) => {
    const def = reportDefs.find((r) => r.id === params.reportId);
    const title = `${def?.title ?? "Report"} — BillerPe POS`;
    const description = def?.body ?? "Restaurant report";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ReportPage,
});

function ReportPage() {
  const { reportId } = Route.useParams();
  const pos = usePos();
  const def = reportDefs.find((r) => r.id === reportId);
  const [range, setRange] = useState<RangeKey>("7d");
  const [custom, setCustom] = useState(defaultCustom);
  const [staff, setStaff] = useState("all");
  const [mode, setMode] = useState("all");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    const t = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(t);
  }, [range, custom, staff, mode, reportId]);

  const r = useMemo(() => rangeFor(range, pos.billingSettings.businessDayStart, custom), [range, custom, pos.billingSettings.businessDayStart]);
  const report = useMemo(() => {
    if (!def) return null;
    return buildReport(def.id as ReportId, {
      orders: pos.orders, range: r, settings: pos.billingSettings, items: pos.menuItems, categories: pos.categories,
      tables: pos.tables, expenses: pos.expenses, expenseHead: (id) => pos.expenseHeads.find((h) => h.id === id)?.name ?? "—",
      cashSessions: [...(pos.cashSession ? [pos.cashSession] : []), ...pos.cashHistory], label: pos.modeLabel, staff, mode,
    });
  }, [def, pos, r, staff, mode]);

  if (!def || !report) {
    return (
      <AppShell title="Report" topBarLeft={<BackLink to="/reports" />}>
        <EmptyState title="Report not found" />
      </AppShell>
    );
  }

  const fmt = (v: string | number | undefined, isMoney?: boolean) => (typeof v === "number" && isMoney ? money(v) : String(v ?? ""));
  const staffNames = Array.from(new Set(pos.staff.filter((s) => s.role !== "kitchen").map((s) => s.name)));

  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [report.columns.map((c) => esc(c.label)).join(",")];
    for (const row of [...report.rows, ...(report.totals ? [report.totals] : [])]) lines.push(report.columns.map((c) => esc(String(row[c.key] ?? ""))).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${def.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Excel file downloaded");
  };

  return (
    <AppShell title={def.title} topBarLeft={<BackLink to="/reports" />}>
      <div className="space-y-3">
        <RangeFilter value={range} onChange={setRange} custom={custom} onCustom={setCustom} businessDayStart={pos.billingSettings.businessDayStart} />
        <div className="grid grid-cols-2 gap-2">
          <Select value={staff} onValueChange={setStaff}>
            <SelectTrigger className="tap" aria-label="Staff"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All staff</SelectItem>
              {staffNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="tap" aria-label="Payment mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payment modes</SelectItem>
              {pos.billingSettings.paymentModes.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <ListSkeleton rows={4} />
        ) : failed ? (
          <ErrorState onRetry={() => setFailed(false)} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {report.summary.map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-card p-3">
                  <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                  <p className="num truncate font-display text-lg font-extrabold">{fmt(s.value, s.money)}</p>
                </div>
              ))}
            </div>

            {report.rows.length === 0 ? (
              <EmptyState title="No data for these filters" body="Try a longer date range or clear the filters." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-left">
                      {report.columns.map((c, i) => (
                        <th key={c.key} className={cn("whitespace-nowrap px-3 py-2 font-semibold", i === 0 && "sticky left-0 z-10 bg-muted", (c.money || c.num) && "text-right")}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-border last:border-0">
                        {report.columns.map((c, i) => (
                          <td key={c.key} className={cn("whitespace-nowrap px-3 py-2", i === 0 && "sticky left-0 bg-card font-semibold", (c.money || c.num) && "num text-right font-medium")}>{fmt(row[c.key], c.money)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {report.totals ? (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-primary-soft font-bold text-primary-soft-foreground">
                        {report.columns.map((c, i) => (
                          <td key={c.key} className={cn("whitespace-nowrap px-3 py-2", i === 0 && "sticky left-0 bg-primary-soft", (c.money || c.num) && "num text-right")}>{fmt(report.totals?.[c.key], c.money)}</td>
                        ))}
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="tap" onClick={() => window.print()}><FileText className="size-4" /> PDF</Button>
              <Button variant="outline" className="tap" onClick={exportCsv}><FileSpreadsheet className="size-4" /> Excel</Button>
              <Button variant="outline" className="tap" onClick={() => void shareText(def.title, `${pos.outlet.restaurant} — ${def.title}\n${report.summary.map((s) => `${s.label}: ${fmt(s.value, s.money)}`).join("\n")}`)}>
                <Share2 className="size-4" /> Share
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
