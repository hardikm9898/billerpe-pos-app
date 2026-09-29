import { ROLE_DEFAULTS } from "../../permissions";
import type {
  AddonGroup,
  ChargeRule,
  Customer,
  DevicePrinter,
  Expense,
  ExpenseHead,
  Kitchen,
  MenuCatalog,
  MenuCategory,
  MenuItem,
  Outlet,
  OutletSettings,
  Permissions,
  PromoCode,
  PurchaseOrder,
  PurchasePayment,
  QueueStatus,
  RawMaterial,
  Recipe,
  Reservation,
  ReservationStatus,
  Role,
  SemiFinished,
  StockUnit,
  Supplier,
  TableSection,
  TaxRule,
  Variant,
} from "../../types";
import type { MenuImportResult, MenuImportRow } from "../types";
import { businessDate, nextId, r2 } from "./db";
import {
  audit,
  iso,
  need,
  needSpecial,
  openOrderOnTable,
  ownerAlert,
  recordCash,
  RuleError,
  sendKot,
  tableById,
  type Ctx,
} from "./core";

// Everything that is not the order flow: front of house, money, masters,
// staff, settings, devices, stock. Same rule style as core.ts.

const fail = (msg: string): never => {
  throw new RuleError(msg);
};
const MOBILE = /^\d{10}$/;
const upsert = <T extends { id: string }>(list: T[], row: T) => {
  const i = list.findIndex((x) => x.id === row.id);
  if (i >= 0) list[i] = row;
  else list.push(row);
};

/* ------------------------------ QR orders ------------------------------ */

/**
 * Accept / reject a QR round item by item (owner decision, issue list 3 #9):
 * accepted items become a KOT on the table's order; rejected items never
 * reach the order, KOT or bill, and the customer sees the reason. All
 * rejected = the round is rejected. Once the bill is printed the table's QR
 * cannot add items.
 */
export function decideQr(
  c: Ctx,
  qrId: string,
  decisions: { key: string; accept: boolean; reason?: string | undefined }[],
) {
  need(c, "biller", "create");
  const q = c.db.qrOrders.find((x) => x.id === qrId) ?? fail("This QR order is gone");
  if (q.status !== "pending") fail("This QR order was already handled");
  const existing = openOrderOnTable(c, q.tableId);
  if (existing?.status === "billed")
    fail("The bill for this table is printed — the customer can no longer add items");
  if (existing?.status === "hold")
    fail("This table's order is on hold. Send or clear the held items first.");
  for (const item of q.items) {
    const d = decisions.find((x) => x.key === item.key) ?? fail(`Accept or reject ${item.name}`);
    if (!d.accept && !d.reason?.trim()) fail(`Pick a reason for rejecting ${item.name}`);
    item.decision = d.accept ? "accepted" : "rejected";
    item.rejectReason = d.accept ? undefined : d.reason!.trim();
  }
  const accepted = q.items.filter((i) => i.decision === "accepted");
  q.status =
    accepted.length === 0
      ? "rejected"
      : accepted.length === q.items.length
        ? "accepted"
        : "partial";
  const table = tableById(c, q.tableId);
  if (!accepted.length) {
    audit(c, "QR orders", `Rejected QR round ${q.round} on ${table?.name}`);
    return {};
  }
  const menuItem = (id: string) => c.db.items.find((i) => i.id === id);
  const r = sendKot(c, {
    orderId: existing?.id,
    type: "dinin",
    tableId: q.tableId,
    guests: existing?.guests ?? 1,
    customerName: q.customerName,
    customerMobile: q.customerMobile,
    menuId: existing?.menuId ?? menuItem(accepted[0]!.itemId)?.menuId ?? "",
    lines: accepted.map((i) => ({
      key: i.key,
      itemId: i.itemId,
      name: i.name,
      categoryId: menuItem(i.itemId)?.categoryId,
      dietary: i.dietary,
      variantName: i.variantName,
      addons: i.addons,
      note: i.note,
      price: i.price,
      qty: i.qty,
      custom: false,
    })),
    clientKey: `qr-${q.id}`,
  });
  const o = c.db.orders.find((x) => x.id === r.orderId)!;
  o.fromQr = true;
  audit(c, "QR orders", `Accepted ${accepted.length}/${q.items.length} QR items on ${table?.name}`);
  return { orderId: r.orderId, kot: r.kot };
}

/* ------------------------------ reservations & queue ------------------------------ */

export function saveReservation(
  c: Ctx,
  r: Omit<Reservation, "id" | "status"> & { id?: string | undefined },
) {
  need(c, "reservations", r.id ? "edit" : "create");
  if (!r.name.trim()) fail("Guest name is required");
  if (!MOBILE.test(r.mobile)) fail("Enter a 10-digit mobile number");
  if (!(r.guests >= 1)) fail("Guests must be at least 1");
  if (new Date(r.endAt) <= new Date(r.at)) fail("End time must be after the start time");
  if (r.advance < 0) fail("Advance cannot be negative");
  for (const tid of r.tableIds) {
    const clash = c.db.reservations.find(
      (x) =>
        x.id !== r.id &&
        x.status === "booked" &&
        x.tableIds.includes(tid) &&
        new Date(x.at) < new Date(r.endAt) &&
        new Date(x.endAt) > new Date(r.at),
    );
    if (clash) fail(`${tableById(c, tid)?.name} is already booked for ${clash.name} at that time`);
  }
  const existing = r.id ? c.db.reservations.find((x) => x.id === r.id) : undefined;
  upsert(c.db.reservations, {
    ...r,
    name: r.name.trim(),
    id: r.id ?? nextId(c.db, "res"),
    status: existing?.status ?? "booked",
  });
  audit(c, "Reservations", `${existing ? "Edited" : "Booked"} ${r.name} for ${r.guests}`);
}

export function setReservationStatus(c: Ctx, id: string, status: ReservationStatus) {
  need(c, "reservations", "edit");
  const r = c.db.reservations.find((x) => x.id === id) ?? fail("Reservation not found");
  r.status = status;
  audit(c, "Reservations", `${r.name}: ${status}`);
}

export function addToQueue(
  c: Ctx,
  e: { name: string; mobile: string; guests: number; note?: string | undefined },
) {
  need(c, "queue", "create");
  if (!e.name.trim()) fail("Name is required");
  if (e.mobile && !MOBILE.test(e.mobile)) fail("Enter a 10-digit mobile number");
  if (!(e.guests >= 1)) fail("Guests must be at least 1");
  c.db.queue.push({
    id: nextId(c.db, "q"),
    name: e.name.trim(),
    mobile: e.mobile,
    guests: e.guests,
    note: e.note,
    status: "waiting",
    joinedAt: iso(c),
  });
}

export function setQueueStatus(c: Ctx, id: string, status: QueueStatus) {
  need(c, "queue", "edit");
  const q = c.db.queue.find((x) => x.id === id) ?? fail("Not in the list");
  q.status = status;
  if (status === "called") q.calledAt = iso(c);
}

/* ------------------------------ customers & due ------------------------------ */

