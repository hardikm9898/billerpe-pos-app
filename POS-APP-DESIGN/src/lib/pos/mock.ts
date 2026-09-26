import type {
  MenuCategory,
  MenuItem,
  MenuList,
  Order,
  Outlet,
  PosAlert,
  Printer,
  Reservation,
  Staff,
  PosTable,
  TableSection,
  BillingSettings,
  CashSession,
  DueCollection,
  Device,
  Expense,
  ExpenseHead,
  AuditEntry,
} from "./types";

const now = Date.now();
const mins = (m: number) => new Date(now - m * 60000).toISOString();
const plusMins = (m: number) => new Date(now + m * 60000).toISOString();

export const outlets: Outlet[] = [
  {
    id: "out-1",
    name: "Main Branch",
    restaurant: "Demo Restaurant",
    gstin: "27ABCDE1234F1Z5",
    address: "12 MG Road, Demo Nagar",
    upiId: "demorestaurant@upi",
    kitchens: ["Main Kitchen", "Bar", "Tandoor"],
    deviceLimit: 6,
    devicesInUse: 4,
  },
  {
    id: "out-2",
    name: "Lake View",
    restaurant: "Demo Restaurant",
    gstin: "27ABCDE1234F1Z5",
    address: "4 Lake Road, Demo Nagar",
    upiId: "demorestaurant@upi",
    kitchens: ["Main Kitchen"],
    deviceLimit: 6,
    devicesInUse: 4,
  },
];

export const staff: Staff[] = [
  {
    id: "stf-1",
    name: "Rohit Shah",
    mobile: "9000000001",
    role: "owner",
    pin: "1111",
    password: "demo1234",
    active: true,
    isOwner: true,
    recentOnDevice: true,
  },
  {
    id: "stf-2",
    name: "Neha Kulkarni",
    mobile: "9000000002",
    role: "manager",
    pin: "2222",
    password: "demo1234",
    active: true,
    recentOnDevice: true,
  },
  {
    id: "stf-3",
    name: "Ravi Patil",
    mobile: "9000000003",
    role: "captain",
    pin: "3333",
    password: "demo1234",
    active: true,
    recentOnDevice: true,
  },
  {
    id: "stf-4",
    name: "Sunita Rao",
    mobile: "9000000004",
    role: "cashier",
    pin: "4444",
    password: "demo1234",
    active: true,
    recentOnDevice: true,
  },
  {
    id: "stf-5",
    name: "Tandoor Screen",
    mobile: "9000000005",
    role: "kitchen",
    pin: "5555",
    password: "demo1234",
    active: true,
  },
  {
    id: "stf-6",
    name: "Imran Sheikh",
    mobile: "9000000006",
    role: "captain",
    pin: "6666",
    password: "demo1234",
    active: false,
  },
];

export const sections: TableSection[] = [
  { id: "sec-1", name: "AC Hall" },
  { id: "sec-2", name: "Garden" },
  { id: "sec-3", name: "Rooftop" },
];

export const tables: PosTable[] = [
  { id: "tbl-1", name: "T1", sectionId: "sec-1", seats: 4, status: "running", guests: 3, captainName: "Ravi Patil", openedAt: mins(38) },
  { id: "tbl-2", name: "T2", sectionId: "sec-1", seats: 2, status: "free", guests: 0 },
  { id: "tbl-3", name: "T3", sectionId: "sec-1", seats: 4, status: "hold", guests: 4, captainName: "Ravi Patil", openedAt: mins(64) },
  { id: "tbl-4", name: "T4", sectionId: "sec-1", seats: 6, status: "billed", guests: 5, captainName: "Imran Sheikh", openedAt: mins(72) },
  { id: "tbl-5", name: "T5", sectionId: "sec-1", seats: 4, status: "free", guests: 0, qrOrderWaiting: true },
  { id: "tbl-6", name: "T6", sectionId: "sec-1", seats: 2, status: "reserved", guests: 0, reservedFor: plusMins(25) },
  { id: "tbl-7", name: "G1", sectionId: "sec-2", seats: 4, status: "running", guests: 2, captainName: "Ravi Patil", openedAt: mins(12) },
  { id: "tbl-8", name: "G2", sectionId: "sec-2", seats: 4, status: "free", guests: 0 },
  { id: "tbl-9", name: "G3", sectionId: "sec-2", seats: 8, status: "free", guests: 0 },
  { id: "tbl-10", name: "G4", sectionId: "sec-2", seats: 4, status: "running", guests: 4, captainName: "Ravi Patil", openedAt: mins(52) },
  { id: "tbl-11", name: "R1", sectionId: "sec-3", seats: 4, status: "free", guests: 0 },
  { id: "tbl-12", name: "R2", sectionId: "sec-3", seats: 4, status: "free", guests: 0 },
  { id: "tbl-13", name: "R3", sectionId: "sec-3", seats: 6, status: "reserved", guests: 0, reservedFor: plusMins(90) },
  { id: "tbl-14", name: "R4", sectionId: "sec-3", seats: 2, status: "free", guests: 0 },
];

