import { createFileRoute } from "@tanstack/react-router";
import { Download, Pencil, Plus, QrCode, Share2, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { shareText } from "@/components/pos/billing/share";
import { Field, FormError } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { can } from "@/lib/pos/permissions";
import { usePos } from "@/lib/pos/store";
import type { PosTable } from "@/lib/pos/types";

export const Route = createFileRoute("/tables-setup")({
  head: () => ({
    meta: [
      { title: "Tables setup — BillerPe POS" },
      { name: "description", content: "Sections, single or bulk tables and table QR codes for ordering." },
      { property: "og:title", content: "Tables setup — BillerPe POS" },
      { property: "og:description", content: "Sections, single or bulk tables and table QR codes for ordering." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TablesSetup,
});

const qrUrl = (outletId: string, t: PosTable) => `https://order.billerpe.in/demo/${outletId}/${encodeURIComponent(t.name)}`;

function TablesSetup() {
  const pos = usePos();
  const edit = can(pos.permissions, "tables", "edit");
  const [sectionId, setSectionId] = useState(pos.sections[0]?.id ?? "");
  const [secSheet, setSecSheet] = useState<{ id: string; name: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [spec, setSpec] = useState("");
  const [seats, setSeats] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<PosTable | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const tables = pos.tables.filter((t) => t.sectionId === sectionId);
  const section = pos.sections.find((s) => s.id === sectionId);

  const download = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg || !qr) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `table-${qr.name}-qr.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`QR for ${qr.name} downloaded`);
  };

  return (
    <AppShell title="Tables setup">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
            {pos.sections.map((s) => <Chip key={s.id} active={s.id === sectionId} onClick={() => setSectionId(s.id)}>{s.name}</Chip>)}
          </div>
          {edit ? <Button variant="outline" size="sm" className="tap" onClick={() => setSecSheet({ id: `sec-${Date.now()}`, name: "" })}><Plus className="size-4" /> Section</Button> : null}
        </div>
        {section ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display font-bold">{section.name} · {tables.length} tables</p>
            {edit ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="tap" onClick={() => setSecSheet(section)}><Pencil className="size-4" /> Rename</Button>
                <Button size="sm" className="tap" onClick={() => { setSpec(""); setError(null); setAddOpen(true); }}><Plus className="size-4" /> Add tables</Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {tables.length === 0 ? (
          <EmptyState title="No tables in this section" body="Add one table like T5 or a range like T1–T20." />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {tables.map((t) => (
              <div key={t.id} className="rounded-lg border border-border bg-card p-3 shadow-soft">
                <p className="font-display text-lg font-extrabold">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.seats} seats · {t.status}</p>
                <div className="mt-2 flex gap-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setQr(t)}><QrCode className="size-4" /> QR</Button>
                  {edit ? (
                    <Button variant="ghost" size="icon" aria-label={`Delete ${t.name}`} onClick={async () => { const r = await pos.deleteTable(t.id); if (r.ok) toast.success(`${t.name} deleted`); else toast.error(r.error ?? ""); }}><Trash2 className="size-4" /></Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ResponsiveSheet open={Boolean(secSheet)} onOpenChange={(o) => !o && setSecSheet(null)} title="Section" footer={
        <Button className="tap w-full" onClick={async () => { if (!secSheet) return; const r = await pos.saveSection({ ...secSheet, name: secSheet.name.trim() }); if (r.ok) { setSectionId(secSheet.id); setSecSheet(null); toast.success("Section saved"); } else setError(r.error ?? ""); }}>Save</Button>
      }>
        <div className="space-y-2 py-2">
          <Field label="Section name *"><Input className="tap" maxLength={30} value={secSheet?.name ?? ""} onChange={(e) => { setSecSheet((s) => (s ? { ...s, name: e.target.value } : s)); setError(null); }} placeholder="e.g. Terrace" /></Field>
          <FormError error={error} />
        </div>
      </ResponsiveSheet>

      <ResponsiveSheet open={addOpen} onOpenChange={setAddOpen} title={`Add tables to ${section?.name ?? ""}`} footer={
        <Button className="tap w-full" disabled={busy || !spec.trim()} onClick={async () => {
          setBusy(true);
          const r = await pos.addTables(sectionId, spec, seats);
          setBusy(false);
          if (!r.ok) return setError(r.error ?? "");
          toast.success(`${r.added} table(s) added${r.error ? ` · ${r.error}` : ""}`);
          setAddOpen(false);
        }}>{busy ? <Spinner /> : null} Add</Button>
      }>
        <div className="space-y-3 py-2">
          <Field label="Table name or range" hint="One table: T5 · A range: T1–T20 (or T1-T20)">
            <Input className="tap uppercase" value={spec} onChange={(e) => { setSpec(e.target.value); setError(null); }} placeholder="T1–T20" />
          </Field>
          <Field label="Seats per table"><NumberField decimals={0} value={seats} onChange={(v) => setSeats(Math.floor(v))} /></Field>
          <FormError error={error} />
        </div>
      </ResponsiveSheet>

      <ResponsiveSheet open={Boolean(qr)} onOpenChange={(o) => !o && setQr(null)} title={`Table ${qr?.name ?? ""} QR`} description="Guests scan to see the menu and order.">
        {qr ? (
          <div className="flex flex-col items-center gap-3 py-3">
            <div ref={qrRef} className="rounded-lg border border-border bg-white p-4"><QRCodeSVG value={qrUrl(pos.outlet.id, qr)} size={220} includeMargin /></div>
            <p className="font-display text-xl font-extrabold">{pos.outlet.restaurant} · {qr.name}</p>
            <div className="grid w-full grid-cols-2 gap-2">
              <Button variant="outline" className="tap" onClick={download}><Download className="size-4" /> Download</Button>
              <Button variant="outline" className="tap" onClick={() => void shareText(`Table ${qr.name}`, `Order at ${pos.outlet.restaurant}, table ${qr.name}: ${qrUrl(pos.outlet.id, qr)}`)}><Share2 className="size-4" /> Share</Button>
            </div>
          </div>
        ) : null}
      </ResponsiveSheet>
    </AppShell>
  );
}
