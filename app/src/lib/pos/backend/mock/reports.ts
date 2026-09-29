import { orderLines } from "../../bill";
import type { Order } from "../../types";
import {
  ORDERS_PAGE_SIZE,
  type DashboardResult,
  type DateRange,
  type OrderPage,
  type OrderQuery,
  type ReportResult,
} from "../types";
import { REPORTS } from "../../reportList";
import { businessDate, r2, type MockDb } from "./db";

export { REPORTS };

// Reports and the dashboard, computed on the "server" by business day
// (the outlet's day start time), the same way the cloud reports do.

const DAY = 86400000;

/**
 * The Orders screen, a page at a time: status tab, business-day range (not
 * for Running), search on bill no / token / customer / table. Newest first.
 */
export function listOrders(db: MockDb, q: OrderQuery): OrderPage {
  const today = businessDate(new Date(), db.settings.businessDayStart);
  const r: { from: string; to: string } | null =
    q.status === "running" || q.range.key === "all"
      ? null
      : q.range.key === "month"
        ? { from: `${today.slice(0, 8)}01`, to: today }
        : rangeDays(db, { key: q.range.key, from: q.range.from, to: q.range.to });
  const open = (o: Order) => ["running", "hold", "billed"].includes(o.status);
  const s = (q.search ?? "").trim().toLowerCase();
  const tableName = (id?: string) => db.tables.find((t) => t.id === id)?.name.toLowerCase() ?? "";
  const list = db.orders
    .filter((o) =>
      q.status === "all"
        ? true
        : q.status === "running"
          ? open(o)
          : q.status === "due"
            ? (o.dueOutstanding ?? 0) > 0
            : o.status === q.status,
    )
    .filter((o) => !r || (o.businessDate >= r.from && o.businessDate <= r.to))
    .filter(
      (o) =>
        !s ||
        o.billNo.toLowerCase() === s ||
        o.billNo.toLowerCase().startsWith(s) ||
        (o.token > 0 && String(o.token) === s) ||
        (o.customerMobile ?? "").includes(s) ||
        (o.customerName ?? "").toLowerCase().includes(s) ||
        tableName(o.tableId) === s,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const start = q.page * ORDERS_PAGE_SIZE;
  return {
    orders: list.slice(start, start + ORDERS_PAGE_SIZE),
    total: list.length,
    hasMore: start + ORDERS_PAGE_SIZE < list.length,
    counts: {
      running: db.orders.filter(open).length,
      due: db.orders.filter((o) => (o.dueOutstanding ?? 0) > 0).length,
    },
  };
}

export function rangeDays(
  db: MockDb,
  range: DateRange,
  now = new Date(),
): { from: string; to: string } {
  const today = businessDate(now, db.settings.businessDayStart);
  const shift = (n: number) =>
    businessDate(new Date(now.getTime() - n * DAY), db.settings.businessDayStart);
  switch (range.key) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: shift(1), to: shift(1) };
    case "7d":
      return { from: shift(6), to: today };
    case "30d":
      return { from: shift(29), to: today };
    case "custom":
      return { from: range.from || today, to: range.to || today };
  }
}

const inRange = (d: string, r: { from: string; to: string }) => d >= r.from && d <= r.to;
const sum = <T>(rows: T[], f: (r: T) => number) => r2(rows.reduce((a, r) => a + f(r), 0));
const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function settledIn(
  db: MockDb,
  r: { from: string; to: string },
  filters: { staffId?: string | undefined; modeId?: string | undefined } = {},
): Order[] {
  const staffName = filters.staffId
    ? db.staff.find((s) => s.id === filters.staffId)?.name
    : undefined;
  return db.orders.filter(
    (o) =>
      o.status === "settled" &&
      inRange(o.businessDate, r) &&
      (!staffName || o.captainName === staffName || o.settledBy === staffName) &&
      (!filters.modeId || o.payments.some((p) => p.modeId === filters.modeId)),
  );
}

const modeName = (db: MockDb, id: string) =>
  db.settings.paymentModes.find((m) => m.id === id)?.name ?? id;

