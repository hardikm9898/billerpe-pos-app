import { renderBill, renderKot, renderTest, type ReceiptContext } from "./escpos";
import { upiLink } from "./format";
import { routeToPrinters } from "./routing";
import type {
  Device,
  DevicePrinter,
  Kot,
  Order,
  OrderLine,
  Outlet,
  OutletSettings,
  PosTable,
} from "./types";

// Printing happens on THE DEVICE that acts (owner decision 7.1): the phone
// that sends a KOT prints it on its own printers, routed by the same filters
// as the exe. Printers are reached through a driver layer so any Android POS
// terminal can print: generic ESC/POS over Wi-Fi (TCP 9100), Bluetooth and
// USB first, the terminal's built-in printer, then Android system print as
// the fallback. In the browser build a simulated driver stands in.

export interface PrintJob {
  kind: "kot" | "bill" | "token" | "test";
  title: string;
  /** The same receipt as plain text (preview, system print, simulated driver). */
  lines: string[];
  /** ESC/POS bytes for a thermal printer. */
  bytes: Uint8Array;
}

export interface PrintOutcome {
  printer: DevicePrinter;
  ok: boolean;
  error?: string | undefined;
}

export interface BuiltInPrinter {
  found: boolean;
  driver?: string | undefined;
  name?: string | undefined;
  /** How the app reaches it (a paired virtual Bluetooth printer, a USB device...). */
  connection?: DevicePrinter["connection"] | undefined;
  address?: string | undefined;
}

export interface PrinterDriver {
  print(printer: DevicePrinter, job: PrintJob): Promise<void>;
  /** Look for a printer built into this terminal (virtual BT / USB / brand SDK). */
  findBuiltIn(): Promise<BuiltInPrinter>;
  /** Paired Bluetooth devices, to pick the printer from. */
  listBluetooth(): Promise<{ name: string; address: string }[]>;
  /** USB devices attached to this terminal. */
  listUsb(): Promise<{ name: string; address: string }[]>;
  /** False in the browser demo: printer states there are simulated. */
  readonly native: boolean;
}

/**
 * Browser stand-in so every screen state can be tried: a Wi-Fi printer whose
 * IP ends in .51 does not answer, the Bluetooth "MTP-II" is an unsupported
 * model, everything else prints.
 */
export const simulatedDriver: PrinterDriver = {
  native: false,
  async print(printer) {
    await new Promise((r) => setTimeout(r, 350));
    if (printer.connection === "wifi" && (printer.address ?? "").split(":")[0]!.endsWith(".51"))
      throw new Error(
        `${printer.name} is not reachable. Is this phone on the outlet Wi-Fi and the printer on?`,
      );
    if (printer.connection === "bluetooth" && printer.address === "DC:0D:30:A1:22:7F")
      throw new Error(
        `${printer.name}: this printer model is not supported yet — tell support your model.`,
      );
    if (printer.status === "unreachable")
      throw new Error(
        `${printer.name} is not reachable. Is this phone on the outlet Wi-Fi and the printer on?`,
      );
    if (printer.status === "unsupported")
      throw new Error(
        `${printer.name}: this printer model is not supported yet — tell support your model.`,
      );
  },
  async findBuiltIn() {
    await new Promise((r) => setTimeout(r, 1200));
    return {
      found: true,
      driver: "Virtual Bluetooth (InnerPrinter)",
      name: "Built-in printer",
      connection: "builtin",
      address: "00:11:22:33:44:55",
    };
  },
  async listBluetooth() {
    await new Promise((r) => setTimeout(r, 1200));
    return [
      { name: "InnerPrinter", address: "00:11:22:33:44:55" },
      { name: "RPP02N", address: "86:67:7A:12:9C:01" },
      { name: "MTP-II", address: "DC:0D:30:A1:22:7F" },
      // A busy counter pairs many things: the list must scroll.
      { name: "Galaxy Buds", address: "A4:50:46:12:34:01" },
      { name: "POS-80C", address: "66:22:10:8C:3E:02" },
      { name: "Redmi Note 12", address: "58:A2:B5:77:10:03" },
      { name: "XP-P323B", address: "86:67:7A:55:20:04" },
      { name: "boAt Rockerz 450", address: "F4:4E:FD:01:22:05" },
      { name: "PT-210", address: "DC:0D:30:9F:11:06" },
      { name: "Car Kit", address: "00:1E:7C:44:33:07" },
      { name: "Rugtek RP76", address: "66:12:AB:CD:EF:08" },
      { name: "Kitchen BT printer", address: "86:67:7A:99:00:09" },
    ];
  },
  async listUsb() {
    return [
      { name: "USB Thermal Printer (0x0483)", address: "usb:0483" },
      { name: "Epson TM-T82 (0x04b8)", address: "usb:04b8" },
    ];
  },
};

let driver: PrinterDriver = simulatedDriver;
export const setPrinterDriver = (d: PrinterDriver) => {
  driver = d;
};
export const printerDriver = () => driver;

