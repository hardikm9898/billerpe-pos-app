import type { OutletData } from "../types";

// In-browser stand-in for the cloud database of ONE demo tenant. Secrets
// (passwords, PINs) live beside the data, never inside what load() returns.

export interface MockDb extends OutletData {
  secrets: Record<string, { password: string; pin: string }>;
  /** clientKey -> result, so a retried tap is applied once. */
  seenKeys: Map<string, unknown>;
  seq: Record<string, number>;
}

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function nextId(db: MockDb, prefix: string): string {
  db.seq[prefix] = (db.seq[prefix] ?? 1000) + 1;
  return `${prefix}-${db.seq[prefix]}`;
}

/** Business date (YYYY-MM-DD) for a moment, honouring the day start time. */
export function businessDate(at: Date, dayStart: string): string {
  const [h, m] = dayStart.split(":").map(Number);
  const shifted = new Date(at.getTime() - ((h ?? 0) * 60 + (m ?? 0)) * 60000);
  const y = shifted.getFullYear();
  const mo = String(shifted.getMonth() + 1).padStart(2, "0");
  const d = String(shifted.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
