import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { startPush } from "@/lib/pos/push";
import { chime } from "@/lib/pos/sound";
import { backend, usePos } from "@/lib/pos/store";

// A new alert for this user (a QR order arriving, the captain's food ready,
// a bill request at the counter) rings and shows a toast on EVERY screen, like
// the Web POS QR inbox - before, it only raised the bell count, so nobody
// noticed a QR order unless they opened the QR orders screen (owner list
// 2026-09-29 #6). Alerts already there when the app opened stay quiet.

export function AlertNotifier() {
  const pos = usePos();
  const navigate = useNavigate();
  const seen = useRef<Set<string> | null>(null);
  const outlet = pos.data?.outlet.id;
  const user = pos.session?.user.id;

  // Another user or outlet on this phone: start over without ringing.
  useEffect(() => {
    seen.current = null;
  }, [outlet, user]);

  // Push (app closed): this phone's token goes to the server for whoever is
  // signed in now - again after every login, PIN switch or outlet switch.
  useEffect(() => {
    if (!outlet || !user) return;
    return startPush(
      (token) => void backend.setPushToken(token).catch(() => undefined),
      (link) => void navigate({ to: link as "/alerts" }),
    );
  }, [outlet, user, navigate]);

  const alerts = pos.data?.alerts;
  useEffect(() => {
    if (!alerts) return;
    if (!seen.current) {
      seen.current = new Set(alerts.map((a) => a.id));
      return;
    }
    const fresh = alerts.filter((a) => !a.read && !seen.current!.has(a.id));
    for (const a of alerts) seen.current.add(a.id);
    if (!fresh.length) return;
    chime();
    for (const a of fresh.slice(0, 3)) {
      toast(a.title, {
        description: a.body,
        duration: 15000,
        action: {
          label: "View",
          onClick: () => {
            void pos.act((b) => b.markAlertsRead([a.id]));
            void navigate({ to: (a.link ?? "/alerts") as "/alerts" });
          },
        },
      });
    }
    if (fresh.length > 3)
      toast(`${fresh.length - 3} more alerts`, {
        action: { label: "Open", onClick: () => void navigate({ to: "/alerts" }) },
      });
  }, [alerts, navigate, pos]);

  return null;
}
