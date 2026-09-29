import { Download, FileUp, FolderDown, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import type { MenuImportResult } from "@/lib/pos/backend/types";
import {
  MENU_CSV_HEADERS,
  MENU_CSV_SAMPLE,
  menuToCsv,
  parseMenuCsv,
  toCsv,
  type MenuCsvRow,
} from "@/lib/pos/csv";
import { canShareFiles, saveFile, shareFile } from "@/lib/pos/fileExport";
import { money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type { MenuCatalog } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

// Menu import / export in the Web POS CSV (owner bug list 2026-09-26, item 15).

const fileName = (menu: MenuCatalog | undefined, suffix: string) =>
  `${(menu?.name ?? "menu").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}.csv`;

/** Share sheet or save to the phone; a download in a browser. */
export function ExportMenuSheet({
  menu,
  open,
  onOpenChange,
}: {
  menu: MenuCatalog | undefined;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const pos = usePos();
  const data = pos.data!;
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  const items = data.items.filter((i) => i.menuId === menu?.id);
  const csv = () =>
    menuToCsv(
      items,
      data.categories.filter((c) => c.menuId === menu?.id),
    );
  const name = fileName(menu, "items");
  const run = async (kind: "share" | "save") => {
    setBusy(kind);
    try {
      if (kind === "share") await shareFile(name, csv());
      else toast.success("Menu saved", { description: await saveFile(name, csv()) });
      onOpenChange(false);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      // Closing the share sheet is not an error.
      if (!/cancel/i.test(msg)) toast.error(msg || "Could not export the menu");
    } finally {
      setBusy(null);
    }
  };
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Export ${menu?.name ?? "menu"}`}
      description={`${items.length} items as a CSV (${MENU_CSV_HEADERS.join(", ")}) — opens in Excel or Sheets, and imports back here or into the Web POS.`}
    >
      <div className="grid gap-2 py-2">
        {canShareFiles() ? (
          <>
            <Button className="tap" disabled={busy !== null} onClick={() => void run("share")}>
              {busy === "share" ? <Spinner /> : <Share2 className="size-4" />} Share (WhatsApp,
              Drive, e-mail…)
            </Button>
            <Button
              variant="outline"
              className="tap"
              disabled={busy !== null}
              onClick={() => void run("save")}
            >
              {busy === "save" ? <Spinner /> : <FolderDown className="size-4" />} Save to phone
              (Documents/BillerPe)
            </Button>
          </>
        ) : (
          <Button className="tap" disabled={busy !== null} onClick={() => void run("save")}>
            {busy ? <Spinner /> : <Download className="size-4" />} Download {name}
          </Button>
        )}
      </div>
    </ResponsiveSheet>
  );
}

export function ImportMenuSheet({
  menu,
  open,
  onOpenChange,
}: {
  menu: MenuCatalog | undefined;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const pos = usePos();
  const data = pos.data!;
  const [rows, setRows] = useState<MenuCsvRow[] | null>(null);
  const [file, setFile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MenuImportResult | null>(null);
  const reset = () => {
    setRows(null);
    setFile("");
    setError(null);
    setResult(null);
  };
  const close = (o: boolean) => {
    if (busy) return;
    if (!o) reset();
    onOpenChange(o);
  };
  const valid = rows?.filter((r) => !r.error) ?? [];
  const newCats = new Set(valid.filter((r) => r.isNewCategory).map((r) => r.category.toLowerCase()))
    .size;
  const updates = valid.filter((r) => r.existingId).length;

  const read = (f: File) => {
    setError(null);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseMenuCsv(
        String(reader.result ?? ""),
        data.categories.filter((c) => c.menuId === menu?.id),
        data.items.filter((i) => i.menuId === menu?.id),
      );
      if (!parsed.length) setError("No items found in this file.");
      setRows(parsed);
      setFile(f.name);
    };
    reader.onerror = () => setError("Could not read the file.");
    reader.readAsText(f);
  };

  const run = async () => {
    if (!menu) return;
    setBusy(true);
    const r = await pos.act((b) =>
      b.importMenu(
        menu.id,
        valid.map(({ name, category, price, shortCode, veg, active }) => ({
          name,
          category,
          price,
          shortCode,
          veg,
          active,
        })),
      ),
    );
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(`Menu imported: ${r.created} added, ${r.updated} updated`, {
      description: r.categoriesCreated ? `${r.categoriesCreated} new categories` : undefined,
    });
    if (r.failed.length) setResult(r);
    else close(false);
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={close}
      title={`Import items into ${menu?.name ?? "this menu"}`}
      description="Fill the template in Excel or Sheets and save it as CSV. New categories are created; an item with the same name is updated (its variants and add-ons stay)."
      footer={
        rows && valid.length && !result ? (
          <Button className="tap w-full" disabled={busy} onClick={() => void run()}>
            {busy ? <Spinner /> : <FileUp className="size-4" />} Import {valid.length} item
            {valid.length === 1 ? "" : "s"}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="tap"
            onClick={() =>
              void shareFile(
                "menu-items-template.csv",
                toCsv([MENU_CSV_HEADERS, ...MENU_CSV_SAMPLE]),
              ).catch(() => undefined)
            }
          >
            <Download className="size-4" /> Template
          </Button>
          <label className="tap inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
            <FileUp className="size-4" /> {file ? "Another file" : "Choose CSV"}
            <input
              type="file"
              accept=".csv,text/csv,text/comma-separated-values,application/vnd.ms-excel,text/plain"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) read(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <FormError error={error} />

        {result ? (
          <div className="space-y-2 rounded-lg border border-destructive/40 p-3">
            <p className="text-sm font-semibold">
              {result.created} added, {result.updated} updated. These rows were not imported:
            </p>
            <ul className="space-y-1 text-sm">
              {result.failed.map((f) => (
                <li key={f.line}>
                  Row {f.line} {f.name ? `· ${f.name}` : ""} —{" "}
                  <span className="text-destructive">{f.error}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : rows && rows.length ? (
          <>
            <p className="text-xs text-muted-foreground">
              {file} · {valid.length} of {rows.length} ready
              {updates ? ` · ${updates} update existing items` : ""}
              {newCats ? ` · ${newCats} new ${newCats === 1 ? "category" : "categories"}` : ""}
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card px-3">
              {rows.map((r) => (
                <li key={r.line} className="flex items-center gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.name || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.category || "—"}
                      {r.isNewCategory ? " (new)" : ""} · {r.veg ? "Veg" : "Non-veg"}
                      {r.active ? "" : " · hidden"}
                    </p>
                  </div>
                  <span className="num shrink-0">{r.price > 0 ? money(r.price) : "—"}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold",
                      r.error
                        ? "bg-destructive/10 text-destructive"
                        : r.existingId
                          ? "bg-status-billed-soft text-status-billed"
                          : "bg-status-ready-soft text-status-ready",
                    )}
                  >
                    {r.error ?? (r.existingId ? "UPDATE" : "NEW")}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Columns: {MENU_CSV_HEADERS.join(", ")}. Veg and Active are Yes / No. Leave Short code
            empty to get one automatically. A file exported from the Web POS works as it is.
          </p>
        )}
      </div>
    </ResponsiveSheet>
  );
}
