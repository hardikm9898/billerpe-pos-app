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
  const joined = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("").slice(0, decimals)}` : parts[0];
  const n = Number(joined);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});

/** "6:09 pm" */
export function time(input: string | number | Date): string {
  return timeFmt.format(new Date(input)).toLowerCase().replace(/\s/g, " ");
}

/** "24 Sep, 6:09 pm" */
export function dateTime(input: string | number | Date): string {
  const d = new Date(input);
  return `${dateFmt.format(d)}, ${time(d)}`;
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

export const GST_RATE = 0.05;

export function taxBreakup(taxableAmount: number, rate: number = GST_RATE) {
  const total = Math.round(taxableAmount * rate * 100) / 100;
  const half = Math.round((total / 2) * 100) / 100;
  return { cgst: half, sgst: total - half, total };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
