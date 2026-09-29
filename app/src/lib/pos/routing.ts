import type { DevicePrinter, Kitchen, OrderLine, OrderType, PosTable } from "./types";

// Where a KOT's items go - same three filters as the exe
// (billerpe-local-exe/helpers/kotPrinterRouting.js), each "empty = all":
//   order types, sections (table categories), menu categories.
// One KOT (one KOT number) can go to several printers and several kitchens.

interface Target {
  id: string;
  categoryIds: string[];
  sectionIds: string[];
  orderTypes: OrderType[];
}

function acceptsOrder(t: Target, type: OrderType, table: PosTable | undefined): boolean {
  if (t.orderTypes.length && !t.orderTypes.includes(type)) return false;
  if (type === "pickup") return true;
  return !t.sectionIds.length || (!!table && t.sectionIds.includes(table.sectionId));
}

function acceptsItem(t: Target, line: Pick<OrderLine, "categoryId">): boolean {
  // An item with no category (a custom item) goes everywhere the order goes.
  return !t.categoryIds.length || !line.categoryId || t.categoryIds.includes(line.categoryId);
}

type RoutableLine = Pick<OrderLine, "categoryId" | "routeKitchenId" | "routePrinterId">;

/** KOT printers on this device -> the lines each one prints. */
export function routeToPrinters<L extends RoutableLine>(
  printers: DevicePrinter[],
  lines: L[],
  type: OrderType,
  table: PosTable | undefined,
): { printer: DevicePrinter; lines: L[] }[] {
  const kotPrinters = printers.filter((p) => p.printsKot);
  return kotPrinters
    .filter((p) => acceptsOrder(p, type, table))
    .map((printer) => ({
      printer,
      lines: lines.filter((l) => {
        // A custom item sent to one chosen printer goes only there - unless
        // that printer is gone, then it goes where an uncategorised item goes.
        const chosen =
          l.routePrinterId && kotPrinters.some((p) => p.id === l.routePrinterId)
            ? l.routePrinterId
            : null;
        return chosen ? printer.id === chosen : acceptsItem(printer, l);
      }),
    }))
    .filter((r) => r.lines.length > 0);
}

/**
 * KDS kitchens -> the lines each shows. Unlike printers, an item NO kitchen
 * takes still goes to the first kitchen, so the kitchen always learns of it.
 */
export function routeToKitchens<L extends RoutableLine>(
  kitchens: Kitchen[],
  lines: L[],
  type: OrderType,
  table: PosTable | undefined,
): { kitchen: Kitchen; lines: L[] }[] {
  if (!kitchens.length) return [];
  const routed = kitchens.map((kitchen) => ({
    kitchen,
    lines: acceptsOrder(kitchen, type, table)
      ? lines.filter((l) => {
          const chosen =
            l.routeKitchenId && kitchens.some((k) => k.id === l.routeKitchenId)
              ? l.routeKitchenId
              : null;
          return chosen ? kitchen.id === chosen : acceptsItem(kitchen, l);
        })
      : [],
  }));
  const orphans = lines.filter((l) => !routed.some((r) => r.lines.includes(l)));
  if (orphans.length) routed[0]!.lines = [...routed[0]!.lines, ...orphans];
  return routed.filter((r) => r.lines.length > 0);
}

/** Ask staff which kitchen/printer only when there is more than one. */
export function customItemTargets(kitchens: Kitchen[], printers: DevicePrinter[]) {
  const kotPrinters = printers.filter((p) => p.printsKot);
  return {
    askKitchen: kitchens.length > 1,
    askPrinter: kotPrinters.length > 1,
    kitchens,
    printers: kotPrinters,
  };
}
