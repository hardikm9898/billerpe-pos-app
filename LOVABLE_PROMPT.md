# BillerPe POS App — Lovable Design Brief

How to use this file:
1. Paste **Prompt 0 (Master brief)** into a new Lovable project first.
2. Then paste **Prompts 1 → 7 one at a time**, and check each result before the next.
3. After each prompt, you can reply "keep everything from the master brief" if Lovable drifts from the design rules.

---

## Prompt 0 — Master brief (paste first)

```
Build a mobile-first Android POS app UI called "BillerPe POS" for restaurants, cafés and QSRs in India.
This is a DESIGN PROTOTYPE with mock data only. No backend, no Supabase, no auth provider, no server functions.
Later it will be wrapped with Capacitor into an Android APK and connected to our real API, so:

TECH RULES
- React + TypeScript + Tailwind + shadcn/ui + lucide-react icons. Client-side SPA only (no SSR-only features).
- All data comes from ONE store: src/lib/pos/store.tsx exporting a usePos() hook (state + actions).
  Types in src/lib/pos/types.ts, mock data in src/lib/pos/mock.ts, money/date helpers in src/lib/pos/format.ts.
  Screens must never import mock.ts directly, only usePos(). Actions (sendKot, holdOrder, settleBill, ...) are
  async functions that update the store and can return errors, so we can swap in real API calls later.
- Mock data must be obviously demo: restaurant "Demo Restaurant", outlet "Main Branch". Currency ₹ (INR, en-IN
  number format, 2 decimals), GST 5% (CGST 2.5 + SGST 2.5), service charge optional.
- No localStorage for business data (only UI preferences like the last-selected section).

PRODUCT
An online-only POS: every phone talks to the cloud. There is NO offline billing. When the internet is gone, the
app shows a blocking full-screen "No internet connection" state with a Retry button. Carts being built stay on
screen and nothing is lost. Many staff log in at the same time from their own phones or tablets.

ROLES (each role sees only what it is allowed; navigation adapts; never show "no access" toasts)
- Owner: everything, including staff, permissions, devices, settings, subscription.
- Manager: billing, orders, menu, tables, reports, expenses, stock, cash session; no permission editing.
- Captain (waiter): tables, take orders, send KOT, hold, request bill, merge/transfer, takeaway, reservations.
- Cashier: counter billing, settle bills, payments, reprint, due, cash session.
- Kitchen: Kitchen Display (KDS) only, usually on a tablet.
Permissions are a matrix of modules x (view/create/edit/delete) plus special permissions:
edit after KOT, reopen settled bill, delete order, merge/transfer tables. Model this in types.ts and hide buttons
the user can't use.

DESIGN SYSTEM (keep consistent on every screen)
- Primary brand red #C5202B; primary-soft #FAECED with text #941820; background warm off-white #FAF9F7;
  cards white; text near-black #2A1F1C; muted text #7A6E6A; borders #ECE7E3.
- Status colours: Free = neutral/grey outline, Running = red/primary, Hold = amber, Bill Generated = blue,
  Reserved = violet, Ready = green. Veg = green square dot, Non-veg = red triangle (Indian food marks).
- Fonts: Archivo (600–800) for headings and big numbers, Manrope (400–700) for body. Load both locally via
  @fontsource (the app must look right with no Google Fonts access).
- Radius 14px on cards and sheets, 10px on buttons/inputs. Soft shadows only. Min tap target 44px.
- Phone first (360–430px wide). Bottom tab bar per role. Actions open as bottom sheets on phone and as
  centred dialogs on tablet. Tablet (>=768px): table grid 4–6 columns, menu with left category rail,
  cart as a right-side panel.
- Light mode is the default. Support dark mode through CSS variables.
- Every list/screen needs loading skeletons, an empty state and an error state with Retry.
- Number inputs: typing replaces 0, no spinners, no negatives; quantity allows up to 2 decimals.
- Money always as ₹1,234.50. Dates as "24 Sep, 6:09 pm".

GLOBAL UI
- Top bar: outlet name, live connection dot (Online / Reconnecting / Offline), notifications bell with count.
- Blocking modals: "No internet connection" (Retry) and "Session expired — please log in again".
- Toasts only for success/short errors, never for connection loss.
```

---

## Prompt 1 — Login, role home, app shell

```
Build the app shell and login.
1. Splash with BillerPe logo mark (simple red rounded square with "B").
2. Login screen: tabs "Password" (mobile number + password) and "PIN" (4-digit PIN pad, with "Who's on shift?"
   avatar chips of staff who logged in on this device before). "Forgot password" link (toast placeholder).
   Error states: wrong password, account inactive, device limit reached ("This outlet allows 6 devices.
   Ask the owner to log out a device, or contact BillerPe support to add more."), subscription expired (screen
   with Renew CTA for owner, contact owner for others), "This outlet uses BillerPe Web POS, not this app"
   (plan mismatch, with a Contact support button).
3. Outlet picker (only if the owner has more than one outlet).
4. After login, each role lands on its home: Owner/Manager → Dashboard, Captain → Tables, Cashier → Counter
   billing, Kitchen → KDS.
5. Bottom tab bars:
   - Owner/Manager: Home, Tables, Orders, Reports, More
   - Captain: Tables, Takeaway, Orders, Alerts, Profile
   - Cashier: Counter, Tables, Orders, Cash, More
   - Kitchen: KDS (full screen, no tab bar), with a small menu for logout/settings
6. "More" screen: grid of modules the role can open (Menu, Tables setup, Staff, Expenses, Stock, Cash session,
   Settings, Devices, Subscription, Help, Audit log).
7. Profile: name, role, outlet, change PIN, change password, app lock toggle, printer status, logout,
   "Switch user" (goes to PIN pad without full logout).
8. For demo only: a small "Demo: switch role" menu on the login screen, clearly labelled DEMO.
```

