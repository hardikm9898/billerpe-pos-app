import { ROLE_DEFAULTS } from "../../permissions";
import type {
  AddonGroup,
  Device,
  ExpenseHead,
  MenuCatalog,
  MenuCategory,
  MenuItem,
  OutletSettings,
  PosTable,
  RawMaterial,
  Recipe,
  SemiFinished,
  Staff,
  StockUnit,
  Supplier,
  TableSection,
  Variant,
} from "../../types";
import { clone, type MockDb } from "./db";

// Master data for ONE demo tenant ("Demo Restaurant"). Everything is plainly
// demo - no real outlet's names. Today's orders are NOT listed here: the
// mock server creates them by running its own actions (see server.ts
// seedToday), so demo data always obeys the same rules as live data.

export const DEMO_PASSWORD = "demo1234";

const staff: (Staff & { pin: string })[] = [
  {
    id: "stf-1",
    name: "Rohit Shah",
    mobile: "9000000001",
    role: "Owner",
    active: true,
    isOwner: true,
    pin: "1111",
  },
  {
    id: "stf-2",
    name: "Neha Kulkarni",
    mobile: "9000000002",
    role: "Manager",
    active: true,
    isOwner: false,
    pin: "2222",
  },
  {
    id: "stf-3",
    name: "Ravi Patil",
    mobile: "9000000003",
    role: "Captain",
    active: true,
    isOwner: false,
    pin: "3333",
  },
  {
    id: "stf-4",
    name: "Sunita Rao",
    mobile: "9000000004",
    role: "Cashier",
    active: true,
    isOwner: false,
    pin: "4444",
  },
  {
    id: "stf-5",
    name: "Kitchen Tablet",
    mobile: "9000000005",
    role: "Kitchen Staff",
    active: true,
    isOwner: false,
    pin: "5555",
  },
  {
    id: "stf-6",
    name: "Imran Sheikh",
    mobile: "9000000006",
    role: "Captain",
    active: true,
    isOwner: false,
    pin: "6666",
  },
  {
    id: "stf-7",
    name: "Anil Stores",
    mobile: "9000000007",
    role: "Inventory Manager",
    active: true,
    isOwner: false,
    pin: "7777",
  },
  {
    id: "stf-8",
    name: "Kavya Accounts",
    mobile: "9000000008",
    role: "Accountant",
    active: true,
    isOwner: false,
    pin: "8888",
  },
  {
    id: "stf-9",
    name: "Old Captain",
    mobile: "9000000009",
    role: "Captain",
    active: false,
    isOwner: false,
    pin: "9999",
  },
];

const sections: TableSection[] = [
  { id: "sec-1", name: "AC Hall", rank: 1 },
  { id: "sec-2", name: "Garden", rank: 2 },
  { id: "sec-3", name: "Rooftop", rank: 3 },
];

const t = (id: string, name: string, sectionId: string, seats: number): PosTable => ({
  id,
  name,
  sectionId,
  seats,
  status: "free",
  qrVersion: 1,
});
const tables: PosTable[] = [
  t("tbl-1", "T1", "sec-1", 4),
  t("tbl-2", "T2", "sec-1", 2),
  t("tbl-3", "T3", "sec-1", 4),
  t("tbl-4", "T4", "sec-1", 6),
  t("tbl-5", "T5", "sec-1", 4),
  t("tbl-6", "T6", "sec-1", 2),
  t("tbl-7", "G1", "sec-2", 4),
  t("tbl-8", "G2", "sec-2", 4),
  t("tbl-9", "G3", "sec-2", 8),
  t("tbl-10", "G4", "sec-2", 4),
  t("tbl-11", "R1", "sec-3", 4),
  t("tbl-12", "R2", "sec-3", 4),
  t("tbl-13", "R3", "sec-3", 6),
  t("tbl-14", "R4", "sec-3", 2),
];

