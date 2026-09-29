// Every report the app offers (the cloud serves the same ids). Sales and
// money reports need "reports"; stock reports need "stock-reports".
export const REPORTS: {
  id: string;
  title: string;
  group: "Sales" | "Money" | "Stock";
  module: "reports" | "stock-reports";
  body: string;
}[] = [
  {
    id: "day-wise",
    title: "Day-wise sales",
    group: "Sales",
    module: "reports",
    body: "Sales, bills and guests per business day",
  },
  {
    id: "item-wise",
    title: "Item-wise sales",
    group: "Sales",
    module: "reports",
    body: "Quantity and amount per item",
  },
  {
    id: "category-wise",
    title: "Category-wise sales",
    group: "Sales",
    module: "reports",
    body: "Sales by menu category",
  },
  {
    id: "tax",
    title: "Tax (GST)",
    group: "Sales",
    module: "reports",
    body: "CGST / SGST and every tax rule",
  },
  {
    id: "discount",
    title: "Discounts",
    group: "Sales",
    module: "reports",
    body: "Every discount and promo with its reason",
  },
  {
    id: "kot",
    title: "KOT report",
    group: "Sales",
    module: "reports",
    body: "KOTs sent, by whom and when",
  },
  {
    id: "cancelled",
    title: "Cancelled orders",
    group: "Sales",
    module: "reports",
    body: "Cancelled orders and reasons",
  },
  {
    id: "staff",
    title: "Staff performance",
    group: "Sales",
    module: "reports",
    body: "Sales per captain / cashier",
  },
  {
    id: "table",
    title: "Table performance",
    group: "Sales",
    module: "reports",
    body: "Sales per table",
  },
  {
    id: "payment-mode",
    title: "Payment modes",
    group: "Money",
    module: "reports",
    body: "Cash, UPI, card, due and custom modes",
  },
  {
    id: "due-collected",
    title: "Due collected",
    group: "Money",
    module: "reports",
    body: "Dues collected from customers",
  },
  {
    id: "cash-session",
    title: "Cash sessions",
    group: "Money",
    module: "reports",
    body: "Float, expected vs counted, difference",
  },
  { id: "expense", title: "Expenses", group: "Money", module: "reports", body: "Expenses by head" },
  {
    id: "purchase",
    title: "Purchases",
    group: "Stock",
    module: "stock-reports",
    body: "Purchases, paid and unpaid",
  },
  {
    id: "closing-stock",
    title: "Closing stock",
    group: "Stock",
    module: "stock-reports",
    body: "Stock in hand, value, low and negative",
  },
  {
    id: "stock-ledger",
    title: "Stock ledger",
    group: "Stock",
    module: "stock-reports",
    body: "Opening, purchased, used, wastage, closing",
  },
  {
    id: "wastage",
    title: "Wastage",
    group: "Stock",
    module: "stock-reports",
    body: "Wastage and its cost",
  },
];