export function saveCustomer(
  c: Ctx,
  input: Pick<Customer, "name" | "mobile" | "email" | "gstin" | "address" | "birthday"> & {
    id?: string | undefined;
  },
) {
  need(c, "ops-ledger", input.id ? "edit" : "create");
  if (!input.name.trim()) fail("Name is required");
  if (!MOBILE.test(input.mobile)) fail("Enter a 10-digit mobile number");
  if (input.gstin && !/^[0-9A-Z]{15}$/.test(input.gstin)) fail("GSTIN must be 15 characters");
  if (c.db.customers.some((x) => x.mobile === input.mobile && x.id !== input.id))
    fail("A customer with this mobile already exists");
  const existing = input.id ? c.db.customers.find((x) => x.id === input.id) : undefined;
  upsert(c.db.customers, {
    visits: 0,
    totalSpent: 0,
    dueOutstanding: 0,
    ...existing,
    ...input,
    name: input.name.trim(),
    id: input.id ?? nextId(c.db, "cus"),
  });
}

/** Collect a due, oldest bill first; cash goes into the open drawer. */
export function collectDue(c: Ctx, mobile: string, amount: number, modeId: string) {
  need(c, "ops-ledger", "edit");
  if (!(amount > 0)) fail("Enter an amount");
  if (modeId === "due") fail("Pick how the customer paid");
  const bills = c.db.orders
    .filter((o) => o.customerMobile === mobile && (o.dueOutstanding ?? 0) > 0)
    .sort((a, b) => (a.settledAt ?? "").localeCompare(b.settledAt ?? ""));
  const outstanding = r2(bills.reduce((a, o) => a + (o.dueOutstanding ?? 0), 0));
  if (amount > outstanding) fail(`Only ₹${outstanding.toFixed(2)} is due`);
  let left = amount;
  for (const b of bills) {
    const take = Math.min(left, b.dueOutstanding ?? 0);
    b.dueOutstanding = r2((b.dueOutstanding ?? 0) - take) || undefined;
    // The bill's payments follow (as on the cloud): the due part becomes the mode it was paid in.
    const dueRow = b.payments.find((p) => p.modeId === "due");
    if (dueRow) dueRow.amount = r2(dueRow.amount - take);
    const paidRow = b.payments.find((p) => p.modeId === modeId);
    if (paidRow) paidRow.amount = r2(paidRow.amount + take);
    else b.payments.push({ modeId, amount: take });
    b.payments = b.payments.filter((p) => p.amount > 0);
    b.timeline.push({ at: iso(c), label: `Due collected ₹${take.toFixed(2)}`, by: c.user.name });
    left = r2(left - take);
    if (left <= 0) break;
  }
  const cust = c.db.customers.find((x) => x.mobile === mobile);
  if (cust) cust.dueOutstanding = r2(Math.max(0, cust.dueOutstanding - amount));
  c.db.dueCollections.unshift({
    id: nextId(c.db, "due"),
    customerMobile: mobile,
    customerName: cust?.name ?? bills[0]?.customerName ?? "Customer",
    amount,
    modeId,
    at: iso(c),
    by: c.user.name,
  });
  if (modeId === "cash") recordCash(c, amount, `Due from ${cust?.name ?? mobile}`);
  audit(c, "Due", `Collected ₹${amount} from ${cust?.name ?? mobile}`);
}

/* ------------------------------ cash & expenses ------------------------------ */

export function expectedCash(c: Ctx): number {
  const s = c.db.cashSession;
  if (!s) return 0;
  return r2(
    s.openingFloat +
      s.movements.reduce(
        (a, m) => a + (m.kind === "in" || m.kind === "settlement" ? m.amount : -m.amount),
        0,
      ),
  );
}

export function openCash(c: Ctx, openingFloat: number) {
  need(c, "cash-session", "create");
  if (c.db.cashSession) fail("A cash session is already open");
  if (!(openingFloat >= 0)) fail("Enter the opening float");
  c.db.cashSession = {
    id: nextId(c.db, "cs"),
    openedAt: iso(c),
    openedBy: c.user.name,
    openingFloat,
    movements: [],
  };
  audit(c, "Cash session", `Opened with ₹${openingFloat}`);
}

export function cashMovement(c: Ctx, kind: "in" | "out", amount: number, reason: string) {
  need(c, "cash-session", "edit");
  const s = c.db.cashSession ?? fail("Open a cash session first");
  if (!(amount > 0)) fail("Enter an amount");
  if (!reason.trim()) fail("Add a reason");
  s.movements.unshift({
    id: nextId(c.db, "cm"),
    kind,
    amount: r2(amount),
    reason: reason.trim(),
    at: iso(c),
    by: c.user.name,
  });
  audit(c, "Cash session", `Cash ${kind} ₹${amount} — ${reason.trim()}`);
}

export function closeCash(c: Ctx, denominations: Record<string, number>, varianceReason?: string) {
  need(c, "cash-session", "edit");
  const s = c.db.cashSession ?? fail("No cash session is open");
  const counted = r2(
    Object.entries(denominations).reduce((a, [d, n]) => a + Number(d) * (n || 0), 0),
  );
  const expected = expectedCash(c);
  if (Math.abs(counted - expected) > 0.009 && !varianceReason?.trim())
    fail("The count does not match. Add a reason for the difference.");
  const closed = {
    ...s,
    closedAt: iso(c),
    closedBy: c.user.name,
    expected,
    counted,
    denominations,
    varianceReason: varianceReason?.trim() || undefined,
  };
  c.db.cashHistory.unshift(closed);
  c.db.cashSession = null;
  audit(c, "Cash session", `Closed · counted ₹${counted} · expected ₹${expected}`);
  const diff = r2(counted - expected);
  if (Math.abs(diff) > 0.009)
    ownerAlert(c, "cashDifference", {
      title: `Cash ${diff < 0 ? "short" : "over"} ₹${Math.abs(diff).toFixed(2)} at close`,
      body: `Counted ₹${counted.toFixed(2)}, expected ₹${expected.toFixed(2)} · ${varianceReason?.trim() ?? ""}`,
      link: "/cash",
    });
  return closed;
}

export function saveExpenseHead(
  c: Ctx,
  h: Omit<ExpenseHead, "id" | "system"> & { id?: string | undefined },
) {
  need(c, "expense", h.id ? "edit" : "create");
  if (!h.name.trim()) fail("Name is required");
  const existing = h.id ? c.db.expenseHeads.find((x) => x.id === h.id) : undefined;
  if (existing?.system) fail("This head is used for supplier payments and cannot be changed");
  if (
    c.db.expenseHeads.some(
      (x) => x.id !== h.id && x.name.toLowerCase() === h.name.trim().toLowerCase(),
    )
  )
    fail("This head already exists");
  upsert(c.db.expenseHeads, { ...h, name: h.name.trim(), id: h.id ?? nextId(c.db, "eh") });
}

