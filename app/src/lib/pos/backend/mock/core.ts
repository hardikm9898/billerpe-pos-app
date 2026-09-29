import { billTotals, checkPayments, orderLines } from "../../bill";
import { can, canSpecial, effectivePermissions } from "../../permissions";
import { routeToKitchens } from "../../routing";
import type {
  DraftLine,
  Kot,
  Order,
  OrderDiscount,
  OrderLine,
  OrderType,
  Payment,
  PermissionModule,
  PosAlert,
  PosTable,
  SpecialPermission,
  Staff,
  StandardAction,
  TokenScope,
} from "../../types";
import type {
  CartPayload,
  KotResult,
  PrintBillResult,
  SettledEdit,
  SettledEditResult,
} from "../types";
import { businessDate, nextId, r2, type MockDb } from "./db";

// The order rules of the cloud, run synchronously against the mock DB.
// Every function throws RuleError with a staff-facing message when an
// action is not allowed; server.ts turns that into { ok: false, error }.
// These mirror the exe (billerpe-local-exe) - see each comment for the rule.

export class RuleError extends Error {}

export interface Ctx {
  db: MockDb;
  user: Staff;
  /** Clock - seeding runs actions "in the past". */
  now: Date;
}

const fail = (msg: string): never => {
  throw new RuleError(msg);
};

export function perms(c: Ctx) {
  return effectivePermissions(c.user, c.db.roleDefaults);
}

export function need(c: Ctx, module: PermissionModule, action: StandardAction = "view") {
  if (!can(perms(c), module, action)) fail("You don't have permission to do this. Ask the owner.");
}

export function needSpecial(c: Ctx, key: SpecialPermission) {
  if (!canSpecial(perms(c), key)) fail("You don't have permission to do this. Ask the owner.");
}

export const iso = (c: Ctx) => c.now.toISOString();
export const bday = (c: Ctx, at: Date = c.now) => businessDate(at, c.db.settings.businessDayStart);

export function audit(c: Ctx, module: string, action: string) {
  c.db.audit.unshift({
    id: nextId(c.db, "au"),
    at: iso(c),
    by: c.user.name,
    role: c.user.role,
    module,
    action,
  });
}

export function alert(c: Ctx, a: Omit<PosAlert, "id" | "at" | "read">) {
  c.db.alerts.unshift({ ...a, id: nextId(c.db, "alr"), at: iso(c), read: false });
}

/**
 * Owner alerts (owner list 2026-09-29 #10; cloud appv1/ownerAlerts.js): only
 * to Owners, only when switched on in Settings, never for the owner's own act.
 */
export function ownerAlert(
  c: Ctx,
  key: "cancelAfterKot" | "bigDiscount" | "cashDifference",
  a: { title: string; body: string; link?: string | undefined },
) {
  if (c.user.isOwner || !c.db.settings.ownerAlerts[key]) return;
  alert(c, {
    kind: "owner-alert",
    title: a.title,
    body: `${a.body} · by ${c.user.name}`,
    link: a.link,
    forRoles: ["Owner"],
  });
}

/** A settled bill whose discount is above the owner's limit (% of the subtotal). */
function discountAlert(c: Ctx, o: Order, edited = false) {
  const { subtotal, discount } = o.totals;
  if (!(discount > 0) || !(subtotal > 0)) return;
  const pct = r2((discount / subtotal) * 100);
  if (pct <= c.db.settings.ownerAlerts.discountPct) return;
  ownerAlert(c, "bigDiscount", {
    title: `Big discount · bill ${o.billNo}`,
    body: `${pct}% off (₹${discount.toFixed(2)} of ₹${subtotal.toFixed(2)})${edited ? " · settled bill edited" : ""}${o.discount?.reason ? ` · ${o.discount.reason}` : ""}`,
    link: `/orders/${o.id}`,
  });
}

function event(c: Ctx, o: Order, label: string) {
  o.timeline.push({ at: iso(c), label, by: c.user.name });
}

export function tableById(c: Ctx, id: string | undefined): PosTable | undefined {
  return id ? c.db.tables.find((t) => t.id === id) : undefined;
}

export function orderById(c: Ctx, id: string): Order {
  return (
    c.db.orders.find((o) => o.id === id) ??
    fail("This order is no longer open. Refresh and try again.")
  );
}

export const isOpen = (o: Order) =>
  o.status === "running" || o.status === "hold" || o.status === "billed";

export function openOrderOnTable(c: Ctx, tableId: string): Order | undefined {
  return c.db.orders.find((o) => o.tableId === tableId && isOpen(o));
}

/** Server-side totals: the ONE bill engine, persisted on every change. */
export function recompute(c: Ctx, o: Order) {
  o.totals = billTotals(
    {
      type: o.type,
      sectionId: tableById(c, o.tableId)?.sectionId,
      lines: orderLines(o),
      discount: o.discount,
      serviceOverride: o.serviceOverride,
    },
    c.db.settings,
  );
}

/* ------------------------------ numbering ------------------------------ */

function fyStart(at: Date, startMonth: number): Date {
  const y = at.getMonth() + 1 >= startMonth ? at.getFullYear() : at.getFullYear() - 1;
  return new Date(y, startMonth - 1, 1);
}

/**
 * Bill numbers are given when the order is created, one sequence for every
 * order type, reset never / daily / per financial year (exe
 * helpers/localBillNumber.js). Never re-issued.
 */
function nextBillNo(c: Ctx): string {
  const s = c.db.settings;
  let pool = c.db.orders;
  if (s.billReset === "daily") pool = pool.filter((o) => o.businessDate === bday(c));
  if (s.billReset === "financial_year") {
    const start = fyStart(c.now, s.financialYearStartMonth).getTime();
    pool = pool.filter((o) => new Date(o.createdAt).getTime() >= start);
  }
  const max = pool.reduce((m, o) => Math.max(m, Number(o.billNo) || 0), 0);
  return String(max + 1);
}

export function tokenApplies(scope: TokenScope, type: OrderType): boolean {
  return scope === "both" || scope === type;
}

