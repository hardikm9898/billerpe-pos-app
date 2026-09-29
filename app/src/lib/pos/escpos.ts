import type {
  Order,
  OrderLine,
  Outlet,
  OutletSettings,
  PrintFormat,
  PrintLine,
  TokenScope,
} from "./types";
import { ORDER_TYPE_LABEL } from "./types";

// Receipts as ESC/POS bytes - the language every thermal printer an outlet
// is likely to have understands (Epson TM, the Chinese 58/80 mm printers,
// the built-in printers of Android POS terminals). Content follows the exe's
// own tickets (services/kotAutoPrint.js, the bill PDF): the outlet's saved
// KOT / invoice header and footer lines, then the items and totals.
//
// Text is plain ASCII: most printers' default code page has no ₹, so money
// prints as "Rs 1,234.00".

const ESC = 0x1b;
const GS = 0x1d;

/** Characters per line in the default font. */
export const columnsFor = (paper: "58mm" | "80mm") => (paper === "58mm" ? 32 : 48);

const ascii = (s: string) =>
  s
    .replace(/₹/g, "Rs ")
    .replace(/[×✕]/g, "x")
    .replace(/[·•]/g, "-")
    .replace(/[—–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .normalize("NFKD")
    .replace(/[^\x20-\x7e\n]/g, "");

const money = (n: number) =>
  `Rs ${(Math.round(n * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Align = "left" | "center" | "right";
type Size = "normal" | "tall" | "big";

/** One printed row with its style, for drawing the receipt somewhere else (PDF). */
export interface ReceiptRow {
  text: string;
  bold: boolean;
  size: Size;
  align: Align;
  /** A QR code row (its data), drawn instead of text. */
  qr?: string | undefined;
}

/** A receipt: ESC/POS bytes plus the same content as plain text (preview, system print). */
export class Receipt {
  private bytes: number[] = [ESC, 0x40];
  readonly text: string[] = [];
  /** The same rows as `text`, with bold / size / QR kept. */
  readonly rows: ReceiptRow[] = [];

  constructor(readonly cols: number) {}

  private raw(...b: number[]) {
    this.bytes.push(...b);
    return this;
  }

  private write(s: string) {
    for (const ch of ascii(s)) this.bytes.push(ch.charCodeAt(0));
  }

  /** One line of text (wrapped to the paper width). */
  line(s: string, opts: { align?: Align; bold?: boolean; size?: Size } = {}) {
    const { align = "left", bold = false, size = "normal" } = opts;
    const width = size === "big" ? Math.floor(this.cols / 2) : this.cols;
    this.raw(ESC, 0x61, align === "center" ? 1 : align === "right" ? 2 : 0);
    this.raw(ESC, 0x45, bold ? 1 : 0);
    this.raw(GS, 0x21, size === "big" ? 0x11 : size === "tall" ? 0x01 : 0x00);
    for (const part of wrap(ascii(s), width)) {
      this.write(part);
      this.raw(0x0a);
      const row =
        align === "center"
          ? part.padStart(Math.floor((width + part.length) / 2))
          : align === "right"
            ? part.padStart(width)
            : part;
      this.text.push(row);
      this.rows.push({ text: row, bold, size, align });
    }
    this.raw(GS, 0x21, 0x00, ESC, 0x45, 0, ESC, 0x61, 0);
    return this;
  }

  /** Left text and right text on one line (item and amount). */
  pair(left: string, right: string, opts: { bold?: boolean } = {}) {
    const r = ascii(right);
    const room = Math.max(1, this.cols - r.length - 1);
    const parts = wrap(ascii(left), room);
    parts.forEach((p, i) => {
      const row = i === parts.length - 1 ? p.padEnd(room) + " " + r : p;
      this.line(row, { bold: opts.bold ?? false });
    });
    return this;
  }

  rule(ch = "-") {
    return this.line(ch.repeat(this.cols));
  }

  feed(n = 1) {
    this.raw(ESC, 0x64, n);
    for (let i = 0; i < n; i++) {
      this.text.push("");
      this.rows.push({ text: "", bold: false, size: "normal", align: "left" });
    }
    return this;
  }

  /** QR code (GS ( k), e.g. the UPI payment link. */
  qr(data: string, moduleSize = 6) {
    const d = [...ascii(data)].map((c) => c.charCodeAt(0));
    const len = d.length + 3;
    this.raw(ESC, 0x61, 1);
    this.raw(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0); // model 2
    this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, moduleSize); // module size
    this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31); // error correction M
    this.raw(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...d); // store
    this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30); // print
    this.raw(0x0a, ESC, 0x61, 0);
    this.text.push("[ UPI QR ]");
    this.rows.push({ text: "", bold: false, size: "normal", align: "center", qr: data });
    return this;
  }

  /** Feed past the cutter and cut (printers without one ignore it). */
  cut() {
    this.raw(ESC, 0x64, 4, GS, 0x56, 0x42, 0);
    return this;
  }

  toBytes() {
    return Uint8Array.from(this.bytes);
  }
}

function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  for (const para of s.split("\n")) {
    let rest = para;
    if (!rest) out.push("");
    while (rest.length > width) {
      let cut = rest.lastIndexOf(" ", width);
      if (cut <= 0) cut = width;
      out.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    if (rest) out.push(rest);
  }
  return out;
}

const sizeOf = (l: PrintLine): Size =>
  l.fontSize >= 20 ? "big" : l.fontSize >= 16 ? "tall" : "normal";

export interface ReceiptContext {
  outlet: Outlet;
  settings: OutletSettings;
  tableName?: string | undefined;
}

const scopeHas = (scope: TokenScope, type: Order["type"]) => scope === "both" || scope === type;

const customerDetails = (o: Order) =>
  [o.customerName, o.customerMobile].filter(Boolean).join(" - ");

/** The outlet's saved header/footer lines (same keywords as the exe and the e-bill). */
function formatLines(
  r: Receipt,
  lines: PrintLine[],
  ctx: ReceiptContext,
  order: Order,
  extra: { kotNo?: number | undefined; kot: boolean },
) {
  const { outlet } = ctx;
  for (const l of lines) {
    const size = sizeOf(l);
    switch (l.content) {
      case "logo":
        break; // images need a raster driver - the name line carries the brand
      case "outlet-name":
        r.line(outlet.name, {
          align: "center",
          bold: true,
          size: size === "normal" ? "tall" : size,
        });
        break;
      case "address":
        if (outlet.address) r.line(outlet.address, { align: "center", size });
        break;
      case "phone":
        if (outlet.phone) r.line(`Ph: ${outlet.phone}`, { align: "center", size });
        break;
      case "gstin":
        if (outlet.gstin) r.line(`GSTIN: ${outlet.gstin}`, { align: "center", size });
        break;
      case "fssai":
        if (outlet.fssai) r.line(`FSSAI: ${outlet.fssai}`, { align: "center", size });
        break;
      case "upi-qr":
        break; // printed with the totals on the bill
      case "order-type":
        r.line(ORDER_TYPE_LABEL[order.type], { align: "center", bold: true, size });
        break;
      case "customer-details":
        if (customerDetails(order))
          r.line(customerDetails(order), { align: "center", bold: true, size });
        break;
      case "bill-no":
        r.line(extra.kot ? `KOT - ${order.billNo}` : `Bill No: ${order.billNo}`, {
          align: "center",
          size,
        });
        break;
      case "token-number":
        if (order.token > 0)
          r.line(`Token No.:${order.token}`, { align: "center", bold: true, size: "big" });
        break;
      case "kot-number":
        if (extra.kotNo) r.line(`KOT #${extra.kotNo}`, { align: "center", size });
        break;
      case "text":
        if (l.text) r.line(l.text, { align: "center", size });
        break;
    }
  }
}

