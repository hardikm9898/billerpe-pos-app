import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, KeyRound, Languages, Lock, LogOut, Printer, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Card, Field, FormError } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { currentLang, LANGUAGES, setLang, type Lang } from "@/lib/pos/i18n";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const pos = usePos();
  const [lang, setLangState] = useState<Lang>(currentLang());
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<"pin" | "password" | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const user = pos.session?.user;
  if (!user)
    return (
      <AppShell title="Profile">
        <span />
      </AppShell>
    );

  const device = pos.thisDevice;
  const printers = device?.printers ?? [];
  const connected = printers.filter((p) => p.status === "connected").length;
  const problems = printers.length - connected;

  const openSheet = (k: "pin" | "password") => {
    setCur("");
    setNext("");
    setConfirm("");
    setError(null);
    setSheet(k);
  };

  const save = async () => {
    if (next !== confirm)
      return setError(sheet === "pin" ? "New PINs do not match" : "New passwords do not match");
    setBusy(true);
    const res = await pos.act((b) =>
      sheet === "pin" ? b.changePin(cur, next) : b.changePassword(cur, next),
    );
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success(sheet === "pin" ? "PIN changed" : "Password changed");
    setSheet(null);
  };

  const pinInput = (v: string, set: (s: string) => void, id: string) => (
    <Input
      id={id}
      type="password"
      inputMode={sheet === "pin" ? "numeric" : "text"}
      maxLength={sheet === "pin" ? 4 : 64}
      className="tap"
      value={v}
      onChange={(e) => {
        set(sheet === "pin" ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value);
        setError(null);
      }}
    />
  );

  return (
    <AppShell title="Profile">
      <div className="mx-auto max-w-xl space-y-3">
        <Card className="flex items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft font-display text-xl font-extrabold text-primary-soft-foreground">
            {user.name
              .split(" ")
              .map((x) => x[0])
              .join("")
              .slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold">
              <span translate="no">{user.name}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {user.role} · {pos.data?.outlet.name}
            </p>
            <p className="text-xs text-muted-foreground">{user.mobile}</p>
          </div>
        </Card>

        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          <button
            type="button"
            onClick={() => openSheet("pin")}
            className="tap flex w-full items-center gap-3 px-4 py-3 text-left font-semibold"
          >
            <KeyRound className="size-4 text-muted-foreground" /> Change PIN{" "}
            <ChevronRight className="ml-auto size-4 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => openSheet("password")}
            className="tap flex w-full items-center gap-3 px-4 py-3 text-left font-semibold"
          >
            <Lock className="size-4 text-muted-foreground" /> Change password{" "}
            <ChevronRight className="ml-auto size-4 text-muted-foreground" />
          </button>
          <div className="flex w-full items-center gap-3 px-4 py-3 font-semibold">
            <Languages className="size-4 text-muted-foreground" />
            <span className="flex-1">
              Language{" "}
              <span className="block text-xs font-normal text-muted-foreground">On this phone</span>
            </span>
            <div className="flex gap-1" translate="no">
              {LANGUAGES.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={lang === l.id}
                  onClick={() => {
                    setLangState(l.id);
                    void setLang(l.id);
                  }}
                  className={
                    lang === l.id
                      ? "tap rounded-md bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground"
                      : "tap rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold"
                  }
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <label className="tap flex w-full items-center gap-3 px-4 py-3 font-semibold">
            <Lock className="size-4 text-muted-foreground" />
            <span className="flex-1">
              App lock{" "}
              <span className="block text-xs font-normal text-muted-foreground">
                Fingerprint or PIN when the app is opened again (after 1 min away)
              </span>
            </span>
            <Switch
              checked={pos.appLock}
              onCheckedChange={(v) => {
                pos.setAppLock(v);
                toast.success(v ? "App lock on" : "App lock off");
              }}
            />
          </label>
          <Link
            to="/printers"
            className="tap flex w-full items-center gap-3 px-4 py-3 font-semibold"
          >
            <Printer className="size-4 text-muted-foreground" />
            <span className="flex-1">
              Printers on this device
              <span className="block text-xs font-normal text-muted-foreground">
                {device ? `${device.make} ${device.model} · ` : ""}
                {printers.length === 0
                  ? "No printer set up"
                  : `${connected} connected${problems ? ` · ${problems} need attention` : ""}`}
              </span>
            </span>
            <span
              className={`size-2.5 rounded-full ${printers.length === 0 ? "bg-muted-foreground" : problems ? "bg-status-hold" : "bg-status-ready"}`}
            />
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="tap"
            onClick={() => {
              pos.lockToPin();
              void navigate({ to: "/" });
            }}
          >
            <Users className="size-4" /> Switch user
          </Button>
          <Button
            variant="outline"
            className="tap text-destructive"
            onClick={async () => {
              await pos.logout();
              void navigate({ to: "/" });
            }}
          >
            <LogOut className="size-4" /> Logout
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Switch user keeps this device signed in and opens the PIN pad.
        </p>
      </div>

      <ResponsiveSheet
        open={sheet !== null}
        onOpenChange={(o) => !o && setSheet(null)}
        title={sheet === "pin" ? "Change PIN" : "Change password"}
        footer={
          <Button
            className="tap w-full"
            disabled={busy || !cur || !next}
            onClick={() => void save()}
          >
            {busy ? <Spinner /> : null} Save
          </Button>
        }
      >
        <div className="space-y-3 py-2">
          <Field label={sheet === "pin" ? "Current PIN" : "Current password"} htmlFor="p-cur">
            {pinInput(cur, setCur, "p-cur")}
          </Field>
          <Field
            label={sheet === "pin" ? "New PIN (4 digits)" : "New password (6+ characters)"}
            htmlFor="p-new"
          >
            {pinInput(next, setNext, "p-new")}
          </Field>
          <Field label="Confirm" htmlFor="p-conf">
            {pinInput(confirm, setConfirm, "p-conf")}
          </Field>
          <FormError error={error} />
        </div>
      </ResponsiveSheet>
    </AppShell>
  );
}
