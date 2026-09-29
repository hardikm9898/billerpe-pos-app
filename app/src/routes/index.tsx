import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Delete, Headphones, ShieldAlert, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DEMO_LOGINS } from "@/components/pos/AppShell";
import { Spinner, Wordmark } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isMockBackend, usePos } from "@/lib/pos/store";
import type { LoginError } from "@/lib/pos/types";

export const Route = createFileRoute("/")({
  component: LoginPage,
});

const errorCopy: Record<LoginError, { title: string; body: string; cta?: string }> = {
  "wrong-password": {
    title: "Wrong mobile number or password",
    body: "Check the number and try again.",
  },
  "wrong-pin": { title: "Wrong PIN", body: "Try again, or log in with your password." },
  inactive: {
    title: "Account inactive",
    body: "This staff account has been switched off. Ask the owner to switch it on.",
  },
  "device-limit": {
    title: "Device limit reached",
    body: "Ask the owner to log out a device from Devices, or contact BillerPe support to add more.",
    cta: "Contact support",
  },
  "subscription-expired": {
    title: "Subscription expired",
    body: "The owner can renew the BillerPe plan to keep billing.",
    cta: "Renew",
  },
  "plan-mismatch": {
    title: "This outlet uses BillerPe Web POS, not this app",
    body: "Your plan does not include the BillerPe POS app.",
    cta: "Contact support",
  },
  network: {
    title: "No internet connection",
    body: "BillerPe POS needs the internet to log in. Check Wi-Fi or mobile data.",
  },
};

function LoginPage() {
  const pos = usePos();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: LoginError; message?: string | undefined } | null>(
    null,
  );
  const known = pos.shiftStaff;
  const [tab, setTab] = useState(known.length ? "pin" : "password");

  // Already signed in (or just resumed): go to this user's home.
  useEffect(() => {
    if (!pos.booting && pos.session && pos.data) {
      const multi =
        pos.session.user.isOwner &&
        pos.data.outlets.length > 1 &&
        !sessionStorage.getItem("billerpe.outletPicked");
      void navigate({ to: multi ? "/outlets" : pos.home, replace: true });
    }
  }, [pos.booting, pos.session, pos.data, pos.home, navigate]);

  useEffect(() => {
    if (!staffId && known.length) setStaffId(known[0]!.id);
  }, [known, staffId]);

  const handle = (r: {
    ok: boolean;
    error?: LoginError | undefined;
    message?: string | undefined;
  }) => {
    if (!r.ok) setError({ code: r.error ?? "wrong-password", message: r.message });
  };

  const submitPassword = async () => {
    if (!/^\d{10}$/.test(mobile))
      return setError({ code: "wrong-password", message: "Enter your 10-digit mobile number." });
    if (!password) return setError({ code: "wrong-password", message: "Enter your password." });
    setBusy(true);
    setError(null);
    handle(await pos.loginWithPassword(mobile, password));
    setBusy(false);
  };

  const submitPin = async (value: string) => {
    if (!staffId) return;
    setBusy(true);
    setError(null);
    handle(await pos.loginWithPin(staffId, value));
    setBusy(false);
    setPin("");
  };

  const pressKey = (key: string) => {
    if (busy) return;
    if (key === "del") return setPin((p) => p.slice(0, -1));
    const next = (pin + key).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submitPin(next);
  };

  if (pos.booting || (pos.session && pos.data)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <Wordmark size={56} />
        <Spinner />
      </div>
    );
  }

  const err = error ? errorCopy[error.code] : null;

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Wordmark size={48} />
          <p className="text-sm text-muted-foreground">
            {known.length ? "Welcome back" : "Log in to your outlet"}
          </p>
        </div>

        {err ? (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-primary/25 bg-primary-soft p-4 text-left"
          >
            <div className="flex items-start gap-2">
              {error!.code === "subscription-expired" || error!.code === "plan-mismatch" ? (
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary-soft-foreground" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary-soft-foreground" />
              )}
              <div>
                <p className="font-display text-sm font-bold text-primary-soft-foreground">
                  {err.title}
                </p>
                <p className="mt-1 text-xs text-primary-soft-foreground/80">
                  {error!.message ? `${error!.message} ` : ""}
                  {err.body}
                </p>
                {err.cta ? (
                  <Button
                    size="sm"
                    className="tap mt-3"
                    onClick={() => toast.info("Call BillerPe support: 1800-000-0000 (demo number)")}
                  >
                    <Headphones className="size-4" /> {err.cta}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            setError(null);
          }}
          className="mt-6"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="pin">PIN</TabsTrigger>
          </TabsList>

          <TabsContent value="password" className="mt-5">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submitPassword();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="mobile">Mobile number</Label>
                <Input
                  id="mobile"
                  inputMode="numeric"
                  autoComplete="username"
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="tap"
                />
              </div>
              <Button type="submit" className="tap w-full" disabled={busy}>
                {busy ? <Spinner /> : null} Log in
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs font-semibold text-primary"
                onClick={() =>
                  toast.info("Ask the outlet owner to reset your password from Staff.")
                }
              >
                Forgot password?
              </button>
            </form>
          </TabsContent>

          <TabsContent value="pin" className="mt-5">
            {known.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                PIN login works after someone has logged in on this device with a password once.
              </p>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Who's on shift?
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {known.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setStaffId(s.id);
                        setPin("");
                        setError(null);
                      }}
                      className={`tap flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold ${staffId === s.id ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border bg-card text-muted-foreground"}`}
                    >
                      <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted font-display text-[11px]">
                        {s.name
                          .split(" ")
                          .map((p) => p[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      {s.name.split(" ")[0]}
                      <span className="text-[10px] font-normal">{s.role}</span>
                    </button>
                  ))}
                </div>
                <div
                  className="mt-5 flex justify-center gap-3"
                  aria-label={`${pin.length} of 4 digits entered`}
                >
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`size-3.5 rounded-full border ${pin.length > i ? "border-primary bg-primary" : "border-border bg-card"}`}
                    />
                  ))}
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k) =>
                    k === "" ? (
                      <span key="blank" />
                    ) : (
                      <button
                        key={k}
                        type="button"
                        aria-label={k === "del" ? "Delete" : k}
                        onClick={() => pressKey(k)}
                        className="tap inline-flex items-center justify-center rounded-md border border-border bg-card py-3 font-display text-xl font-bold shadow-soft active:bg-muted"
                      >
                        {k === "del" ? <Delete className="size-5 text-muted-foreground" /> : k}
                      </button>
                    ),
                  )}
                </div>
                {busy ? (
                  <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Spinner /> Checking PIN…
                  </p>
                ) : null}
              </>
            )}
          </TabsContent>
        </Tabs>

        {isMockBackend ? (
          <div className="mt-8 rounded-lg border border-dashed border-border bg-card p-4">
            <p className="font-display text-[11px] font-bold uppercase tracking-wide text-primary">
              Demo: log in as
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEMO_LOGINS.map((d) => (
                <button
                  key={d.role}
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    handle(await pos.loginWithPassword(d.mobile, "demo1234"));
                    setBusy(false);
                  }}
                  className="tap rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  {d.role}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Demo password demo1234 · PINs 1111 (Owner) … 8888 (Accountant)
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["device-limit", "Device limit"],
                  ["subscription-expired", "Subscription expired"],
                  ["plan-mismatch", "Wrong plan"],
                  ["inactive", "Inactive staff"],
                  ["network", "No internet"],
                ] as [LoginError, string][]
              ).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setError({ code })}
                  className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  <Smartphone className="mr-1 inline size-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
