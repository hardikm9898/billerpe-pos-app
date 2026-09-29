import { createFileRoute } from "@tanstack/react-router";
import {
  Bluetooth,
  Cpu,
  FileText,
  Printer,
  Search,
  Trash2,
  Usb,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Card, Field, FormError, Segmented } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { printerDriver, testPrint, type BuiltInPrinter } from "@/lib/pos/printing";
import { usePos } from "@/lib/pos/store";
import {
  ORDER_TYPE_LABEL,
  type DevicePrinter,
  type OrderType,
  type PrinterConnection,
} from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/printers")({
  validateSearch: (s: Record<string, unknown>): { device?: string | undefined } => ({
    device: typeof s["device"] === "string" ? s["device"] : undefined,
  }),
  component: PrintersPage,
});

const kinds: { id: PrinterConnection; label: string; icon: LucideIcon }[] = [
  { id: "wifi", label: "Wi-Fi", icon: Wifi },
  { id: "bluetooth", label: "Bluetooth", icon: Bluetooth },
  { id: "usb", label: "USB", icon: Usb },
  { id: "builtin", label: "Built-in", icon: Cpu },
  { id: "system", label: "System / PDF", icon: FileText },
];
const statusMeta: Record<DevicePrinter["status"], { label: string; cls: string }> = {
  connected: { label: "Connected", cls: "bg-status-ready-soft text-status-ready" },
  unreachable: { label: "Not reachable", cls: "bg-status-hold-soft text-status-hold" },
  unsupported: { label: "Driver not supported yet", cls: "bg-destructive/10 text-destructive" },
  unknown: { label: "Not checked", cls: "bg-muted text-muted-foreground" },
};

/**
 * Printers of ONE device (owner decision: each phone prints its own KOTs to
 * the kitchen printer; every device login has its own printer setup).
 */
