// Prints what a KOT and a bill look like on 58 mm and 80 mm paper, from the
// demo outlet's data, and checks the ESC/POS bytes are well formed.
//   npm run preview:receipts
import { seedDb } from "../src/lib/pos/backend/mock/seed";
import { seedDemoActivity } from "../src/lib/pos/backend/mock/seedDemo";
import { renderBill, renderKot, renderTest } from "../src/lib/pos/escpos";
import { upiLink } from "../src/lib/pos/format";

const db = seedDb();
seedDemoActivity(db);
const order = db.orders.find((o) => o.status === "billed" && o.kots.length) ?? db.orders.find((o) => o.kots.length)!;
const table = db.tables.find((t) => t.id === order.tableId);
const ctx = { outlet: db.outlet, settings: db.settings, tableName: table?.name };

let bad = 0;
for (const paper of ["58mm", "80mm"] as const) {
  const kot = renderKot(ctx, order, order.kots[0]!, paper);
  const bill = renderBill(ctx, order, paper, upiLink(db.outlet.upiId, db.outlet.name, order.totals.grand, `Bill ${order.billNo}`));
  const test = renderTest(db.outlet.name, "Kitchen printer", paper);
  const cols = paper === "58mm" ? 32 : 48;
  for (const [name, r] of [["KOT", kot], ["BILL", bill], ["TEST", test]] as const) {
    console.log(`\n===== ${name} ${paper} =====`);
    console.log(r.text.join("\n"));
    const over = r.text.filter((l) => l.length > cols);
    const bytes = r.toBytes();
    if (over.length) {
      bad++;
      console.log(`!! ${over.length} line(s) wider than ${cols}`);
    }
    if (bytes[0] !== 0x1b || bytes[1] !== 0x40 || bytes.some((b) => b > 255)) {
      bad++;
      console.log("!! bad ESC/POS bytes");
    }
  }
}
console.log(bad ? `\n${bad} problem(s)` : "\nall receipts fit the paper");
process.exit(bad ? 1 : 0);
