// BillerPe POS (Plan 2) domain model.
//
// These shapes are the contract between the app and the cloud's /app/v1 API
// (uat-backend-v2). They follow the REAL BillerPe data model used by the exe,
// the Web POS and the Captain App - 7 roles, the 24-module permission matrix,
// menus that own their own categories/items, tax rules, service/packaging
// charge rules, printer/kitchen filters - so an outlet can move between
// Plan 1 and Plan 2 and support sees the same configuration in both.

/* ------------------------------------------------------------------ */
/* Staff, roles, permissions                                           */
/* ------------------------------------------------------------------ */

export type Role =
  | "Owner"
  | "Manager"
  | "Cashier"
  | "Captain"
  | "Kitchen Staff"
  | "Inventory Manager"
  | "Accountant";

export const ROLES: Role[] = [
  "Owner",
  "Manager",
  "Cashier",
  "Captain",
  "Kitchen Staff",
  "Inventory Manager",
  "Accountant",
];

/** The real permission modules (billerpe-local-exe/constant/rolePermissionDefaults.js). */
export type PermissionModule =
  | "dashboard"
  | "biller"
  | "keyboard-billing"
  | "kds"
  | "orders"
  | "menu"
  | "tables"
  | "reservations"
  | "queue"
  | "users"
  | "permissions"
  | "reports"
  | "expense"
  | "stock-masters"
  | "stock-transactions"
  | "stock-recipes"
  | "stock-reports"
  | "cash-session"
  | "ops-billing"
  | "ops-hardware"
  | "ops-experience"
  | "ops-ledger"
  | "system"
  | "audit-log";

export type StandardAction = "view" | "create" | "edit" | "delete";

export type SpecialPermission =
  | "orders.editAfterKot"
  | "orders.reopenSettled"
  | "orders.deleteOrder"
  | "tables.mergeTransfer"
  | "system.remakeOrderSequence"
  | "users.editPermissions";

export type ModuleGrant = Record<StandardAction, boolean>;
export type RolePermissions = Record<PermissionModule, ModuleGrant>;

export interface Permissions {
  modules: RolePermissions;
  special: Record<SpecialPermission, boolean>;
}

export interface Staff {
  id: string;
  name: string;
  mobile: string;
  role: Role;
  active: boolean;
  /** The outlet owner: nobody else can edit, deactivate or change the role. */
  isOwner: boolean;
  /** Per-user overrides of the role defaults; absent = role defaults. */
  overrides?: Permissions | undefined;
  /** Signed in on this device before - powers "Who's on shift?". Device-local. */
  recentOnDevice?: boolean | undefined;
}

/* ------------------------------------------------------------------ */
/* Outlet                                                              */
/* ------------------------------------------------------------------ */