/** Daily token 1, 2, 3... per business day, restarting on manual reset (exe model/orderHooks.js). */
function nextToken(c: Ctx, type: OrderType): number {
  if (!tokenApplies(c.db.settings.tokens.tokenFor, type)) return 0;
  const today = bday(c);
  const reset = c.db.tokenResetAt;
  const max = c.db.orders
    .filter((o) => o.businessDate === today && (!reset || o.createdAt > reset))
    .reduce((m, o) => Math.max(m, o.token), 0);
  return max + 1;
}

/** The KOT number is the round within the order (OrderDetails.kotNumber, as on every printed KOT). */
function nextKotNo(o: Order): number {
  return o.kots.reduce((m, k) => Math.max(m, k.kotNo), 0) + 1;
}

// exe controller/table.js#destinationProblem, word for word.
const HELD_MERGE_MESSAGE =
  "A held order can't be merged. Transfer it to a free table instead - it stays on hold there.";
function destinationProblem(source: Order, target: Order | undefined): string | null {
  if (!target || target.id === source.id) return null;
  if (target.status === "billed")
    return "The bill for the destination table is already generated - pick another table.";
  if (source.status === "hold") return HELD_MERGE_MESSAGE;
  if (target.status === "hold")
    return "The destination table is on hold - held orders can't be merged. Pick another table.";
  return null;
}

/* ------------------------------ lines ------------------------------ */

function checkLines(c: Ctx, lines: DraftLine[]) {
  if (lines.length === 0) fail("Add at least one item");
  for (const l of lines) {
    if (!(l.qty > 0)) fail(`${l.name}: quantity must be more than 0`);
    if (Math.round(l.qty * 100) !== l.qty * 100)
      fail(`${l.name}: quantity can have at most 2 decimals`);
    if (l.custom) {
      if (!l.name.trim()) fail("A custom item needs a name");
      if (!(l.price > 0)) fail(`${l.name}: enter a price`);
      continue;
    }
    const item = c.db.items.find((i) => i.id === l.itemId);
    if (!item || !item.active) fail(`${l.name} is no longer on the menu`);
    if (item!.outOfStock) fail(`${l.name} is out of stock`);
  }
}

function toOrderLine(c: Ctx, l: DraftLine): OrderLine {
  return {
    id: nextId(c.db, "ln"),
    itemId: l.itemId,
    name: l.name.trim(),
    categoryId: l.categoryId,
    dietary: l.dietary,
    variantId: l.variantId,
    variantName: l.variantName,
    addons: l.addons,
    note: l.note?.trim() || undefined,
    price: l.price,
    qty: l.qty,
    custom: l.custom,
    routeKitchenId: l.routeKitchenId,
    routePrinterId: l.routePrinterId,
    status: "sent",
    firedById: c.user.id,
  };
}

/* ------------------------------ orders ------------------------------ */

function createOrder(c: Ctx, cart: Omit<CartPayload, "lines" | "clientKey" | "orderId">): Order {
  if (cart.type === "dinin") {
    const table = tableById(c, cart.tableId) ?? fail("Pick a table for a dine-in order");
    if (openOrderOnTable(c, table.id))
      fail(`${table.name} already has an order. Refresh the tables.`);
  }
  const o: Order = {
    id: nextId(c.db, "ord"),
    billNo: nextBillNo(c),
    token: nextToken(c, cart.type),
    type: cart.type,
    tableId: cart.type === "dinin" ? cart.tableId : undefined,
    guests: cart.type === "dinin" ? Math.max(1, cart.guests || 1) : 0,
    customerName: cart.customerName?.trim() || undefined,
    customerMobile: cart.customerMobile?.trim() || undefined,
    menuId: cart.menuId,
    captainId: c.user.id,
    captainName: c.user.name,
    status: "running",
    createdAt: iso(c),
    businessDate: bday(c),
    kots: [],
    heldLines: [],
    totals: {
      subtotal: 0,
      discount: 0,
      service: 0,
      packaging: 0,
      taxLines: [],
      tax: 0,
      roundOff: 0,
      grand: 0,
      items: 0,
    },
    payments: [],
    timeline: [],
  };
  c.db.orders.push(o);
  event(c, o, `Order created · bill ${o.billNo}${o.token ? ` · token ${o.token}` : ""}`);
  // A reservation holding this table is fulfilled when an order starts on it.
  if (o.tableId) {
    const r = c.db.reservations.find(
      (x) =>
        x.status === "booked" &&
        x.tableIds.includes(o.tableId!) &&
        reservationHolding(c, x.at, x.endAt),
    );
    if (r) r.status = "seated";
  }
  return o;
}

export function reservationHolding(c: Ctx, at: string, endAt: string): boolean {
  const now = c.now.getTime();
  const start = new Date(at).getTime();
  return (
    now >= start - 30 * 60000 && now <= Math.min(start + 30 * 60000, new Date(endAt).getTime())
  );
}

/** Find the order a cart belongs to: its own id, or (two devices, one table) the table's open order. */
function orderForCart(c: Ctx, cart: CartPayload): Order | undefined {
  if (cart.orderId) {
    const o = orderById(c, cart.orderId);
    if (o.status === "settled") fail(`Bill ${o.billNo} is already settled`);
    if (o.status === "cancelled") fail(`Bill ${o.billNo} was cancelled`);
    return o;
  }
  if (cart.type === "dinin" && cart.tableId) return openOrderOnTable(c, cart.tableId);
  return undefined;
}

function applyCartMeta(c: Ctx, o: Order, cart: CartPayload) {
  if (cart.type === "dinin" && cart.guests > 0) o.guests = cart.guests;
  if (cart.customerName?.trim() || cart.customerMobile?.trim())
    setCustomer(c, o.id, {
      name: cart.customerName ?? o.customerName ?? "",
      mobile: cart.customerMobile ?? o.customerMobile ?? "",
      address: cart.customerAddress ?? o.customerAddress,
      gstin: cart.customerGstin ?? o.customerGstin,
    });
  if (cart.menuId) o.menuId = cart.menuId;
}