export const menus: MenuList[] = [
  { id: "menu-main", name: "Main Menu" },
  { id: "menu-garden", name: "Garden Menu" },
];

export const categories: MenuCategory[] = [
  { id: "cat-1", name: "Starters", sort: 1 },
  { id: "cat-2", name: "Main Course", sort: 2 },
  { id: "cat-3", name: "Breads", sort: 3 },
  { id: "cat-4", name: "Rice & Biryani", sort: 4 },
  { id: "cat-5", name: "Beverages", sort: 5 },
  { id: "cat-6", name: "Desserts", sort: 6 },
];

const spiceAddon = {
  id: "ag-spice",
  name: "Spice level",
  min: 1,
  max: 1,
  options: [
    { id: "ao-mild", name: "Mild", price: 0 },
    { id: "ao-medium", name: "Medium", price: 0 },
    { id: "ao-hot", name: "Hot", price: 0 },
  ],
};

const extrasAddon = {
  id: "ag-extras",
  name: "Extras",
  min: 0,
  max: 3,
  options: [
    { id: "ao-cheese", name: "Extra cheese", price: 40 },
    { id: "ao-butter", name: "Extra butter", price: 20 },
    { id: "ao-gravy", name: "Extra gravy", price: 60 },
  ],
};

const allMenus = ["menu-main", "menu-garden"];