export function saveExpense(
  c: Ctx,
  e: Omit<Expense, "id" | "at" | "by"> & { id?: string | undefined },
) {
  need(c, "expense", e.id ? "edit" : "create");
  if (!(e.amount > 0)) fail("Enter an amount");
  const head = c.db.expenseHeads.find((h) => h.id === e.headId) ?? fail("Pick an expense head");
  if (head.system) fail("Supplier payments are recorded from the purchase, not here");
  const existing = e.id ? c.db.expenses.find((x) => x.id === e.id) : undefined;
  if (existing?.fromPurchase) fail("This was recorded from a supplier payment — change it there");
  if (existing?.fromDrawer && existing.modeId === "cash") {
    if (!c.db.cashSession || existing.at < c.db.cashSession.openedAt)
      fail("This cash was paid from a closed cash session and cannot be changed");
    recordCash(c, -existing.amount, `Expense edited: ${head.name}`, "expense");
  }
  const fromDrawer = e.modeId === "cash" && Boolean(e.fromDrawer) && Boolean(c.db.cashSession);
  const row: Expense = {
    ...e,
    fromDrawer,
    id: e.id ?? nextId(c.db, "ex"),
    at: existing?.at ?? iso(c),
    by: existing?.by ?? c.user.name,
  };
  upsert(c.db.expenses, row);
  if (fromDrawer) recordCash(c, row.amount, `Expense: ${head.name}`, "expense");
  audit(c, "Expenses", `${existing ? "Edited" : "Added"} ₹${e.amount} · ${head.name}`);
}

export function deleteExpense(c: Ctx, id: string) {
  need(c, "expense", "delete");
  const e = c.db.expenses.find((x) => x.id === id) ?? fail("Expense not found");
  if (e.fromPurchase)
    fail("This was recorded from a supplier payment — delete the payment instead");
  if (e.fromDrawer) {
    if (!c.db.cashSession || e.at < c.db.cashSession.openedAt)
      fail("This cash was paid from a closed cash session and cannot be deleted");
    recordCash(c, -e.amount, "Expense deleted", "expense");
  }
  c.db.expenses = c.db.expenses.filter((x) => x.id !== id);
  audit(c, "Expenses", `Deleted an expense of ₹${e.amount}`);
}

/* ------------------------------ menu ------------------------------ */

export function saveMenu(c: Ctx, m: Omit<MenuCatalog, "id"> & { id?: string | undefined }) {
  need(c, "menu", m.id ? "edit" : "create");
  if (!m.name.trim()) fail("Name is required");
  if (c.db.menus.some((x) => x.id !== m.id && x.name.toLowerCase() === m.name.trim().toLowerCase()))
    fail("A menu with this name exists");
  if (m.isDefault) for (const x of c.db.menus) x.isDefault = false;
  if (!m.isDefault && !c.db.menus.some((x) => x.isDefault && x.id !== m.id))
    fail("One menu must stay the default");
  upsert(c.db.menus, { ...m, name: m.name.trim(), id: m.id ?? nextId(c.db, "menu") });
  audit(c, "Menu", `Saved menu ${m.name}`);
}

export function saveCategory(c: Ctx, cat: Omit<MenuCategory, "id"> & { id?: string | undefined }) {
  need(c, "menu", cat.id ? "edit" : "create");
  if (!cat.name.trim()) fail("Name is required");
  if (
    c.db.categories.some(
      (x) =>
        x.id !== cat.id &&
        x.menuId === cat.menuId &&
        x.name.toLowerCase() === cat.name.trim().toLowerCase(),
    )
  )
    fail("This category already exists in the menu");
  upsert(c.db.categories, { ...cat, name: cat.name.trim(), id: cat.id ?? nextId(c.db, "cat") });
  audit(c, "Menu", `Saved category ${cat.name}`);
}

export function deleteCategory(c: Ctx, id: string) {
  need(c, "menu", "delete");
  if (c.db.items.some((i) => i.categoryId === id)) fail("Move or delete its items first");
  c.db.categories = c.db.categories.filter((x) => x.id !== id);
}

export function saveItem(c: Ctx, i: Omit<MenuItem, "id"> & { id?: string | undefined }) {
  need(c, "menu", i.id ? "edit" : "create");
  if (!i.name.trim()) fail("Name is required");
  if (!i.shortCode.trim()) fail("Short code is required");
  const cat = c.db.categories.find((x) => x.id === i.categoryId) ?? fail("Pick a category");
  if (cat.menuId !== i.menuId) fail("The category belongs to another menu");
  if (!(i.price > 0) && i.variants.length === 0) fail("Price must be more than 0");
  if (i.variants.some((v) => !(v.price > 0))) fail("Every variant needs a price");
  const code = i.shortCode.trim().toUpperCase();
  if (
    c.db.items.some(
      (x) => x.id !== i.id && x.menuId === i.menuId && x.shortCode.toUpperCase() === code,
    )
  )
    fail("Short code already used in this menu");
  upsert(c.db.items, {
    ...i,
    name: i.name.trim(),
    shortCode: code,
    id: i.id ?? nextId(c.db, "itm"),
  });
  audit(c, "Menu", `Saved item ${i.name}`);
}

export function deleteItem(c: Ctx, id: string) {
  need(c, "menu", "delete");
  const item = c.db.items.find((x) => x.id === id) ?? fail("Item not found");
  c.db.items = c.db.items.filter((x) => x.id !== id);
  c.db.stock.recipes = c.db.stock.recipes.filter((r) => r.itemId !== id);
  audit(c, "Menu", `Deleted item ${item.name}`);
}

export function setOutOfStock(c: Ctx, id: string, out: boolean) {
  need(c, "menu", "edit");
  const item = c.db.items.find((x) => x.id === id) ?? fail("Item not found");
  item.outOfStock = out;
  audit(c, "Menu", `${item.name}: ${out ? "out of stock" : "back in stock"}`);
}

export function saveVariant(c: Ctx, v: Omit<Variant, "id"> & { id?: string | undefined }) {
  need(c, "menu", v.id ? "edit" : "create");
  if (!v.name.trim()) fail("Name is required");
  // One name per outlet (exe rule).
  if (
    c.db.variants.some((x) => x.id !== v.id && x.name.toLowerCase() === v.name.trim().toLowerCase())
  )
    fail("A variant with this name already exists");
  upsert(c.db.variants, { ...v, name: v.name.trim(), id: v.id ?? nextId(c.db, "var") });
  if (v.id)
    for (const i of c.db.items)
      for (const iv of i.variants) if (iv.variantId === v.id) iv.name = v.name.trim();
}

