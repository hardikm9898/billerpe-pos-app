import { createFileRoute } from "@tanstack/react-router";
import { Bluetooth, Cpu, FileText, Plus, Printer, Search, Trash2, Usb, Wifi } from "lucide-react";
import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/pos/AppShell";
import { BackLink, Card, Field, FormError, Segmented } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { EmptyState, NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePos } from "@/lib/pos/store";
import type { Printer as PrinterT } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/printers")({
  validateSearch: (s) => z.object({ device: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Printer settings — BillerPe POS" },
      { name: "description", content: "Set up Wi-Fi, Bluetooth, USB, built-in or PDF printers for this device and route bills and KOTs." },
      { property: "og:title", content: "Printer settings — BillerPe POS" },
      { property: "og:description", content: "Set up Wi-Fi, Bluetooth, USB, built-in or PDF printers for this device and route bills and KOTs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrintersPage,
});

const kinds: { id: PrinterT["kind"]; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "wifi", label: "Wi-Fi", icon: Wifi },
  { id: "bluetooth", label: "Bluetooth", icon: Bluetooth },
  { id: "usb", label: "USB", icon: Usb },
  { id: "builtin", label: "Built-in", icon: Cpu },
  { id: "system", label: "System / PDF", icon: FileText },
];
const statusMeta: Record<PrinterT["status"], { label: string; cls: string }> = {
  connected: { label: "Connected", cls: "bg-status-ready-soft text-status-ready" },
  unreachable: { label: "Not reachable", cls: "bg-status-hold-soft text-status-hold" },
  unsupported: { label: "Driver not supported yet", cls: "bg-destructive/10 text-destructive" },
};
const btList = [{ name: "InnerPrinter", mac: "00:11:22:33:44:55" }, { name: "RPP02N", mac: "86:67:7A:12:9C:01" }, { name: "MTP-II", mac: "DC:0D:30:A1:22:7F" }];
const usbList = ["USB Thermal Printer (0x0483)", "Epson TM-T82 (0x04b8)"];