## Prompt 2 — Captain: tables and ordering

```
Build the captain ordering flow.
1. Tables screen: section tabs (e.g. AC Hall, Garden, Rooftop), status filter chips with counts, table cards
   showing table no, status colour, guests, running amount, elapsed time, captain name, a "QR" badge if a QR order
   is waiting, and a "Reserved 8:00 pm" badge. Pull to refresh. Long-press → Table actions sheet.
2. Table actions sheet: Transfer table, Merge tables, Move KOT to another table, Change guests, Print bill,
   Cancel order (asks for a reason; only if permitted). Held tables cannot be merged (show why).
3. Order screen (after tapping a table): header with table, guests stepper, customer name/mobile (optional),
   menu switcher (e.g. "Main Menu" / "Garden Menu"). Search by name or short code. Category chips (phone) /
   left rail (tablet). Item rows: veg/non-veg mark, name, price, "Out of stock" disabled state, add button that
   turns into a quantity stepper. Items with variants/addons open a sheet (variant radio, addon groups with min/max,
   note field). "+ Custom item" button (name, price, qty, kitchen picker only if the outlet has more than one kitchen).
4. Cart (bottom sheet phone / right panel tablet): sent rounds shown locked as "Round 1 · Sent 6:09 pm" with
   per-item status chips (Sent / Ready / Served), then the new round with editable qty/notes. Buttons:
   "Send KOT" (primary), "Hold", "Request bill". Show subtotal, tax, total preview.
5. KOT sent confirmation: "KOT #12 sent · printed on Kitchen Printer (192.168.1.50)" with a round summary.
   Print-failed state: "KOT #12 saved but NOT printed — Kitchen Printer not reachable. Are you on the outlet Wi-Fi?"
   with Retry / Print on another printer. A "Not printed" badge on the Orders tab lists KOTs waiting to print.
6. Order status screen: all my running tables with round statuses; "Food ready" items highlighted green.
7. Takeaway / Delivery: customer name + mobile, same menu + cart, token number shown after KOT.
8. Reservations: today/upcoming list, create (name, mobile, guests, date, time, table, advance note), status
   (Booked / Seated / No-show / Cancelled), tables become Reserved 30 min before.
9. Alerts: Food ready, Bill requested, New QR order, Reservation due soon; read/unread.
```

## Prompt 3 — Billing and payments (captain + cashier)

```
Build billing, payments and counter billing.
1. Bill preview: outlet header, items with qty × rate, subtotal, discount line, service charge, packaging,
   delivery charge, CGST/SGST lines, round-off, grand total. Actions: Apply discount (flat ₹ / %, with reason;
   show "limit exceeded — needs manager PIN" state), Promo code, Print bill, Share (PDF / WhatsApp), Send e-bill (SMS).
2. Settle payment sheet: payment modes Cash, UPI, Card, Due, plus custom modes (e.g. Paytm). Split payment rows
   with amount each; only cash may exceed the bill (show change to return); non-cash total cannot exceed the bill.
   UPI (no payment gateway): show a big UPI QR with the exact amount and the outlet's UPI ID, the customer scans
   and pays, the cashier taps "Mark as paid". Also a "Show QR on customer side" full-screen mode. Due asks for customer name + mobile.
   Success screen: "Bill #A-1042 settled" with Print / Share / New order.
3. Counter billing (cashier home, QSR style): item grid with images optional, category chips, search, running
   cart panel, order type toggle (Dine-in / Takeaway / Delivery), token number, "Save & Print" and "Save & Settle".
4. Orders list: tabs Running / Settled / Cancelled / Due, date filter, search by bill no/mobile/table.
   Order detail: items, rounds/KOTs, payments, timeline (created, KOT 1, KOT 2, bill printed, settled, by whom),
   actions by permission: Reprint bill, Reprint KOT, Edit settled bill, Cancel (reason).
5. Due ledger: customers with due amount, collect payment (full/partial), history.
6. Cash session (opening & closing): open with float, cash in / cash out entries with reason, close with
   denomination count, expected vs counted, difference highlighted, summary share.
7. Token display screen (landscape tablet/TV): "Preparing" and "Ready" columns with large token numbers.
```

## Prompt 4 — Kitchen Display (KDS)

