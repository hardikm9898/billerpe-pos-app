import type {
  AddonGroup,
  AuditEntry,
  CashSession,
  ChargeRule,
  Customer,
  Device,
  DevicePrinter,
  DraftLine,
  DueCollection,
  Expense,
  ExpenseHead,
  Kitchen,
  Kot,
  LoginError,
  MenuCatalog,
  MenuCategory,
  MenuItem,
  Order,
  OrderDiscount,
  OrderLine,
  OrderType,
  Outlet,
  OutletSettings,
  Payment,
  PaymentMode,
  Permissions,
  PosAlert,
  PosTable,
  PromoCode,
  PurchaseOrder,
  PurchasePayment,
  QrOrder,
  QueueEntry,
  QueueStatus,
  RawMaterial,
  Recipe,
  RefundOwed,
  Reservation,
  ReservationStatus,
  Role,
  SemiFinished,
  Staff,
  StockMovement,
  StockUnit,
  Subscription,
  Supplier,
  SupportTicket,
  TableSection,
  TaxRule,
  Variant,
  Wastage,
} from "../types";

// The app <-> cloud contract. `PosBackend` lists every call the app makes;
// uat-backend-v2's /app/v1 API implements the same list (see
// BillerPe POS App/API_CONTRACT.md). The in-browser mock (./mock) applies
// the same business rules so the app can be built and tested before the
// cloud side exists, and doubles as the executable spec for it.

/** Thrown by a backend call when the internet is gone (never a business-rule error). */
export class NetworkError extends Error {
  constructor() {
    super("No internet connection");
  }
}

/** The outlet's BillerPe plan has ended: everything is locked except the plan calls. */
export class PlanLockedError extends Error {}

/**
 * The outlet's plan as the lock screen and banner show it (cloud
 * adminv1/bil/renewals.js planState). Owner 2026-10-08: when the plan ends
 * the app locks at once; "Extend 1 day" once; then only paying unlocks it.
 */
export interface PlanState {
  outlet: string;
  endsAt: string | null;
  paidUntil: string | null;
  expired: boolean;
  inGrace: boolean;
  graceUsed: boolean;
  canExtend: boolean;
  /** "unpaid" = locked because the first invoice is not paid (owner 2026-10-09). */
  reason?: string | null;
  daysLeft: number | null;
  message: string | null;
}

/** Everything the device holds for the signed-in outlet. */
export interface OutletData {
  outlet: Outlet;
  outlets: Pick<Outlet, "id" | "name">[];
  settings: OutletSettings;
  staff: Staff[];
  roleDefaults: Record<Role, Permissions>;
  sections: TableSection[];
  tables: PosTable[];
  menus: MenuCatalog[];
  categories: MenuCategory[];
  variants: Variant[];
  addonGroups: AddonGroup[];
  items: MenuItem[];
  /** Open orders + everything from the last 35 business days. */
  orders: Order[];
  reservations: Reservation[];
  queue: QueueEntry[];
  qrOrders: QrOrder[];
  customers: Customer[];
  dueCollections: DueCollection[];
  /** Every bill still owing the customer a refund, however old. */
  refundsOwed: RefundOwed[];
  cashSession: CashSession | null;
  cashHistory: CashSession[];
  expenseHeads: ExpenseHead[];
  expenses: Expense[];
  devices: Device[];
  alerts: PosAlert[];
  audit: AuditEntry[];
  tickets: SupportTicket[];
  subscription: Subscription;
  stock: {
    units: StockUnit[];
    raw: RawMaterial[];
    suppliers: Supplier[];
    purchases: PurchaseOrder[];
    recipes: Recipe[];
    semi: SemiFinished[];
    movements: StockMovement[];
    wastage: Wastage[];
  };
  tokenResetAt: string | null;
}