export const menuItems: MenuItem[] = [
  { id: "itm-1", name: "Paneer Tikka", shortCode: "PT", categoryId: "cat-1", price: 280, vegType: "veg", kitchen: "Tandoor", menuIds: allMenus, variants: [{ id: "v-half", name: "Half", price: 280 }, { id: "v-full", name: "Full", price: 460 }], addonGroups: [spiceAddon, extrasAddon] },
  { id: "itm-2", name: "Chicken Tikka", shortCode: "CT", categoryId: "cat-1", price: 340, vegType: "nonveg", kitchen: "Tandoor", menuIds: allMenus, addonGroups: [spiceAddon] },
  { id: "itm-3", name: "Veg Manchurian", shortCode: "VM", categoryId: "cat-1", price: 220, vegType: "veg", kitchen: "Main Kitchen", menuIds: allMenus },
  { id: "itm-4", name: "Chilli Egg", shortCode: "CE", categoryId: "cat-1", price: 180, vegType: "egg", kitchen: "Main Kitchen", menuIds: ["menu-main"] },
  { id: "itm-5", name: "Paneer Butter Masala", shortCode: "PBM", categoryId: "cat-2", price: 320, vegType: "veg", kitchen: "Main Kitchen", menuIds: allMenus, addonGroups: [extrasAddon] },
  { id: "itm-6", name: "Butter Chicken", shortCode: "BC", categoryId: "cat-2", price: 420, vegType: "nonveg", kitchen: "Main Kitchen", menuIds: allMenus, addonGroups: [spiceAddon, extrasAddon] },
  { id: "itm-7", name: "Dal Tadka", shortCode: "DT", categoryId: "cat-2", price: 210, vegType: "veg", kitchen: "Main Kitchen", menuIds: allMenus },
  { id: "itm-8", name: "Jain Veg Kofta", shortCode: "JVK", categoryId: "cat-2", price: 300, vegType: "jain", kitchen: "Main Kitchen", menuIds: ["menu-main"], outOfStock: true },
  { id: "itm-9", name: "Tandoori Roti", shortCode: "TR", categoryId: "cat-3", price: 25, vegType: "veg", kitchen: "Tandoor", menuIds: allMenus },
  { id: "itm-10", name: "Butter Naan", shortCode: "BN", categoryId: "cat-3", price: 55, vegType: "veg", kitchen: "Tandoor", menuIds: allMenus },
  { id: "itm-11", name: "Laccha Paratha", shortCode: "LP", categoryId: "cat-3", price: 65, vegType: "veg", kitchen: "Tandoor", menuIds: allMenus },
  { id: "itm-12", name: "Hyderabadi Chicken Biryani", shortCode: "HCB", categoryId: "cat-4", price: 380, vegType: "nonveg", kitchen: "Main Kitchen", menuIds: allMenus, variants: [{ id: "v-single", name: "Single", price: 380 }, { id: "v-family", name: "Family", price: 720 }] },
  { id: "itm-13", name: "Veg Pulao", shortCode: "VP", categoryId: "cat-4", price: 240, vegType: "veg", kitchen: "Main Kitchen", menuIds: allMenus },
  { id: "itm-14", name: "Jeera Rice", shortCode: "JR", categoryId: "cat-4", price: 180, vegType: "veg", kitchen: "Main Kitchen", menuIds: allMenus },
  { id: "itm-15", name: "Masala Chaas", shortCode: "MC", categoryId: "cat-5", price: 70, vegType: "veg", kitchen: "Bar", menuIds: allMenus },
  { id: "itm-16", name: "Fresh Lime Soda", shortCode: "FLS", categoryId: "cat-5", price: 90, vegType: "vegan", kitchen: "Bar", menuIds: allMenus, addonGroups: [{ id: "ag-lime", name: "Style", min: 1, max: 1, options: [{ id: "ao-sweet", name: "Sweet", price: 0 }, { id: "ao-salt", name: "Salted", price: 0 }] }] },
  { id: "itm-17", name: "Filter Coffee", shortCode: "FC", categoryId: "cat-5", price: 60, vegType: "veg", kitchen: "Bar", menuIds: allMenus },
  { id: "itm-18", name: "Gulab Jamun", shortCode: "GJ", categoryId: "cat-6", price: 110, vegType: "veg", kitchen: "Main Kitchen", menuIds: allMenus },
  { id: "itm-19", name: "Sizzling Brownie", shortCode: "SB", categoryId: "cat-6", price: 190, vegType: "egg", kitchen: "Main Kitchen", menuIds: ["menu-main"] },
  { id: "itm-20", name: "Tender Coconut Payasam", shortCode: "TCP", categoryId: "cat-6", price: 140, vegType: "vegan", kitchen: "Main Kitchen", menuIds: ["menu-garden"] },
];

let lineSeq = 100;
const line = (
  itemId: string,
  quantity: number,
  status: "sent" | "ready" | "served",
  roundNo: number,
  extra?: { variantName?: string; addonNames?: string[]; note?: string },
) => {
  const item = menuItems.find((i) => i.id === itemId)!;
  return {
    id: `ln-${lineSeq++}`,
    itemId,
    name: item.name,
    variantName: extra?.variantName,
    addonNames: extra?.addonNames ?? [],
    note: extra?.note,
    unitPrice: item.price,
    quantity,
    kitchen: item.kitchen,
    vegType: item.vegType,
    status,
    roundNo,
  };
};