/** Web POS menu CSV import (see PosBackend.importMenu). */
export function importMenu(c: Ctx, menuId: string, rows: MenuImportRow[]): MenuImportResult {
  need(c, "menu", "create");
  need(c, "menu", "edit");
  if (!c.db.menus.some((m) => m.id === menuId)) fail("Menu not found");
  if (!rows.length) fail("The file has no items");
  const out: MenuImportResult = { created: 0, updated: 0, categoriesCreated: 0, failed: [] };
  const nextCode = () =>
    String(
      c.db.items.reduce(
        (m, i) => Math.max(m, /^\d+$/.test(i.shortCode) ? Number(i.shortCode) : 0),
        100,
      ) + 1,
    );
  rows.forEach((r, idx) => {
    const line = idx + 1;
    try {
      const name = String(r.name ?? "").trim();
      const catName = String(r.category ?? "").trim();
      const price = Number(r.price);
      if (!name) fail("Missing name");
      if (!catName) fail("Missing category");
      if (!(price > 0)) fail("Invalid price");
      let cat = c.db.categories.find(
        (x) => x.menuId === menuId && x.name.toLowerCase() === catName.toLowerCase(),
      );
      if (!cat) {
        const rank =
          c.db.categories
            .filter((x) => x.menuId === menuId)
            .reduce((m, x) => Math.max(m, x.rank), 0) + 1;
        saveCategory(c, { menuId, name: catName, rank, active: true });
        cat = c.db.categories.find((x) => x.menuId === menuId && x.name === catName)!;
        out.categoriesCreated++;
      }
      const existing = c.db.items.find(
        (x) => x.menuId === menuId && x.name.toLowerCase() === name.toLowerCase(),
      );
      const code = String(r.shortCode ?? "")
        .trim()
        .toUpperCase();
      if (existing) {
        // Keep a finer food type when the Veg column agrees with it (Jain stays Jain, Egg stays Egg).
        const vegNow = ["veg", "jain", "vegan", "swaminarayan"].includes(existing.dietary);
        saveItem(c, {
          ...existing,
          name,
          categoryId: cat.id,
          price,
          shortCode: code || existing.shortCode,
          dietary: r.veg === vegNow ? existing.dietary : r.veg ? "veg" : "nonveg",
          active: r.active !== false,
        });
        out.updated++;
      } else {
        saveItem(c, {
          menuId,
          categoryId: cat.id,
          name,
          shortCode: code || nextCode(),
          price,
          dietary: r.veg === false ? "nonveg" : "veg",
          gstType: "G",
          description: "",
          favorite: false,
          active: r.active !== false,
          outOfStock: false,
          variants: [],
          addonGroupIds: [],
        });
        out.created++;
      }
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      out.failed.push({ line, name: String(r.name ?? ""), error: e.message });
    }
  });
  audit(c, "Menu", `Imported menu CSV: ${out.created} added, ${out.updated} updated`);
  return out;
}

/** Web POS removeVariant: only once no item uses it. */
export function deleteVariant(c: Ctx, id: string) {
  need(c, "menu", "delete");
  const v = c.db.variants.find((x) => x.id === id) ?? fail("Variant not found");
  const used = c.db.items.filter((i) => i.variants.some((x) => x.variantId === id)).length;
  if (used) fail(`In use by ${used} item(s) — remove it from those items first`);
  c.db.variants = c.db.variants.filter((x) => x.id !== id);
  for (const r of c.db.stock.recipes) delete r.byVariant[id];
  audit(c, "Menu", `Deleted variant ${v.name}`);
}

export function saveAddonGroup(c: Ctx, g: Omit<AddonGroup, "id"> & { id?: string | undefined }) {
  need(c, "menu", g.id ? "edit" : "create");
  if (!g.name.trim()) fail("Name is required");
  if (g.options.length === 0) fail("Add at least one option");
  if (g.options.some((o) => !o.name.trim())) fail("Every option needs a name");
  if (g.options.some((o) => o.price < 0)) fail("Option price cannot be negative");
  if (g.min < 0 || g.max < 1) fail("Max must be at least 1");
  if (g.min > g.max) fail("Min cannot be more than max");
  if (g.max > g.options.length) fail("Max cannot be more than the number of options");
  upsert(c.db.addonGroups, {
    ...g,
    single: g.max === 1,
    name: g.name.trim(),
    id: g.id ?? nextId(c.db, "ag"),
  });
}

export function deleteAddonGroup(c: Ctx, id: string) {
  need(c, "menu", "delete");
  c.db.addonGroups = c.db.addonGroups.filter((x) => x.id !== id);
  for (const i of c.db.items) i.addonGroupIds = i.addonGroupIds.filter((x) => x !== id);
}

/* ------------------------------ tables ------------------------------ */

export function saveSection(c: Ctx, s: Omit<TableSection, "id"> & { id?: string | undefined }) {
  need(c, "tables", s.id ? "edit" : "create");
  if (!s.name.trim()) fail("Name is required");
  if (
    c.db.sections.some((x) => x.id !== s.id && x.name.toLowerCase() === s.name.trim().toLowerCase())
  )
    fail("This section already exists");
  const rank = s.rank === undefined || s.rank === null ? undefined : Number(s.rank);
  if (rank !== undefined && !(Number.isInteger(rank) && rank >= 1))
    fail("Rank must be a whole number from 1");
  const id = s.id ?? nextId(c.db, "sec");
  const prevRank = c.db.sections.find((x) => x.id === id)?.rank;
  // Rank = position (Web POS sort order): the section moves there, the others
  // shift, ranks stay 1..N with no ties. No rank = keep its place / go last.
  const others = c.db.sections
    .filter((x) => x.id !== id)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const keep =
    prevRank === undefined ? others.length + 1 : others.filter((x) => x.rank < prevRank).length + 1;
  upsert(c.db.sections, { ...s, name: s.name.trim(), rank: 0, id });
  const at = Math.min(Math.max(rank ?? keep, 1), others.length + 1);
  others.splice(
    at - 1,
    0,
    c.db.sections.find((x) => x.id === id)!,
  );
  others.forEach((x, i) => (x.rank = i + 1));
}

export function deleteSection(c: Ctx, id: string) {
  need(c, "tables", "delete");
  if (c.db.tables.some((t) => t.sectionId === id)) fail("Move or delete its tables first");
  c.db.sections = c.db.sections.filter((x) => x.id !== id);
}

/** "T5" or a range "T1-T20" (bulk add, as in the Web POS). Existing names are skipped. */
export function addTables(c: Ctx, sectionId: string, spec: string, seats: number) {
  need(c, "tables", "create");
  if (!c.db.sections.some((s) => s.id === sectionId)) fail("Pick a section");
  const m = spec
    .trim()
    .toUpperCase()
    .match(/^([A-Z]*)(\d+)(?:\s*[-–—]\s*([A-Z]*)(\d+))?$/);
  if (!m) fail("Use a name like T5 or a range like T1-T20");
  const prefix = m![1] ?? "";
  const from = Number(m![2]);
  const to = m![4] ? Number(m![4]) : from;
  if (to < from) fail("The range must end after it starts");
  if (to - from > 99) fail("Add up to 100 tables at a time");
  if (!(seats >= 1)) fail("Seats must be at least 1");
  const names = Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
  const skipped = names.filter((n) => c.db.tables.some((t) => t.name.toUpperCase() === n));
  const fresh = names.filter((n) => !skipped.includes(n));
  if (!fresh.length) fail(`${skipped.join(", ")} already exist`);
  for (const name of fresh)
    c.db.tables.push({
      id: nextId(c.db, "tbl"),
      name,
      sectionId,
      seats,
      status: "free",
      qrVersion: 1,
    });
  audit(c, "Tables", `Added ${fresh.length} table(s)`);
  return { added: fresh.length, skipped };
}

export function editTable(
  c: Ctx,
  id: string,
  patch: { name?: string | undefined; seats?: number | undefined; sectionId?: string | undefined },
) {
  need(c, "tables", "edit");
  const t = c.db.tables.find((x) => x.id === id) ?? fail("Table not found");
  if (patch.name !== undefined) {
    const n = patch.name.trim().toUpperCase();
    if (!n) fail("Name is required");
    if (c.db.tables.some((x) => x.id !== id && x.name.toUpperCase() === n))
      fail("Another table has this name");
    t.name = n;
  }
  if (patch.seats !== undefined) {
    if (!(patch.seats >= 1)) fail("Seats must be at least 1");
    t.seats = patch.seats;
  }
  if (patch.sectionId) t.sectionId = patch.sectionId;
}

