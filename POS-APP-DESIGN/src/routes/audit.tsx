import { createFileRoute } from "@tanstack/react-router";
import { History, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/pos/AppShell";
import { Chip, EmptyState } from "@/components/pos/primitives";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateTime } from "@/lib/pos/format";
import { roleLabel } from "@/lib/pos/permissions";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit log — BillerPe POS" },
      { name: "description", content: "Who did what and when: cancellations, discounts, permission and menu changes." },
      { property: "og:title", content: "Audit log — BillerPe POS" },
      { property: "og:description", content: "Who did what and when: cancellations, discounts, permission and menu changes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const pos = usePos();
  const [module, setModule] = useState("all");
  const [who, setWho] = useState("all");
  const [q, setQ] = useState("");
  const modules = Array.from(new Set(pos.audit.map((a) => a.module)));
  const people = Array.from(new Set(pos.audit.map((a) => a.by)));
  const list = useMemo(
    () => pos.audit.filter((a) => (module === "all" || a.module === module) && (who === "all" || a.by === who) && (!q || a.action.toLowerCase().includes(q.toLowerCase()))),
    [pos.audit, module, who, q],
  );
  return (
    <AppShell title="Audit log">
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="tap pl-9" placeholder="Search actions" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
            <Chip active={module === "all"} onClick={() => setModule("all")}>All</Chip>
            {modules.map((m) => <Chip key={m} active={module === m} onClick={() => setModule(m)}>{m}</Chip>)}
          </div>
          <Select value={who} onValueChange={setWho}>
            <SelectTrigger className="tap w-36" aria-label="Staff"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {people.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {list.length === 0 ? <EmptyState icon={<History className="size-6" />} title="No entries" body="Actions like discounts, cancellations and setting changes appear here." /> : (
          <ol className="space-y-2">
            {list.map((a) => (
              <li key={a.id} className="rounded-lg border border-border bg-card p-3 shadow-soft">
                <p className="text-sm font-semibold">{a.action}</p>
                <p className="text-xs text-muted-foreground">{dateTime(a.at)} · {a.by} ({roleLabel[a.role]}) · {a.module}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </AppShell>
  );
}
