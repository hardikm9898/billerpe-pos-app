# BillerPe POS App (Android) — System Analysis, Feature List & Roadmap

Date: 24 Sep 2026 · Status: all owner decisions received (section 7).

---

## 1. The two plans

| | **Plan 1 — Web POS + Captain App** | **Plan 2 — BillerPe POS App** (new) |
|---|---|---|
| Who uses it | Outlet with a Windows PC at the counter | Outlet that uses only Android phones/tablets |
| Where bills are made | `billerpe-local-exe` on the outlet PC (works offline) | The **cloud** (`uat-backend-v2`) directly |
| Internet | Not required for billing | **Required.** No internet means the app blocks with a clear screen. There is no offline billing. |
| Logins | 1 Web POS terminal + unlimited captain phones (via exe) | Many logins: owner, manager, captain, cashier, kitchen, each on their own phone/tablet |
| Printing | Exe prints every KOT/bill | The phone/tablet prints (Bluetooth / Wi-Fi / built-in printer) |

**Rule: a customer (hotel) is on exactly one plan.** The system has to enforce this. It can't just be a sales promise (see 3.1).

---

## 2. What the system does today (analysis)

### 2.1 The three codebases

| Codebase | Role today | What the new app takes from it |
|---|---|---|
| `uat-backend-v2` (cloud, Express + Sequelize + MySQL, socket.io) | Master data, sync for exes, reports, QR ordering, subscriptions, superadmin, CRM. It also still has the **older billing API** (`/kotOrder`, `/adminOrder`, `/settleBills`, `/mobileKot`, `/mobileSettleBills`, …) from the old frontend and an old mobile app. | Becomes the **billing authority** for Plan 2 hotels. |
| `billerpe-local-exe` (outlet server, SQLite) | Holds the **current, correct billing rules**: `helpers/billEngine.js`, `orderTotals.js`, `localBillNumber.js`, `orderHooks` tokens, `kotPrinterRouting.js`, `tableLock.js`, `cashDrawer.js`, `otherPayments.js`, `customerAttach.js`, `localStockDeduction.js`, `permissions.js` + `constant/routePermissions.js`, custom items, decimal qty, QR item accept/reject, KDS ready. | These rules must be **ported to the cloud** (see 3.2). |
| `billerpe-pos-pro-v2` (Web POS) | Full admin + billing UI for Plan 1. Modules: Dashboard, Biller (table grid), Keyboard billing, KDS, Orders, Menu (categories/items/variants/addons/menus), Tables (categories/manage/reservations/waitlist), Users & permissions, Reports (13), Expense, Stock, Opening & Closing (cash session), Operations (calculation, tax, invoice format, promo codes, delivery charge, payment modes, kitchens, printers, KOT format, display, menu setting, QR code, customer data, due payment), System (local server & sync, notifications, audit log), Profile, Help/Tickets, QR menu, token display. | The **feature scope** and the permission model. |
| `Captain Application/Captain App` (React + Capacitor, exe only) | Captain flow: login (password/PIN), table grid, order & menu, variants/addons, custom item, menu switch, cart, Send KOT, Hold, order status (Sent/Ready/Served), bill request, merge/transfer/cancel, takeaway, today's orders, reservations, alerts, profile. | The **proven app stack** (Lovable prototype → React + Capacitor) and the captain screens. |

### 2.2 Permission model (already exists, reuse it)

Modules: `dashboard, biller, keyboard-billing, kds, orders, menu, tables, reservations, queue, users, permissions, reports, expense, stock-masters, stock-transactions, stock-recipes, stock-reports, cash-session, ops-billing, ops-hardware, ops-experience, ops-ledger, system, audit-log`. Each has view/create/edit/delete.
Special permissions: `orders.editAfterKot, orders.reopenSettled, orders.deleteOrder, tables.mergeTransfer, system.remakeOrderSequence, users.editPermissions`.
Role defaults come from the cloud's `rolePermissionDefault`, with per-user overrides. **The app must use the same matrix.** The owner lock rules also carry over: nobody can deactivate or edit the owner, and Cash and Due are mandatory payment modes.

### 2.3 Gaps found while analysing

