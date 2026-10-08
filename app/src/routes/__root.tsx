import {
  Outlet,
  Link,
  createRootRoute,
  useNavigate,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { AlertNotifier } from "@/components/pos/AlertNotifier";
import { AppLock } from "@/components/pos/AppLock";
import { PlanBanner, PlanLockScreen } from "@/components/pos/PlanLock";
import { Logo } from "@/components/pos/primitives";

import { PosProvider, usePos } from "../lib/pos/store";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="#/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  return (
    <PosProvider>
      <AuthGate />
      <Toaster position="top-center" />
    </PosProvider>
  );
}

/**
 * Every screen except login renders only with a session AND its outlet data,
 * so no screen ever sees a half-logged-in state (logout, session ended,
 * switch user). Without them: splash, then the login screen.
 */
function AuthGate() {
  const pos = usePos();
  const navigate = useNavigate();
  // The screen the router is actually drawing (not the address bar, which can
  // lag a step behind during a navigation).
  const leaf = useRouterState({ select: (s) => s.matches[s.matches.length - 1]?.routeId });
  const isLogin = leaf === "/";
  const ready = Boolean(pos.session && pos.data);
  // The app lock covers a session resumed at start, not one just logged in.
  const loginSeen = useRef(false);
  if (isLogin && !ready) loginSeen.current = true;
  useEffect(() => {
    if (!isLogin && !pos.booting && !pos.session) void navigate({ to: "/", replace: true });
  }, [isLogin, pos.booting, pos.session, navigate]);
  // The plan has ended: the lock screen, even before the outlet's data loads.
  if (pos.session && pos.planLocked) return <PlanLockScreen />;
  if (isLogin || ready)
    return (
      <>
        {ready && pos.plan?.inGrace ? <PlanBanner /> : null}
        <Outlet />
        {ready ? <AlertNotifier /> : null}
        {ready ? <AppLock lockAtStart={!loginSeen.current} /> : null}
      </>
    );
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Logo size={64} />
    </div>
  );
}