export function dashboard(db: MockDb, range: DateRange): DashboardResult {
  const r = rangeDays(db, range);
  const settled = settledIn(db, r);
  const cancelled = db.orders.filter((o) => o.status === "cancelled" && inRange(o.businessDate, r));
  const running = db.orders.filter((o) => ["running", "hold", "billed"].includes(o.status));
  const net = sum(settled, (o) => o.totals.grand);
  const byMode = new Map<string, number>();
  for (const o of settled)
    for (const p of o.payments) byMode.set(p.modeId, r2((byMode.get(p.modeId) ?? 0) + p.amount));
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, amount: 0 }));
  for (const o of settled)
    hourly[new Date(o.settledAt!).getHours()]!.amount = r2(
      hourly[new Date(o.settledAt!).getHours()]!.amount + o.totals.grand,
    );
  const trend: DashboardResult["trend"] = [];
  const end = new Date(`${r.to}T12:00:00`);
  for (let i = 6; i >= 0; i--) {
    const d = businessDate(new Date(end.getTime() - i * DAY), "00:00");
    trend.push({
      day: new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      amount: sum(
        db.orders.filter((o) => o.status === "settled" && o.businessDate === d),
        (o) => o.totals.grand,
      ),
    });
  }
  const items = new Map<string, { name: string; qty: number; amount: number }>();
  for (const o of settled)
    for (const l of orderLines(o)) {
      const cur = items.get(l.name) ?? { name: l.name, qty: 0, amount: 0 };
      cur.qty = r2(cur.qty + l.qty);
      cur.amount = r2(
        cur.amount + l.price * l.qty + l.addons.reduce((a, x) => a + x.price * x.qty, 0),
      );
      items.set(l.name, cur);
    }
  const expenses = db.expenses.filter((e) =>
    inRange(businessDate(new Date(e.at), db.settings.businessDayStart), r),
  );
  return {
    net,
    bills: settled.length,
    avgBill: settled.length ? r2(net / settled.length) : 0,
    guests: settled.reduce((a, o) => a + o.guests, 0),
    runningCount: running.length,
    runningAmount: sum(running, (o) => o.totals.grand),
    cancelledCount: cancelled.length,
    cancelledAmount: sum(cancelled, (o) => o.totals.grand),
    discounts: sum(settled, (o) => o.totals.discount),
    expenses: sum(expenses, (e) => e.amount),
    byMode: [...byMode.entries()]
      .map(([modeId, amount]) => ({ modeId, name: modeName(db, modeId), amount }))
      .sort((a, b) => b.amount - a.amount),
    hourly,
    trend,
    topItems: [...items.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
    byType: [
      {
        label: "Dine-in",
        amount: sum(
          settled.filter((o) => o.type === "dinin" && !o.fromQr),
          (o) => o.totals.grand,
        ),
      },
      {
        label: "Pickup",
        amount: sum(
          settled.filter((o) => o.type === "pickup"),
          (o) => o.totals.grand,
        ),
      },
      {
        label: "QR",
        amount: sum(
          settled.filter((o) => o.fromQr),
          (o) => o.totals.grand,
        ),
      },
    ],
  };
}

