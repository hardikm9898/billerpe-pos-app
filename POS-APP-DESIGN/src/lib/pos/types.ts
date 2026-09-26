export type Role = "owner" | "manager" | "captain" | "cashier" | "kitchen";

export type ModuleKey =
  | "billing"
  | "orders"
  | "tables"
  | "menu"
  | "reports"
  | "expenses"
  | "stock"
  | "cash"
  | "staff"
  | "devices"
  | "settings"
  | "subscription"
  | "kds"
  | "audit"
  | "help";

export type CrudAction = "view" | "create" | "edit" | "delete";

export type SpecialPermission =
  | "editAfterKot"
  | "reopenSettledBill"
  | "deleteOrder"
  | "mergeTransferTables"
  | "editPermissions"
  | "discountBeyondLimit"
  | "printBill";

export type PermissionMatrix = Partial<Record<ModuleKey, Partial<Record<CrudAction, boolean>>>>;

export interface Permissions {
  modules: PermissionMatrix;
  special: Partial<Record<SpecialPermission, boolean>>;
}

export interface Staff {
  id: string;
  name: string;
  mobile: string;
  role: Role;
  pin: string;
  password: string;
  active: boolean;
  isOwner?: boolean | undefined;
  /** signed in on this device before — powers "Who's on shift?" */
  recentOnDevice?: boolean | undefined;
  permissionOverrides?: Permissions | undefined;
}

export interface Outlet {
  id: string;
  name: string;
  restaurant: string;
  gstin: string;
  address: string;
  upiId: string;
  kitchens: string[];
  deviceLimit: number;
  devicesInUse: number;
}

export type TableStatus = "free" | "running" | "hold" | "billed" | "reserved";

export interface TableSection {
  id: string;
  name: string;
}

export interface PosTable {
  id: string;
  name: string;
  sectionId: string;
  seats: number;
  status: TableStatus;
  guests: number;
  captainName?: string | undefined;
  openedAt?: string | undefined;
  qrOrderWaiting?: boolean | undefined;
  reservedFor?: string | undefined;
  mergedWith?: string[] | undefined;
}

export type VegType = "veg" | "nonveg" | "egg" | "jain" | "vegan";

export interface AddonOption {
  id: string;
  name: string;
  price: number;
}

export interface AddonGroup {
  id: string;
  name: string;
  min: number;
  max: number;
  options: AddonOption[];
}

export interface Variant {
  id: string;
  name: string;
  price: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  sort: number;
}

export interface MenuItem {
  id: string;
  name: string;
  shortCode: string;
  categoryId: string;
  price: number;
  vegType: VegType;
  kitchen: string;
  outOfStock?: boolean | undefined;
  variants?: Variant[] | undefined;
  addonGroups?: AddonGroup[] | undefined;
  menuIds: string[];
  photo?: string | undefined;
  active?: boolean | undefined;
  taxRate?: number | undefined;
  /** per-menu price overrides, e.g. Garden Menu */
  menuPrices?: Record<string, number> | undefined;
}

export interface MenuList {
  id: string;
  name: string;
}

export type LineStatus = "new" | "sent" | "preparing" | "ready" | "served";

export interface CartLine {
  id: string;
  itemId?: string | undefined;
  name: string;
  variantName?: string | undefined;
  addonNames: string[];
  note?: string | undefined;
  unitPrice: number;
  quantity: number;
  kitchen: string;
  vegType: VegType;
  custom?: boolean | undefined;
  status: LineStatus;
  roundNo?: number | undefined;
}

export interface KotRound {
  roundNo: number;
  kotNo: number;
  sentAt: string;
  printed: boolean;
  printerName: string;
  lines: CartLine[];
}

export type OrderType = "dine-in" | "takeaway" | "delivery";

export type OrderStatus = "running" | "hold" | "billed" | "settled" | "cancelled";