export function newTableQr(c: Ctx, id: string) {
  need(c, "ops-experience", "edit");
  const t = c.db.tables.find((x) => x.id === id) ?? fail("Table not found");
  t.qrVersion += 1;
  audit(c, "Tables", `New QR for ${t.name} (old stickers stop working)`);
}

export function deleteTable(c: Ctx, id: string) {
  need(c, "tables", "delete");
  const t = c.db.tables.find((x) => x.id === id) ?? fail("Table not found");
  if (openOrderOnTable(c, id)) fail("This table has an open order");
  c.db.tables = c.db.tables.filter((x) => x.id !== id);
  audit(c, "Tables", `Deleted table ${t.name}`);
}

/* ------------------------------ staff ------------------------------ */

export function saveStaff(
  c: Ctx,
  s: {
    id?: string | undefined;
    name: string;
    mobile: string;
    role: Role;
    pin?: string | undefined;
    password?: string | undefined;
  },
) {
  const existing = s.id ? c.db.staff.find((x) => x.id === s.id) : undefined;
  const self = existing?.id === c.user.id;
  if (!self) need(c, "users", existing ? "edit" : "create");
  // Owner lock (owner decision, issue list 2): only the owner edits the owner; role never changes.
  if (existing?.isOwner && !self) fail("Only the owner can edit the owner's details");
  if (existing?.isOwner && s.role !== existing.role) fail("The owner's role cannot change");
  if (!existing && s.role === "Owner") fail("An outlet has one owner");
  if (existing && !existing.isOwner && s.role === "Owner") fail("An outlet has one owner");
  if (!s.name.trim()) fail("Name is required");
  if (!MOBILE.test(s.mobile)) fail("Enter a 10-digit mobile number");
  if (c.db.staff.some((x) => x.id !== s.id && x.mobile === s.mobile))
    fail("Another staff member has this mobile");
  if (!existing && !s.pin) fail("Set a 4-digit PIN");
  if (!existing && !s.password) fail("Set a password");
  if (s.pin !== undefined && s.pin !== "") {
    if (!/^\d{4}$/.test(s.pin)) fail("PIN must be 4 digits");
    if (Object.entries(c.db.secrets).some(([id, v]) => id !== s.id && v.pin === s.pin))
      fail("Another staff member uses this PIN");
  }
  if (s.password && s.password.length < 6) fail("Password needs at least 6 characters");
  const id = s.id ?? nextId(c.db, "stf");
  upsert(c.db.staff, {
    ...(existing ?? { active: true, isOwner: false }),
    id,
    name: s.name.trim(),
    mobile: s.mobile,
    role: s.role,
  });
  c.db.secrets[id] = {
    password: s.password || c.db.secrets[id]?.password || "",
    pin: s.pin || c.db.secrets[id]?.pin || "",
  };
  audit(c, "Staff", `${existing ? "Edited" : "Added"} ${s.name} (${s.role})`);
}

export function setStaffActive(c: Ctx, id: string, active: boolean) {
  need(c, "users", "edit");
  const s = c.db.staff.find((x) => x.id === id) ?? fail("Staff not found");
  if (s.isOwner) fail("The owner cannot be deactivated");
  if (s.id === c.user.id) fail("You cannot deactivate yourself");
  s.active = active;
  audit(c, "Staff", `${active ? "Activated" : "Deactivated"} ${s.name}`);
}

export function setRoleDefaults(c: Ctx, role: Role, p: Permissions) {
  needSpecial(c, "users.editPermissions");
  if (role === "Owner") fail("The owner always has every permission");
  c.db.roleDefaults[role] = p;
  audit(c, "Permissions", `Changed ${role} permissions`);
}

export function setUserOverrides(c: Ctx, staffId: string, p: Permissions | null) {
  needSpecial(c, "users.editPermissions");
  const s = c.db.staff.find((x) => x.id === staffId) ?? fail("Staff not found");
  if (s.isOwner) fail("The owner always has every permission");
  s.overrides = p ?? undefined;
  audit(c, "Permissions", `${p ? "Custom" : "Role"} permissions for ${s.name}`);
}

/* ------------------------------ settings ------------------------------ */

const HARDWARE_KEYS: (keyof OutletSettings)[] = ["kitchens", "kotFormat"];
const EXPERIENCE_KEYS: (keyof OutletSettings)[] = ["qrOrdering", "tableGridView"];

export function updateSettings(c: Ctx, patch: Partial<OutletSettings>) {
  for (const k of Object.keys(patch) as (keyof OutletSettings)[]) {
    // Owner alerts are the owner's own choice (owner list 2026-09-29 #10).
    if (k === "ownerAlerts") {
      if (!c.user.isOwner) fail("Only the owner can change owner alerts");
      continue;
    }
    need(
      c,
      HARDWARE_KEYS.includes(k)
        ? "ops-hardware"
        : EXPERIENCE_KEYS.includes(k)
          ? "ops-experience"
          : "ops-billing",
      "edit",
    );
  }
  if (
    patch.businessDayStart !== undefined &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.businessDayStart)
  )
    fail("Enter a time like 06:00");
  if (
    patch.financialYearStartMonth !== undefined &&
    !(patch.financialYearStartMonth >= 1 && patch.financialYearStartMonth <= 12)
  )
    fail("Pick a month");
  if (
    patch.ownerAlerts &&
    !(patch.ownerAlerts.discountPct >= 1 && patch.ownerAlerts.discountPct <= 100)
  )
    fail("Discount limit must be 1 to 100%");
  Object.assign(c.db.settings, patch);
  audit(c, "Settings", `Updated ${Object.keys(patch).join(", ")}`);
}

export function updateOutlet(
  c: Ctx,
  patch: Partial<
    Pick<Outlet, "name" | "address" | "phone" | "gstin" | "fssai" | "upiId" | "logoUrl">
  >,
) {
  need(c, "ops-billing", "edit");
  if (patch.name !== undefined && !patch.name.trim()) fail("Outlet name is required");
  if (patch.gstin && !/^[0-9A-Z]{15}$/.test(patch.gstin))
    fail("GSTIN must be 15 characters (capital letters and numbers)");
  if (patch.fssai && !/^\d{14}$/.test(patch.fssai)) fail("FSSAI number must be 14 digits");
  if (patch.upiId && !/^[\w.-]{2,}@[a-zA-Z][\w.-]*$/.test(patch.upiId))
    fail("Enter a UPI ID like name@bank");
  Object.assign(c.db.outlet, patch);
  audit(c, "Settings", "Updated outlet details");
}

export function saveTax(c: Ctx, t: Omit<TaxRule, "id"> & { id?: string | undefined }) {
  need(c, "ops-billing", t.id ? "edit" : "create");
  if (!t.name.trim()) fail("Tax name is required");
  if (!(t.rate >= 0)) fail("Enter a rate");
  if (t.type === "pr" && t.rate > 100) fail("A percentage tax cannot be above 100");
  upsert(c.db.settings.taxes, { ...t, name: t.name.trim(), id: t.id ?? nextId(c.db, "tax") });
  audit(c, "Settings", `Saved tax ${t.name}`);
}

