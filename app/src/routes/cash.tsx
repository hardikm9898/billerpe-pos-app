import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, Lock, Share2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { shareText } from "@/components/pos/billing/share";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { EmptyState, NumberField, SectionTitle, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateTime, money, round2, DENOMINATIONS } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type { CashMovement, CashSession } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cash")({
  component: CashPage,
});

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "bad" | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "num font-display text-lg font-extrabold",
          tone === "good" && "text-status-ready",
          tone === "bad" && "text-destructive",
        )}
      >
        {money(value)}
      </p>
    </div>
  );
}

function summaryText(s: CashSession, restaurant: string) {
  const diff = round2((s.counted ?? 0) - (s.expected ?? 0));
  return [
    `${restaurant} — Cash session`,
    `Opened ${dateTime(s.openedAt)} by ${s.openedBy}`,
    `Closed ${dateTime(s.closedAt ?? new Date())} by ${s.closedBy ?? ""}`,
    `Opening float ${money(s.openingFloat)}`,
    `Expected ${money(s.expected ?? 0)}`,
    `Counted ${money(s.counted ?? 0)}`,
    `Difference ${diff >= 0 ? "+" : "−"}${money(Math.abs(diff))}`,
  ].join("\n");
}

const sumKind = (s: CashSession, kinds: CashMovement["kind"][]) =>
  round2(s.movements.filter((m) => kinds.includes(m.kind)).reduce((a, m) => a + m.amount, 0));

/** Drawer ledger: float + cash on bills/dues + cash in − cash out − cash expenses and supplier payments. */
function expectedCash(s: CashSession): number {
  return round2(
    s.openingFloat + sumKind(s, ["settlement", "in"]) - sumKind(s, ["out", "expense", "supplier"]),
  );
}