function PrintersPage() {
  const pos = usePos();
  const { device: deviceParam } = Route.useSearch();
  const data = pos.data!;
  const device = data.devices.find((d) => d.id === deviceParam) ?? pos.thisDevice;
  const canEdit = pos.can("ops-hardware", "edit");
  const [scan, setScan] = useState<"idle" | "scanning" | "none" | BuiltInPrinter>("idle");
  const [editing, setEditing] = useState<DevicePrinter | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  if (!device)
    return (
      <AppShell title="Printers">
        <EmptyState title="This device is not registered" body="Log in again to register it." />
      </AppShell>
    );
  const isThis = device.id === pos.thisDevice?.id;

  const saveAll = async (printers: DevicePrinter[], printKots = device.printKots) => {
    const r = await pos.act((b) => b.saveDevicePrinters(device.id, printers, printKots));
    if (!r.ok) toast.error(r.error);
    return r.ok;
  };

  const find = async () => {
    setScan("scanning");
    const r = await printerDriver().findBuiltIn();
    setScan(r.found ? r : "none");
  };

  const test = async (p: DevicePrinter) => {
    if (!isThis) return void toast.info("Test print works only on the device itself.");
    setTesting(p.id);
    const o = await testPrint(p);
    setTesting(null);
    // The test tells whether the printer answers; remembered for this device.
    const status: DevicePrinter["status"] = o.ok
      ? "connected"
      : /not supported/i.test(o.error ?? "")
        ? "unsupported"
        : "unreachable";
    if (status !== p.status)
      await saveAll(device.printers.map((x) => (x.id === p.id ? { ...x, status } : x)));
    toast[o.ok ? "success" : "error"](
      o.ok ? `Test page printed on ${p.name}` : (o.error ?? "Test print failed"),
    );
  };

  const blank = (
    connection: PrinterConnection,
    extra: Partial<DevicePrinter> = {},
  ): DevicePrinter => ({
    id: `prn-${crypto.randomUUID().slice(0, 8)}`,
    name: connection === "system" ? "System print / PDF" : "",
    connection,
    paperWidth: "80mm",
    copies: 1,
    printsKot: connection !== "system",
    printsInvoice: connection === "builtin" || connection === "system",
    categoryIds: [],
    sectionIds: [],
    orderTypes: [],
    status: "unknown",
    address: connection === "wifi" ? "192.168.1.60:9100" : undefined,
    ...extra,
  });

  return (
    <AppShell title="Printers" subtitle={device.name}>
      <div className="mx-auto max-w-2xl space-y-4">
        <Card className="flex items-center gap-3">
          <Cpu className="size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm">
            {isThis ? "This device" : device.name}:{" "}
            <b>
              {device.make} {device.model}
            </b>{" "}
            · Android {device.android}
          </p>
        </Card>

        {canEdit && isThis ? (
          <Card className="space-y-3">
            <Button
              className="tap w-full"
              variant="outline"
              disabled={scan === "scanning"}
              onClick={() => void find()}
            >
              {scan === "scanning" ? <Spinner /> : <Search className="size-4" />}{" "}
              {scan === "scanning" ? "Looking for a built-in printer…" : "Find built-in printer"}
            </Button>
            {typeof scan === "object" ? (
              <div className="rounded-lg border border-status-ready/40 bg-status-ready-soft p-3">
                <p className="font-bold text-status-ready">Built-in printer found</p>
                <p className="text-sm text-muted-foreground">via {scan.driver}</p>
                <Button
                  className="tap mt-2 w-full"
                  onClick={async () => {
                    const p = blank("builtin", {
                      name: scan.name ?? "Built-in printer",
                      paperWidth: "58mm",
                      status: "unknown",
                      driver: scan.driver,
                      address: scan.address,
                      printsKot: false,
                      printsInvoice: true,
                    });
                    if (await saveAll([...device.printers, p])) {
                      setScan("idle");
                      await test(p);
                    }
                  }}
                >
                  Use & test print
                </Button>
              </div>
            ) : null}
            {scan === "none" ? (
              <div className="rounded-lg border border-border bg-muted p-3 text-sm">
                <p className="font-bold">No built-in printer found</p>
                <p className="text-muted-foreground">
                  Add a Wi-Fi, Bluetooth or USB printer, or use System print / PDF. If your terminal
                  has a printer we do not support yet, tell support the model.
                </p>
              </div>
            ) : null}
          </Card>
        ) : null}

        {canEdit ? (
          <section className="space-y-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Add printer
            </h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {kinds.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEditing(blank(id))}
                  className="flex flex-col items-center gap-1 rounded-lg border border-border bg-card p-3 text-xs font-semibold shadow-soft"
                >
                  <Icon className="size-5 text-primary" /> {label}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Only staff with printer permission can change printers. You can still test them.
          </p>
        )}

        <section className="space-y-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Printers
          </h2>
          {device.printers.length === 0 ? (
            <EmptyState
              icon={<Printer className="size-6" />}
              title="No printer set up on this device"
              body="KOTs still reach the kitchen screen."
            />
          ) : (
            device.printers.map((p) => (
              <div key={p.id} className="rounded-lg border border-border bg-card p-3 shadow-soft">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    disabled={!canEdit}
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setEditing(p)}
                  >
                    <p className="truncate font-semibold">
                      <span translate="no">{p.name}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {kinds.find((k) => k.id === p.connection)?.label}
                      {p.address ? ` · ${p.address}` : ""} · {p.paperWidth} · {p.copies} cop
                      {p.copies === 1 ? "y" : "ies"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[p.printsKot && "KOT", p.printsInvoice && "Bill"]
                        .filter(Boolean)
                        .join(" + ")}{" "}
                      · {filterSummary(p, data)}
                    </p>
                  </button>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      statusMeta[p.status].cls,
                    )}
                  >
                    {statusMeta[p.status].label}
                  </span>
                </div>
                {p.status === "unsupported" ? (
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={async () => {
                      const r = await pos.act((b) =>
                        b.raiseTicket(
                          `Printer driver: ${device.make} ${device.model}`,
                          `Please add support for ${p.name} on ${device.make} ${device.model} (Android ${device.android}).`,
                          "support",
                        ),
                      );
                      toast[r.ok ? "success" : "error"](
                        r.ok ? "Sent to support — we'll call you" : r.error,
                      );
                    }}
                  >
                    Tell support your model
                  </Button>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="tap flex-1"
                    disabled={testing === p.id}
                    onClick={() => void test(p)}
                  >
                    {testing === p.id ? <Spinner /> : null} Test print
                  </Button>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="tap"
                      aria-label="Remove printer"
                      onClick={() => void saveAll(device.printers.filter((x) => x.id !== p.id))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </section>

        <Card>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>
              Print KOTs from this device
              <span className="block text-xs font-normal text-muted-foreground">
                Off: KOTs from this device go only to the kitchen screen.
              </span>
            </span>
            <Switch
              disabled={!canEdit}
              checked={device.printKots}
              onCheckedChange={(v) => void saveAll(device.printers, v)}
            />
          </label>
        </Card>
      </div>

      {editing ? (
        <PrinterSheet
          key={editing.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (p) => {
            const list = device.printers.some((x) => x.id === p.id)
              ? device.printers.map((x) => (x.id === p.id ? p : x))
              : [...device.printers, p];
            if (await saveAll(list)) {
              toast.success(`${p.name} saved`);
              setEditing(null);
            }
          }}
        />
      ) : null}
    </AppShell>
  );
}

function filterSummary(
  p: DevicePrinter,
  data: NonNullable<ReturnType<typeof usePos>["data"]>,
): string {
  if (!p.printsKot) return "all bills";
  const parts = [
    p.categoryIds.length
      ? `${p.categoryIds.length} categor${p.categoryIds.length === 1 ? "y" : "ies"}`
      : "all items",
    p.sectionIds.length
      ? p.sectionIds
          .map((id) => data.sections.find((s) => s.id === id)?.name)
          .filter(Boolean)
          .join(", ")
      : "all sections",
    p.orderTypes.length ? p.orderTypes.map((t) => ORDER_TYPE_LABEL[t]).join(", ") : "all orders",
  ];
  return parts.join(" · ");
}

function PrinterSheet({
  initial,
  onClose,
  onSave,
}: {
  initial: DevicePrinter;
  onClose: () => void;
  onSave: (p: DevicePrinter) => Promise<void>;
}) {
  const pos = usePos();
  const data = pos.data!;
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [btScan, setBtScan] = useState<"idle" | "scanning" | "done">("idle");
  const [btList, setBtList] = useState<{ name: string; address: string }[]>([]);
  const [usbList, setUsbList] = useState<{ name: string; address: string }[] | null>(null);
  useEffect(() => {
    if (f.connection !== "usb" || usbList) return;
    void printerDriver()
      .listUsb()
      .then(setUsbList, () => setUsbList([]));
  }, [f.connection, usbList]);
  const ip = f.address?.split(":")[0] ?? "";
  const port = f.address?.split(":")[1] ?? "9100";
  const set = (p: Partial<DevicePrinter>) => {
    setF((x) => ({ ...x, ...p }));
    setError(null);
  };
  const toggle = <K extends "categoryIds" | "sectionIds">(key: K, id: string) =>
    set({
      [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id],
    } as Partial<DevicePrinter>);
  const toggleType = (t: OrderType) =>
    set({
      orderTypes: f.orderTypes.includes(t)
        ? f.orderTypes.filter((x) => x !== t)
        : [...f.orderTypes, t],
    });

  const save = async () => {
    if (!f.name.trim()) return setError("Give the printer a name");
    if (!f.printsKot && !f.printsInvoice) return setError("Choose KOT, bill or both");
    if (f.connection === "bluetooth" && !f.address) return setError("Pick the Bluetooth printer");
    setBusy(true);
    // Not checked until a test print answers (Test print on the list).
    const status: DevicePrinter["status"] =
      f.address === initial.address && f.connection === initial.connection
        ? initial.status
        : "unknown";
    await onSave({ ...f, name: f.name.trim(), status });
    setBusy(false);
  };

  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${kinds.find((k) => k.id === f.connection)?.label} printer`}
      footer={
        <Button className="tap w-full" disabled={busy} onClick={() => void save()}>
          {busy ? <Spinner /> : null} Save printer
        </Button>
      }
    >
      <div className="space-y-4 py-2">
        <Field label="Name *">
          <Input
            className="tap"
            maxLength={40}
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Kitchen printer"
          />
        </Field>
        {f.connection === "wifi" ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Field label="IP address">
                <Input
                  className="tap"
                  inputMode="decimal"
                  value={ip}
                  onChange={(e) =>
                    set({ address: `${e.target.value.replace(/[^0-9.]/g, "")}:${port}` })
                  }
                />
              </Field>
            </div>
            <Field label="Port">
              <Input
                className="tap"
                inputMode="numeric"
                value={port}
                onChange={(e) =>
                  set({ address: `${ip}:${e.target.value.replace(/\D/g, "").slice(0, 5)}` })
                }
              />
            </Field>
          </div>
        ) : null}
        {f.connection === "bluetooth" ? (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="tap w-full"
              disabled={btScan === "scanning"}
              onClick={() => {
                setBtScan("scanning");
                void printerDriver()
                  .listBluetooth()
                  .then(
                    (list) => {
                      setBtList(list);
                      setBtScan("done");
                    },
                    (e: unknown) => {
                      setBtScan("idle");
                      setError(e instanceof Error ? e.message : "Could not read Bluetooth devices");
                    },
                  );
              }}
            >
              {btScan === "scanning" ? <Spinner /> : <Bluetooth className="size-4" />} Scan & pair
            </Button>
            {btScan === "done" && !btList.length ? (
              <p className="text-xs text-muted-foreground">
                No paired devices. Pair the printer in Android Bluetooth settings first, then scan
                again.
              </p>
            ) : null}
            {btScan === "done" ? (
              btList.map((b) => (
                <button
                  key={b.address}
                  type="button"
                  onClick={() => set({ address: b.address, name: f.name || b.name })}
                  className={cn(
                    "tap flex w-full items-center justify-between rounded-md border px-3 text-sm",
                    f.address === b.address ? "border-primary bg-primary-soft" : "border-border",
                  )}
                >
                  <span className="font-semibold">
                    <span translate="no">{b.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{b.address}</span>
                </button>
              ))
            ) : f.address ? (
              <p className="text-xs text-muted-foreground">Paired: {f.address}</p>
            ) : null}
          </div>
        ) : null}
        {f.connection === "usb" ? (
          <Field label="Connected USB devices">
            <div className="space-y-2">
              {usbList === null ? <Spinner /> : null}
              {usbList?.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No USB printer attached. Connect it with an OTG cable and open this again.
                </p>
              ) : null}
              {(usbList ?? []).map((u) => (
                <button
                  key={u.address}
                  type="button"
                  onClick={() =>
                    set({ address: u.address, name: f.name || (u.name.split(" (")[0] ?? u.name) })
                  }
                  className={cn(
                    "tap flex w-full items-center rounded-md border px-3 text-left text-sm font-semibold",
                    f.address === u.address ? "border-primary bg-primary-soft" : "border-border",
                  )}
                >
                  <span translate="no">{u.name}</span>
                </button>
              ))}
            </div>
          </Field>
        ) : null}
        {f.connection === "system" ? (
          <p className="text-sm text-muted-foreground">
            Uses Android's print dialog — works with any printer app, or saves as PDF.
          </p>
        ) : null}

        <Field label="Prints">
          <div className="flex gap-2">
            <Chip active={f.printsKot} onClick={() => set({ printsKot: !f.printsKot })}>
              KOT
            </Chip>
            <Chip active={f.printsInvoice} onClick={() => set({ printsInvoice: !f.printsInvoice })}>
              Bill
            </Chip>
          </div>
        </Field>

        {f.printsKot ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">
              Which KOT items this printer takes. Nothing picked = everything. Same rules as the Web
              POS printer setup.
            </p>
            {data.menus.map((m) => (
              <Field key={m.id} label={`Categories · ${m.name}`}>
                <div className="flex flex-wrap gap-1.5">
                  {data.categories
                    .filter((c) => c.menuId === m.id)
                    .map((c) => (
                      <Chip
                        key={c.id}
                        active={f.categoryIds.includes(c.id)}
                        onClick={() => toggle("categoryIds", c.id)}
                      >
                        <span translate="no">{c.name}</span>
                      </Chip>
                    ))}
                </div>
              </Field>
            ))}
            <Field label="Table sections">
              <div className="flex flex-wrap gap-1.5">
                {data.sections.map((s) => (
                  <Chip
                    key={s.id}
                    active={f.sectionIds.includes(s.id)}
                    onClick={() => toggle("sectionIds", s.id)}
                  >
                    <span translate="no">{s.name}</span>
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label="Order types">
              <div className="flex gap-1.5">
                {(["dinin", "pickup"] as OrderType[]).map((t) => (
                  <Chip key={t} active={f.orderTypes.includes(t)} onClick={() => toggleType(t)}>
                    {ORDER_TYPE_LABEL[t]}
                  </Chip>
                ))}
              </div>
            </Field>
          </div>
        ) : null}

        <Field label="Paper width">
          <Segmented
            value={f.paperWidth}
            onChange={(v) => set({ paperWidth: v })}
            options={[
              { id: "58mm", label: "58 mm" },
              { id: "80mm", label: "80 mm" },
            ]}
          />
        </Field>
        <Field label="Copies (1–5)">
          <NumberField
            decimals={0}
            value={f.copies}
            onChange={(v) => set({ copies: Math.max(1, Math.min(5, Math.floor(v) || 1)) })}
          />
        </Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}
