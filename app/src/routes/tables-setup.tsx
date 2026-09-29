import { createFileRoute } from "@tanstack/react-router";
import { Download, Pencil, Plus, QrCode, Share2, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { isShareCancel, saveFile, shareFile } from "@/lib/pos/fileExport";
import { Field, FormError } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePos } from "@/lib/pos/store";
import type { PosTable } from "@/lib/pos/types";

export const Route = createFileRoute("/tables-setup")({
  component: TablesSetup,
});

function TablesSetup() {
  const pos = usePos();
  const data = pos.data!;
  const edit = pos.can("tables", "edit");
  const sections = [...data.sections].sort((a, b) => a.rank - b.rank);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [secSheet, setSecSheet] = useState<{
    id?: string | undefined;
    name: string;
    rank: number;
  } | null>(null);
  const [tableEdit, setTableEdit] = useState<PosTable | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [spec, setSpec] = useState("");
  const [seats, setSeats] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<PosTable | null>(null);
  const tables = data.tables.filter((t) => t.sectionId === sectionId);
  const section = data.sections.find((s) => s.id === sectionId);
  const qrTable = qr ? data.tables.find((t) => t.id === qr.id) : undefined;

  // A printable card (outlet, QR, table name) as a PNG. On the phone "Save"
  // writes it to Documents/BillerPe and "Share" opens the share sheet - the
  // Android WebView has no downloads.
  const qrCard = async (t: PosTable) => {
    const { qrCardPng } = await import("@/lib/pos/pdf");
    return qrCardPng({
      url: t.qrUrl!,
      outlet: data.outlet.name,
      table: `Table ${t.name}`,
      note: data.settings.qrOrdering ? "Scan to see the menu and order" : "Scan to see the menu",
    });
  };
  const cardName = (t: PosTable) => `table-${t.name.replace(/[^a-z0-9]+/gi, "-")}-qr.png`;
  const saveQr = async (t: PosTable) => {
    try {
      const where = await saveFile(cardName(t), await qrCard(t), "image/png");
      toast.success(`QR for ${t.name} saved to ${where}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the QR");
    }
  };
  const shareQr = async (t: PosTable) => {
    try {
      await shareFile(cardName(t), await qrCard(t), "image/png");
    } catch (e) {
      if (!isShareCancel(e)) toast.error("Could not share the QR");
    }
  };

  return (
    <AppShell title="Tables setup">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
            {sections.map((s) => (
              <Chip key={s.id} active={s.id === sectionId} onClick={() => setSectionId(s.id)}>
                <span translate="no">{s.name}</span>
              </Chip>
            ))}
          </div>
          {edit ? (
            <Button
              variant="outline"
              size="sm"
              className="tap"
              onClick={() => {
                setError(null);
                setSecSheet({ name: "", rank: sections.length + 1 });
              }}
            >
              <Plus className="size-4" /> Section
            </Button>
          ) : null}
        </div>
        {section ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display font-bold">
              <span translate="no">{section.name}</span> · {tables.length} tables
            </p>
            {edit ? (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="tap"
                  onClick={() => {
                    setError(null);
                    // Rank = the section's position (1 = first).
                    setSecSheet({ ...section, rank: sections.indexOf(section) + 1 });
                  }}
                >
                  <Pencil className="size-4" /> Edit
                </Button>
                {tables.length === 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="tap text-destructive"
                    onClick={async () => {
                      const r = await pos.act((b) => b.deleteSection(section.id));
                      if (r.ok) {
                        toast.success("Section deleted");
                        setSectionId(sections.find((x) => x.id !== section.id)?.id ?? "");
                      } else toast.error(r.error);
                    }}
                  >
                    <Trash2 className="size-4" /> Delete
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  className="tap"
                  onClick={() => {
                    setSpec("");
                    setError(null);
                    setAddOpen(true);
                  }}
                >
                  <Plus className="size-4" /> Add tables
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {tables.length === 0 ? (
          <EmptyState
            title="No tables in this section"
            body="Add one table like T5 or a range like T1–T20."
          />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {tables.map((t) => (
              <div key={t.id} className="rounded-lg border border-border bg-card p-3 shadow-soft">
                <p className="font-display text-lg font-extrabold">
                  <span translate="no">{t.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.seats} seats · {t.orderId ? "in use" : "free"}
                </p>
                <div className="mt-2 flex gap-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setQr(t)}>
                    <QrCode className="size-4" /> QR
                  </Button>
                  {edit ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${t.name}`}
                        onClick={() => {
                          setError(null);
                          setTableEdit(t);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${t.name}`}
                        onClick={async () => {
                          const r = await pos.act((b) => b.deleteTable(t.id));
                          if (r.ok) toast.success(`${t.name} deleted`);
                          else toast.error(r.error);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ResponsiveSheet
        open={Boolean(secSheet)}
        onOpenChange={(o) => !o && setSecSheet(null)}
        title={secSheet?.id ? "Edit section" : "New section"}
        footer={
          <Button
            className="tap w-full"
            onClick={async () => {
              if (!secSheet) return;
              if (!(Number.isInteger(secSheet.rank) && secSheet.rank >= 1))
                return setError("Rank must be a whole number from 1");
              const r = await pos.act((b) =>
                b.saveSection({ id: secSheet.id, name: secSheet.name, rank: secSheet.rank }),
              );
              if (r.ok) {
                setSecSheet(null);
                toast.success("Section saved");
              } else setError(r.error);
            }}
          >
            Save
          </Button>
        }
      >
        <div className="space-y-2 py-2">
          <Field label="Section name *">
            <Input
              className="tap"
              maxLength={30}
              value={secSheet?.name ?? ""}
              onChange={(e) => {
                setSecSheet((s) => (s ? { ...s, name: e.target.value } : s));
                setError(null);
              }}
              placeholder="e.g. Terrace"
            />
          </Field>
          <Field
            label="Rank"
            hint={`Its place in the list: 1 is first, ${sections.length + (secSheet?.id ? 0 : 1)} is last. The other sections move to make room.`}
          >
            <NumberField
              value={secSheet?.rank ?? 1}
              onChange={(v) => {
                setSecSheet((s) => (s ? { ...s, rank: v } : s));
                setError(null);
              }}
            />
          </Field>
          <FormError error={error} />
        </div>
      </ResponsiveSheet>

      <ResponsiveSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        title={`Add tables to ${section?.name ?? ""}`}
        footer={
          <Button
            className="tap w-full"
            disabled={busy || !spec.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await pos.act((b) => b.addTables(sectionId, spec, seats));
              setBusy(false);
              if (!r.ok) return setError(r.error);
              toast.success(
                `${r.added} table(s) added${r.skipped.length ? ` · skipped existing ${r.skipped.join(", ")}` : ""}`,
              );
              setAddOpen(false);
            }}
          >
            {busy ? <Spinner /> : null} Add
          </Button>
        }
      >
        <div className="space-y-3 py-2">
          <Field label="Table name or range" hint="One table: T5 · A range: T1–T20 (or T1-T20)">
            <Input
              className="tap uppercase"
              value={spec}
              onChange={(e) => {
                setSpec(e.target.value);
                setError(null);
              }}
              placeholder="T1–T20"
            />
          </Field>
          <Field label="Seats per table">
            <NumberField decimals={0} value={seats} onChange={(v) => setSeats(Math.floor(v))} />
          </Field>
          <FormError error={error} />
        </div>
      </ResponsiveSheet>

      <TableEditSheet table={tableEdit} sections={sections} onClose={() => setTableEdit(null)} />

      <ResponsiveSheet
        open={Boolean(qr)}
        onOpenChange={(o) => !o && setQr(null)}
        title={`Table ${qr?.name ?? ""} QR`}
        description="Guests scan to see the menu and order."
      >
        {qrTable?.qrUrl ? (
          <div className="flex flex-col items-center gap-3 py-3">
            <div className="rounded-lg border border-border bg-white p-4">
              <QRCodeSVG value={qrTable.qrUrl} size={220} includeMargin />
            </div>
            <p className="font-display text-xl font-extrabold">
              {data.outlet.name} · <span translate="no">{qrTable.name}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              QR version {qrTable.qrVersion}
              {data.settings.qrOrdering ? "" : " · ordering is off, guests only see the menu"}
            </p>
            <div className="grid w-full grid-cols-2 gap-2">
              <Button variant="outline" className="tap" onClick={() => void saveQr(qrTable)}>
                <Download className="size-4" /> Save
              </Button>
              <Button variant="outline" className="tap" onClick={() => void shareQr(qrTable)}>
                <Share2 className="size-4" /> Share
              </Button>
            </div>
            {pos.can("ops-experience", "edit") ? (
              <Button
                variant="ghost"
                className="tap w-full text-destructive"
                onClick={async () => {
                  const r = await pos.act((b) => b.newTableQr(qrTable.id));
                  toast[r.ok ? "success" : "error"](
                    r.ok ? "New QR made — print it; the old sticker no longer works" : r.error,
                  );
                }}
              >
                New QR (old sticker stops working)
              </Button>
            ) : null}
          </div>
        ) : qr ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This table has no QR link yet.
          </p>
        ) : null}
      </ResponsiveSheet>
    </AppShell>
  );
}

function TableEditSheet({
  table,
  sections,
  onClose,
}: {
  table: PosTable | null;
  sections: { id: string; name: string }[];
  onClose: () => void;
}) {
  const pos = usePos();
  const [name, setName] = useState("");
  const [seats, setSeats] = useState(4);
  const [sectionId, setSectionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  if ((table?.id ?? null) !== openFor) {
    setOpenFor(table?.id ?? null);
    if (table) {
      setName(table.name);
      setSeats(table.seats);
      setSectionId(table.sectionId);
      setError(null);
    }
  }
  return (
    <ResponsiveSheet
      open={Boolean(table)}
      onOpenChange={(o) => !o && onClose()}
      title={table ? `Edit ${table.name}` : ""}
      footer={
        <Button
          className="tap w-full"
          onClick={async () => {
            if (!table) return;
            const r = await pos.act((b) => b.editTable(table.id, { name, seats, sectionId }));
            if (!r.ok) return setError(r.error);
            toast.success("Table saved");
            onClose();
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Name *">
          <Input
            className="tap uppercase"
            maxLength={10}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Seats">
          <NumberField decimals={0} value={seats} onChange={(v) => setSeats(Math.floor(v))} />
        </Field>
        <Field label="Section">
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <Chip key={s.id} active={sectionId === s.id} onClick={() => setSectionId(s.id)}>
                <span translate="no">{s.name}</span>
              </Chip>
            ))}
          </div>
        </Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}