/**
 * Send KOT. The table turns Running only now (owner rule: opening a table or
 * a cart on a phone never changes it). The cart REPLACES any held lines -
 * the device loaded them into its cart when the held order was opened.
 */
export function sendKot(c: Ctx, cart: CartPayload, opts: { toKds?: boolean } = {}): KotResult {
  need(c, "biller", "create");
  checkLines(c, cart.lines);
  const o = orderForCart(c, cart) ?? createOrder(c, cart);
  applyCartMeta(c, o, cart);
  const lines = cart.lines.map((l) => toOrderLine(c, l));
  const table = tableById(c, o.tableId);
  const kitchens =
    opts.toKds === false ? [] : routeToKitchens(c.db.settings.kitchens, lines, o.type, table);
  const kot: Kot = {
    kotNo: nextKotNo(o),
    round: nextKotNo(o),
    firedAt: iso(c),
    firedById: c.user.id,
    firedByName: c.user.name,
    lines,
    kitchenIds: kitchens.map((k) => k.kitchen.id),
  };
  o.kots.push(kot);
  o.heldLines = [];
  // New items after the bill was printed reopen it: the bill must be printed again.
  o.status = "running";
  recompute(c, o);
  event(
    c,
    o,
    `KOT #${kot.kotNo} (round ${kot.round}) · ${lines.length} item${lines.length === 1 ? "" : "s"}`,
  );
  audit(c, "Orders", `KOT #${kot.kotNo} sent for bill ${o.billNo}`);
  if (o.type === "pickup") deductForLines(c, o, lines);
  return {
    orderId: o.id,
    billNo: o.billNo,
    token: o.token,
    kot,
    kitchens: kitchens.map((k) => k.kitchen.name),
  };
}

/** Hold: save the cart on the server without sending it to the kitchen. */
export function holdOrder(c: Ctx, cart: CartPayload): { orderId: string; billNo: string } {
  need(c, "biller", "create");
  checkLines(c, cart.lines);
  const o = orderForCart(c, cart) ?? createOrder(c, cart);
  if (o.status === "billed") fail("The bill is already printed. Send new items as a KOT instead.");
  applyCartMeta(c, o, cart);
  o.heldLines = cart.lines.map((l) => ({ ...toOrderLine(c, l), firedById: undefined }));
  o.status = "hold";
  recompute(c, o);
  event(c, o, `Held · ${o.heldLines.length} item${o.heldLines.length === 1 ? "" : "s"} not sent`);
  audit(c, "Orders", `Held bill ${o.billNo}`);
  return { orderId: o.id, billNo: o.billNo };
}

export function setGuests(c: Ctx, orderId: string, guests: number) {
  need(c, "biller", "edit");
  const o = orderById(c, orderId);
  if (!isOpen(o)) fail("This order is closed");
  if (!Number.isInteger(guests) || guests < 1) fail("Guests must be at least 1");
  o.guests = guests;
  event(c, o, `Guests: ${guests}`);
}

// Web POS customer-details-dialog.tsx GSTIN_PATTERN.
export const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function setCustomer(
  c: Ctx,
  orderId: string,
  cust: { name: string; mobile: string; address?: string | undefined; gstin?: string | undefined },
) {
  need(c, "biller", "edit");
  const o = orderById(c, orderId);
  const mobile = (cust.mobile ?? "").trim();
  const gstin = (cust.gstin ?? "").trim().toUpperCase();
  if (mobile && !/^\d{10}$/.test(mobile)) fail("Enter a 10-digit mobile number");
  if (gstin && !GSTIN.test(gstin)) fail("Enter a valid 15-character GSTIN");
  o.customerName = cust.name.trim() || undefined;
  o.customerMobile = mobile || undefined;
  o.customerAddress = cust.address?.trim() || undefined;
  o.customerGstin = gstin || undefined;
  // The outlet's customer list learns the details (suggestions next time).
  if (mobile) {
    const known = c.db.customers.find((x) => x.mobile === mobile);
    if (known) {
      if (o.customerName) known.name = o.customerName;
      if (o.customerAddress) known.address = o.customerAddress;
      if (o.customerGstin) known.gstin = o.customerGstin;
    } else
      c.db.customers.push({
        id: `cus-${Date.now()}`,
        name: o.customerName ?? "",
        mobile,
        address: o.customerAddress,
        gstin: o.customerGstin,
        visits: 0,
        totalSpent: 0,
        dueOutstanding: 0,
      });
  }
}

/**
 * Remove one line. A held line: anyone who can bill. A fired line: only the
 * staff who fired it, or a Manager/Owner, and never once it is served
 * (exe controller/kot.js#removeKotLine). A reason is always recorded.
 */
export function removeLine(c: Ctx, orderId: string, lineId: string, reason: string) {
  need(c, "biller", "edit");
  const o = orderById(c, orderId);
  if (!isOpen(o)) fail("This order is closed");
  if (!reason.trim()) fail("Add a reason");
  const held = o.heldLines.find((l) => l.id === lineId);
  if (held) {
    o.heldLines = o.heldLines.filter((l) => l.id !== lineId);
    event(c, o, `Removed held ${held.qty}× ${held.name} — ${reason.trim()}`);
  } else {
    const kot = o.kots.find((k) => k.lines.some((l) => l.id === lineId)) ?? fail("Item not found");
    const line = kot.lines.find((l) => l.id === lineId)!;
    if (line.status === "served") fail("This item is already served and cannot be removed");
    const boss = c.user.role === "Owner" || c.user.role === "Manager" || c.user.isOwner;
    if (!boss && line.firedById !== c.user.id)
      fail(`Only ${kot.firedByName} (who sent it) or a Manager/Owner can remove this item`);
    kot.lines = kot.lines.filter((l) => l.id !== lineId);
    if (kot.lines.length === 0) o.kots = o.kots.filter((k) => k !== kot);
    event(c, o, `Removed ${line.qty}× ${line.name} from KOT #${kot.kotNo} — ${reason.trim()}`);
    ownerAlert(c, "cancelAfterKot", {
      title: `Item removed after KOT · bill ${o.billNo}`,
      body: `${line.qty}× ${line.name} (KOT #${kot.kotNo}) · ${reason.trim()}`,
      link: `/orders/${o.id}`,
    });
  }
  recompute(c, o);
  audit(c, "Orders", `Removed an item from bill ${o.billNo} — ${reason.trim()}`);
}

