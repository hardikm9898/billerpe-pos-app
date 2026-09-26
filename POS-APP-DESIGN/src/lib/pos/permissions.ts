import type { CrudAction, ModuleKey, Permissions, Role, SpecialPermission } from "./types";

const full = (modules: ModuleKey[]): Permissions["modules"] =>
  Object.fromEntries(
    modules.map((m) => [m, { view: true, create: true, edit: true, delete: true }]),
  ) as Permissions["modules"];

const viewOnly = (modules: ModuleKey[]): Permissions["modules"] =>
  Object.fromEntries(modules.map((m) => [m, { view: true }])) as Permissions["modules"];

export const rolePermissions: Record<Role, Permissions> = {
  owner: {
    modules: full([
      "billing", "orders", "tables", "menu", "reports", "expenses", "stock",
      "cash", "staff", "devices", "settings", "subscription", "kds", "audit", "help",
    ]),
    special: {
      editAfterKot: true,
      reopenSettledBill: true,
      deleteOrder: true,
      mergeTransferTables: true,
      editPermissions: true,
      discountBeyondLimit: true,
      printBill: true,
    },
  },
  manager: {
    modules: {
      ...full(["billing", "orders", "tables", "menu", "reports", "expenses", "stock", "cash"]),
      ...viewOnly(["staff", "devices", "settings", "audit", "help", "kds"]),
    },
    special: {
      editAfterKot: true,
      reopenSettledBill: true,
      deleteOrder: true,
      mergeTransferTables: true,
      printBill: true,
    },
  },
  captain: {
    modules: {
      ...full(["orders", "tables"]),
      ...viewOnly(["menu", "help"]),
    },
    special: { editAfterKot: true, mergeTransferTables: true },
  },
  cashier: {
    modules: {
      ...full(["billing", "orders", "cash"]),
      ...viewOnly(["tables", "menu", "help"]),
    },
    special: { reopenSettledBill: false, printBill: true },
  },
  kitchen: {
    modules: viewOnly(["kds"]),
    special: {},
  },
};

export function can(
  permissions: Permissions,
  moduleKey: ModuleKey,
  action: CrudAction = "view",
): boolean {
  return Boolean(permissions.modules[moduleKey]?.[action]);
}

export function canSpecial(permissions: Permissions, key: SpecialPermission): boolean {
  return Boolean(permissions.special[key]);
}

export const roleLabel: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  captain: "Captain",
  cashier: "Cashier",
  kitchen: "Kitchen",
};

export const roleHome: Record<Role, string> = {
  owner: "/dashboard",
  manager: "/dashboard",
  captain: "/tables",
  cashier: "/counter",
  kitchen: "/kds",
};

export const specialLabels: Record<SpecialPermission, string> = {
  editAfterKot: "Edit after KOT",
  reopenSettledBill: "Reopen settled bill",
  deleteOrder: "Delete / cancel order",
  mergeTransferTables: "Merge / transfer tables",
  editPermissions: "Edit permissions",
  discountBeyondLimit: "Discount beyond limit",
  printBill: "Print bill",
};

export const moduleLabels: Record<ModuleKey, string> = {
  billing: "Billing", orders: "Orders", tables: "Tables", menu: "Menu", reports: "Reports",
  expenses: "Expenses", stock: "Stock", cash: "Cash session", staff: "Staff", devices: "Devices",
  settings: "Settings", subscription: "Subscription", kds: "Kitchen display", audit: "Audit log", help: "Help",
};