const menus: MenuCatalog[] = [
  {
    id: "menu-main",
    name: "Main Menu",
    isDefault: true,
    active: true,
    sectionIds: [],
    orderTypes: [],
  },
  {
    id: "menu-garden",
    name: "Garden Menu",
    isDefault: false,
    active: true,
    sectionIds: ["sec-2"],
    orderTypes: ["dinin"],
  },
];

const categories: MenuCategory[] = [
  { id: "cat-1", menuId: "menu-main", name: "Starters", rank: 1, active: true },
  { id: "cat-2", menuId: "menu-main", name: "Main Course", rank: 2, active: true },
  { id: "cat-3", menuId: "menu-main", name: "Breads", rank: 3, active: true },
  { id: "cat-4", menuId: "menu-main", name: "Rice & Biryani", rank: 4, active: true },
  { id: "cat-5", menuId: "menu-main", name: "Beverages", rank: 5, active: true },
  { id: "cat-6", menuId: "menu-main", name: "Desserts", rank: 6, active: true },
  { id: "cat-g1", menuId: "menu-garden", name: "Garden Grills", rank: 1, active: true },
  { id: "cat-g2", menuId: "menu-garden", name: "Coolers", rank: 2, active: true },
];

const variants: Variant[] = [
  { id: "var-half", menuId: "menu-main", name: "Half" },
  { id: "var-full", menuId: "menu-main", name: "Full" },
  { id: "var-single", menuId: "menu-main", name: "Single" },
  { id: "var-family", menuId: "menu-main", name: "Family" },
];

const addonGroups: AddonGroup[] = [
  {
    id: "ag-spice",
    menuId: "menu-main",
    name: "Spice level",
    min: 1,
    max: 1,
    single: true,
    active: true,
    options: [
      { id: "ao-mild", name: "Mild", price: 0, dietary: "veg" },
      { id: "ao-medium", name: "Medium", price: 0, dietary: "veg" },
      { id: "ao-hot", name: "Hot", price: 0, dietary: "veg" },
    ],
  },
  {
    id: "ag-extras",
    menuId: "menu-main",
    name: "Extras",
    min: 0,
    max: 3,
    single: false,
    active: true,
    options: [
      { id: "ao-cheese", name: "Extra cheese", price: 40, dietary: "veg" },
      { id: "ao-butter", name: "Extra butter", price: 20, dietary: "veg" },
      { id: "ao-gravy", name: "Extra gravy", price: 60, dietary: "veg" },
    ],
  },
  {
    id: "ag-lime",
    menuId: "menu-main",
    name: "Style",
    min: 1,
    max: 1,
    single: true,
    active: true,
    options: [
      { id: "ao-sweet", name: "Sweet", price: 0, dietary: "vegan" },
      { id: "ao-salt", name: "Salted", price: 0, dietary: "vegan" },
    ],
  },
];

let itemSeq = 0;
const item = (
  menuId: string,
  categoryId: string,
  name: string,
  shortCode: string,
  price: number,
  dietary: MenuItem["dietary"],
  extra: Partial<MenuItem> = {},
): MenuItem => ({
  id: `itm-${++itemSeq}`,
  menuId,
  categoryId,
  name,
  shortCode,
  price,
  dietary,
  gstType: "G",
  description: "",
  favorite: false,
  active: true,
  outOfStock: false,
  variants: [],
  addonGroupIds: [],
  ...extra,
});