export function markServed(c: Ctx, orderId: string, kotNo: number) {
  need(c, "biller", "edit");
  const o = orderById(c, orderId);
  const kot = o.kots.find((k) => k.kotNo === kotNo) ?? fail("KOT not found");
  for (const l of kot.lines) l.status = "served";
  event(c, o, `KOT #${kotNo} served`);
}

function billFloor(c: Ctx, o: Order) {
  if (!isOpen(o)) fail("This order is closed");
  if (o.kots.length === 0 && o.heldLines.length === 0) fail("Nothing to bill yet");
}

/**
 * Items never sent to the kitchen, on a bill (Web POS "Save" / "Bill Print"
 * / Settle without a KOT): they go on the order as their own round that no
 * kitchen screen shows. Returned for printing as a KOT with the bill only
 * when the outlet's Bill-with-KOT setting covers this order type.
 */
function billUnsent(c: Ctx, o: Order): OrderLine[] {
  if (!o.heldLines.length) return [];
  const r = sendKot(
    c,
    {
      orderId: o.id,
      type: o.type,
      tableId: o.tableId,
      guests: o.guests,
      menuId: o.menuId,
      lines: o.heldLines.map((l) => ({ ...l, key: l.id })),
      clientKey: `bwk-${o.id}-${Date.now()}`,
    },
    { toKds: false },
  );
  return tokenApplies(c.db.settings.tokens.billWithKot, o.type) ? r.kot.lines : [];
}

/**
 * Bill straight from a phone's cart, without a KOT first (Web POS): the
 * cart's items are saved on the order (a new order if needed) and the bill
 * is generated in the same step.
 */
export function billCart(c: Ctx, cart: CartPayload, request = false): PrintBillResult {
  need(c, "biller", "create");
  checkLines(c, cart.lines);
  const o = orderForCart(c, cart) ?? createOrder(c, cart);
  applyCartMeta(c, o, cart);
  o.heldLines = cart.lines.map((l) => ({ ...toOrderLine(c, l), firedById: undefined }));
  recompute(c, o);
  if (request) {
    requestBill(c, o.id);
    return { order: o, kotLines: [], printToken: false };
  }
  return printBill(c, o.id);
}

/**
 * Generate the bill: order + table become "Bill generated" and the table's
 * QR can no longer add items. Items never sent (held) go on the bill without
 * a KOT; with Bill-with-KOT on they print as a KOT with the bill on the
 * invoice printer - never on a KDS.
 */
export function printBill(c: Ctx, orderId: string, byRequest = false): PrintBillResult {
  need(c, "biller", byRequest ? "edit" : "create");
  const o = orderById(c, orderId);
  billFloor(c, o);
  const kotLines = billUnsent(c, o);
  o.status = "billed";
  o.billPrintedAt = iso(c);
  recompute(c, o);
  event(c, o, byRequest ? "Bill requested at the counter" : "Bill printed");
  return {
    order: o,
    kotLines,
    printToken: o.token > 0 && tokenApplies(c.db.settings.tokens.billWithToken, o.type),
  };
}

/** A captain without billing rights asks the counter: the bill is generated there. */
export function requestBill(c: Ctx, orderId: string) {
  const o = orderById(c, orderId);
  printBill(c, orderId, true);
  const table = tableById(c, o.tableId);
  alert(c, {
    kind: "bill-requested",
    title: `Bill requested · ${table?.name ?? `Token ${o.token}`}`,
    body: `Bill ${o.billNo} · ${o.totals.grand.toFixed(2)} · by ${c.user.name}`,
    link: `/bill/${o.id}`,
    forRoles: ["Cashier", "Manager", "Owner"],
  });
}

export function cancelOrder(c: Ctx, orderId: string, reason: string) {
  needSpecial(c, "orders.deleteOrder");
  const o = orderById(c, orderId);
  if (!isOpen(o)) fail("Only an open order can be cancelled");
  if (!reason.trim()) fail("Add a reason for cancelling");
  o.status = "cancelled";
  o.cancelReason = reason.trim();
  event(c, o, `Cancelled — ${reason.trim()}`);
  audit(c, "Orders", `Cancelled bill ${o.billNo} — ${reason.trim()}`);
  if (o.kots.length)
    ownerAlert(c, "cancelAfterKot", {
      title: `Order cancelled after KOT · bill ${o.billNo}`,
      body: `${tableById(c, o.tableId)?.name ?? `Token ${o.token}`} · ₹${o.totals.grand.toFixed(2)} · ${reason.trim()}`,
      link: `/orders/${o.id}`,
    });
}

/** Transfer to a free table; a held order stays Hold (owner rule). */
export function transferTable(c: Ctx, orderId: string, toTableId: string) {
  needSpecial(c, "tables.mergeTransfer");
  const o = orderById(c, orderId);
  if (!isOpen(o) || o.type !== "dinin") fail("Only an open dine-in order can move");
  if (o.status === "billed")
    fail("Bill already generated for this order - it can no longer be moved or merged");
  const to = tableById(c, toTableId) ?? fail("Table not found");
  if (openOrderOnTable(c, to.id)) fail(`${to.name} is not free — use Merge instead`);
  const from = tableById(c, o.tableId);
  o.tableId = to.id;
  recompute(c, o);
  event(c, o, `Moved ${from?.name ?? ""} → ${to.name}`);
  audit(c, "Tables", `Transferred bill ${o.billNo} to ${to.name}`);
}

