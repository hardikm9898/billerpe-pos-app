import type {
  ModuleGrant,
  PermissionModule,
  Permissions,
  Role,
  RolePermissions,
  SpecialPermission,
  StandardAction,
  Staff,
} from "./types";

// Role defaults: the SAME seed values as the Web POS and the exe
// (billerpe-local-exe/constant/rolePermissionDefaults.js). A new outlet
// starts with these; the owner can change them per role and per user.

export const ALL_MODULES: PermissionModule[] = [
  "dashboard",
  "biller",
  "keyboard-billing",
  "kds",
  "orders",
  "menu",
  "tables",
  "reservations",
  "queue",
  "users",
  "permissions",
  "reports",
  "expense",
  "stock-masters",
  "stock-transactions",
  "stock-recipes",
  "stock-reports",
  "cash-session",
  "ops-billing",
  "ops-hardware",
  "ops-experience",
  "ops-ledger",
  "system",
  "audit-log",
];

export const ALL_SPECIAL: SpecialPermission[] = [
  "orders.editAfterKot",
  "orders.reopenSettled",
  "orders.deleteOrder",
  "tables.mergeTransfer",
  "system.remakeOrderSequence",
  "users.editPermissions",
];

const FULL: ModuleGrant = { view: true, create: true, edit: true, delete: true };
const VIEW: ModuleGrant = { view: true, create: false, edit: false, delete: false };
const EDIT: ModuleGrant = { view: true, create: true, edit: true, delete: false };
const NONE: ModuleGrant = { view: false, create: false, edit: false, delete: false };

const row = (m: Partial<Record<PermissionModule, ModuleGrant>>): RolePermissions =>
  Object.fromEntries(ALL_MODULES.map((k) => [k, { ...(m[k] ?? NONE) }])) as RolePermissions;

const special = (on: SpecialPermission[]): Record<SpecialPermission, boolean> =>
  Object.fromEntries(ALL_SPECIAL.map((k) => [k, on.includes(k)])) as Record<
    SpecialPermission,
    boolean
  >;

export const ROLE_DEFAULTS: Record<Role, Permissions> = {
  Owner: {
    modules: row(Object.fromEntries(ALL_MODULES.map((m) => [m, FULL]))),
    special: special(ALL_SPECIAL),
  },
  Manager: {
    modules: row({
      dashboard: VIEW,
      biller: FULL,
      "keyboard-billing": FULL,
      kds: VIEW,
      orders: FULL,
      menu: FULL,
      tables: FULL,
      reservations: FULL,
      queue: FULL,
      reports: VIEW,
      expense: EDIT,
      "stock-masters": VIEW,
      "stock-transactions": VIEW,
      "stock-recipes": VIEW,
      "stock-reports": VIEW,
      "cash-session": FULL,
      "ops-billing": VIEW,
      "ops-hardware": VIEW,
      "ops-experience": VIEW,
      "ops-ledger": FULL,
      "audit-log": VIEW,
    }),
    special: special([
      "orders.editAfterKot",
      "orders.reopenSettled",
      "orders.deleteOrder",
      "tables.mergeTransfer",
    ]),
  },
  Cashier: {
    modules: row({
      biller: EDIT,
      "keyboard-billing": EDIT,
      orders: EDIT,
      menu: VIEW,
      tables: VIEW,
      expense: EDIT,
      "cash-session": FULL,
    }),
    special: special([]),
  },
  Captain: {
    modules: row({
      biller: EDIT,
      "keyboard-billing": EDIT,
      kds: VIEW,
      orders: EDIT,
      menu: VIEW,
      tables: FULL,
      reservations: FULL,
      queue: FULL,
    }),
    special: special(["tables.mergeTransfer"]),
  },
  "Kitchen Staff": { modules: row({ kds: FULL }), special: special([]) },
  "Inventory Manager": {
    modules: row({
      menu: VIEW,
      "stock-masters": FULL,
      "stock-transactions": FULL,
      "stock-recipes": FULL,
      "stock-reports": VIEW,
    }),
    special: special([]),
  },
  Accountant: {
    modules: row({
      dashboard: VIEW,
      orders: VIEW,
      reports: VIEW,
      expense: FULL,
      "stock-transactions": VIEW,
      "stock-reports": VIEW,
      "cash-session": FULL,
      "ops-billing": VIEW,
      "ops-ledger": FULL,
      "audit-log": VIEW,
    }),
    special: special([]),
  },
};