export function deleteTax(c: Ctx, id: string) {
  need(c, "ops-billing", "delete");
  c.db.settings.taxes = c.db.settings.taxes.filter((x) => x.id !== id);
}

export function saveCharge(c: Ctx, which: "service" | "packaging", rule: ChargeRule) {
  need(c, "ops-billing", "edit");
  if (!(rule.value >= 0)) fail("Enter a value");
  if (rule.type === "percentage" && rule.value > 100) fail("A percentage cannot be above 100");
  if (rule.condition !== "3" && !(rule.threshold > 0))
    fail("Enter the bill amount for the condition");
  if (which === "service") c.db.settings.serviceCharge = rule;
  else c.db.settings.packagingCharge = rule;
  audit(c, "Settings", `Saved ${which} charge`);
}

export function savePaymentMode(
  c: Ctx,
  m: { id?: string | undefined; name: string; active: boolean },
) {
  need(c, "ops-billing", m.id ? "edit" : "create");
  const existing = m.id ? c.db.settings.paymentModes.find((x) => x.id === m.id) : undefined;
  if (existing?.locked && (m.name.trim() !== existing.name || !m.active))
    fail(`${existing.name} is always on and cannot be renamed`);
  if (!m.name.trim()) fail("Name is required");
  if (m.name.trim().length > 20) fail("Keep it under 20 characters");
  if (
    c.db.settings.paymentModes.some(
      (x) => x.id !== m.id && x.name.toLowerCase() === m.name.trim().toLowerCase(),
    )
  )
    fail("This payment mode exists");
  upsert(
    c.db.settings.paymentModes,
    existing
      ? { ...existing, name: m.name.trim(), active: m.active }
      : {
          id: nextId(c.db, "pm"),
          name: m.name.trim(),
          active: m.active,
          locked: false,
          custom: true,
        },
  );
}

export function removePaymentMode(c: Ctx, id: string) {
  need(c, "ops-billing", "delete");
  const m = c.db.settings.paymentModes.find((x) => x.id === id) ?? fail("Not found");
  if (!m.custom) fail(`${m.name} cannot be removed — switch it off instead`);
  c.db.settings.paymentModes = c.db.settings.paymentModes.filter((x) => x.id !== id);
}

export function savePromo(c: Ctx, p: Omit<PromoCode, "id"> & { id?: string | undefined }) {
  need(c, "ops-billing", p.id ? "edit" : "create");
  const code = p.code.trim().toUpperCase();
  if (!p.name.trim()) fail("Name is required");
  if (!/^[A-Z0-9]{3,12}$/.test(code)) fail("Code: 3–12 letters or numbers");
  if (!(p.value > 0)) fail("Enter a value");
  if (p.type === "pr" && p.value > 100) fail("A percentage cannot be above 100");
  if (c.db.settings.promoCodes.some((x) => x.id !== p.id && x.code === code))
    fail("This code already exists");
  upsert(c.db.settings.promoCodes, {
    ...p,
    code,
    name: p.name.trim(),
    id: p.id ?? nextId(c.db, "promo"),
  });
}

export function deletePromo(c: Ctx, id: string) {
  need(c, "ops-billing", "delete");
  c.db.settings.promoCodes = c.db.settings.promoCodes.filter((x) => x.id !== id);
}

export function saveKitchen(c: Ctx, k: Omit<Kitchen, "id"> & { id?: string | undefined }) {
  need(c, "ops-hardware", k.id ? "edit" : "create");
  if (!k.name.trim()) fail("Kitchen name is required");
  if (
    c.db.settings.kitchens.some(
      (x) => x.id !== k.id && x.name.toLowerCase() === k.name.trim().toLowerCase(),
    )
  )
    fail("This kitchen exists");
  upsert(c.db.settings.kitchens, { ...k, name: k.name.trim(), id: k.id ?? nextId(c.db, "kit") });
}

export function deleteKitchen(c: Ctx, id: string) {
  need(c, "ops-hardware", "delete");
  c.db.settings.kitchens = c.db.settings.kitchens.filter((x) => x.id !== id);
}

export function resetTokens(c: Ctx) {
  need(c, "ops-billing", "edit");
  c.db.tokenResetAt = iso(c);
  audit(c, "Settings", "Reset token numbers");
}

/* ------------------------------ devices ------------------------------ */

export function logoutDevice(c: Ctx, id: string) {
  need(c, "system", "edit");
  const d = c.db.devices.find((x) => x.id === id) ?? fail("Device not found");
  if (d.thisDevice) fail("Use Log out in Profile for this device");
  c.db.devices = c.db.devices.filter((x) => x.id !== id);
  c.db.outlet.devicesInUse = c.db.devices.length;
  audit(c, "Devices", `Logged out ${d.name}`);
}

export function saveDevicePrinters(
  c: Ctx,
  deviceId: string,
  printers: DevicePrinter[],
  printKots: boolean,
) {
  need(c, "ops-hardware", "edit");
  const d = c.db.devices.find((x) => x.id === deviceId) ?? fail("Device not found");
  for (const p of printers) {
    if (!p.name.trim()) fail("Every printer needs a name");
    if (p.connection === "wifi" && !/^\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/.test(p.address ?? ""))
      fail(`${p.name}: enter IP and port like 192.168.1.60:9100`);
    if (p.connection === "bluetooth" && !p.address) fail(`${p.name}: pick the Bluetooth printer`);
    if (!(p.copies >= 1 && p.copies <= 5)) fail(`${p.name}: copies must be 1 to 5`);
    if (!p.printsKot && !p.printsInvoice) fail(`${p.name}: choose KOT, bill or both`);
  }
  d.printers = printers;
  d.printKots = printKots;
  audit(c, "Printers", `Updated printers on ${d.name}`);
}

/* ------------------------------ stock ------------------------------ */

const st = (c: Ctx) => c.db.stock;

function move(
  c: Ctx,
  m: {
    kind: import("../../types").StockMovementKind;
    refKind: "raw" | "semi";
    refId: string;
    qty: number;
    value: number;
    reference: string;
  },
) {
  st(c).movements.unshift({ ...m, id: nextId(c.db, "mv"), at: iso(c), by: c.user.name });
}

export function saveUnit(c: Ctx, u: Omit<StockUnit, "id"> & { id?: string | undefined }) {
  need(c, "stock-masters", u.id ? "edit" : "create");
  if (!u.name.trim() || !u.short.trim()) fail("Name and short name are required");
  upsert(st(c).units, { ...u, id: u.id ?? nextId(c.db, "u") });
}