export const orders: Order[] = [
  {
    id: "ord-1",
    code: "A-1039",
    type: "dine-in",
    tableId: "tbl-1",
    guests: 3,
    menuId: "menu-main",
    captainName: "Ravi Patil",
    status: "running",
    createdAt: mins(38),
    draftLines: [],
    rounds: [
      {
        roundNo: 1,
        kotNo: 11,
        sentAt: mins(36),
        printed: true,
        printerName: "Kitchen Printer",
        lines: [
          line("itm-1", 1, "served", 1, { variantName: "Full", addonNames: ["Medium"] }),
          line("itm-10", 3, "served", 1),
        ],
      },
      {
        roundNo: 2,
        kotNo: 14,
        sentAt: mins(9),
        printed: true,
        printerName: "Kitchen Printer",
        lines: [line("itm-6", 1, "ready", 2, { addonNames: ["Hot"], note: "Less oil" }), line("itm-14", 1, "sent", 2)],
      },
    ],
  },
  {
    id: "ord-2",
    code: "A-1040",
    type: "dine-in",
    tableId: "tbl-3",
    guests: 4,
    menuId: "menu-main",
    captainName: "Ravi Patil",
    status: "hold",
    createdAt: mins(64),
    draftLines: [line("itm-3", 2, "sent", 0), line("itm-9", 4, "sent", 0)].map((l) => ({ ...l, status: "new" as const, roundNo: undefined })),
    rounds: [],
  },
  {
    id: "ord-3",
    code: "A-1041",
    type: "dine-in",
    tableId: "tbl-7",
    guests: 2,
    customerName: "Aarti",
    customerMobile: "9812345678",
    menuId: "menu-garden",
    captainName: "Ravi Patil",
    status: "running",
    createdAt: mins(12),
    draftLines: [],
    rounds: [
      {
        roundNo: 1,
        kotNo: 15,
        sentAt: mins(10),
        printed: false,
        printerName: "Garden Printer",
        lines: [line("itm-16", 2, "sent", 1, { addonNames: ["Salted"] }), line("itm-13", 1, "sent", 1)],
      },
    ],
  },
  {
    id: "ord-4",
    code: "A-1042",
    type: "dine-in",
    tableId: "tbl-10",
    guests: 4,
    menuId: "menu-garden",
    captainName: "Ravi Patil",
    status: "running",
    createdAt: mins(52),
    billRequested: true,
    draftLines: [],
    rounds: [
      {
        roundNo: 1,
        kotNo: 12,
        sentAt: mins(50),
        printed: true,
        printerName: "Garden Printer",
        lines: [line("itm-12", 1, "served", 1, { variantName: "Family" }), line("itm-15", 4, "served", 1)],
      },
    ],
  },
  {
    id: "ord-5",
    code: "T-204",
    type: "takeaway",
    tokenNo: 204,
    guests: 0,
    customerName: "Vikram",
    customerMobile: "9898989898",
    menuId: "menu-main",
    captainName: "Ravi Patil",
    status: "running",
    createdAt: mins(6),
    draftLines: [],
    rounds: [
      {
        roundNo: 1,
        kotNo: 16,
        sentAt: mins(5),
        printed: true,
        printerName: "Kitchen Printer",
        lines: [line("itm-2", 1, "ready", 1, { addonNames: ["Hot"] })],
      },
    ],
  },
];

export const reservations: Reservation[] = [
  { id: "res-1", name: "Mehta family", mobile: "9820011223", guests: 6, at: plusMins(90), tableId: "tbl-13", note: "Birthday cake at 9", status: "booked" },
  { id: "res-2", name: "Anil Deshpande", mobile: "9820011224", guests: 2, at: plusMins(25), tableId: "tbl-6", status: "booked" },
  { id: "res-3", name: "Shruti G", mobile: "9820011225", guests: 4, at: mins(80), tableId: "tbl-4", status: "seated" },
  { id: "res-4", name: "Farhan K", mobile: "9820011226", guests: 3, at: mins(200), status: "noshow" },
];

export const alerts: PosAlert[] = [
  { id: "alr-1", kind: "food-ready", title: "Butter Chicken ready", body: "T1 · Round 2 · Main Kitchen", at: mins(3), read: false },
  { id: "alr-2", kind: "bill-requested", title: "Bill requested at G4", body: "₹1,180.00 · 4 guests", at: mins(7), read: false },
  { id: "alr-3", kind: "qr-order", title: "New QR order at T5", body: "2 items waiting to accept", at: mins(11), read: false },
  { id: "alr-4", kind: "reservation-due", title: "Reservation due soon", body: "Anil Deshpande · 2 guests · T6", at: mins(14), read: true },
  { id: "alr-5", kind: "food-ready", title: "Chicken Tikka ready", body: "Token 204 · Takeaway", at: mins(4), read: true },
];

export const printers: Printer[] = [
  { id: "prn-1", name: "Kitchen Printer", kind: "wifi", address: "192.168.1.50:9100", paperWidth: "80mm", status: "connected" },
  { id: "prn-2", name: "Garden Printer", kind: "wifi", address: "192.168.1.51:9100", paperWidth: "80mm", status: "unreachable" },
  { id: "prn-3", name: "Built-in printer", kind: "builtin", paperWidth: "58mm", status: "connected" },
];