function PrintersPage() {
  const pos = usePos();
  const { device: deviceParam } = Route.useSearch();
  const device = pos.devices.find((d) => d.id === deviceParam) ?? pos.devices.find((d) => d.thisDevice) ?? pos.devices[0];
  const [scan, setScan] = useState<"idle" | "scanning" | "found" | "none">("idle");
  const [editing, setEditing] = useState<PrinterT | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  if (!device) return <AppShell title="Printers"><EmptyState title="No device" /></AppShell>;
  const printers = device.thisDevice ? pos.printers : device.printers;
  const routing = device.routing;
  const knownBuiltIn = ["sunmi", "pax", "imin", "telpo"].includes(device.make.toLowerCase());

  const find = () => {
    setScan("scanning");
    setTimeout(() => setScan(knownBuiltIn ? "found" : "none"), 1600);
  };
  const test = async (p: PrinterT) => {
    setTesting(p.id);
    const r = await pos.testPrint(device.id, p.id);
    setTesting(null);
    if (r.ok) toast.success(`Test page printed on ${p.name}`);
    else toast.error(r.error ?? "Test print failed");
  };
  const useBuiltIn = async () => {
    const p: PrinterT = { id: `prn-${Date.now()}`, name: "Built-in printer", kind: "builtin", paperWidth: "58mm", status: "connected", copies: 1 };
    const r = await pos.savePrinter(device.id, p);
    if (r.ok) { setScan("idle"); await test(p); }
  };
  const newPrinter = (kind: PrinterT["kind"]): PrinterT => ({
    id: `prn-${Date.now()}`, name: kind === "system" ? "System print / PDF" : "", kind, paperWidth: "80mm", status: "connected", copies: 1,
    address: kind === "wifi" ? "192.168.1.60:9100" : undefined,
  });

  return (
    <AppShell title="Printer settings" topBarLeft={deviceParam ? <BackLink to="/devices" /> : undefined}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <p className="font-display text-lg font-bold">Printers on this device: {device.name}</p>
          <Card className="mt-2 flex items-center gap-3">
            <Cpu className="size-5 text-muted-foreground" />
            <p className="text-sm">This device: <b>{device.make} {device.model}</b> · {device.android}</p>
          </Card>
        </div>

        <Card className="space-y-3">
          <Button className="tap w-full" variant="outline" disabled={scan === "scanning"} onClick={find}>
            {scan === "scanning" ? <Spinner /> : <Search className="size-4" />} {scan === "scanning" ? "Looking for a built-in printer…" : "Find built-in printer"}
          </Button>
          {scan === "found" ? (
            <div className="rounded-lg border border-status-ready/40 bg-status-ready-soft p-3">
              <p className="font-bold text-status-ready">Built-in printer found</p>
              <p className="text-sm text-muted-foreground">via Bluetooth "InnerPrinter" ({device.make} brand driver)</p>
              <Button className="tap mt-2 w-full" onClick={() => void useBuiltIn()}>Use & Test print</Button>
            </div>
          ) : null}
          {scan === "none" ? (
            <div className="rounded-lg border border-border bg-muted p-3 text-sm">
              <p className="font-bold">No built-in printer found</p>
              <p className="text-muted-foreground">Add a Wi-Fi, Bluetooth or USB printer below, or use System print / PDF.</p>
            </div>
          ) : null}
        </Card>

        <section className="space-y-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Add printer</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {kinds.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setEditing(newPrinter(id))} className="flex flex-col items-center gap-1 rounded-lg border border-border bg-card p-3 text-xs font-semibold shadow-soft">
                <Icon className="size-5 text-primary" /> {label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Printers</h2>
          {printers.length === 0 ? (
            <EmptyState icon={<Printer className="size-6" />} title="No printer set up on this device" body="KOTs will still reach the kitchen screen." />
          ) : printers.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-card p-3 shadow-soft">
              <div className="flex items-start gap-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(p)}>
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{kinds.find((k) => k.id === p.kind)?.label}{p.address ? ` · ${p.address}` : ""} · {p.paperWidth} · {p.copies ?? 1} copy</p>
                </button>
                <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold", statusMeta[p.status].cls)}>{statusMeta[p.status].label}</span>
              </div>
              {p.status === "unsupported" ? (
                <Button variant="link" className="h-auto p-0 text-xs" onClick={() => { void pos.raiseTicket(`Printer driver: ${device.make} ${device.model}`, `Please add support for ${p.name} on ${device.make} ${device.model}.`); toast.success("Sent to support — we'll call you"); }}>Tell support your model</Button>
              ) : null}
              <div className="mt-2 flex gap-2">
                <Button variant="outline" size="sm" className="tap flex-1" disabled={testing === p.id} onClick={() => void test(p)}>{testing === p.id ? <Spinner /> : null} Test print</Button>
                <Button variant="ghost" size="sm" className="tap" aria-label="Remove printer" onClick={() => void pos.removePrinter(device.id, p.id)}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </section>

        <Card className="space-y-3">
          <h2 className="font-display font-bold">Routing</h2>
          <Field label="Invoice printer">
            <Select value={routing.invoicePrinterId ?? "none"} onValueChange={(v) => pos.setRouting(device.id, { ...routing, invoicePrinterId: v === "none" ? undefined : v })}>
              <SelectTrigger className="tap"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {printers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {pos.outlet.kitchens.map((k) => (
            <Field key={k} label={`KOT printer · ${k}`}>
              <Select value={routing.kotPrinterByKitchen[k] ?? "none"} onValueChange={(v) => { const next = { ...routing.kotPrinterByKitchen }; if (v === "none") delete next[k]; else next[k] = v; pos.setRouting(device.id, { ...routing, kotPrinterByKitchen: next }); }}>
                <SelectTrigger className="tap"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kitchen screen only</SelectItem>
                  {printers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          ))}
          <label className="flex items-center justify-between text-sm font-semibold">
            Print KOT on this device
            <Switch checked={routing.printKotOnDevice} onCheckedChange={(v) => pos.setRouting(device.id, { ...routing, printKotOnDevice: v })} />
          </label>
        </Card>
      </div>

      {editing ? <PrinterSheet key={editing.id} deviceId={device.id} initial={editing} onClose={() => setEditing(null)} /> : null}
    </AppShell>
  );
}

function PrinterSheet({ deviceId, initial, onClose }: { deviceId: string; initial: PrinterT; onClose: () => void }) {
  const pos = usePos();
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [btScan, setBtScan] = useState<"idle" | "scanning" | "done">("idle");
  const ip = f.address?.split(":")[0] ?? "";
  const port = f.address?.split(":")[1] ?? "9100";
  const set = (p: Partial<PrinterT>) => { setF((x) => ({ ...x, ...p })); setError(null); };

  const save = async () => {
    setBusy(true);
    // Mock reachability: Wi-Fi IPs ending in .51 are unreachable
    const status: PrinterT["status"] = f.kind === "wifi" && ip.endsWith(".51") ? "unreachable" : f.kind === "bluetooth" && f.address === "DC:0D:30:A1:22:7F" ? "unsupported" : "connected";
    const r = await pos.savePrinter(deviceId, { ...f, status });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "");
    toast.success(`${f.name} saved`);
    onClose();
  };

  return (
    <ResponsiveSheet open onOpenChange={(o) => !o && onClose()} title={`${kinds.find((k) => k.id === f.kind)?.label} printer`} footer={
      <Button className="tap w-full" disabled={busy} onClick={() => void save()}>{busy ? <Spinner /> : null} Save printer</Button>
    }>
      <div className="space-y-3 py-2">
        <Field label="Name *"><Input className="tap" maxLength={40} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Kitchen printer" /></Field>
        {f.kind === "wifi" ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2"><Field label="IP address"><Input className="tap" inputMode="decimal" value={ip} onChange={(e) => set({ address: `${e.target.value.replace(/[^0-9.]/g, "")}:${port}` })} /></Field></div>
            <Field label="Port"><Input className="tap" inputMode="numeric" value={port} onChange={(e) => set({ address: `${ip}:${e.target.value.replace(/\D/g, "").slice(0, 5)}` })} /></Field>
          </div>
        ) : null}
        {f.kind === "bluetooth" ? (
          <div className="space-y-2">
            <Button variant="outline" className="tap w-full" disabled={btScan === "scanning"} onClick={() => { setBtScan("scanning"); setTimeout(() => setBtScan("done"), 1200); }}>
              {btScan === "scanning" ? <Spinner /> : <Bluetooth className="size-4" />} Scan & pair
            </Button>
            {btScan === "done" ? btList.map((b) => (
              <button key={b.mac} type="button" onClick={() => set({ address: b.mac, name: f.name || b.name })} className={cn("tap flex w-full items-center justify-between rounded-md border px-3 text-sm", f.address === b.mac ? "border-primary bg-primary-soft" : "border-border")}>
                <span className="font-semibold">{b.name}</span><span className="text-xs text-muted-foreground">{b.mac}</span>
              </button>
            )) : null}
          </div>
        ) : null}
        {f.kind === "usb" ? (
          <Field label="Connected USB devices">
            <div className="space-y-2">
              {usbList.map((u) => (
                <button key={u} type="button" onClick={() => set({ address: u, name: f.name || (u.split(" (")[0] ?? u) })} className={cn("tap flex w-full items-center rounded-md border px-3 text-left text-sm font-semibold", f.address === u ? "border-primary bg-primary-soft" : "border-border")}>{u}</button>
              ))}
            </div>
          </Field>
        ) : null}
        {f.kind === "system" ? <p className="text-sm text-muted-foreground">Uses Android's print dialog — works with any printer app or saves as PDF.</p> : null}
        <Field label="Paper width"><Segmented value={f.paperWidth} onChange={(v) => set({ paperWidth: v })} options={[{ id: "58mm", label: "58 mm" }, { id: "80mm", label: "80 mm" }]} /></Field>
        <Field label="Copies (1–5)"><NumberField decimals={0} value={f.copies ?? 1} onChange={(v) => set({ copies: Math.floor(v) })} /></Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}
