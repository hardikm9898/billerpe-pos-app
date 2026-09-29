import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

// Push notifications (owner list 2026-09-29 #9): the server pushes every app
// alert to the phones that should see it, so food ready / QR orders / bill
// requests / reservations reach a phone even when the app is closed.
//
// Needs Firebase: android/app/google-services.json at build time. Without it
// the build sets __PUSH_ENABLED__ = false and nothing here runs (registering
// without Firebase would crash the app).

declare const __PUSH_ENABLED__: boolean;

export const pushAvailable = () =>
  Capacitor.isNativePlatform() && typeof __PUSH_ENABLED__ !== "undefined" && __PUSH_ENABLED__;

let token: string | null = null;
let started = false;
const tokenListeners = new Set<(t: string) => void>();

/** The phone's current push token, once Firebase has given one. */
export const pushToken = () => token;

/**
 * Asks for the notification permission (Android 13+) and registers with
 * Firebase once per app run. `onToken` runs with the token now (if known) and
 * whenever it changes; `onOpen` gets the alert's link when a notification is
 * tapped. Returns a function that removes `onToken`.
 */
export function startPush(onToken: (t: string) => void, onOpen: (link: string) => void) {
  if (!pushAvailable()) return () => {};
  tokenListeners.add(onToken);
  if (token) onToken(token);
  if (!started) {
    started = true;
    void (async () => {
      try {
        // High importance: shows as a heads-up banner with sound.
        await PushNotifications.createChannel({
          id: "alerts",
          name: "Alerts",
          description: "Food ready, QR orders, bill requests, reservations",
          importance: 5,
          visibility: 1,
          vibration: true,
        });
        await PushNotifications.addListener("registration", (t) => {
          token = t.value;
          tokenListeners.forEach((l) => l(t.value));
        });
        await PushNotifications.addListener("registrationError", (e) =>
          console.warn("[push] registration failed", e.error),
        );
        await PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
          const link = (a.notification.data as { link?: string } | undefined)?.link;
          onOpen(link || "/alerts");
        });
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale")
          perm = await PushNotifications.requestPermissions();
        if (perm.receive !== "granted") return;
        await PushNotifications.register();
      } catch (e) {
        console.warn("[push] could not start", e);
      }
    })();
  }
  return () => void tokenListeners.delete(onToken);
}
