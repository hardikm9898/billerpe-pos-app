const moneyFmt = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,234.50 */
export function money(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `₹${moneyFmt.format(safe)}`;
}

/** 1,234.50 without the symbol */
export function amount(value: number): string {
  return moneyFmt.format(Number.isFinite(value) ? value : 0);
}

/** Quantity, up to 2 decimals, trailing zeros trimmed: 1, 1.5, 0.25 */
export function qty(value: number): string {
  const rounded = Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
  return String(rounded);
}

/** Sanitize a typed number: no negatives, max 2 decimals, leading zero replaced. */
export function parseNumberInput(raw: string, opts?: { decimals?: number }): number {
  const decimals = opts?.decimals ?? 2;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  const joined =
    parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("").slice(0, decimals)}` : parts[0];
  const n = Number(joined);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

// Dates follow the phone's language (Profile): English, Hindi or Gujarati
// month names; digits stay 0-9. Printed receipts format their own dates.
const LOCALE: Record<string, string> = { hi: "hi-IN", gu: "gu-IN" };
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions) {
  const lang = typeof document === "undefined" ? "en" : document.documentElement.lang;
  const locale = LOCALE[lang] ?? "en-IN";
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...opts, numberingSystem: "latn" });
    fmtCache.set(key, f);
  }
  return f;
}
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };
const DAY_MONTH: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

/** "6:09 pm" */
export function time(input: string | number | Date): string {
  return fmt(TIME).format(new Date(input)).toLowerCase().replace(/\s/g, " ");
}

/** "24 Sep, 6:09 pm" */
export function dateTime(input: string | number | Date): string {
  const d = new Date(input);
  return `${fmt(DAY_MONTH).format(d)}, ${time(d)}`;
}

/** "12m" / "1h 04m" since a timestamp */
export function elapsed(from: string | number | Date, now: number = Date.now()): string {
  const ms = Math.max(0, now - new Date(from).getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** upi://pay link for the "Scan to pay" QR with the exact amount. */
export function upiLink(upiId: string, payee: string, amountValue: number, note: string): string {
  const q = new URLSearchParams({
    pa: upiId,
    pn: payee,
    am: amountValue.toFixed(2),
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${q.toString()}`;
}

/** Indian notes and coins for the cash count. */
export const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

/** "Today", "Yesterday" or "24 Sep" */
export function dayLabel(input: string | number | Date): string {
  const d = new Date(input);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return fmt(DAY_MONTH).format(d);
}