1. **No plan field.** `hotel` and `subscription` have no "which product" column (only `extra_login_mobile` / `extra_login_web` counts).
2. **Cloud billing is outdated.** The cloud's order endpoints lack every rule fixed on the exe in Sept 2026: one bill engine, discount ownership, tokens per business day, bill-with-KOT, KOT routing by category/table/order type, custom items, 2-decimal qty, QR per-item decisions, cash-drawer rules, split-payment rules, custom payment modes.
3. **Bill numbers and tokens are exe-owned.** The cloud stores them verbatim today. Plan 2 needs cloud-side generation that is safe when many phones bill at once (DB-level uniqueness, transaction).
4. **Old mobile endpoints** (`routes/mobile.js`, `/mobile*` in `routes/hotel.js`, `mobileAuth` reads a cookie from a header) belong to the old app. **Do not build on them.**
5. **Real-time** on the cloud authenticates staff by cookie. Phones need **bearer-token** sockets (the same lesson as the KDS bug: never rely on cookies from an app/browser).
6. **Printing.** Today only the exe prints. A phone-only outlet needs on-device ESC/POS printing plus KOT routing to the right printer.

---

## 3. Backend work needed before the app (Phase 0)

### 3.1 Plan enforcement
- Add `hotel.product_plan` = `LOCAL_SUITE` (Plan 1) | `CLOUD_APP` (Plan 2), set by superadmin at onboarding and changed only by superadmin.
- `LOCAL_SUITE`: exe registration is allowed. Cloud billing writes are **refused** (the exe owns bills, and a second writer would clash bill numbers). POS App login is refused (see 7.2).
- `CLOUD_APP`: exe registration is **refused**. POS App login is allowed, up to the outlet's device limit (3.5).
- **Changing plan** (decision 7.4): the customer asks from the app/Web POS ("Request plan change", creates a support ticket of type *Plan change*). Customer care changes it in the superadmin portal with a **Change plan** tool that runs a checklist:
  - Plan 1 → 2: the exe has pushed everything (nothing pending), no open orders, then revoke the exe's device token, continue the bill number sequence and tokens on the cloud, and set up printers and devices in the app.
  - Plan 2 → 1: no open orders, register the exe, and the exe pulls the full data and continues the bill sequence.
  - Every plan change is written to the audit log (who, when, from/to).

### 3.2 Cloud becomes the bill authority for `CLOUD_APP` hotels
- Port the exe's billing helpers into the cloud: bill engine, order totals, bill number, token, KOT routing, table lock, cash drawer, other payments, customer attach, stock deduction, timeline, audit log. Today the bill engine is copied in 3 places ("change all three together"); this would make it 4. **Recommendation:** move it into one shared package (`@billerpe/core`) used by exe, cloud, Web POS and both apps.
- Expose a **new, versioned API** (`/app/v1/...`) that mirrors the exe's route contracts (`kotOrder`, `holdOrder`, `adminOrder`, `settleBills`, `moveTable`, `moveKot`, `kotItemRemove`, `orderRemove`, `kotReady`, `qrOrder/:id/accept`, …). Same shapes mean the Captain App / Web POS logic can be reused, and later even the Web POS could run in cloud mode.
- Every write carries a **client key** (idempotency) so a retry on a weak 4G connection never creates a duplicate KOT or bill.
- Row locking per order/table in a DB transaction, and a unique `(hotel_id, bill_no)` and `(hotel_id, business_date, token)`.
- Every query scoped by `hotel_id`, with tests using **two hotels** (repeat bug class).
- Permission enforcement on every route from one table (same as `routePermissions.js`).

### 3.3 Sessions, devices, real-time, notifications
- Login: mobile + password, then **PIN quick-switch** on shared devices. A device token per phone (long-lived, revocable by owner). The number of devices is capped by the outlet's device limit (3.5); the next device past the limit gets "Device limit reached".
- Socket.io `/app` namespace with bearer auth, one room per hotel (+ per kitchen): `orderChanged`, `tableChanged`, `kotFired`, `kotReady`, `qrOrderNew`, `settingsChanged`.
- Push notifications (Firebase FCM) for events that must reach a phone in the pocket: food ready, QR order, bill requested, big discount/cancel for the owner, daily summary.