export interface Session {
  token: string;
  user: Staff;
  deviceId: string;
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface LoginResult {
  ok: boolean;
  error?: LoginError | undefined;
  message?: string | undefined;
  session?: Session | undefined;
}

export interface DeviceInfo {
  deviceId: string;
  name: string;
  make: string;
  model: string;
  android: string;
  appVersion: string;
}

export interface CustomerInput {
  name: string;
  mobile: string;
  address?: string | undefined;
  gstin?: string | undefined;
}

/** The cart a device sends with Send KOT / Hold. */
export interface CartPayload {
  /** Existing server order, or undefined for a new one. */
  orderId?: string | undefined;
  type: OrderType;
  tableId?: string | undefined;
  guests: number;
  customerName?: string | undefined;
  customerMobile?: string | undefined;
  customerAddress?: string | undefined;
  customerGstin?: string | undefined;
  menuId: string;
  lines: DraftLine[];
  /** One-time key: a retry of the same tap is saved once. */
  clientKey: string;
}

export interface KotResult {
  orderId: string;
  billNo: string;
  token: number;
  kot: Kot;
  /** Kitchens (KDS) the KOT reached, by name. */
  kitchens: string[];
}

export interface PrintBillResult {
  order: Order;
  /** Bill-with-KOT: unsent (held) lines printed as a KOT with the bill. */
  kotLines: OrderLine[];
  printToken: boolean;
}

export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "custom";

/** Orders screen: one page of orders from the server (owner bug list 2026-09-26). */
export type OrderListStatus = "all" | "running" | "settled" | "cancelled" | "due";
export type OrderListRange = "all" | "today" | "yesterday" | "7d" | "month" | "custom";

export interface OrderQuery {
  status: OrderListStatus;
  /** Business days; ignored for Running (always the live ones). */
  range: { key: OrderListRange; from?: string | undefined; to?: string | undefined };
  /** Bill no, token, customer name / mobile, table. */
  search?: string | undefined;
  /** 0-based; 20 orders a page, newest first. */
  page: number;
}

export interface OrderPage {
  orders: Order[];
  total: number;
  hasMore: boolean;
  /** Badges on the tabs. */
  counts: { running: number; due: number };
}

export const ORDERS_PAGE_SIZE = 20;

export interface MenuImportRow {
  name: string;
  category: string;
  price: number;
  /** Empty = keep the item's own (update) or give the next free one (new). */
  shortCode: string;
  veg: boolean;
  active: boolean;
}

export interface MenuImportResult {
  created: number;
  updated: number;
  categoriesCreated: number;
  failed: { line: number; name: string; error: string }[];
}

/** A settled bill as the cashier changed it (owner bug list 2026-09-26, item 11). */
export interface SettledEdit {
  /** Lines already on the bill with their new quantity (0 = removed). Lines left out stay as they are. */
  lines: { lineId: string; qty: number }[];
  /** Items added while editing. */
  added: DraftLine[];
  discount: OrderDiscount | null;
  /** How the whole new bill is paid: adds up to the new total plus `refundLater`. */
  payments: Payment[];
  /** Paid over the new total, kept as a refund owed instead of handed back now. */
  refundLater: number;
  customerName?: string | undefined;
  customerMobile?: string | undefined;
  clientKey: string;
}

export interface SettledEditResult {
  grand: number;
  due: number;
  refundOwed: number;
  /** Cash that went into / came out of the open drawer. */
  cashIn: number;
  cashOut: number;
}

export interface DateRange {
  key: RangeKey;
  from?: string | undefined;
  to?: string | undefined;
}

export interface ReportColumn {
  key: string;
  label: string;
  num?: boolean | undefined;
  money?: boolean | undefined;
}

export interface ReportResult {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  totals?: Record<string, string | number> | undefined;
  summary: { label: string; value: string | number; money?: boolean | undefined }[];
  /** All-outlets view: the report's headline figure per outlet. */
  outlets?: { name: string; label: string; money: boolean; value: number }[] | undefined;
}

export interface DashboardResult {
  net: number;
  bills: number;
  avgBill: number;
  guests: number;
  runningCount: number;
  runningAmount: number;
  cancelledCount: number;
  cancelledAmount: number;
  discounts: number;
  expenses: number;
  byMode: { modeId: string; name: string; amount: number }[];
  hourly: { hour: number; amount: number }[];
  trend: { day: string; amount: number }[];
  topItems: { name: string; qty: number; amount: number }[];
  byType: { label: string; amount: number }[];
  /** All-outlets view: each outlet's net sales and bills. */
  outlets?: { id: string; name: string; net: number; bills: number }[] | undefined;
}

export interface PosBackend {
  /* session */
  loginWithPassword(mobile: string, password: string, device: DeviceInfo): Promise<LoginResult>;
  loginWithPin(staffId: string, pin: string, device: DeviceInfo): Promise<LoginResult>;
  /** App start: confirm a saved token (never expires for a registered device; revoked = refused). */
  resume(token: string, device: DeviceInfo): Promise<LoginResult>;
  selectOutlet(outletId: string): Promise<Result>;
  logout(): Promise<void>;
  load(): Promise<OutletData>;
  /** Staff who may sign in with a PIN on this device (after a password login). */
  shiftStaff(): Promise<Pick<Staff, "id" | "name" | "role">[]>;