export const deviceInfo = {
  name: "Captain Ravi's phone",
  make: "Sunmi",
  model: "V2 Pro",
  android: "Android 11",
  appVersion: "1.4.2",
};

// ---------- Billing & payments ----------

export const billingSettings: BillingSettings = {
  taxRate: 0.05,
  roundOff: true,
  billPrefix: "A-",
  billReset: "yearly",
  discountLimits: { captain: 0, cashier: 10, manager: 25, owner: null, kitchen: 0 },
  invoice: {
    header: "Demo Restaurant\n12 MG Road, Demo Nagar",
    footer: "Thank you! Visit again.",
    gstin: "27ABCDE1234F1Z5",
    fssai: "11521999000123",
    paper: "80mm",
  },
  kotShowPrices: false,
  businessDayStart: "06:00",
  tokenMode: "takeaway",
  qrOrdering: true,
  categoryKitchen: { "cat-1": "Tandoor", "cat-2": "Main Kitchen", "cat-3": "Tandoor", "cat-4": "Main Kitchen", "cat-5": "Bar", "cat-6": "Main Kitchen" },
  serviceChargeRate: 0.05,
  packagingCharge: 20,
  deliveryCharge: 40,
  paymentModes: [
    { id: "cash", label: "Cash", locked: true },
    { id: "upi", label: "UPI" },
    { id: "card", label: "Card" },
    { id: "due", label: "Due", locked: true },
    { id: "paytm", label: "Paytm", custom: true },
  ],
  promoCodes: [
    { code: "WELCOME10", kind: "percent", value: 10, minBill: 300, label: "10% off above ₹300" },
    { code: "FLAT50", kind: "flat", value: 50, minBill: 500, label: "₹50 off above ₹500" },
  ],
};

const settled = (
  id: string,
  code: string,
  minutesAgo: number,
  lines: ReturnType<typeof line>[],
  payments: Order["payments"],
  settledTotal: number,
  extra: Partial<Order> = {},
): Order => ({
  id,
  code,
  type: "dine-in",
  guests: 2,
  menuId: "menu-main",
  captainName: "Ravi Patil",
  status: "settled",
  createdAt: mins(minutesAgo + 50),
  draftLines: [],
  rounds: [{ roundNo: 1, kotNo: 1 + Number(code.replace(/\D/g, "")) % 10, sentAt: mins(minutesAgo + 45), printed: true, printerName: "Kitchen Printer", lines }],
  payments,
  settledTotal,
  settledAt: mins(minutesAgo),
  settledBy: "Sunita Rao",
  billPrintedAt: mins(minutesAgo + 4),
  ...extra,
});

export const pastOrders: Order[] = [
  settled("ord-p1", "A-1031", 300, [line("itm-5", 1, "served", 1), line("itm-10", 4, "served", 1)], [{ mode: "cash", amount: 600 }], 588, { tableId: "tbl-2", changeReturned: 12 }),
  settled("ord-p2", "A-1032", 260, [line("itm-6", 2, "served", 1), line("itm-10", 4, "served", 1)], [{ mode: "upi", amount: 1164 }], 1164, { tableId: "tbl-5" }),
  settled("ord-p3", "A-1033", 220, [line("itm-1", 1, "served", 1, { variantName: "Full" }), line("itm-14", 2, "served", 1)], [{ mode: "card", amount: 400 }, { mode: "cash", amount: 342 }], 742, { tableId: "tbl-9" }),
  settled("ord-p4", "A-1034", 180, [line("itm-6", 1, "served", 1), line("itm-5", 1, "served", 1)], [{ mode: "due", amount: 781 }], 781, { tableId: "tbl-4", customerName: "Mahesh Joshi", customerMobile: "9822012345", dueOutstanding: 781 }),
  settled("ord-p5", "A-1035", 1500, [line("itm-2", 2, "served", 1), line("itm-10", 2, "served", 1)], [{ mode: "cash", amount: 300 }, { mode: "due", amount: 491 }], 791, { tableId: "tbl-6", customerName: "Mahesh Joshi", customerMobile: "9822012345", dueOutstanding: 191 }),
  settled("ord-p6", "A-1036", 2900, [line("itm-12", 1, "served", 1, { variantName: "Family" })], [{ mode: "due", amount: 525 }], 525, { tableId: "tbl-8", customerName: "Priya Nair", customerMobile: "9765432100", dueOutstanding: 525 }),
  settled("ord-p7", "T-201", 90, [line("itm-2", 1, "served", 1)], [{ mode: "paytm", amount: 378 }], 378, { type: "takeaway", tokenNo: 201, guests: 0, readyAt: mins(95) }),
  settled("ord-p8", "T-202", 25, [line("itm-3", 1, "ready", 1), line("itm-14", 1, "ready", 1)], [{ mode: "cash", amount: 400 }], 367, { type: "takeaway", tokenNo: 202, guests: 0, readyAt: mins(4), changeReturned: 33 }),
  settled("ord-p9", "T-203", 12, [line("itm-5", 1, "sent", 1)], [{ mode: "upi", amount: 357 }], 357, { type: "takeaway", tokenNo: 203, guests: 0 }),
  {
    id: "ord-p10", code: "A-1037", type: "dine-in", tableId: "tbl-2", guests: 2, menuId: "menu-main", captainName: "Ravi Patil",
    status: "cancelled", createdAt: mins(140), draftLines: [], cancelReason: "Guest left before food",
    rounds: [{ roundNo: 1, kotNo: 9, sentAt: mins(138), printed: true, printerName: "Kitchen Printer", lines: [line("itm-3", 1, "sent", 1)] }],
    events: [{ at: mins(130), label: "Cancelled — Guest left before food", by: "Neha Kulkarni" }],
  },
];