/** Merge: a held order is never part of a merge, neither side (owner rule). */
export function mergeTables(c: Ctx, fromTableId: string, toTableId: string) {
  needSpecial(c, "tables.mergeTransfer");
  const from = openOrderOnTable(c, fromTableId) ?? fail("The first table has no order");
  const to = openOrderOnTable(c, toTableId) ?? fail("The second table has no order");
  if (from.id === to.id) fail("Pick a different table");
  if (from.status === "billed")
    fail("Bill already generated for this order - it can no longer be moved or merged");
  const problem = destinationProblem(from, to);
  if (problem) fail(problem);
  // The merged rounds continue after the table's own (exe moveTable).
  const offset = nextKotNo(to) - 1;
  to.kots.push(
    ...from.kots.map((k) => ({ ...k, kotNo: k.kotNo + offset, round: k.round + offset })),
  );
  to.heldLines.push(...from.heldLines);
  to.guests += from.guests;
  recompute(c, to);
  c.db.orders = c.db.orders.filter((x) => x.id !== from.id);
  const a = tableById(c, fromTableId)?.name;
  const b = tableById(c, toTableId)?.name;
  event(c, to, `Merged ${a} (bill ${from.billNo}) into ${b}`);
  audit(c, "Tables", `Merged ${a} into ${b}`);
}

/** Move one KOT round to another table: joins its order, or starts a new one (exe moveKot). */
export function moveKot(c: Ctx, orderId: string, kotNo: number, toTableId: string) {
  needSpecial(c, "tables.mergeTransfer");
  const o = orderById(c, orderId);
  if (!isOpen(o)) fail("This order is closed");
  if (o.status === "billed")
    fail("Bill already generated for this order - its KOT rounds can no longer be moved");
  const kot = o.kots.find((k) => k.kotNo === kotNo) ?? fail("KOT not found");
  // Only what is still with the kitchen moves; served food stays (exe moveKot).
  const moving = kot.lines.filter((l) => l.status !== "served");
  if (!moving.length) fail("KOT not found");
  const to = tableById(c, toTableId) ?? fail("Table not found");
  if (to.id === o.tableId) fail("Pick a different table");
  let target = openOrderOnTable(c, to.id);
  const problem = destinationProblem(o, target);
  if (problem) fail(problem);
  if (!target) {
    target = createOrder(c, { type: "dinin", tableId: to.id, guests: 1, menuId: o.menuId });
  }
  const newNo = nextKotNo(target);
  kot.lines = kot.lines.filter((l) => l.status === "served");
  if (!kot.lines.length) o.kots = o.kots.filter((k) => k !== kot);
  target.kots.push({ ...kot, kotNo: newNo, round: newNo, lines: moving });
  target.status = "running";
  recompute(c, o);
  recompute(c, target);
  event(c, o, `KOT #${kotNo} moved to ${to.name}`);
  event(
    c,
    target,
    `KOT #${newNo} moved in from ${tableById(c, o.tableId)?.name ?? "another order"}`,
  );
  // Nothing left on the old order: it goes away, the table frees up.
  if (o.kots.length === 0 && o.heldLines.length === 0)
    c.db.orders = c.db.orders.filter((x) => x.id !== o.id);
  audit(c, "Tables", `Moved KOT #${kotNo} to ${to.name}`);
}

export function setDiscount(
  c: Ctx,
  orderId: string,
  d: { type: "fix" | "pr"; value: number; reason: string } | null,
) {
  need(c, "biller", "edit");
  const o = orderById(c, orderId);
  if (!isOpen(o)) fail("This bill is closed");
  if (d) {
    if (!(d.value > 0)) fail("Enter a discount");
    if (d.type === "pr" && d.value > 100) fail("A discount cannot be above 100%");
    if (d.type === "fix" && d.value > o.totals.subtotal)
      fail("A discount cannot be more than the bill");
    if (!d.reason.trim()) fail("Add a reason for the discount");
    o.discount = { type: d.type, value: d.value, reason: d.reason.trim() };
    o.promoCode = undefined;
    event(c, o, `Discount ${d.type === "pr" ? `${d.value}%` : `₹${d.value}`} — ${d.reason.trim()}`);
  } else {
    o.discount = undefined;
    o.promoCode = undefined;
    event(c, o, "Discount removed");
  }
  recompute(c, o);
  audit(
    c,
    "Billing",
    `Discount on bill ${o.billNo}: ${d ? `${d.value}${d.type === "pr" ? "%" : " flat"}` : "removed"}`,
  );
}

/** A promo code is the order's one discount, carrying the code (as in the Web POS). */
export function applyPromo(c: Ctx, orderId: string, code: string | null) {
  need(c, "biller", "edit");
  const o = orderById(c, orderId);
  if (!isOpen(o)) fail("This bill is closed");
  if (!code) return setDiscount(c, orderId, null);
  const p =
    c.db.settings.promoCodes.find((x) => x.active && x.code === code.trim().toUpperCase()) ??
    fail("This promo code is not valid");
  if (p.type === "fix" && p.value > o.totals.subtotal) fail(`${p.code} is more than the bill`);
  o.discount = { type: p.type, value: p.value, reason: `Promo ${p.code}` };
  o.promoCode = p.code;
  recompute(c, o);
  event(c, o, `Promo ${p.code} applied`);
}

export function setServiceCharge(c: Ctx, orderId: string, amount: number | null) {
  need(c, "biller", "edit");
  const o = orderById(c, orderId);
  if (!isOpen(o)) fail("This bill is closed");
  if (amount !== null && !(amount >= 0)) fail("Enter a valid amount");
  o.serviceOverride = amount;
  recompute(c, o);
  event(c, o, amount === null ? "Service charge removed" : `Service charge ₹${amount}`);
}

/* ------------------------------ settle ------------------------------ */

export function recordCash(
  c: Ctx,
  amount: number,
  reason: string,
  kind: "settlement" | "expense" | "supplier" | "out" = "settlement",
) {
  // Best effort, same as the exe: no open session = nowhere to record, never a reason to fail.
  const s = c.db.cashSession;
  if (!s || amount === 0) return;
  s.movements.unshift({
    id: nextId(c.db, "cm"),
    kind,
    amount: r2(amount),
    reason,
    at: iso(c),
    by: c.user.name,
  });
}

