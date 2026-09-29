import { toast } from "sonner";

import { isShareCancel, shareFile, shareTextOut } from "@/lib/pos/fileExport";
import { billPdf } from "@/lib/pos/printing";
import type { Device, Order } from "@/lib/pos/types";

/** Opens WhatsApp with a prefilled message (mobile optional). */
export function shareWhatsApp(text: string, mobile?: string | undefined) {
  const to = mobile && /^\d{10}$/.test(mobile) ? `91${mobile}` : "";
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

/** The share sheet (Android's in the app), else copies the text. */
export async function shareText(title: string, text: string) {
  try {
    if (await shareTextOut(title, text)) return;
    await navigator.clipboard.writeText(text);
    toast.success("Copied - paste it where you need it");
  } catch (e) {
    if (!isShareCancel(e)) toast.error("Could not share this");
  }
}

/** The bill as a PDF (same lines as the printed bill) to the share sheet / a download. */
export async function shareBillPdf(device: Device | undefined, order: Order) {
  try {
    const bytes = await billPdf(device, order);
    await shareFile(`Bill-${order.billNo}.pdf`, bytes, "application/pdf");
  } catch (e) {
    if (!isShareCancel(e)) toast.error("Could not make the bill PDF");
  }
}