  /* orders */
  sendKot(cart: CartPayload): Promise<Result<KotResult>>;
  holdOrder(cart: CartPayload): Promise<Result<{ orderId: string; billNo: string }>>;
  setGuests(orderId: string, guests: number): Promise<Result>;
  /** The Web POS customer: mobile (10 digits), name, address, GSTIN. */
  setCustomer(orderId: string, customer: CustomerInput): Promise<Result>;
  removeLine(orderId: string, lineId: string, reason: string): Promise<Result>;
  markServed(orderId: string, kotNo: number): Promise<Result>;
  requestBill(orderId: string): Promise<Result>;
  printBill(orderId: string): Promise<Result<PrintBillResult>>;
  /**
   * Bill straight from a phone's cart without a KOT first (Web POS "Save" /
   * "Bill Print"): the items are saved on the order - no kitchen, no KDS -
   * and the bill is generated. request = a captain with no bill printer:
   * the counter is told (like requestBill).
   */
  billCart(
    cart: CartPayload,
    opts?: { request?: boolean | undefined },
  ): Promise<Result<PrintBillResult>>;
  cancelOrder(orderId: string, reason: string): Promise<Result>;
  transferTable(orderId: string, toTableId: string): Promise<Result>;
  mergeTables(fromTableId: string, toTableId: string): Promise<Result>;
  moveKot(orderId: string, kotNo: number, toTableId: string): Promise<Result>;
  setDiscount(orderId: string, discount: OrderDiscount | null): Promise<Result>;
  applyPromo(orderId: string, code: string | null): Promise<Result>;
  setServiceCharge(orderId: string, amount: number | null): Promise<Result>;
  settle(
    orderId: string,
    input: {
      payments: Payment[];
      customerName?: string | undefined;
      customerMobile?: string | undefined;
      clientKey: string;
    },
  ): Promise<Result<{ change: number; billNo: string }>>;
  /** Counter billing: create + fire in one step, optionally print/settle. */
  counterOrder(input: {
    type: OrderType;
    tableId?: string | undefined;
    lines: DraftLine[];
    customerName?: string | undefined;
    customerMobile?: string | undefined;
    menuId: string;
    clientKey: string;
  }): Promise<Result<KotResult>>;
  /**
   * Edit a settled bill (Web POS edit-settled-order): items, quantities and
   * discount change in place - the table is never occupied again - and the
   * payment is given again for the whole new bill. Cash differences go in
   * or out of the open drawer; stock is re-deducted for the new lines.
   */
  editSettled(orderId: string, edit: SettledEdit): Promise<Result<SettledEditResult>>;
  /** Hand back a refund owed; cash comes out of the open drawer. */
  settleRefund(orderId: string, modeId: string): Promise<Result>;
  sendEbill(orderId: string, mobile: string): Promise<Result>;
  markPickupReady(orderId: string, ready: boolean): Promise<Result>;
  logReprint(orderId: string, what: string): Promise<Result>;

  /* kitchen */
  kdsAdvance(orderId: string, kotNo: number, kitchenId: string, lineId?: string): Promise<Result>;
  kdsRecall(orderId: string, kotNo: number, kitchenId: string): Promise<Result>;

  /* QR */
  decideQr(
    qrId: string,
    decisions: { key: string; accept: boolean; reason?: string | undefined }[],
  ): Promise<Result<{ orderId?: string | undefined; kot?: Kot | undefined }>>;

