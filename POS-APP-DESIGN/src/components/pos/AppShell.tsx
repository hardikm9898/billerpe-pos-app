import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  ChefHat,
  ClipboardList,
  CreditCard,
  History,
  LifeBuoy,
  Printer,
  Settings,
  Smartphone,
  Users,
  Grid2x2,
  Home,
  LayoutGrid,
  LogIn,
  MonitorSmartphone,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Table2,
  User,
  Wallet,
  WifiOff,
} from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePos } from "@/lib/pos/store";
import { roleHome, roleLabel } from "@/lib/pos/permissions";
import type { Role } from "@/lib/pos/types";
import { Logo } from "./primitives";
import { ResponsiveSheet } from "./ResponsiveSheet";

interface TabDef {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: "alerts" | undefined;
}

const tabsByRole: Record<Role, TabDef[]> = {
  owner: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/tables", label: "Tables", icon: Table2 },
    { to: "/orders", label: "Orders", icon: ClipboardList },
    { to: "/reports", label: "Reports", icon: Receipt },
    { to: "/more", label: "More", icon: Grid2x2 },
  ],
  manager: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/tables", label: "Tables", icon: Table2 },
    { to: "/orders", label: "Orders", icon: ClipboardList },
    { to: "/reports", label: "Reports", icon: Receipt },
    { to: "/more", label: "More", icon: Grid2x2 },
  ],
  captain: [
    { to: "/tables", label: "Tables", icon: Table2 },
    { to: "/takeaway", label: "Takeaway", icon: ShoppingBag },
    { to: "/orders", label: "Orders", icon: ClipboardList },
    { to: "/alerts", label: "Alerts", icon: Bell, badge: "alerts" },
    { to: "/profile", label: "Profile", icon: User },
  ],
  cashier: [
    { to: "/counter", label: "Counter", icon: LayoutGrid },
    { to: "/tables", label: "Tables", icon: Table2 },
    { to: "/orders", label: "Orders", icon: ClipboardList },
    { to: "/cash", label: "Cash", icon: Wallet },
    { to: "/more", label: "More", icon: Grid2x2 },
  ],
  kitchen: [],
};

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
  const { outlet, unreadAlertCount } = usePos();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3">
        {left ?? <Logo size={32} />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold leading-tight">
            {title ?? outlet.name}
          </p>
          <div className="flex items-center gap-2">
            {subtitle ? (
              <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>
            ) : null}
            <ConnectionDot />
          </div>
        </div>
        {right}
        <DemoMenu />
        <Link
          to="/alerts"
          aria-label="Notifications"
          className="tap relative inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <Bell className="size-5" />
          {unreadAlertCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 inline-flex min-w-4 justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
              {unreadAlertCount}
            </span>
          ) : null}
        </Link>
      </div>
    </header>
  );
}

function BottomTabs() {
  const { user, unreadAlertCount, pendingKots } = usePos();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!user) return null;
  const tabs = tabsByRole[user.role];
  if (tabs.length === 0) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-6xl">
        {tabs.map(({ to, label, icon: Icon, badge }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          const count =
            badge === "alerts" ? unreadAlertCount : to === "/orders" ? pendingKots.length : 0;
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <WifiOff className="size-10 text-primary" />
      <h1 className="font-display text-2xl">No internet connection</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        BillerPe POS bills through the cloud. Your open carts are safe — reconnect to carry on.
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <LogIn className="size-10 text-primary" />
      <h1 className="font-display text-2xl">Session expired</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        For your safety you have been signed out. Please log in again.
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

/** Redirects to login when nobody is signed in. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, booting } = usePos();
  const navigate = useNavigate();

  useEffect(() => {
    if (!booting && !user) void navigate({ to: "/", replace: true });
  }, [booting, user, navigate]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Logo size={44} />
      </div>
    );
  }
  return <>{children}</>;
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
  const { user, outlet } = usePos();
  return (
    <RequireAuth>
      <div className="min-h-screen bg-background">
        <TopBar
          title={title}
          subtitle={subtitle ?? `${outlet.restaurant} · ${user ? roleLabel[user.role] : ""}`}
          left={topBarLeft}
          right={topBarRight}
        />
        <main
          className={cn(
            "mx-auto max-w-6xl",
            fullBleed ? "" : "px-3 py-4",
            noTabs ? "pb-6" : "pb-24",
          )}
        >
          {children}
        </main>
        {noTabs ? null : <BottomTabs />}
        <OfflineBlocker />
        <SessionExpiredBlocker />
      </div>
    </RequireAuth>
  );
}

export const moreModules = [
  { to: "/orders", label: "Orders", icon: ClipboardList, moduleKey: "orders" as const },
  { to: "/due", label: "Due ledger", icon: Wallet, moduleKey: "billing" as const },
  { to: "/tokens", label: "Token display", icon: MonitorSmartphone, moduleKey: "billing" as const },
  { to: "/kds", label: "Kitchen display", icon: ChefHat, moduleKey: "kds" as const },
  { to: "/menu", label: "Menu", icon: BookOpen, moduleKey: "menu" as const },
  { to: "/tables-setup", label: "Tables setup", icon: Table2, moduleKey: "tables" as const },
  { to: "/staff", label: "Staff", icon: Users, moduleKey: "staff" as const },
  { to: "/expenses", label: "Expenses", icon: Receipt, moduleKey: "expenses" as const },
  { to: "/cash", label: "Cash session", icon: Wallet, moduleKey: "cash" as const },
  { to: "/settings", label: "Settings", icon: Settings, moduleKey: "settings" as const },
  { to: "/printers", label: "Printers", icon: Printer, moduleKey: "help" as const },
  { to: "/devices", label: "Devices", icon: Smartphone, moduleKey: "devices" as const },
  { to: "/subscription", label: "Subscription", icon: CreditCard, moduleKey: "subscription" as const },
  { to: "/help", label: "Help", icon: LifeBuoy, moduleKey: "help" as const },
  { to: "/audit", label: "Audit log", icon: History, moduleKey: "audit" as const },
  { to: "/profile", label: "Profile", icon: User, moduleKey: "help" as const },
];

/** DEMO menu: switch role or preview the blocking modals from any screen. */
export function DemoMenu() {
  const pos = usePos();
  const navigate = useNavigate();
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
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Demo menu" description="For trying the prototype. Not part of the real app.">
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm font-bold">Switch role</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["owner", "manager", "captain", "cashier", "kitchen"] as Role[]).map((role) => (
                <Button
                  key={role}
                  variant={pos.user?.role === role ? "default" : "outline"}
                  size="sm"
                  className="tap"
                  onClick={() => {
                    pos.demoLoginAs(role);
                    setOpen(false);
                    void navigate({ to: roleHome[role] });
                  }}
                >
                  {roleLabel[role]}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Button variant="outline" className="tap justify-start" onClick={() => { setOpen(false); pos.setConnection("offline"); }}>
              <WifiOff className="size-4" /> Show "No internet connection"
            </Button>
            <Button variant="outline" className="tap justify-start" onClick={() => { setOpen(false); pos.expireSession(); }}>
              <LogIn className="size-4" /> Show "Session expired"
            </Button>
            <Button variant="outline" className="tap justify-start" onClick={() => { setOpen(false); pos.setConnection("reconnecting"); setTimeout(() => pos.setConnection("online"), 3000); }}>
              <RefreshCw className="size-4" /> Show "Reconnecting" for 3 seconds
            </Button>
          </div>
        </div>
      </ResponsiveSheet>
    </>
  );
}