export interface Outlet {
  id: string;
  name: string;
  address: string;
  phone: string;
  gstin: string;
  fssai: string;
  /** UPI ID shown as the "Scan to pay" QR on the settle screen. */
  upiId: string;
  logoUrl?: string | undefined;
  /** Set by BillerPe support only (per outlet). */
  deviceLimit: number;
  devicesInUse: number;
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

/** A table category ("section" in the app): AC Hall, Garden... */
export interface TableSection {
  id: string;
  name: string;
  rank: number;
}

/** Real table_status: F free, R running, H hold, P bill generated, B reserved. */
export type TableStatus = "free" | "running" | "hold" | "billed" | "reserved";

export interface PosTable {
  id: string;
  name: string;
  sectionId: string;
  seats: number;
  status: TableStatus;
  /** The open order on this table, if any. */
  orderId?: string | undefined;
  /** A QR round is waiting for staff to accept/reject. */
  qrWaiting?: boolean | undefined;
  /** Held for a reservation (from 30 min before the booking). */
  reservation?: { id: string; name: string; at: string } | undefined;
  /** Customer ordering link for this table's QR sticker (built by the server:
   * encrypted {hotelId, tableId, qrVersion}, same as the Web POS). */
  qrUrl?: string | undefined;
  qrVersion: number;
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

export type OrderType = "dinin" | "pickup";

export const ORDER_TYPE_LABEL: Record<OrderType, string> = { dinin: "Dine-in", pickup: "Pickup" };

/**
 * A menu (Main Menu, Garden Menu, Bar Menu...). Each menu is a fully separate
 * catalogue: it owns its categories, items, variants and addon groups. The
 * order's menu is picked by table section / order type (resolveMenu).
 */
export interface MenuCatalog {
  id: string;
  name: string;
  isDefault: boolean;
  active: boolean;
  /** empty = not scoped by section */
  sectionIds: string[];
  /** empty = not scoped by order type */
  orderTypes: OrderType[];
}

export interface MenuCategory {
  id: string;
  menuId: string;
  name: string;
  rank: number;
  active: boolean;
}

/** Real sub_categories values. */
export type Dietary = "veg" | "jain" | "nonveg" | "vegan" | "swaminarayan" | "egg";

export const DIETARY_LABEL: Record<Dietary, string> = {
  veg: "Veg",
  jain: "Jain",
  nonveg: "Non-veg",
  vegan: "Vegan",
  swaminarayan: "Swaminarayan",
  egg: "Egg",
};

export interface Variant {
  id: string;
  menuId: string;
  name: string;
}

export interface ItemVariant {
  variantId: string;
  name: string;
  price: number;
}

export interface AddonOption {
  id: string;
  name: string;
  price: number;
  dietary: Dietary;
}

export interface AddonGroup {
  id: string;
  menuId: string;
  name: string;
  min: number;
  max: number;
  single: boolean;
  active: boolean;
  options: AddonOption[];
}

export interface MenuItem {
  id: string;
  menuId: string;
  categoryId: string;
  name: string;
  shortCode: string;
  price: number;
  dietary: Dietary;
  /** Goods or Services (gst_type G/S). */
  gstType: "G" | "S";
  description: string;
  imageUrl?: string | undefined;
  barcode?: string | undefined;
  favorite: boolean;
  active: boolean;
  /** Quick "86" toggle for today. */
  outOfStock: boolean;
  variants: ItemVariant[];
  addonGroupIds: string[];
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export type LineStatus = "sent" | "preparing" | "ready" | "served";

export interface LineAddon {
  id: string;
  groupId: string;
  name: string;
  price: number;
  qty: number;
}

/** A line the server holds (fired in a KOT, or saved by Hold). */
export interface OrderLine {
  id: string;
  itemId?: string | undefined;
  name: string;
  categoryId?: string | undefined;
  dietary: Dietary;
  variantId?: string | undefined;
  variantName?: string | undefined;
  addons: LineAddon[];
  note?: string | undefined;
  price: number;
  qty: number;
  custom: boolean;
  /** Custom item sent to one chosen kitchen / printer. */
  routeKitchenId?: string | undefined;
  routePrinterId?: string | undefined;
  status: LineStatus;
  /** Staff who fired the line (only they, or Manager/Owner, may remove it). */
  firedById?: string | undefined;
}

export interface Kot {
  kotNo: number;
  round: number;
  firedAt: string;
  firedById: string;
  firedByName: string;
  lines: OrderLine[];
  /** Kitchens (KDS) this KOT went to. */
  kitchenIds: string[];
}

export type OrderStatus = "hold" | "running" | "billed" | "settled" | "cancelled";

export interface OwnerAlertSettings {
  /** An order cancelled, or a sent item removed, after its KOT. */
  cancelAfterKot: boolean;
  /** A settled bill's discount above `discountPct` % of the subtotal. */
  bigDiscount: boolean;
  discountPct: number;
  /** The cash drawer closed with a difference. */
  cashDifference: boolean;
}

export interface OrderDiscount {
  type: "fix" | "pr";
  value: number;
  reason: string;
}

export interface Payment {
  modeId: string;
  amount: number;
}

export interface TaxLine {
  id: string;
  name: string;
  type: "pr" | "fix";
  rate: number;
  amount: number;
}

/** Figures the server's bill engine persisted for the order. */
export interface OrderTotals {
  subtotal: number;
  discount: number;
  service: number;
  packaging: number;
  taxLines: TaxLine[];
  tax: number;
  roundOff: number;
  grand: number;
  items: number;
}

export interface TimelineEvent {
  at: string;
  label: string;
  by: string;
}

export interface Order {
  id: string;
  /** Final bill number, given by the server when the order is created. */
  billNo: string;
  /** Daily token (0 = none), per business day. */
  token: number;
  type: OrderType;
  tableId?: string | undefined;
  guests: number;
  customerName?: string | undefined;
  customerMobile?: string | undefined;
  customerAddress?: string | undefined;
  customerGstin?: string | undefined;
  menuId: string;
  captainId: string;
  captainName: string;
  status: OrderStatus;
  createdAt: string;
  businessDate: string;
  kots: Kot[];
  /** Saved by Hold, not yet sent to the kitchen. */
  heldLines: OrderLine[];
  discount?: OrderDiscount | undefined;
  promoCode?: string | undefined;
  /** Cashier's manual service charge when it is not automatic. */
  serviceOverride?: number | null | undefined;
  totals: OrderTotals;
  payments: Payment[];
  changeReturned?: number | undefined;
  dueOutstanding?: number | undefined;
  /** An edit lowered a paid bill and the difference is not handed back yet. */
  refundOwed?: number | undefined;
  billPrintedAt?: string | undefined;
  settledAt?: string | undefined;
  settledBy?: string | undefined;
  cancelReason?: string | undefined;
  /** Came from a customer QR round. */
  fromQr?: boolean | undefined;
  /** Pickup order marked ready for the customer. */
  readyAt?: string | undefined;
  timeline: TimelineEvent[];
}

/** An unsent cart on THIS device (never on the server until KOT/Hold). */
export interface DraftLine {
  key: string;
  itemId?: string | undefined;
  name: string;
  categoryId?: string | undefined;
  dietary: Dietary;
  variantId?: string | undefined;
  variantName?: string | undefined;
  addons: LineAddon[];
  note?: string | undefined;
  price: number;
  qty: number;
  custom: boolean;
  routeKitchenId?: string | undefined;
  routePrinterId?: string | undefined;
}

export interface Draft {
  /** "t:<tableId>" for a table, "p:<uuid>" for a new pickup. */
  key: string;
  type: OrderType;
  tableId?: string | undefined;
  /** Set once the server order exists (after the first KOT/Hold). */
  orderId?: string | undefined;
  guests: number;
  customerName: string;
  customerMobile: string;
  customerAddress?: string | undefined;
  customerGstin?: string | undefined;
  menuId: string;
  lines: DraftLine[];
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/** A service / packaging charge rule (hms_bill_charge_msts). */
export interface ChargeRule {
  active: boolean;
  type: "percentage" | "fixed";
  value: number;
  /** core = before discount, total = after discount */
  calculationOn: "core" | "total";
  /** Service: automatic for these order types, empty = added by hand.
   * Packaging: applies to these order types, empty = all. */
  orderTypes: OrderType[];
  /** GST is calculated on the charge too. */
  taxOnCharge: boolean;
  /** "1" when bill is greater than threshold, "2" less than, "3" always */
  condition: "1" | "2" | "3";
  threshold: number;
}

export interface TaxRule {
  id: string;
  name: string;
  type: "pr" | "fix";
  rate: number;
  active: boolean;
  /** empty = all */
  orderTypes: OrderType[];
  /** empty = all sections */
  sectionIds: string[];
  /** empty = all items; otherwise only these items are taxed */
  itemIds: string[];
}

export interface PaymentMode {
  id: string;
  name: string;
  /** Cash and Due: always on, cannot be renamed or removed. */
  locked: boolean;
  active: boolean;
  custom: boolean;
}

export interface PromoCode {
  id: string;
  name: string;
  code: string;
  type: "fix" | "pr";
  value: number;
  active: boolean;
}

/** A KDS kitchen with the same filters as a KOT printer. */
export interface Kitchen {
  id: string;
  name: string;
  /** empty = all */
  categoryIds: string[];
  /** empty = all */
  sectionIds: string[];
  /** empty = all */
  orderTypes: OrderType[];
}

/** Which order types a token setting applies to (Hotel codes 0/1/2/3). */
export type TokenScope = "off" | "dinin" | "pickup" | "both";

export type PrintLineContent =
  | "logo"
  | "outlet-name"
  | "address"
  | "phone"
  | "gstin"
  | "fssai"
  | "upi-qr"
  | "order-type"
  | "customer-details"
  | "bill-no"
  | "token-number"
  | "kot-number"
  | "text";

export interface PrintLine {
  id: string;
  content: PrintLineContent;
  text?: string | undefined;
  fontSize: number;
}

export interface PrintFormat {
  header: PrintLine[];
  footer: PrintLine[];
}

export interface OutletSettings {
  /** GST master switch. */
  gstOn: boolean;
  taxes: TaxRule[];
  serviceCharge: ChargeRule;
  packagingCharge: ChargeRule;
  paymentModes: PaymentMode[];
  promoCodes: PromoCode[];
  kitchens: Kitchen[];
  invoiceFormat: PrintFormat;
  kotFormat: PrintFormat & { showPrices: boolean };
  tokens: { tokenFor: TokenScope; billWithKot: TokenScope; billWithToken: TokenScope };
  /** "save" only saves; "pdf" also opens the bill as a PDF. */
  saveBehave: "save" | "pdf";
  businessDayStart: string;
  billReset: "never" | "daily" | "financial_year";
  financialYearStartMonth: number;
  /** Opening & closing (cash session) switched on. */
  cashSessionOn: boolean;
  qrOrdering: boolean;
  /** Tables screen: section tabs with "All" as one grid ("tabs"), or every
   * section stacked under its heading ("sections") - the Web POS's Table grid
   * view, one choice for the whole outlet. */
  tableGridView: "tabs" | "sections";
  /** Record supplier (PO) payments as expenses. */
  supplierPaymentsAsExpense: boolean;
  /** What the owner is alerted about (owner only; all on, 20% by default). */
  ownerAlerts: OwnerAlertSettings;
}

/* ------------------------------------------------------------------ */
/* Devices & printers                                                  */
/* ------------------------------------------------------------------ */

export type PrinterConnection = "wifi" | "bluetooth" | "usb" | "builtin" | "system";

/**
 * A printer set up on ONE device. The device that sends a KOT prints it on
 * its own printers, routed by the same filters the exe uses
 * (helpers/kotPrinterRouting.js): categories, sections, order types.
 */
export interface DevicePrinter {
  id: string;
  name: string;
  connection: PrinterConnection;
  /** ip:port for Wi-Fi, MAC for Bluetooth, device name for USB */
  address?: string | undefined;
  paperWidth: "58mm" | "80mm";
  copies: number;
  printsKot: boolean;
  printsInvoice: boolean;
  /** empty = all */
  categoryIds: string[];
  /** empty = all */
  sectionIds: string[];
  /** empty = all */
  orderTypes: OrderType[];
  status: "connected" | "unreachable" | "unsupported" | "unknown";
  /** Which driver reached a built-in printer (virtual BT, USB, brand SDK). */
  driver?: string | undefined;
}

export interface Device {
  id: string;
  name: string;
  make: string;
  model: string;
  android: string;
  appVersion: string;
  userName: string;
  lastActive: string;
  thisDevice: boolean;
  printers: DevicePrinter[];
  /** Print KOTs from this device at all. */
  printKots: boolean;
}

/* ------------------------------------------------------------------ */
/* Front of house                                                      */
/* ------------------------------------------------------------------ */

export type ReservationStatus = "booked" | "seated" | "noshow" | "cancelled";

export interface Reservation {
  id: string;
  name: string;
  mobile: string;
  email?: string | undefined;
  guests: number;
  /** ISO start */
  at: string;
  /** ISO end */
  endAt: string;
  tableIds: string[];
  advance: number;
  note?: string | undefined;
  status: ReservationStatus;
}

export type QueueStatus = "waiting" | "called" | "seated" | "noshow" | "cancelled";

export interface QueueEntry {
  id: string;
  name: string;
  mobile: string;
  guests: number;
  status: QueueStatus;
  joinedAt: string;
  calledAt?: string | undefined;
  note?: string | undefined;
}

export type QrItemDecision = "pending" | "accepted" | "rejected";

export interface QrOrderItem {
  key: string;
  itemId: string;
  name: string;
  dietary: Dietary;
  variantName?: string | undefined;
  addons: LineAddon[];
  note?: string | undefined;
  price: number;
  qty: number;
  decision: QrItemDecision;
  rejectReason?: string | undefined;
}

export interface QrOrder {
  id: string;
  tableId: string;
  customerName: string;
  customerMobile: string;
  round: number;
  items: QrOrderItem[];
  status: "pending" | "accepted" | "rejected" | "partial";
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email?: string | undefined;
  gstin?: string | undefined;
  address?: string | undefined;
  birthday?: string | undefined;
  visits: number;
  totalSpent: number;
  lastVisit?: string | undefined;
  dueOutstanding: number;
}

export interface DueCollection {
  id: string;
  customerMobile: string;
  customerName: string;
  amount: number;
  modeId: string;
  at: string;
  by: string;
}

/** A settled bill edited below what was paid, the difference kept to hand back later (Web POS "Refunds due"). */
export interface RefundOwed {
  orderId: string;
  billNo: string;
  amount: number;
  customerName?: string | undefined;
  customerMobile?: string | undefined;
  at: string;
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export interface CashMovement {
  id: string;
  // settlement = cash taken on a bill or due collection (exe helpers/cashDrawer.js)
  kind: "in" | "out" | "expense" | "supplier" | "settlement";
  amount: number;
  reason: string;
  at: string;
  by: string;
}

export interface CashSession {
  id: string;
  openedAt: string;
  openedBy: string;
  openingFloat: number;
  movements: CashMovement[];
  closedAt?: string | undefined;
  closedBy?: string | undefined;
  expected?: number | undefined;
  counted?: number | undefined;
  denominations?: Record<string, number> | undefined;
  varianceReason?: string | undefined;
}

export interface ExpenseHead {
  id: string;
  name: string;
  type: "Fixed" | "Variable";
  active: boolean;
  /** Auto-created head for supplier payments; not editable. */
  system?: boolean | undefined;
}

export interface Expense {
  id: string;
  headId: string;
  amount: number;
  modeId: string;
  note: string;
  photoUrl?: string | undefined;
  at: string;
  by: string;
  /** Recorded from a supplier payment - changed there, not here. */
  fromPurchase?: boolean | undefined;
  /** Cash taken from the open drawer. */
  fromDrawer?: boolean | undefined;
}

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

export interface StockUnit {
  id: string;
  name: string;
  short: string;
}

export interface RawMaterial {
  id: string;
  name: string;
  category: string;
  /** consumption unit */
  unitId: string;
  /** purchase unit */
  purchaseUnitId: string;
  /** consumption units per purchase unit */
  conversion: number;
  /** in consumption units; may go negative (sales never blocked) */
  stock: number;
  reorderLevel: number;
  /** weighted average cost per consumption unit */
  rate: number;
  active: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  gstin: string;
  outstanding: number;
}

export interface PurchaseLine {
  rawId: string;
  /** in purchase units */
  qty: number;
  /** per purchase unit */
  rate: number;
  taxPct: number;
}

export interface PurchasePayment {
  id: string;
  amount: number;
  /** outlet payment modes + "cheque" + "bank" */
  modeId: string;
  date: string;
  ref?: string | undefined;
  by: string;
  asExpense: boolean;
  fromDrawer: boolean;
}

export interface PurchaseOrder {
  id: string;
  poNo: string;
  supplierId: string;
  date: string;
  invoiceNo?: string | undefined;
  lines: PurchaseLine[];
  discountType?: "flat" | "percent" | undefined;
  discountValue?: number | undefined;
  total: number;
  payments: PurchasePayment[];
  by: string;
}

export interface RecipeLine {
  kind: "raw" | "semi";
  refId: string;
  qty: number;
}

/** What one portion of a menu item (or one variant / addon of it) uses. */
export interface Recipe {
  id: string;
  itemId: string;
  base: RecipeLine[];
  byVariant: Record<string, RecipeLine[]>;
  byAddon: Record<string, RecipeLine[]>;
}

export interface SemiFinished {
  id: string;
  name: string;
  unitId: string;
  stock: number;
  minStock: number;
  /** per 1 unit produced */
  components: RecipeLine[];
}

export type StockMovementKind =
  | "purchase"
  | "sale"
  | "wastage"
  | "manual-in"
  | "manual-out"
  | "adjustment"
  | "production-in"
  | "production-out";

export interface StockMovement {
  id: string;
  kind: StockMovementKind;
  refKind: "raw" | "semi";
  refId: string;
  /** signed, in the material's consumption unit */
  qty: number;
  value: number;
  reference: string;
  at: string;
  by: string;
}

export interface Wastage {
  id: string;
  refKind: "raw" | "semi";
  refId: string;
  qty: number;
  reason: string;
  at: string;
  by: string;
  cost: number;
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export type AlertKind =
  | "food-ready"
  | "bill-requested"
  | "qr-order"
  | "reservation-due"
  | "print-failed"
  /** For the owner only (owner list 2026-09-29 #10), switched on/off in Settings. */
  | "owner-alert";

export interface PosAlert {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  at: string;
  read: boolean;
  /** Where tapping the alert goes. */
  link?: string | undefined;
  /** Only this staff member sees it (e.g. the captain whose food is ready). */
  forUserId?: string | undefined;
  /** Only these roles see it (e.g. the counter for "bill requested"). */
  forRoles?: Role[] | undefined;
}

export interface AuditEntry {
  id: string;
  at: string;
  by: string;
  role: Role;
  module: string;
  action: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  body: string;
  kind: "support" | "plan-change" | "renewal";
  at: string;
  status: "open" | "closed";
}

export interface Subscription {
  plan: "App Lite" | "App Standard" | "App Pro";
  expiresAt: string;
  ebillCredits: number;
  invoices: { id: string; at: string; amount: number; plan: string }[];
}

/** A KOT that was saved but did not print on this device. Device-local. */
export interface PendingPrint {
  id: string;
  orderId: string;
  kotNo: number;
  label: string;
  printerId?: string | undefined;
  printerName: string;
  at: string;
  error: string;
}

export type ConnectionState = "online" | "reconnecting" | "offline";

export type LoginError =
  | "wrong-password"
  | "wrong-pin"
  | "inactive"
  | "device-limit"
  | "subscription-expired"
  | "plan-mismatch"
  | "network";

export interface ActionResult {
  ok: boolean;
  error?: string | undefined;
}
