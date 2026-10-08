import { combineDashboards, combineReports } from "../../allOutlets";
import type { Staff } from "../../types";
import {
  NetworkError,
  type DeviceInfo,
  type LoginResult,
  type OutletData,
  type PosBackend,
  type Result,
} from "../types";
import * as core from "./core";
import { expectedCash } from "./domains";
import * as dom from "./domains";
import { clone, nextId, type MockDb } from "./db";
import * as reports from "./reports";
import { seedDemoActivity } from "./seedDemo";
import { seedDb } from "./seed";

// In-browser implementation of the cloud contract (PosBackend) for one demo
// tenant. It is the executable spec for uat-backend-v2's /app/v1: same
// rules, same errors. State survives a page refresh (localStorage) so
// refresh-every-screen tests behave like a real server.

/** Test switches for the demo menu. */
export const mockNet = { offline: false, latency: 220 };

const STORE_KEY = "billerpe.mockdb.v5";

function save(db: MockDb) {
  try {
    const { seenKeys, ...rest } = db;
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ ...rest, seenKeys: [...seenKeys.entries()].slice(-300) }),
    );
  } catch {
    /* storage full or blocked: the demo keeps working in memory */
  }
}

function restore(): MockDb | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockDb & { seenKeys: [string, unknown][] };
    return { ...parsed, seenKeys: new Map(parsed.seenKeys) };
  } catch {
    return null;
  }
}

export function resetMockData() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

function freshDb(): MockDb {
  const db = seedDb();
  seedDemoActivity(db);
  return db;
}

export class MockBackend implements PosBackend {
  private db: MockDb = restore() ?? freshDb();
  private session: { userId: string; deviceId: string } | null = null;

  private async net() {
    await new Promise((r) => setTimeout(r, mockNet.latency * (0.6 + Math.random() * 0.8)));
    if (mockNet.offline) throw new NetworkError();
  }

  private ctx(): core.Ctx {
    const user = this.db.staff.find((s) => s.id === this.session?.userId);
    if (!user || !user.active)
      throw new core.RuleError("Your session has ended. Please log in again.");
    return { db: this.db, user, now: new Date() };
  }

