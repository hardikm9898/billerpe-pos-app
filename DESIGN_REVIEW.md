# BillerPe POS App — Design Verification Report

Date: 25 Sep 2026 · Design reviewed: `BillerPe POS App/POS-APP-DESIGN` (Lovable, TanStack + React + Tailwind, 34 screens, type check clean).
Checked against: `ROADMAP.md`, owner decisions, and the **real rules in the running system** (exe bill engine, KOT routing, tokens, bill numbers, permissions, owner decision lists 2 and 3).

---

## 1. Verdict

The look, navigation and most screens are good and usable. **The design is not yet correct enough to build on as-is.** Several flows follow the prototype's own simplified logic instead of BillerPe's real rules. If we connect it to the backend unchanged, bills, table states and KOT printing would behave differently from the Web POS and Captain App, which is exactly the class of problem the owner has fought all September.

- **Keep:** visual design, shell, role tabs, login, tables grid, order screen layout, cart and rounds, variant/addon sheet, custom item, KOT sent / not printed states, settle sheet (split, UPI QR "Mark as paid", Due), counter billing layout, orders list and detail, due ledger, cash session, token display, dashboard, reports template, menu, staff, devices, per-device printers, subscription, help, audit, offline and session modals.
- **Fix:** 14 flow and rule conflicts (section 3), 7 missing screens (section 4), and settings that must be rebuilt to match the real configuration (section 5).

---

## 2. What already matches the requirements
| Requirement | Status |
|---|---|
| Online only, blocking "No internet" screen, carts kept | ✅ |
| Roles land on their home, tabs per role, no "no access" toasts | ✅ (5 roles; the real system has 7, see 3.13) |
| Login: password + PIN, "Who's on shift", device-limit, subscription-expired and plan-mismatch errors | ✅ |
| Split payment: only cash may exceed the bill, change shown | ✅ |
| UPI QR only, exact amount, Mark as paid, customer-side view | ✅ |
| Due needs name + 10-digit mobile | ✅ |
| Cash and Due payment modes locked | ✅ |
| Owner row locked (only owner edits self, cannot be deactivated or role-changed) | ✅ |
| Decimal qty (2 decimals), typing 0 removes an unsent line | ✅ |
| Custom item; kitchen asked only when there is more than one kitchen | ✅ |
| Menu switcher (menus with their own prices) | ✅ |
| Held tables cannot be merged; transfer keeps Hold | ✅ |
| KOT saved first, then printed; "Not printed" list + retry / other printer | ✅ |
| Per-device printer settings, built-in printer detection, any brand, driver-not-supported state | ✅ |
| Devices "4 of 6", limit set only by support | ✅ |
| Request plan change → support ticket | ✅ |
| Cash session with denomination count, expected vs counted | ✅ |
| Token display (Preparing / Ready) | ✅ |

---

## 3. Must change: flows that break real BillerPe rules

