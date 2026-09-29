import type { Dietary, MenuCategory, MenuItem } from "./types";

// CSV reading/writing and the Web POS menu CSV (billerpe-pos-pro-v2
// src/lib/csv.ts + routes/_shell.menu.items.tsx): the same six columns, so a
// file exported from either app imports into the other.

/** Quoted fields, escaped quotes, commas/newlines inside quotes; a UTF-8 BOM (Excel) is dropped. */
export function parseCsv(input: string): string[][] {
  const BOM = String.fromCharCode(0xfeff);
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim().length));
}

const escapeField = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows: (string | number)[][]): string =>
  rows.map((r) => r.map(escapeField).join(",")).join("\r\n");

export const MENU_CSV_HEADERS = ["Name", "Category", "Price", "Short code", "Veg", "Active"];
export const MENU_CSV_SAMPLE = [
  ["Paneer Tikka", "Punjabi Mains", "260", "PT01", "Yes", "Yes"],
  ["Egg Fry", "Starters", "180", "", "No", "Yes"],
];

const VEG_TYPES: Dietary[] = ["veg", "jain", "vegan", "swaminarayan"];
export const isVegType = (d: Dietary) => VEG_TYPES.includes(d);

/** One menu's items as the Web POS CSV (inactive items too, marked Active = No). */
export function menuToCsv(items: MenuItem[], categories: MenuCategory[]): string {
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const rank = new Map(categories.map((c) => [c.id, c.rank]));
  const rows = [...items]
    .sort(
      (a, b) =>
        (rank.get(a.categoryId) ?? 0) - (rank.get(b.categoryId) ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .map((i) => [
      i.name,
      catName.get(i.categoryId) ?? "",
      i.price,
      i.shortCode,
      isVegType(i.dietary) ? "Yes" : "No",
      i.active ? "Yes" : "No",
    ]);
  return toCsv([MENU_CSV_HEADERS, ...rows]);
}

export interface MenuCsvRow {
  /** Line in the file (1 = first data row). */
  line: number;
  name: string;
  category: string;
  price: number;
  shortCode: string;
  veg: boolean;
  active: boolean;
  isNewCategory: boolean;
  /** An item with this name is already in the menu: it is updated. */
  existingId?: string | undefined;
  error?: string | undefined;
}

const yes = (v: string, fallback: boolean) => {
  const s = v.trim().toLowerCase();
  if (!s) return fallback;
  return !["no", "n", "false", "0"].includes(s);
};

/** Web POS parseImportRows, plus: header row optional, price with ₹ / commas, existing items marked. */
export function parseMenuCsv(
  text: string,
  categories: MenuCategory[],
  items: MenuItem[],
): MenuCsvRow[] {
  const table = parseCsv(text);
  const hasHeader = (table[0]?.[0] ?? "").trim().toLowerCase() === "name";
  const known = new Set(categories.map((c) => c.name.trim().toLowerCase()));
  const itemByName = new Map(items.map((i) => [i.name.trim().toLowerCase(), i.id]));
  const newCats = new Set<string>();
  const seenNames = new Set<string>();
  return table.slice(hasHeader ? 1 : 0).map((cells, idx) => {
    const [name = "", category = "", price = "", shortCode = "", veg = "", active = ""] = cells;
    const priceNum = Number(price.replace(/[₹,\s]/g, ""));
    const cat = category.trim();
    const catKey = cat.toLowerCase();
    const isNewCategory = cat.length > 0 && !known.has(catKey) && !newCats.has(catKey);
    if (isNewCategory) newCats.add(catKey);
    const nameKey = name.trim().toLowerCase();
    let error: string | undefined;
    if (!name.trim()) error = "Missing name";
    else if (!cat) error = "Missing category";
    else if (!price.trim() || Number.isNaN(priceNum) || priceNum <= 0) error = "Invalid price";
    else if (seenNames.has(nameKey)) error = "Same name twice in the file";
    seenNames.add(nameKey);
    return {
      line: idx + 1,
      name: name.trim(),
      category: cat,
      price: priceNum,
      shortCode: shortCode.trim().toUpperCase(),
      veg: yes(veg, true),
      active: yes(active, true),
      isNewCategory,
      existingId: itemByName.get(nameKey),
      error,
    };
  });
}
