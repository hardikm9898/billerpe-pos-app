import { Capacitor } from "@capacitor/core";

import type { MenuItem } from "./types";

// Barcode scanning with the phone camera (owner list 2026-09-29 #12): add an
// item while billing, or fill an item's barcode in the menu editor. Uses
// Google's code scanner screen (ML Kit): no camera permission needed, the
// scanner UI comes from Google Play services (downloaded once).
// Hardware scanners (built into POS terminals, USB/Bluetooth guns) type the
// code like a keyboard + Enter - the search boxes handle those without this.

export const canScan = () => Capacitor.isNativePlatform();

export class ScannerNotReady extends Error {}

/** Opens the camera scanner; the code, or null when the person cancelled. */
export async function scanBarcode(): Promise<string | null> {
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    await BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => undefined);
    throw new ScannerNotReady(
      "The scanner is being downloaded by Google Play. Try again in a minute.",
    );
  }
  try {
    const { barcodes } = await BarcodeScanner.scan();
    return barcodes[0]?.rawValue?.trim() || null;
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return null;
    throw e;
  }
}

/** The menu item with this barcode (exact match), if any. */
export const itemByBarcode = (items: MenuItem[], code: string) => {
  const c = code.trim();
  return c ? items.find((i) => i.barcode?.trim() === c) : undefined;
};
