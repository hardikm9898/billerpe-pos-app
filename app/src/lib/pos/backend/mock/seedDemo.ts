import type { DraftLine, MenuItem, Staff } from "../../types";
import * as core from "./core";
import * as dom from "./domains";
import type { MockDb } from "./db";

// Demo activity, created by RUNNING the same actions staff use, so every
// order, bill number, token, KOT, total, due, cash movement and stock
// deduction follows the real rules. 30 days of history + a live floor.

let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const pick = <T>(a: T[]): T => a[Math.floor(rand() * a.length)]!;

function line(
  db: MockDb,
  itemId: string,
  qty: number,
  opts: { variant?: string; addons?: string[]; note?: string } = {},
): DraftLine {
  const item = db.items.find((i) => i.id === itemId) as MenuItem;
  const v = item.variants.find((x) => x.variantId === opts.variant);
  const addons = (opts.addons ?? []).map((id) => {
    const g = db.addonGroups.find((x) => x.options.some((o) => o.id === id))!;
    const o = g.options.find((x) => x.id === id)!;
    return { id: o.id, groupId: g.id, name: o.name, price: o.price, qty: 1 };
  });
  return {
    key: `${itemId}-${rand()}`,
    itemId,
    name: item.name,
    categoryId: item.categoryId,
    dietary: item.dietary,
    variantId: v?.variantId,
    variantName: v?.name,
    addons,
    note: opts.note,
    price: v?.price ?? item.price,
    qty,
    custom: false,
  };
}

function as(db: MockDb, staffId: string, at: Date): core.Ctx {
  return { db, user: db.staff.find((s) => s.id === staffId) as Staff, now: at };
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000);

