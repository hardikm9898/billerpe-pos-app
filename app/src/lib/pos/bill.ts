import {
  computeBill,
  serviceIsAutomatic,
  type EngineChargeRule,
  type EngineConfig,
  type EngineLine,
} from "./billEngine";
import type {
  ChargeRule,
  DraftLine,
  MenuCatalog,
  Order,
  OrderDiscount,
  OrderLine,
  OrderTotals,
  OrderType,
  OutletSettings,
  PosTable,
} from "./types";

// Adapter between the app's model and the ONE bill engine (billEngine.ts).
// The server computes and stores the real totals; the app uses this only to
// preview a cart that has not been sent yet.

const toEngineRule = (r: ChargeRule): EngineChargeRule => ({
  active: r.active,
  type: r.type,
  value: r.value,
  calculationOn: r.calculationOn,
  orderTypes: r.orderTypes,
  taxOnCharge: r.taxOnCharge,
  condition: r.condition,
  threshold: r.threshold,
});

export function engineConfig(s: OutletSettings): EngineConfig {
  return {
    gstOn: s.gstOn,
    taxTypes: s.taxes.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      rate: t.rate,
      active: t.active,
      orderTypes: t.orderTypes,
      tableCategIds: t.sectionIds,
      menuIds: t.itemIds,
    })),
    serviceCharge: toEngineRule(s.serviceCharge),
    packagingRule: toEngineRule(s.packagingCharge),
  };
}

type AnyLine = Pick<OrderLine | DraftLine, "price" | "qty" | "addons" | "itemId">;

export interface BillInput {
  type: OrderType;
  sectionId?: string | undefined;
  lines: AnyLine[];
  /** One discount per order. A promo code (same as the Web POS) is just a
   * discount carrying the code's type and value - it replaces, never stacks. */
  discount?: OrderDiscount | undefined;
  serviceOverride?: number | null | undefined;
}

export function billTotals(input: BillInput, s: OutletSettings): OrderTotals {
  const lines: EngineLine[] = input.lines.map((l) => ({
    qty: l.qty,
    price: l.price,
    addons: l.addons.map((a) => ({ price: a.price, qty: a.qty })),
    menuId: l.itemId,
  }));
  const t = computeBill({
    lines,
    orderType: input.type,
    tableCategId: input.sectionId ?? null,
    discount:
      input.discount && input.discount.value > 0
        ? { type: input.discount.type, value: input.discount.value }
        : null,
    serviceOverride: input.serviceOverride ?? null,
    config: engineConfig(s),
  });
  return {
    subtotal: t.subtotal,
    discount: t.discount,
    service: t.service,
    packaging: t.packaging,
    taxLines: t.taxLines.map((x) => ({
      id: String(x.id),
      name: x.name,
      type: x.tax_type,
      rate: x.tax_value,
      amount: x.amount,
    })),
    tax: t.tax,
    roundOff: t.roundOff,
    grand: t.grandAmount,
    items: t.items,
  };
}

export const EMPTY_TOTALS: OrderTotals = {
  subtotal: 0,
  discount: 0,
  service: 0,
  packaging: 0,
  taxLines: [],
  tax: 0,
  roundOff: 0,
  grand: 0,
  items: 0,
};

/** Every line the order holds on the server (fired + held). */
export function orderLines(o: Order): OrderLine[] {
  return [...o.kots.flatMap((k) => k.lines), ...o.heldLines];
}

/** Server order + this device's unsent lines, for the cart preview. */
export function previewTotals(
  s: OutletSettings,
  args: {
    order?: Order | undefined;
    type: OrderType;
    sectionId?: string | undefined;
    draftLines: DraftLine[];
  },
): OrderTotals {
  const { order } = args;
  if (order && args.draftLines.length === 0) return order.totals;
  return billTotals(
    {
      type: args.type,
      sectionId: args.sectionId,
      lines: [...(order ? orderLines(order) : []), ...args.draftLines],
      discount: order?.discount,
      serviceOverride: order?.serviceOverride,
    },
    s,
  );
}

export const serviceIsManual = (s: OutletSettings, type: OrderType): boolean =>
  s.serviceCharge.active && !serviceIsAutomatic(toEngineRule(s.serviceCharge), type);

/**
 * The menu an order uses (same rule as Web POS resolveMenu): the first
 * non-default menu scoped to this section / order type, else the default.
 */
export function resolveMenu(
  menus: MenuCatalog[],
  table: PosTable | undefined,
  type: OrderType,
): MenuCatalog | undefined {
  const active = menus.filter((m) => m.active);
  const direct = active.find((m) => {
    if (m.isDefault) return false;
    if (m.sectionIds.length === 0 && m.orderTypes.length === 0) return false;
    const sectionOk =
      m.sectionIds.length === 0 || (!!table && m.sectionIds.includes(table.sectionId));
    const typeOk = m.orderTypes.length === 0 || m.orderTypes.includes(type);
    return sectionOk && typeOk;
  });
  return direct ?? active.find((m) => m.isDefault) ?? active[0];
}

/** Split-payment rules: only cash may exceed the bill; non-cash never can. */
export function checkPayments(
  grand: number,
  rows: { modeId: string; amount: number }[],
): string | null {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const paid = rows.filter((r) => r.amount > 0);
  if (paid.length === 0) return "Add a payment";
  const cash = r2(paid.filter((r) => r.modeId === "cash").reduce((a, r) => a + r.amount, 0));
  const nonCash = r2(paid.filter((r) => r.modeId !== "cash").reduce((a, r) => a + r.amount, 0));
  if (nonCash > grand) return "Non-cash payments cannot be more than the bill";
  if (r2(cash + nonCash) < grand) return "Payments are short of the bill";
  return null;
}