  /** Run a rule, persist, map RuleError to { ok: false }. clientKey = apply once. */
  private async run<T extends object>(
    fn: (c: core.Ctx) => T | void,
    clientKey?: string,
  ): Promise<Result<T>> {
    await this.net();
    if (clientKey && this.db.seenKeys.has(clientKey))
      return { ok: true, ...(this.db.seenKeys.get(clientKey) as T) };
    try {
      const out = (fn(this.ctx()) ?? {}) as T;
      if (clientKey) this.db.seenKeys.set(clientKey, out);
      save(this.db);
      return { ok: true, ...clone(out) };
    } catch (e) {
      if (e instanceof core.RuleError) return { ok: false, error: e.message };
      console.error(e);
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  }

  /* ------------------------------ session ------------------------------ */

  private registerDevice(info: DeviceInfo, user: Staff): LoginResult | null {
    const known = this.db.devices.find((d) => d.id === info.deviceId);
    if (!known) {
      if (this.db.devices.length >= this.db.outlet.deviceLimit) {
        return {
          ok: false,
          error: "device-limit",
          message: `This outlet allows ${this.db.outlet.deviceLimit} devices.`,
        };
      }
      this.db.devices.push({
        id: info.deviceId,
        name: info.name,
        make: info.make,
        model: info.model,
        android: info.android,
        appVersion: info.appVersion,
        userName: user.name,
        lastActive: new Date().toISOString(),
        thisDevice: false,
        printers: [],
        printKots: true,
      });
      this.db.outlet.devicesInUse = this.db.devices.length;
    } else {
      known.userName = user.name;
      known.lastActive = new Date().toISOString();
    }
    return null;
  }

  private startSession(user: Staff, info: DeviceInfo): LoginResult {
    this.session = { userId: user.id, deviceId: info.deviceId };
    this.db.audit.unshift({
      id: nextId(this.db, "au"),
      at: new Date().toISOString(),
      by: user.name,
      role: user.role,
      module: "Login",
      action: `Signed in on ${info.name}`,
    });
    save(this.db);
    return {
      ok: true,
      session: {
        token: `mock.${user.id}.${Date.now()}`,
        user: clone(user),
        deviceId: info.deviceId,
      },
    };
  }

  async loginWithPassword(
    mobile: string,
    password: string,
    device: DeviceInfo,
  ): Promise<LoginResult> {
    try {
      await this.net();
    } catch {
      return { ok: false, error: "network" };
    }
    const user = this.db.staff.find((s) => s.mobile === mobile.trim());
    if (!user || this.db.secrets[user.id]?.password !== password)
      return { ok: false, error: "wrong-password" };
    if (!user.active) return { ok: false, error: "inactive" };
    if (new Date(this.db.subscription.expiresAt) < new Date())
      return { ok: false, error: "subscription-expired" };
    const blocked = this.registerDevice(device, user);
    if (blocked) return blocked;
    return this.startSession(user, device);
  }

  async loginWithPin(staffId: string, pin: string, device: DeviceInfo): Promise<LoginResult> {
    try {
      await this.net();
    } catch {
      return { ok: false, error: "network" };
    }
    // A PIN works only on a device this outlet already registered with a password login.
    if (!this.db.devices.some((d) => d.id === device.deviceId))
      return {
        ok: false,
        error: "wrong-pin",
        message: "Log in with your password once on this device first.",
      };
    const user = this.db.staff.find((s) => s.id === staffId);
    if (!user || this.db.secrets[user.id]?.pin !== pin) return { ok: false, error: "wrong-pin" };
    if (!user.active) return { ok: false, error: "inactive" };
    this.registerDevice(device, user);
    return this.startSession(user, device);
  }

  async resume(token: string, device: DeviceInfo): Promise<LoginResult> {
    try {
      await this.net();
    } catch {
      return { ok: false, error: "network" };
    }
    const userId = token.split(".")[1];
    const user = this.db.staff.find((s) => s.id === userId);
    if (!user || !user.active || !this.db.devices.some((d) => d.id === device.deviceId))
      return { ok: false, error: "inactive" };
    this.session = { userId: user.id, deviceId: device.deviceId };
    return { ok: true, session: { token, user: clone(user), deviceId: device.deviceId } };
  }

  async selectOutlet(outletId: string): Promise<Result> {
    await this.net();
    // One demo tenant: other outlets exist only as names.
    return outletId === this.db.outlet.id
      ? { ok: true }
      : { ok: false, error: "This demo has data for Main Branch only." };
  }

  async logout(): Promise<void> {
    this.session = null;
  }

  async shiftStaff() {
    return this.db.staff
      .filter((s) => s.active)
      .map((s) => ({ id: s.id, name: s.name, role: s.role }));
  }

  async load(): Promise<OutletData> {
    await this.net();
    const c = this.ctx();
    const db = this.db;
    // Reservation clock (exe services/reservationTableSync.js): hold the table
    // from 30 min before; no-show 30 min after if nobody was seated.
    const now = Date.now();
    for (const r of db.reservations) {
      if (r.status === "booked" && now > new Date(r.at).getTime() + 30 * 60000) {
        const seated = r.tableIds.some((t) =>
          db.orders.some(
            (o) =>
              o.tableId === t &&
              new Date(o.createdAt).getTime() >= new Date(r.at).getTime() - 30 * 60000,
          ),
        );
        r.status = seated ? "seated" : "noshow";
      }
    }
    // Table state comes from the orders, never from a device's cart.
    for (const t of db.tables) {
      const o = core.openOrderOnTable(c, t.id);
      const r = db.reservations.find(
        (x) =>
          x.status === "booked" &&
          x.tableIds.includes(t.id) &&
          core.reservationHolding(c, x.at, x.endAt),
      );
      t.orderId = o?.id;
      t.status = o
        ? o.status === "hold"
          ? "hold"
          : o.status === "billed"
            ? "billed"
            : "running"
        : r
          ? "reserved"
          : "free";
      t.reservation = r ? { id: r.id, name: r.name, at: r.at } : undefined;
      t.qrWaiting = db.qrOrders.some((q) => q.tableId === t.id && q.status === "pending");
      // The cloud builds the real encrypted link; the demo points at a demo page.
      t.qrUrl = `https://uatpos.billerpe.in/qr-menu?demo=${encodeURIComponent(`${db.outlet.id}.${t.id}.v${t.qrVersion}`)}`;
    }
    save(db);
    const data = clone(db) as MockDb;
    const { secrets: _s, seenKeys: _k, seq: _q, ...out } = data;
    out.alerts = out.alerts.filter(
      (a) =>
        (!a.forUserId || a.forUserId === c.user.id) &&
        (!a.forRoles || a.forRoles.includes(c.user.role)),
    );
    out.devices = out.devices.map((d) => ({ ...d, thisDevice: d.id === this.session?.deviceId }));
    out.refundsOwed = out.orders
      .filter((o) => (o.refundOwed ?? 0) > 0)
      .map((o) => ({
        orderId: o.id,
        billNo: o.billNo,
        amount: o.refundOwed!,
        customerName: o.customerName,
        customerMobile: o.customerMobile,
        at: o.settledAt ?? o.createdAt,
      }));
    return out as OutletData;
  }

  /* ------------------------------ orders ------------------------------ */

  sendKot: PosBackend["sendKot"] = (cart) => this.run((c) => core.sendKot(c, cart), cart.clientKey);
  holdOrder: PosBackend["holdOrder"] = (cart) =>
    this.run((c) => core.holdOrder(c, cart), cart.clientKey);
  setGuests: PosBackend["setGuests"] = (id, g) => this.run((c) => core.setGuests(c, id, g));
  setCustomer: PosBackend["setCustomer"] = (id, customer) =>
    this.run((c) => core.setCustomer(c, id, customer));
  removeLine: PosBackend["removeLine"] = (id, line, reason) =>
    this.run((c) => core.removeLine(c, id, line, reason));
  markServed: PosBackend["markServed"] = (id, kot) => this.run((c) => core.markServed(c, id, kot));
  requestBill: PosBackend["requestBill"] = (id) => this.run((c) => core.requestBill(c, id));
  printBill: PosBackend["printBill"] = (id) => this.run((c) => core.printBill(c, id));
  billCart: PosBackend["billCart"] = (cart, opts) =>
    this.run((c) => core.billCart(c, cart, Boolean(opts?.request)), cart.clientKey);
  cancelOrder: PosBackend["cancelOrder"] = (id, reason) =>
    this.run((c) => core.cancelOrder(c, id, reason));
  transferTable: PosBackend["transferTable"] = (id, to) =>
    this.run((c) => core.transferTable(c, id, to));
  mergeTables: PosBackend["mergeTables"] = (from, to) =>
    this.run((c) => core.mergeTables(c, from, to));
  moveKot: PosBackend["moveKot"] = (id, kot, to) => this.run((c) => core.moveKot(c, id, kot, to));
  setDiscount: PosBackend["setDiscount"] = (id, d) => this.run((c) => core.setDiscount(c, id, d));
  applyPromo: PosBackend["applyPromo"] = (id, code) =>
    this.run((c) => core.applyPromo(c, id, code));
  setServiceCharge: PosBackend["setServiceCharge"] = (id, a) =>
    this.run((c) => core.setServiceCharge(c, id, a));
  settle: PosBackend["settle"] = (id, input) =>
    this.run((c) => core.settle(c, id, input), input.clientKey);
  counterOrder: PosBackend["counterOrder"] = (input) =>
    this.run((c) => core.counterOrder(c, input), input.clientKey);
  editSettled: PosBackend["editSettled"] = (id, edit) =>
    this.run((c) => core.editSettled(c, id, edit), edit.clientKey);
  settleRefund: PosBackend["settleRefund"] = (id, modeId) =>
    this.run((c) => core.settleRefund(c, id, modeId));
  sendEbill: PosBackend["sendEbill"] = (id, mobile) =>
    this.run((c) => {
      core.need(c, "biller", "edit");
      if (!/^\d{10}$/.test(mobile)) throw new core.RuleError("Enter a 10-digit mobile number");
      if (c.db.subscription.ebillCredits <= 0)
        throw new core.RuleError("E-bill credits are used up. Renew to send more.");
      const o = core.orderById(c, id);
      c.db.subscription.ebillCredits -= 1;
      o.timeline.push({ at: core.iso(c), label: `E-bill sent to ${mobile}`, by: c.user.name });
    });
  markPickupReady: PosBackend["markPickupReady"] = (id, ready) =>
    this.run((c) => {
      core.need(c, "biller", "edit");
      const o = core.orderById(c, id);
      o.readyAt = ready ? core.iso(c) : undefined;
    });
  logReprint: PosBackend["logReprint"] = (id, what) =>
    this.run((c) => {
      const o = core.orderById(c, id);
      o.timeline.push({ at: core.iso(c), label: `${what} reprinted`, by: c.user.name });
    });

  kdsAdvance: PosBackend["kdsAdvance"] = (id, kot, kitchen, line) =>
    this.run((c) => core.kdsAdvance(c, id, kot, kitchen, line));
  kdsRecall: PosBackend["kdsRecall"] = (id, kot, kitchen) =>
    this.run((c) => core.kdsRecall(c, id, kot, kitchen));
  decideQr: PosBackend["decideQr"] = (id, d) => this.run((c) => dom.decideQr(c, id, d));

  /* ------------------------------ front of house ------------------------------ */

  saveReservation: PosBackend["saveReservation"] = (r) =>
    this.run((c) => dom.saveReservation(c, r));
  setReservationStatus: PosBackend["setReservationStatus"] = (id, s) =>
    this.run((c) => dom.setReservationStatus(c, id, s));
  addToQueue: PosBackend["addToQueue"] = (e) => this.run((c) => dom.addToQueue(c, e));
  setQueueStatus: PosBackend["setQueueStatus"] = (id, s) =>
    this.run((c) => dom.setQueueStatus(c, id, s));
  saveCustomer: PosBackend["saveCustomer"] = (cu) => this.run((c) => dom.saveCustomer(c, cu));
  collectDue: PosBackend["collectDue"] = (m, a, mode) =>
    this.run((c) => dom.collectDue(c, m, a, mode));

  openCash: PosBackend["openCash"] = (f) => this.run((c) => dom.openCash(c, f));
  cashMovement: PosBackend["cashMovement"] = (k, a, r) =>
    this.run((c) => dom.cashMovement(c, k, a, r));
  closeCash: PosBackend["closeCash"] = (d, v) =>
    this.run((c) => ({ session: dom.closeCash(c, d, v) }));
  saveExpenseHead: PosBackend["saveExpenseHead"] = (h) =>
    this.run((c) => dom.saveExpenseHead(c, h));
  saveExpense: PosBackend["saveExpense"] = (e) => this.run((c) => dom.saveExpense(c, e));
  deleteExpense: PosBackend["deleteExpense"] = (id) => this.run((c) => dom.deleteExpense(c, id));

  /* ------------------------------ masters ------------------------------ */

  saveMenu: PosBackend["saveMenu"] = (m) => this.run((c) => dom.saveMenu(c, m));
  saveCategory: PosBackend["saveCategory"] = (x) => this.run((c) => dom.saveCategory(c, x));
  deleteCategory: PosBackend["deleteCategory"] = (id) => this.run((c) => dom.deleteCategory(c, id));
  saveItem: PosBackend["saveItem"] = (i) => this.run((c) => dom.saveItem(c, i));
  deleteItem: PosBackend["deleteItem"] = (id) => this.run((c) => dom.deleteItem(c, id));
  setOutOfStock: PosBackend["setOutOfStock"] = (id, out) =>
    this.run((c) => dom.setOutOfStock(c, id, out));
  saveVariant: PosBackend["saveVariant"] = (v) => this.run((c) => dom.saveVariant(c, v));
  deleteVariant: PosBackend["deleteVariant"] = (id) => this.run((c) => dom.deleteVariant(c, id));
  importMenu: PosBackend["importMenu"] = (menuId, rows) =>
    this.run((c) => dom.importMenu(c, menuId, rows));
  saveAddonGroup: PosBackend["saveAddonGroup"] = (g) => this.run((c) => dom.saveAddonGroup(c, g));
  deleteAddonGroup: PosBackend["deleteAddonGroup"] = (id) =>
    this.run((c) => dom.deleteAddonGroup(c, id));
  saveSection: PosBackend["saveSection"] = (s) => this.run((c) => dom.saveSection(c, s));
  deleteSection: PosBackend["deleteSection"] = (id) => this.run((c) => dom.deleteSection(c, id));
  addTables: PosBackend["addTables"] = (s, spec, seats) =>
    this.run((c) => dom.addTables(c, s, spec, seats));
  editTable: PosBackend["editTable"] = (id, p) => this.run((c) => dom.editTable(c, id, p));
  deleteTable: PosBackend["deleteTable"] = (id) => this.run((c) => dom.deleteTable(c, id));
  newTableQr: PosBackend["newTableQr"] = (id) => this.run((c) => dom.newTableQr(c, id));
  saveStaff: PosBackend["saveStaff"] = (s) => this.run((c) => dom.saveStaff(c, s));
  setStaffActive: PosBackend["setStaffActive"] = (id, a) =>
    this.run((c) => dom.setStaffActive(c, id, a));
  setRoleDefaults: PosBackend["setRoleDefaults"] = (r, p) =>
    this.run((c) => dom.setRoleDefaults(c, r, p));
  setUserOverrides: PosBackend["setUserOverrides"] = (id, p) =>
    this.run((c) => dom.setUserOverrides(c, id, p));
  updateSettings: PosBackend["updateSettings"] = (p) => this.run((c) => dom.updateSettings(c, p));
  updateOutlet: PosBackend["updateOutlet"] = (p) => this.run((c) => dom.updateOutlet(c, p));
  saveTax: PosBackend["saveTax"] = (t) => this.run((c) => dom.saveTax(c, t));
  deleteTax: PosBackend["deleteTax"] = (id) => this.run((c) => dom.deleteTax(c, id));
  saveCharge: PosBackend["saveCharge"] = (w, r) => this.run((c) => dom.saveCharge(c, w, r));
  savePaymentMode: PosBackend["savePaymentMode"] = (m) =>
    this.run((c) => dom.savePaymentMode(c, m));
  removePaymentMode: PosBackend["removePaymentMode"] = (id) =>
    this.run((c) => dom.removePaymentMode(c, id));
  savePromo: PosBackend["savePromo"] = (p) => this.run((c) => dom.savePromo(c, p));
  deletePromo: PosBackend["deletePromo"] = (id) => this.run((c) => dom.deletePromo(c, id));
  saveKitchen: PosBackend["saveKitchen"] = (k) => this.run((c) => dom.saveKitchen(c, k));
  deleteKitchen: PosBackend["deleteKitchen"] = (id) => this.run((c) => dom.deleteKitchen(c, id));
  resetTokens: PosBackend["resetTokens"] = () => this.run((c) => dom.resetTokens(c));
  logoutDevice: PosBackend["logoutDevice"] = (id) => this.run((c) => dom.logoutDevice(c, id));
  // The demo has no push server: the token is accepted and not used.
  setPushToken: PosBackend["setPushToken"] = () => Promise.resolve({ ok: true });
  saveDevicePrinters: PosBackend["saveDevicePrinters"] = (id, p, k) =>
    this.run((c) => dom.saveDevicePrinters(c, id, p, k));

  /* ------------------------------ stock ------------------------------ */

  saveUnit: PosBackend["saveUnit"] = (u) => this.run((c) => dom.saveUnit(c, u));
  saveRaw: PosBackend["saveRaw"] = (r) => this.run((c) => dom.saveRaw(c, r));
  saveSupplier: PosBackend["saveSupplier"] = (s) => this.run((c) => dom.saveSupplier(c, s));
  savePurchase: PosBackend["savePurchase"] = (p) => this.run((c) => dom.savePurchase(c, p));
  deletePurchase: PosBackend["deletePurchase"] = (id) => this.run((c) => dom.deletePurchase(c, id));
  addPurchasePayment: PosBackend["addPurchasePayment"] = (id, p) =>
    this.run((c) => dom.addPurchasePayment(c, id, p));
  deletePurchasePayment: PosBackend["deletePurchasePayment"] = (id, p) =>
    this.run((c) => dom.deletePurchasePayment(c, id, p));
  stockEntry: PosBackend["stockEntry"] = (e) => this.run((c) => dom.stockEntry(c, e));
  recordWastage: PosBackend["recordWastage"] = (w) => this.run((c) => dom.recordWastage(c, w));
  deleteWastage: PosBackend["deleteWastage"] = (id) => this.run((c) => dom.deleteWastage(c, id));
  saveRecipe: PosBackend["saveRecipe"] = (r) => this.run((c) => dom.saveRecipe(c, r));
  saveSemi: PosBackend["saveSemi"] = (s) => this.run((c) => dom.saveSemi(c, s));
  produceSemi: PosBackend["produceSemi"] = (id, q, n) =>
    this.run((c) => dom.produceSemi(c, id, q, n));

  /* ------------------------------ orders screen ------------------------------ */

  async listOrders(q: Parameters<PosBackend["listOrders"]>[0]) {
    await this.net();
    core.need(this.ctx(), "orders");
    return clone(reports.listOrders(this.db, q));
  }

  async getOrder(orderId: string) {
    await this.net();
    core.need(this.ctx(), "orders");
    return clone(this.db.orders.find((o) => o.id === orderId) ?? null);
  }

  /* ------------------------------ reports ------------------------------ */

  async dashboard(range: Parameters<PosBackend["dashboard"]>[0]) {
    await this.net();
    core.need(this.ctx(), "dashboard");
    return reports.dashboard(this.db, range);
  }

  async report(
    id: string,
    range: Parameters<PosBackend["report"]>[1],
    filters: Parameters<PosBackend["report"]>[2],
  ) {
    await this.net();
    const def = reports.REPORTS.find((r) => r.id === id);
    core.need(this.ctx(), def?.module ?? "reports");
    return reports.report(this.db, id, range, filters);
  }

  /** Demo: only Main Branch has sales; the other outlet counts as empty. */
  private ownerOutlets() {
    if (!this.ctx().user.isOwner) throw new Error("Only the owner can see all outlets together");
    return this.db.outlets;
  }

  async dashboardAll(range: Parameters<PosBackend["dashboardAll"]>[0]) {
    await this.net();
    const here = reports.dashboard(this.db, range);
    const empty = {
      ...here,
      net: 0,
      bills: 0,
      avgBill: 0,
      guests: 0,
      runningCount: 0,
      runningAmount: 0,
      cancelledCount: 0,
      cancelledAmount: 0,
      discounts: 0,
      expenses: 0,
      byMode: [],
      hourly: here.hourly.map((h) => ({ ...h, amount: 0 })),
      trend: here.trend.map((t) => ({ ...t, amount: 0 })),
      topItems: [],
      byType: here.byType.map((t) => ({ ...t, amount: 0 })),
    };
    return combineDashboards(
      this.ownerOutlets().map((o) => ({
        outlet: o,
        result: o.id === this.db.outlet.id ? here : empty,
      })),
    );
  }

  async reportAll(id: string, range: Parameters<PosBackend["reportAll"]>[1]) {
    await this.net();
    if (["purchase", "closing-stock", "stock-ledger", "wastage"].includes(id))
      throw new Error("Stock reports are per outlet");
    const here = reports.report(this.db, id, range, {});
    const empty = {
      ...here,
      rows: [],
      summary: here.summary.map((s) => ({
        ...s,
        value: typeof s.value === "number" ? 0 : s.value,
      })),
    };
    return combineReports(
      this.ownerOutlets().map((o) => ({
        outlet: o,
        result: o.id === this.db.outlet.id ? here : empty,
      })),
    );
  }

  /* ------------------------------ account ------------------------------ */

  changePin: PosBackend["changePin"] = (current, next) =>
    this.run((c) => {
      const s = c.db.secrets[c.user.id]!;
      if (s.pin !== current) throw new core.RuleError("Current PIN is wrong");
      if (!/^\d{4}$/.test(next)) throw new core.RuleError("New PIN must be 4 digits");
      if (Object.entries(c.db.secrets).some(([id, v]) => id !== c.user.id && v.pin === next))
        throw new core.RuleError("Another staff member uses this PIN");
      s.pin = next;
      core.audit(c, "Profile", "Changed PIN");
    });

  changePassword: PosBackend["changePassword"] = (current, next) =>
    this.run((c) => {
      const s = c.db.secrets[c.user.id]!;
      if (s.password !== current) throw new core.RuleError("Current password is wrong");
      if (next.length < 6) throw new core.RuleError("Use at least 6 characters");
      s.password = next;
      core.audit(c, "Profile", "Changed password");
    });

  ticketReply: PosBackend["ticketReply"] = (ticketId, text) =>
    this.run((c) => {
      const t = c.db.tickets.find((x) => x.id === ticketId);
      if (!t) throw new core.RuleError("Ticket not found");
      if (t.status === "closed") throw new core.RuleError("This ticket is closed. Raise a new ticket if the problem is back.");
      if (!text.trim()) throw new core.RuleError("Type your reply first");
      t.messages = [...(t.messages ?? []), { id: `m${Date.now()}`, from: "you", body: text.trim(), at: core.iso(c) }];
      if (t.state === "waiting") t.state = "open";
    });

  raiseTicket: PosBackend["raiseTicket"] = (subject, body, kind) =>
    this.run((c) => {
      if (!subject.trim()) throw new core.RuleError("Add a subject");
      if (kind === "support" && body.trim().length < 10)
        throw new core.RuleError("Describe the problem in a few words (10+ characters)");
      const id = `TKT-${4000 + c.db.tickets.length + 1}`;
      c.db.tickets.unshift({
        id,
        subject: subject.trim(),
        body: body.trim(),
        kind,
        at: core.iso(c),
        status: "open",
      });
      core.audit(
        c,
        kind === "plan-change" ? "Subscription" : "Help",
        `Raised ${id}: ${subject.trim()}`,
      );
      return { ticketId: id };
    });

  markAlertsRead: PosBackend["markAlertsRead"] = (ids) =>
    this.run((c) => {
      for (const a of c.db.alerts) if (ids === "all" || ids.includes(a.id)) a.read = true;
    });

  /** For the cash screen: expected cash in the drawer right now. */
  expectedCash(): number {
    return expectedCash({ db: this.db, user: this.db.staff[0]!, now: new Date() });
  }
}