export function saveRaw(
  c: Ctx,
  r: Omit<RawMaterial, "id" | "stock" | "rate"> & {
    id?: string | undefined;
    openingStock?: number | undefined;
    openingRate?: number | undefined;
  },
) {
  need(c, "stock-masters", r.id ? "edit" : "create");
  if (!r.name.trim()) fail("Name is required");
  if (!(r.conversion > 0)) fail("Conversion must be more than 0");
  if (st(c).raw.some((x) => x.id !== r.id && x.name.toLowerCase() === r.name.trim().toLowerCase()))
    fail("This item already exists");
  const existing = r.id ? st(c).raw.find((x) => x.id === r.id) : undefined;
  const { openingStock, openingRate, ...rest } = r;
  const row: RawMaterial = {
    ...rest,
    name: r.name.trim(),
    id: r.id ?? nextId(c.db, "raw"),
    stock: existing?.stock ?? 0,
    rate: existing?.rate ?? openingRate ?? 0,
  };
  upsert(st(c).raw, row);
  if (!existing && openingStock) {
    row.stock = openingStock;
    move(c, {
      kind: "manual-in",
      refKind: "raw",
      refId: row.id,
      qty: openingStock,
      value: r2(openingStock * row.rate),
      reference: "Opening stock",
    });
  }
}

export function saveSupplier(
  c: Ctx,
  s: Omit<Supplier, "id" | "outstanding"> & { id?: string | undefined },
) {
  need(c, "stock-masters", s.id ? "edit" : "create");
  if (!s.name.trim()) fail("Name is required");
  if (s.phone && !MOBILE.test(s.phone)) fail("Enter a 10-digit phone");
  const existing = s.id ? st(c).suppliers.find((x) => x.id === s.id) : undefined;
  upsert(st(c).suppliers, {
    ...s,
    name: s.name.trim(),
    id: s.id ?? nextId(c.db, "sup"),
    outstanding: existing?.outstanding ?? 0,
  });
}

function poTotal(p: Pick<PurchaseOrder, "lines" | "discountType" | "discountValue">): number {
  const gross = p.lines.reduce((a, l) => a + l.qty * l.rate * (1 + (l.taxPct || 0) / 100), 0);
  const disc = !p.discountValue
    ? 0
    : p.discountType === "percent"
      ? (gross * p.discountValue) / 100
      : p.discountValue;
  return r2(Math.max(0, gross - disc));
}

function supplierOutstanding(c: Ctx, supplierId: string) {
  const s = st(c).suppliers.find((x) => x.id === supplierId);
  if (!s) return;
  s.outstanding = r2(
    st(c)
      .purchases.filter((p) => p.supplierId === supplierId)
      .reduce((a, p) => a + p.total - p.payments.reduce((b, x) => b + x.amount, 0), 0),
  );
}

/** Stock in for a PO's lines (sign +1) or back out (sign -1); weighted average cost on the way in. */
function applyPoStock(c: Ctx, p: PurchaseOrder, sign: 1 | -1): string | undefined {
  let warning: string | undefined;
  for (const l of p.lines) {
    const raw = st(c).raw.find((x) => x.id === l.rawId);
    if (!raw) continue;
    const qty = r2(l.qty * raw.conversion);
    const cost = r2(l.qty * l.rate);
    if (sign === 1) {
      const before = Math.max(0, raw.stock);
      raw.rate = before + qty > 0 ? r2((before * raw.rate + cost) / (before + qty)) : raw.rate;
    }
    raw.stock = r2(raw.stock + sign * qty);
    if (raw.stock < 0) warning = `${raw.name} goes negative (${raw.stock})`;
    move(c, {
      kind: "purchase",
      refKind: "raw",
      refId: raw.id,
      qty: sign * qty,
      value: sign * cost,
      reference: `PO ${p.poNo}`,
    });
  }
  return warning;
}

function paymentSideEffects(c: Ctx, p: PurchaseOrder, pay: PurchasePayment, sign: 1 | -1) {
  const supplier = st(c).suppliers.find((x) => x.id === p.supplierId)?.name ?? "Supplier";
  if (pay.asExpense) {
    if (sign === 1) {
      c.db.expenses.unshift({
        id: `ex-po-${pay.id}`,
        headId: "eh-supplier",
        amount: pay.amount,
        modeId: pay.modeId,
        note: `${supplier} · PO ${p.poNo}${pay.ref ? ` · ${pay.ref}` : ""}`,
        at: iso(c),
        by: c.user.name,
        fromPurchase: true,
        fromDrawer: pay.fromDrawer,
      });
    } else c.db.expenses = c.db.expenses.filter((x) => x.id !== `ex-po-${pay.id}`);
  }
  if (pay.modeId === "cash" && pay.fromDrawer)
    recordCash(c, sign * pay.amount, `${supplier} · PO ${p.poNo}`, "supplier");
}

export function savePurchase(
  c: Ctx,
  input: Omit<PurchaseOrder, "id" | "poNo" | "total" | "payments" | "by"> & {
    id?: string | undefined;
    firstPayment?:
      { amount: number; modeId: string; ref?: string | undefined; fromDrawer: boolean } | undefined;
  },
): { warning?: string | undefined } {
  need(c, "stock-transactions", input.id ? "edit" : "create");
  if (!st(c).suppliers.some((s) => s.id === input.supplierId)) fail("Pick a supplier");
  if (!input.lines.length) fail("Add at least one item");
  for (const l of input.lines) {
    if (!st(c).raw.some((r) => r.id === l.rawId)) fail("Pick an item for every line");
    if (!(l.qty > 0)) fail("Quantity must be more than 0");
    if (!(l.rate >= 0)) fail("Enter a rate");
  }
  const existing = input.id ? st(c).purchases.find((x) => x.id === input.id) : undefined;
  let warning: string | undefined;
  if (existing) warning = applyPoStock(c, existing, -1);
  const { firstPayment, ...rest } = input;
  const po: PurchaseOrder = {
    ...rest,
    id: existing?.id ?? nextId(c.db, "po"),
    poNo: existing?.poNo ?? `PO-${String(st(c).purchases.length + 1).padStart(4, "0")}`,
    total: poTotal(input),
    payments: existing?.payments ?? [],
    by: existing?.by ?? c.user.name,
  };
  const paid = po.payments.reduce((a, x) => a + x.amount, 0);
  if (paid > po.total) fail(`Already paid ₹${paid}, which is more than the new total`);
  upsert(st(c).purchases, po);
  warning = applyPoStock(c, po, 1) ?? warning;
  if (!existing && firstPayment && firstPayment.amount > 0)
    addPurchasePayment(c, po.id, { ...firstPayment, date: businessDate(c.now, "00:00") });
  supplierOutstanding(c, po.supplierId);
  audit(c, "Stock", `${existing ? "Edited" : "Received"} ${po.poNo} · ₹${po.total}`);
  return { warning };
}

export function deletePurchase(c: Ctx, id: string): { warning?: string | undefined } {
  need(c, "stock-transactions", "delete");
  const po = st(c).purchases.find((x) => x.id === id) ?? fail("Purchase not found");
  for (const pay of po.payments) paymentSideEffects(c, po, pay, -1);
  const warning = applyPoStock(c, po, -1);
  st(c).purchases = st(c).purchases.filter((x) => x.id !== id);
  supplierOutstanding(c, po.supplierId);
  audit(c, "Stock", `Deleted ${po.poNo}`);
  return { warning };
}

