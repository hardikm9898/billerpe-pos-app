import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import * as mock from "./mock";
import { rolePermissions } from "./permissions";
import { round2, taxBreakup } from "./format";
import { computeBill, discountPercent, type Bill } from "./billing";
import type {
  ActionResult,
  AddonGroup,
  AuditEntry,
  Device,
  Expense,
  ExpenseHead,
  MenuCategory,
  MenuList,
  ModuleKey,
  CrudAction,
  SpecialPermission,
  PaymentModeDef,
  PrinterRouting,
  PromoCode,
  SupportTicket,
  TableSection,
  BillingSettings,
  CashSession,
  Discount,
  DueCollection,
  Payment,
  PaymentModeId,
  TimelineEvent,
  CartLine,
  ConnectionState,
  KotRound,
  LoginError,
  MenuItem,
  Order,
  OrderType,
  Outlet,
  PendingKot,
  Permissions,
  Printer,
  PosAlert,
  PosTable,
  Reservation,
  Role,
  Staff,
  TableStatus,
} from "./types";

const SECTION_PREF_KEY = "billerpe.lastSection";

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export interface OrderTotals {
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
}

export interface SendKotResult extends ActionResult {
  kotNo?: number;
  printerName?: string;
  printed?: boolean;
  roundNo?: number;
}

interface PosState {
  booting: boolean;
  connection: ConnectionState;
  sessionExpired: boolean;
  user: Staff | null;
  permissions: Permissions;
  outlet: Outlet;
  outlets: Outlet[];
  staff: Staff[];
  sections: typeof mock.sections;
  tables: PosTable[];
  categories: typeof mock.categories;
  menus: typeof mock.menus;
  menuItems: MenuItem[];
  orders: Order[];
  reservations: Reservation[];
  alerts: PosAlert[];
  printers: typeof mock.printers;
  pendingKots: PendingKot[];
  deviceInfo: typeof mock.deviceInfo;
  lastSectionId: string;
  billingSettings: BillingSettings;
  dueCollections: DueCollection[];
  cashSession: CashSession | null;
  cashHistory: CashSession[];
  rolePerms: Record<Role, Permissions>;
  addonGroups: AddonGroup[];
  devices: Device[];
  expenseHeads: ExpenseHead[];
  expenses: Expense[];
  audit: AuditEntry[];
  tickets: SupportTicket[];
  lockedToPin: boolean;
  appLock: boolean;
  tokenResetAt: string | null;
  billResetAt: string | null;
  subscription: { plan: "App Lite" | "App Standard" | "App Pro"; expiresAt: string; ebillCredits: number; invoices: { id: string; at: string; amount: number; plan: string }[] };
}

export interface PosSubscription {
  plan: string;
}

export interface DueCustomer {
  mobile: string;
  name: string;
  outstanding: number;
  bills: Order[];
  collections: DueCollection[];
}

export interface CounterLineInput {
  itemId?: string | undefined;
  name: string;
  variantName?: string | undefined;
  addonNames: string[];
  unitPrice: number;
  quantity: number;
  kitchen: string;
  vegType: CartLine["vegType"];
  note?: string | undefined;
}

interface PosActions {
  loginWithPassword: (mobile: string, password: string) => Promise<{ ok: boolean; error?: LoginError; user?: Staff }>;
  loginWithPin: (staffId: string, pin: string) => Promise<{ ok: boolean; error?: LoginError; user?: Staff }>;
  demoLoginAs: (role: Role) => void;
  selectOutlet: (outletId: string) => void;
  logout: () => void;
  lockToPin: () => void;
  setConnection: (state: ConnectionState) => void;
  retryConnection: () => Promise<void>;
  dismissSessionExpired: () => void;
  expireSession: () => void;
  setLastSection: (sectionId: string) => void;
  refresh: () => Promise<void>;

  openTable: (tableId: string, guests: number) => Promise<ActionResult & { orderId?: string }>;
  setGuests: (orderId: string, guests: number) => Promise<ActionResult>;
  setCustomer: (orderId: string, name: string, mobile: string) => Promise<ActionResult>;
  setOrderMenu: (orderId: string, menuId: string) => Promise<ActionResult>;
  addLine: (orderId: string, line: Omit<CartLine, "id" | "status">) => Promise<ActionResult>;
  updateLineQty: (orderId: string, lineId: string, quantity: number) => Promise<ActionResult>;
  updateLineNote: (orderId: string, lineId: string, note: string) => Promise<ActionResult>;
  removeLine: (orderId: string, lineId: string) => Promise<ActionResult>;
  sendKot: (orderId: string) => Promise<SendKotResult>;
  retryPrintKot: (orderId: string, kotNo: number, printerName?: string) => Promise<ActionResult>;
  holdOrder: (orderId: string) => Promise<ActionResult>;
  requestBill: (orderId: string) => Promise<ActionResult>;
  cancelOrder: (orderId: string, reason: string) => Promise<ActionResult>;
  transferTable: (orderId: string, toTableId: string) => Promise<ActionResult>;
  mergeTables: (fromTableId: string, toTableId: string) => Promise<ActionResult>;
  moveKot: (orderId: string, kotNo: number, toTableId: string) => Promise<ActionResult>;

  createTakeaway: (input: { type: OrderType; name: string; mobile: string }) => Promise<ActionResult & { orderId?: string }>;

  createReservation: (input: Omit<Reservation, "id" | "status">) => Promise<ActionResult>;
  setReservationStatus: (id: string, status: Reservation["status"]) => Promise<ActionResult>;

  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;

  // billing & payments
  applyDiscount: (orderId: string, d: Omit<Discount, "approvedBy">, managerPin?: string) => Promise<ActionResult & { needsPin?: boolean }>;
  removeDiscount: (orderId: string) => Promise<ActionResult>;
  applyPromo: (orderId: string, code: string) => Promise<ActionResult>;
  removePromo: (orderId: string) => Promise<ActionResult>;
  setServiceCharge: (orderId: string, on: boolean) => Promise<ActionResult>;
  printBill: (orderId: string) => Promise<ActionResult>;
  sendEbill: (orderId: string, mobile: string) => Promise<ActionResult>;
  settleBill: (orderId: string, input: { payments: Payment[]; customerName?: string; customerMobile?: string }) => Promise<ActionResult & { change?: number; code?: string }>;
  reprintBill: (orderId: string) => Promise<ActionResult>;
  reprintKot: (orderId: string, kotNo: number) => Promise<ActionResult>;
  reopenBill: (orderId: string) => Promise<ActionResult>;
  createCounterOrder: (input: { type: Order["type"]; lines: CounterLineInput[]; customerName?: string; customerMobile?: string }) => Promise<ActionResult & { orderId?: string; tokenNo?: number; code?: string }>;
  markOrderReady: (orderId: string, ready: boolean) => Promise<ActionResult>;
  collectDue: (mobile: string, amount: number, mode: PaymentModeId) => Promise<ActionResult>;
  openCashSession: (openingFloat: number) => Promise<ActionResult>;
  addCashEntry: (kind: "in" | "out", amount: number, reason: string) => Promise<ActionResult>;
  closeCashSession: (denoms: Record<string, number>) => Promise<ActionResult & { session?: CashSession }>;
}

interface PosSelectors {
  orderForTable: (tableId: string) => Order | undefined;
  orderById: (id: string) => Order | undefined;
  tableById: (id: string) => PosTable | undefined;
  totalsFor: (order: Order | undefined) => OrderTotals;
  runningAmountForTable: (tableId: string) => number;
  itemsForMenu: (menuId: string) => MenuItem[];
  unreadAlertCount: number;
  myRunningOrders: Order[];
  billFor: (order: Order | undefined) => Bill;
  dueCustomers: DueCustomer[];
  nextTokenNo: number;
  cashSales: (since: string) => { cash: number; byMode: Record<string, number>; bills: number };
  expectedCash: number;
  modeLabel: (id: PaymentModeId) => string;
}


export interface ExtActions {
  switchUser: () => void;
  changePin: (current: string, next: string) => Promise<ActionResult>;
  changePassword: (current: string, next: string) => Promise<ActionResult>;
  setAppLock: (on: boolean) => void;
  logAudit: (module: string, action: string) => void;

  advanceKds: (orderId: string, kotNo: number, kitchen: string, lineId?: string) => Promise<ActionResult>;
  recallKds: (orderId: string, kotNo: number, kitchen: string) => Promise<ActionResult>;

  saveMenuItem: (item: MenuItem) => Promise<ActionResult>;
  deleteMenuItem: (id: string) => Promise<ActionResult>;
  toggleOutOfStock: (id: string) => Promise<ActionResult>;
  saveCategory: (c: MenuCategory) => Promise<ActionResult>;
  deleteCategory: (id: string) => Promise<ActionResult>;
  saveAddonGroup: (g: AddonGroup) => Promise<ActionResult>;
  deleteAddonGroup: (id: string) => Promise<ActionResult>;
  saveMenuList: (m: MenuList) => Promise<ActionResult>;
  setMenuPrice: (itemId: string, menuId: string, price: number | null, included: boolean) => Promise<ActionResult>;

  saveSection: (sec: TableSection) => Promise<ActionResult>;
  addTables: (sectionId: string, spec: string, seats: number) => Promise<ActionResult & { added?: number }>;
  deleteTable: (id: string) => Promise<ActionResult>;