export function effectivePermissions(
  user: Staff | null,
  roleDefaults: Record<Role, Permissions>,
): Permissions {
  if (!user) return { modules: row({}), special: special([]) };
  // The owner always has everything - nobody can lock the owner out.
  if (user.isOwner) return ROLE_DEFAULTS.Owner;
  return user.overrides ?? roleDefaults[user.role] ?? ROLE_DEFAULTS[user.role];
}

export function can(
  p: Permissions,
  module: PermissionModule,
  action: StandardAction = "view",
): boolean {
  return Boolean(p.modules[module]?.[action]);
}

export function canSpecial(p: Permissions, key: SpecialPermission): boolean {
  return Boolean(p.special[key]);
}

export const MODULE_LABEL: Record<PermissionModule, string> = {
  dashboard: "Dashboard",
  biller: "Billing (tables & orders)",
  "keyboard-billing": "Counter billing",
  kds: "Kitchen display",
  orders: "Orders",
  menu: "Menu",
  tables: "Tables",
  reservations: "Reservations",
  queue: "Waitlist",
  users: "Staff",
  permissions: "Permissions",
  reports: "Reports",
  expense: "Expenses",
  "stock-masters": "Stock items & suppliers",
  "stock-transactions": "Purchases & stock entries",
  "stock-recipes": "Recipes",
  "stock-reports": "Stock reports",
  "cash-session": "Cash session",
  "ops-billing": "Billing settings",
  "ops-hardware": "Printers & kitchens",
  "ops-experience": "Display & QR settings",
  "ops-ledger": "Due & customers",
  system: "Devices & subscription",
  "audit-log": "Audit log",
};

export const SPECIAL_LABEL: Record<SpecialPermission, string> = {
  "orders.editAfterKot": "Edit items after KOT",
  "orders.reopenSettled": "Edit a settled bill",
  "orders.deleteOrder": "Cancel an order",
  "tables.mergeTransfer": "Merge / transfer tables",
  "system.remakeOrderSequence": "Reset bill numbers",
  "users.editPermissions": "Edit permissions",
};

export const ROLE_HOME: Record<Role, string> = {
  Owner: "/dashboard",
  Manager: "/dashboard",
  Cashier: "/counter",
  Captain: "/tables",
  "Kitchen Staff": "/kds",
  "Inventory Manager": "/stock",
  Accountant: "/dashboard",
};

/** What each screen needs. Screens not listed are open to every signed-in user. */
export type Need =
  { module: PermissionModule; action?: StandardAction } | { any: PermissionModule[] };

export const SCREEN_NEEDS: Record<string, Need> = {
  "/dashboard": { module: "dashboard" },
  "/tables": { any: ["biller", "tables"] },
  "/order": { module: "biller" },
  "/bill": { module: "biller" },
  "/edit-bill": { module: "orders" },
  "/takeaway": { module: "biller" },
  "/status": { module: "biller" },
  "/qr-orders": { module: "biller" },
  "/tokens": { module: "biller" },
  "/counter": { module: "keyboard-billing" },
  "/orders": { module: "orders" },
  "/kds": { module: "kds" },
  "/menu": { module: "menu" },
  "/tables-setup": { module: "tables", action: "edit" },
  "/reservations": { module: "reservations" },
  "/queue": { module: "queue" },
  "/staff": { module: "users" },
  "/devices": { module: "system" },
  "/subscription": { module: "system" },
  "/outlet": { module: "ops-billing" },
  "/settings": { any: ["ops-billing", "ops-hardware", "ops-experience"] },
  "/expenses": { module: "expense" },
  "/cash": { module: "cash-session" },
  "/due": { module: "ops-ledger" },
  "/customers": { module: "ops-ledger" },
  "/reports": { any: ["reports", "stock-reports"] },
  "/stock": { any: ["stock-masters", "stock-transactions", "stock-recipes", "stock-reports"] },
  "/audit": { module: "audit-log" },
};

export function canOpen(p: Permissions, path: string): boolean {
  const key = Object.keys(SCREEN_NEEDS)
    .filter((k) => path === k || path.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (!key) return true;
  const need = SCREEN_NEEDS[key]!;
  if ("any" in need) return need.any.some((m) => can(p, m));
  return can(p, need.module, need.action ?? "view");
}

/** First screen this user can open: role home, else the first allowed tab. */
export function homeFor(user: Staff, p: Permissions): string {
  const home = ROLE_HOME[user.role];
  if (canOpen(p, home)) return home;
  const fallback = [
    "/tables",
    "/counter",
    "/orders",
    "/kds",
    "/dashboard",
    "/stock",
    "/reports",
    "/expenses",
  ].find((r) => canOpen(p, r));
  return fallback ?? "/profile";
}