### 3.4 Printing (on the device) — decision 7.1
- **The phone that sends the KOT prints it itself**, directly to the kitchen's Wi-Fi printer, following the printer settings.
- **Printer settings are separate for each device login.** Each phone/tablet has its own list of printers (Wi-Fi IP, Bluetooth, or built-in) and its own routing: which kitchen/category → which printer, which printer is the invoice printer, paper width, copies. They are stored on the cloud per device (so they survive reinstall/re-login on that device) and edited from that device or by the owner from Devices.
- Printer types: **Wi-Fi/LAN** thermal (TCP 9100), **Bluetooth** thermal (58/80mm), **built-in** printer on Android POS terminals, and PDF share as fallback.
- **Android POS terminals of any brand/model** (decision 7.6: customers use many different terminals, no fixed model). The app can't depend on one vendor SDK, so it uses a **printer driver layer** tried in this order:
  1. **Generic ESC/POS** paths that cover most terminals with no vendor code: the built-in printer exposed as a paired "virtual" Bluetooth printer (common, e.g. "InnerPrinter"), or as a USB printer inside the device (Android USB host), or as a local port.
  2. **Vendor SDK drivers** as plug-ins, only for brands whose printer isn't reachable generically. Start with the common Indian-market brands (Sunmi, PAX, iMin, Telpo…) and add one driver per brand as customers bring new terminals, without changing the rest of the app.
  3. **Android system print** (print service) and **PDF share** as the last fallback, so every terminal can print something on day one.
- **Auto-detect + test:** on first login the app looks for a built-in printer (virtual Bluetooth, USB, known vendor services), suggests it, and prints a test slip. The device's **make/model/Android version and which driver worked** are sent with the device record, so support can see which terminals customers really use and which need a driver.
- One renderer for KOT and invoice (ported from the exe, which is the only KOT renderer today) so all plans print the same.
- KOT routing uses the same category/table/order-type rules as the exe.
- **Print failure never loses a KOT:** the KOT is saved on the cloud first, then printed. If the printer can't be reached (phone not on the outlet Wi-Fi, printer off), the app shows "KOT #12 not printed — Retry / Print on another printer", and the KOT stays in a "Not printed" list. The kitchen tablet (KDS) still gets it.

### 3.5 Plans, device limits and pricing — decision 7.3
- The existing `plan` table (name, price, duration) gets a `product` column (`LOCAL_SUITE` / `CLOUD_APP`) and `default_devices`.
- Each outlet gets `app_device_limit`, filled from its plan's default and **changed only by superadmin** (per outlet, can differ between outlets). Owners see usage ("4 of 6 devices") but cannot change it.
- Proposed Plan 2 tiers (prices are set by you in superadmin; the plan table already holds price):

| Tier | Default devices | For | Includes |
|---|---|---|---|
| **App Lite** | 3 | Small café / QSR | Billing, KOT, KDS, UPI QR, reports, menu, staff |
| **App Standard** | 6 | Normal restaurant | Lite + reservations, QR ordering, cash session, expenses, due ledger |
| **App Pro** | 12 | Large / multi-kitchen | Standard + stock & recipes, multi-outlet dashboard, audit log |

  Extra devices beyond the default: superadmin raises `app_device_limit` (can be sold as an add-on using the existing `extra_login_mobile` price field). A kitchen tablet or token display counts as a device.

### 3.6 Payments — decision 7.5
- **UPI QR only**, no payment gateway. The bill screen shows the outlet's UPI QR with the exact amount (from `hotel.upiId`); the cashier taps **Mark as paid**. Cash, card (on a separate machine), Due and custom modes are recorded manually as today.

---

## 4. Feature list (by role)

Legend: **MVP** = needed for the first pilot outlet · **P2** = second release · **P3** = later.

### 4.1 Everyone
| Feature | Release |
|---|---|
| Login: mobile + password; PIN quick-switch on shared device; logout; session expired → back to login | MVP |
| Role-based home screen and navigation (each role lands where it has access, no "no access" toasts) | MVP |
| No-internet / server-down blocking screen with Retry; drafts kept on the device, nothing is sent until online | MVP |
| Notifications inbox + push | MVP (inbox) / P2 (push) |
| Profile, change PIN/password, app lock (biometric) | MVP / P2 |
| Language: English, Hindi, Gujarati | P3 |

