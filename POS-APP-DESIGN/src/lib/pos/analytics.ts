import { computeBill } from "./billing";
import { round2 } from "./format";
import type { BillingSettings, CashSession, Expense, MenuCategory, MenuItem, Order, PosTable } from "./types";

export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
}

/** Business day starts at settings.businessDayStart (e.g. 06:00) and ends 1 minute before next day's start. */
export function businessDayStart(d: Date, start = "06:00"): Date {
  const [h, m] = start.split(":").map(Number);
  const x = new Date(d);
  x.setHours(h ?? 6, m ?? 0, 0, 0);
  if (d < x) x.setDate(x.getDate() - 1);
  return x;
}

export function rangeFor(key: RangeKey, start = "06:00", custom?: { from: string; to: string }): DateRange {
  const today = businessDayStart(new Date(), start);
  const day = 86400000;
  if (key === "custom" && custom?.from && custom?.to) {
    const f = businessDayStart(new Date(`${custom.from}T12:00:00`), start);
    const t = new Date(businessDayStart(new Date(`${custom.to}T12:00:00`), start).getTime() + day);
    return { from: f, to: t };
  }
  if (key === "yesterday") return { from: new Date(today.getTime() - day), to: today };
  if (key === "7d") return { from: new Date(today.getTime() - 6 * day), to: new Date(today.getTime() + day) };
  if (key === "30d") return { from: new Date(today.getTime() - 29 * day), to: new Date(today.getTime() + day) };
  return { from: today, to: new Date(today.getTime() + day) };
}