const when = (iso: string | undefined) =>
  new Date(iso ?? Date.now()).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });

const itemText = (l: Pick<OrderLine, "name" | "variantName">) =>
  `${l.name}${l.variantName ? ` (${l.variantName})` : ""}`;

/** A KOT for the kitchen: big quantities, notes and add-ons, no prices (unless the format says so). */
export function renderKot(
  ctx: ReceiptContext,
  order: Order,
  kot: { kotNo: number; lines: OrderLine[]; firedAt?: string | undefined },
  paper: "58mm" | "80mm",
): Receipt {
  const r = new Receipt(columnsFor(paper));
  const fmt = ctx.settings.kotFormat;
  formatLines(r, fmt.header, ctx, order, { kotNo: kot.kotNo, kot: true });
  if (!fmt.header.some((l) => l.content === "kot-number"))
    r.line(`KOT #${kot.kotNo}`, { align: "center", bold: true, size: "tall" });
  r.line(
    ctx.tableName
      ? `Table ${ctx.tableName}`
      : `${ORDER_TYPE_LABEL[order.type]}${order.token ? ` - Token ${order.token}` : ""}`,
    { align: "center", bold: true, size: "big" },
  );
  r.pair(`Bill ${order.billNo}`, when(kot.firedAt));
  r.rule();
  for (const l of kot.lines) {
    r.line(`${l.qty} x ${itemText(l)}`, { bold: true, size: "tall" });
    for (const a of l.addons) r.line(`   + ${a.qty > 1 ? `${a.qty} x ` : ""}${a.name}`);
    if (l.note) r.line(`   * ${l.note}`, { bold: true });
    if (fmt.showPrices) r.line(`   ${money(l.price * l.qty)}`, { align: "right" });
  }
  r.rule();
  r.line(`Items: ${kot.lines.reduce((a, l) => a + l.qty, 0)}`);
  formatLines(r, fmt.footer, ctx, order, { kotNo: kot.kotNo, kot: true });
  return r.cut();
}