  /* front of house */
  saveReservation(
    r: Omit<Reservation, "id" | "status"> & { id?: string | undefined },
  ): Promise<Result>;
  setReservationStatus(id: string, status: ReservationStatus): Promise<Result>;
  addToQueue(e: {
    name: string;
    mobile: string;
    guests: number;
    note?: string | undefined;
  }): Promise<Result>;
  setQueueStatus(id: string, status: QueueStatus): Promise<Result>;
  saveCustomer(
    c: Pick<Customer, "name" | "mobile" | "email" | "gstin" | "address" | "birthday"> & {
      id?: string | undefined;
    },
  ): Promise<Result>;
  collectDue(mobile: string, amount: number, modeId: string): Promise<Result>;

  /* cash & expenses */
  openCash(openingFloat: number): Promise<Result>;
  cashMovement(kind: "in" | "out", amount: number, reason: string): Promise<Result>;
  closeCash(
    denominations: Record<string, number>,
    varianceReason?: string,
  ): Promise<Result<{ session: CashSession }>>;
  saveExpenseHead(
    h: Omit<ExpenseHead, "id" | "system"> & { id?: string | undefined },
  ): Promise<Result>;
  saveExpense(e: Omit<Expense, "id" | "at" | "by"> & { id?: string | undefined }): Promise<Result>;
  deleteExpense(id: string): Promise<Result>;

  /* menu */
  saveMenu(m: Omit<MenuCatalog, "id"> & { id?: string | undefined }): Promise<Result>;
  saveCategory(c: Omit<MenuCategory, "id"> & { id?: string | undefined }): Promise<Result>;
  deleteCategory(id: string): Promise<Result>;
  saveItem(i: Omit<MenuItem, "id"> & { id?: string | undefined }): Promise<Result>;
  deleteItem(id: string): Promise<Result>;
  setOutOfStock(id: string, out: boolean): Promise<Result>;
  saveVariant(v: Omit<Variant, "id"> & { id?: string | undefined }): Promise<Result>;
  /** Only once no item uses it (Web POS). */
  deleteVariant(id: string): Promise<Result>;
  /**
   * Web POS menu CSV import into one menu: missing categories are created,
   * an item with the same name is updated (its variants, add-ons and photo
   * are kept), anything else is added. Bad rows are reported, not fatal.
   */
  importMenu(menuId: string, rows: MenuImportRow[]): Promise<Result<MenuImportResult>>;
  saveAddonGroup(g: Omit<AddonGroup, "id"> & { id?: string | undefined }): Promise<Result>;
  deleteAddonGroup(id: string): Promise<Result>;

  /* tables */
  saveSection(s: Omit<TableSection, "id"> & { id?: string | undefined }): Promise<Result>;
  deleteSection(id: string): Promise<Result>;
  addTables(
    sectionId: string,
    spec: string,
    seats: number,
  ): Promise<Result<{ added: number; skipped: string[] }>>;
  editTable(
    id: string,
    patch: {
      name?: string | undefined;
      seats?: number | undefined;
      sectionId?: string | undefined;
    },
  ): Promise<Result>;
  deleteTable(id: string): Promise<Result>;
  /** New QR for a table: old stickers stop working (bumps qr_version). */
  newTableQr(id: string): Promise<Result>;

  /* staff */
  saveStaff(s: {
    id?: string | undefined;
    name: string;
    mobile: string;
    role: Role;
    pin?: string | undefined;
    password?: string | undefined;
  }): Promise<Result>;
  setStaffActive(id: string, active: boolean): Promise<Result>;
  setRoleDefaults(role: Role, p: Permissions): Promise<Result>;
  setUserOverrides(staffId: string, p: Permissions | null): Promise<Result>;

