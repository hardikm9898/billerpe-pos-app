import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, FileText, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { shareText } from "@/components/pos/billing/share";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/pos/primitives";
import { Segmented } from "@/components/pos/kit";
import { defaultCustom, RangeFilter, rangeOptions } from "@/components/pos/RangeFilter";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RangeKey, ReportResult } from "@/lib/pos/backend/types";
import { isShareCancel, shareFile } from "@/lib/pos/fileExport";
import { REPORTS } from "@/lib/pos/reportList";
import { money } from "@/lib/pos/format";
import { backend, usePos } from "@/lib/pos/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports/$reportId")({
  component: ReportPage,
});

function ReportPage() {
  const { reportId } = Route.useParams();
  const pos = usePos();
  const def = REPORTS.find((r) => r.id === reportId && pos.can(r.module));
  const data = pos.data!;
  const [range, setRange] = useState<RangeKey>("7d");
  const [custom, setCustom] = useState(defaultCustom);
  const [staff, setStaff] = useState("all");
  const [mode, setMode] = useState("all");
  const [report, setReport] = useState<ReportResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // "All outlets" (owner, non-stock reports): every outlet they own, with an Outlet column.
  const canAll =
    Boolean(pos.session?.user.isOwner) && data.outlets.length > 1 && def?.module === "reports";
  const [allOutlets, setAllOutlets] = useState(false);
  const all = canAll && allOutlets;

  useEffect(() => {
    if (!def) return;
    let live = true;
    setReport(null);
    setFailed(false);
    const r = { key: range, from: custom.from, to: custom.to };
    (all
      ? backend.reportAll(def.id, r)
      : backend.report(def.id, r, {
          staffId: staff === "all" ? undefined : staff,
          modeId: mode === "all" ? undefined : mode,
        })
    )
      .then((r) => live && setReport(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [def, range, custom, staff, mode, attempt, all]);

  if (!def) {
    return (
      <AppShell title="Report">
        <EmptyState title="Report not found" />
      </AppShell>
    );
  }

  const fmt = (v: string | number | undefined, isMoney?: boolean) =>
    typeof v === "number" && isMoney ? money(v) : String(v ?? "");
  const staffList = data.staff.filter((s) => s.role !== "Kitchen Staff");
  const salesFilters =
    def.module === "reports" && !["cash-session", "expense", "due-collected"].includes(def.id);

  const period =
    range === "custom"
      ? `${custom.from} to ${custom.to}`
      : (rangeOptions.find((o) => o.id === range)?.label ?? "");
  const filterText = (
    all
      ? []
      : [
          staff !== "all" ? `Staff: ${data.staff.find((s) => s.id === staff)?.name ?? staff}` : "",
          mode !== "all"
            ? `Payment: ${data.settings.paymentModes.find((m) => m.id === mode)?.name ?? mode}`
            : "",
        ]
  )
    .filter(Boolean)
    .join(" · ");
  const fileName = (ext: string) => `${def.id}-${period.replace(/[^a-z0-9]+/gi, "-")}.${ext}`;
  const cells = (row: Record<string, string | number | undefined>) =>
    report!.columns.map((c) => fmt(row[c.key], c.money));
  const run = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      if (!isShareCancel(e)) toast.error(`Could not make the ${what}`);
    }
  };

  // Opens in Excel / Sheets. On the phone it goes to the share sheet (the
  // Android WebView has no downloads).
  const exportCsv = () =>
    run("Excel file", async () => {
      if (!report) return;
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const lines = [report.columns.map((c) => esc(c.label)).join(",")];
      for (const row of [...report.rows, ...(report.totals ? [report.totals] : [])])
        lines.push(report.columns.map((c) => esc(String(row[c.key] ?? ""))).join(","));
      // BOM so Excel reads the file as UTF-8.
      await shareFile(fileName("csv"), `\ufeff${lines.join("\r\n")}`, "text/csv");
    });

  const exportPdf = () =>
    run("PDF", async () => {
      if (!report) return;
      const { tablePdf } = await import("@/lib/pos/pdf");
      const bytes = tablePdf({
        title: def.title,
        subtitle: [
          all ? "All outlets" : data.outlet.name,
          [period, filterText].filter(Boolean).join(" · "),
        ],
        summary: report.summary.map((s) => ({ label: s.label, value: fmt(s.value, s.money) })),
        columns: report.columns.map((c) => ({ label: c.label, right: c.money || c.num })),
        rows: report.rows.map(cells),
        totals: report.totals ? cells(report.totals) : undefined,
      });
      await shareFile(fileName("pdf"), bytes, "application/pdf");
    });

  return (
    <AppShell title={def.title}>
      <div className="space-y-3">
        <RangeFilter
          value={range}
          onChange={setRange}
          custom={custom}
          onCustom={setCustom}
          businessDayStart={data.settings.businessDayStart}
        />
        {canAll ? (
          <Segmented
            value={all ? "all" : "one"}
            onChange={(v) => setAllOutlets(v === "all")}
            options={[
              { id: "one", label: "This outlet" },
              { id: "all", label: "All outlets" },
            ]}
          />
        ) : null}
        {salesFilters && !all ? (
          <div className="grid grid-cols-2 gap-2">
            <Select value={staff} onValueChange={setStaff}>
              <SelectTrigger className="tap" aria-label="Staff">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {staffList.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    <span translate="no">{n.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="tap" aria-label="Payment mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payment modes</SelectItem>
                {data.settings.paymentModes.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {failed ? (
          <ErrorState
            message="Could not load this report."
            onRetry={() => setAttempt((a) => a + 1)}
          />
        ) : !report ? (
          <ListSkeleton rows={4} />
        ) : (
          <>
            {report.outlets?.length ? (
              <ul className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-sm">
                {report.outlets.map((o) => (
                  <li key={o.name} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate font-semibold" translate="no">
                      {o.name}
                    </span>
                    <span className="num shrink-0">
                      {fmt(o.value, o.money)}{" "}
                      <span className="text-xs text-muted-foreground">{o.label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {report.summary.map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-card p-3">
                  <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                  <p className="num truncate font-display text-lg font-extrabold">
                    {fmt(s.value, s.money)}
                  </p>
                </div>
              ))}
            </div>

            {report.rows.length === 0 ? (
              <EmptyState
                title="No data for these filters"
                body="Try a longer date range or clear the filters."
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-left">
                      {report.columns.map((c, i) => (
                        <th
                          key={c.key}
                          className={cn(
                            "whitespace-nowrap px-3 py-2 font-semibold",
                            i === 0 && "sticky left-0 z-10 bg-muted",
                            (c.money || c.num) && "text-right",
                          )}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-border last:border-0">
                        {report.columns.map((c, i) => (
                          <td
                            key={c.key}
                            className={cn(
                              "whitespace-nowrap px-3 py-2",
                              i === 0 && "sticky left-0 bg-card font-semibold",
                              (c.money || c.num) && "num text-right font-medium",
                            )}
                          >
                            {fmt(row[c.key], c.money)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {report.totals ? (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-primary-soft font-bold text-primary-soft-foreground">
                        {report.columns.map((c, i) => (
                          <td
                            key={c.key}
                            className={cn(
                              "whitespace-nowrap px-3 py-2",
                              i === 0 && "sticky left-0 bg-primary-soft",
                              (c.money || c.num) && "num text-right",
                            )}
                          >
                            {fmt(report.totals?.[c.key], c.money)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="tap" onClick={() => void exportPdf()}>
                <FileText className="size-4" /> PDF
              </Button>
              <Button variant="outline" className="tap" onClick={() => void exportCsv()}>
                <FileSpreadsheet className="size-4" /> Excel
              </Button>
              <Button
                variant="outline"
                className="tap"
                onClick={() =>
                  void shareText(
                    def.title,
                    `${data.outlet.name} — ${def.title} (${period})\n${report.summary.map((s) => `${s.label}: ${fmt(s.value, s.money)}`).join("\n")}`,
                  )
                }
              >
                <Share2 className="size-4" /> Share
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