### 4.2 Captain (waiter)
| Feature | Release |
|---|---|
| Table grid by section with live status (Free / Running / Hold / Bill Generated / Reserved), timers, filters | MVP |
| Start order, guests, customer name/mobile | MVP |
| Menu: search (name / short code), categories, veg marks, variants, addons, notes, menu switch, custom item, decimal qty | MVP |
| Cart → Send KOT (rounds), Hold, edit unsent items | MVP |
| Order status: Sent / Ready / Served; "Food ready" alert | MVP |
| Request bill / Print bill (if permitted) | MVP |
| Merge, transfer table, move KOT, cancel (with reason, permission) | MVP |
| Takeaway / delivery order | MVP |
| Accept/reject QR orders per item with reasons | P2 |
| Reservations & waitlist view/create | P2 |

### 4.3 Cashier / Biller
| Feature | Release |
|---|---|
| Counter (quick) billing for QSR: item grid, token, bill in 2 taps | MVP |
| Bill preview with tax, service charge, packaging, delivery charge, round-off | MVP |
| Discount (flat/%) and promo code, within role limit | MVP |
| Settle: cash (with change), UPI (dynamic UPI QR with amount on screen), card, custom modes, **split payment**, Due (customer ledger) | MVP |
| Print / reprint bill and KOT, share bill as PDF/WhatsApp, e-bill (SMS) | MVP / P2 (e-bill) |
| Today's orders, search, order detail, timeline | MVP |
| Edit settled order (special permission), cancel with reason | P2 |
| Due payment collection, customer data | P2 |
| Token display screen (tablet/TV) + token reset | P2 |
| Opening & closing (cash session): open float, cash in/out, close with count & difference | P2 |

### 4.4 Kitchen
| Feature | Release |
|---|---|
| KDS on a tablet per kitchen: new KOT sound, Accept → Preparing → Ready, recall | MVP |
| KOT printed by the sending phone on the kitchen Wi-Fi printer; "Not printed" list with retry | MVP |
| Per-device printer settings (printers, routing, invoice printer, paper width, test print) | MVP |
| Built-in printer on Android POS terminals of any brand (generic ESC/POS + vendor driver plug-ins + system print fallback, auto-detect, test print) | MVP |

### 4.5 Manager
Everything in 4.2–4.4 (as permitted), plus:
| Feature | Release |
|---|---|
| Dashboard (business-day aware): sales, bills, avg bill, payment split, running orders, live tables | P2 |
| Reports: day-wise, item-wise, category-wise, payment mode, tax, discount, KOT, cancelled/void, staff performance, table performance, cash session, expense, purchase, closing stock; date range; export PDF/Excel/share | P2 |
| Menu management: items (with **camera photo**), categories, variants, addons, menus; quick **out-of-stock toggle** | P2 |
| Tables & sections: add (bulk range), edit, QR per table | P2 |
| Expenses: heads, entries with bill photo | P2 |
| Stock: raw materials, units, suppliers, purchase, stock in/out, wastage, recipes, semi-finished, stock reports, **barcode scan** | P3 |

### 4.6 Owner
Everything in 4.5, plus:
| Feature | Release |
|---|---|
| Staff & roles, permission matrix, per-user overrides (owner lock rules) | P2 |
| **Devices & logins**: see logged-in phones, revoke, usage vs limit ("4 of 6"; limit set by superadmin only), view/edit each device's printer settings | MVP |
| Operations settings: tax, calculation/service charge, delivery charge, payment modes, promo codes, invoice format + logo, KOT format, printers, kitchens & routing, display/menu setting, business day & bill reset | P2 |
| Owner alerts: daily summary, cancellation after KOT, discount above limit, cash difference at close | P2 |
| Multi-outlet switch (one owner, many outlets) and combined report | P3 |
| Subscription: plan, expiry, renew in app, e-bill credits, **Request plan change** (creates a ticket for customer care) | P2 |
| Audit log, support ticket / help | P2 / P3 |

The owner has **every** feature in the app (decision 7.2); nothing needs a PC.

### 4.7 Superadmin portal additions (customer care, not in the app)
| Feature | Release |
|---|---|
| Set outlet's product plan and **app device limit** (per outlet) | Phase 0 |
| **Change plan** tool with the checklist in 3.1, driven by "Plan change" tickets | Phase 0 |
| Plan table: `product`, `default_devices` for App Lite / Standard / Pro | Phase 0 |
| See an outlet's devices and revoke one | Phase 0 |