export function seedDemoActivity(db: MockDb) {
  const mainItems = db.items
    .filter((i) => i.menuId === "menu-main" && !i.outOfStock)
    .map((i) => i.id);
  const captains = ["stf-3", "stf-6"];
  const modes = ["cash", "cash", "upi", "upi", "upi", "card", "pm-paytm"];
  const dayMs = 86400000;
  let key = 0;

  // ---- 30 days of history ----
  for (let d = 30; d >= 1; d--) {
    const day = new Date(Date.now() - d * dayMs);
    const perDay = 5 + Math.floor(rand() * 6);
    for (let n = 0; n < perDay; n++) {
      const at = new Date(day);
      at.setHours(12 + Math.floor(rand() * 10), Math.floor(rand() * 60), 0, 0);
      const pickup = rand() < 0.25;
      const c = as(db, pickup ? "stf-4" : pick(captains), at);
      const table = pick(db.tables.filter((t) => t.sectionId !== "sec-2"));
      const lines = Array.from({ length: 1 + Math.floor(rand() * 4) }, () =>
        line(db, pick(mainItems), 1 + Math.floor(rand() * 2)),
      );
      const r = core.sendKot(c, {
        type: pickup ? "pickup" : "dinin",
        tableId: pickup ? undefined : table.id,
        guests: 1 + Math.floor(rand() * 4),
        menuId: "menu-main",
        lines,
        clientKey: `h${key++}`,
      });
      const o = db.orders.find((x) => x.id === r.orderId)!;
      for (const k of o.kots) for (const l of k.lines) l.status = "served";
      if (rand() < 0.04) {
        core.cancelOrder(
          { ...c, user: db.staff[1]! },
          o.id,
          pick(["Guest left", "Duplicate order", "Wrong table"]),
        );
        continue;
      }
      if (rand() < 0.15)
        core.setDiscount({ ...c, user: db.staff[1]! }, o.id, {
          type: "pr",
          value: 10,
          reason: "Regular guest",
        });
      const settleAt = {
        ...c,
        now: new Date(at.getTime() + (30 + rand() * 50) * 60000),
        user: db.staff[3]!,
      };
      if (rand() < 0.06) {
        const cust = pick([
          { name: "Mahesh Joshi", mobile: "9822012345" },
          { name: "Priya Nair", mobile: "9765432100" },
        ]);
        core.settle(settleAt, o.id, {
          payments: [{ modeId: "due", amount: o.totals.grand }],
          customerName: cust.name,
          customerMobile: cust.mobile,
        });
      } else {
        core.settle(settleAt, o.id, {
          payments: [{ modeId: pick(modes), amount: o.totals.grand }],
        });
      }
    }
    if (d % 3 === 0) {
      dom.saveExpense(as(db, "stf-2", day), {
        headId: pick(["eh-2", "eh-3", "eh-4"]),
        amount: 150 + Math.floor(rand() * 900),
        modeId: "cash",
        note: "Daily purchase",
        fromDrawer: false,
      });
    }
  }
  // One due collected last week.
  dom.collectDue(as(db, "stf-2", new Date(Date.now() - 5 * dayMs)), "9822012345", 200, "upi");

  // ---- purchases (stock in + supplier payments recorded as expenses) ----
  dom.savePurchase(as(db, "stf-7", new Date(Date.now() - 6 * dayMs)), {
    supplierId: "sup-1",
    date: new Date(Date.now() - 6 * dayMs).toISOString().slice(0, 10),
    invoiceNo: "FD-8812",
    lines: [
      { rawId: "raw-paneer", qty: 5, rate: 360, taxPct: 0 },
      { rawId: "raw-butter", qty: 2, rate: 510, taxPct: 0 },
    ],
    firstPayment: { amount: 1500, modeId: "upi", fromDrawer: false },
  });
  dom.savePurchase(as(db, "stf-7", new Date(Date.now() - 2 * dayMs)), {
    supplierId: "sup-2",
    date: new Date(Date.now() - 2 * dayMs).toISOString().slice(0, 10),
    lines: [{ rawId: "raw-chicken", qty: 8, rate: 250, taxPct: 0 }],
  });

  // ---- today ----
  dom.openCash(as(db, "stf-4", minutesAgo(300)), 2000);
  dom.cashMovement(as(db, "stf-2", minutesAgo(200)), "in", 500, "Change from bank");
  dom.cashMovement(as(db, "stf-4", minutesAgo(170)), "out", 150, "Milk & bread");
  dom.saveExpense(as(db, "stf-4", minutesAgo(160)), {
    headId: "eh-3",
    amount: 120,
    modeId: "cash",
    note: "Tea for staff",
    fromDrawer: true,
  });

  const ravi = (m: number) => as(db, "stf-3", minutesAgo(m));
  const kot = (
    c: core.Ctx,
    tableId: string | undefined,
    lines: DraftLine[],
    extra: {
      guests?: number;
      orderId?: string;
      type?: "dinin" | "pickup";
      menuId?: string;
      name?: string;
      mobile?: string;
    } = {},
  ) =>
    core.sendKot(c, {
      orderId: extra.orderId,
      type: extra.type ?? "dinin",
      tableId,
      guests: extra.guests ?? 2,
      menuId: extra.menuId ?? "menu-main",
      customerName: extra.name,
      customerMobile: extra.mobile,
      lines,
      clientKey: `t${key++}`,
    });

  // Settled today.
  for (const [m, tableId, items, mode] of [
    [260, "tbl-2", ["itm-3", "itm-14"], "upi"],
    [230, "tbl-11", ["itm-6", "itm-10", "itm-10"], "cash"],
    [190, "tbl-12", ["itm-12"], "card"],
    [150, "tbl-5", ["itm-1", "itm-15"], "cash"],
  ] as const) {
    const r = kot(
      ravi(m),
      tableId,
      items.map((i) => line(db, i, 1)),
    );
    for (const k of db.orders.find((o) => o.id === r.orderId)!.kots)
      for (const l of k.lines) l.status = "served";
    const o = db.orders.find((x) => x.id === r.orderId)!;
    core.settle(as(db, "stf-4", minutesAgo(m - 40)), r.orderId, {
      payments: [{ modeId: mode, amount: o.totals.grand }],
    });
  }
  const dueToday = kot(ravi(140), "tbl-13", [line(db, "itm-5", 1), line(db, "itm-11", 2)]);
  core.settle(as(db, "stf-4", minutesAgo(100)), dueToday.orderId, {
    payments: [
      { modeId: "due", amount: db.orders.find((o) => o.id === dueToday.orderId)!.totals.grand },
    ],
    customerName: "Priya Nair",
    customerMobile: "9765432100",
  });
  const cancelled = kot(ravi(120), "tbl-14", [line(db, "itm-2", 1)]);
  core.cancelOrder(as(db, "stf-2", minutesAgo(110)), cancelled.orderId, "Guest left before food");

  // T1: two rounds, first one served / ready.
  const t1 = kot(
    ravi(38),
    "tbl-1",
    [
      line(db, "itm-1", 1, { variant: "var-full", addons: ["ao-medium", "ao-cheese"] }),
      line(db, "itm-10", 3),
    ],
    { guests: 3 },
  );
  kot(
    ravi(9),
    "tbl-1",
    [line(db, "itm-6", 1, { addons: ["ao-hot"], note: "Less oil" }), line(db, "itm-14", 1)],
    { orderId: t1.orderId },
  );
  const t1o = db.orders.find((o) => o.id === t1.orderId)!;
  for (const l of t1o.kots[0]!.lines) l.status = "served";
  t1o.kots[1]!.lines[0]!.status = "ready";

  // T3: held (saved, not sent) after one KOT.
  const t3 = kot(ravi(64), "tbl-3", [line(db, "itm-7", 1), line(db, "itm-9", 4)], { guests: 4 });
  core.holdOrder(ravi(20), {
    orderId: t3.orderId,
    type: "dinin",
    tableId: "tbl-3",
    guests: 4,
    menuId: "menu-main",
    lines: [line(db, "itm-18", 2)],
    clientKey: `t${key++}`,
  });

  // T4: bill printed, waiting to settle.
  const t4 = kot(
    as(db, "stf-6", minutesAgo(72)),
    "tbl-4",
    [line(db, "itm-12", 2, { variant: "var-single" }), line(db, "itm-15", 3)],
    { guests: 5 },
  );
  for (const k of db.orders.find((o) => o.id === t4.orderId)!.kots)
    for (const l of k.lines) l.status = "served";
  core.printBill(as(db, "stf-6", minutesAgo(8)), t4.orderId);

  // G1 (Garden menu), G4 fresh KOTs in the kitchen.
  kot(ravi(12), "tbl-7", [line(db, "itm-22", 2), line(db, "itm-20", 1)], { menuId: "menu-garden" });
  const g4 = kot(ravi(52), "tbl-10", [line(db, "itm-5", 1), line(db, "itm-10", 2)], { guests: 4 });
  for (const l of db.orders.find((o) => o.id === g4.orderId)!.kots[0]!.lines)
    l.status = "preparing";

  // Pickup at the counter (token).
  const p1 = core.counterOrder(as(db, "stf-4", minutesAgo(18)), {
    type: "pickup",
    lines: [line(db, "itm-3", 1), line(db, "itm-17", 2)],
    menuId: "menu-main",
    customerName: "Walk-in",
    customerMobile: "",
  });
  void p1;

  // A QR round waiting on T5 (table is free after its earlier bill).
  db.qrOrders.push({
    id: "qr-1",
    tableId: "tbl-5",
    customerName: "Aarav",
    customerMobile: "9811100001",
    round: 1,
    status: "pending",
    createdAt: minutesAgo(3).toISOString(),
    items: [
      {
        key: "q1",
        itemId: "itm-5",
        name: "Paneer Butter Masala",
        dietary: "veg",
        addons: [],
        price: 320,
        qty: 1,
        decision: "pending",
      },
      {
        key: "q2",
        itemId: "itm-10",
        name: "Butter Naan",
        dietary: "veg",
        addons: [],
        price: 55,
        qty: 2,
        decision: "pending",
      },
      {
        key: "q3",
        itemId: "itm-19",
        name: "Sizzling Brownie",
        dietary: "egg",
        addons: [],
        price: 190,
        qty: 1,
        note: "Birthday candle",
        decision: "pending",
      },
    ],
  });

  // Reservations: T6 soon (held now), R3 later tonight, one no-show yesterday.
  const inMin = (m: number) => new Date(Date.now() + m * 60000).toISOString();
  db.reservations.push(
    {
      id: "res-1",
      name: "Sharma family",
      mobile: "9876500001",
      guests: 2,
      at: inMin(25),
      endAt: inMin(115),
      tableIds: ["tbl-6"],
      advance: 0,
      status: "booked",
    },
    {
      id: "res-2",
      name: "Office party",
      mobile: "9876500002",
      guests: 6,
      at: inMin(150),
      endAt: inMin(270),
      tableIds: ["tbl-9"],
      advance: 1000,
      note: "Cake at 9 pm",
      status: "booked",
    },
    {
      id: "res-3",
      name: "Mr. Kapoor",
      mobile: "9876500003",
      guests: 4,
      at: new Date(Date.now() - dayMs).toISOString(),
      endAt: new Date(Date.now() - dayMs + 5400000).toISOString(),
      tableIds: ["tbl-11"],
      advance: 0,
      status: "noshow",
    },
  );
  db.queue.push(
    {
      id: "q-1",
      name: "Rahul",
      mobile: "9800000101",
      guests: 3,
      status: "waiting",
      joinedAt: minutesAgo(12).toISOString(),
    },
    {
      id: "q-2",
      name: "Fatima",
      mobile: "9800000102",
      guests: 2,
      status: "called",
      joinedAt: minutesAgo(25).toISOString(),
      calledAt: minutesAgo(2).toISOString(),
    },
  );

  // Alerts that would have arrived today.
  core.alert(as(db, "stf-5", minutesAgo(4)), {
    kind: "food-ready",
    title: "Food ready · T1",
    body: "KOT #… · Main Kitchen · 1× Butter Chicken",
    link: "/order/t.tbl-1",
    forUserId: "stf-3",
  });
  core.alert(as(db, "stf-3", minutesAgo(3)), {
    kind: "qr-order",
    title: "New QR order · T5",
    body: "3 items from Aarav — accept or reject",
    link: "/qr-orders",
    forRoles: ["Captain", "Cashier", "Manager", "Owner"],
  });
  core.alert(as(db, "stf-3", minutesAgo(1)), {
    kind: "reservation-due",
    title: "Reservation in 25 min · T6",
    body: "Sharma family · 2 guests",
    link: "/reservations",
  });
  db.alerts[0]!.read = false;
}