  /* settings */
  updateSettings(patch: Partial<OutletSettings>): Promise<Result>;
  updateOutlet(
    patch: Partial<
      Pick<Outlet, "name" | "address" | "phone" | "gstin" | "fssai" | "upiId" | "logoUrl">
    >,
  ): Promise<Result>;
  saveTax(t: Omit<TaxRule, "id"> & { id?: string | undefined }): Promise<Result>;
  deleteTax(id: string): Promise<Result>;
  saveCharge(which: "service" | "packaging", rule: ChargeRule): Promise<Result>;
  savePaymentMode(m: { id?: string | undefined; name: string; active: boolean }): Promise<Result>;
  removePaymentMode(id: string): Promise<Result>;
  savePromo(p: Omit<PromoCode, "id"> & { id?: string | undefined }): Promise<Result>;
  deletePromo(id: string): Promise<Result>;
  saveKitchen(k: Omit<Kitchen, "id"> & { id?: string | undefined }): Promise<Result>;
  deleteKitchen(id: string): Promise<Result>;
  resetTokens(): Promise<Result>;

  /* devices */
  logoutDevice(id: string): Promise<Result>;
  /** This phone's push token (null at logout): alerts are pushed to it when the app is closed. */
  setPushToken(token: string | null): Promise<Result>;
  saveDevicePrinters(
    deviceId: string,
    printers: DevicePrinter[],
    printKots: boolean,
  ): Promise<Result>;

  /* stock */
  saveUnit(u: Omit<StockUnit, "id"> & { id?: string | undefined }): Promise<Result>;
  saveRaw(
    r: Omit<RawMaterial, "id" | "stock" | "rate"> & {
      id?: string | undefined;
      openingStock?: number | undefined;
      openingRate?: number | undefined;
    },
  ): Promise<Result>;
  saveSupplier(
    s: Omit<Supplier, "id" | "outstanding"> & { id?: string | undefined },
  ): Promise<Result>;
  savePurchase(
    p: Omit<PurchaseOrder, "id" | "poNo" | "total" | "payments" | "by"> & {
      id?: string | undefined;
      firstPayment?:
        | { amount: number; modeId: string; ref?: string | undefined; fromDrawer: boolean }
        | undefined;
    },
  ): Promise<Result<{ warning?: string | undefined }>>;
  deletePurchase(id: string): Promise<Result<{ warning?: string | undefined }>>;
  addPurchasePayment(
    poId: string,
    p: Omit<PurchasePayment, "id" | "by" | "asExpense">,
  ): Promise<Result>;
  deletePurchasePayment(poId: string, paymentId: string): Promise<Result>;
  stockEntry(input: {
    kind: "in" | "out" | "count";
    refKind: "raw" | "semi";
    refId: string;
    qty: number;
    rate?: number | undefined;
    note: string;
  }): Promise<Result>;
  recordWastage(w: {
    refKind: "raw" | "semi";
    refId: string;
    qty: number;
    reason: string;
  }): Promise<Result>;
  deleteWastage(id: string): Promise<Result>;
  saveRecipe(r: Omit<Recipe, "id"> & { id?: string | undefined }): Promise<Result>;
  saveSemi(s: Omit<SemiFinished, "id" | "stock"> & { id?: string | undefined }): Promise<Result>;
  produceSemi(semiId: string, qty: number, note?: string): Promise<Result>;

  /* orders screen */
  listOrders(q: OrderQuery): Promise<OrderPage>;
  /** One order by id - also older than what load() brings. */
  getOrder(orderId: string): Promise<Order | null>;

  /* reports */
  dashboard(range: DateRange): Promise<DashboardResult>;
  /** Owner only: every outlet they own, added up (with a line per outlet). */
  dashboardAll(range: DateRange): Promise<DashboardResult>;
  /** Owner only: a sales report over every outlet they own (Outlet column + totals). */
  reportAll(id: string, range: DateRange): Promise<ReportResult>;
  report(
    id: string,
    range: DateRange,
    filters: { staffId?: string | undefined; modeId?: string | undefined },
  ): Promise<ReportResult>;

  /* account & support */
  changePin(current: string, next: string): Promise<Result>;
  changePassword(current: string, next: string): Promise<Result>;
  raiseTicket(
    subject: string,
    body: string,
    kind: SupportTicket["kind"],
  ): Promise<Result<{ ticketId: string }>>;
  /** Answer BillerPe support on a ticket. */
  ticketReply(ticketId: string, text: string): Promise<Result>;
  markAlertsRead(ids: string[] | "all"): Promise<Result>;
}