// What every receipt needs from the outlet; the store keeps it current.
let outletCtx: { outlet: Outlet; settings: OutletSettings; tables: PosTable[] } | null = null;
export const setPrintContext = (c: typeof outletCtx) => {
  outletCtx = c;
};

function context(order: Order, table?: PosTable): ReceiptContext {
  if (!outletCtx) throw new Error("Outlet details are not loaded yet");
  const t = table ?? outletCtx.tables.find((x) => x.id === order.tableId);
  return { outlet: outletCtx.outlet, settings: outletCtx.settings, tableName: t?.name };
}

async function send(
  printers: DevicePrinter[],
  job: (p: DevicePrinter) => PrintJob | PrintJob[],
): Promise<PrintOutcome[]> {
  return Promise.all(
    printers.map(async (printer) => {
      try {
        const jobs = [job(printer)].flat();
        for (let i = 0; i < Math.max(1, printer.copies); i++)
          for (const j of jobs) await driver.print(printer, j);
        return { printer, ok: true };
      } catch (e) {
        return { printer, ok: false, error: e instanceof Error ? e.message : "Could not print" };
      }
    }),
  );
}

export interface KotPrintResult {
  /** Nothing to print on this device (no KOT printer, or KOT printing off). */
  noPrinter: boolean;
  outcomes: PrintOutcome[];
}

function kotJob(
  order: Order,
  kot: { kotNo: number; lines: OrderLine[]; firedAt?: string | undefined },
  printer: DevicePrinter,
  table?: PosTable,
): PrintJob {
  const ctx = context(order, table);
  const r = renderKot(ctx, order, kot, printer.paperWidth);
  return {
    kind: "kot",
    title: `KOT #${kot.kotNo} · ${ctx.tableName ?? `Token ${order.token}`}`,
    lines: r.text,
    bytes: r.toBytes(),
  };
}

/** Print one KOT on this device's KOT printers (one KOT number, possibly several printers). */
export async function printKot(
  device: Device | undefined,
  order: Order,
  kot: Pick<Kot, "kotNo" | "lines"> & { firedAt?: string | undefined },
  table: PosTable | undefined,
): Promise<KotPrintResult> {
  if (!device || !device.printKots) return { noPrinter: true, outcomes: [] };
  const routes = routeToPrinters(device.printers, kot.lines, order.type, table);
  if (!routes.length) return { noPrinter: true, outcomes: [] };
  const byId = new Map(routes.map((r) => [r.printer.id, r.lines]));
  const outcomes = await send(
    routes.map((r) => r.printer),
    (p) => kotJob(order, { ...kot, lines: byId.get(p.id) ?? [] }, p, table),
  );
  return { noPrinter: false, outcomes };
}

/**
 * The bill goes to this device's invoice printer(s). Bill-with-KOT: items
 * that were never sent are printed first as a KOT on the same printer.
 */
export async function printBillOnDevice(
  device: Device | undefined,
  order: Order,
  extraKotLines: OrderLine[] = [],
): Promise<KotPrintResult> {
  const printers = device?.printers.filter((p) => p.printsInvoice) ?? [];
  if (!printers.length) return { noPrinter: true, outcomes: [] };
  const extraKot = extraKotLines.length
    ? order.kots.find((k) => k.lines.some((l) => extraKotLines.some((x) => x.id === l.id)))
    : undefined;
  const outcomes = await send(printers, (p) => {
    const ctx = context(order);
    const upi = ctx.outlet.upiId
      ? upiLink(ctx.outlet.upiId, ctx.outlet.name, order.totals.grand, `Bill ${order.billNo}`)
      : undefined;
    const bill = renderBill(ctx, order, p.paperWidth, upi);
    const jobs: PrintJob[] = [];
    if (extraKotLines.length)
      jobs.push(kotJob(order, { kotNo: extraKot?.kotNo ?? 0, lines: extraKotLines }, p));
    jobs.push({
      kind: "bill",
      title: `Bill ${order.billNo}`,
      lines: bill.text,
      bytes: bill.toBytes(),
    });
    return jobs;
  });
  return { noPrinter: false, outcomes };
}

/**
 * The bill as a PDF, the same lines as the printed bill (to share with the
 * guest): this device's bill paper width, or 80 mm when it has no bill printer.
 */
export async function billPdf(device: Device | undefined, order: Order): Promise<Uint8Array> {
  const ctx = context(order);
  const paper = device?.printers.find((p) => p.printsInvoice)?.paperWidth ?? "80mm";
  const upi = ctx.outlet.upiId
    ? upiLink(ctx.outlet.upiId, ctx.outlet.name, order.totals.grand, `Bill ${order.billNo}`)
    : undefined;
  const { receiptPdf } = await import("./pdf");
  return receiptPdf(renderBill(ctx, order, paper, upi), paper);
}

export async function testPrint(printer: DevicePrinter): Promise<PrintOutcome> {
  const r = renderTest(outletCtx?.outlet.name ?? "", printer.name, printer.paperWidth);
  const [o] = await send([printer], () => ({
    kind: "test",
    title: "Test print",
    lines: r.text,
    bytes: r.toBytes(),
  }));
  return o!;
}
