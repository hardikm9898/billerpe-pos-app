import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { EMPTY_TOTALS, orderLines, previewTotals, resolveMenu } from "./bill";
import {
  NetworkError,
  PlanLockedError,
  type PlanState,
  type DeviceInfo,
  type KotResult,
  type OutletData,
  type PosBackend,
  type Result,
  type Session,
} from "./backend/types";
import { MockBackend, mockNet, resetMockData } from "./backend/mock/server";
import { createHttpBackend } from "./backend/http";
import { Capacitor } from "@capacitor/core";
import { Device as CapDevice } from "@capacitor/device";
import { can, canOpen, canSpecial, effectivePermissions, homeFor } from "./permissions";
import {
  printBillOnDevice,
  printKot,
  setPrintContext,
  setPrinterDriver,
  type KotPrintResult,
} from "./printing";
import { nativeDriver } from "./nativePrinter";
import { pushToken } from "./push";
import type {
  ConnectionState,
  Device,
  Draft,
  DraftLine,
  LoginError,
  MenuCategory,
  MenuItem,
  Order,
  OrderLine,
  OrderTotals,
  OrderType,
  PendingPrint,
  PermissionModule,
  Permissions,
  PosTable,
  SpecialPermission,
  StandardAction,
} from "./types";

// The app's state. Server data (OutletData) comes only from the backend;
// this device keeps just its own things: unsent carts (drafts), the "Not
// printed" list, UI preferences and the session. Every write goes to the
// backend and the data is reloaded, so all devices see one truth.

const LS = {
  device: "billerpe.deviceId",
  drafts: "billerpe.drafts.v2",
  pending: "billerpe.pendingPrints",
  section: "billerpe.lastSection",
  session: "billerpe.session",
  appLock: "billerpe.appLock",
  shift: "billerpe.shiftStaff",
};

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked: keep working in memory */
  }
};
/**
 * Rank order once, for every screen (owner bug list item 16): sections and
 * menu categories by rank, tables by their section's rank (keeping their
 * own order inside a section).
 */
