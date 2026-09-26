import { round2, taxBreakup } from "./format";
import type { BillingSettings, CartLine, Order, PromoCode } from "./types";

export interface BillLine {
  key: string;
  name: string;
  detail: string;
  quantity: number;
  rate: number;
  amount: number;
  vegType: CartLine["vegType"];
}

export interface Bill {
  lines: BillLine[];
  itemCount: number;
  subtotal: number;
  discount: number;
  discountLabel: string;
  promo: number;
  promoLabel: string;
  serviceCharge: number;
  packaging: number;
  delivery: number;
  taxable: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  grandTotal: number;
}

/** Collapse identical lines across rounds for the printed bill. */
export function billLines(order: Order): BillLine[] {
  const all = [...order.rounds.flatMap((r) => r.lines), ...order.draftLines];
  const map = new Map<string, BillLine>();
  for (const l of all) {
    const detail = [l.variantName, ...l.addonNames].filter(Boolean).join(", ");
    const key = `${l.name}~${detail}~${l.unitPrice}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity = round2(existing.quantity + l.quantity);
      existing.amount = round2(existing.quantity * existing.rate);
    } else {
      map.set(key, {
        key,
        name: l.name,
        detail,
        quantity: l.quantity,
        rate: l.unitPrice,
        amount: round2(l.quantity * l.unitPrice),
        vegType: l.vegType,
      });
    }
  }
  return [...map.values()];
}

export function promoValue(promo: PromoCode | undefined, base: number): number {
  if (!promo || base < promo.minBill) return 0;
  return round2(promo.kind === "flat" ? Math.min(promo.value, base) : (base * promo.value) / 100);
}

export function discountValue(order: Order, subtotal: number): number {
  const d = order.discount;
  if (!d) return 0;
  return round2(Math.min(subtotal, d.kind === "flat" ? d.value : (subtotal * d.value) / 100));
}

export function computeBill(order: Order | undefined, settings: BillingSettings): Bill {
  const empty: Bill = {
    lines: [], itemCount: 0, subtotal: 0, discount: 0, discountLabel: "", promo: 0, promoLabel: "",
    serviceCharge: 0, packaging: 0, delivery: 0, taxable: 0, cgst: 0, sgst: 0, roundOff: 0, grandTotal: 0,
  };
  if (!order) return empty;
  const lines = billLines(order);
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const discount = discountValue(order, subtotal);
  const promoDef = settings.promoCodes.find((p) => p.code === order.promoCode);
  const promo = promoValue(promoDef, subtotal - discount);
  const afterDiscount = round2(subtotal - discount - promo);
  const serviceCharge =
    order.type === "dine-in" && order.serviceChargeOn !== false
      ? round2(afterDiscount * settings.serviceChargeRate)
      : 0;
  const packaging = order.type === "dine-in" || subtotal === 0 ? 0 : settings.packagingCharge;
  const delivery = order.type === "delivery" && subtotal > 0 ? settings.deliveryCharge : 0;
  const taxable = round2(afterDiscount + serviceCharge + packaging + delivery);
  const { cgst, sgst, total: tax } = taxBreakup(taxable, settings.taxRate);
  const raw = round2(taxable + tax);
  const grandTotal = settings.roundOff ? Math.round(raw) : raw;
  const d = order.discount;
  return {
    lines,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    discount,
    discountLabel: d ? (d.kind === "percent" ? `Discount ${d.value}%` : "Discount") : "",
    promo,
    promoLabel: promoDef ? `Promo ${promoDef.code}` : "",
    serviceCharge,
    packaging,
    delivery,
    taxable,
    cgst,
    sgst,
    roundOff: round2(grandTotal - raw),
    grandTotal,
  };
}

/** Percent of the subtotal a discount represents. */
export function discountPercent(kind: "flat" | "percent", value: number, subtotal: number): number {
  if (kind === "percent") return value;
  return subtotal > 0 ? (value / subtotal) * 100 : 0;
}

export function upiLink(upiId: string, payee: string, amt: number, note: string): string {
  const q = new URLSearchParams({ pa: upiId, pn: payee, am: amt.toFixed(2), cu: "INR", tn: note });
  return `upi://pay?${q.toString()}`;
}

export const denominations = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const;