### 4.8 Not in the app (stays where it is)
Superadmin, CRM, franchise/merchant portal, website, exe/sync screens (Plan 2 has no exe), Keyboard billing (replaced by Counter billing).

---

## 5. Roadmap

| Phase | Scope | Exit check |
|---|---|---|
| **0. Foundations (backend)** | Plan flag + enforcement + superadmin Change plan tool (3.1, 4.7); shared bill core ported to cloud, `/app/v1` API with idempotency, locking, bill no/token with the exe's formats and reset rules (3.2); device sessions, per-outlet device limit, bearer sockets, permission middleware (3.3, 3.5); per-device printer settings API + ESC/POS renderer (3.4). Port the exe test suites (bill engine, custom item, QR decisions, KOT routing) to run against the cloud. | Same test inputs give identical totals, bill numbers and KOT routing on exe and cloud; two-hotel isolation tests pass; 2 phones firing on the same table never duplicate. |
| **1. Design (Lovable)** | Full clickable prototype of all MVP + P2 screens with mock data (see `LOVABLE_PROMPT.md`). Owner review. | Owner signs off flows and look. |
| **2. MVP app** | Wrap prototype in Capacitor (same as Captain App), wire 4.1–4.4 MVP rows, Wi-Fi/Bluetooth/built-in terminal printing, UPI QR, devices screen, real-time. Internal alpha, then **pilot at 1–2 real outlets**. | A full service day at the pilot with no duplicate, mismatch or missed KOT. |
| **3. Management (P2)** | Owner/manager rows, push notifications, reports, settings, devices, cash session, QR/reservations. | Owner can run the outlet without any PC. |
| **4. Growth (P3)** | Stock & recipes, multi-outlet, languages, tablet polish, Play Store release. | — |

**Why Capacitor + React (not native Kotlin/Flutter):** Lovable outputs React + Tailwind, the Captain App already proves Lovable → Capacitor → APK works, and the bill engine and screens can be shared with the Web POS and Captain App.

---

## 6. Risks
- **Two sources of truth.** If any Plan 2 bill logic is written separately from the exe's, totals will drift (this has already happened once). Mitigation: the shared core package plus the cross-run tests.
- **Weak mobile internet during rush hour.** Mitigation: idempotent writes, the local draft cart, fast "no internet" feedback, small payloads.
- **Printer and terminal variety** (no fixed terminal model). Mitigation: generic ESC/POS paths first, vendor drivers as plug-ins, system print/PDF fallback, and device model reporting. Before the pilot, collect the terminals the first pilot customers own and test on those. A terminal with no working path gets a driver added, not an app redesign.
- **Phone not on the outlet Wi-Fi** (captain on 4G) → the kitchen printer is unreachable. Mitigation: KOT is saved before printing, "Not printed" list + retry, and the KDS still receives it.
- **Cloud load.** Plan 2 moves every KOT onto the cloud (no exe in front). Check DB indexes, connection pool and socket scaling before the pilot.

---

## 7. Owner decisions (24 Sep 2026)
1. **KOT printing:** the phone that sends the KOT prints directly to the kitchen's Wi-Fi printer, following the printer settings. Printer settings are **separate for each device login** (3.4).
2. **Owner access (confirmed):** a Plan 1 owner uses only Plan 1 (Web POS + Captain App); a Plan 2 owner uses only Plan 2 (the POS App), with **every feature** in it. A Plan 1 login in the POS App gets the "This outlet uses BillerPe Web POS" screen. A Plan 2 outlet can't register an exe or open the Web POS.
3. **Device limits:** tiers proposed in 3.5. The device limit is **per outlet**, can differ between outlets, and **only superadmin can change it**.
4. **Plan change:** allowed. The customer requests it and customer care switches the plan and does the setup (3.1).
5. **Payments:** UPI QR only (3.6).
6. **Android POS terminals:** yes, supported in MVP. Customers use **many different brands/models, no fixed model**, so printing uses the driver layer in 3.4 (generic first, vendor plug-ins, system print fallback) and reports each device's model.
7. **Bill numbers:** same formats and reset rules as the exe.
