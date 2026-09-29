import {
  NetworkError,
  type DeviceInfo,
  type LoginResult,
  type PosBackend,
  type Result,
  type Session,
} from "./types";

// The real backend: the cloud's /app/v1 API (uat-backend-v2 appv1/routes.js).
// One POST per PosBackend method, body { args: [...] }, answer
// { ok: true, result } or { ok: false, error }. A dropped connection or a
// timeout is a NetworkError (never a rule error); 401 means the session
// ended (device logged out, staff switched off, plan changed).

const TIMEOUT_MS = 20000;
const SESSION_ENDED = "Your session has ended. Please log in again.";

/** Calls that return data, not a Result: a refusal is thrown. */
const DATA_CALLS = new Set([
  "load",
  "shiftStaff",
  "dashboard",
  "dashboardAll",
  "report",
  "reportAll",
  "listOrders",
  "getOrder",
]);

/** What /app/v1 answers. */
interface Wire {
  ok?: boolean;
  error?: string;
  message?: string;
  code?: string;
  result?: unknown;
  session?: Session;
}

export class HttpBackend {
  private token: string | null = null;
  /** The store persists a new session (outlet switch) through this. */
  onSessionChange: ((s: Session) => void) | null = null;

  constructor(private readonly base: string) {}

  private async post(
    path: string,
    body: unknown,
    auth = true,
  ): Promise<{ status: number; json: Wire }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.base}/app/v1${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth && this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json = (await res.json().catch(() => null)) as Wire | null;
      if (!json) throw new NetworkError();
      return { status: res.status, json };
    } catch (e) {
      if (e instanceof NetworkError) throw e;
      // fetch rejects only when the request never got an answer.
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Any PosBackend method by name. */
  async call(name: string, args: unknown[]): Promise<unknown> {
    const { status, json } = await this.post(`/${name}`, { args });
    if (status === 401) {
      if (DATA_CALLS.has(name)) throw new Error(SESSION_ENDED);
      return { ok: false, error: SESSION_ENDED };
    }
    if (DATA_CALLS.has(name)) {
      if (!json.ok) throw new Error(json.error || "Something went wrong. Please try again.");
      return json.result;
    }
    return json.ok
      ? { ok: true, ...((json.result as object | undefined) ?? {}) }
      : { ok: false, error: json.error };
  }

  private async login(path: string, body: unknown): Promise<LoginResult> {
    try {
      const { json } = await this.post(path, body, false);
      if (json.ok && json.session) this.token = json.session.token;
      return json as unknown as LoginResult;
    } catch {
      return { ok: false, error: "network" };
    }
  }

  loginWithPassword(mobile: string, password: string, device: DeviceInfo) {
    return this.login("/login/password", { mobile, password, device });
  }

  loginWithPin(staffId: string, pin: string, device: DeviceInfo) {
    return this.login("/login/pin", { staffId, pin, device });
  }

  resume(token: string, device: DeviceInfo) {
    return this.login("/resume", { token, device });
  }

  async logout() {
    this.token = null;
  }

  /** Another outlet of the same person: the server gives a token for it. */
  async selectOutlet(outletId: string): Promise<Result> {
    const r = (await this.call("selectOutlet", [outletId])) as Result<{
      token?: string | null;
      user?: Session["user"];
      deviceId?: string;
    }>;
    if (r.ok && r.token && r.user && r.deviceId) {
      this.token = r.token;
      this.onSessionChange?.({ token: r.token, user: r.user, deviceId: r.deviceId });
    }
    return r.ok ? { ok: true } : r;
  }

  /** Cheap fingerprint of the outlet's live state; the app reloads when it changes. */
  async version(): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.base}/app/v1/version`, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
        signal: ctrl.signal,
      });
      if (res.status === 401) throw new Error(SESSION_ENDED);
      const json = (await res.json()) as Wire;
      return String((json.result as { v?: string } | undefined)?.v ?? "");
    } catch (e) {
      if (e instanceof Error && e.message === SESSION_ENDED) throw e;
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }
}

const EXPLICIT = new Set([
  "loginWithPassword",
  "loginWithPin",
  "resume",
  "logout",
  "selectOutlet",
  "version",
  "onSessionChange",
  "call",
  "then",
]);

/**
 * A PosBackend backed by the cloud: the session calls above, every other
 * method forwarded to /app/v1/<name> with the same arguments.
 */
export function createHttpBackend(base: string): PosBackend & HttpBackend {
  const http = new HttpBackend(base.replace(/\/$/, ""));
  return new Proxy(http, {
    get(target, prop, receiver) {
      if (typeof prop !== "string" || EXPLICIT.has(prop) || prop in target) {
        const v = Reflect.get(target, prop, receiver);
        return typeof v === "function" ? v.bind(target) : v;
      }
      return (...args: unknown[]) => target.call(prop, args);
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value);
    },
  }) as unknown as PosBackend & HttpBackend;
}