const items: MenuItem[] = [
  item("menu-main", "cat-1", "Paneer Tikka", "PT", 280, "veg", {
    favorite: true,
    variants: [
      { variantId: "var-half", name: "Half", price: 280 },
      { variantId: "var-full", name: "Full", price: 460 },
    ],
    addonGroupIds: ["ag-spice", "ag-extras"],
  }),
  item("menu-main", "cat-1", "Chicken Tikka", "CT", 340, "nonveg", { addonGroupIds: ["ag-spice"] }),
  item("menu-main", "cat-1", "Veg Manchurian", "VM", 220, "veg"),
  item("menu-main", "cat-1", "Chilli Egg", "CE", 180, "egg"),
  item("menu-main", "cat-2", "Paneer Butter Masala", "PBM", 320, "veg", {
    favorite: true,
    addonGroupIds: ["ag-extras"],
  }),
  item("menu-main", "cat-2", "Butter Chicken", "BC", 420, "nonveg", {
    favorite: true,
    addonGroupIds: ["ag-spice", "ag-extras"],
  }),
  item("menu-main", "cat-2", "Dal Tadka", "DT", 210, "veg"),
  item("menu-main", "cat-2", "Jain Veg Kofta", "JVK", 300, "jain", { outOfStock: true }),
  item("menu-main", "cat-3", "Tandoori Roti", "TR", 25, "veg"),
  item("menu-main", "cat-3", "Butter Naan", "BN", 55, "veg"),
  item("menu-main", "cat-3", "Laccha Paratha", "LP", 65, "veg"),
  item("menu-main", "cat-4", "Hyderabadi Chicken Biryani", "HCB", 380, "nonveg", {
    variants: [
      { variantId: "var-single", name: "Single", price: 380 },
      { variantId: "var-family", name: "Family", price: 720 },
    ],
  }),
  item("menu-main", "cat-4", "Veg Pulao", "VP", 240, "veg"),
  item("menu-main", "cat-4", "Jeera Rice", "JR", 180, "veg"),
  // Packaged drinks carry a barcode (scan to add, owner list 2026-09-29 #12).
  item("menu-main", "cat-5", "Masala Chaas", "MC", 70, "veg", { barcode: "8901063015418" }),
  item("menu-main", "cat-5", "Fresh Lime Soda", "FLS", 90, "vegan", { addonGroupIds: ["ag-lime"] }),
  item("menu-main", "cat-5", "Filter Coffee", "FC", 60, "veg", { barcode: "8901725181222" }),
  item("menu-main", "cat-6", "Gulab Jamun", "GJ", 110, "veg"),
  item("menu-main", "cat-6", "Sizzling Brownie", "SB", 190, "egg"),
  item("menu-garden", "cat-g1", "Garden Paneer Skewer", "GPS", 320, "veg"),
  item("menu-garden", "cat-g1", "Garden Chicken Grill", "GCG", 390, "nonveg"),
  item("menu-garden", "cat-g2", "Garden Mojito", "GM", 99, "vegan"),
  item("menu-garden", "cat-g2", "Lemonade", "LEM", 60, "vegan"),
];