| # | Where in design | What it does now | Real rule | Change |
|---|---|---|---|---|
| 3.1 | Tables → tap free table → "Start order" | Creates an order on open and turns the table **Running** | Owner rule (issue list 3 #5): opening a table or cart-only items do **not** change the table; **Running only after KOT/save** | Opening a table creates only a device draft. The table stays Free until the first KOT or Hold. |
| 3.2 | Order code | A bill number is given **when the table opens**; takeaway gets "T-token" as its code | Bill number is given by the server **when the order is created** (first KOT/hold), one sequence for all order types. Token is a separate number. | Show "New order" until the first KOT; then show the real bill no + token. |
| 3.3 | Hold button | Only changes the status; the unsent items stay on the phone | Hold **saves the cart to the server** without KOT (table Hold); held lines stay editable from any device | Hold sends the draft lines to the server. |
| 3.4 | Send KOT routing | The whole round goes to the **first item's kitchen**; a "Garden" hack picks the printer | One round is **split by printer and by kitchen** using category + table + order-type filters (same helper as the exe). One KOT number, several printouts. | The KOT result lists every printer and kitchen it went to, with printed / not printed per printer. |
| 3.5 | Bill maths (`billing.ts`, cart totals, table card, counter "approx total") | One GST rate for the whole outlet (flat 5%); service charge always before tax; addon price multiplied by qty | Real engine: **list of tax rules** (by order type, table category, items), **service/packaging charge rules** (thresholds, base, taxable or not), addons priced once per line, **delivery charge = 0 product-wide** | All totals come from the server's bill engine (shared core). The app never computes its own tax. |
| 3.6 | Print bill with unsent items | Blocked ("send the pending KOT first") | **Bill with KOT** setting: printing the bill also prints unsent items as a KOT on the invoice printer | Follow the outlet's bill-with-KOT setting. |
| 3.7 | Sent (fired) items | Locked forever; no way to remove | A fired line can be removed (with reason) **only by the captain who fired it, or Manager/Owner, and not after it is served** | Add "Remove item" on sent lines, following this rule. |
| 3.8 | Move KOT | Only the **latest** KOT, and only to a **free** table | Any chosen KOT round, to any non-held table (joins the running order there, or starts a new one) | Let the user pick the KOT and target table. |
| 3.9 | Tokens | "Next token" is predicted on the phone (12-hour window); shown before saving | Token is given by the server per **business day**, for Dine-in / Pickup / Both / Off; manual reset | Show the token only after saving. Token settings use the real 4 options. |
| 3.10 | Bill number settings | Prefix + reset daily / monthly / yearly / never | Owner decision 7.7: same as exe, **never / daily / financial year** (with FY start month), no prefix | Replace with the real options. |
| 3.11 | Order types | Dine-in / Takeaway / **Delivery** (with delivery charge) | The system has Dine-in and Pickup; delivery charge is switched off product-wide | **Decision needed (Q3).** |
| 3.12 | Discount limits per role + manager PIN approval | New feature, not in the current system | Not in the Web POS or backend today | **Decision needed (Q4).** |
| 3.13 | Roles | 5 fixed roles | Real system has 7: Owner, Manager, Cashier, Captain, Kitchen Staff, **Inventory Manager, Accountant** | **Decision needed (Q5).** |
| 3.14 | Permissions | Own module list (billing, cash, stock, devices…) | Real matrix: 24 modules + 6 special permissions, enforced on every server route | Map the screens to the real module keys; the Staff → Permissions screen shows the real list. The design's extra "print bill" and "discount beyond limit" special permissions are new (Q4). |

Also smaller issues:
- The login screen shows "Demo Restaurant · Main Branch" before anyone has logged in. A new phone doesn't know its outlet (multi-tenant), so show BillerPe branding until the first login, then the outlet name.
- PIN login only works on a phone that has already logged in with a password for that outlet (the PIN is checked within that outlet).
- Counter dine-in has no table. That's fine for QSR, but the order then counts as "dine-in without table" in reports. This is acceptable, but it needs your OK.

---

## 4. Missing screens and features
| # | Missing | Why it matters |
|---|---|---|
| 4.1 | **Reservations screen** (the store has the actions, but there's no page) | Brief prompt 2 #8; reservation rules (hold 30 min before, no-show release) already live on the exe. |
| 4.2 | **QR order accept / reject per item** (with reasons Out of stock / Not available / Kitchen closed / Other) | Owner decision issue list 3 #9. The design only shows a "QR" badge. |
| 4.3 | **Order status screen** (my running tables, rounds Sent / Preparing / Ready / Served, mark Served) | Brief prompt 2 #6. Captains need "mark served". |
| 4.4 | **Outlet profile**: name, address, phone, GSTIN, FSSAI, **UPI ID** | The UPI QR needs the outlet's UPI ID, but no screen sets it. |
| 4.5 | **Waitlist queue** | It exists in the Web POS (module "queue"). |
| 4.6 | **Customer data** (list, edit, last order) | It exists in the Web POS; due and e-bill use it. |
| 4.7 | **Stock & inventory** | Skipped on purpose in design; the Web POS has the full module (and today's stock decisions). **Decision needed (Q6).** |

Reports: design has 12. Missing compared with the Web POS: Purchase and Closing stock (belong to stock), Due collected.

---

## 5. Settings that must match the real configuration
The design's Settings is a simplified form. The real outlet config is richer, and Plan 1 and Plan 2 must share the same data model, so a customer can switch plans and support staff see the same things.

| Design today | Real config (must become) |
|---|---|
| One "GST %" | **Tax list**: name, %, active, order types, table categories, items (e.g. CGST 2.5 + SGST 2.5, or liquor VAT on bar items only) |
| Service charge % / Packaging ₹ | **Charge rules**: active, % or fixed, order types, based on subtotal or after discount, only when bill is greater/less than an amount, included in tax or not |
| Delivery charge ₹ | Remove (product-wide off), unless Q3 says otherwise |
| Kitchens: category → kitchen | Kitchen: name + categories + tables/sections + order types (same filters as printers) |
| Printer routing: KOT printer per kitchen | Per-device printer with the real filters: **categories + table sections + order types** (+ invoice printer). **Decision needed (Q2).** |
| Bill number prefix + reset | never / daily / financial year (+ FY start month) |
| Token: dine-in / takeaway / both / off | Same 4 options (codes 1 / 0 / 2 / 3) + bill with KOT + bill with token |
| Invoice format: header, footer, GSTIN, FSSAI, paper | Keep, plus the real fields: GST inclusive format, font size, language line, logo |
| — | Business day start time ✅ exists; add opening/closing (cash session) on/off |

---

## 6. Technical notes for the build
- The design is **TanStack Start (server-side rendering)**. Capacitor needs a static SPA. Same conversion as the Captain App: Vite SPA + hash routing, and keep every screen as-is.
- All mock logic in `store.tsx` gets replaced by API calls behind the same `usePos()` contract. `billing.ts` is deleted in favour of the shared bill engine.
- The project folder is not a git repo. The build will live in a new folder, `BillerPe POS App/app/`, in git, keeping the design untouched as the reference (same approach as the Captain App).

---

## 7. Owner decisions (25 Sep 2026)
1. **Design changes are made in code**, in a new app folder `BillerPe POS App/app/`; the Lovable design stays untouched as the reference.
2. **Per-device printers use the real filters**: categories + table sections + order types (+ invoice printer), same as the Web POS.
3. **Delivery charge off.** Order types are Dine-in and Pickup, like the rest of BillerPe.
4. **No discount limits and no manager PIN.** Discounts are controlled only by permissions.
5. **Roles: all 7 real roles** (Owner, Manager, Cashier, Captain, Kitchen Staff, Inventory Manager, Accountant), with the real permission matrix and per-user overrides.
6. **Stock & inventory are in the first release**, following the stock decisions of 25 Sep 2026 (supplier payments as expenses, negative stock allowed, stock ledger, deduction at settle).
7. **Counter billing follows the system:** Dine-in is always given a table (assign one), Pickup has none. The same as Web POS keyboard billing.
8. **All missing screens are in the first release:** order status, outlet profile (UPI ID), QR accept/reject, reservations, waitlist, customer data, stock.
9. **Also fix every layout problem** (e.g. the dashboard branch selector overlapping the filters), checked at phone and tablet sizes.

---

## 8. Status (25 Sep 2026) — design stage done
Built in `BillerPe POS App/app/` (git, 11 commits). Runs with demo data (`npm run dev`, port 5190; DEMO menu logs in as any of the 7 roles).

- **Layout fixes:** dashboard outlet picker overlap, back button on every non-tab screen, counter "Out of stock" collision, cart bar covering fields, ₹0.00 on empty tables, report order.
- **Real rules** (checked by `npm run verify:rules`, 46 scenarios): cart stays on the phone, table Running only after KOT/hold; bill no at order create; daily tokens; hold saves lines; KOT split by printer and kitchen filters; one bill engine (tax rules, charge rules); bill-with-KOT; remove-sent-item rule; merge/transfer/move-KOT rules; split payment rules; cash drawer; dues; QR per-item accept/reject; stock deduction; owner lock; no discount limits.
- **All screens on the real model**, plus the new ones: order status, QR orders, reservations, waitlist, customers, outlet details (UPI ID), full stock module, settings rebuilt to the real configuration, per-device printers with real filters, 7 roles and the real permission matrix.
- **QA in Chrome:** every role, every screen, phone and tablet: correct home, no "no access" pages, no errors, no overflow; captain and cashier flows tapped through end to end.

**Next stages:** (1) the cloud `/app/v1` API in `uat-backend-v2` implementing `src/lib/pos/backend/types.ts` with the same rules (plan flag, device limit, bill engine port, idempotency, sockets); (2) swap the demo backend for it; (3) native printer plugin (Wi-Fi / Bluetooth / USB / built-in) and the Android APK.