export const dueCollections: DueCollection[] = [
  { id: "due-1", mobile: "9822012345", name: "Mahesh Joshi", amount: 300, mode: "upi", at: mins(900), by: "Sunita Rao" },
];

export const cashSession: CashSession = {
  id: "cs-12",
  openedAt: mins(420),
  openedBy: "Sunita Rao",
  openingFloat: 2000,
  entries: [
    { id: "ce-1", kind: "out", amount: 150, reason: "Milk & bread", at: mins(360), by: "Sunita Rao" },
    { id: "ce-2", kind: "in", amount: 500, reason: "Change from bank", at: mins(240), by: "Neha Kulkarni" },
  ],
};

// ---------- History for dashboard & reports (deterministic) ----------

let seed = 42;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;

function buildHistory(): Order[] {
  const out: Order[] = [];
  const itemIds = ["itm-1", "itm-2", "itm-3", "itm-5", "itm-6", "itm-9", "itm-10", "itm-12", "itm-13", "itm-14", "itm-15", "itm-16"];
  const modes = ["cash", "cash", "upi", "upi", "upi", "card", "paytm"];
  const tableIds = ["tbl-1", "tbl-2", "tbl-3", "tbl-5", "tbl-6", "tbl-9", "tbl-11"];
  let n = 900;
  for (let day = 1; day <= 30; day++) {
    const count = 5 + Math.floor(rand() * 6);
    for (let k = 0; k < count; k++) {
      const d = new Date(now);
      d.setDate(d.getDate() - day);
      d.setHours(11 + Math.floor(rand() * 11), Math.floor(rand() * 60), 0, 0);
      const type = rand() < 0.65 ? "dine-in" : rand() < 0.7 ? "takeaway" : "delivery";
      const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => {
        const l = line(pick(itemIds), 1 + Math.floor(rand() * 2), "served", 1);
        return l;
      });
      const sub = lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0);
      const discount = rand() < 0.12 ? { kind: "percent" as const, value: 10, reason: "Regular guest" } : undefined;
      const afterDisc = sub - (discount ? sub * 0.1 : 0);
      const extra = type === "dine-in" ? afterDisc * 0.05 : type === "delivery" ? 60 : 20;
      const total = Math.round((afterDisc + extra) * 1.05);
      const cancelled = rand() < 0.05;
      const at = d.toISOString();
      const code = `A-${n++}`;
      out.push({
        id: `ord-h${n}`,
        code,
        type,
        tableId: type === "dine-in" ? pick(tableIds) : undefined,
        tokenNo: type === "dine-in" ? undefined : 100 + k,
        guests: type === "dine-in" ? 1 + Math.floor(rand() * 4) : 0,
        menuId: "menu-main",
        captainName: pick(["Ravi Patil", "Ravi Patil", "Neha Kulkarni", "Sunita Rao"]),
        status: cancelled ? "cancelled" : "settled",
        cancelReason: cancelled ? "Customer left" : undefined,
        createdAt: new Date(d.getTime() - 40 * 60000).toISOString(),
        draftLines: [],
        rounds: [{ roundNo: 1, kotNo: n % 100, sentAt: new Date(d.getTime() - 35 * 60000).toISOString(), printed: true, printerName: "Kitchen Printer", lines }],
        discount,
        payments: cancelled ? undefined : [{ mode: pick(modes), amount: total }],
        settledAt: cancelled ? undefined : at,
        settledBy: cancelled ? undefined : "Sunita Rao",
        settledTotal: cancelled ? undefined : total,
        billPrintedAt: cancelled ? undefined : at,
        qrOrder: type === "dine-in" && rand() < 0.15 ? true : undefined,
      } as Order);
    }
  }
  return out;
}