export function addPurchasePayment(
  c: Ctx,
  poId: string,
  p: Omit<PurchasePayment, "id" | "by" | "asExpense">,
) {
  need(c, "stock-transactions", "edit");
  const po = st(c).purchases.find((x) => x.id === poId) ?? fail("Purchase not found");
  if (!(p.amount > 0)) fail("Enter an amount");
  const paid = po.payments.reduce((a, x) => a + x.amount, 0);
  if (r2(paid + p.amount) > po.total) fail(`Only ₹${r2(po.total - paid)} is left to pay`);
  const pay: PurchasePayment = {
    ...p,
    id: nextId(c.db, "pp"),
    by: c.user.name,
    asExpense: c.db.settings.supplierPaymentsAsExpense,
    fromDrawer: p.modeId === "cash" && p.fromDrawer,
  };
  po.payments.push(pay);
  paymentSideEffects(c, po, pay, 1);
  supplierOutstanding(c, po.supplierId);
}

export function deletePurchasePayment(c: Ctx, poId: string, paymentId: string) {
  need(c, "stock-transactions", "delete");
  const po = st(c).purchases.find((x) => x.id === poId) ?? fail("Purchase not found");
  const pay = po.payments.find((x) => x.id === paymentId) ?? fail("Payment not found");
  if (
    pay.modeId === "cash" &&
    pay.fromDrawer &&
    (!c.db.cashSession || c.db.cashSession.openedAt > `${pay.date}T23:59:59`)
  )
    fail("This cash was paid from a closed cash session and cannot be deleted");
  paymentSideEffects(c, po, pay, -1);
  po.payments = po.payments.filter((x) => x.id !== paymentId);
  supplierOutstanding(c, po.supplierId);
}

export function stockEntry(
  c: Ctx,
  e: {
    kind: "in" | "out" | "count";
    refKind: "raw" | "semi";
    refId: string;
    qty: number;
    rate?: number | undefined;
    note: string;
  },
) {
  need(c, "stock-transactions", "create");
  if (!(e.qty >= 0) || (e.kind !== "count" && !(e.qty > 0))) fail("Enter a quantity");
  if (!e.note.trim() && e.kind !== "in") fail("Add a note");
  const row =
    e.refKind === "raw"
      ? st(c).raw.find((x) => x.id === e.refId)
      : st(c).semi.find((x) => x.id === e.refId);
  if (!row) fail("Pick an item");
  const rate = "rate" in row! ? row.rate : 0;
  if (e.kind === "count") {
    const diff = r2(e.qty - row!.stock);
    row!.stock = e.qty;
    move(c, {
      kind: "adjustment",
      refKind: e.refKind,
      refId: e.refId,
      qty: diff,
      value: r2(diff * rate),
      reference: e.note.trim() || "Stock count",
    });
  } else {
    const q = e.kind === "in" ? e.qty : -e.qty;
    if (e.kind === "in" && e.rate !== undefined && "rate" in row!) {
      const before = Math.max(0, row.stock);
      row.rate =
        before + e.qty > 0 ? r2((before * row.rate + e.qty * e.rate) / (before + e.qty)) : row.rate;
    }
    row!.stock = r2(row!.stock + q);
    move(c, {
      kind: e.kind === "in" ? "manual-in" : "manual-out",
      refKind: e.refKind,
      refId: e.refId,
      qty: q,
      value: r2(q * rate),
      reference: e.note.trim() || "Stock in",
    });
  }
}

export function recordWastage(
  c: Ctx,
  w: { refKind: "raw" | "semi"; refId: string; qty: number; reason: string },
) {
  need(c, "stock-transactions", "create");
  if (!(w.qty > 0)) fail("Enter a quantity");
  if (!w.reason.trim()) fail("Add a reason");
  const row =
    w.refKind === "raw"
      ? st(c).raw.find((x) => x.id === w.refId)
      : st(c).semi.find((x) => x.id === w.refId);
  if (!row) fail("Pick an item");
  const cost = r2(w.qty * ("rate" in row! ? row.rate : 0));
  row!.stock = r2(row!.stock - w.qty);
  st(c).wastage.unshift({
    id: nextId(c.db, "wst"),
    refKind: w.refKind,
    refId: w.refId,
    qty: w.qty,
    reason: w.reason.trim(),
    at: iso(c),
    by: c.user.name,
    cost,
  });
  move(c, {
    kind: "wastage",
    refKind: w.refKind,
    refId: w.refId,
    qty: -w.qty,
    value: -cost,
    reference: w.reason.trim(),
  });
}

export function deleteWastage(c: Ctx, id: string) {
  need(c, "stock-transactions", "delete");
  const w = st(c).wastage.find((x) => x.id === id) ?? fail("Not found");
  const row =
    w.refKind === "raw"
      ? st(c).raw.find((x) => x.id === w.refId)
      : st(c).semi.find((x) => x.id === w.refId);
  if (row) row.stock = r2(row.stock + w.qty);
  st(c).wastage = st(c).wastage.filter((x) => x.id !== id);
  move(c, {
    kind: "adjustment",
    refKind: w.refKind,
    refId: w.refId,
    qty: w.qty,
    value: w.cost,
    reference: "Wastage entry deleted",
  });
}

export function saveRecipe(c: Ctx, r: Omit<Recipe, "id"> & { id?: string | undefined }) {
  need(c, "stock-recipes", r.id ? "edit" : "create");
  if (!c.db.items.some((i) => i.id === r.itemId)) fail("Pick a menu item");
  const all = [...r.base, ...Object.values(r.byVariant).flat(), ...Object.values(r.byAddon).flat()];
  if (all.some((l) => !(l.qty > 0))) fail("Every ingredient needs a quantity");
  const existing = st(c).recipes.find((x) => x.itemId === r.itemId && x.id !== r.id);
  if (existing) fail("This item already has a recipe — edit that one");
  upsert(st(c).recipes, { ...r, id: r.id ?? nextId(c.db, "rcp") });
}

export function saveSemi(
  c: Ctx,
  s: Omit<SemiFinished, "id" | "stock"> & { id?: string | undefined },
) {
  need(c, "stock-recipes", s.id ? "edit" : "create");
  if (!s.name.trim()) fail("Name is required");
  if (!s.components.length) fail("Add at least one ingredient");
  const existing = s.id ? st(c).semi.find((x) => x.id === s.id) : undefined;
  upsert(st(c).semi, {
    ...s,
    name: s.name.trim(),
    id: s.id ?? nextId(c.db, "semi"),
    stock: existing?.stock ?? 0,
  });
}

/** Produce a semi-finished batch: its raw components come out of stock. */
export function produceSemi(c: Ctx, semiId: string, qty: number, note?: string) {
  need(c, "stock-transactions", "create");
  if (!(qty > 0)) fail("Enter a quantity");
  const semi = st(c).semi.find((x) => x.id === semiId) ?? fail("Pick an item");
  for (const comp of semi.components) {
    if (comp.kind !== "raw") continue;
    const raw = st(c).raw.find((x) => x.id === comp.refId);
    if (!raw) continue;
    const used = r2(comp.qty * qty);
    raw.stock = r2(raw.stock - used);
    move(c, {
      kind: "production-out",
      refKind: "raw",
      refId: raw.id,
      qty: -used,
      value: r2(-used * raw.rate),
      reference: `Made ${qty} ${semi.name}`,
    });
  }
  semi.stock = r2(semi.stock + qty);
  move(c, {
    kind: "production-in",
    refKind: "semi",
    refId: semi.id,
    qty,
    value: 0,
    reference: note?.trim() || "Production",
  });
}
