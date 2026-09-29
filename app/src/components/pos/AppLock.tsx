import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";
import { Delete, Fingerprint, LogOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Logo, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { usePos } from "@/lib/pos/store";
import { cn } from "@/lib/utils";

// App lock (Profile -> App lock; owner list 2026-09-29 #11). The switch used
// to be saved but never enforced. Now: when the app is opened again (cold
// start with a saved login, or back after more than a minute away) the screen
// is covered until the person signed in unlocks it - fingerprint / face when
// the phone has it, else their 4-digit PIN (checked by the server).
// The minute's grace is for the share sheet, camera and file picker, which
// send the app to the background for a moment.

const GRACE_MS = 60_000;

async function biometricAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return (await NativeBiometric.isAvailable()).isAvailable;
  } catch {
    return false;
  }
}

export function AppLock({ lockAtStart }: { lockAtStart: boolean }) {
  const pos = usePos();
  const [locked, setLocked] = useState(() => pos.appLock && lockAtStart);
  const [bio, setBio] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const appLock = pos.appLock;
  const user = pos.session?.user;

  useEffect(() => {
    void biometricAvailable().then(setBio);
  }, []);

  // Away -> back: lock if it was longer than the grace period.
  useEffect(() => {
    const away = () => (hiddenAt.current = Date.now());
    const back = () => {
      if (appLock && hiddenAt.current && Date.now() - hiddenAt.current > GRACE_MS) setLocked(true);
      hiddenAt.current = null;
    };
    const onVisibility = () => (document.hidden ? away() : back());
    document.addEventListener("visibilitychange", onVisibility);
    const sub = Capacitor.isNativePlatform()
      ? App.addListener("appStateChange", ({ isActive }) => (isActive ? back() : away()))
      : null;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void sub?.then((s) => s.remove());
    };
  }, [appLock]);

  const unlock = useCallback(() => {
    setLocked(false);
    setPin("");
    setError(null);
  }, []);

  const tryBiometric = useCallback(async () => {
    try {
      await NativeBiometric.verifyIdentity({
        reason: "Unlock BillerPe POS",
        title: "Unlock BillerPe POS",
        subtitle: user?.name ?? "",
        description: "Use your fingerprint, or tap Cancel to use your PIN.",
      });
      unlock();
    } catch {
      /* cancelled or not recognised: the PIN pad is right there */
    }
  }, [unlock, user?.name]);

  // Ask for the fingerprint as soon as the lock shows.
  useEffect(() => {
    if (locked && bio) void tryBiometric();
  }, [locked, bio, tryBiometric]);

  const submit = async (value: string) => {
    if (!user) return;
    setBusy(true);
    const r = await pos.loginWithPin(user.id, value);
    setBusy(false);
    if (r.ok) return unlock();
    setPin("");
    setError(
      r.error === "wrong-pin" ? "Wrong PIN. Try again." : "Could not check the PIN. Try again.",
    );
  };

  const press = (k: string) => {
    if (busy) return;
    setError(null);
    if (k === "del") return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submit(next);
  };

  if (!locked || !appLock || !user) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App locked"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
    >
      <Logo size={56} />
      <p className="mt-4 font-display text-xl font-extrabold">
        <span translate="no">{user.name}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        {bio ? "Unlock with your fingerprint or PIN" : "Enter your PIN to unlock"}
      </p>
      <div className="mt-6 flex gap-3" aria-label={`${pin.length} of 4 digits`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "size-3.5 rounded-full border-2 border-primary",
              i < pin.length && "bg-primary",
            )}
          />
        ))}
      </div>
      <p className="mt-3 h-5 text-sm font-semibold text-destructive" role="alert">
        {busy ? <Spinner /> : error}
      </p>
      <div className="mt-2 grid w-full max-w-[280px] grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "bio", "0", "del"].map((k) =>
          k === "bio" ? (
            bio ? (
              <button
                key={k}
                type="button"
                aria-label="Unlock with fingerprint"
                onClick={() => void tryBiometric()}
                className="tap flex items-center justify-center rounded-md border border-border bg-card py-3 text-primary shadow-soft active:bg-muted"
              >
                <Fingerprint className="size-6" />
              </button>
            ) : (
              <span key={k} />
            )
          ) : (
            <button
              key={k}
              type="button"
              aria-label={k === "del" ? "Delete" : k}
              onClick={() => press(k)}
              className="tap flex items-center justify-center rounded-md border border-border bg-card py-3 font-display text-xl font-bold shadow-soft active:bg-muted"
            >
              {k === "del" ? <Delete className="size-5 text-muted-foreground" /> : k}
            </button>
          ),
        )}
      </div>
      <Button
        variant="ghost"
        className="tap mt-6 text-muted-foreground"
        onClick={() => void pos.logout()}
      >
        <LogOut className="size-4" /> Log out instead
      </Button>
    </div>
  );
}
