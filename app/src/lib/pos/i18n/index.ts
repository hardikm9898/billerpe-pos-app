// Hindi / Gujarati for every screen (owner list 2026-09-29 #13), chosen per
// phone in Profile. The code stays in English; this layer swaps each English
// phrase on the screen for its translation as it appears (text, placeholders,
// labels, toasts, and the server's error messages). Dictionaries are one
// JSON file per language (hi.json, gu.json: "English": "translation"), so a
// native speaker can review them without touching code. A phrase with values
// is written with {0}, {1}...: "Bill {0} printed" -> "बिल {0} प्रिंट हुआ".
// `node scripts/extract-strings.cjs --missing` lists phrases not yet translated.
//
// People's data (item, table, customer, staff names...) must never be
// translated: anything inside an element with translate="no" is left alone.
// The page is only ever changed in place (a text node's value, an attribute),
// never restructured, so React keeps working.

export type Lang = "en" | "hi" | "gu";

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी" },
  { id: "gu", label: "ગુજરાતી" },
];

const STORE_KEY = "billerpe.lang";
const ATTRS = ["placeholder", "aria-label", "title"] as const;

type Pattern = { re: RegExp; to: string };
let lang: Lang = "en";
let exact = new Map<string, string>();
let patterns: Pattern[] = [];

// English originals and what this layer last wrote, so a value React sets
// later is picked up (and our own writes are not translated twice).
const textOriginal = new WeakMap<Text, string>();
const textWritten = new WeakMap<Text, string>();
const attrOriginal = new WeakMap<Element, Map<string, string>>();
const attrWritten = new WeakMap<Element, Map<string, string>>();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function load(dict: Record<string, string>) {
  exact = new Map();
  patterns = [];
  for (const [en, to] of Object.entries(dict)) {
    if (!to) continue;
    if (/\{\d\}/.test(en)) {
      const re = new RegExp(`^${escape(en).replace(/\\\{(\d)\\\}/g, "(.+?)")}$`, "s");
      patterns.push({ re, to });
    } else exact.set(en, to);
  }
  // Longer patterns first: "Bill {0} printed" before "Bill {0}".
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
}

/** The translation of one English phrase, or null when there is none. */
export function translate(text: string): string | null {
  if (lang === "en") return null;
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const hit = exact.get(t);
  if (hit !== undefined) return keepSpaces(text, hit);
  for (const p of patterns) {
    const m = p.re.exec(t);
    // A value is a number, name or short phrase - never part of a longer
    // sentence ("{0} items{1}" must not match a whole help paragraph).
    if (m && m.slice(1).every((v) => v.length <= 60 && !/[;!?]|\.\s/.test(v))) {
      const out = p.to.replace(/\{(\d)\}/g, (_, i: string) => {
        const v = m[Number(i) + 1] ?? "";
        return exact.get(v.trim()) ?? v;
      });
      return keepSpaces(text, out);
    }
  }
  return null;
}

const keepSpaces = (orig: string, to: string) => {
  const lead = /^\s*/.exec(orig)?.[0] ?? "";
  const trail = /\s*$/.exec(orig)?.[0] ?? "";
  return lead + to + trail;
};

/** translate() or the English itself: for strings the app builds in code. */
export const tr = (text: string) => translate(text) ?? text;

const skip = (el: Element | null) =>
  !el || Boolean(el.closest('[translate="no"], input, textarea, select, script, style, code, pre'));

function doText(node: Text) {
  const now = node.nodeValue ?? "";
  if (textWritten.get(node) !== now) textOriginal.set(node, now); // new value from React
  const original = textOriginal.get(node) ?? now;
  if (skip(node.parentElement)) return;
  const out = translate(original) ?? original;
  if (out !== now) {
    textWritten.set(node, out);
    node.nodeValue = out;
  } else textWritten.set(node, now);
}

function doAttrs(el: Element) {
  if (el.closest('[translate="no"]')) return;
  for (const name of ATTRS) {
    const now = el.getAttribute(name);
    if (now == null) continue;
    const originals = attrOriginal.get(el) ?? new Map<string, string>();
    const written = attrWritten.get(el) ?? new Map<string, string>();
    if (written.get(name) !== now) originals.set(name, now);
    const original = originals.get(name) ?? now;
    const out = translate(original) ?? original;
    written.set(name, out);
    attrOriginal.set(el, originals);
    attrWritten.set(el, written);
    if (out !== now) el.setAttribute(name, out);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.closest('[translate="no"], script, style')) return;
  doAttrs(el);
  const it = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
  }
}

let observer: MutationObserver | null = null;

function observe() {
  observer?.disconnect();
  if (lang === "en") return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") doText(r.target as Text);
      else if (r.type === "attributes") doAttrs(r.target as Element);
      else r.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });
}

async function dictionary(l: Lang): Promise<Record<string, string>> {
  if (l === "hi") return (await import("./hi.json")).default as Record<string, string>;
  if (l === "gu") return (await import("./gu.json")).default as Record<string, string>;
  return {};
}

export const currentLang = () => lang;

/** Switch the language on this phone (saved); the screen changes at once. */
export async function setLang(l: Lang) {
  load(await dictionary(l));
  lang = l;
  try {
    localStorage.setItem(STORE_KEY, l);
  } catch {
    /* storage blocked: this session only */
  }
  document.documentElement.lang = l;
  observe();
  walk(document.body); // English -> l, or back to English
}

/** At start, before the first render: the phone's saved language. */
export async function initI18n() {
  let saved: Lang = "en";
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (v === "hi" || v === "gu") saved = v;
  } catch {
    /* default English */
  }
  if (saved !== "en") await setLang(saved);
}
