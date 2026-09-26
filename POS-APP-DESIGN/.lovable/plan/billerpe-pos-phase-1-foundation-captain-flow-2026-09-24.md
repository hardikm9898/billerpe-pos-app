# BillerPe POS — Phase 1: Foundation + Captain Flow

A mobile-first POS prototype for Indian restaurants, built with demo data only. This phase delivers the login, role-aware app shell, and the full captain (waiter) ordering journey. Billing, kitchen display, dashboards, settings and stock come in later phases.

## What you will be able to do

**Login and shell**
- Splash with the BillerPe mark, then a login screen with two tabs: mobile + password, and a 4-digit PIN pad with "Who's on shift?" staff chips.
- Realistic error states: wrong password, inactive account, device limit reached, subscription expired, wrong plan (Web POS) with a support contact.
- Outlet picker for owners with more than one outlet.
- A clearly labelled DEMO role switcher so you can jump between Owner, Manager, Captain, Cashier and Kitchen.
- Each role lands on its own home and sees its own bottom tab bar. Menus hide anything the role can't use — no "no access" messages.
- "More" grid of modules, and a Profile screen (change PIN/password, app lock, printer status, switch user, logout).
- Top bar with outlet name, live connection dot, notifications bell; blocking "No internet connection" and "Session expired" screens.

**Captain: tables and ordering**
- Tables screen with section tabs, status filter chips with counts, and table cards showing number, status colour, guests, running amount, elapsed time, captain, QR-order and reservation badges. Pull to refresh.
- Long-press a table for actions: transfer, merge, move KOT, change guests, print bill, cancel with reason. Held tables explain why they can't merge.
- Order screen: guests stepper, optional customer details, menu switcher, search by name or short code, category chips (phone) or left rail (tablet), veg/non-veg marks, out-of-stock rows, add button that becomes a quantity stepper, variant/addon sheet with min/max rules and notes, plus custom items.
- Cart as a bottom sheet on phone and a right panel on tablet: sent rounds locked with per-item Sent/Ready/Served chips, editable new round, and Send KOT / Hold / Request bill with a live total preview.
- KOT confirmation with printer name, plus a print-failed state with Retry and "print on another printer", and a "Not printed" badge listing pending KOTs.
- Order status screen for all my running tables, with ready food highlighted.
- Takeaway/Delivery flow with token number, Reservations list and create form, and an Alerts inbox with read/unread.

**Everywhere**
- Loading skeletons, empty states, and error states with Retry on every list.

## Design system

- Brand red #C5202B, soft #FAECED with #941820 text, warm off-white #FAF9F7 background, white cards, #2A1F1C text, #7A6E6A muted, #ECE7E3 borders. Status colours: Free grey, Running red, Hold amber, Bill Generated blue, Reserved violet, Ready green.
- Archivo for headings and numbers, Manrope for body, both bundled locally so the app looks right with no internet.
- 14px card radius, 10px on buttons/inputs, soft shadows, 44px minimum tap targets. Phone-first 360–430px, tablet layouts from 768px. Light mode default with dark mode variables.
- Money as ₹1,234.50 (en-IN), dates as "24 Sep, 6:09 pm", GST 5% split CGST 2.5 / SGST 2.5. Number inputs replace the leading zero, no spinners, no negatives, quantity to 2 decimals.

## Technical notes

- Client-rendered screens only, no backend, no auth provider, no server functions. All demo data.
- One store: `src/lib/pos/store.tsx` exporting `usePos()` (state + async actions like `sendKot`, `holdOrder`, `requestBill`, `transferTable`, `mergeTables`) that can return errors, so real API calls drop in later. Types in `src/lib/pos/types.ts`, demo data in `src/lib/pos/mock.ts`, money/date helpers in `src/lib/pos/format.ts`. Screens import only `usePos()`, never mock data directly.
- Role/permission model in types: modules × view/create/edit/delete plus special permissions (edit after KOT, reopen settled bill, delete order, merge/transfer tables); UI hides disallowed actions.
- Routes under `src/routes` (login, outlet picker, tables, order, orders, takeaway, reservations, alerts, more, profile), each with its own page metadata. Design tokens added to `src/styles.css`; shadcn/ui + lucide-react for components; @fontsource for Archivo and Manrope.
- No persistence of business data; only UI preferences such as the last-selected section.

## Deferred to later phases

Billing and payments, counter billing, KDS, dashboards and reports, setup/settings/printer screens, and stock.