```
Build the KDS for a landscape tablet.
- Kitchen selector at top (Main Kitchen, Bar, Tandoor). Columns: New, Preparing, Ready.
- KOT cards: KOT no, table / takeaway token, captain, time since fired (turns amber after 10 min, red after 20),
  items with qty, variants/addons, notes in bold, custom items marked. Tap card or item to move New → Preparing →
  Ready. "Ready" notifies the captain.
- New KOT arrives with a sound toggle and a highlight animation. Recall (last 20 served KOTs).
- Big touch targets, readable from 1 metre, dark mode friendly.
```

## Prompt 5 — Owner/Manager: dashboard and reports

```
Build the dashboard and reports.
1. Dashboard: date filter (Today, Yesterday, Last 7 days, Last 30 days, Custom) with a "Business day: 6:00 am –
   5:59 am" hint. KPI cards: Net sales, Bills, Avg bill, Guests, Running orders + amount, Cancelled, Discounts,
   Expenses. Payment split (Cash/UPI/Card/Due/other) as a donut. Hourly sales bar chart, 7-day trend line.
   Top 5 items, order type split (Dine-in/Takeaway/Delivery/QR). Live tables mini-grid. Outlet switcher for owners
   with several outlets.
2. Reports list (cards with icon): Day-wise sales, Item-wise, Category-wise, Payment mode, Tax (GST), Discount,
   KOT, Cancelled/void, Staff performance, Table performance, Cash session, Expense, Purchase, Closing stock.
3. Report screen template: filters (date range, outlet, staff, payment mode), summary strip, table with sticky
   first column and horizontal scroll on phone, totals row, Export (PDF / Excel) and Share.
```

## Prompt 6 — Owner/Manager: setup and settings

```
Build the management screens (all as list → detail/edit forms with validation and empty states):
1. Menu: Items (photo from camera/gallery, name, short code, category, price, veg type Veg/Non-veg/Egg/Jain/Vegan,
   tax, kitchen, variants, addon groups, active, out-of-stock quick toggle on the list), Categories (sort order),
   Variants, Addon groups (min/max, single/multi), Menus (e.g. Garden Menu with its own prices).
2. Tables: sections, tables (add one or bulk range "T1–T20"), download/share table QR codes.
3. Staff: list with role and status, add/edit (name, mobile, role, PIN, password), deactivate.
   The owner row is locked (cannot be edited by others, deactivated or role-changed).
   Roles & permissions: matrix of modules × View/Create/Edit/Delete + special permissions, per-user overrides.
4. Devices & logins: logged-in devices (device name/model e.g. "Sunmi V2 Pro", user, last active, app version,
   printers configured), Log out device, usage "4 of 6 devices" with the note "Device limit is set by BillerPe
   support" (the owner cannot change the limit). Tap a device → its printer settings.
5. Settings groups: Billing (tax rates, service charge, packaging/delivery charge, round-off, bill number format &
   reset), Payment modes (Cash and Due locked; add custom), Promo codes, Invoice format (logo, header/footer text,
   GSTIN, FSSAI, preview 58mm/80mm), KOT format (preview), Kitchens (category → kitchen routing), Business day
   start time, Token settings (on for dine-in/takeaway/both, reset tokens), QR ordering on/off.
6. Expenses: heads, entries (amount, head, mode, note, bill photo), monthly total.
7. Subscription: current plan (App Lite / App Standard / App Pro), expiry countdown, devices "4 of 6", e-bill
   credits, Renew button, invoices, and "Request plan change" (form: wanted plan — e.g. switch to Web POS +
   Captain App — and a note → creates a support ticket, shows "Our customer care team will call you").
8. Printer settings — THIS DEVICE (open from Profile and from Settings; every phone/tablet has its own setup):
   - Header "Printers on this device: Captain Ravi's phone".
   - Device info card: "This device: <make> <model> · Android 11" (customers use many different Android POS
     terminal brands, so never assume one brand).
   - "Find built-in printer" button: scanning state, then a result card "Built-in printer found (via Bluetooth
     'InnerPrinter' / USB / brand driver)" with Use & Test print, or "No built-in printer found" with the
     options below.
   - Add printer: type Wi-Fi (IP + port 9100), Bluetooth (scan & pair list), USB (connected devices list),
     Built-in (terminal), System print / PDF (fallback). Name, paper width 58mm/80mm, copies, Test print
     button, status (Connected / Not reachable / Driver not supported yet — "Tell support your model").
   - Routing for this device: "Invoice printer" picker; for each kitchen (Main Kitchen, Bar, Tandoor) pick the KOT
     printer; option "Print KOT on this device: on/off".
   - Empty state: "No printer set up on this device. KOTs will still reach the kitchen screen."
9. Help & support: FAQs, raise ticket, call/WhatsApp support. Audit log: who did what, when (filterable).
```

## Prompt 7 — Stock (later release) and polish

```
1. Stock: dashboard (low-stock alerts, stock value), Raw materials, Units, Suppliers, Purchase entry (scan barcode,
   supplier, items, rates), Stock in/out, Wastage, Recipes (menu item → raw materials per portion),
   Semi-finished items, Stock reports.
2. Polish pass: check every screen at 360px, 412px and 768px widths, dark mode, skeleton/empty/error states,
   the no-internet modal over each screen, and that every role's navigation hides what it can't access.
```
