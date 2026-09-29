import { Capacitor, registerPlugin } from "@capacitor/core";

import type { BuiltInPrinter, PrinterDriver } from "./printing";
import type { DevicePrinter } from "./types";

// The Android printer driver: the app's own native plugin
// (android/app/src/main/java/com/billerpe/pos/PosPrinterPlugin.java) sends
// the ESC/POS bytes over Wi-Fi, Bluetooth, USB or to the terminal's built-in
// printer; "system" opens Android's print dialog.

interface PosPrinterPlugin {
  print(o: { connection: string; address: string; data: string }): Promise<void>;
  printText(o: { title: string; text: string }): Promise<void>;
  listBluetooth(): Promise<{ devices: { name: string; address: string }[] }>;
  listUsb(): Promise<{ devices: { name: string; address: string }[] }>;
  findBuiltIn(): Promise<BuiltInPrinter & { model?: string }>;
}

const PosPrinter = registerPlugin<PosPrinterPlugin>("PosPrinter");

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** The staff-facing message for a native failure (code + reason). */
function message(printer: DevicePrinter, e: unknown): string {
  const code = (e as { code?: string })?.code;
  const reason = e instanceof Error ? e.message : String(e ?? "");
  if (code === "permission") return reason || "Allow BillerPe POS to use this printer.";
  if (code === "unsupported")
    return `${printer.name}: ${reason || "this printer is not supported yet"} — tell support your model.`;
  if (code === "not-found") return `${printer.name}: ${reason || "printer not found"}.`;
  if (printer.connection === "wifi")
    return `${printer.name} is not reachable. Is this phone on the outlet Wi-Fi and the printer on?`;
  return `${printer.name} ${reason || "did not print"}.`;
}

export const nativeDriver: PrinterDriver = {
  native: true,
  async print(printer, job) {
    try {
      if (printer.connection === "system") {
        await PosPrinter.printText({ title: job.title, text: job.lines.join("\n") });
        return;
      }
      await PosPrinter.print({
        connection: printer.connection,
        address: printer.address ?? "",
        data: toBase64(job.bytes),
      });
    } catch (e) {
      throw new Error(message(printer, e));
    }
  },
  findBuiltIn: () => PosPrinter.findBuiltIn(),
  listBluetooth: async () => (await PosPrinter.listBluetooth()).devices,
  listUsb: async () => (await PosPrinter.listUsb()).devices,
};

export const isNativeApp = () => Capacitor.isNativePlatform();