export const historyOrders: Order[] = buildHistory();

// ---------- Devices, expenses, audit ----------

export const devices: Device[] = [
  {
    id: "dev-1", name: "Captain Ravi's phone", make: "Sunmi", model: "V2 Pro", android: "Android 11", appVersion: "1.4.2",
    userName: "Ravi Patil", lastActive: mins(0), thisDevice: true, printers: [],
    routing: { invoicePrinterId: "prn-3", kotPrinterByKitchen: { "Main Kitchen": "prn-1", Tandoor: "prn-1", Bar: "prn-3" }, printKotOnDevice: true },
  },
  {
    id: "dev-2", name: "Counter tablet", make: "Lenovo", model: "Tab M10", android: "Android 12", appVersion: "1.4.2",
    userName: "Sunita Rao", lastActive: mins(3),
    printers: [{ id: "prn-21", name: "Counter printer", kind: "usb", paperWidth: "80mm", status: "connected", copies: 1 }],
    routing: { invoicePrinterId: "prn-21", kotPrinterByKitchen: {}, printKotOnDevice: false },
  },
  {
    id: "dev-3", name: "Kitchen screen", make: "Samsung", model: "Galaxy Tab A8", android: "Android 13", appVersion: "1.4.1",
    userName: "Tandoor Screen", lastActive: mins(1), printers: [],
    routing: { kotPrinterByKitchen: {}, printKotOnDevice: false },
  },
  {
    id: "dev-4", name: "Owner's phone", make: "Xiaomi", model: "Redmi Note 12", android: "Android 13", appVersion: "1.4.2",
    userName: "Rohit Shah", lastActive: mins(95), printers: [],
    routing: { kotPrinterByKitchen: {}, printKotOnDevice: false },
  },
];

export const expenseHeads: ExpenseHead[] = [
  { id: "eh-1", name: "Vegetables" },
  { id: "eh-2", name: "Gas" },
  { id: "eh-3", name: "Salaries" },
  { id: "eh-4", name: "Rent" },
  { id: "eh-5", name: "Maintenance" },
];

export const expenses: Expense[] = [
  { id: "ex-1", headId: "eh-1", amount: 1850, mode: "cash", note: "Sabzi mandi", at: mins(300), by: "Neha Kulkarni" },
  { id: "ex-2", headId: "eh-2", amount: 2200, mode: "upi", note: "2 cylinders", at: mins(1500), by: "Neha Kulkarni" },
  { id: "ex-3", headId: "eh-5", amount: 650, mode: "cash", note: "Fridge repair", at: mins(4400), by: "Rohit Shah" },
  { id: "ex-4", headId: "eh-4", amount: 45000, mode: "upi", note: "Monthly rent", at: mins(12000), by: "Rohit Shah" },
];

export const audit: AuditEntry[] = [
  { id: "au-1", at: mins(420), by: "Sunita Rao", role: "cashier", module: "Cash session", action: "Opened cash session with ₹2,000.00" },
  { id: "au-2", at: mins(130), by: "Neha Kulkarni", role: "manager", module: "Orders", action: "Cancelled A-1037 — Guest left before food" },
  { id: "au-3", at: mins(60), by: "Rohit Shah", role: "owner", module: "Menu", action: "Marked Jain Veg Kofta out of stock" },
];