export function report(
  db: MockDb,
  id: string,
  range: DateRange,
  filters: { staffId?: string | undefined; modeId?: string | undefined },
): ReportResult {
  const r = rangeDays(db, range);
  const settled = settledIn(db, r, filters);
  const title = REPORTS.find((x) => x.id === id)?.title ?? "Report";
  const tableName = (id?: string) => db.tables.find((t) => t.id === id)?.name ?? "—";
  switch (id) {
    case "day-wise": {
      const map = new Map<string, { day: string; bills: number; guests: number; sales: number }>();
      for (const o of settled) {
        const cur = map.get(o.businessDate) ?? {
          day: o.businessDate,
          bills: 0,
          guests: 0,
          sales: 0,
        };
        cur.bills++;
        cur.guests += o.guests;
        cur.sales = r2(cur.sales + o.totals.grand);
        map.set(o.businessDate, cur);
      }
      const rows = [...map.values()]
        .sort((a, b) => b.day.localeCompare(a.day))
        .map((x) => ({ ...x, day: fmtDay(x.day) }));
      return {
        title,
        columns: [
          { key: "day", label: "Day" },
          { key: "bills", label: "Bills", num: true },
          { key: "guests", label: "Guests", num: true },
          { key: "sales", label: "Net sales", money: true },
        ],
        rows,
        totals: {
          day: "Total",
          bills: sum(rows, (x) => x.bills),
          guests: sum(rows, (x) => x.guests),
          sales: sum(rows, (x) => x.sales),
        },
        summary: [
          { label: "Net sales", value: sum(rows, (x) => x.sales), money: true },
          { label: "Bills", value: sum(rows, (x) => x.bills) },
          { label: "Days", value: rows.length },
        ],
      };
    }
    case "item-wise":
    case "category-wise": {
      const map = new Map<
        string,
        { name: string; category: string; qty: number; amount: number }
      >();
      for (const o of settled)
        for (const l of orderLines(o)) {
          const cat = db.categories.find((c) => c.id === l.categoryId)?.name ?? "Custom";
          const key = id === "item-wise" ? `${l.name}|${l.variantName ?? ""}` : cat;
          const cur = map.get(key) ?? {
            name:
              id === "item-wise" ? `${l.name}${l.variantName ? ` (${l.variantName})` : ""}` : cat,
            category: cat,
            qty: 0,
            amount: 0,
          };
          cur.qty = r2(cur.qty + l.qty);
          cur.amount = r2(
            cur.amount + l.price * l.qty + l.addons.reduce((a, x) => a + x.price * x.qty, 0),
          );
          map.set(key, cur);
        }
      const rows = [...map.values()].sort((a, b) => b.amount - a.amount);
      const cols =
        id === "item-wise"
          ? [
              { key: "name", label: "Item" },
              { key: "category", label: "Category" },
              { key: "qty", label: "Qty", num: true },
              { key: "amount", label: "Amount", money: true },
            ]
          : [
              { key: "name", label: "Category" },
              { key: "qty", label: "Qty", num: true },
              { key: "amount", label: "Amount", money: true },
            ];
      return {
        title,
        columns: cols,
        rows,
        totals: {
          name: "Total",
          category: "",
          qty: sum(rows, (x) => x.qty),
          amount: sum(rows, (x) => x.amount),
        },
        summary: [
          { label: "Qty sold", value: sum(rows, (x) => x.qty) },
          { label: "Gross", value: sum(rows, (x) => x.amount), money: true },
          { label: "Top", value: rows[0]?.name ?? "—" },
        ],
      };
    }
    case "tax": {
      const map = new Map<string, number>();
      for (const o of settled)
        for (const t of o.totals.taxLines)
          map.set(
            `${t.name} ${t.type === "pr" ? `${t.rate}%` : ""}`.trim(),
            r2(
              (map.get(`${t.name} ${t.type === "pr" ? `${t.rate}%` : ""}`.trim()) ?? 0) + t.amount,
            ),
          );
      const taxable = sum(settled, (o) => o.totals.subtotal - o.totals.discount);
      const rows = [...map.entries()].map(([tax, amount]) => ({ tax, amount }));
      return {
        title,
        columns: [
          { key: "tax", label: "Tax" },
          { key: "amount", label: "Amount", money: true },
        ],
        rows,
        totals: { tax: "Total tax", amount: sum(rows, (x) => x.amount) },
        summary: [
          { label: "Taxable value", value: taxable, money: true },
          { label: "Tax", value: sum(rows, (x) => x.amount), money: true },
          { label: "Bills", value: settled.length },
        ],
      };
    }
    case "discount": {
      const rows = settled
        .filter((o) => o.totals.discount > 0)
        .map((o) => ({
          bill: o.billNo,
          day: fmtDay(o.businessDate),
          reason: o.discount?.reason ?? "",
          by: o.settledBy ?? "",
          amount: o.totals.discount,
        }));
      return {
        title,
        columns: [
          { key: "bill", label: "Bill" },
          { key: "day", label: "Day" },
          { key: "reason", label: "Reason" },
          { key: "amount", label: "Discount", money: true },
        ],
        rows,
        totals: { bill: "Total", day: "", reason: "", amount: sum(rows, (x) => x.amount) },
        summary: [
          { label: "Discounts", value: sum(rows, (x) => x.amount), money: true },
          { label: "Bills", value: rows.length },
        ],
      };
    }
    case "kot": {
      const rows = db.orders
        .filter((o) => inRange(o.businessDate, r))
        .flatMap((o) =>
          o.kots.map((k) => ({
            kot: k.kotNo,
            bill: o.billNo,
            table: o.tableId ? tableName(o.tableId) : `Token ${o.token}`,
            by: k.firedByName,
            items: k.lines.reduce((a, l) => a + l.qty, 0),
            time: new Date(k.firedAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            }),
          })),
        )
        .sort((a, b) => b.kot - a.kot);
      return {
        title,
        columns: [
          { key: "kot", label: "KOT", num: true },
          { key: "bill", label: "Bill" },
          { key: "table", label: "Table" },
          { key: "by", label: "By" },
          { key: "items", label: "Items", num: true },
          { key: "time", label: "Time" },
        ],
        rows,
        summary: [
          { label: "KOTs", value: rows.length },
          { label: "Items", value: sum(rows, (x) => x.items) },
        ],
      };
    }
    case "cancelled": {
      const rows = db.orders
        .filter((o) => o.status === "cancelled" && inRange(o.businessDate, r))
        .map((o) => ({
          bill: o.billNo,
          day: fmtDay(o.businessDate),
          reason: o.cancelReason ?? "",
          amount: o.totals.grand,
        }));
      return {
        title,
        columns: [
          { key: "bill", label: "Bill" },
          { key: "day", label: "Day" },
          { key: "reason", label: "Reason" },
          { key: "amount", label: "Amount", money: true },
        ],
        rows,
        totals: { bill: "Total", day: "", reason: "", amount: sum(rows, (x) => x.amount) },
        summary: [
          { label: "Cancelled", value: rows.length },
          { label: "Value", value: sum(rows, (x) => x.amount), money: true },
        ],
      };
    }
    case "staff": {
      const map = new Map<
        string,
        { staff: string; bills: number; guests: number; sales: number }
      >();
      for (const o of settled) {
        const cur = map.get(o.captainName) ?? {
          staff: o.captainName,
          bills: 0,
          guests: 0,
          sales: 0,
        };
        cur.bills++;
        cur.guests += o.guests;
        cur.sales = r2(cur.sales + o.totals.grand);
        map.set(o.captainName, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.sales - a.sales);
      return {
        title,
        columns: [
          { key: "staff", label: "Staff" },
          { key: "bills", label: "Bills", num: true },
          { key: "guests", label: "Guests", num: true },
          { key: "sales", label: "Sales", money: true },
        ],
        rows,
        totals: {
          staff: "Total",
          bills: sum(rows, (x) => x.bills),
          guests: sum(rows, (x) => x.guests),
          sales: sum(rows, (x) => x.sales),
        },
        summary: [
          { label: "Sales", value: sum(rows, (x) => x.sales), money: true },
          { label: "Staff", value: rows.length },
        ],
      };
    }
    case "table": {
      const map = new Map<
        string,
        { table: string; bills: number; guests: number; sales: number }
      >();
      for (const o of settled.filter((x) => x.tableId)) {
        const name = tableName(o.tableId);
        const cur = map.get(name) ?? { table: name, bills: 0, guests: 0, sales: 0 };
        cur.bills++;
        cur.guests += o.guests;
        cur.sales = r2(cur.sales + o.totals.grand);
        map.set(name, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.sales - a.sales);
      return {
        title,
        columns: [
          { key: "table", label: "Table" },
          { key: "bills", label: "Bills", num: true },
          { key: "guests", label: "Guests", num: true },
          { key: "sales", label: "Sales", money: true },
        ],
        rows,
        totals: {
          table: "Total",
          bills: sum(rows, (x) => x.bills),
          guests: sum(rows, (x) => x.guests),
          sales: sum(rows, (x) => x.sales),
        },
        summary: [
          { label: "Sales", value: sum(rows, (x) => x.sales), money: true },
          { label: "Tables used", value: rows.length },
        ],
      };
    }
    case "payment-mode": {
      const map = new Map<string, { mode: string; bills: number; amount: number }>();
      for (const o of settled)
        for (const p of o.payments) {
          const cur = map.get(p.modeId) ?? { mode: modeName(db, p.modeId), bills: 0, amount: 0 };
          cur.bills++;
          cur.amount = r2(cur.amount + p.amount);
          map.set(p.modeId, cur);
        }
      const rows = [...map.values()].sort((a, b) => b.amount - a.amount);
      return {
        title,
        columns: [
          { key: "mode", label: "Mode" },
          { key: "bills", label: "Bills", num: true },
          { key: "amount", label: "Amount", money: true },
        ],
        rows,
        totals: {
          mode: "Total",
          bills: sum(rows, (x) => x.bills),
          amount: sum(rows, (x) => x.amount),
        },
        summary: [
          { label: "Collected", value: sum(rows, (x) => x.amount), money: true },
          { label: "Modes", value: rows.length },
        ],
      };
    }
    case "due-collected": {
      const rows = db.dueCollections
        .filter((d) => inRange(businessDate(new Date(d.at), db.settings.businessDayStart), r))
        .map((d) => ({
          customer: d.customerName,
          mobile: d.customerMobile,
          mode: modeName(db, d.modeId),
          by: d.by,
          amount: d.amount,
        }));
      return {
        title,
        columns: [
          { key: "customer", label: "Customer" },
          { key: "mobile", label: "Mobile" },
          { key: "mode", label: "Mode" },
          { key: "amount", label: "Amount", money: true },
        ],
        rows,
        totals: { customer: "Total", mobile: "", mode: "", amount: sum(rows, (x) => x.amount) },
        summary: [
          { label: "Collected", value: sum(rows, (x) => x.amount), money: true },
          {
            label: "Outstanding now",
            value: sum(db.customers, (c) => c.dueOutstanding),
            money: true,
          },
        ],
      };
    }
    case "cash-session": {
      const all = [...(db.cashSession ? [db.cashSession] : []), ...db.cashHistory].filter((s) =>
        inRange(businessDate(new Date(s.openedAt), db.settings.businessDayStart), r),
      );
      const rows = all.map((s) => ({
        opened: new Date(s.openedAt).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        }),
        by: s.openedBy,
        float: s.openingFloat,
        expected: s.expected ?? 0,
        counted: s.counted ?? 0,
        diff: s.closedAt ? r2((s.counted ?? 0) - (s.expected ?? 0)) : 0,
        status: s.closedAt ? "Closed" : "Open",
      }));
      return {
        title,
        columns: [
          { key: "opened", label: "Opened" },
          { key: "by", label: "By" },
          { key: "float", label: "Float", money: true },
          { key: "expected", label: "Expected", money: true },
          { key: "counted", label: "Counted", money: true },
          { key: "diff", label: "Difference", money: true },
          { key: "status", label: "Status" },
        ],
        rows,
        summary: [
          { label: "Sessions", value: rows.length },
          { label: "Total difference", value: sum(rows, (x) => x.diff), money: true },
        ],
      };
    }
    case "expense": {
      const rows = db.expenses
        .filter((e) => inRange(businessDate(new Date(e.at), db.settings.businessDayStart), r))
        .map((e) => ({
          day: fmtDay(businessDate(new Date(e.at), db.settings.businessDayStart)),
          head: db.expenseHeads.find((h) => h.id === e.headId)?.name ?? "",
          note: e.note,
          mode: modeName(db, e.modeId),
          amount: e.amount,
        }));
      return {
        title,
        columns: [
          { key: "day", label: "Day" },
          { key: "head", label: "Head" },
          { key: "note", label: "Note" },
          { key: "mode", label: "Mode" },
          { key: "amount", label: "Amount", money: true },
        ],
        rows,
        totals: { day: "Total", head: "", note: "", mode: "", amount: sum(rows, (x) => x.amount) },
        summary: [
          { label: "Expenses", value: sum(rows, (x) => x.amount), money: true },
          { label: "Entries", value: rows.length },
        ],
      };
    }
    case "purchase": {
      const rows = db.stock.purchases
        .filter((p) => inRange(p.date, r))
        .map((p) => {
          const paid = r2(p.payments.reduce((a, x) => a + x.amount, 0));
          return {
            po: p.poNo,
            day: fmtDay(p.date),
            supplier: db.stock.suppliers.find((s) => s.id === p.supplierId)?.name ?? "",
            total: p.total,
            paid,
            balance: r2(p.total - paid),
          };
        });
      return {
        title,
        columns: [
          { key: "po", label: "PO" },
          { key: "day", label: "Day" },
          { key: "supplier", label: "Supplier" },
          { key: "total", label: "Total", money: true },
          { key: "paid", label: "Paid", money: true },
          { key: "balance", label: "Balance", money: true },
        ],
        rows,
        totals: {
          po: "Total",
          day: "",
          supplier: "",
          total: sum(rows, (x) => x.total),
          paid: sum(rows, (x) => x.paid),
          balance: sum(rows, (x) => x.balance),
        },
        summary: [
          { label: "Purchased", value: sum(rows, (x) => x.total), money: true },
          { label: "Unpaid", value: sum(rows, (x) => x.balance), money: true },
        ],
      };
    }
    case "closing-stock": {
      const unit = (id: string) => db.stock.units.find((u) => u.id === id)?.short ?? "";
      const rows = db.stock.raw.map((m) => ({
        item: m.name,
        category: m.category,
        stock: m.stock,
        unit: unit(m.unitId),
        value: r2(Math.max(0, m.stock) * m.rate),
        status: m.stock < 0 ? "Negative" : m.stock <= m.reorderLevel ? "Low" : "OK",
      }));
      return {
        title,
        columns: [
          { key: "item", label: "Item" },
          { key: "stock", label: "Stock", num: true },
          { key: "unit", label: "Unit" },
          { key: "value", label: "Value", money: true },
          { key: "status", label: "Status" },
        ],
        rows,
        totals: {
          item: "Total",
          stock: "",
          unit: "",
          value: sum(rows, (x) => x.value),
          status: "",
        },
        summary: [
          { label: "Stock value", value: sum(rows, (x) => x.value), money: true },
          { label: "Low", value: rows.filter((x) => x.status === "Low").length },
          { label: "Negative", value: rows.filter((x) => x.status === "Negative").length },
        ],
      };
    }
    case "stock-ledger": {
      // Per raw material: Opening | +Purchased | -Used | -Wastage | +/-Manual | =Closing (owner decision, 2026-09-25).
      const inR = (at: string) =>
        inRange(businessDate(new Date(at), db.settings.businessDayStart), r);
      const after = (at: string) => businessDate(new Date(at), db.settings.businessDayStart) > r.to;
      const rows = db.stock.raw.map((m) => {
        const mv = db.stock.movements.filter((x) => x.refKind === "raw" && x.refId === m.id);
        const inside = mv.filter((x) => inR(x.at));
        const closing = r2(
          m.stock -
            sum(
              mv.filter((x) => after(x.at)),
              (x) => x.qty,
            ),
        );
        const k = (kinds: string[]) =>
          sum(
            inside.filter((x) => kinds.includes(x.kind)),
            (x) => x.qty,
          );
        const purchased = k(["purchase"]);
        const used = k(["sale", "production-out"]);
        const wastage = k(["wastage"]);
        const manual = k(["manual-in", "manual-out", "adjustment", "production-in"]);
        return {
          item: m.name,
          opening: r2(closing - purchased - used - wastage - manual),
          purchased,
          used: -used,
          wastage: -wastage,
          manual,
          closing,
        };
      });
      return {
        title,
        columns: [
          { key: "item", label: "Item" },
          { key: "opening", label: "Opening", num: true },
          { key: "purchased", label: "+ Purchased", num: true },
          { key: "used", label: "− Used", num: true },
          { key: "wastage", label: "− Wastage", num: true },
          { key: "manual", label: "± Manual", num: true },
          { key: "closing", label: "= Closing", num: true },
        ],
        rows,
        summary: [
          { label: "Items", value: rows.length },
          { label: "Negative now", value: db.stock.raw.filter((m) => m.stock < 0).length },
        ],
      };
    }
    case "wastage": {
      const rows = db.stock.wastage
        .filter((w) => inRange(businessDate(new Date(w.at), db.settings.businessDayStart), r))
        .map((w) => ({
          day: fmtDay(businessDate(new Date(w.at), db.settings.businessDayStart)),
          item:
            (w.refKind === "raw" ? db.stock.raw : db.stock.semi).find((x) => x.id === w.refId)
              ?.name ?? "",
          qty: w.qty,
          reason: w.reason,
          cost: w.cost,
        }));
      return {
        title,
        columns: [
          { key: "day", label: "Day" },
          { key: "item", label: "Item" },
          { key: "qty", label: "Qty", num: true },
          { key: "reason", label: "Reason" },
          { key: "cost", label: "Cost", money: true },
        ],
        rows,
        totals: { day: "Total", item: "", qty: "", reason: "", cost: sum(rows, (x) => x.cost) },
        summary: [
          { label: "Wastage cost", value: sum(rows, (x) => x.cost), money: true },
          { label: "Entries", value: rows.length },
        ],
      };
    }
  }
  return { title, columns: [], rows: [], summary: [] };
}
