// Scenario tests for the order rules (mock backend = the spec for the cloud's
// /app/v1). Run: npm run verify:rules
import { billTotals, orderLines } from "../src/lib/pos/bill";
import { MockBackend, mockNet } from "../src/lib/pos/backend/mock/server";
import type { CartPayload, OutletData } from "../src/lib/pos/backend/types";
import type { DraftLine } from "../src/lib/pos/types";

mockNet.latency = 0;
let pass = 0;
let failCount = 0;
const check = (name: string, cond: unknown, detail?: unknown) => {
  if (cond) pass++;
  else {
    failCount++;
    console.log(`FAIL ${name}`, detail ?? "");
  }
};

const device = (id: string) => ({
  deviceId: id,
  name: id,
  make: "Test",
  model: "T",
  android: "14",
  appVersion: "1.0.0",
});
let k = 0;
const key = () => `k${k++}`;

function line(d: OutletData, itemId: string, qty = 1, extra: Partial<DraftLine> = {}): DraftLine {
  const i = d.items.find((x) => x.id === itemId)!;
  return {
    key: key(),
    itemId,
    name: i.name,
    categoryId: i.categoryId,
    dietary: i.dietary,
    addons: [],
    price: i.price,
    qty,
    custom: false,
    ...extra,
  };
}
const cart = (
  d: OutletData,
  tableId: string | undefined,
  lines: DraftLine[],
  extra: Partial<CartPayload> = {},
): CartPayload => ({
  type: tableId ? "dinin" : "pickup",
  tableId,
  guests: 2,
  menuId: "menu-main",
  lines,
  clientKey: key(),
  ...extra,
});