function CashPage() {
  const pos = usePos();
  const s = pos.data?.cashSession ?? null;
  const history = pos.data?.cashHistory ?? [];
  const expected = s ? expectedCash(s) : 0;
  const [varianceReason, setVarianceReason] = useState("");
  const [float, setFloat] = useState(2000);
  const [entry, setEntry] = useState<"in" | "out" | null>(null);
  const [amt, setAmt] = useState(0);
  const [reason, setReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<CashSession | null>(null);

  const counted = round2(DENOMINATIONS.reduce((a, d) => a + d * (counts[d] ?? 0), 0));
  const diff = round2(counted - expected);

  if (closed) {
    const d = round2((closed.counted ?? 0) - (closed.expected ?? 0));
    return (
      <AppShell title="Cash session closed">
        <div className="mx-auto max-w-md space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Expected" value={closed.expected ?? 0} />
            <Stat label="Counted" value={closed.counted ?? 0} />
          </div>
          <div
            className={cn(
              "rounded-lg p-4 text-center",
              d === 0
                ? "bg-status-ready-soft text-status-ready"
                : "bg-destructive/10 text-destructive",
            )}
          >
            <p className="text-sm font-semibold">
              {d === 0 ? "Cash matches" : d > 0 ? "Excess cash" : "Short by"}
            </p>
            <p className="num font-display text-3xl font-extrabold">{money(Math.abs(d))}</p>
          </div>
          <Button
            variant="outline"
            className="tap w-full"
            onClick={() =>
              void shareText("Cash session", summaryText(closed, pos.data?.outlet.name ?? ""))
            }
          >
            <Share2 className="size-4" /> Share summary
          </Button>
          <Button className="tap w-full" onClick={() => setClosed(null)}>
            Done
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!s) {
    return (
      <AppShell title="Cash session">
        <div className="mx-auto max-w-md space-y-4">
          <EmptyState
            icon={<Wallet className="size-6" />}
            title="No cash session open"
            body="Count the cash in the drawer and open the session to start billing."
          />
          <div className="rounded-lg border border-border bg-card p-4">
            <Label>Opening float</Label>
            <NumberField value={float} onChange={setFloat} className="mt-1.5 h-12 text-xl" />
            <Button
              className="tap mt-3 w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await pos.act((b) => b.openCash(float));
                setBusy(false);
                if (res.ok) toast.success("Cash session opened");
                else toast.error(res.error);
              }}
            >
              {busy ? <Spinner /> : null} Open session with {money(float)}
            </Button>
          </div>
          {history.length ? (
            <section className="space-y-2">
              <SectionTitle>Recent sessions</SectionTitle>
              {history.slice(0, 10).map((h) => (
                <div
                  key={h.id}
                  className="flex justify-between rounded-lg border border-border bg-card p-3 text-sm"
                >
                  <span>
                    {dateTime(h.closedAt ?? h.openedAt)} · {h.closedBy}
                  </span>
                  <span className="num">{money(h.counted ?? 0)}</span>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </AppShell>
    );
  }

  const sales = sumKind(s, ["settlement"]);
  const cashIn = sumKind(s, ["in"]);
  const cashOut = sumKind(s, ["out", "expense", "supplier"]);

  return (
    <AppShell title="Cash session" subtitle={`Opened ${dateTime(s.openedAt)} · ${s.openedBy}`}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-lg bg-primary-soft p-4 text-primary-soft-foreground">
          <p className="text-sm font-semibold">Expected cash in drawer</p>
          <p className="num font-display text-3xl font-extrabold">{money(expected)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Opening float" value={s.openingFloat} />
          <Stat label="Cash on bills & dues" value={sales} />
          <Stat label="Cash in" value={cashIn} tone="good" />
          <Stat label="Cash out & expenses" value={cashOut} tone="bad" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="tap" onClick={() => setEntry("in")}>
            <ArrowDownLeft className="size-4" /> Cash in
          </Button>
          <Button variant="outline" className="tap" onClick={() => setEntry("out")}>
            <ArrowUpRight className="size-4" /> Cash out
          </Button>
          <Button
            className="tap"
            onClick={() => {
              setCounts({});
              setVarianceReason("");
              setClosing(true);
            }}
          >
            <Lock className="size-4" /> Close
          </Button>
        </div>

        <section className="space-y-2">
          <SectionTitle>Entries</SectionTitle>
          {s.movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cash movements yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {s.movements.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <span>
                    <span className="font-semibold">{e.reason}</span>
                    <br />
                    <span className="text-xs text-muted-foreground">
                      {dateTime(e.at)} · {e.by}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "num",
                      e.kind === "in" || e.kind === "settlement"
                        ? "text-status-ready"
                        : "text-destructive",
                    )}
                  >
                    {(e.kind === "in" || e.kind === "settlement") === e.amount >= 0 ? "+" : "−"}
                    {money(Math.abs(e.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ResponsiveSheet
        open={entry !== null}
        onOpenChange={(o) => {
          if (!o) {
            setEntry(null);
            setAmt(0);
            setReason("");
          }
        }}
        title={entry === "in" ? "Cash in" : "Cash out"}
        footer={
          <Button
            className="tap w-full"
            disabled={busy || amt <= 0 || !reason.trim()}
            onClick={async () => {
              setBusy(true);
              const res = await pos.act((b) => b.cashMovement(entry!, amt, reason));
              setBusy(false);
              if (res.ok) {
                toast.success(`${entry === "in" ? "Cash in" : "Cash out"} ${money(amt)} saved`);
                setEntry(null);
                setAmt(0);
                setReason("");
              } else toast.error(res.error);
            }}
          >
            {busy ? <Spinner /> : null} Save
          </Button>
        }
      >
        <div className="space-y-3 py-2">
          <Label>Amount</Label>
          <NumberField value={amt} onChange={setAmt} className="h-12 text-xl" />
          <Label>Reason</Label>
          <Input
            className="tap"
            placeholder={entry === "in" ? "e.g. Change from bank" : "e.g. Vegetables"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </ResponsiveSheet>

      <ResponsiveSheet
        open={closing}
        onOpenChange={setClosing}
        title="Close cash session"
        description="Count the notes and coins in the drawer."
        footer={
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md bg-muted p-2">
                <p className="text-muted-foreground">Expected</p>
                <p className="num text-sm">{money(expected)}</p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-muted-foreground">Counted</p>
                <p className="num text-sm">{money(counted)}</p>
              </div>
              <div
                className={cn(
                  "rounded-md p-2",
                  diff === 0
                    ? "bg-status-ready-soft text-status-ready"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                <p>Difference</p>
                <p className="num text-sm">
                  {diff > 0 ? "+" : diff < 0 ? "−" : ""}
                  {money(Math.abs(diff))}
                </p>
              </div>
            </div>
            {diff !== 0 ? (
              <Input
                className="tap"
                placeholder="Reason for the difference (required)"
                value={varianceReason}
                onChange={(e) => setVarianceReason(e.target.value)}
              />
            ) : null}
            <Button
              className="tap w-full"
              disabled={busy || (diff !== 0 && !varianceReason.trim())}
              onClick={async () => {
                setBusy(true);
                const res = await pos.act((b) =>
                  b.closeCash(
                    Object.fromEntries(DENOMINATIONS.map((d) => [String(d), counts[d] ?? 0])),
                    varianceReason,
                  ),
                );
                setBusy(false);
                if (res.ok) {
                  setClosing(false);
                  setClosed(res.session);
                } else toast.error(res.error);
              }}
            >
              {busy ? <Spinner /> : <Lock className="size-4" />} Close session
            </Button>
          </div>
        }
      >
        <ul className="space-y-2 py-2">
          {DENOMINATIONS.map((d) => (
            <li key={d} className="flex items-center gap-3">
              <span className="num w-16 font-display">₹{d}</span>
              <span className="text-muted-foreground">×</span>
              <NumberField
                decimals={0}
                value={counts[d] ?? 0}
                onChange={(v) => setCounts((c) => ({ ...c, [d]: Math.floor(v) }))}
                className="h-11 w-24"
              />
              <span className="num ml-auto text-sm">{money(d * (counts[d] ?? 0))}</span>
            </li>
          ))}
        </ul>
      </ResponsiveSheet>
    </AppShell>
  );
}