/** The customer's bill: items, charges, each tax, round off, grand total, UPI QR. */
export function renderBill(
  ctx: ReceiptContext,
  order: Order,
  paper: "58mm" | "80mm",
  upiLink?: string,
): Receipt {
  const r = new Receipt(columnsFor(paper));
  const { settings } = ctx;
  const fmt = settings.invoiceFormat;
  formatLines(r, fmt.header, ctx, order, { kot: false });
  if (!fmt.header.some((l) => l.content === "outlet-name"))
    r.line(ctx.outlet.name, { align: "center", bold: true, size: "tall" });
  if (
    order.token > 0 &&
    scopeHas(settings.tokens.billWithToken, order.type) &&
    !fmt.header.some((l) => l.content === "token-number")
  )
    r.line(`Token No.:${order.token}`, { align: "center", bold: true, size: "big" });
  r.rule();
  r.pair(`Bill No: ${order.billNo}`, when(order.billPrintedAt ?? order.createdAt));
  r.pair(
    ctx.tableName ? `Table: ${ctx.tableName}` : ORDER_TYPE_LABEL[order.type],
    order.guests ? `Guests: ${order.guests}` : "",
  );
  if (customerDetails(order)) r.line(`Customer: ${customerDetails(order)}`);
  r.rule();
  const lines = [...order.kots.flatMap((k) => k.lines), ...order.heldLines];
  // One row per item (rounds of the same item grouped, like the Web POS bill).
  const grouped = new Map<
    string,
    { name: string; qty: number; price: number; amount: number; addons: string[] }
  >();
  for (const l of lines) {
    const key = `${itemText(l)}|${l.price}|${l.addons.map((a) => a.id).join(",")}`;
    const g = grouped.get(key) ?? {
      name: itemText(l),
      qty: 0,
      price: l.price,
      amount: 0,
      addons: l.addons.map((a) => a.name),
    };
    g.qty += l.qty;
    g.amount += l.price * l.qty + l.addons.reduce((s, a) => s + a.price * a.qty, 0);
    grouped.set(key, g);
  }
  for (const g of grouped.values()) {
    r.pair(`${g.qty} x ${g.name}`, money(g.amount));
    if (g.addons.length) r.line(`   + ${g.addons.join(", ")}`);
  }
  r.rule();
  const t = order.totals;
  r.pair("Subtotal", money(t.subtotal));
  if (t.discount)
    r.pair(`Discount${order.promoCode ? ` (${order.promoCode})` : ""}`, `-${money(t.discount)}`);
  if (t.service) r.pair("Service charge", money(t.service));
  if (t.packaging) r.pair("Packaging", money(t.packaging));
  for (const x of t.taxLines)
    r.pair(`${x.name}${x.type === "pr" ? ` ${x.rate}%` : ""}`, money(x.amount));
  if (t.roundOff) r.pair("Round off", `${t.roundOff > 0 ? "+" : ""}${t.roundOff.toFixed(2)}`);
  r.rule("=");
  r.line(`TOTAL  ${money(t.grand)}`, { align: "right", bold: true, size: "tall" });
  if (order.payments.length) {
    const names = new Map(settings.paymentModes.map((m) => [m.id, m.name]));
    for (const p of order.payments)
      r.pair(`Paid - ${names.get(p.modeId) ?? p.modeId}`, money(p.amount));
  }
  if (
    upiLink &&
    order.status !== "settled" &&
    fmt.header.concat(fmt.footer).some((l) => l.content === "upi-qr")
  ) {
    r.feed();
    r.line("Scan to pay (UPI)", { align: "center" });
    r.qr(upiLink);
  }
  r.feed();
  formatLines(r, fmt.footer, ctx, order, { kot: false });
  if (!fmt.footer.length) r.line("Thank you! Visit again", { align: "center" });
  return r.cut();
}

/** A short test slip, to check the connection and the paper width. */
export function renderTest(
  outletName: string,
  printerName: string,
  paper: "58mm" | "80mm",
): Receipt {
  const r = new Receipt(columnsFor(paper));
  r.line("BillerPe POS", { align: "center", bold: true, size: "big" });
  r.line(outletName, { align: "center" });
  r.rule();
  r.line(`${printerName} is working`, { align: "center", bold: true });
  r.line(`Paper ${paper} - ${columnsFor(paper)} characters`, { align: "center" });
  r.line("0123456789".repeat(Math.ceil(columnsFor(paper) / 10)).slice(0, columnsFor(paper)));
  r.line(when(undefined), { align: "center" });
  return r.cut();
}

export type { PrintFormat };