export function formatHour(h: number): string {
  const suffix = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${suffix}`;
}

const at = (o: Order) => new Date(o.settledAt ?? o.createdAt);
export const inRange = (o: Order, r: DateRange) => at(o) >= r.from && at(o) < r.to;

export function settledIn(orders: Order[], r: DateRange) {
  return orders.filter((o) => o.status === "settled" && inRange(o, r));
}

export function orderTotal(o: Order, settings: BillingSettings) {
  return o.settledTotal ?? computeBill(o, settings).grandTotal;
}

export function kpis(orders: Order[], r: DateRange, settings: BillingSettings, expenses: Expense[]) {
  const settled = settledIn(orders, r);
  const net = round2(settled.reduce((a, o) => a + orderTotal(o, settings), 0));
  const running = orders.filter((o) => ["running", "hold", "billed"].includes(o.status));
  const cancelled = orders.filter((o) => o.status === "cancelled" && inRange(o, r));
  const discounts = round2(settled.reduce((a, o) => { const b = computeBill(o, settings); return a + b.discount + b.promo; }, 0));
  const exp = round2(expenses.filter((e) => new Date(e.at) >= r.from && new Date(e.at) < r.to).reduce((a, e) => a + e.amount, 0));
  return {
    net,
    bills: settled.length,
    avg: settled.length ? round2(net / settled.length) : 0,
    guests: settled.reduce((a, o) => a + o.guests, 0),
    runningCount: running.length,
    runningAmount: round2(running.reduce((a, o) => a + computeBill(o, settings).grandTotal, 0)),
    cancelled: cancelled.length,
    cancelledAmount: round2(cancelled.reduce((a, o) => a + computeBill(o, settings).grandTotal, 0)),
    discounts,
    expenses: exp,
  };
}

export function paymentSplit(orders: Order[], r: DateRange, label: (id: string) => string) {
  const map = new Map<string, number>();
  for (const o of settledIn(orders, r)) for (const p of o.payments ?? []) map.set(p.mode, round2((map.get(p.mode) ?? 0) + p.amount));
  return [...map.entries()].map(([mode, value]) => ({ mode, name: label(mode), value })).sort((a, b) => b.value - a.value);
}

export function hourly(orders: Order[], r: DateRange, settings: BillingSettings) {
  const rows = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: formatHour(h), sales: 0 }));
  for (const o of settledIn(orders, r)) rows[at(o).getHours()]!.sales += orderTotal(o, settings);
  const used = rows.filter((x) => x.sales > 0).map((x) => x.hour);
  const lo = Math.min(11, ...used);
  const hi = Math.max(23, ...used);
  return rows.slice(lo, hi + 1).map((x) => ({ ...x, sales: round2(x.sales) }));
}

export function trend(orders: Order[], days: number, settings: BillingSettings, start = "06:00") {
  const today = businessDayStart(new Date(), start);
  return Array.from({ length: days }, (_, i) => {
    const from = new Date(today.getTime() - (days - 1 - i) * 86400000);
    const to = new Date(from.getTime() + 86400000);
    const sales = settledIn(orders, { from, to }).reduce((a, o) => a + orderTotal(o, settings), 0);
    return { label: from.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), sales: round2(sales) };
  });
}

export function itemSales(orders: Order[], r: DateRange, items: MenuItem[], categories: MenuCategory[]) {
  const map = new Map<string, { name: string; category: string; qty: number; amount: number }>();
  for (const o of settledIn(orders, r)) {
    for (const l of o.rounds.flatMap((x) => x.lines)) {
      const item = items.find((i) => i.id === l.itemId);
      const cat = categories.find((c) => c.id === item?.categoryId)?.name ?? (l.custom ? "Custom" : "Other");
      const cur = map.get(l.name) ?? { name: l.name, category: cat, qty: 0, amount: 0 };
      cur.qty = round2(cur.qty + l.quantity);
      cur.amount = round2(cur.amount + l.quantity * l.unitPrice);
      map.set(l.name, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function typeSplit(orders: Order[], r: DateRange, settings: BillingSettings) {
  const buckets = { "Dine-in": 0, Takeaway: 0, Delivery: 0, QR: 0 } as Record<string, number>;
  for (const o of settledIn(orders, r)) {
    const k = o.qrOrder ? "QR" : o.type === "dine-in" ? "Dine-in" : o.type === "delivery" ? "Delivery" : "Takeaway";
    buckets[k] = round2(buckets[k]! + orderTotal(o, settings));
  }
  return Object.entries(buckets).map(([name, value]) => ({ name, value }));
}

// ---------- Report builder ----------

export type ReportId =
  | "day-wise" | "item-wise" | "category-wise" | "payment-mode" | "tax" | "discount" | "kot"
  | "cancelled" | "staff" | "table" | "cash-session" | "expense";

export const reportDefs: { id: ReportId; title: string; body: string }[] = [
  { id: "day-wise", title: "Day-wise sales", body: "Bills, guests and net sales per business day" },
  { id: "item-wise", title: "Item-wise sales", body: "Quantity and amount for each item" },
  { id: "category-wise", title: "Category-wise sales", body: "Sales grouped by menu category" },
  { id: "payment-mode", title: "Payment mode", body: "Cash, UPI, Card, Due and custom modes" },
  { id: "tax", title: "Tax (GST)", body: "Taxable value, CGST and SGST per bill" },
  { id: "discount", title: "Discount", body: "Bills with discounts or promo codes" },
  { id: "kot", title: "KOT", body: "Every KOT with items and printer" },
  { id: "cancelled", title: "Cancelled / void", body: "Cancelled orders with reasons" },
  { id: "staff", title: "Staff performance", body: "Bills and sales by captain / cashier" },
  { id: "table", title: "Table performance", body: "Bills and sales per table" },
  { id: "cash-session", title: "Cash session", body: "Opening float, cash in/out and closing" },
  { id: "expense", title: "Expense", body: "Expenses by head and payment mode" },
];

export interface ReportTable {
  columns: { key: string; label: string; money?: boolean; num?: boolean }[];
  rows: Record<string, string | number>[];
  totals?: Record<string, string | number> | undefined;
  summary: { label: string; value: string | number; money?: boolean }[];
}

interface Ctx {
  orders: Order[];
  range: DateRange;
  settings: BillingSettings;
  items: MenuItem[];
  categories: MenuCategory[];
  tables: PosTable[];
  expenses: Expense[];
  expenseHead: (id: string) => string;
  cashSessions: CashSession[];
  label: (mode: string) => string;
  staff: string;
  mode: string;
}

const sum = (rows: Record<string, string | number>[], key: string) => round2(rows.reduce((a, r) => a + (Number(r[key]) || 0), 0));
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function buildReport(id: ReportId, c: Ctx): ReportTable {
  let orders = c.orders.filter((o) => inRange(o, c.range));
  if (c.staff !== "all") orders = orders.filter((o) => o.captainName === c.staff || o.settledBy === c.staff);
  if (c.mode !== "all") orders = orders.filter((o) => o.payments?.some((p) => p.mode === c.mode));
  const settled = orders.filter((o) => o.status === "settled");
  const total = (o: Order) => orderTotal(o, c.settings);

  switch (id) {
    case "day-wise": {
      const map = new Map<string, { day: string; bills: number; guests: number; sales: number }>();
      for (const o of settled) {
        const k = fmtDate(businessDayStart(new Date(o.settledAt!), c.settings.businessDayStart));
        const cur = map.get(k) ?? { day: k, bills: 0, guests: 0, sales: 0 };
        cur.bills++; cur.guests += o.guests; cur.sales = round2(cur.sales + total(o));
        map.set(k, cur);
      }
      const rows = [...map.values()].reverse();
      return {
        columns: [{ key: "day", label: "Day" }, { key: "bills", label: "Bills", num: true }, { key: "guests", label: "Guests", num: true }, { key: "sales", label: "Net sales", money: true }],
        rows, totals: { day: "Total", bills: sum(rows, "bills"), guests: sum(rows, "guests"), sales: sum(rows, "sales") },
        summary: [{ label: "Net sales", value: sum(rows, "sales"), money: true }, { label: "Bills", value: sum(rows, "bills") }, { label: "Days", value: rows.length }],
      };
    }
    case "item-wise":
    case "category-wise": {
      const items = itemSales(settled.length ? c.orders.filter((o) => settled.includes(o)) : [], { from: new Date(0), to: new Date(8.64e15) }, c.items, c.categories);
      if (id === "item-wise") {
        const rows = items.map((i) => ({ item: i.name, category: i.category, qty: i.qty, amount: i.amount }));
        return {
          columns: [{ key: "item", label: "Item" }, { key: "category", label: "Category" }, { key: "qty", label: "Qty", num: true }, { key: "amount", label: "Amount", money: true }],
          rows, totals: { item: "Total", category: "", qty: sum(rows, "qty"), amount: sum(rows, "amount") },
          summary: [{ label: "Items sold", value: sum(rows, "qty") }, { label: "Gross", value: sum(rows, "amount"), money: true }, { label: "Top item", value: rows[0]?.item ?? "—" }],
        };
      }
      const map = new Map<string, { category: string; qty: number; amount: number }>();
      for (const i of items) {
        const cur = map.get(i.category) ?? { category: i.category, qty: 0, amount: 0 };
        cur.qty = round2(cur.qty + i.qty); cur.amount = round2(cur.amount + i.amount);
        map.set(i.category, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.amount - a.amount);
      return {
        columns: [{ key: "category", label: "Category" }, { key: "qty", label: "Qty", num: true }, { key: "amount", label: "Amount", money: true }],
        rows, totals: { category: "Total", qty: sum(rows, "qty"), amount: sum(rows, "amount") },
        summary: [{ label: "Categories", value: rows.length }, { label: "Gross", value: sum(rows, "amount"), money: true }],
      };
    }
    case "payment-mode": {
      const map = new Map<string, { mode: string; bills: number; amount: number }>();
      for (const o of settled) for (const p of o.payments ?? []) {
        const cur = map.get(p.mode) ?? { mode: c.label(p.mode), bills: 0, amount: 0 };
        cur.bills++; cur.amount = round2(cur.amount + p.amount);
        map.set(p.mode, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.amount - a.amount);
      return {
        columns: [{ key: "mode", label: "Mode" }, { key: "bills", label: "Payments", num: true }, { key: "amount", label: "Amount", money: true }],
        rows, totals: { mode: "Total", bills: sum(rows, "bills"), amount: sum(rows, "amount") },
        summary: rows.slice(0, 3).map((r) => ({ label: String(r.mode), value: r.amount, money: true })),
      };
    }
    case "tax": {
      const rows = settled.map((o) => {
        const b = computeBill(o, c.settings);
        return { bill: o.code, date: fmtDate(o.settledAt!), taxable: b.taxable, cgst: b.cgst, sgst: b.sgst, total: total(o) };
      });
      return {
        columns: [{ key: "bill", label: "Bill" }, { key: "date", label: "Date" }, { key: "taxable", label: "Taxable", money: true }, { key: "cgst", label: "CGST", money: true }, { key: "sgst", label: "SGST", money: true }, { key: "total", label: "Total", money: true }],
        rows, totals: { bill: "Total", date: "", taxable: sum(rows, "taxable"), cgst: sum(rows, "cgst"), sgst: sum(rows, "sgst"), total: sum(rows, "total") },
        summary: [{ label: "Taxable", value: sum(rows, "taxable"), money: true }, { label: "CGST", value: sum(rows, "cgst"), money: true }, { label: "SGST", value: sum(rows, "sgst"), money: true }],
      };
    }
    case "discount": {
      const rows = settled
        .map((o) => ({ o, b: computeBill(o, c.settings) }))
        .filter(({ b }) => b.discount + b.promo > 0)
        .map(({ o, b }) => ({ bill: o.code, date: fmtDate(o.settledAt!), reason: o.discount?.reason ?? o.promoCode ?? "", by: o.discount?.approvedBy ?? o.settledBy ?? "", discount: round2(b.discount + b.promo) }));
      return {
        columns: [{ key: "bill", label: "Bill" }, { key: "date", label: "Date" }, { key: "reason", label: "Reason" }, { key: "by", label: "By" }, { key: "discount", label: "Discount", money: true }],
        rows, totals: { bill: "Total", date: "", reason: "", by: "", discount: sum(rows, "discount") },
        summary: [{ label: "Bills", value: rows.length }, { label: "Discount given", value: sum(rows, "discount"), money: true }],
      };
    }
    case "kot": {
      const rows = orders.flatMap((o) => o.rounds.map((r) => ({
        kot: `#${r.kotNo}`, bill: o.code, time: new Date(r.sentAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
        items: r.lines.reduce((a, l) => a + l.quantity, 0), printer: r.printerName, printed: r.printed ? "Yes" : "No",
      })));
      return {
        columns: [{ key: "kot", label: "KOT" }, { key: "bill", label: "Bill" }, { key: "time", label: "Time" }, { key: "items", label: "Items", num: true }, { key: "printer", label: "Printer" }, { key: "printed", label: "Printed" }],
        rows, totals: { kot: "Total", bill: "", time: "", items: sum(rows, "items"), printer: "", printed: "" },
        summary: [{ label: "KOTs", value: rows.length }, { label: "Not printed", value: rows.filter((r) => r.printed === "No").length }],
      };
    }
    case "cancelled": {
      const rows = orders.filter((o) => o.status === "cancelled").map((o) => ({ bill: o.code, date: fmtDate(o.createdAt), by: o.events?.find((e) => e.label.startsWith("Cancelled"))?.by ?? o.captainName, reason: o.cancelReason ?? "", amount: computeBill(o, c.settings).grandTotal }));
      return {
        columns: [{ key: "bill", label: "Bill" }, { key: "date", label: "Date" }, { key: "by", label: "By" }, { key: "reason", label: "Reason" }, { key: "amount", label: "Value", money: true }],
        rows, totals: { bill: "Total", date: "", by: "", reason: "", amount: sum(rows, "amount") },
        summary: [{ label: "Cancelled", value: rows.length }, { label: "Value", value: sum(rows, "amount"), money: true }],
      };
    }
    case "staff": {
      const map = new Map<string, { staff: string; bills: number; guests: number; sales: number }>();
      for (const o of settled) {
        const cur = map.get(o.captainName) ?? { staff: o.captainName, bills: 0, guests: 0, sales: 0 };
        cur.bills++; cur.guests += o.guests; cur.sales = round2(cur.sales + total(o));
        map.set(o.captainName, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.sales - a.sales).map((r) => ({ ...r, avg: r.bills ? round2(r.sales / r.bills) : 0 }));
      return {
        columns: [{ key: "staff", label: "Staff" }, { key: "bills", label: "Bills", num: true }, { key: "guests", label: "Guests", num: true }, { key: "avg", label: "Avg bill", money: true }, { key: "sales", label: "Sales", money: true }],
        rows, totals: { staff: "Total", bills: sum(rows, "bills"), guests: sum(rows, "guests"), avg: "", sales: sum(rows, "sales") },
        summary: [{ label: "Top staff", value: rows[0]?.staff ?? "—" }, { label: "Sales", value: sum(rows, "sales"), money: true }],
      };
    }
    case "table": {
      const map = new Map<string, { table: string; bills: number; guests: number; sales: number }>();
      for (const o of settled.filter((x) => x.tableId)) {
        const name = c.tables.find((t) => t.id === o.tableId)?.name ?? "—";
        const cur = map.get(name) ?? { table: name, bills: 0, guests: 0, sales: 0 };
        cur.bills++; cur.guests += o.guests; cur.sales = round2(cur.sales + total(o));
        map.set(name, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.sales - a.sales);
      return {
        columns: [{ key: "table", label: "Table" }, { key: "bills", label: "Bills", num: true }, { key: "guests", label: "Guests", num: true }, { key: "sales", label: "Sales", money: true }],
        rows, totals: { table: "Total", bills: sum(rows, "bills"), guests: sum(rows, "guests"), sales: sum(rows, "sales") },
        summary: [{ label: "Busiest table", value: rows[0]?.table ?? "—" }, { label: "Sales", value: sum(rows, "sales"), money: true }],
      };
    }
    case "cash-session": {
      const rows = c.cashSessions.map((s) => {
        const inn = s.entries.filter((e) => e.kind === "in").reduce((a, e) => a + e.amount, 0);
        const out = s.entries.filter((e) => e.kind === "out").reduce((a, e) => a + e.amount, 0);
        return { opened: fmtDate(s.openedAt), by: s.openedBy, float: s.openingFloat, cashIn: inn, cashOut: out, expected: s.expected ?? 0, counted: s.counted ?? 0, diff: round2((s.counted ?? 0) - (s.expected ?? 0)), status: s.closedAt ? "Closed" : "Open" };
      });
      return {
        columns: [{ key: "opened", label: "Opened" }, { key: "by", label: "By" }, { key: "status", label: "Status" }, { key: "float", label: "Float", money: true }, { key: "cashIn", label: "Cash in", money: true }, { key: "cashOut", label: "Cash out", money: true }, { key: "expected", label: "Expected", money: true }, { key: "counted", label: "Counted", money: true }, { key: "diff", label: "Difference", money: true }],
        rows,
        summary: [{ label: "Sessions", value: rows.length }, { label: "Total difference", value: sum(rows, "diff"), money: true }],
      };
    }
    case "expense": {
      const rows = c.expenses
        .filter((e) => new Date(e.at) >= c.range.from && new Date(e.at) < c.range.to)
        .filter((e) => c.mode === "all" || e.mode === c.mode)
        .map((e) => ({ date: fmtDate(e.at), head: c.expenseHead(e.headId), mode: c.label(e.mode), note: e.note, amount: e.amount }));
      return {
        columns: [{ key: "date", label: "Date" }, { key: "head", label: "Head" }, { key: "mode", label: "Mode" }, { key: "note", label: "Note" }, { key: "amount", label: "Amount", money: true }],
        rows, totals: { date: "Total", head: "", mode: "", note: "", amount: sum(rows, "amount") },
        summary: [{ label: "Entries", value: rows.length }, { label: "Spent", value: sum(rows, "amount"), money: true }],
      };
    }
  }
}
