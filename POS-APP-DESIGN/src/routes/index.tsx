import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Delete, Headphones, ShieldAlert, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner, Wordmark } from "@/components/pos/primitives";
import { usePos } from "@/lib/pos/store";
import { roleHome, roleLabel } from "@/lib/pos/permissions";
import type { LoginError, Role, Staff } from "@/lib/pos/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Log in — BillerPe POS" },
      {
        name: "description",
        content:
          "Sign in to BillerPe POS with your mobile number and password, or with your shift PIN.",
      },
      { property: "og:title", content: "Log in — BillerPe POS" },
      {
        property: "og:description",
        content: "Cloud POS for Indian restaurants — sign in with a password or your shift PIN.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

const errorCopy: Record<LoginError, { title: string; body: string; cta?: string }> = {
  "wrong-password": {
    title: "Wrong mobile number or password",
    body: "Check the number and try again. Demo password is demo1234.",
  },
  "wrong-pin": { title: "Wrong PIN", body: "Try again, or log in with your password." },
  inactive: {
    title: "Account inactive",
    body: "This staff account has been deactivated. Ask the owner to activate it.",
  },
  "device-limit": {
    title: "Device limit reached",
    body: "This outlet allows 6 devices. Ask the owner to log out a device, or contact BillerPe support to add more.",
  },
  "subscription-expired": {
    title: "Subscription expired",
    body: "Renew the BillerPe plan to keep billing.",
    cta: "Renew",
  },
  "plan-mismatch": {
    title: "This outlet uses BillerPe Web POS, not this app",
    body: "Your plan does not include the Android POS app.",
    cta: "Contact support",
  },
};

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <Wordmark size={56} />
      <span className="text-xs text-muted-foreground">Demo Restaurant · Main Branch</span>
    </div>
  );
}

function LoginPage() {
  const pos = usePos();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState("9000000003");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);

  const shiftStaff = pos.staff.filter((s) => s.recentOnDevice);

  useEffect(() => {
    if (!selectedStaff && shiftStaff.length > 0) setSelectedStaff(shiftStaff[0] ?? null);
  }, [selectedStaff, shiftStaff]);

  const afterLogin = (role: Role) => {
    const owner = role === "owner";
    if (owner && pos.outlets.length > 1) {
      void navigate({ to: "/outlets" });
      return;
    }
    void navigate({ to: roleHome[role] });
  };

  const submitPassword = async () => {
    setBusy(true);
    setError(null);
    const res = await pos.loginWithPassword(mobile, password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "wrong-password");
      return;
    }
    afterLogin(res.user!.role);
  };

  const submitPin = async (value: string) => {
    if (!selectedStaff) return;
    setBusy(true);
    setError(null);
    const res = await pos.loginWithPin(selectedStaff.id, value);
    setBusy(false);
    setPin("");
    if (!res.ok) {
      setError(res.error ?? "wrong-pin");
      return;
    }
    afterLogin(res.user!.role);
  };

  const pressKey = (key: string) => {
    if (key === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + key).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submitPin(next);
  };

  if (pos.booting) return <Splash />;

  const err = error ? errorCopy[error] : null;

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Wordmark size={48} />
          <p className="text-sm text-muted-foreground">Demo Restaurant · Main Branch</p>
        </div>

        {err ? (
          <div className="mt-6 rounded-lg border border-primary/25 bg-primary-soft p-4 text-left">
            <div className="flex items-start gap-2">
              {error === "subscription-expired" || error === "plan-mismatch" ? (
                <ShieldAlert className="mt-0.5 size-4 text-primary-soft-foreground" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 text-primary-soft-foreground" />
              )}
              <div>
                <p className="font-display text-sm font-bold text-primary-soft-foreground">{err.title}</p>
                <p className="mt-1 text-xs text-primary-soft-foreground/80">{err.body}</p>
                {err.cta ? (
                  <Button
                    size="sm"
                    className="tap mt-3"
                    onClick={() => toast.info(`${err.cta}: our customer care team will call you.`)}
                  >
                    {error === "plan-mismatch" ? <Headphones className="size-4" /> : null}
                    {err.cta}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <Tabs defaultValue={pos.lockedToPin ? "pin" : "pin"} className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="pin">PIN</TabsTrigger>
          </TabsList>

          <TabsContent value="password" className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mobile">Mobile number</Label>
              <Input
                id="mobile"
                inputMode="numeric"
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                className="tap"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                placeholder="demo1234"
                onChange={(e) => setPassword(e.target.value)}
                className="tap"
              />
            </div>
            <Button className="tap w-full" disabled={busy} onClick={() => void submitPassword()}>
              {busy ? <Spinner /> : null} Log in
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs font-semibold text-primary"
              onClick={() => toast.info("A reset link will be sent to the owner's mobile number.")}
            >
              Forgot password?
            </button>
          </TabsContent>

          <TabsContent value="pin" className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Who's on shift?
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {shiftStaff.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedStaff(s);
                    setPin("");
                    setError(null);
                  }}
                  className={`tap flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold ${
                    selectedStaff?.id === s.id
                      ? "border-primary bg-primary-soft text-primary-soft-foreground"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted font-display text-[11px]">
                    {s.name
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  {s.name.split(" ")[0]}
                  <span className="text-[10px] font-normal">{roleLabel[s.role]}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`size-3.5 rounded-full border ${
                    pin.length > i ? "border-primary bg-primary" : "border-border bg-card"
                  }`}
                />
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => pressKey(k)}
                  className="tap rounded-md border border-border bg-card py-3 font-display text-xl font-bold shadow-soft active:bg-muted"
                >
                  {k}
                </button>
              ))}
              <span />
              <button
                type="button"
                onClick={() => pressKey("0")}
                className="tap rounded-md border border-border bg-card py-3 font-display text-xl font-bold shadow-soft active:bg-muted"
              >
                0
              </button>
              <button
                type="button"
                aria-label="Delete"
                onClick={() => pressKey("del")}
                className="tap inline-flex items-center justify-center rounded-md border border-border bg-card py-3 text-muted-foreground active:bg-muted"
              >
                <Delete className="size-5" />
              </button>
            </div>
            {busy ? (
              <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Spinner /> Checking PIN…
              </p>
            ) : (
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Demo PINs: Owner 1111 · Manager 2222 · Captain 3333 · Cashier 4444
              </p>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-8 rounded-lg border border-dashed border-border bg-card p-4">
          <p className="font-display text-[11px] font-bold uppercase tracking-wide text-primary">
            Demo: switch role
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["owner", "manager", "captain", "cashier", "kitchen"] as Role[]).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => {
                  pos.demoLoginAs(role);
                  void navigate({ to: roleHome[role] });
                }}
                className="tap rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              >
                {roleLabel[role]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <p className="text-center text-[11px] uppercase tracking-wide text-muted-foreground">
            Preview sign-in problems
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {(
              [
                ["device-limit", "Device limit"],
                ["subscription-expired", "Subscription expired"],
                ["plan-mismatch", "Wrong plan"],
                ["inactive", "Inactive staff"],
              ] as [LoginError, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setError(key)}
                className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
              >
                <Smartphone className="mr-1 inline size-3" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
