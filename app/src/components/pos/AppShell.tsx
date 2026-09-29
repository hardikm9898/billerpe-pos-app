import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Boxes,
  CalendarClock,
  ChefHat,
  ClipboardList,
  Contact,
  CreditCard,
  Grid2x2,
  History,
  Home,
  LayoutGrid,
  LifeBuoy,
  ListOrdered,
  LogIn,
  MonitorSmartphone,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  RotateCcw,
  Settings,
  ShoppingBag,
  Smartphone,
  Store,
  Table2,
  TimerReset,
  User,
  Users,
  Wallet,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/pos/i18n";
import { demo, isMockBackend, usePos } from "@/lib/pos/store";
import type { Role } from "@/lib/pos/types";
import { Logo } from "./primitives";
import { ResponsiveSheet } from "./ResponsiveSheet";

interface TabDef {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: "alerts" | "pending" | undefined;
}

// Bottom tabs per role. A tab the user cannot open (their permissions were
// changed) is simply not shown - never a "no access" message.
const TABS: Record<Role, TabDef[]> = {
  Owner: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/tables", label: "Tables", icon: Table2 },
    { to: "/orders", label: "Orders", icon: ClipboardList, badge: "pending" },
    { to: "/reports", label: "Reports", icon: Receipt },
    { to: "/more", label: "More", icon: Grid2x2 },
  ],
  Manager: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/tables", label: "Tables", icon: Table2 },
    { to: "/orders", label: "Orders", icon: ClipboardList, badge: "pending" },
    { to: "/reports", label: "Reports", icon: Receipt },
    { to: "/more", label: "More", icon: Grid2x2 },
  ],
  Captain: [
    { to: "/tables", label: "Tables", icon: Table2 },
    { to: "/takeaway", label: "Pickup", icon: ShoppingBag },
    { to: "/status", label: "Status", icon: ListOrdered, badge: "pending" },
    { to: "/alerts", label: "Alerts", icon: Bell, badge: "alerts" },
    { to: "/more", label: "More", icon: Grid2x2 },
  ],
  Cashier: [
    { to: "/counter", label: "Counter", icon: LayoutGrid },
    { to: "/tables", label: "Tables", icon: Table2 },
    { to: "/orders", label: "Orders", icon: ClipboardList, badge: "pending" },
    { to: "/cash", label: "Cash", icon: Wallet },
    { to: "/more", label: "More", icon: Grid2x2 },
  ],
  "Kitchen Staff": [],
  "Inventory Manager": [
    { to: "/stock", label: "Stock", icon: Boxes },
    { to: "/stock/purchases", label: "Purchases", icon: ShoppingBag },
    { to: "/reports", label: "Reports", icon: Receipt },
    { to: "/more", label: "More", icon: Grid2x2 },
  ],
  Accountant: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/reports", label: "Reports", icon: Receipt },
    { to: "/expenses", label: "Expenses", icon: Wallet },
    { to: "/due", label: "Due", icon: Contact },
    { to: "/more", label: "More", icon: Grid2x2 },
  ],
};

/** Everything reachable from "More", shown only when the user can open it. */
export const moreModules: { to: string; label: string; icon: LucideIcon; group: string }[] = [
  { to: "/orders", label: "Orders", icon: ClipboardList, group: "Service" },
  { to: "/status", label: "Order status", icon: ListOrdered, group: "Service" },
  { to: "/takeaway", label: "Pickup orders", icon: ShoppingBag, group: "Service" },
  { to: "/counter", label: "Counter billing", icon: LayoutGrid, group: "Service" },
  { to: "/qr-orders", label: "QR orders", icon: QrCode, group: "Service" },
  { to: "/reservations", label: "Reservations", icon: CalendarClock, group: "Service" },
  { to: "/queue", label: "Waitlist", icon: TimerReset, group: "Service" },
  { to: "/kds", label: "Kitchen display", icon: ChefHat, group: "Service" },
  { to: "/tokens", label: "Token display", icon: MonitorSmartphone, group: "Service" },
  { to: "/due", label: "Due ledger", icon: Wallet, group: "Money" },
  { to: "/customers", label: "Customers", icon: Contact, group: "Money" },
  { to: "/cash", label: "Cash session", icon: Wallet, group: "Money" },
  { to: "/expenses", label: "Expenses", icon: Receipt, group: "Money" },
  { to: "/reports", label: "Reports", icon: Receipt, group: "Money" },
  { to: "/stock", label: "Stock", icon: Boxes, group: "Setup" },
  { to: "/menu", label: "Menu", icon: BookOpen, group: "Setup" },
  { to: "/tables-setup", label: "Tables setup", icon: Table2, group: "Setup" },
  { to: "/staff", label: "Staff", icon: Users, group: "Setup" },
  { to: "/outlet", label: "Outlet details", icon: Store, group: "Setup" },
  { to: "/settings", label: "Settings", icon: Settings, group: "Setup" },
  { to: "/printers", label: "Printers", icon: Printer, group: "Setup" },
  { to: "/devices", label: "Devices", icon: Smartphone, group: "Setup" },
  { to: "/subscription", label: "Subscription", icon: CreditCard, group: "Account" },
  { to: "/audit", label: "Audit log", icon: History, group: "Account" },
  { to: "/help", label: "Help", icon: LifeBuoy, group: "Account" },
  { to: "/profile", label: "Profile", icon: User, group: "Account" },
];