  saveStaff: (st: Staff) => Promise<ActionResult>;
  setStaffActive: (id: string, active: boolean) => Promise<ActionResult>;
  setRolePermission: (role: Role, key: ModuleKey | SpecialPermission, action: CrudAction | "special", value: boolean) => void;
  setUserOverride: (staffId: string, perms: Permissions | undefined) => void;
  setUserPermission: (staffId: string, key: ModuleKey | SpecialPermission, action: CrudAction | "special", value: boolean) => void;

  logoutDevice: (id: string) => Promise<ActionResult>;
  savePrinter: (deviceId: string, printer: Printer) => Promise<ActionResult>;
  removePrinter: (deviceId: string, printerId: string) => Promise<ActionResult>;
  testPrint: (deviceId: string, printerId: string) => Promise<ActionResult>;
  setRouting: (deviceId: string, routing: PrinterRouting) => void;

  updateSettings: (patch: Partial<BillingSettings>) => Promise<ActionResult>;
  addPaymentMode: (label: string) => Promise<ActionResult>;
  updatePaymentMode: (id: string, patch: Partial<PaymentModeDef>) => Promise<ActionResult>;
  removePaymentMode: (id: string) => Promise<ActionResult>;
  savePromo: (p: PromoCode, originalCode?: string) => Promise<ActionResult>;
  deletePromo: (code: string) => Promise<ActionResult>;
  setCategoryKitchen: (categoryId: string, kitchen: string) => void;
  resetBillNumbers: () => void;
  resetTokens: () => void;

  addExpenseHead: (name: string) => Promise<ActionResult>;
  addExpense: (e: Omit<Expense, "id" | "at" | "by">) => Promise<ActionResult>;
  deleteExpense: (id: string) => Promise<ActionResult>;

  renewSubscription: () => Promise<ActionResult>;
  requestPlanChange: (plan: string, note: string) => Promise<ActionResult & { ticketId?: string }>;
  raiseTicket: (subject: string, body: string) => Promise<ActionResult & { ticketId?: string }>;
}

type PosContextValue = PosState & PosActions & PosSelectors & ExtActions & { addonGroups: AddonGroup[]; myDiscountLimit: number | null };

const PosContext = createContext<PosContextValue | null>(null);

function initialState(): PosState {
  return {
    booting: true,
    connection: "online",
    sessionExpired: false,
    user: null,
    permissions: rolePermissions.captain,
    outlet: mock.outlets[0]!,
    outlets: clone(mock.outlets),
    staff: clone(mock.staff),
    sections: clone(mock.sections),
    tables: clone(mock.tables),
    categories: clone(mock.categories),
    menus: clone(mock.menus),
    menuItems: clone(mock.menuItems),
    orders: clone([...mock.historyOrders, ...mock.pastOrders, ...mock.orders]),
    reservations: clone(mock.reservations),
    alerts: clone(mock.alerts),
    printers: clone(mock.printers),
    pendingKots: [
      {
        orderId: "ord-3",
        kotNo: 15,
        tableName: "G1",
        printerName: "Garden Printer",
        at: new Date(Date.now() - 10 * 60000).toISOString(),
      },
    ],
    deviceInfo: clone(mock.deviceInfo),
    lastSectionId: mock.sections[0]!.id,
    billingSettings: clone(mock.billingSettings),
    dueCollections: clone(mock.dueCollections),
    cashSession: clone(mock.cashSession),
    cashHistory: [],
    rolePerms: clone(rolePermissions),
    addonGroups: clone(
      Array.from(new Map(mock.menuItems.flatMap((i) => i.addonGroups ?? []).map((g) => [g.id, g])).values()),
    ),
    devices: clone(mock.devices),
    expenseHeads: clone(mock.expenseHeads),
    expenses: clone(mock.expenses),
    audit: clone(mock.audit),
    tickets: [],
    lockedToPin: false,
    appLock: false,
    tokenResetAt: null,
    billResetAt: null,
    subscription: {
      plan: "App Standard",
      expiresAt: new Date(Date.now() + 23 * 86400000).toISOString(),
      ebillCredits: 480,
      invoices: [
        { id: "INV-2291", at: new Date(Date.now() - 342 * 86400000).toISOString(), amount: 11800, plan: "App Standard · 1 year" },
        { id: "INV-1874", at: new Date(Date.now() - 707 * 86400000).toISOString(), amount: 8260, plan: "App Lite · 1 year" },
      ],
    },
  };
}

let idSeq = 1000;
const nextId = (prefix: string) => `${prefix}-${idSeq++}`;

let billPrefix = "A-";
let billResetAt: string | null = null;
let tokenResetAt: string | null = null;

function nextBillCode(orders: Order[]): string {
  const max = orders
    .filter((o) => !billResetAt || o.createdAt >= billResetAt)
    .reduce((m, o) => (o.code.startsWith(billPrefix) ? Math.max(m, Number(o.code.slice(billPrefix.length)) || 0) : m), billResetAt ? 0 : 1042);
  return `${billPrefix}${max + 1}`;
}

function nextToken(orders: Order[]): number {
  return (
    orders
      .filter((o) => (tokenResetAt ? o.createdAt >= tokenResetAt : o.createdAt >= new Date(Date.now() - 12 * 3600000).toISOString()))
      .reduce((m, o) => Math.max(m, o.tokenNo ?? 0), tokenResetAt ? 0 : 204) + 1
  );
}

function modeLabelOf(s: PosState, id: PaymentModeId): string {
  return s.billingSettings.paymentModes.find((m) => m.id === id)?.label ?? id;
}

function ev(s: PosState, label: string): TimelineEvent {
  return { at: new Date().toISOString(), label, by: s.user?.name ?? "Staff" };
}

