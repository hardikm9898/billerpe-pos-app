import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Info, LogOut, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Card } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { EmptyState, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { dateTime } from "@/lib/pos/format";
import { can } from "@/lib/pos/permissions";
import { usePos } from "@/lib/pos/store";
import type { Device } from "@/lib/pos/types";

export const Route = createFileRoute("/devices")({
  head: () => ({
    meta: [
      { title: "Devices & logins — BillerPe POS" },
      { name: "description", content: "Logged-in devices, their printers and the device limit for this outlet." },
      { property: "og:title", content: "Devices & logins — BillerPe POS" },
      { property: "og:description", content: "Logged-in devices, their printers and the device limit for this outlet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DevicesPage,
});

function DevicesPage() {
  const pos = usePos();
  const canLogout = can(pos.permissions, "devices", "delete");
  const [confirm, setConfirm] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const used = pos.devices.length;
  const limit = pos.outlet.deviceLimit;

  return (
    <AppShell title="Devices & logins">
      <div className="mx-auto max-w-2xl space-y-3">
        <Card>
          <div className="flex items-end justify-between">
            <p className="font-display text-2xl font-extrabold"><span className="num">{used}</span> of <span className="num">{limit}</span> devices</p>
            <Smartphone className="size-6 text-muted-foreground" />
          </div>
          <Progress value={(used / limit) * 100} className="mt-2" />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="size-3.5" /> Device limit is set by BillerPe support.</p>
        </Card>
        {pos.devices.length === 0 ? <EmptyState title="No devices logged in" /> : pos.devices.map((d) => (
          <div key={d.id} className="rounded-lg border border-border bg-card shadow-soft">
            <Link to="/printers" search={{ device: d.id }} className="flex items-center gap-3 p-3">
              <span className="flex size-11 items-center justify-center rounded-md bg-primary-soft text-primary"><Smartphone className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{d.name}{d.thisDevice ? " · This device" : ""}</span>
                <span className="block truncate text-xs text-muted-foreground">{d.make} {d.model} · {d.android} · app {d.appVersion}</span>
                <span className="block truncate text-xs text-muted-foreground">{d.userName} · active {dateTime(d.lastActive)} · {(d.thisDevice ? pos.printers : d.printers).length} printer(s)</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
            {canLogout && !d.thisDevice ? (
              <div className="border-t border-border p-2">
                <Button variant="ghost" size="sm" className="tap w-full text-destructive" onClick={() => setConfirm(d)}><LogOut className="size-4" /> Log out device</Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <ResponsiveSheet open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)} title={`Log out ${confirm?.name ?? ""}?`} description="Whoever is using it will be signed out and it frees one device slot." footer={
        <Button variant="destructive" className="tap w-full" disabled={busy} onClick={async () => {
          if (!confirm) return;
          setBusy(true);
          const r = await pos.logoutDevice(confirm.id);
          setBusy(false);
          if (r.ok) { toast.success(`${confirm.name} logged out`); setConfirm(null); } else toast.error(r.error ?? "");
        }}>{busy ? <Spinner /> : null} Log out device</Button>
      }><span /></ResponsiveSheet>
    </AppShell>
  );
}