export function tabsFor(role: Role, canOpen: (p: string) => boolean): TabDef[] {
  return TABS[role].filter((t) => canOpen(t.to));
}

function ConnectionDot() {
  const { connection } = usePos();
  const label =
    connection === "online" ? "Online" : connection === "reconnecting" ? "Reconnecting" : "Offline";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
      <span
        className={cn(
          "size-2 rounded-full",
          connection === "online" && "bg-status-ready",
          connection === "reconnecting" && "animate-pulse bg-status-hold",
          connection === "offline" && "bg-primary",
        )}
      />
      {label}
    </span>
  );
}

export function TopBar({
  title,
  subtitle,
  left,
  right,
}: {
  title?: string | undefined;
  subtitle?: string | undefined;
  left?: ReactNode | undefined;
  right?: ReactNode | undefined;
}) {
  const { data, unreadAlerts } = usePos();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3">
        {left ?? <Logo size={32} />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold leading-tight">
            {title ?? data?.outlet.name}
          </p>
          <div className="flex min-w-0 items-center gap-2">
            {subtitle ? (
              <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>
            ) : null}
            <ConnectionDot />
          </div>
        </div>
        {right}
        {isMockBackend ? <DemoMenu /> : null}
        <Link
          to="/alerts"
          aria-label="Notifications"
          className="tap relative inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <Bell className="size-5" />
          {unreadAlerts > 0 ? (
            <span className="absolute right-1.5 top-1.5 inline-flex min-w-4 justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
              {unreadAlerts}
            </span>
          ) : null}
        </Link>
      </div>
    </header>
  );
}