const settings: OutletSettings = {
  gstOn: true,
  taxes: [
    {
      id: "tax-cgst",
      name: "CGST",
      type: "pr",
      rate: 2.5,
      active: true,
      orderTypes: [],
      sectionIds: [],
      itemIds: [],
    },
    {
      id: "tax-sgst",
      name: "SGST",
      type: "pr",
      rate: 2.5,
      active: true,
      orderTypes: [],
      sectionIds: [],
      itemIds: [],
    },
  ],
  // Automatic 5% service charge on dine-in only; pickup gets none unless added by hand.
  serviceCharge: {
    active: true,
    type: "percentage",
    value: 5,
    calculationOn: "total",
    orderTypes: ["dinin"],
    taxOnCharge: true,
    condition: "3",
    threshold: 0,
  },
  packagingCharge: {
    active: true,
    type: "fixed",
    value: 20,
    calculationOn: "core",
    orderTypes: ["pickup"],
    taxOnCharge: false,
    condition: "3",
    threshold: 0,
  },
  paymentModes: [
    { id: "cash", name: "Cash", locked: true, active: true, custom: false },
    { id: "upi", name: "UPI", locked: false, active: true, custom: false },
    { id: "card", name: "Card", locked: false, active: true, custom: false },
    { id: "due", name: "Due", locked: true, active: true, custom: false },
    { id: "pm-paytm", name: "Paytm", locked: false, active: true, custom: true },
  ],
  promoCodes: [
    {
      id: "promo-1",
      name: "Weekday 10% off",
      code: "WEEKDAY10",
      type: "pr",
      value: 10,
      active: true,
    },
    { id: "promo-2", name: "Flat 50 off", code: "FLAT50", type: "fix", value: 50, active: true },
  ],
  kitchens: [
    {
      id: "kit-main",
      name: "Main Kitchen",
      categoryIds: ["cat-2", "cat-4", "cat-6", "cat-1"],
      sectionIds: [],
      orderTypes: [],
    },
    {
      id: "kit-tandoor",
      name: "Tandoor",
      categoryIds: ["cat-3", "cat-g1"],
      sectionIds: [],
      orderTypes: [],
    },
    {
      id: "kit-bar",
      name: "Bar",
      categoryIds: ["cat-5", "cat-g2"],
      sectionIds: [],
      orderTypes: [],
    },
  ],
  invoiceFormat: {
    header: [
      { id: "ih1", content: "logo", fontSize: 12 },
      { id: "ih2", content: "outlet-name", fontSize: 16 },
      { id: "ih3", content: "address", fontSize: 10 },
      { id: "ih4", content: "gstin", fontSize: 10 },
      { id: "ih5", content: "fssai", fontSize: 10 },
    ],
    footer: [
      { id: "if1", content: "upi-qr", fontSize: 10 },
      { id: "if2", content: "text", text: "Thank you, visit again!", fontSize: 11 },
    ],
  },
  kotFormat: {
    header: [
      { id: "kh1", content: "outlet-name", fontSize: 12 },
      { id: "kh2", content: "order-type", fontSize: 12 },
      { id: "kh3", content: "kot-number", fontSize: 14 },
      { id: "kh4", content: "token-number", fontSize: 14 },
    ],
    footer: [],
    showPrices: false,
  },
  tokens: { tokenFor: "pickup", billWithKot: "off", billWithToken: "off" },
  saveBehave: "save",
  businessDayStart: "06:00",
  billReset: "financial_year",
  financialYearStartMonth: 4,
  cashSessionOn: true,
  qrOrdering: true,
  tableGridView: "tabs",
  supplierPaymentsAsExpense: true,
  ownerAlerts: { cancelAfterKot: true, bigDiscount: true, discountPct: 20, cashDifference: true },
};

const expenseHeads: ExpenseHead[] = [
  { id: "eh-1", name: "Electricity", type: "Fixed", active: true },
  { id: "eh-2", name: "Groceries", type: "Variable", active: true },
  { id: "eh-3", name: "Staff tea & snacks", type: "Variable", active: true },
  { id: "eh-4", name: "Repairs", type: "Variable", active: true },
  { id: "eh-supplier", name: "Supplier payment", type: "Variable", active: true, system: true },
];