function inRankOrder(d: OutletData): OutletData {
  const byRank = <T extends { rank: number; name: string }>(a: T, b: T) =>
    a.rank - b.rank || a.name.localeCompare(b.name);
  const sections = [...d.sections].sort(byRank);
  const pos = new Map(sections.map((s, i) => [s.id, i]));
  return {
    ...d,
    sections,
    categories: [...d.categories].sort(byRank),
    tables: [...d.tables].sort(
      (a, b) => (pos.get(a.sectionId) ?? 1e9) - (pos.get(b.sectionId) ?? 1e9),
    ),
  };
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

// The cloud (VITE_API_BASE_URL, e.g. https://api.billerpe.com) in a real
// build; without it the in-browser demo backend with the same rules.
const API_BASE = (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.trim() || "";
const http = API_BASE ? createHttpBackend(API_BASE) : null;
export const backend: PosBackend = http ?? new MockBackend();
export const isMockBackend = !http;
export const APP_VERSION = "1.2.1";

// On a phone the real printer driver; in the browser the simulated one.
if (Capacitor.isNativePlatform()) setPrinterDriver(nativeDriver);

function deviceInfo(): DeviceInfo {
  // The demo backend knows this browser as the seeded "Counter tablet".
  let id = read<string | null>(LS.device, null);
  if (!id) {
    id = isMockBackend ? "dev-this" : uid();
    write(LS.device, id);
  }
  return {
    deviceId: id,
    name: isMockBackend ? "Counter tablet" : "Phone",
    make: "Browser",
    model: navigator.userAgent.includes("Android") ? "Android" : "Web",
    android: "-",
    appVersion: APP_VERSION,
  };
}

/** On a phone: the real make / model / Android version (shown on the Devices screen). */
async function nativeDeviceInfo(base: DeviceInfo): Promise<DeviceInfo> {
  if (!Capacitor.isNativePlatform()) return base;
  try {
    const info = await CapDevice.getInfo();
    return {
      ...base,
      name: info.name || `${info.manufacturer} ${info.model}`.trim() || base.name,
      make: info.manufacturer || base.make,
      model: info.model || base.model,
      android: info.osVersion || base.android,
    };
  } catch {
    return base;
  }
}

export interface ShiftStaff {
  id: string;
  name: string;
  role: string;
}

export interface SendResult {
  ok: boolean;
  error?: string | undefined;
  kot?: KotResult | undefined;
  print?: KotPrintResult | undefined;
}

interface PosCtx {
  booting: boolean;
  connection: ConnectionState;
  sessionExpired: boolean;
  session: Session | null;
  data: OutletData | null;
  drafts: Record<string, Draft>;
  pendingPrints: PendingPrint[];
  lastSectionId: string | null;
  appLock: boolean;
  shiftStaff: ShiftStaff[];

  /* derived */
  permissions: Permissions;
  can: (m: PermissionModule, a?: StandardAction) => boolean;
  canSpecial: (k: SpecialPermission) => boolean;
  canOpen: (path: string) => boolean;
  home: string;
  thisDevice: Device | undefined;
  unreadAlerts: number;

  /* lookups */
  tableById: (id: string | undefined) => PosTable | undefined;
  orderById: (id: string | undefined) => Order | undefined;
  orderForTable: (tableId: string) => Order | undefined;
  categoriesFor: (menuId: string) => MenuCategory[];
  itemsFor: (menuId: string) => MenuItem[];
  menuFor: (type: OrderType, tableId?: string) => string;

  /* session */
  loginWithPassword: (
    mobile: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: LoginError | undefined; message?: string | undefined }>;
  loginWithPin: (
    staffId: string,
    pin: string,
  ) => Promise<{ ok: boolean; error?: LoginError | undefined; message?: string | undefined }>;
  logout: () => Promise<void>;
  lockToPin: () => void;
  reload: () => Promise<void>;
  retryConnection: () => Promise<void>;
  dismissSessionExpired: () => void;
  setLastSection: (id: string) => void;
  setAppLock: (on: boolean) => void;

  /* the outlet's BillerPe plan (lock screen + grace banner) */
  plan: PlanState | null;
  planLocked: boolean;
  refreshPlan: () => Promise<PlanState | null>;
  extendPlan: () => Promise<{ ok: boolean; error?: string | undefined }>;
  planPayLink: () => Promise<{ ok: boolean; url?: string | undefined; amount?: number | undefined; error?: string | undefined }>;

  /* drafts (this device's unsent carts) */
  draftKeyForTable: (tableId: string) => string;
  openDraft: (
    key: string,
    init: {
      type: OrderType;
      tableId?: string | undefined;
      orderId?: string | undefined;
      guests?: number | undefined;
    },
  ) => Draft;
  draft: (key: string) => Draft | undefined;
  updateDraft: (key: string, fn: (d: Draft) => Draft) => void;
  addLine: (key: string, line: Omit<DraftLine, "key">) => void;
  setLineQty: (key: string, lineKey: string, qty: number) => void;
  setLineNote: (key: string, lineKey: string, note: string) => void;
  removeDraftLine: (key: string, lineKey: string) => void;
  discardDraft: (key: string) => void;
  preview: (key: string) => OrderTotals;

  /* order actions */
  sendKot: (key: string) => Promise<SendResult>;
  hold: (key: string) => Promise<Result<{ orderId: string; billNo: string }>>;
  /** Bill straight from the cart - no KOT needed first (Web POS). */
  billFromCart: (
    key: string,
    opts: { print?: boolean | undefined; request?: boolean | undefined },
  ) => Promise<{
    ok: boolean;
    error?: string | undefined;
    orderId?: string | undefined;
    print?: KotPrintResult | undefined;
  }>;
  printBill: (
    orderId: string,
  ) => Promise<{ ok: boolean; error?: string | undefined; print?: KotPrintResult | undefined }>;
  reprintKot: (orderId: string, kotNo: number) => Promise<KotPrintResult & { ok: boolean }>;
  retryPending: (id: string) => Promise<boolean>;
  dropPending: (id: string) => void;
  counterSave: (input: {
    type: OrderType;
    tableId?: string | undefined;
    lines: DraftLine[];
    customerName?: string | undefined;
    customerMobile?: string | undefined;
  }) => Promise<SendResult & { orderId?: string | undefined }>;
  /** Any other backend call: runs it, handles offline / session end, reloads. */
  act: <T extends object>(fn: (b: PosBackend) => Promise<Result<T>>) => Promise<Result<T>>;
}

const Ctx = createContext<PosCtx | null>(null);

/** Still on its table / in the kitchen: running, held or billed (not settled or cancelled). */
const isOpen = (o: Order | undefined) =>
  o?.status === "running" || o?.status === "hold" || o?.status === "billed";

export function PosProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [connection, setConnection] = useState<ConnectionState>("online");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<OutletData | null>(null);
  // Empty carts left behind (opened a table, added nothing) are dropped on start.
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      Object.entries(read<Record<string, Draft>>(LS.drafts, {})).filter(
        ([, d]) => d.lines.length > 0 || d.orderId,
      ),
    ),
  );
  const [pendingPrints, setPending] = useState<PendingPrint[]>(() => read(LS.pending, []));
  const [lastSectionId, setSection] = useState<string | null>(() => read(LS.section, null));
  const [appLock, setAppLockState] = useState<boolean>(() => read(LS.appLock, false));
  const [shiftStaff, setShift] = useState<ShiftStaff[]>(() => read(LS.shift, []));
  const device = useRef(deviceInfo());
  useEffect(() => {
    void nativeDeviceInfo(device.current).then((d) => (device.current = d));
    // Switching outlet gives a new session (token + this person's staff row there).
    if (http) {
      http.onSessionChange = (s) => {
        setSession(s);
        write(LS.session, s.token);
      };
      http.onPlanLocked = (p) => setPlan(p ? { ...p, expired: true } : ({ outlet: "", endsAt: null, paidUntil: null, expired: true, inGrace: false, graceUsed: false, canExtend: false, daysLeft: null, message: null } as PlanState));
    }
  }, []);

  useEffect(() => write(LS.drafts, drafts), [drafts]);
  // An empty cart that points at an order which is no longer open (settled,
  // cancelled, or gone) is dropped: otherwise the next time the table is
  // opened it shows "Bill N is settled" (owner, 2026-09-29). A cart with
  // unsent items is kept so the order screen can say what happened.
  useEffect(() => {
    if (!data) return;
    setDrafts((all) => {
      const stale = Object.values(all).filter(
        (d) => d.orderId && !d.lines.length && !isOpen(data.orders.find((o) => o.id === d.orderId)),
      );
      if (!stale.length) return all;
      const next = { ...all };
      for (const d of stale) delete next[d.key];
      return next;
    });
  }, [data]);
  // Receipts need the outlet's name, formats and tables.
  useEffect(() => {
    setPrintContext(
      data ? { outlet: data.outlet, settings: data.settings, tables: data.tables } : null,
    );
  }, [data]);
  useEffect(() => write(LS.pending, pendingPrints), [pendingPrints]);

  const onError = useCallback((e: unknown): { ok: false; error: string } => {
    if (e instanceof NetworkError) {
      setConnection("offline");
      return { ok: false, error: "No internet connection" };
    }
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }, []);

  const reload = useCallback(async () => {
    try {
      const d = await backend.load();
      setData(inRankOrder(d));
      setConnection("online");
    } catch (e) {
      if (e instanceof NetworkError) setConnection("offline");
      else if (e instanceof PlanLockedError) return;
      else if (e instanceof Error && /session/i.test(e.message)) setSessionExpired(true);
      else console.error(e);
    }
  }, []);

  /** The plan as the cloud has it now (the demo backend has no plan). */
  const refreshPlan = useCallback(async () => {
    if (!http) return null;
    try {
      const r = (await http.call("planStatus", [])) as { ok: boolean } & Partial<PlanState>;
      if (!r.ok) return null;
      const { ok: _ok, ...p } = r;
      setPlan(p as PlanState);
      return p as PlanState;
    } catch {
      return null;
    }
  }, []);

  // App start: resume the saved session (the server confirms the token and device).
  useEffect(() => {
    const token = read<string | null>(LS.session, null);
    void (async () => {
      if (token) {
        const r = await backend.resume(token, device.current);
        if (r.ok && r.session) {
          setSession(r.session);
          await refreshPlan();
          await reload();
        } else if (r.error === "network") {
          setConnection("offline");
        } else {
          write(LS.session, null);
        }
      }
      setBooting(false);
    })();
  }, [reload, refreshPlan]);

  // The plan's end can pass while the app is open: look again every 10 minutes.
  useEffect(() => {
    if (!session || !http) return;
    const id = setInterval(() => void refreshPlan(), 600000);
    return () => clearInterval(id);
  }, [session, refreshPlan]);

  // Live updates: other phones' KOTs, the kitchen marking food ready, a QR
  // round... The cloud gives a cheap fingerprint of the outlet's state; the
  // full reload runs only when it changes. The demo backend just reloads.
  const lastVersion = useRef("");
  useEffect(() => {
    if (!session) return;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        if (!http) {
          if (connection !== "offline") await reload();
          return;
        }
        const v = await http.version();
        if (connection === "offline") setConnection("online");
        if (v && v !== lastVersion.current) {
          lastVersion.current = v;
          await reload();
        }
      } catch (e) {
        if (e instanceof NetworkError) setConnection("offline");
        else if (e instanceof PlanLockedError) return;
        else if (e instanceof Error && /session/i.test(e.message)) setSessionExpired(true);
      } finally {
        busy = false;
      }
    };
    const id = setInterval(() => void tick(), http ? 4000 : 8000);
    return () => clearInterval(id);
  }, [session, connection, reload]);

  const permissions = useMemo(
    () =>
      effectivePermissions(
        session ? (data?.staff.find((s) => s.id === session.user.id) ?? session.user) : null,
        data?.roleDefaults ?? ({} as OutletData["roleDefaults"]),
      ),
    [session, data],
  );

  // Deactivated while signed in, or removed: back to login.
  useEffect(() => {
    if (!session || !data) return;
    const me = data.staff.find((s) => s.id === session.user.id);
    if (!me || !me.active) setSessionExpired(true);
    if (!data.devices.some((d) => d.id === device.current.deviceId)) setSessionExpired(true);
  }, [session, data]);

  const afterLogin = useCallback(
    async (r: Awaited<ReturnType<PosBackend["loginWithPassword"]>>) => {
      if (!r.ok || !r.session) return { ok: false, error: r.error, message: r.message };
      setSession(r.session);
      setSessionExpired(false);
      write(LS.session, r.session.token);
      await refreshPlan();
      await reload();
      const shift = await backend.shiftStaff();
      setShift(shift);
      write(LS.shift, shift);
      return { ok: true };
    },
    [reload, refreshPlan],
  );

  const loginWithPassword = useCallback<PosCtx["loginWithPassword"]>(
    async (mobile, password) =>
      afterLogin(await backend.loginWithPassword(mobile, password, device.current)),
    [afterLogin],
  );
  const loginWithPin = useCallback<PosCtx["loginWithPin"]>(
    async (staffId, pin) => afterLogin(await backend.loginWithPin(staffId, pin, device.current)),
    [afterLogin],
  );

  const logout = useCallback(async () => {
    // A logged-out phone stops getting this outlet's pushes (best effort: offline is fine).
    if (pushToken()) await backend.setPushToken(null).catch(() => undefined);
    await backend.logout();
    setSession(null);
    setData(null);
    setPlan(null);
    write(LS.session, null);
  }, []);

  const act = useCallback<PosCtx["act"]>(
    async (fn) => {
      try {
        const r = await fn(backend);
        if (!r.ok && /session has ended/i.test(r.error)) setSessionExpired(true);
        await reload();
        return r;
      } catch (e) {
        return onError(e);
      }
    },
    [reload, onError],
  );

  /* ------------------------------ lookups ------------------------------ */

  const tableById = useCallback(
    (id: string | undefined) => (id ? data?.tables.find((t) => t.id === id) : undefined),
    [data],
  );
  const orderById = useCallback(
    (id: string | undefined) => (id ? data?.orders.find((o) => o.id === id) : undefined),
    [data],
  );
  const orderForTable = useCallback(
    (tableId: string) => data?.orders.find((o) => o.tableId === tableId && isOpen(o)),
    [data],
  );
  const categoriesFor = useCallback(
    (menuId: string) =>
      (data?.categories ?? [])
        .filter((c) => c.menuId === menuId && c.active)
        .sort((a, b) => a.rank - b.rank),
    [data],
  );
  const itemsFor = useCallback(
    (menuId: string) => (data?.items ?? []).filter((i) => i.menuId === menuId && i.active),
    [data],
  );
  const menuFor = useCallback(
    (type: OrderType, tableId?: string) =>
      resolveMenu(data?.menus ?? [], tableById(tableId), type)?.id ?? "",
    [data, tableById],
  );
  const thisDevice = data?.devices.find((d) => d.id === device.current.deviceId);

  /* ------------------------------ drafts ------------------------------ */

  const draftKeyForTable = (tableId: string) => `t.${tableId}`;

  const heldToDraft = (l: OrderLine): DraftLine => ({
    key: l.id,
    itemId: l.itemId,
    name: l.name,
    categoryId: l.categoryId,
    dietary: l.dietary,
    variantId: l.variantId,
    variantName: l.variantName,
    addons: l.addons,
    note: l.note,
    price: l.price,
    qty: l.qty,
    custom: l.custom,
    routeKitchenId: l.routeKitchenId,
    routePrinterId: l.routePrinterId,
  });

  const openDraft = useCallback<PosCtx["openDraft"]>(
    (key, init) => {
      let existing = drafts[key];
      // An empty cart left linked to a closed order starts over (see the prune above).
      if (existing?.orderId && !existing.lines.length && !isOpen(orderById(existing.orderId)))
        existing = undefined;
      const order = init.orderId
        ? orderById(init.orderId)
        : init.tableId
          ? orderForTable(init.tableId)
          : undefined;
      // A held order's items come back into the cart - also when this phone
      // already has an (empty) cart for the table: Hold drops the cart and
      // the open order screen makes a new one before the reload with the
      // held items arrives (owner bug list 2026-09-26: held items missing).
      if (existing && existing.lines.length === 0 && order?.heldLines.length) {
        const refreshed: Draft = {
          ...existing,
          orderId: order.id,
          guests: order.guests || existing.guests,
          lines: order.heldLines.map(heldToDraft),
        };
        setDrafts((all) => ({ ...all, [key]: refreshed }));
        return refreshed;
      }
      if (existing) return existing;
      const d: Draft = {
        key,
        type: init.type,
        tableId: init.tableId,
        orderId: order?.id,
        // Dine-in starts at 1 guest (owner, 2026-09-26); changed on the order screen.
        guests: order?.guests ?? init.guests ?? (init.type === "dinin" ? 1 : 0),
        customerName: order?.customerName ?? "",
        customerMobile: order?.customerMobile ?? "",
        customerAddress: order?.customerAddress,
        customerGstin: order?.customerGstin,
        menuId: order?.menuId ?? menuFor(init.type, init.tableId),
        // A held order's saved lines come back into the cart, editable.
        lines: order?.heldLines.map(heldToDraft) ?? [],
        updatedAt: new Date().toISOString(),
      };
      setDrafts((all) => ({ ...all, [key]: d }));
      return d;
    },
    [drafts, orderById, orderForTable, menuFor],
  );

  const updateDraft = useCallback((key: string, fn: (d: Draft) => Draft) => {
    setDrafts((all) =>
      all[key] ? { ...all, [key]: { ...fn(all[key]!), updatedAt: new Date().toISOString() } } : all,
    );
  }, []);

  const sameLine = (a: Omit<DraftLine, "key">, b: DraftLine) =>
    !a.custom &&
    !b.custom &&
    a.itemId === b.itemId &&
    a.variantId === b.variantId &&
    (a.note ?? "") === (b.note ?? "") &&
    a.addons
      .map((x) => x.id)
      .sort()
      .join() ===
      b.addons
        .map((x) => x.id)
        .sort()
        .join();

  const addLine = useCallback<PosCtx["addLine"]>(
    (key, line) =>
      updateDraft(key, (d) => {
        const match = d.lines.find((l) => sameLine(line, l));
        return match
          ? {
              ...d,
              lines: d.lines.map((l) =>
                l === match ? { ...l, qty: Math.round((l.qty + line.qty) * 100) / 100 } : l,
              ),
            }
          : { ...d, lines: [...d.lines, { ...line, key: uid() }] };
      }),
    [updateDraft],
  );
  const setLineQty = useCallback<PosCtx["setLineQty"]>(
    (key, lineKey, qty) =>
      updateDraft(key, (d) => ({
        ...d,
        // Owner rule: below the minimum on an unsent line, or 0, removes it.
        lines:
          qty <= 0
            ? d.lines.filter((l) => l.key !== lineKey)
            : d.lines.map((l) =>
                l.key === lineKey ? { ...l, qty: Math.round(qty * 100) / 100 } : l,
              ),
      })),
    [updateDraft],
  );
  const setLineNote = useCallback<PosCtx["setLineNote"]>(
    (key, lineKey, note) =>
      updateDraft(key, (d) => ({
        ...d,
        lines: d.lines.map((l) =>
          l.key === lineKey ? { ...l, note: note.trim() || undefined } : l,
        ),
      })),
    [updateDraft],
  );
  const removeDraftLine = useCallback<PosCtx["removeDraftLine"]>(
    (key, lineKey) =>
      updateDraft(key, (d) => ({ ...d, lines: d.lines.filter((l) => l.key !== lineKey) })),
    [updateDraft],
  );
  const discardDraft = useCallback(
    (key: string) => setDrafts(({ [key]: _gone, ...rest }) => rest),
    [],
  );

  const preview = useCallback<PosCtx["preview"]>(
    (key) => {
      const d = drafts[key];
      if (!data || !d) return EMPTY_TOTALS;
      const order = orderById(d.orderId) ?? (d.tableId ? orderForTable(d.tableId) : undefined);
      // Held lines are already in the cart: preview fired lines + the cart.
      const base = order ? { ...order, heldLines: [] } : undefined;
      return previewTotals(data.settings, {
        order: base,
        type: d.type,
        sectionId: tableById(d.tableId)?.sectionId,
        draftLines: d.lines,
      });
    },
    [drafts, data, orderById, orderForTable, tableById],
  );

  /* ------------------------------ printing ------------------------------ */

  const recordFailures = useCallback(
    (order: Order, kotNo: number, res: KotPrintResult) => {
      const failed = res.outcomes.filter((o) => !o.ok);
      if (!failed.length) return;
      const label = order.tableId
        ? (tableById(order.tableId)?.name ?? "Table")
        : `Token ${order.token}`;
      setPending((p) => [
        ...failed.map((f) => ({
          id: uid(),
          orderId: order.id,
          kotNo,
          label,
          printerId: f.printer.id,
          printerName: f.printer.name,
          at: new Date().toISOString(),
          error: f.error ?? "Could not print",
        })),
        ...p,
      ]);
    },
    [tableById],
  );

  /** Every call needs a one-time key; a retry of the same cart reuses it. */
  const cartKeys = useRef<Record<string, string>>({});

  const sendKot = useCallback<PosCtx["sendKot"]>(
    async (key) => {
      const d = drafts[key];
      if (!d || d.lines.length === 0) return { ok: false, error: "Add at least one item" };
      cartKeys.current[key] ??= uid();
      try {
        const r = await backend.sendKot({
          orderId: d.orderId,
          type: d.type,
          tableId: d.tableId,
          guests: d.guests,
          customerName: d.customerName,
          customerMobile: d.customerMobile,
          customerAddress: d.customerAddress,
          customerGstin: d.customerGstin,
          menuId: d.menuId,
          lines: d.lines,
          clientKey: cartKeys.current[key]!,
        });
        if (!r.ok) {
          await reload();
          return { ok: false, error: r.error };
        }
        delete cartKeys.current[key];
        // The KOT is saved; the cart is done. Printing can only fail "softly" now.
        setDrafts(({ [key]: _sent, ...rest }) => rest);
        const fresh = await backend.load().catch(() => null);
        if (fresh) setData(inRankOrder(fresh));
        const order = fresh?.orders.find((o) => o.id === r.orderId);
        const table = fresh?.tables.find((t) => t.id === order?.tableId);
        const print = order
          ? await printKot(
              fresh?.devices.find((x) => x.id === device.current.deviceId),
              order,
              r.kot,
              table,
            )
          : undefined;
        if (order && print) recordFailures(order, r.kot.kotNo, print);
        return { ok: true, kot: r, print };
      } catch (e) {
        return onError(e);
      }
    },
    [drafts, reload, onError, recordFailures],
  );

  const hold = useCallback<PosCtx["hold"]>(
    async (key) => {
      const d = drafts[key];
      if (!d || d.lines.length === 0) return { ok: false, error: "Add at least one item to hold" };
      cartKeys.current[key] ??= uid();
      try {
        const r = await backend.holdOrder({
          orderId: d.orderId,
          type: d.type,
          tableId: d.tableId,
          guests: d.guests,
          customerName: d.customerName,
          customerMobile: d.customerMobile,
          customerAddress: d.customerAddress,
          customerGstin: d.customerGstin,
          menuId: d.menuId,
          lines: d.lines,
          clientKey: cartKeys.current[key]!,
        });
        if (r.ok) {
          delete cartKeys.current[key];
          setDrafts(({ [key]: _held, ...rest }) => rest);
        }
        await reload();
        return r;
      } catch (e) {
        return onError(e);
      }
    },
    [drafts, reload, onError],
  );

  const billFromCart = useCallback<PosCtx["billFromCart"]>(
    async (key, opts) => {
      const d = drafts[key];
      const orderId = d?.orderId;
      try {
        let r: Awaited<ReturnType<PosBackend["printBill"]>>;
        if (d && d.lines.length) {
          // Items only on this phone: saved on the order with the bill, no KOT.
          cartKeys.current[key] ??= uid();
          r = await backend.billCart(
            {
              orderId: d.orderId,
              type: d.type,
              tableId: d.tableId,
              guests: d.guests,
              customerName: d.customerName,
              customerMobile: d.customerMobile,
              customerAddress: d.customerAddress,
              customerGstin: d.customerGstin,
              menuId: d.menuId,
              lines: d.lines,
              clientKey: cartKeys.current[key]!,
            },
            { request: Boolean(opts.request) },
          );
          if (r.ok) {
            delete cartKeys.current[key];
            setDrafts(({ [key]: _billed, ...rest }) => rest);
          }
        } else if (orderId) {
          r = opts.request
            ? ((await backend.requestBill(orderId)) as typeof r)
            : await backend.printBill(orderId);
        } else return { ok: false, error: "Add items to the order first" };
        await reload();
        if (!r.ok) return r;
        const print =
          opts.print && r.order
            ? await printBillOnDevice(thisDevice, r.order, r.kotLines)
            : undefined;
        return { ok: true, orderId: r.order?.id ?? orderId, print };
      } catch (e) {
        return onError(e);
      }
    },
    [drafts, reload, onError, thisDevice],
  );

  const printBill = useCallback<PosCtx["printBill"]>(
    async (orderId) => {
      try {
        const r = await backend.printBill(orderId);
        await reload();
        if (!r.ok) return r;
        const print = await printBillOnDevice(thisDevice, r.order, r.kotLines);
        return { ok: true, print };
      } catch (e) {
        return onError(e);
      }
    },
    [reload, onError, thisDevice],
  );

  const reprintKot = useCallback<PosCtx["reprintKot"]>(
    async (orderId, kotNo) => {
      const order = orderById(orderId);
      const kot = order?.kots.find((k) => k.kotNo === kotNo);
      if (!order || !kot) return { ok: false, noPrinter: true, outcomes: [] };
      const res = await printKot(thisDevice, order, kot, tableById(order.tableId));
      void act((b) => b.logReprint(orderId, `KOT #${kotNo}`));
      return { ok: !res.noPrinter && res.outcomes.every((o) => o.ok), ...res };
    },
    [orderById, thisDevice, tableById, act],
  );

  const retryPending = useCallback<PosCtx["retryPending"]>(
    async (id) => {
      const p = pendingPrints.find((x) => x.id === id);
      const order = orderById(p?.orderId);
      const kot = order?.kots.find((k) => k.kotNo === p?.kotNo);
      if (!p || !order || !kot) {
        setPending((all) => all.filter((x) => x.id !== id));
        return false;
      }
      const printer = thisDevice?.printers.find((x) => x.id === p.printerId);
      if (!printer) return false;
      const res = await printKot(
        { ...thisDevice!, printers: [printer] },
        order,
        kot,
        tableById(order.tableId),
      );
      const ok = !res.noPrinter && res.outcomes.every((o) => o.ok);
      if (ok) setPending((all) => all.filter((x) => x.id !== id));
      return ok;
    },
    [pendingPrints, orderById, thisDevice, tableById],
  );

  const counterSave = useCallback<PosCtx["counterSave"]>(
    async (input) => {
      const k = `counter:${JSON.stringify(input.lines.map((l) => [l.itemId, l.qty]))}:${input.type}`;
      cartKeys.current[k] ??= uid();
      try {
        const r = await backend.counterOrder({
          ...input,
          menuId: menuFor(input.type, input.tableId),
          clientKey: cartKeys.current[k]!,
        });
        if (!r.ok) {
          await reload();
          return { ok: false, error: r.error };
        }
        delete cartKeys.current[k];
        const fresh = await backend.load().catch(() => null);
        if (fresh) setData(inRankOrder(fresh));
        const order = fresh?.orders.find((o) => o.id === r.orderId);
        const print = order
          ? await printKot(
              fresh?.devices.find((x) => x.id === device.current.deviceId),
              order,
              r.kot,
              fresh?.tables.find((t) => t.id === order.tableId),
            )
          : undefined;
        if (order && print) recordFailures(order, r.kot.kotNo, print);
        return { ok: true, kot: r, print, orderId: r.orderId };
      } catch (e) {
        return onError(e);
      }
    },
    [menuFor, reload, onError, recordFailures],
  );

  /* ------------------------------ value ------------------------------ */

  const extendPlan = useCallback<PosCtx["extendPlan"]>(async () => {
    if (!http) return { ok: false, error: "Not on the demo." };
    try {
      const r = (await http.call("planExtend", [])) as { ok: boolean; error?: string; state?: PlanState };
      if (!r.ok) return { ok: false, error: r.error };
      if (r.state) setPlan(r.state);
      await reload();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof NetworkError ? "No internet connection" : "Something went wrong. Please try again." };
    }
  }, [reload]);

  const planPayLink = useCallback<PosCtx["planPayLink"]>(async () => {
    if (!http) return { ok: false, error: "Not on the demo." };
    try {
      return (await http.call("planPayLink", [])) as { ok: boolean; url?: string; amount?: number; error?: string };
    } catch (e) {
      return { ok: false, error: e instanceof NetworkError ? "No internet connection" : "Something went wrong. Please try again." };
    }
  }, []);

  const value: PosCtx = {
    plan,
    planLocked: !!plan?.expired,
    refreshPlan,
    extendPlan,
    planPayLink,
    booting,
    connection,
    sessionExpired,
    session,
    data,
    drafts,
    pendingPrints,
    lastSectionId,
    appLock,
    shiftStaff,
    permissions,
    can: (m, a = "view") => can(permissions, m, a),
    canSpecial: (k) => canSpecial(permissions, k),
    canOpen: (path) => canOpen(permissions, path),
    home: session
      ? homeFor(data?.staff.find((s) => s.id === session.user.id) ?? session.user, permissions)
      : "/",
    thisDevice,
    unreadAlerts: data?.alerts.filter((a) => !a.read).length ?? 0,
    tableById,
    orderById,
    orderForTable,
    categoriesFor,
    itemsFor,
    menuFor,
    loginWithPassword,
    loginWithPin,
    logout,
    // Switch user: back to the PIN pad; this device stays registered.
    lockToPin: () => {
      void backend.logout();
      setSession(null);
      setData(null);
      write(LS.session, null);
    },
    reload,
    retryConnection: async () => {
      setConnection("reconnecting");
      mockNet.offline = false;
      await reload();
    },
    dismissSessionExpired: () => {
      setSessionExpired(false);
      void logout();
    },
    setLastSection: (id) => {
      setSection(id);
      write(LS.section, id);
    },
    setAppLock: (on) => {
      setAppLockState(on);
      write(LS.appLock, on);
    },
    draftKeyForTable,
    openDraft,
    draft: (key) => drafts[key],
    updateDraft,
    addLine,
    setLineQty,
    setLineNote,
    removeDraftLine,
    discardDraft,
    preview,
    sendKot,
    hold,
    printBill,
    billFromCart,
    reprintKot,
    retryPending,
    dropPending: (id) => setPending((all) => all.filter((x) => x.id !== id)),
    counterSave,
    act,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePos(): PosCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePos must be used inside <PosProvider>");
  return ctx;
}

/** Demo-only switches (the DEMO menu). */
export const demo = {
  setOffline(on: boolean) {
    mockNet.offline = on;
  },
  reset() {
    resetMockData();
    try {
      localStorage.removeItem(LS.drafts);
      localStorage.removeItem(LS.pending);
    } catch {
      /* ignore */
    }
    location.reload();
  },
};

export type { OrderLine };