function BottomTabs() {
  const pos = usePos();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!pos.session) return null;
  const tabs = tabsFor(pos.session.user.role, pos.canOpen);
  if (tabs.length === 0) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-6xl">
        {tabs.map(({ to, label, icon: Icon, badge }) => {
          const active =
            pathname === to ||
            (to !== "/stock" && pathname.startsWith(`${to}/`)) ||
            (to === "/stock" && pathname === "/stock");
          const count =
            badge === "alerts"
              ? pos.unreadAlerts
              : badge === "pending"
                ? pos.pendingPrints.length
                : 0;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "tap relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <Icon className="size-5" />
                {count > 0 ? (
                  <span className="absolute -right-2 -top-1.5 inline-flex min-w-4 justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
                    {count}
                  </span>
                ) : null}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function OfflineBlocker() {
  const { connection, retryConnection } = usePos();
  if (connection !== "offline") return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center"
    >
      <WifiOff className="size-10 text-primary" />
      <h1 className="font-display text-2xl">No internet connection</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        BillerPe POS bills through the cloud. Your open carts are saved on this phone — reconnect to
        carry on.
      </p>
      <Button className="tap" onClick={() => void retryConnection()}>
        <RefreshCw className="size-4" /> Retry
      </Button>
    </div>
  );
}

function SessionExpiredBlocker() {
  const { sessionExpired, dismissSessionExpired } = usePos();
  const navigate = useNavigate();
  if (!sessionExpired) return null;
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center"
    >
      <LogIn className="size-10 text-primary" />
      <h1 className="font-display text-2xl">Session ended</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Your login is no longer valid (logged out from Devices, or your account was changed). Please
        log in again.
      </p>
      <Button
        className="tap"
        onClick={() => {
          dismissSessionExpired();
          void navigate({ to: "/" });
        }}
      >
        Log in again
      </Button>
    </div>
  );
}

/**
 * Signed in + allowed to open this screen. Not signed in -> login. Not
 * allowed (permissions changed, or a typed-in link) -> the user's home.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const pos = usePos();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const allowed = pos.session ? pos.canOpen(pathname) : false;

  useEffect(() => {
    if (pos.booting) return;
    if (!pos.session) void navigate({ to: "/", replace: true });
    else if (pos.data && !allowed) void navigate({ to: pos.home, replace: true });
  }, [pos.booting, pos.session, pos.data, allowed, pos.home, navigate]);

  if (!pos.session || !pos.data || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Logo size={64} />
        <OfflineBlocker />
      </div>
    );
  }
  return <>{children}</>;
}

function BackButton() {
  const router = useRouter();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => {
        if (window.history.length > 1) router.history.back();
        else void navigate({ to: "/more" });
      }}
      className="tap -ml-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
    >
      <ArrowLeft className="size-5" />
    </button>
  );
}

export function AppShell({
  children,
  title,
  subtitle,
  topBarRight,
  topBarLeft,
  noTabs,
  fullBleed,
}: {
  children: ReactNode;
  title?: string | undefined;
  subtitle?: string | undefined;
  topBarRight?: ReactNode | undefined;
  topBarLeft?: ReactNode | undefined;
  noTabs?: boolean | undefined;
  fullBleed?: boolean | undefined;
}) {
  const pos = usePos();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = pos.session?.user;
  const isTabRoot = user
    ? tabsFor(user.role, pos.canOpen).some((t) => t.to === pathname) || pathname === pos.home
    : true;
  const hasTabs = !noTabs && user ? tabsFor(user.role, pos.canOpen).length > 0 : false;
  return (
    <RequireAuth>
      <div className="min-h-screen bg-background">
        <TopBar
          title={title}
          subtitle={subtitle ?? `${pos.data?.outlet.name ?? ""} · ${user ? tr(user.role) : ""}`}
          left={topBarLeft ?? (isTabRoot ? undefined : <BackButton />)}
          right={topBarRight}
        />
        <main
          className={cn(
            "mx-auto max-w-6xl",
            fullBleed ? "" : "px-3 py-4",
            hasTabs ? "pb-24" : "pb-6",
          )}
        >
          {children}
        </main>
        {hasTabs ? <BottomTabs /> : null}
        <OfflineBlocker />
        <SessionExpiredBlocker />
      </div>
    </RequireAuth>
  );
}

const DEMO_LOGINS: { role: Role; mobile: string }[] = [
  { role: "Owner", mobile: "9000000001" },
  { role: "Manager", mobile: "9000000002" },
  { role: "Captain", mobile: "9000000003" },
  { role: "Cashier", mobile: "9000000004" },
  { role: "Kitchen Staff", mobile: "9000000005" },
  { role: "Inventory Manager", mobile: "9000000007" },
  { role: "Accountant", mobile: "9000000008" },
];

export function useDemoLogin() {
  const pos = usePos();
  const navigate = useNavigate();
  return async (mobile: string) => {
    await pos.logout();
    const r = await pos.loginWithPassword(mobile, "demo1234");
    if (r.ok) void navigate({ to: "/" });
    return r;
  };
}

/** DEMO menu (browser build only): switch role, simulate problems, reset data. */
export function DemoMenu() {
  const pos = usePos();
  const login = useDemoLogin();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-dashed border-primary/50 px-2 py-1 font-display text-[10px] font-bold uppercase tracking-wide text-primary"
      >
        Demo
      </button>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title="Demo menu"
        description="For trying the app with demo data. Not part of the real app."
      >
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm font-bold">Log in as</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEMO_LOGINS.map((d) => (
                <Button
                  key={d.role}
                  variant={pos.session?.user.role === d.role ? "default" : "outline"}
                  size="sm"
                  className="tap"
                  onClick={() => {
                    setOpen(false);
                    void login(d.mobile);
                  }}
                >
                  {d.role}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="tap justify-start"
              onClick={() => {
                setOpen(false);
                demo.setOffline(true);
                void pos.reload();
              }}
            >
              <WifiOff className="size-4" /> Lose the internet (Retry brings it back)
            </Button>
            <Button variant="outline" className="tap justify-start" onClick={() => demo.reset()}>
              <RotateCcw className="size-4" /> Reset demo data
            </Button>
          </div>
        </div>
      </ResponsiveSheet>
    </>
  );
}

export { DEMO_LOGINS };