const devices: Device[] = [
  {
    id: "dev-this",
    name: "Counter tablet",
    make: "Sunmi",
    model: "V2 Pro",
    android: "11",
    appVersion: "1.0.0",
    userName: "",
    lastActive: new Date().toISOString(),
    thisDevice: true,
    printKots: true,
    printers: [
      {
        id: "prn-builtin",
        name: "Built-in printer",
        connection: "builtin",
        paperWidth: "58mm",
        copies: 1,
        printsKot: false,
        printsInvoice: true,
        categoryIds: [],
        sectionIds: [],
        orderTypes: [],
        status: "connected",
        driver: "Virtual Bluetooth (InnerPrinter)",
      },
      {
        id: "prn-kitchen",
        name: "Kitchen printer",
        connection: "wifi",
        address: "192.168.1.50:9100",
        paperWidth: "80mm",
        copies: 1,
        printsKot: true,
        printsInvoice: false,
        categoryIds: ["cat-1", "cat-2", "cat-3", "cat-4", "cat-6", "cat-g1"],
        sectionIds: [],
        orderTypes: [],
        status: "connected",
      },
      {
        id: "prn-bar",
        name: "Bar printer",
        connection: "wifi",
        address: "192.168.1.51:9100",
        paperWidth: "58mm",
        copies: 1,
        printsKot: true,
        printsInvoice: false,
        categoryIds: ["cat-5", "cat-g2"],
        sectionIds: [],
        orderTypes: [],
        status: "unreachable",
      },
    ],
  },
  {
    id: "dev-2",
    name: "Ravi's phone",
    make: "Samsung",
    model: "Galaxy M14",
    android: "14",
    appVersion: "1.0.0",
    userName: "Ravi Patil",
    lastActive: new Date(Date.now() - 4 * 60000).toISOString(),
    thisDevice: false,
    printKots: true,
    printers: [
      {
        id: "prn-r1",
        name: "Kitchen printer",
        connection: "wifi",
        address: "192.168.1.50:9100",
        paperWidth: "80mm",
        copies: 1,
        printsKot: true,
        printsInvoice: false,
        categoryIds: [],
        sectionIds: [],
        orderTypes: [],
        status: "unknown",
      },
    ],
  },
  {
    id: "dev-3",
    name: "Kitchen tablet",
    make: "Lenovo",
    model: "Tab M10",
    android: "12",
    appVersion: "1.0.0",
    userName: "Kitchen Tablet",
    lastActive: new Date(Date.now() - 60000).toISOString(),
    thisDevice: false,
    printKots: false,
    printers: [],
  },
  {
    id: "dev-4",
    name: "Owner's phone",
    make: "Xiaomi",
    model: "Redmi Note 13",
    android: "14",
    appVersion: "1.0.0",
    userName: "Rohit Shah",
    lastActive: new Date(Date.now() - 3 * 3600000).toISOString(),
    thisDevice: false,
    printKots: false,
    printers: [],
  },
];

const units: StockUnit[] = [
  { id: "u-kg", name: "Kilogram", short: "kg" },
  { id: "u-g", name: "Gram", short: "g" },
  { id: "u-l", name: "Litre", short: "L" },
  { id: "u-ml", name: "Millilitre", short: "ml" },
  { id: "u-pc", name: "Piece", short: "pc" },
];

const raw = (
  id: string,
  name: string,
  category: string,
  unitId: string,
  purchaseUnitId: string,
  conversion: number,
  stock: number,
  reorderLevel: number,
  rate: number,
): RawMaterial => ({
  id,
  name,
  category,
  unitId,
  purchaseUnitId,
  conversion,
  stock,
  reorderLevel,
  rate,
  active: true,
});

const rawMaterials: RawMaterial[] = [
  raw("raw-paneer", "Paneer", "Dairy", "u-g", "u-kg", 1000, 4200, 2000, 0.38),
  raw("raw-chicken", "Chicken", "Meat", "u-g", "u-kg", 1000, 6500, 3000, 0.26),
  raw("raw-butter", "Butter", "Dairy", "u-g", "u-kg", 1000, 900, 1000, 0.52),
  raw("raw-flour", "Wheat flour", "Dry", "u-g", "u-kg", 1000, 18000, 5000, 0.04),
  raw("raw-rice", "Basmati rice", "Dry", "u-g", "u-kg", 1000, 12000, 5000, 0.11),
  raw("raw-milk", "Milk", "Dairy", "u-ml", "u-l", 1000, 8000, 5000, 0.06),
  raw("raw-lime", "Lime", "Produce", "u-pc", "u-pc", 1, 45, 30, 3),
  raw("raw-gravy", "Makhani gravy", "Prep", "u-ml", "u-l", 1000, -250, 2000, 0.09),
];

const suppliers: Supplier[] = [
  {
    id: "sup-1",
    name: "Fresh Dairy Co.",
    contact: "Mahesh",
    phone: "9822000001",
    gstin: "",
    outstanding: 0,
  },
  {
    id: "sup-2",
    name: "City Meat Suppliers",
    contact: "Salim",
    phone: "9822000002",
    gstin: "",
    outstanding: 0,
  },
  {
    id: "sup-3",
    name: "Grain Traders",
    contact: "Vinod",
    phone: "9822000003",
    gstin: "",
    outstanding: 0,
  },
];

