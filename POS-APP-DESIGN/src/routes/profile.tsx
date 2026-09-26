import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, KeyRound, Lock, LogOut, Printer, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Card, Field, FormError } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { roleLabel } from "@/lib/pos/permissions";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — BillerPe POS" },
      { name: "description", content: "Your details, PIN, password, app lock, printer status and sign out." },
      { property: "og:title", content: "Profile — BillerPe POS" },
      { property: "og:description", content: "Your details, PIN, password, app lock, printer status and sign out." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const pos = usePos();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<"pin" | "password" | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const user = pos.user;
  if (!user) return <AppShell title="Profile"><span /></AppShell>;

  const device = pos.devices.find((d) => d.thisDevice);
  const connected = pos.printers.filter((p) => p.status === "connected").length;
  const problems = pos.printers.length - connected;

  const openSheet = (k: "pin" | "password") => {
    setCur(""); setNext(""); setConfirm(""); setError(null); setSheet(k);
  };

  const save = async () => {
    if (next !== confirm) return setError(sheet === "pin" ? "New PINs do not match" : "New passwords do not match");
    setBusy(true);
    const res = sheet === "pin" ? await pos.changePin(cur, next) : await pos.changePassword(cur, next);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Could not save");
    toast.success(sheet === "pin" ? "PIN changed" : "Password changed");
    setSheet(null);
  };

  const pinInput = (v: string, set: (s: string) => void, id: string) => (
    <Input id={id} type="password" inputMode={sheet === "pin" ? "numeric" : "text"} maxLength={sheet === "pin" ? 4 : 64} className="tap" value={v}
      onChange={(e) => { set(sheet === "pin" ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value); setError(null); }} />
  );

  return (
    <AppShell title="Profile">
      <div className="mx-auto max-w-xl space-y-3">
        <Card className="flex items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft font-display text-xl font-extrabold text-primary-soft-foreground">
            {user.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold">{user.name}</p>
            <p className="text-sm text-muted-foreground">{roleLabel[user.role]} · {pos.outlet.name}</p>
            <p className="text-xs text-muted-foreground">{user.mobile} · {pos.outlet.restaurant}</p>
          </div>
        </Card>

        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          <button type="button" onClick={() => openSheet("pin")} className="tap flex w-full items-center gap-3 px-4 py-3 text-left font-semibold"><KeyRound className="size-4 text-muted-foreground" /> Change PIN <ChevronRight className="ml-auto size-4 text-muted-foreground" /></button>
          <button type="button" onClick={() => openSheet("password")} className="tap flex w-full items-center gap-3 px-4 py-3 text-left font-semibold"><Lock className="size-4 text-muted-foreground" /> Change password <ChevronRight className="ml-auto size-4 text-muted-foreground" /></button>
          <label className="tap flex w-full items-center gap-3 px-4 py-3 font-semibold">
            <Lock className="size-4 text-muted-foreground" />
            <span className="flex-1">App lock <span className="block text-xs font-normal text-muted-foreground">Ask for PIN when the app reopens</span></span>
            <Switch checked={pos.appLock} onCheckedChange={(v) => { pos.setAppLock(v); toast.success(v ? "App lock on" : "App lock off"); }} />
          </label>
          <Link to="/printers" className="tap flex w-full items-center gap-3 px-4 py-3 font-semibold">
            <Printer className="size-4 text-muted-foreground" />
            <span className="flex-1">
              Printers on this device
              <span className="block text-xs font-normal text-muted-foreground">
                {device ? `${device.make} ${device.model} · ` : ""}
                {pos.printers.length === 0 ? "No printer set up" : `${connected} connected${problems ? ` · ${problems} need attention` : ""}`}
              </span>
            </span>
            <span className={`size-2.5 rounded-full ${pos.printers.length === 0 ? "bg-muted-foreground" : problems ? "bg-status-hold" : "bg-status-ready"}`} />
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="tap" onClick={() => { pos.switchUser(); void navigate({ to: "/" }); }}>
            <Users className="size-4" /> Switch user
          </Button>
          <Button variant="outline" className="tap text-destructive" onClick={() => { pos.logout(); void navigate({ to: "/" }); }}>
            <LogOut className="size-4" /> Logout
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">Switch user keeps this device signed in and opens the PIN pad.</p>
      </div>

      <ResponsiveSheet
        open={sheet !== null}
        onOpenChange={(o) => !o && setSheet(null)}
        title={sheet === "pin" ? "Change PIN" : "Change password"}
        footer={<Button className="tap w-full" disabled={busy || !cur || !next} onClick={() => void save()}>{busy ? <Spinner /> : null} Save</Button>}
      >
        <div className="space-y-3 py-2">
          <Field label={sheet === "pin" ? "Current PIN" : "Current password"} htmlFor="p-cur">{pinInput(cur, setCur, "p-cur")}</Field>
          <Field label={sheet === "pin" ? "New PIN (4 digits)" : "New password (6+ characters)"} htmlFor="p-new">{pinInput(next, setNext, "p-new")}</Field>
          <Field label="Confirm" htmlFor="p-conf">{pinInput(confirm, setConfirm, "p-conf")}</Field>
          <FormError error={error} />
        </div>
      </ResponsiveSheet>
    </AppShell>
  );
}