export interface Order {
  id: string;
  code: string;
  type: OrderType;
  tableId?: string | undefined;
  tokenNo?: number | undefined;
  guests: number;
  customerName?: string | undefined;
  customerMobile?: string | undefined;
  menuId: string;
  captainName: string;
  status: OrderStatus;
  createdAt: string;
  rounds: KotRound[];
  draftLines: CartLine[];
  billRequested?: boolean | undefined;
  cancelReason?: string | undefined;
  discount?: Discount | undefined;
  promoCode?: string | undefined;
  serviceChargeOn?: boolean | undefined;
  payments?: Payment[] | undefined;
  /** cash returned to the customer */
  changeReturned?: number | undefined;
  /** outstanding amount still owed on a Due bill */
  dueOutstanding?: number | undefined;
  billPrintedAt?: string | undefined;
  settledAt?: string | undefined;
  settledBy?: string | undefined;
  settledTotal?: number | undefined;
  /** counter/takeaway: kitchen marked it ready for pickup */
  readyAt?: string | undefined;
  events?: TimelineEvent[] | undefined;
  qrOrder?: boolean | undefined;
}

export type ReservationStatus = "booked" | "seated" | "noshow" | "cancelled";

export interface Reservation {
  id: string;
  name: string;
  mobile: string;
  guests: number;
  at: string;
  tableId?: string | undefined;
  note?: string | undefined;
  status: ReservationStatus;
}

export type AlertKind = "food-ready" | "bill-requested" | "qr-order" | "reservation-due";

export interface PosAlert {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  at: string;
  read: boolean;
}

export interface Printer {
  id: string;
  name: string;
  kind: "wifi" | "bluetooth" | "usb" | "builtin" | "system";
  address?: string | undefined;
  paperWidth: "58mm" | "80mm";
  status: "connected" | "unreachable" | "unsupported";
  copies?: number | undefined;
}

export interface PrinterRouting {
  invoicePrinterId?: string | undefined;
  kotPrinterByKitchen: Record<string, string>;
  printKotOnDevice: boolean;
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
  thisDevice?: boolean | undefined;
  printers: Printer[];
  routing: PrinterRouting;
}

export interface ExpenseHead {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  headId: string;
  amount: number;
  mode: string;
  note: string;
  photo?: string | undefined;
  at: string;
  by: string;
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
  at: string;
  status: "open" | "closed";
}

export interface PendingKot {
  orderId: string;
  kotNo: number;
  tableName: string;
  printerName: string;
  at: string;
}

export type ConnectionState = "online" | "reconnecting" | "offline";

export type LoginError =
  | "wrong-password"
  | "wrong-pin"
  | "inactive"
  | "device-limit"
  | "subscription-expired"
  | "plan-mismatch";

export interface ActionResult {
  ok: boolean;
  error?: string | undefined;
}

// ---------- Billing & payments ----------

export type PaymentModeId = "cash" | "upi" | "card" | "due" | (string & {});

export interface PaymentModeDef {
  id: PaymentModeId;
  label: string;
  /** Cash and Due can never be removed */
  locked?: boolean | undefined;
  custom?: boolean | undefined;
  disabled?: boolean | undefined;
}

export interface Payment {
  mode: PaymentModeId;
  amount: number;
}

export interface Discount {
  kind: "flat" | "percent";
  value: number;
  reason: string;
  approvedBy?: string | undefined;
}

export interface PromoCode {
  code: string;
  kind: "flat" | "percent";
  value: number;
  minBill: number;
  label: string;
}

export interface TimelineEvent {
  at: string;
  label: string;
  by: string;
}

export interface BillingSettings {
  taxRate: number;
  roundOff: boolean;
  billPrefix: string;
  billReset: "daily" | "monthly" | "yearly" | "never";
  discountLimits: Record<Role, number | null>;
  invoice: { logo?: string | undefined; header: string; footer: string; gstin: string; fssai: string; paper: "58mm" | "80mm" };
  kotShowPrices: boolean;
  businessDayStart: string;
  tokenMode: "dine-in" | "takeaway" | "both" | "off";
  qrOrdering: boolean;
  categoryKitchen: Record<string, string>;
  serviceChargeRate: number;
  packagingCharge: number;
  deliveryCharge: number;
  paymentModes: PaymentModeDef[];
  promoCodes: PromoCode[];
}

export interface DueCollection {
  id: string;
  mobile: string;
  name: string;
  amount: number;
  mode: PaymentModeId;
  at: string;
  by: string;
}

export interface CashEntry {
  id: string;
  kind: "in" | "out";
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
  entries: CashEntry[];
  closedAt?: string | undefined;
  closedBy?: string | undefined;
  expected?: number | undefined;
  counted?: number | undefined;
  denominations?: Record<string, number> | undefined;
}
