// Menu photos (owner 2026-10-09): BillerPe library photos ("…/menu-photos/<name>.webp"
// in S3); lists and billing tiles use the small copy ("<name>-t.webp").
const API_BASE = (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.trim() || "";
const FILE = /^(.*\/menu-photos\/[a-z0-9-]+?)(-t)?\.webp$/;

export function photoSrc(url: string | null | undefined, small = true): string | undefined {
  if (!url) return undefined;
  const m = url.match(FILE);
  if (m) return `${/^https?:/.test(m[1]!) ? "" : API_BASE}${m[1]}${small ? "-t" : ""}.webp`;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return url;
}

export function initialTone(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 88%)`;
}