export function PosProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PosState>(initialState);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(SECTION_PREF_KEY) : null;
    const t = setTimeout(() => {
      setState((s) => ({ ...s, booting: false, lastSectionId: stored ?? s.lastSectionId, appLock: window.localStorage.getItem("billerpe.appLock") === "1" }));
    }, 900);
    return () => clearTimeout(t);
  }, []);

  const patch = useCallback((fn: (s: PosState) => PosState) => setState(fn), []);

  const applyPermissions = (user: Staff): Permissions =>
    user.permissionOverrides ?? state.rolePerms[user.role];

  const liveUser = state.user ? state.staff.find((u) => u.id === state.user!.id) ?? state.user : null;
  const perms: Permissions = useMemo(
    () => (liveUser ? liveUser.permissionOverrides ?? state.rolePerms[liveUser.role] : state.permissions),
    [liveUser, state.rolePerms, state.permissions],
  );
  const myDiscountLimit: number | null = liveUser ? state.billingSettings.discountLimits[liveUser.role] ?? 0 : 0;

  const loginWithPassword = useCallback<PosActions["loginWithPassword"]>(async (mobile, password) => {
    await delay();
    const found = state.staff.find((s) => s.mobile === mobile.trim());
    if (!found || found.password !== password) return { ok: false, error: "wrong-password" };
    if (!found.active) return { ok: false, error: "inactive" };
    patch((s) => ({ ...s, user: found, permissions: applyPermissions(found), sessionExpired: false, lockedToPin: false }));
    return { ok: true, user: found };
  }, [state.staff, patch]);

  const loginWithPin = useCallback<PosActions["loginWithPin"]>(async (staffId, pin) => {
    await delay(250);
    const found = state.staff.find((s) => s.id === staffId);
    if (!found) return { ok: false, error: "wrong-pin" };
    if (found.pin !== pin) return { ok: false, error: "wrong-pin" };
    if (!found.active) return { ok: false, error: "inactive" };
    patch((s) => ({ ...s, user: found, permissions: applyPermissions(found), sessionExpired: false, lockedToPin: false }));
    return { ok: true, user: found };
  }, [state.staff, patch]);

  const demoLoginAs = useCallback<PosActions["demoLoginAs"]>((role) => {
    const found = state.staff.find((s) => s.role === role && s.active);
    if (!found) return;
    patch((s) => ({ ...s, user: found, permissions: applyPermissions(found), sessionExpired: false, lockedToPin: false }));
  }, [state.staff, patch]);

  const selectors: PosSelectors = useMemo(() => {
    const orderById = (id: string) => state.orders.find((o) => o.id === id);
    const orderForTable = (tableId: string) =>
      state.orders.find((o) => o.tableId === tableId && ["running", "hold", "billed"].includes(o.status));

    const totalsFor = (order: Order | undefined): OrderTotals => {
      if (!order) return { subtotal: 0, cgst: 0, sgst: 0, total: 0 };
      const lines = [...order.rounds.flatMap((r) => r.lines), ...order.draftLines];
      const subtotal = round2(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0));
      const { cgst, sgst, total } = taxBreakup(subtotal);
      return { subtotal, cgst, sgst, total: round2(subtotal + total) };
    };

    const cashSales = (since: string) => {
      const byMode: Record<string, number> = {};
      let bills = 0;
      for (const o of state.orders) {
        if (o.status !== "settled" || !o.settledAt || o.settledAt < since) continue;
        bills++;
        for (const p of o.payments ?? []) byMode[p.mode] = round2((byMode[p.mode] ?? 0) + p.amount);
      }
      return { cash: byMode["cash"] ?? 0, byMode, bills };
    };

    const dueMap = new Map<string, DueCustomer>();
    for (const o of state.orders) {
      if (!o.customerMobile || !o.payments?.some((p) => p.mode === "due")) continue;
      const c = dueMap.get(o.customerMobile) ?? { mobile: o.customerMobile, name: o.customerName ?? "Customer", outstanding: 0, bills: [], collections: [] };
      c.bills.push(o);
      c.outstanding = round2(c.outstanding + (o.dueOutstanding ?? 0));
      dueMap.set(o.customerMobile, c);
    }
    for (const col of state.dueCollections) dueMap.get(col.mobile)?.collections.push(col);
    const dueCustomers = [...dueMap.values()].sort((a, b) => b.outstanding - a.outstanding);

    return {
      orderById,
      orderForTable,
      tableById: (id) => state.tables.find((t) => t.id === id),
      totalsFor,
      runningAmountForTable: (tableId) => computeBill(orderForTable(tableId), state.billingSettings).grandTotal,
      itemsForMenu: (menuId) =>
        state.menuItems
          .filter((i) => i.menuIds.includes(menuId) && i.active !== false)
          .map((i) => (i.menuPrices?.[menuId] !== undefined ? { ...i, price: i.menuPrices[menuId]! } : i)),
      unreadAlertCount: state.alerts.filter((a) => !a.read).length,
      myRunningOrders: state.orders.filter(
        (o) => ["running", "hold", "billed"].includes(o.status) && o.captainName === (state.user?.name ?? o.captainName),
      ),
      billFor: (order) => computeBill(order, state.billingSettings),
      dueCustomers,
      nextTokenNo: nextToken(state.orders),
      cashSales,
      expectedCash: state.cashSession
        ? round2(
            state.cashSession.openingFloat +
              cashSales(state.cashSession.openedAt).cash +
              state.dueCollections.filter((c) => c.mode === "cash" && c.at >= state.cashSession!.openedAt).reduce((a, c) => a + c.amount, 0) +
              state.cashSession.entries.reduce((a, e) => a + (e.kind === "in" ? e.amount : -e.amount), 0),
          )
        : 0,
      modeLabel: (id) => modeLabelOf(state, id),
    };
  }, [state]);

  const actions: PosActions = useMemo(() => ({
    loginWithPassword,
    loginWithPin,
    demoLoginAs,
    selectOutlet: (outletId) =>
      patch((s) => ({ ...s, outlet: s.outlets.find((o) => o.id === outletId) ?? s.outlet })),
    logout: () => patch((s) => ({ ...initialState(), booting: false, lastSectionId: s.lastSectionId })),
    lockToPin: () => patch((s) => ({ ...s, user: null, lockedToPin: true })),
    setConnection: (connection) => patch((s) => ({ ...s, connection })),
    retryConnection: async () => {
      patch((s) => ({ ...s, connection: "reconnecting" }));
      await delay(900);
      patch((s) => ({ ...s, connection: "online" }));
    },
    dismissSessionExpired: () => patch((s) => ({ ...s, sessionExpired: false, user: null })),
    expireSession: () => patch((s) => ({ ...s, sessionExpired: true })),
    setLastSection: (sectionId) => {
      if (typeof window !== "undefined") window.localStorage.setItem(SECTION_PREF_KEY, sectionId);
      patch((s) => ({ ...s, lastSectionId: sectionId }));
    },
    refresh: async () => {
      await delay(700);
      patch((s) => ({ ...s }));
    },

    openTable: async (tableId, guests) => {
      await delay(200);
      const existing = state.orders.find(
        (o) => o.tableId === tableId && ["running", "hold", "billed"].includes(o.status),
      );
      if (existing) {
        if (guests && guests !== existing.guests) {
          patch((s) => ({
            ...s,
            orders: s.orders.map((o) => (o.id === existing.id ? { ...o, guests } : o)),
            tables: s.tables.map((t) => (t.id === tableId ? { ...t, guests } : t)),
          }));
        }
        return { ok: true, orderId: existing.id };
      }
      const orderId = nextId("ord");
      const captainName = state.user?.name ?? "Captain";
      patch((s) => ({
        ...s,
        orders: [
          ...s.orders,
          {
            id: orderId,
            code: nextBillCode(s.orders),
            type: "dine-in",
            tableId,
            guests: guests || 1,
            menuId: s.tables.find((t) => t.id === tableId)?.sectionId === "sec-2" ? "menu-garden" : "menu-main",
            captainName,
            status: "running",
            createdAt: new Date().toISOString(),
            rounds: [],
            draftLines: [],
          },
        ],
        tables: s.tables.map((t) =>
          t.id === tableId
            ? { ...t, status: "running" as TableStatus, guests: guests || 1, captainName, openedAt: new Date().toISOString(), qrOrderWaiting: false }
            : t,
        ),
      }));
      return { ok: true, orderId };
    },

    setGuests: async (orderId, guests) => {
      patch((s) => {
        const order = s.orders.find((o) => o.id === orderId);
        return {
          ...s,
          orders: s.orders.map((o) => (o.id === orderId ? { ...o, guests } : o)),
          tables: s.tables.map((t) => (t.id === order?.tableId ? { ...t, guests } : t)),
        };
      });
      return { ok: true };
    },

    setCustomer: async (orderId, customerName, customerMobile) => {
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) => (o.id === orderId ? { ...o, customerName, customerMobile } : o)),
      }));
      return { ok: true };
    },

    setOrderMenu: async (orderId, menuId) => {
      patch((s) => ({ ...s, orders: s.orders.map((o) => (o.id === orderId ? { ...o, menuId } : o)) }));
      return { ok: true };
    },

    addLine: async (orderId, line) => {
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) => {
          if (o.id !== orderId) return o;
          const signature = (l: CartLine) =>
            [l.itemId, l.variantName ?? "", l.addonNames.join("|"), l.note ?? ""].join("~");
          const incoming = { ...line, id: nextId("ln"), status: "new" as const } as CartLine;
          const match = o.draftLines.find((l) => !l.custom && signature(l) === signature(incoming));
          const draftLines = match
            ? o.draftLines.map((l) =>
                l.id === match.id ? { ...l, quantity: round2(l.quantity + incoming.quantity) } : l,
              )
            : [...o.draftLines, incoming];
          return { ...o, draftLines };
        }),
      }));
      return { ok: true };
    },

    updateLineQty: async (orderId, lineId, quantity) => {
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                draftLines:
                  quantity <= 0
                    ? o.draftLines.filter((l) => l.id !== lineId)
                    : o.draftLines.map((l) => (l.id === lineId ? { ...l, quantity } : l)),
              }
            : o,
        ),
      }));
      return { ok: true };
    },

    updateLineNote: async (orderId, lineId, note) => {
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.id === orderId
            ? { ...o, draftLines: o.draftLines.map((l) => (l.id === lineId ? { ...l, note } : l)) }
            : o,
        ),
      }));
      return { ok: true };
    },

    removeLine: async (orderId, lineId) => {
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.id === orderId ? { ...o, draftLines: o.draftLines.filter((l) => l.id !== lineId) } : o,
        ),
      }));
      return { ok: true };
    },

    sendKot: async (orderId) => {
      if (state.connection === "offline") return { ok: false, error: "No internet connection" };
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return { ok: false, error: "Order not found" };
      if (order.draftLines.length === 0) return { ok: false, error: "Add at least one item" };
      await delay(600);

      const kitchen = order.draftLines[0]!.kitchen;
      const printer =
        state.printers.find((p) => (kitchen === "Main Kitchen" ? p.name === "Kitchen Printer" : true)) ??
        state.printers[0]!;
      const tableSection = state.tables.find((t) => t.id === order.tableId)?.sectionId;
      const chosen: Printer =
        tableSection === "sec-2"
          ? state.printers.find((p) => p.name === "Garden Printer") ?? printer
          : printer;
      const routing = state.devices.find((d) => d.thisDevice)?.routing;
      const routedId = routing?.kotPrinterByKitchen[kitchen];
      const routed = routedId ? state.printers.find((p) => p.id === routedId) : undefined;
      const target = tableSection === "sec-2" ? chosen : routed ?? chosen;
      const noPrinting = state.printers.length === 0 || routing?.printKotOnDevice === false;
      const printed = !noPrinting && target.status === "connected";
      const roundNo = order.rounds.length + 1;
      const kotNo = 16 + state.orders.reduce((n, o) => n + o.rounds.length, 0) + 1;

      const round: KotRound = {
        roundNo,
        kotNo,
        sentAt: new Date().toISOString(),
        printed,
        printerName: noPrinting ? "Kitchen screen only" : target.name,
        lines: order.draftLines.map((l) => ({ ...l, status: "sent", roundNo })),
      };

      patch((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.id === orderId
            ? { ...o, status: "running", rounds: [...o.rounds, round], draftLines: [] }
            : o,
        ),
        tables: s.tables.map((t) =>
          t.id === order.tableId ? { ...t, status: "running" as TableStatus } : t,
        ),
        pendingKots: printed
          ? s.pendingKots
          : [
              ...s.pendingKots,
              {
                orderId,
                kotNo,
                tableName: s.tables.find((t) => t.id === order.tableId)?.name ?? `Token ${order.tokenNo ?? ""}`,
                printerName: noPrinting ? "Kitchen screen only" : target.name,
                at: new Date().toISOString(),
              },
            ],
      }));

      return { ok: true, kotNo, printerName: noPrinting ? "Kitchen screen only" : target.name, printed, roundNo };
    },

    retryPrintKot: async (orderId, kotNo, printerName) => {
      await delay(700);
      const success = Boolean(printerName);
      if (!success) return { ok: false, error: "Printer still not reachable" };
      patch((s) => ({
        ...s,
        pendingKots: s.pendingKots.filter((p) => !(p.orderId === orderId && p.kotNo === kotNo)),
        orders: s.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                rounds: o.rounds.map((r) =>
                  r.kotNo === kotNo ? { ...r, printed: true, printerName: printerName! } : r,
                ),
              }
            : o,
        ),
      }));
      return { ok: true };
    },

    holdOrder: async (orderId) => {
      await delay(300);
      const order = state.orders.find((o) => o.id === orderId);
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) => (o.id === orderId ? { ...o, status: "hold" } : o)),
        tables: s.tables.map((t) => (t.id === order?.tableId ? { ...t, status: "hold" as TableStatus } : t)),
      }));
      return { ok: true };
    },

    requestBill: async (orderId) => {
      await delay(300);
      const order = state.orders.find((o) => o.id === orderId);
      if (order && order.rounds.length === 0) return { ok: false, error: "Send a KOT before requesting the bill" };
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) => (o.id === orderId ? { ...o, billRequested: true, status: "billed" } : o)),
        tables: s.tables.map((t) => (t.id === order?.tableId ? { ...t, status: "billed" as TableStatus } : t)),
      }));
      return { ok: true };
    },

    cancelOrder: async (orderId, reason) => {
      if (!reason.trim()) return { ok: false, error: "A reason is required" };
      await delay(300);
      const order = state.orders.find((o) => o.id === orderId);
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.id === orderId
            ? { ...o, status: "cancelled", cancelReason: reason, events: [...(o.events ?? []), { at: new Date().toISOString(), label: `Cancelled — ${reason}`, by: s.user?.name ?? "Staff" }] }
            : o,
        ),
        tables: s.tables.map((t) =>
          t.id === order?.tableId
            ? { ...t, status: "free" as TableStatus, guests: 0, captainName: undefined, openedAt: undefined }
            : t,
        ),
      }));
      return { ok: true };
    },

    transferTable: async (orderId, toTableId) => {
      await delay(400);
      const order = state.orders.find((o) => o.id === orderId);
      const target = state.tables.find((t) => t.id === toTableId);
      if (!order || !target) return { ok: false, error: "Table not found" };
      if (target.status !== "free") return { ok: false, error: `${target.name} is not free` };
      const fromId = order.tableId;
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) => (o.id === orderId ? { ...o, tableId: toTableId } : o)),
        tables: s.tables.map((t) => {
          if (t.id === fromId) return { ...t, status: "free" as TableStatus, guests: 0, captainName: undefined, openedAt: undefined };
          if (t.id === toTableId)
            return { ...t, status: order.status === "hold" ? ("hold" as TableStatus) : ("running" as TableStatus), guests: order.guests, captainName: order.captainName, openedAt: order.createdAt };
          return t;
        }),
      }));
      return { ok: true };
    },

    mergeTables: async (fromTableId, toTableId) => {
      await delay(400);
      const from = state.tables.find((t) => t.id === fromTableId);
      const to = state.tables.find((t) => t.id === toTableId);
      if (!from || !to) return { ok: false, error: "Table not found" };
      if (from.status === "hold" || to.status === "hold")
        return { ok: false, error: "Held tables cannot be merged. Resume the held order first." };
      if (to.status === "billed" || from.status === "billed")
        return { ok: false, error: "A table with a generated bill cannot be merged." };
      const fromOrder = state.orders.find(
        (o) => o.tableId === fromTableId && ["running"].includes(o.status),
      );
      const toOrder = state.orders.find((o) => o.tableId === toTableId && ["running"].includes(o.status));
      if (!fromOrder || !toOrder) return { ok: false, error: "Both tables need a running order to merge." };
      patch((s) => ({
        ...s,
        orders: s.orders
          .map((o) =>
            o.id === toOrder.id
              ? {
                  ...o,
                  guests: o.guests + fromOrder.guests,
                  rounds: [...o.rounds, ...fromOrder.rounds],
                  draftLines: [...o.draftLines, ...fromOrder.draftLines],
                }
              : o,
          )
          .filter((o) => o.id !== fromOrder.id),
        tables: s.tables.map((t) => {
          if (t.id === fromTableId)
            return { ...t, status: "free" as TableStatus, guests: 0, captainName: undefined, openedAt: undefined };
          if (t.id === toTableId)
            return { ...t, guests: t.guests + from.guests, mergedWith: [...(t.mergedWith ?? []), from.name] };
          return t;
        }),
      }));
      return { ok: true };
    },

    moveKot: async (orderId, kotNo, toTableId) => {
      await delay(400);
      const order = state.orders.find((o) => o.id === orderId);
      const round = order?.rounds.find((r) => r.kotNo === kotNo);
      const target = state.tables.find((t) => t.id === toTableId);
      if (!order || !round || !target) return { ok: false, error: "Could not move this KOT" };
      const targetOrder = state.orders.find(
        (o) => o.tableId === toTableId && ["running", "hold"].includes(o.status),
      );
      const newOrderId = nextId("ord");
      patch((s) => ({
        ...s,
        orders: targetOrder
          ? s.orders.map((o) => {
              if (o.id === orderId) return { ...o, rounds: o.rounds.filter((r) => r.kotNo !== kotNo) };
              if (o.id === targetOrder.id) return { ...o, rounds: [...o.rounds, round] };
              return o;
            })
          : [
              ...s.orders.map((o) =>
                o.id === orderId ? { ...o, rounds: o.rounds.filter((r) => r.kotNo !== kotNo) } : o,
              ),
              {
                id: newOrderId,
                code: nextBillCode(s.orders),
                type: "dine-in" as OrderType,
                tableId: toTableId,
                guests: 1,
                menuId: order.menuId,
                captainName: order.captainName,
                status: "running" as const,
                createdAt: new Date().toISOString(),
                rounds: [round],
                draftLines: [],
              },
            ],
        tables: s.tables.map((t) =>
          t.id === toTableId
            ? { ...t, status: "running" as TableStatus, guests: Math.max(1, t.guests), captainName: order.captainName, openedAt: t.openedAt ?? new Date().toISOString() }
            : t,
        ),
      }));
      return { ok: true };
    },

    createTakeaway: async ({ type, name, mobile }) => {
      await delay(250);
      const orderId = nextId("ord");
      const tokenNo = nextToken(state.orders);
      patch((s) => ({
        ...s,
        orders: [
          ...s.orders,
          {
            id: orderId,
            code: `T-${tokenNo}`,
            type,
            tokenNo,
            guests: 0,
            customerName: name || undefined,
            customerMobile: mobile || undefined,
            menuId: "menu-main",
            captainName: s.user?.name ?? "Captain",
            status: "running",
            createdAt: new Date().toISOString(),
            rounds: [],
            draftLines: [],
          },
        ],
      }));
      return { ok: true, orderId };
    },

    createReservation: async (input) => {
      if (!input.name.trim()) return { ok: false, error: "Guest name is required" };
      if (!/^\d{10}$/.test(input.mobile)) return { ok: false, error: "Enter a 10-digit mobile number" };
      await delay(350);
      patch((s) => ({
        ...s,
        reservations: [...s.reservations, { ...input, id: nextId("res"), status: "booked" }],
      }));
      return { ok: true };
    },

    setReservationStatus: async (id, status) => {
      await delay(200);
      patch((s) => ({
        ...s,
        reservations: s.reservations.map((r) => (r.id === id ? { ...r, status } : r)),
      }));
      return { ok: true };
    },

    markAlertRead: (id) =>
      patch((s) => ({ ...s, alerts: s.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)) })),
    markAllAlertsRead: () =>
      patch((s) => ({ ...s, alerts: s.alerts.map((a) => ({ ...a, read: true })) })),

    applyDiscount: async (orderId, d, managerPin) => {
      if (!d.reason.trim()) return { ok: false, error: "Add a reason for the discount" };
      if (d.value <= 0) return { ok: false, error: "Enter a discount amount" };
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return { ok: false, error: "Order not found" };
      const sub = computeBill({ ...order, discount: undefined, promoCode: undefined }, state.billingSettings).subtotal;
      if (d.kind === "percent" && d.value > 100) return { ok: false, error: "Discount cannot be above 100%" };
      if (d.kind === "flat" && d.value > sub) return { ok: false, error: "Discount cannot be more than the bill" };
      const pct = discountPercent(d.kind, d.value, sub);
      let approvedBy: string | undefined;
      if (myDiscountLimit !== null && pct > myDiscountLimit && !perms.special.discountBeyondLimit) {
        if (!managerPin) return { ok: false, needsPin: true, error: `Limit exceeded — above ${myDiscountLimit}% needs manager PIN` };
        await delay(300);
        const approver = state.staff.find((m) => (m.role === "manager" || m.role === "owner") && m.active && m.pin === managerPin);
        if (!approver) return { ok: false, needsPin: true, error: "Wrong manager PIN" };
        approvedBy = approver.name;
      }
      await delay(250);
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.id === orderId
            ? { ...o, discount: { ...d, approvedBy }, events: [...(o.events ?? []), ev(s, `Discount ${d.kind === "percent" ? `${d.value}%` : `₹${d.value}`} — ${d.reason}${approvedBy ? ` (approved by ${approvedBy})` : ""}`)] }
            : o,
        ),
      }));
      return { ok: true };
    },

    removeDiscount: async (orderId) => {
      patch((s) => ({ ...s, orders: s.orders.map((o) => (o.id === orderId ? { ...o, discount: undefined } : o)) }));
      return { ok: true };
    },

    applyPromo: async (orderId, code) => {
      await delay(300);
      const promo = state.billingSettings.promoCodes.find((p) => p.code === code.trim().toUpperCase());
      if (!promo) return { ok: false, error: "This promo code is not valid" };
      const order = state.orders.find((o) => o.id === orderId);
      const sub = computeBill(order, state.billingSettings).subtotal;
      if (sub < promo.minBill) return { ok: false, error: `Valid on bills above ₹${promo.minBill}` };
      patch((s) => ({ ...s, orders: s.orders.map((o) => (o.id === orderId ? { ...o, promoCode: promo.code } : o)) }));
      return { ok: true };
    },

    removePromo: async (orderId) => {
      patch((s) => ({ ...s, orders: s.orders.map((o) => (o.id === orderId ? { ...o, promoCode: undefined } : o)) }));
      return { ok: true };
    },

    setServiceCharge: async (orderId, on) => {
      patch((s) => ({ ...s, orders: s.orders.map((o) => (o.id === orderId ? { ...o, serviceChargeOn: on } : o)) }));
      return { ok: true };
    },

    printBill: async (orderId) => {
      if (state.connection === "offline") return { ok: false, error: "No internet connection" };
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return { ok: false, error: "Order not found" };
      if (order.draftLines.length > 0) return { ok: false, error: "Send the pending KOT before printing the bill" };
      if (order.rounds.length === 0) return { ok: false, error: "Nothing to bill yet" };
      await delay(600);
      const at = new Date().toISOString();
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.id === orderId
            ? { ...o, status: o.status === "settled" ? o.status : "billed", billPrintedAt: at, events: [...(o.events ?? []), ev(s, "Bill printed")] }
            : o,
        ),
        tables: s.tables.map((t) => (t.id === order.tableId ? { ...t, status: "billed" as TableStatus } : t)),
      }));
      return { ok: true };
    },

    sendEbill: async (orderId, mobile) => {
      if (!/^\d{10}$/.test(mobile)) return { ok: false, error: "Enter a 10-digit mobile number" };
      await delay(500);
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.id === orderId ? { ...o, customerMobile: o.customerMobile ?? mobile, events: [...(o.events ?? []), ev(s, `E-bill sent by SMS to ${mobile}`)] } : o,
        ),
      }));
      return { ok: true };
    },

    settleBill: async (orderId, { payments, customerName, customerMobile }) => {
      if (state.connection === "offline") return { ok: false, error: "No internet connection" };
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return { ok: false, error: "Order not found" };
      const bill = computeBill(order, state.billingSettings);
      const rows = payments.filter((p) => p.amount > 0);
      if (rows.length === 0) return { ok: false, error: "Add a payment" };
      const nonCash = round2(rows.filter((p) => p.mode !== "cash").reduce((a, p) => a + p.amount, 0));
      const cash = round2(rows.filter((p) => p.mode === "cash").reduce((a, p) => a + p.amount, 0));
      if (nonCash > bill.grandTotal) return { ok: false, error: "Non-cash payments cannot be more than the bill" };
      if (round2(nonCash + cash) < bill.grandTotal) return { ok: false, error: "Payments are short of the bill" };
      const due = round2(rows.filter((p) => p.mode === "due").reduce((a, p) => a + p.amount, 0));
      if (due > 0 && (!customerName?.trim() || !/^\d{10}$/.test(customerMobile ?? "")))
        return { ok: false, error: "Due needs the customer's name and 10-digit mobile" };
      await delay(700);
      const change = round2(nonCash + cash - bill.grandTotal);
      const cashKept = round2(cash - change);
      const finalPayments = rows
        .map((p) => (p.mode === "cash" ? { ...p, amount: 0 } : p))
        .filter((p) => p.mode !== "cash")
        .concat(cashKept > 0 ? [{ mode: "cash", amount: cashKept }] : []);
      const at = new Date().toISOString();
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: "settled",
                payments: finalPayments,
                changeReturned: change > 0 ? change : undefined,
                dueOutstanding: due > 0 ? due : undefined,
                customerName: customerName?.trim() || o.customerName,
                customerMobile: customerMobile || o.customerMobile,
                settledAt: at,
                settledBy: s.user?.name ?? "Staff",
                settledTotal: bill.grandTotal,
                billPrintedAt: o.billPrintedAt ?? at,
                events: [...(o.events ?? []), ev(s, `Settled ₹${bill.grandTotal} · ${finalPayments.map((p) => modeLabelOf(s, p.mode)).join(" + ")}`)],
              }
            : o,
        ),
        tables: s.tables.map((t) =>
          t.id === order.tableId
            ? { ...t, status: "free" as TableStatus, guests: 0, captainName: undefined, openedAt: undefined, mergedWith: undefined }
            : t,
        ),
      }));
      return { ok: true, change, code: order.code };
    },

    reprintBill: async (orderId) => {
      await delay(500);
      patch((s) => ({ ...s, orders: s.orders.map((o) => (o.id === orderId ? { ...o, events: [...(o.events ?? []), ev(s, "Bill reprinted")] } : o)) }));
      return { ok: true };
    },

    reprintKot: async (orderId, kotNo) => {
      await delay(500);
      patch((s) => ({ ...s, orders: s.orders.map((o) => (o.id === orderId ? { ...o, events: [...(o.events ?? []), ev(s, `KOT #${kotNo} reprinted`)] } : o)) }));
      return { ok: true };
    },

    reopenBill: async (orderId) => {
      if (!perms.special.reopenSettledBill) return { ok: false, error: "Not allowed" };
      await delay(400);
      const order = state.orders.find((o) => o.id === orderId);
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.id === orderId
            ? { ...o, status: "billed", payments: undefined, changeReturned: undefined, dueOutstanding: undefined, settledAt: undefined, settledTotal: undefined, events: [...(o.events ?? []), ev(s, "Settled bill reopened for editing")] }
            : o,
        ),
        tables: s.tables.map((t) => (t.id === order?.tableId && t.status === "free" ? { ...t, status: "billed" as TableStatus, guests: order?.guests ?? 1 } : t)),
      }));
      return { ok: true };
    },

    createCounterOrder: async ({ type, lines, customerName, customerMobile }) => {
      if (state.connection === "offline") return { ok: false, error: "No internet connection" };
      if (lines.length === 0) return { ok: false, error: "Add at least one item" };
      if (type === "delivery" && (!customerName?.trim() || !/^\d{10}$/.test(customerMobile ?? "")))
        return { ok: false, error: "Delivery needs the customer's name and 10-digit mobile" };
      await delay(600);
      const orderId = nextId("ord");
      const tokenNo = nextToken(state.orders);
      const kotNo = 16 + state.orders.reduce((n, o) => n + o.rounds.length, 0) + 1;
      const code = type === "dine-in" ? nextBillCode(state.orders) : `T-${tokenNo}`;
      const at = new Date().toISOString();
      const by = state.user?.name ?? "Cashier";
      patch((s) => ({
        ...s,
        orders: [
          ...s.orders,
          {
            id: orderId,
            code,
            type,
            tokenNo,
            guests: type === "dine-in" ? 1 : 0,
            customerName: customerName?.trim() || undefined,
            customerMobile: customerMobile || undefined,
            menuId: "menu-main",
            captainName: by,
            status: "running",
            createdAt: at,
            draftLines: [],
            rounds: [
              {
                roundNo: 1,
                kotNo,
                sentAt: at,
                printed: true,
                printerName: "Built-in printer",
                lines: lines.map((l) => ({ ...l, id: nextId("ln"), status: "sent" as const, roundNo: 1 })),
              },
            ],
            events: [{ at, label: `Counter order · token ${tokenNo}`, by }],
          },
        ],
      }));
      return { ok: true, orderId, tokenNo, code };
    },

    markOrderReady: async (orderId, ready) => {
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                readyAt: ready ? new Date().toISOString() : undefined,
                rounds: o.rounds.map((r) => ({ ...r, lines: r.lines.map((l) => ({ ...l, status: ready ? "ready" as const : "sent" as const })) })),
              }
            : o,
        ),
      }));
      return { ok: true };
    },

    collectDue: async (mobile, amt, mode) => {
      if (amt <= 0) return { ok: false, error: "Enter an amount" };
      if (mode === "due") return { ok: false, error: "Pick how the customer paid" };
      const bills = state.orders
        .filter((o) => o.customerMobile === mobile && (o.dueOutstanding ?? 0) > 0)
        .sort((a, b) => (a.settledAt ?? "").localeCompare(b.settledAt ?? ""));
      const outstanding = round2(bills.reduce((a, o) => a + (o.dueOutstanding ?? 0), 0));
      if (amt > outstanding) return { ok: false, error: `Only ${outstanding.toFixed(2)} is due` };
      await delay(500);
      let left = amt;
      const updates = new Map<string, number>();
      for (const b of bills) {
        const take = Math.min(left, b.dueOutstanding ?? 0);
        updates.set(b.id, round2((b.dueOutstanding ?? 0) - take));
        left = round2(left - take);
        if (left <= 0) break;
      }
      patch((s) => ({
        ...s,
        orders: s.orders.map((o) => (updates.has(o.id) ? { ...o, dueOutstanding: updates.get(o.id)! || undefined } : o)),
        dueCollections: [
          { id: nextId("due"), mobile, name: bills[0]?.customerName ?? "Customer", amount: amt, mode, at: new Date().toISOString(), by: s.user?.name ?? "Staff" },
          ...s.dueCollections,
        ],
      }));
      return { ok: true };
    },

    openCashSession: async (openingFloat) => {
      if (state.cashSession) return { ok: false, error: "A cash session is already open" };
      await delay(400);
      patch((s) => ({
        ...s,
        cashSession: { id: nextId("cs"), openedAt: new Date().toISOString(), openedBy: s.user?.name ?? "Staff", openingFloat, entries: [] },
      }));
      return { ok: true };
    },

    addCashEntry: async (kind, amt, reason) => {
      if (!state.cashSession) return { ok: false, error: "Open a cash session first" };
      if (amt <= 0) return { ok: false, error: "Enter an amount" };
      if (!reason.trim()) return { ok: false, error: "Add a reason" };
      await delay(300);
      patch((s) => ({
        ...s,
        cashSession: s.cashSession
          ? { ...s.cashSession, entries: [{ id: nextId("ce"), kind, amount: amt, reason: reason.trim(), at: new Date().toISOString(), by: s.user?.name ?? "Staff" }, ...s.cashSession.entries] }
          : null,
      }));
      return { ok: true };
    },

    closeCashSession: async (denoms) => {
      const session = state.cashSession;
      if (!session) return { ok: false, error: "No open cash session" };
      await delay(600);
      const counted = round2(Object.entries(denoms).reduce((a, [d, n]) => a + Number(d) * n, 0));
      const closed: CashSession = {
        ...session,
        closedAt: new Date().toISOString(),
        closedBy: state.user?.name ?? "Staff",
        expected: selectors.expectedCash,
        counted,
        denominations: denoms,
      };
      patch((s) => ({ ...s, cashSession: null, cashHistory: [closed, ...s.cashHistory] }));
      return { ok: true, session: closed };
    },
  }), [state, perms, myDiscountLimit, selectors, patch, loginWithPassword, loginWithPin, demoLoginAs]);



  const ext: ExtActions = useMemo(() => {
    const me = state.user;
    const who = me?.name ?? "Staff";
    const auditEntry = (module: string, action: string): AuditEntry => ({
      id: nextId("au"), at: new Date().toISOString(), by: who, role: me?.role ?? "owner", module, action,
    });
    const log = (module: string, action: string) => patch((s) => ({ ...s, audit: [auditEntry(module, action), ...s.audit] }));
    const devicePrinters = (s: PosState, deviceId: string) =>
      s.devices.find((d) => d.id === deviceId)?.thisDevice ? s.printers : s.devices.find((d) => d.id === deviceId)?.printers ?? [];
    const withDevicePrinters = (s: PosState, deviceId: string, fn: (p: Printer[]) => Printer[]): PosState => {
      const dev = s.devices.find((d) => d.id === deviceId);
      if (dev?.thisDevice) return { ...s, printers: fn(s.printers) };
      return { ...s, devices: s.devices.map((d) => (d.id === deviceId ? { ...d, printers: fn(d.printers) } : d)) };
    };
    const editPerm = (p: Permissions, key: string, action: string, value: boolean): Permissions =>
      action === "special"
        ? { ...p, special: { ...p.special, [key]: value } }
        : { ...p, modules: { ...p.modules, [key]: { ...(p.modules[key as ModuleKey] ?? {}), [action]: value } } };

    return {
      switchUser: () => patch((s) => ({ ...s, user: null, lockedToPin: true })),
      changePin: async (current, next) => {
        if (!me) return { ok: false, error: "Not signed in" };
        const u = state.staff.find((x) => x.id === me.id)!;
        if (u.pin !== current) return { ok: false, error: "Current PIN is wrong" };
        if (!/^\d{4}$/.test(next)) return { ok: false, error: "New PIN must be 4 digits" };
        if (state.staff.some((x) => x.id !== me.id && x.pin === next)) return { ok: false, error: "This PIN is used by someone else" };
        await delay(300);
        patch((s) => ({ ...s, staff: s.staff.map((x) => (x.id === me.id ? { ...x, pin: next } : x)), user: s.user ? { ...s.user, pin: next } : null }));
        log("Profile", "Changed PIN");
        return { ok: true };
      },
      changePassword: async (current, next) => {
        if (!me) return { ok: false, error: "Not signed in" };
        const u = state.staff.find((x) => x.id === me.id)!;
        if (u.password !== current) return { ok: false, error: "Current password is wrong" };
        if (next.length < 6) return { ok: false, error: "Use at least 6 characters" };
        await delay(300);
        patch((s) => ({ ...s, staff: s.staff.map((x) => (x.id === me.id ? { ...x, password: next } : x)) }));
        log("Profile", "Changed password");
        return { ok: true };
      },
      setAppLock: (on) => {
        if (typeof window !== "undefined") window.localStorage.setItem("billerpe.appLock", on ? "1" : "0");
        patch((s) => ({ ...s, appLock: on }));
      },
      logAudit: log,

      advanceKds: async (orderId, kotNo, kitchen, lineId) => {
        const order = state.orders.find((o) => o.id === orderId);
        const round = order?.rounds.find((r) => r.kotNo === kotNo);
        if (!order || !round) return { ok: false, error: "KOT not found" };
        const next = (st: CartLine["status"]): CartLine["status"] =>
          st === "sent" || st === "new" ? "preparing" : st === "preparing" ? "ready" : st === "ready" ? "served" : st;
        const lines = round.lines.map((l) => {
          if (l.kitchen !== kitchen) return l;
          if (lineId && l.id !== lineId) return l;
          if (!lineId) {
            // whole card moves to the next stage of its slowest line
            const group = round.lines.filter((x) => x.kitchen === kitchen);
            const order2 = ["new", "sent", "preparing", "ready", "served"];
            const min = group.reduce((m, x) => Math.min(m, order2.indexOf(x.status)), 9);
            return { ...l, status: next(order2[min] as CartLine["status"]) };
          }
          return { ...l, status: next(l.status) };
        });
        const group = lines.filter((l) => l.kitchen === kitchen);
        const becameReady =
          group.every((l) => l.status === "ready" || l.status === "served") &&
          !round.lines.filter((l) => l.kitchen === kitchen).every((l) => l.status === "ready" || l.status === "served") &&
          group.some((l) => l.status === "ready");
        const tableName = order.tableId ? state.tables.find((t) => t.id === order.tableId)?.name ?? "" : `Token ${order.tokenNo ?? ""}`;
        patch((s) => ({
          ...s,
          orders: s.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  readyAt: becameReady && o.type !== "dine-in" ? new Date().toISOString() : o.readyAt,
                  rounds: o.rounds.map((r) => (r.kotNo === kotNo ? { ...r, lines } : r)),
                }
              : o,
          ),
          alerts: becameReady
            ? [
                {
                  id: nextId("alr"),
                  kind: "food-ready" as const,
                  title: `${group.map((l) => l.name).slice(0, 2).join(", ")}${group.length > 2 ? "…" : ""} ready`,
                  body: `${tableName} · KOT #${kotNo} · ${kitchen} · for ${order.captainName}`,
                  at: new Date().toISOString(),
                  read: false,
                },
                ...s.alerts,
              ]
            : s.alerts,
        }));
        return { ok: true };
      },
      recallKds: async (orderId, kotNo, kitchen) => {
        patch((s) => ({
          ...s,
          orders: s.orders.map((o) =>
            o.id === orderId
              ? { ...o, rounds: o.rounds.map((r) => (r.kotNo === kotNo ? { ...r, lines: r.lines.map((l) => (l.kitchen === kitchen ? { ...l, status: "ready" as const } : l)) } : r)) }
              : o,
          ),
        }));
        return { ok: true };
      },

      saveMenuItem: async (item) => {
        if (!item.name.trim()) return { ok: false, error: "Name is required" };
        if (!item.shortCode.trim()) return { ok: false, error: "Short code is required" };
        if (item.price <= 0) return { ok: false, error: "Price must be more than 0" };
        if (state.menuItems.some((i) => i.id !== item.id && i.shortCode.toLowerCase() === item.shortCode.trim().toLowerCase()))
          return { ok: false, error: "Short code already used" };
        if (item.menuIds.length === 0) return { ok: false, error: "Add the item to at least one menu" };
        await delay(300);
        const exists = state.menuItems.some((i) => i.id === item.id);
        const clean = { ...item, name: item.name.trim(), shortCode: item.shortCode.trim().toUpperCase() };
        patch((s) => ({ ...s, menuItems: exists ? s.menuItems.map((i) => (i.id === item.id ? clean : i)) : [...s.menuItems, clean] }));
        log("Menu", `${exists ? "Edited" : "Added"} item ${clean.name}`);
        return { ok: true };
      },
      deleteMenuItem: async (id) => {
        const it = state.menuItems.find((i) => i.id === id);
        patch((s) => ({ ...s, menuItems: s.menuItems.filter((i) => i.id !== id) }));
        log("Menu", `Deleted item ${it?.name ?? id}`);
        return { ok: true };
      },
      toggleOutOfStock: async (id) => {
        const it = state.menuItems.find((i) => i.id === id);
        patch((s) => ({ ...s, menuItems: s.menuItems.map((i) => (i.id === id ? { ...i, outOfStock: !i.outOfStock } : i)) }));
        log("Menu", `Marked ${it?.name} ${it?.outOfStock ? "in stock" : "out of stock"}`);
        return { ok: true };
      },
      saveCategory: async (c) => {
        if (!c.name.trim()) return { ok: false, error: "Name is required" };
        const exists = state.categories.some((x) => x.id === c.id);
        patch((s) => ({
          ...s,
          categories: (exists ? s.categories.map((x) => (x.id === c.id ? c : x)) : [...s.categories, c]).sort((a, b) => a.sort - b.sort),
        }));
        log("Menu", `${exists ? "Edited" : "Added"} category ${c.name}`);
        return { ok: true };
      },
      deleteCategory: async (id) => {
        if (state.menuItems.some((i) => i.categoryId === id)) return { ok: false, error: "Move or delete its items first" };
        patch((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== id) }));
        return { ok: true };
      },
      saveAddonGroup: async (g) => {
        if (!g.name.trim()) return { ok: false, error: "Name is required" };
        if (g.options.length === 0) return { ok: false, error: "Add at least one option" };
        if (g.options.some((o) => !o.name.trim())) return { ok: false, error: "Every option needs a name" };
        if (g.min > g.max) return { ok: false, error: "Min cannot be more than max" };
        if (g.max > g.options.length) return { ok: false, error: "Max cannot be more than the number of options" };
        patch((s) => ({
          ...s,
          addonGroups: s.addonGroups.some((x) => x.id === g.id) ? s.addonGroups.map((x) => (x.id === g.id ? g : x)) : [...s.addonGroups, g],
          menuItems: s.menuItems.map((i) => (i.addonGroups?.some((x) => x.id === g.id) ? { ...i, addonGroups: i.addonGroups.map((x) => (x.id === g.id ? g : x)) } : i)),
        }));
        log("Menu", `Saved addon group ${g.name}`);
        return { ok: true };
      },
      deleteAddonGroup: async (id) => {
        patch((s) => ({
          ...s,
          addonGroups: s.addonGroups.filter((g) => g.id !== id),
          menuItems: s.menuItems.map((i) => ({ ...i, addonGroups: i.addonGroups?.filter((g) => g.id !== id) })),
        }));
        return { ok: true };
      },
      saveMenuList: async (m) => {
        if (!m.name.trim()) return { ok: false, error: "Name is required" };
        patch((s) => ({ ...s, menus: s.menus.some((x) => x.id === m.id) ? s.menus.map((x) => (x.id === m.id ? m : x)) : [...s.menus, m] }));
        log("Menu", `Saved menu ${m.name}`);
        return { ok: true };
      },
      setMenuPrice: async (itemId, menuId, price, included) => {
        patch((s) => ({
          ...s,
          menuItems: s.menuItems.map((i) => {
            if (i.id !== itemId) return i;
            const menuPrices = { ...(i.menuPrices ?? {}) };
            if (price === null) delete menuPrices[menuId];
            else menuPrices[menuId] = price;
            const menuIds = included ? Array.from(new Set([...i.menuIds, menuId])) : i.menuIds.filter((x) => x !== menuId);
            return { ...i, menuPrices, menuIds };
          }),
        }));
        return { ok: true };
      },

      saveSection: async (sec) => {
        if (!sec.name.trim()) return { ok: false, error: "Name is required" };
        patch((s) => ({ ...s, sections: s.sections.some((x) => x.id === sec.id) ? s.sections.map((x) => (x.id === sec.id ? sec : x)) : [...s.sections, sec] }));
        log("Tables", `Saved section ${sec.name}`);
        return { ok: true };
      },
      addTables: async (sectionId, spec, seats) => {
        const m = spec.trim().toUpperCase().match(/^([A-Z]*)(\d+)(?:\s*[-–—]\s*([A-Z]*)(\d+))?$/);
        if (!m) return { ok: false, error: "Use a name like T5 or a range like T1–T20" };
        const prefix = m[1] ?? "";
        const from = Number(m[2]);
        const to = m[4] ? Number(m[4]) : from;
        if (to < from) return { ok: false, error: "Range end must be after the start" };
        if (to - from > 99) return { ok: false, error: "Add up to 100 tables at a time" };
        if (seats < 1) return { ok: false, error: "Seats must be at least 1" };
        const names = Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
        const taken = names.filter((n) => state.tables.some((t) => t.name === n));
        if (taken.length === names.length) return { ok: false, error: `${taken.join(", ")} already exist` };
        await delay(300);
        const fresh = names.filter((n) => !taken.includes(n)).map((name) => ({ id: nextId("tbl"), name, sectionId, seats, status: "free" as TableStatus, guests: 0 }));
        patch((s) => ({ ...s, tables: [...s.tables, ...fresh] }));
        log("Tables", `Added ${fresh.length} table(s): ${fresh.map((t) => t.name).join(", ")}`);
        return { ok: true, added: fresh.length, error: taken.length ? `Skipped existing ${taken.join(", ")}` : undefined };
      },
      deleteTable: async (id) => {
        const t = state.tables.find((x) => x.id === id);
        if (t && t.status !== "free") return { ok: false, error: "Only free tables can be deleted" };
        patch((s) => ({ ...s, tables: s.tables.filter((x) => x.id !== id) }));
        log("Tables", `Deleted table ${t?.name}`);
        return { ok: true };
      },

      saveStaff: async (st) => {
        const existing = state.staff.find((x) => x.id === st.id);
        if (existing?.isOwner && me?.id !== existing.id) return { ok: false, error: "Only the owner can edit the owner" };
        if (existing?.isOwner && st.role !== "owner") return { ok: false, error: "The owner's role cannot change" };
        if (!existing && st.role === "owner") return { ok: false, error: "There can be only one owner" };
        if (!st.name.trim()) return { ok: false, error: "Name is required" };
        if (!/^\d{10}$/.test(st.mobile)) return { ok: false, error: "Enter a 10-digit mobile number" };
        if (state.staff.some((x) => x.id !== st.id && x.mobile === st.mobile)) return { ok: false, error: "Mobile already used by another staff" };
        if (!/^\d{4}$/.test(st.pin)) return { ok: false, error: "PIN must be 4 digits" };
        if (state.staff.some((x) => x.id !== st.id && x.pin === st.pin)) return { ok: false, error: "PIN already used by another staff" };
        if (st.password.length < 6) return { ok: false, error: "Password needs at least 6 characters" };
        await delay(300);
        patch((s) => ({ ...s, staff: existing ? s.staff.map((x) => (x.id === st.id ? st : x)) : [...s.staff, st] }));
        log("Staff", `${existing ? "Edited" : "Added"} ${st.name} (${st.role})`);
        return { ok: true };
      },
      setStaffActive: async (id, active) => {
        const st = state.staff.find((x) => x.id === id);
        if (st?.isOwner) return { ok: false, error: "The owner cannot be deactivated" };
        patch((s) => ({ ...s, staff: s.staff.map((x) => (x.id === id ? { ...x, active } : x)) }));
        log("Staff", `${active ? "Activated" : "Deactivated"} ${st?.name}`);
        return { ok: true };
      },
      setRolePermission: (role, key, action, value) => {
        patch((s) => ({ ...s, rolePerms: { ...s.rolePerms, [role]: editPerm(s.rolePerms[role], key, action, value) } }));
        log("Permissions", `${value ? "Allowed" : "Removed"} ${key}${action === "special" ? "" : ` · ${action}`} for ${role}`);
      },
      setUserOverride: (staffId, perms) => {
        patch((s) => ({ ...s, staff: s.staff.map((x) => (x.id === staffId ? { ...x, permissionOverrides: perms } : x)) }));
        log("Permissions", `${perms ? "Custom permissions on" : "Custom permissions off"} for ${state.staff.find((x) => x.id === staffId)?.name}`);
      },
      setUserPermission: (staffId, key, action, value) => {
        patch((s) => ({
          ...s,
          staff: s.staff.map((x) =>
            x.id === staffId ? { ...x, permissionOverrides: editPerm(x.permissionOverrides ?? s.rolePerms[x.role], key, action, value) } : x,
          ),
        }));
      },

      logoutDevice: async (id) => {
        const d = state.devices.find((x) => x.id === id);
        if (d?.thisDevice) return { ok: false, error: "Use Logout in Profile for this device" };
        await delay(400);
        patch((s) => ({ ...s, devices: s.devices.filter((x) => x.id !== id), outlet: { ...s.outlet, devicesInUse: Math.max(0, s.outlet.devicesInUse - 1) } }));
        log("Devices", `Logged out ${d?.name}`);
        return { ok: true };
      },
      savePrinter: async (deviceId, printer) => {
        if (!printer.name.trim()) return { ok: false, error: "Printer name is required" };
        if (printer.kind === "wifi" && !/^\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/.test(printer.address ?? ""))
          return { ok: false, error: "Enter IP and port like 192.168.1.60:9100" };
        if ((printer.copies ?? 1) < 1 || (printer.copies ?? 1) > 5) return { ok: false, error: "Copies must be 1 to 5" };
        await delay(400);
        patch((s) =>
          withDevicePrinters(s, deviceId, (list) => (list.some((p) => p.id === printer.id) ? list.map((p) => (p.id === printer.id ? printer : p)) : [...list, printer])),
        );
        log("Printers", `Saved printer ${printer.name}`);
        return { ok: true };
      },
      removePrinter: async (deviceId, printerId) => {
        patch((s) => withDevicePrinters(s, deviceId, (list) => list.filter((p) => p.id !== printerId)));
        return { ok: true };
      },
      testPrint: async (deviceId, printerId) => {
        await delay(900);
        const p = devicePrinters(state, deviceId).find((x) => x.id === printerId);
        if (!p) return { ok: false, error: "Printer not found" };
        if (p.status === "unreachable") return { ok: false, error: `${p.name} is not reachable. Check power and Wi-Fi.` };
        if (p.status === "unsupported") return { ok: false, error: "Driver not supported yet — tell support your model." };
        return { ok: true };
      },
      setRouting: (deviceId, routing) => patch((s) => ({ ...s, devices: s.devices.map((d) => (d.id === deviceId ? { ...d, routing } : d)) })),

      updateSettings: async (p) => {
        if (p.taxRate !== undefined && (p.taxRate < 0 || p.taxRate > 0.28)) return { ok: false, error: "GST must be between 0% and 28%" };
        if (p.serviceChargeRate !== undefined && p.serviceChargeRate > 0.2) return { ok: false, error: "Service charge can be at most 20%" };
        if (p.billPrefix !== undefined && !/^[A-Z0-9/-]{1,6}$/i.test(p.billPrefix)) return { ok: false, error: "Prefix: up to 6 letters, numbers, - or /" };
        if (p.invoice?.gstin !== undefined && p.invoice.gstin && !/^[0-9A-Z]{15}$/.test(p.invoice.gstin)) return { ok: false, error: "GSTIN must be 15 characters" };
        if (p.invoice?.fssai !== undefined && p.invoice.fssai && !/^\d{14}$/.test(p.invoice.fssai)) return { ok: false, error: "FSSAI must be 14 digits" };
        await delay(250);
        if (p.billPrefix) billPrefix = p.billPrefix.toUpperCase();
        patch((s) => ({ ...s, billingSettings: { ...s.billingSettings, ...p, billPrefix: (p.billPrefix ?? s.billingSettings.billPrefix).toUpperCase() } }));
        log("Settings", `Updated ${Object.keys(p).join(", ")}`);
        return { ok: true };
      },
      addPaymentMode: async (label) => {
        const l = label.trim();
        if (!l) return { ok: false, error: "Name is required" };
        if (l.length > 20) return { ok: false, error: "Keep it under 20 characters" };
        if (state.billingSettings.paymentModes.some((m) => m.label.toLowerCase() === l.toLowerCase())) return { ok: false, error: "This mode already exists" };
        patch((s) => ({ ...s, billingSettings: { ...s.billingSettings, paymentModes: [...s.billingSettings.paymentModes, { id: nextId("pm"), label: l, custom: true }] } }));
        log("Settings", `Added payment mode ${l}`);
        return { ok: true };
      },
      updatePaymentMode: async (id, p) => {
        const m = state.billingSettings.paymentModes.find((x) => x.id === id);
        if (m?.locked) return { ok: false, error: `${m.label} is locked` };
        if (p.label !== undefined && !p.label.trim()) return { ok: false, error: "Name is required" };
        patch((s) => ({ ...s, billingSettings: { ...s.billingSettings, paymentModes: s.billingSettings.paymentModes.map((x) => (x.id === id ? { ...x, ...p } : x)) } }));
        return { ok: true };
      },
      removePaymentMode: async (id) => {
        const m = state.billingSettings.paymentModes.find((x) => x.id === id);
        if (!m?.custom) return { ok: false, error: "Only custom modes can be removed" };
        patch((s) => ({ ...s, billingSettings: { ...s.billingSettings, paymentModes: s.billingSettings.paymentModes.filter((x) => x.id !== id) } }));
        return { ok: true };
      },
      savePromo: async (p, originalCode) => {
        const code = p.code.trim().toUpperCase();
        if (!/^[A-Z0-9]{3,12}$/.test(code)) return { ok: false, error: "Code: 3–12 letters or numbers" };
        if (p.value <= 0) return { ok: false, error: "Enter a value" };
        if (p.kind === "percent" && p.value > 100) return { ok: false, error: "Percent cannot be above 100" };
        if (state.billingSettings.promoCodes.some((x) => x.code === code && x.code !== originalCode)) return { ok: false, error: "Code already exists" };
        const label = p.kind === "percent" ? `${p.value}% off above ₹${p.minBill}` : `₹${p.value} off above ₹${p.minBill}`;
        patch((s) => ({
          ...s,
          billingSettings: {
            ...s.billingSettings,
            promoCodes: [...s.billingSettings.promoCodes.filter((x) => x.code !== (originalCode ?? code)), { ...p, code, label }],
          },
        }));
        log("Settings", `Saved promo ${code}`);
        return { ok: true };
      },
      deletePromo: async (code) => {
        patch((s) => ({ ...s, billingSettings: { ...s.billingSettings, promoCodes: s.billingSettings.promoCodes.filter((x) => x.code !== code) } }));
        return { ok: true };
      },
      setCategoryKitchen: (categoryId, kitchen) => {
        patch((s) => ({
          ...s,
          billingSettings: { ...s.billingSettings, categoryKitchen: { ...s.billingSettings.categoryKitchen, [categoryId]: kitchen } },
          menuItems: s.menuItems.map((i) => (i.categoryId === categoryId ? { ...i, kitchen } : i)),
        }));
        log("Settings", `Routed ${state.categories.find((c) => c.id === categoryId)?.name} to ${kitchen}`);
      },
      resetBillNumbers: () => {
        billResetAt = new Date().toISOString();
        patch((s) => ({ ...s, billResetAt }));
        log("Settings", "Reset bill numbers");
      },
      resetTokens: () => {
        tokenResetAt = new Date().toISOString();
        patch((s) => ({ ...s, tokenResetAt }));
        log("Settings", "Reset token numbers");
      },

      addExpenseHead: async (name) => {
        if (!name.trim()) return { ok: false, error: "Name is required" };
        if (state.expenseHeads.some((h) => h.name.toLowerCase() === name.trim().toLowerCase())) return { ok: false, error: "Head already exists" };
        patch((s) => ({ ...s, expenseHeads: [...s.expenseHeads, { id: nextId("eh"), name: name.trim() }] }));
        return { ok: true };
      },
      addExpense: async (e) => {
        if (e.amount <= 0) return { ok: false, error: "Enter an amount" };
        if (!e.headId) return { ok: false, error: "Pick an expense head" };
        await delay(300);
        patch((s) => ({ ...s, expenses: [{ ...e, id: nextId("ex"), at: new Date().toISOString(), by: who }, ...s.expenses] }));
        log("Expenses", `Added expense ₹${e.amount} · ${state.expenseHeads.find((h) => h.id === e.headId)?.name}`);
        return { ok: true };
      },
      deleteExpense: async (id) => {
        patch((s) => ({ ...s, expenses: s.expenses.filter((x) => x.id !== id) }));
        log("Expenses", "Deleted an expense");
        return { ok: true };
      },

      renewSubscription: async () => {
        await delay(500);
        const t = { id: nextId("tkt"), subject: "Renew subscription", body: state.subscription.plan, at: new Date().toISOString(), status: "open" as const };
        patch((s) => ({ ...s, tickets: [t, ...s.tickets] }));
        return { ok: true };
      },
      requestPlanChange: async (plan, note) => {
        if (!plan) return { ok: false, error: "Pick the plan you want" };
        if (note.length > 500) return { ok: false, error: "Keep the note under 500 characters" };
        await delay(500);
        const t = { id: `TKT-${4000 + state.tickets.length + 1}`, subject: `Plan change to ${plan}`, body: note.trim(), at: new Date().toISOString(), status: "open" as const };
        patch((s) => ({ ...s, tickets: [t, ...s.tickets] }));
        log("Subscription", `Requested plan change to ${plan}`);
        return { ok: true, ticketId: t.id };
      },
      raiseTicket: async (subject, body) => {
        if (!subject.trim()) return { ok: false, error: "Add a subject" };
        if (body.trim().length < 10) return { ok: false, error: "Describe the problem in a few words (10+ characters)" };
        if (body.length > 1000) return { ok: false, error: "Keep it under 1000 characters" };
        await delay(500);
        const t = { id: `TKT-${4000 + state.tickets.length + 1}`, subject: subject.trim(), body: body.trim(), at: new Date().toISOString(), status: "open" as const };
        patch((s) => ({ ...s, tickets: [t, ...s.tickets] }));
        return { ok: true, ticketId: t.id };
      },
    };
  }, [state, patch]);

  const value = useMemo(
    () => {
      const a = actions;
      const L = ext.logAudit;
      const audited: Partial<PosActions> = {
        sendKot: async (id) => { const r = await a.sendKot(id); if (r.ok) L("Orders", `KOT #${r.kotNo} sent for ${state.orders.find((o) => o.id === id)?.code}`); return r; },
        settleBill: async (id, i) => { const r = await a.settleBill(id, i); if (r.ok) L("Billing", `Settled ${r.code}`); return r; },
        cancelOrder: async (id, reason) => { const r = await a.cancelOrder(id, reason); if (r.ok) L("Orders", `Cancelled ${state.orders.find((o) => o.id === id)?.code} — ${reason}`); return r; },
        applyDiscount: async (id, d, pin) => { const r = await a.applyDiscount(id, d, pin); if (r.ok) L("Billing", `Discount ${d.kind === "percent" ? `${d.value}%` : `₹${d.value}`} on ${state.orders.find((o) => o.id === id)?.code} — ${d.reason}`); return r; },
        reopenBill: async (id) => { const r = await a.reopenBill(id); if (r.ok) L("Billing", `Reopened settled bill ${state.orders.find((o) => o.id === id)?.code}`); return r; },
        openCashSession: async (f) => { const r = await a.openCashSession(f); if (r.ok) L("Cash session", `Opened cash session with ₹${f}`); return r; },
        closeCashSession: async (d) => { const r = await a.closeCashSession(d); if (r.ok) L("Cash session", `Closed cash session · counted ₹${r.session?.counted}`); return r; },
        printBill: async (id) => { const r = await a.printBill(id); if (r.ok) L("Billing", `Printed bill ${state.orders.find((o) => o.id === id)?.code}`); return r; },
        transferTable: async (id, to) => { const r = await a.transferTable(id, to); if (r.ok) L("Tables", `Transferred ${state.orders.find((o) => o.id === id)?.code} to ${state.tables.find((t) => t.id === to)?.name}`); return r; },
      };
      return { ...state, permissions: perms, myDiscountLimit, ...actions, ...audited, ...selectors, ...ext };
    },
    [state, perms, myDiscountLimit, actions, selectors, ext],
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos(): PosContextValue {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used inside <PosProvider>");
  return ctx;
}