function upsertCustomer(c: Ctx, name: string, mobile: string) {
  let cust = c.db.customers.find((x) => x.mobile === mobile);
  if (!cust) {
    cust = { id: nextId(c.db, "cus"), name, mobile, visits: 0, totalSpent: 0, dueOutstanding: 0 };
    c.db.customers.push(cust);
  } else if (name) cust.name = name;
  return cust;
}

export function settle(
  c: Ctx,
  orderId: string,
  input: {
    payments: { modeId: string; amount: number }[];
    customerName?: string | undefined;
    customerMobile?: string | undefined;
  },
): { change: number; billNo: string } {
  need(c, "biller", "edit");
  const o = orderById(c, orderId);
  if (o.status === "settled") fail(`Bill ${o.billNo} is already settled`);
  billFloor(c, o);
  // Held items are settled like a bill without a KOT (Web POS).
  billUnsent(c, o);
  const grand = o.totals.grand;
  const rows = input.payments
    .filter((p) => p.amount > 0)
    .map((p) => ({ ...p, amount: r2(p.amount) }));
  const problem = checkPayments(grand, rows);
  if (problem) fail(problem);
  for (const p of rows) {
    const m = c.db.settings.paymentModes.find((x) => x.id === p.modeId);
    if (!m || !m.active) fail("That payment mode is switched off");
  }
  const due = r2(rows.filter((p) => p.modeId === "due").reduce((a, p) => a + p.amount, 0));
  const name = input.customerName?.trim() || o.customerName || "";
  const mobile = input.customerMobile?.trim() || o.customerMobile || "";
  if (due > 0 && (!name || !/^\d{10}$/.test(mobile)))
    fail("Due needs the customer's name and 10-digit mobile");
  const paid = r2(rows.reduce((a, p) => a + p.amount, 0));
  const change = r2(paid - grand);
  const cashIn = r2(
    rows.filter((p) => p.modeId === "cash").reduce((a, p) => a + p.amount, 0) - change,
  );
  o.payments = [
    ...rows.filter((p) => p.modeId !== "cash"),
    ...(cashIn > 0 ? [{ modeId: "cash", amount: cashIn }] : []),
  ];
  o.changeReturned = change > 0 ? change : undefined;
  o.dueOutstanding = due > 0 ? due : undefined;
  o.customerName = name || undefined;
  o.customerMobile = mobile || undefined;
  o.status = "settled";
  o.settledAt = iso(c);
  o.settledBy = c.user.name;
  if (!o.billPrintedAt) o.billPrintedAt = iso(c);
  if (mobile && /^\d{10}$/.test(mobile)) {
    const cust = upsertCustomer(c, name || "Customer", mobile);
    cust.visits += 1;
    cust.totalSpent = r2(cust.totalSpent + grand);
    cust.lastVisit = iso(c);
    cust.dueOutstanding = r2(cust.dueOutstanding + due);
  }
  recordCash(c, cashIn, `Bill ${o.billNo}`);
  if (o.type === "dinin") deductForLines(c, o, orderLines(o));
  const modes = o.payments
    .map((p) => c.db.settings.paymentModes.find((m) => m.id === p.modeId)?.name ?? p.modeId)
    .join(" + ");
  event(
    c,
    o,
    `Settled ₹${grand.toFixed(2)} · ${modes}${change > 0 ? ` · change ₹${change.toFixed(2)}` : ""}`,
  );
  audit(c, "Billing", `Settled bill ${o.billNo}`);
  discountAlert(c, o);
  return { change: change > 0 ? change : 0, billNo: o.billNo };
}

/** Counter billing: the order is created and fired in one step. Dine-in needs a table (Web POS keyboard billing rule). */
export function counterOrder(
  c: Ctx,
  input: {
    type: OrderType;
    tableId?: string | undefined;
    lines: DraftLine[];
    customerName?: string | undefined;
    customerMobile?: string | undefined;
    menuId: string;
  },
): KotResult {
  need(c, "keyboard-billing", "create");
  if (input.type === "dinin" && !input.tableId) fail("Pick a table for a dine-in order");
  if (input.customerMobile && !/^\d{10}$/.test(input.customerMobile))
    fail("Enter a 10-digit mobile number");
  return sendKot(c, { ...input, guests: 1, clientKey: "" });
}

/**
 * Edit a settled bill (Web POS edit-settled-order, owner bug list item 11).
 * The bill is changed in place - the table is not occupied again. Items,
 * quantities and discount change; the payment is given again for the whole
 * new bill. Cash differences go in/out of the open drawer; a lower bill's
 * difference is handed back now or kept as a refund owed. Stock follows the
 * new lines.
 */
