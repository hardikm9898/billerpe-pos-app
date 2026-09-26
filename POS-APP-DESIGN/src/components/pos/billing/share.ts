import { toast } from "sonner";

/** Opens WhatsApp with a prefilled message (mobile optional). */
export function shareWhatsApp(text: string, mobile?: string | undefined) {
  const to = mobile && /^\d{10}$/.test(mobile) ? `91${mobile}` : "";
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

/** Uses the device share sheet when available, else copies the text. */
export async function shareText(title: string, text: string) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast.success("Summary copied");
  } catch {
    /* user closed the share sheet */
  }
}