async function main() {
  const api = new MockBackend();

  // --- login ---
  check(
    "wrong password refused",
    (await api.loginWithPassword("9000000003", "nope", device("d1"))).error === "wrong-password",
  );
  check(
    "inactive refused",
    (await api.loginWithPassword("9000000009", "demo1234", device("d1"))).error === "inactive",
  );
  check(
    "PIN refused on an unknown device",
    !(await api.loginWithPin("stf-3", "3333", device("never-seen"))).ok,
  );
  // Demo outlet: 4 devices registered, limit 6 -> two new phones fit, the third is refused.
  check(
    "5th device allowed",
    (await api.loginWithPassword("9000000003", "demo1234", device("d-new-1"))).ok,
  );
  check(
    "6th device allowed",
    (await api.loginWithPassword("9000000003", "demo1234", device("d-new-2"))).ok,
  );
  const devLimit = await api.loginWithPassword("9000000003", "demo1234", device("d-new-3"));
  check("7th device hits the outlet limit of 6", devLimit.error === "device-limit", devLimit);
  const login = await api.loginWithPassword("9000000003", "demo1234", device("dev-2"));
  check("captain logs in on a registered device", login.ok, login);

  let d = await api.load();
  const tbl = (name: string) => d.tables.find((t) => t.name === name)!;
  check("T1 running", tbl("T1").status === "running");
  check("T3 hold", tbl("T3").status === "hold");
  check("T4 bill generated", tbl("T4").status === "billed");
  check("T6 reserved (booking in 25 min)", tbl("T6").status === "reserved");
  check("T5 free with QR waiting", tbl("T5").status === "free" && tbl("T5").qrWaiting);
  check("history exists", d.orders.filter((o) => o.status === "settled").length > 100);
  check(
    "captain sees own food-ready alert",
    d.alerts.some((a) => a.kind === "food-ready"),
  );
  check(
    "captain does not see cashier-only alerts",
    !d.alerts.some((a) => a.kind === "bill-requested"),
  );

  // --- totals use the real engine: 5% service on dine-in (taxed), CGST+SGST 2.5% ---
  const t4 = d.orders.find((o) => o.id === tbl("T4").orderId)!;
  const exp = (() => {
    const sub = 2 * 380 + 3 * 70;
    const svc = Math.round(sub * 5) / 100;
    const tax = (Math.round((sub + svc) * 2.5) / 100) * 2;
    return Math.round(sub + svc + tax);
  })();
  check("T4 grand matches engine", t4.totals.grand === exp, { got: t4.totals.grand, exp });

  // --- send KOT on a free table ---
  const before = Math.max(...d.orders.map((o) => Number(o.billNo)));
  const r1 = await api.sendKot(cart(d, tbl("T2").id, [line(d, "itm-6"), line(d, "itm-15", 2)]));
  check("KOT ok", r1.ok, r1);
  if (!r1.ok) return;
  check("bill number = next in sequence", Number(r1.billNo) === before + 1, {
    billNo: r1.billNo,
    before,
  });
  check("no token for dine-in (tokens: pickup only)", r1.token === 0);
  check(
    "KOT split to 2 kitchens (Main + Bar)",
    r1.kitchens.length === 2 && r1.kitchens.includes("Bar"),
    r1.kitchens,
  );
  d = await api.load();
  check("T2 running after KOT", tbl("T2").status === "running");

  // retry with the same clientKey does not duplicate
  const c2 = cart(d, undefined, [line(d, "itm-17")], {
    orderId: r1.orderId,
    type: "dinin",
    tableId: tbl("T2").id,
  });
  const a = await api.sendKot(c2);
  const b = await api.sendKot(c2);
  d = await api.load();
  const t2 = d.orders.find((o) => o.id === r1.orderId)!;
  check("same clientKey applied once", a.ok && b.ok && t2.kots.length === 2, t2.kots.length);

  // second device opening the same table joins the same order
  const r2 = await api.sendKot(cart(d, tbl("T2").id, [line(d, "itm-10")]));
  d = await api.load();
  check("two devices, one table -> one order", r2.ok && r2.orderId === r1.orderId);

  // --- pickup token ---
  const p = await api.sendKot(cart(d, undefined, [line(d, "itm-3")]));
  check("pickup gets the next daily token", p.ok && p.token > 0, p);

  // --- hold then bill ---
  const h = await api.holdOrder(cart(d, tbl("R4").id, [line(d, "itm-7")]));
  d = await api.load();
  check("hold creates order + table Hold", h.ok && tbl("R4").status === "hold");
  // Billing needs no KOT first (Web POS): held items go on the bill, no KDS;
  // with Bill-with-KOT off for dine-in they are not printed as a KOT.
  const pb = await api.printBill(h.ok ? h.orderId : "");
  d = await api.load();
  const billedHeld = d.orders.find((o) => o.id === (h.ok ? h.orderId : ""));
  check(
    "a held order bills directly; items on the bill, no kitchen, no extra KOT",
    pb.ok &&
      pb.kotLines.length === 0 &&
      billedHeld?.status === "billed" &&
      billedHeld.heldLines.length === 0,
    pb,
  );
  const direct = await api.billCart(cart(d, tbl("R2").id, [line(d, "itm-3")]));
  d = await api.load();
  check(
    "bill straight from a cart, no KOT sent first",
    direct.ok && tbl("R2").status === "billed",
    direct,
  );

  // --- remove a fired line: only who fired it, or Manager/Owner ---
  await api.logout();
  await api.loginWithPassword("9000000006", "demo1234", device("dev-2")); // Imran (captain)
  d = await api.load();
  const t1 = d.orders.find((o) => o.id === tbl("T1").orderId)!;
  const raviLine = t1.kots[1]!.lines[1]!;
  const rm = await api.removeLine(t1.id, raviLine.id, "Customer changed mind");
  check("other captain cannot remove Ravi's line", !rm.ok, rm);
  const served = t1.kots[0]!.lines[0]!;
  const rmServed = await api.removeLine(t1.id, served.id, "x");
  check("served line cannot be removed", !rmServed.ok);
  const cancel = await api.cancelOrder(t1.id, "test");
  check("captain cannot cancel (no permission)", !cancel.ok);

  // --- merge rules ---
  const mergeHeld = await api.mergeTables(tbl("T3").id, tbl("T1").id);
  check("held table cannot merge", !mergeHeld.ok);

  // --- manager ---
  await api.logout();
  await api.loginWithPassword("9000000002", "demo1234", device("dev-2"));
  d = await api.load();
  check(
    "manager removes Ravi's line",
    (await api.removeLine(t1.id, raviLine.id, "Customer changed mind")).ok,
  );
  // Served food stays at the table; move a round still with the kitchen.
  const fresh = d.orders.find((o) => o.id === t1.id)!;
  const movable = fresh.kots.find((k) => k.lines.some((l) => l.status !== "served"))!;
  check(
    "a fully served round cannot move",
    !(
      await api.moveKot(
        t1.id,
        fresh.kots.find((k) => k.lines.every((l) => l.status === "served"))?.kotNo ?? -1,
        tbl("R1").id,
      )
    ).ok,
  );
  const mv = await api.moveKot(t1.id, movable.kotNo, tbl("R1").id);
  d = await api.load();
  check(
    "move KOT to a free table starts a new order there",
    mv.ok && tbl("R1").status === "running",
    mv,
  );

  // discount + promo
  const disc = await api.setDiscount(r1.orderId, { type: "pr", value: 10, reason: "Regular" });
  const promo = await api.applyPromo(r1.orderId, "flat50");
  d = await api.load();
  const t2b = d.orders.find((o) => o.id === r1.orderId)!;
  check(
    "promo replaces discount",
    disc.ok && promo.ok && t2b.totals.discount === 50 && t2b.promoCode === "FLAT50",
    t2b.totals,
  );
  check("bad promo refused", !(await api.applyPromo(r1.orderId, "NOPE")).ok);

  // settle rules
  const grand = t2b.totals.grand;
  check(
    "non-cash over the bill refused",
    !(
      await api.settle(r1.orderId, {
        payments: [{ modeId: "upi", amount: grand + 10 }],
        clientKey: key(),
      })
    ).ok,
  );
  check(
    "short payment refused",
    !(
      await api.settle(r1.orderId, {
        payments: [{ modeId: "upi", amount: grand - 10 }],
        clientKey: key(),
      })
    ).ok,
  );
  check(
    "due without customer refused",
    !(
      await api.settle(r1.orderId, {
        payments: [{ modeId: "due", amount: grand }],
        clientKey: key(),
      })
    ).ok,
  );
  const cashBefore = d.cashSession!.movements.length;
  const st = await api.settle(r1.orderId, {
    payments: [
      { modeId: "upi", amount: 100 },
      { modeId: "cash", amount: grand },
    ],
    clientKey: key(),
  });
  d = await api.load();
  check("cash over the bill gives change", st.ok && st.change === 100, st);
  check(
    "cash kept goes into the drawer",
    d.cashSession!.movements.length === cashBefore + 1 &&
      d.cashSession!.movements[0]!.amount === grand - 100 + 0,
    d.cashSession!.movements[0],
  );
  check("table free after settle", tbl("T2").status === "free");

  // stock: T2 had Butter Chicken -> chicken deducted at settle (dine-in)
  const chickenMoves = d.stock.movements.filter(
    (m) => m.refId === "raw-chicken" && m.reference === `Bill ${r1.billNo}`,
  );
  check(
    "dine-in stock deducted at settle",
    chickenMoves.length === 1 && chickenMoves[0]!.qty === -200,
    chickenMoves,
  );

  // --- edit a settled bill (owner bug list item 11, Web POS edit-settled-order) ---
  const settledBill = d.orders.find((o) => o.id === r1.orderId)!;
  const chickenLine = settledBill.kots.flatMap((k) => k.lines).find((l) => l.itemId === "itm-6")!;
  const sumPay = (o: { payments: { amount: number }[] }) =>
    Math.round(o.payments.reduce((a, p) => a + p.amount, 0) * 100) / 100;
  await api.logout();
  await api.loginWithPassword("9000000004", "demo1234", device("dev-2")); // cashier
  const cashierEdit = await api.editSettled(r1.orderId, {
    lines: [{ lineId: chickenLine.id, qty: 2 }],
    added: [],
    discount: null,
    payments: settledBill.payments,
    refundLater: 0,
    clientKey: key(),
  });
  check("cashier cannot edit a settled bill (special permission)", !cashierEdit.ok, cashierEdit);
  await api.logout();
  await api.loginWithPassword("9000000002", "demo1234", device("dev-2")); // manager
  d = await api.load();
  const drawerBefore = d.cashSession!.movements.length;
  const short = await api.editSettled(r1.orderId, {
    lines: [{ lineId: chickenLine.id, qty: 2 }],
    added: [],
    discount: settledBill.discount ?? null,
    payments: settledBill.payments,
    refundLater: 0,
    clientKey: key(),
  });
  d = await api.load();
  check(
    "edit: payments must add up to the new total; nothing changes when refused",
    !short.ok &&
      d.orders.find((o) => o.id === r1.orderId)!.totals.grand === settledBill.totals.grand &&
      d.cashSession!.movements.length === drawerBefore,
    short,
  );
  // Raise Butter Chicken 1 -> 2, drop the promo: pay the difference in cash.
  const up = await api.editSettled(r1.orderId, {
    lines: [{ lineId: chickenLine.id, qty: 2 }],
    added: [line(d, "itm-1")],
    discount: null,
    payments: [
      ...settledBill.payments.filter((p) => p.modeId !== "cash"),
      { modeId: "cash", amount: 99999 },
    ],
    refundLater: 0,
    clientKey: key(),
  });
  check("edit: over-payment refused (exact total only)", !up.ok, up);
  // Work out the new total the way the app does and pay it exactly.
  const newLines = [
    ...orderLines(settledBill).map((l) => (l.id === chickenLine.id ? { ...l, qty: 2 } : l)),
    line(d, "itm-1"),
  ];
  const newGrand = billTotals(
    { type: "dinin", sectionId: tbl("T2").sectionId, lines: newLines },
    d.settings,
  ).grand;
  const upi = settledBill.payments.find((p) => p.modeId === "upi")?.amount ?? 0;
  const oldCash = settledBill.payments.find((p) => p.modeId === "cash")?.amount ?? 0;
  const upKey = key();
  const up2 = await api.editSettled(r1.orderId, {
    lines: [{ lineId: chickenLine.id, qty: 2 }],
    added: [line(d, "itm-1")],
    discount: null,
    payments: [
      { modeId: "upi", amount: upi },
      { modeId: "cash", amount: Math.round((newGrand - upi) * 100) / 100 },
    ],
    refundLater: 0,
    clientKey: upKey,
  });
  d = await api.load();
  const edited = d.orders.find((o) => o.id === r1.orderId)!;
  check(
    "edit raises the bill: new lines, no promo, still settled, table stays free",
    up2.ok &&
      edited.status === "settled" &&
      edited.totals.grand === newGrand &&
      !edited.promoCode &&
      tbl("T2").status === "free" &&
      edited.kots.at(-1)!.kitchenIds.length === 0,
    { up2, grand: edited.totals.grand, newGrand },
  );
  check(
    "the extra cash goes into the drawer",
    up2.ok &&
      d.cashSession!.movements[0]!.kind === "settlement" &&
      d.cashSession!.movements[0]!.amount === Math.round((newGrand - upi - oldCash) * 100) / 100,
    d.cashSession!.movements[0],
  );
  const chickenNow = d.stock.movements.filter(
    (m) => m.refId === "raw-chicken" && m.reference === `Bill ${r1.billNo} edited`,
  );
  check(
    "stock follows the edit: old chicken back (+200), new bill out (−400)",
    chickenNow.some((m) => m.qty === 200) && chickenNow.some((m) => m.qty === -400),
    chickenNow.map((m) => m.qty),
  );
  const again = await api.editSettled(r1.orderId, {
    lines: [{ lineId: chickenLine.id, qty: 2 }],
    added: [line(d, "itm-1")],
    discount: null,
    payments: [],
    refundLater: 0,
    clientKey: upKey,
  });
  d = await api.load();
  check(
    "same edit retried (clientKey) is applied once",
    again.ok && d.orders.find((o) => o.id === r1.orderId)!.kots.length === edited.kots.length,
  );

  // Lower it again (chicken back to 1): refund now, in cash, out of the drawer.
  const loweredGrand = billTotals(
    {
      type: "dinin",
      sectionId: tbl("T2").sectionId,
      lines: orderLines(edited).map((l) => (l.id === chickenLine.id ? { ...l, qty: 1 } : l)),
    },
    d.settings,
  ).grand;
  const cashNow = edited.payments.find((p) => p.modeId === "cash")!.amount;
  const cut = Math.round((edited.totals.grand - loweredGrand) * 100) / 100;
  const down = await api.editSettled(r1.orderId, {
    lines: [{ lineId: chickenLine.id, qty: 1 }],
    added: [],
    discount: null,
    payments: [
      { modeId: "upi", amount: upi },
      { modeId: "cash", amount: Math.round((cashNow - cut) * 100) / 100 },
    ],
    refundLater: 0,
    clientKey: key(),
  });
  d = await api.load();
  check(
    "refund now: the cash comes out of the drawer",
    down.ok &&
      down.cashOut === cut &&
      d.cashSession!.movements[0]!.kind === "out" &&
      d.cashSession!.movements[0]!.amount === cut,
    { down, m: d.cashSession!.movements[0] },
  );

  // Remove the extra item: refund later -> listed as owed, handed back from the drawer.
  const extra = d.orders.find((o) => o.id === r1.orderId)!;
  const extraLine = extra.kots.flatMap((k) => k.lines).find((l) => l.itemId === "itm-1")!;
  const lowerGrand = billTotals(
    {
      type: "dinin",
      sectionId: tbl("T2").sectionId,
      lines: orderLines(extra).filter((l) => l.id !== extraLine.id),
    },
    d.settings,
  ).grand;
  const owe = Math.round((extra.totals.grand - lowerGrand) * 100) / 100;
  const bothWays = await api.editSettled(r1.orderId, {
    lines: [{ lineId: extraLine.id, qty: 0 }],
    added: [],
    discount: null,
    payments: [...extra.payments, { modeId: "due", amount: 1 }],
    refundLater: owe + 1,
    customerName: "Test",
    customerMobile: "9999999999",
    clientKey: key(),
  });
  check("a bill cannot be both due and owed a refund", !bothWays.ok, bothWays);
  const later = await api.editSettled(r1.orderId, {
    lines: [{ lineId: extraLine.id, qty: 0 }],
    added: [],
    discount: null,
    payments: extra.payments,
    refundLater: owe,
    clientKey: key(),
  });
  d = await api.load();
  const owed = d.orders.find((o) => o.id === r1.orderId)!;
  check(
    "refund later: the payment stays, the bill is listed as owing a refund",
    later.ok &&
      owed.refundOwed === owe &&
      d.refundsOwed.some((r) => r.orderId === r1.orderId && r.amount === owe) &&
      sumPay(owed) - owe === owed.totals.grand,
    { later, refundOwed: owed.refundOwed, list: d.refundsOwed },
  );
  const handBack = await api.settleRefund(r1.orderId, "cash");
  d = await api.load();
  const refunded = d.orders.find((o) => o.id === r1.orderId)!;
  check(
    "hand back the refund in cash: out of the drawer, off the list, payments = bill",
    handBack.ok &&
      !refunded.refundOwed &&
      d.refundsOwed.length === 0 &&
      d.cashSession!.movements[0]!.kind === "out" &&
      d.cashSession!.movements[0]!.amount === owe &&
      sumPay(refunded) === refunded.totals.grand,
    { handBack, m: d.cashSession!.movements[0] },
  );
  check("no refund left to hand back", !(await api.settleRefund(r1.orderId, "cash")).ok);
  check(
    "a discount over the new bill is refused",
    !(
      await api.editSettled(r1.orderId, {
        lines: [],
        added: [],
        discount: { type: "fix", value: 999999, reason: "x" },
        payments: refunded.payments,
        refundLater: 0,
        clientKey: key(),
      })
    ).ok,
  );

  // QR accept/reject per item
  const qr = await api.decideQr("qr-1", [
    { key: "q1", accept: true },
    { key: "q2", accept: true },
    { key: "q3", accept: false },
  ]);
  check("rejecting needs a reason", !qr.ok);
  const qr2 = await api.decideQr("qr-1", [
    { key: "q1", accept: true },
    { key: "q2", accept: true },
    { key: "q3", accept: false, reason: "Out of stock" },
  ]);
  d = await api.load();
  const t5 = d.orders.find((o) => o.id === tbl("T5").orderId);
  check(
    "accepted QR items become a KOT on T5, rejected stay out",
    qr2.ok && t5 && t5.kots[0]!.lines.length === 2 && t5.fromQr,
    t5?.kots,
  );

  // cash close needs a reason when the count differs
  const close = await api.closeCash({ "500": 1 }, "");
  check("close with a difference needs a reason", !close.ok);

  // owner lock
  check(
    "manager cannot edit the owner",
    !(await api.saveStaff({ id: "stf-1", name: "X", mobile: "9000000001", role: "Owner" })).ok,
  );
  check(
    "manager cannot change permissions",
    !(await api.setRoleDefaults("Captain", d.roleDefaults.Captain)).ok,
  );

  // --- variants (owner bug list item 12): edit + delete, only when unused ---
  const inUse = d.variants.find((v) =>
    d.items.some((i) => i.variants.some((x) => x.variantId === v.id)),
  )!;
  const delUsed = await api.deleteVariant(inUse.id);
  check(
    "a variant used by an item cannot be deleted",
    !delUsed.ok && /In use by/.test(delUsed.ok ? "" : delUsed.error),
    delUsed,
  );
  check(
    "two variants cannot share a name",
    !(await api.saveVariant({ menuId: inUse.menuId, name: inUse.name.toUpperCase() })).ok,
  );
  const jumbo = await api.saveVariant({ menuId: inUse.menuId, name: "Jumbo" });
  d = await api.load();
  const jumboRow = d.variants.find((v) => v.name === "Jumbo")!;
  const renamed = await api.saveVariant({
    id: jumboRow.id,
    menuId: inUse.menuId,
    name: "Jumbo XL",
  });
  const delFree = await api.deleteVariant(jumboRow.id);
  d = await api.load();
  check(
    "add, rename and delete an unused variant",
    jumbo.ok && renamed.ok && delFree.ok && !d.variants.some((v) => v.id === jumboRow.id),
    { jumbo, renamed, delFree },
  );

  // --- menu CSV import (owner bug list item 15) ---
  await api.logout();
  await api.loginWithPassword("9000000001", "demo1234", device("dev-2")); // owner
  d = await api.load();
  const menu0 = d.menus.find((m) => m.isDefault)!;
  const withVariants = d.items.find((i) => i.menuId === menu0.id && i.variants.length > 0)!;
  const itsCat = d.categories.find((c) => c.id === withVariants.categoryId)!;
  const imp = await api.importMenu(menu0.id, [
    { name: "CSV Soup", category: "CSV Cat", price: 99, shortCode: "", veg: true, active: true },
    {
      name: withVariants.name.toUpperCase(),
      category: itsCat.name,
      price: 333,
      shortCode: "",
      veg: withVariants.dietary !== "nonveg" && withVariants.dietary !== "egg",
      active: true,
    },
    { name: "", category: "CSV Cat", price: 10, shortCode: "", veg: true, active: true },
    {
      name: "CSV Chicken",
      category: "csv cat",
      price: 250,
      shortCode: "",
      veg: false,
      active: false,
    },
  ]);
  d = await api.load();
  const soupItem = d.items.find((i) => i.name === "CSV Soup");
  const chickenItem = d.items.find((i) => i.name === "CSV Chicken");
  const updatedItem = d.items.find((i) => i.id === withVariants.id)!;
  check(
    "CSV import: 2 added, 1 updated, 1 new category, bad row reported",
    imp.ok &&
      imp.created === 2 &&
      imp.updated === 1 &&
      imp.categoriesCreated === 1 &&
      imp.failed.length === 1 &&
      imp.failed[0]!.line === 3,
    imp,
  );
  check(
    "imported items: category, short code, food type, active",
    !!soupItem &&
      !!soupItem.shortCode &&
      soupItem.dietary === "veg" &&
      chickenItem?.dietary === "nonveg" &&
      chickenItem.active === false &&
      chickenItem.categoryId === soupItem.categoryId,
    { soupItem, chickenItem },
  );
  check(
    "an updated item keeps its variants, add-ons and food type",
    updatedItem.price === 333 &&
      updatedItem.variants.length === withVariants.variants.length &&
      updatedItem.addonGroupIds.length === withVariants.addonGroupIds.length &&
      updatedItem.dietary === withVariants.dietary,
    updatedItem,
  );
  const { menuToCsv, parseMenuCsv } = await import("../src/lib/pos/csv");
  const csvText = menuToCsv(
    d.items.filter((i) => i.menuId === menu0.id),
    d.categories.filter((c) => c.menuId === menu0.id),
  );
  const back = parseMenuCsv(
    csvText,
    d.categories.filter((c) => c.menuId === menu0.id),
    d.items.filter((i) => i.menuId === menu0.id),
  );
  check(
    "export -> import round trip: every row valid, all match existing items, no new categories",
    back.length === d.items.filter((i) => i.menuId === menu0.id).length &&
      back.every((r) => !r.error && r.existingId && !r.isNewCategory),
    back.filter((r) => r.error || !r.existingId || r.isNewCategory).slice(0, 3),
  );

  // --- section rank (owner bug list item 16): rank = position, others shift, no ties ---
  const order = () => [...d.sections].sort((a, b) => a.rank - b.rank).map((x) => x.name);
  const ranks = () =>
    [...d.sections]
      .map((x) => x.rank)
      .sort((a, b) => a - b)
      .join(",");
  d = await api.load();
  const firstBefore = order();
  const addTop = await api.saveSection({ name: "Sky Deck", rank: 1 });
  d = await api.load();
  check(
    "new section at rank 1 goes first, the others shift down",
    addTop.ok &&
      order()[0] === "Sky Deck" &&
      order().slice(1).join() === firstBefore.join() &&
      ranks() === d.sections.map((_, i) => i + 1).join(","),
    { order: order(), before: firstBefore, secs: d.sections.map((x) => [x.name, x.rank]), addTop },
  );
  const roof = d.sections.find((x) => x.name === "Sky Deck")!;
  const moveLast = await api.saveSection({ id: roof.id, name: "Sky Deck", rank: 99 });
  d = await api.load();
  check(
    "rank past the end = last",
    moveLast.ok &&
      order().at(-1) === "Sky Deck" &&
      ranks() === d.sections.map((_, i) => i + 1).join(","),
    order(),
  );
  const rename = await api.saveSection({
    id: roof.id,
    name: "Sky Lounge",
    rank: d.sections.find((x) => x.id === roof.id)!.rank,
  });
  d = await api.load();
  check("rename keeps the place", rename.ok && order().at(-1) === "Sky Lounge");
  check(
    "rank must be a whole number from 1",
    !(await api.saveSection({ name: "Bad", rank: 0 })).ok &&
      !(await api.saveSection({ name: "Bad", rank: 1.5 })).ok,
  );

  // --- owner alerts (owner list 2026-09-29 #10) ---
  const as = (mobile: string) => api.loginWithPassword(mobile, "demo1234", device("dev-2"));
  const ownerAlerts = async () => {
    await as("9000000001");
    return (await api.load()).alerts.filter((a) => a.kind === "owner-alert");
  };
  const oa0 = (await ownerAlerts()).length;
  await as("9000000002"); // manager
  d = await api.load();
  check(
    "owner alerts default: all on, 20%",
    JSON.stringify(d.settings.ownerAlerts) ===
      JSON.stringify({
        cancelAfterKot: true,
        bigDiscount: true,
        discountPct: 20,
        cashDifference: true,
      }),
  );
  check(
    "manager cannot change owner alerts",
    !(await api.updateSettings({ ownerAlerts: { ...d.settings.ownerAlerts, bigDiscount: false } }))
      .ok,
  );
  const freeTables = d.tables.filter((t) => t.status === "free" && !t.qrWaiting);
  const discounted = async (tableId: string, pct: number) => {
    const r = await api.sendKot(cart(d, tableId, [line(d, "itm-6")]));
    const oid = r.ok ? r.orderId : "";
    await api.setDiscount(oid, { type: "pr", value: pct, reason: "friend" });
    const g = (await api.load()).orders.find((o) => o.id === oid)!.totals.grand;
    await api.settle(oid, { payments: [{ modeId: "upi", amount: g }], clientKey: key() });
  };
  await discounted(freeTables[0]!.id, 50);
  const rc = await api.sendKot(cart(d, freeTables[1]!.id, [line(d, "itm-6")]));
  await api.cancelOrder(rc.ok ? rc.orderId : "", "guest left");
  const got = (await ownerAlerts()).slice(0, (await ownerAlerts()).length - oa0);
  check(
    "manager's 50% discount alerts the owner",
    got.some((a) => /Big discount/.test(a.title) && /50%/.test(a.body)),
    got,
  );
  check(
    "manager's cancel after KOT alerts the owner",
    got.some((a) => /cancelled after KOT/.test(a.title) && /guest left/.test(a.body)),
    got,
  );
  await as("9000000003");
  check(
    "staff never see owner alerts",
    !(await api.load()).alerts.some((a) => a.kind === "owner-alert"),
  );
  await as("9000000001");
  d = await api.load();
  const upOa = await api.updateSettings({
    ownerAlerts: { ...d.settings.ownerAlerts, discountPct: 60 },
  });
  check("owner raises the limit to 60%", upOa.ok, upOa);
  const oaBefore = (await ownerAlerts()).length;
  await as("9000000002");
  d = await api.load();
  await discounted(d.tables.filter((t) => t.status === "free" && !t.qrWaiting)[0]!.id, 50);
  check("a 50% discount under a 60% limit is quiet", (await ownerAlerts()).length === oaBefore);
  d = await api.load();
  const ownOrder = await api.sendKot(
    cart(d, d.tables.filter((t) => t.status === "free" && !t.qrWaiting)[0]!.id, [line(d, "itm-6")]),
  );
  await api.cancelOrder(ownOrder.ok ? ownOrder.orderId : "", "owner's own");
  check("the owner's own cancel is quiet", (await ownerAlerts()).length === oaBefore);

  console.log(`\n${pass} passed, ${failCount} failed`);
  if (failCount) process.exitCode = 1;
}

void main();