export function editSettled(c: Ctx, orderId: string, edit: SettledEdit): SettledEditResult {
  needSpecial(c, "orders.reopenSettled");
  const o = orderById(c, orderId);
  if (o.status !== "settled") fail("Only a settled bill can be edited");
  const before = orderLines(o);
  for (const e of edit.lines) {
    const line =
      before.find((l) => l.id === e.lineId) ?? fail("An item on this bill was not found");
    if (!(e.qty >= 0)) fail(`${line.name}: quantity cannot be negative`);
    if (Math.round(e.qty * 100) !== e.qty * 100)
      fail(`${line.name}: quantity can have at most 2 decimals`);
  }
  if (edit.added.length) checkLines(c, edit.added);
  const qtyOf = new Map(edit.lines.map((e) => [e.lineId, r2(e.qty)]));
  const kept = before.filter((l) => (qtyOf.get(l.id) ?? l.qty) > 0);
  if (kept.length + edit.added.length === 0) fail("A bill needs at least one item");

  // Everything is checked on the new bill first; nothing changes on a refusal.
  const d = edit.discount && edit.discount.value > 0 ? edit.discount : null;
  const nextLines = [...kept.map((l) => ({ ...l, qty: qtyOf.get(l.id) ?? l.qty })), ...edit.added];
  const totalsFor = (discount: OrderDiscount | undefined) =>
    billTotals(
      {
        type: o.type,
        sectionId: tableById(c, o.tableId)?.sectionId,
        lines: nextLines,
        discount,
        serviceOverride: o.serviceOverride,
      },
      c.db.settings,
    );
  if (d) {
    if (d.type === "pr" && d.value > 100) fail("A discount cannot be above 100%");
    if (d.type === "fix" && d.value > totalsFor(undefined).subtotal)
      fail("A discount cannot be more than the bill");
    if (!d.reason.trim()) fail("Add a reason for the discount");
  }
  const discount = d ? { type: d.type, value: d.value, reason: d.reason.trim() } : undefined;
  const grand = totalsFor(discount).grand;
  const oldGrand = o.totals.grand;
  const oldCash = r2(
    o.payments.filter((p) => p.modeId === "cash").reduce((a, p) => a + p.amount, 0),
  );
  const oldDue = o.dueOutstanding ?? 0;

  const rows = edit.payments
    .filter((p) => p.amount > 0)
    .map((p) => ({ modeId: p.modeId, amount: r2(p.amount) }));
  const merged: Payment[] = [];
  for (const p of rows) {
    const m = c.db.settings.paymentModes.find((x) => x.id === p.modeId);
    if (!m) fail("That payment mode is not set up");
    const had = o.payments.some((x) => x.modeId === p.modeId);
    if (!m!.active && !had) fail(`${m!.name} is switched off`);
    const same = merged.find((x) => x.modeId === p.modeId);
    if (same) same.amount = r2(same.amount + p.amount);
    else merged.push({ ...p });
  }
  const refundLater = r2(Math.max(0, Number(edit.refundLater) || 0));
  const due = r2(merged.filter((p) => p.modeId === "due").reduce((a, p) => a + p.amount, 0));
  const paid = r2(merged.reduce((a, p) => a + p.amount, 0));
  if (refundLater > 0 && due > 0) fail("A bill cannot be both due and owed a refund");
  if (Math.abs(paid - refundLater - grand) > 0.009)
    fail(
      `The edited bill totals ₹${grand.toFixed(2)}, but the payments add up to ₹${r2(paid - refundLater).toFixed(2)}. Please adjust the payment.`,
    );
  const name = edit.customerName?.trim() || o.customerName || "";
  const mobile = edit.customerMobile?.trim() || o.customerMobile || "";
  if (due > 0 && (!name || !/^\d{10}$/.test(mobile)))
    fail("Due needs the customer's name and 10-digit mobile");

  // Stock: everything the old bill took goes back; the new bill is deducted.
  deductForLines(c, o, before, -1, `Bill ${o.billNo} edited`);
  for (const k of o.kots) {
    k.lines = k.lines
      .map((l) => (qtyOf.has(l.id) ? { ...l, qty: qtyOf.get(l.id)! } : l))
      .filter((l) => l.qty > 0);
  }
  o.kots = o.kots.filter((k) => k.lines.length > 0);
  o.heldLines = o.heldLines
    .map((l) => (qtyOf.has(l.id) ? { ...l, qty: qtyOf.get(l.id)! } : l))
    .filter((l) => l.qty > 0);
  if (edit.added.length) {
    // Added on the bill, never cooked from a KOT: a round shown on no KDS.
    const kotNo = nextKotNo(o);
    o.kots.push({
      kotNo,
      round: kotNo,
      firedAt: iso(c),
      firedById: c.user.id,
      firedByName: c.user.name,
      lines: edit.added.map((l) => ({ ...toOrderLine(c, l), status: "served" as const })),
      kitchenIds: [],
    });
  }
  // A promo kept as it was stays a promo; any other discount is manual.
  if (!(discount && o.promoCode && discount.reason === `Promo ${o.promoCode}`))
    o.promoCode = undefined;
  o.discount = discount;
  recompute(c, o);
  deductForLines(c, o, orderLines(o), 1, `Bill ${o.billNo} edited`);
  const newCash = r2(merged.filter((p) => p.modeId === "cash").reduce((a, p) => a + p.amount, 0));
  const cashDelta = r2(newCash - oldCash);
  if (cashDelta > 0) recordCash(c, cashDelta, `Edited bill ${o.billNo}`);
  if (cashDelta < 0) recordCash(c, -cashDelta, `Refund · edited bill ${o.billNo}`, "out");

  o.payments = merged;
  o.changeReturned = undefined;
  o.dueOutstanding = due > 0 ? due : undefined;
  o.refundOwed = refundLater > 0 ? refundLater : undefined;
  if (due > 0) {
    o.customerName = name;
    o.customerMobile = mobile;
  }
  if (o.customerMobile) {
    const cust = upsertCustomer(c, o.customerName || "Customer", o.customerMobile);
    cust.totalSpent = r2(cust.totalSpent - oldGrand + grand);
    cust.dueOutstanding = r2(Math.max(0, cust.dueOutstanding - oldDue + due));
  }
  const modes = merged
    .map(
      (p) =>
        `${c.db.settings.paymentModes.find((m) => m.id === p.modeId)?.name ?? p.modeId} ₹${p.amount.toFixed(2)}`,
    )
    .join(" + ");
  event(
    c,
    o,
    `Settled bill edited · ₹${oldGrand.toFixed(2)} → ₹${grand.toFixed(2)} · ${modes}${refundLater > 0 ? ` · refund owed ₹${refundLater.toFixed(2)}` : ""}`,
  );
  audit(c, "Billing", `Edited settled bill ${o.billNo}`);
  discountAlert(c, o, true);
  return {
    grand,
    due,
    refundOwed: refundLater,
    cashIn: cashDelta > 0 ? cashDelta : 0,
    cashOut: cashDelta < 0 ? -cashDelta : 0,
  };
}