const recipes: Recipe[] = [
  {
    id: "rcp-1",
    itemId: "itm-1",
    base: [{ kind: "raw", refId: "raw-paneer", qty: 150 }],
    byVariant: { "var-full": [{ kind: "raw", refId: "raw-paneer", qty: 250 }] },
    byAddon: { "ao-cheese": [{ kind: "raw", refId: "raw-butter", qty: 10 }] },
  },
  {
    id: "rcp-2",
    itemId: "itm-6",
    base: [
      { kind: "raw", refId: "raw-chicken", qty: 200 },
      { kind: "semi", refId: "semi-gravy", qty: 150 },
    ],
    byVariant: {},
    byAddon: {},
  },
  {
    id: "rcp-3",
    itemId: "itm-10",
    base: [
      { kind: "raw", refId: "raw-flour", qty: 90 },
      { kind: "raw", refId: "raw-butter", qty: 8 },
    ],
    byVariant: {},
    byAddon: {},
  },
  {
    id: "rcp-4",
    itemId: "itm-14",
    base: [{ kind: "raw", refId: "raw-rice", qty: 150 }],
    byVariant: {},
    byAddon: {},
  },
  {
    id: "rcp-5",
    itemId: "itm-16",
    base: [{ kind: "raw", refId: "raw-lime", qty: 1 }],
    byVariant: {},
    byAddon: {},
  },
];

const semi: SemiFinished[] = [
  {
    id: "semi-gravy",
    name: "Makhani gravy (batch)",
    unitId: "u-ml",
    stock: 1800,
    minStock: 1000,
    components: [
      { kind: "raw", refId: "raw-butter", qty: 0.05 },
      { kind: "raw", refId: "raw-milk", qty: 0.3 },
    ],
  },
];

export function seedDb(): MockDb {
  const secrets: MockDb["secrets"] = {};
  for (const s of staff) secrets[s.id] = { password: DEMO_PASSWORD, pin: s.pin };
  return {
    outlet: {
      id: "out-1",
      name: "Main Branch",
      address: "12 MG Road, Demo Nagar",
      phone: "020-40000000",
      gstin: "27ABCDE1234F1Z5",
      fssai: "11521999000123",
      upiId: "demorestaurant@upi",
      deviceLimit: 6,
      devicesInUse: devices.length,
    },
    outlets: [
      { id: "out-1", name: "Main Branch" },
      { id: "out-2", name: "Lake View" },
    ],
    settings: clone(settings),
    staff: staff.map(({ pin: _pin, ...s }) => s),
    roleDefaults: clone(ROLE_DEFAULTS),
    sections: clone(sections),
    tables: clone(tables),
    menus: clone(menus),
    categories: clone(categories),
    variants: clone(variants),
    addonGroups: clone(addonGroups),
    items: clone(items),
    orders: [],
    reservations: [],
    queue: [],
    qrOrders: [],
    customers: [],
    dueCollections: [],
    refundsOwed: [],
    cashSession: null,
    cashHistory: [],
    expenseHeads: clone(expenseHeads),
    expenses: [],
    devices: clone(devices),
    alerts: [],
    audit: [],
    tickets: [],
    subscription: {
      plan: "App Standard",
      expiresAt: new Date(Date.now() + 23 * 86400000).toISOString(),
      ebillCredits: 480,
      invoices: [
        {
          id: "INV-2291",
          at: new Date(Date.now() - 342 * 86400000).toISOString(),
          amount: 11800,
          plan: "App Standard · 1 year",
        },
        {
          id: "INV-1874",
          at: new Date(Date.now() - 707 * 86400000).toISOString(),
          amount: 8260,
          plan: "App Lite · 1 year",
        },
      ],
    },
    stock: {
      units: clone(units),
      raw: clone(rawMaterials),
      suppliers: clone(suppliers),
      purchases: [],
      recipes: clone(recipes),
      semi: clone(semi),
      movements: [],
      wastage: [],
    },
    tokenResetAt: null,
    secrets,
    seenKeys: new Map(),
    seq: {},
  };
}