/** Hand back a refund owed. Cash comes out of the open drawer; the bill's payments drop by it. */
export function settleRefund(c: Ctx, orderId: string, modeId: string) {
  need(c, "ops-ledger", "edit");
  const o = orderById(c, orderId);
  const amount = o.refundOwed ?? 0;
  if (!(amount > 0)) fail("This bill has no refund owed");
  if (modeId === "due") fail("Pick how the money was handed back");
  const mode = c.db.settings.paymentModes.find((m) => m.id === modeId);
  if (!mode || !mode.active) fail("Pick how the money was handed back");
  // The refund leaves the bill's own payments: the mode it went back by first.
  let left = amount;
  const order = [
    ...o.payments.filter((p) => p.modeId === modeId),
    ...o.payments.filter((p) => p.modeId !== modeId && p.modeId !== "due").reverse(),
  ];
  for (const p of order) {
    if (left <= 0) break;
    const cut = Math.min(p.amount, left);
    p.amount = r2(p.amount - cut);
    left = r2(left - cut);
  }
  o.payments = o.payments.filter((p) => p.amount > 0);
  o.refundOwed = undefined;
  if (modeId === "cash") recordCash(c, amount, `Refund · bill ${o.billNo}`, "out");
  event(c, o, `Refund ₹${amount.toFixed(2)} handed back (${mode!.name})`);
  audit(c, "Billing", `Refunded ₹${amount} on bill ${o.billNo}`);
}

/* ------------------------------ kitchen ------------------------------ */

export function kotLinesForKitchen(c: Ctx, o: Order, kot: Kot, kitchenId: string): OrderLine[] {
  const routed = routeToKitchens(
    c.db.settings.kitchens,
    kot.lines,
    o.type,
    tableById(c, o.tableId),
  );
  return routed.find((r) => r.kitchen.id === kitchenId)?.lines ?? [];
}

const NEXT: Record<OrderLine["status"], OrderLine["status"]> = {
  sent: "preparing",
  preparing: "ready",
  ready: "served",
  served: "served",
};
const RANK: Record<OrderLine["status"], number> = { sent: 0, preparing: 1, ready: 2, served: 3 };

/**
 * KDS: New → Preparing → Ready → Served (bumped off the screen). Tapping the
 * card moves every line of that kitchen along with its slowest line.
 * Ready tells the captain who fired it (dine-in) or the token board (pickup).
 */
export function kdsAdvance(
  c: Ctx,
  orderId: string,
  kotNo: number,
  kitchenId: string,
  lineId?: string,
) {
  need(c, "kds", "edit");
  const o = orderById(c, orderId);
  const kot = o.kots.find((k) => k.kotNo === kotNo) ?? fail("KOT not found");
  const mine = kotLinesForKitchen(c, o, kot, kitchenId);
  if (!mine.length) fail("Nothing for this kitchen");
  const wasReady = mine.every((l) => RANK[l.status] >= 2);
  if (lineId) {
    const l = mine.find((x) => x.id === lineId) ?? fail("Item not found");
    l.status = NEXT[l.status];
  } else {
    const slowest = mine.reduce((m, l) => Math.min(m, RANK[l.status]), 3);
    const to = NEXT[(Object.keys(RANK) as OrderLine["status"][]).find((k) => RANK[k] === slowest)!];
    for (const l of mine) if (RANK[l.status] < RANK[to]) l.status = to;
  }
  const nowReady = mine.every((l) => RANK[l.status] >= 2);
  if (nowReady && !wasReady) {
    const kitchen = c.db.settings.kitchens.find((k) => k.id === kitchenId)?.name ?? "Kitchen";
    const table = tableById(c, o.tableId);
    if (o.type === "pickup") o.readyAt = iso(c);
    alert(c, {
      kind: "food-ready",
      title: `Food ready · ${table?.name ?? `Token ${o.token}`}`,
      body: `KOT #${kotNo} · ${kitchen} · ${mine
        .map((l) => `${l.qty}× ${l.name}`)
        .slice(0, 3)
        .join(", ")}${mine.length > 3 ? "…" : ""}`,
      link: `/order/${o.tableId ? `t.${o.tableId}` : `o.${o.id}`}`,
      forUserId: kot.firedById,
    });
  }
}

export function kdsRecall(c: Ctx, orderId: string, kotNo: number, kitchenId: string) {
  need(c, "kds", "edit");
  const o = orderById(c, orderId);
  const kot = o.kots.find((k) => k.kotNo === kotNo) ?? fail("KOT not found");
  for (const l of kotLinesForKitchen(c, o, kot, kitchenId))
    if (l.status === "served") l.status = "ready";
}

/* ------------------------------ stock ------------------------------ */

/** Deduct raw materials by recipe. Never blocks a sale: stock may go negative. */
export function deductForLines(
  c: Ctx,
  o: Order,
  lines: OrderLine[],
  /** -1 puts it back (a settled bill edited). */
  sign: 1 | -1 = 1,
  reference = `Bill ${o.billNo}`,
) {
  const st = c.db.stock;
  for (const l of lines) {
    if (!l.itemId) continue;
    const recipe = st.recipes.find((r) => r.itemId === l.itemId);
    if (!recipe) continue;
    const parts = [
      ...(l.variantId && recipe.byVariant[l.variantId]?.length
        ? recipe.byVariant[l.variantId]!
        : recipe.base),
      ...l.addons.flatMap((a) =>
        (recipe.byAddon[a.id] ?? []).map((x) => ({ ...x, qty: x.qty * (a.qty || 1) })),
      ),
    ];
    for (const p of parts) {
      const qty = r2(p.qty * l.qty * sign);
      if (p.kind === "raw") {
        const raw = st.raw.find((x) => x.id === p.refId);
        if (!raw) continue;
        raw.stock = r2(raw.stock - qty);
        st.movements.unshift({
          id: nextId(c.db, "mv"),
          kind: "sale",
          refKind: "raw",
          refId: raw.id,
          qty: -qty,
          value: r2(-qty * raw.rate),
          reference,
          at: iso(c),
          by: c.user.name,
        });
      } else {
        const semi = st.semi.find((x) => x.id === p.refId);
        if (!semi) continue;
        semi.stock = r2(semi.stock - qty);
        st.movements.unshift({
          id: nextId(c.db, "mv"),
          kind: "sale",
          refKind: "semi",
          refId: semi.id,
          qty: -qty,
          value: 0,
          reference,
          at: iso(c),
          by: c.user.name,
        });
      }
    }
  }
}
