import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Segmented control / tab strip that scrolls on small phones. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  className?: string | undefined;
}) {
  return (
    <div
      className={cn("no-scrollbar flex gap-1 overflow-x-auto rounded-md bg-muted p-1", className)}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "tap shrink-0 grow rounded-md px-3 text-sm font-semibold",
            value === o.id ? "bg-card text-primary shadow-soft" : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string | undefined;
  htmlFor?: string | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * A dropdown with a search box (owner bug list item 14). It opens inline,
 * under the field, so it scrolls with the form and works with the phone
 * keyboard inside a sheet.
 */
export function SearchSelect({
  value,
  options,
  onChange,
  placeholder = "Select",
  searchPlaceholder = "Search",
  empty = "Nothing matches",
}: {
  value: string | undefined;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  placeholder?: string | undefined;
  searchPlaceholder?: string | undefined;
  empty?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };
  return (
    <div ref={box} className="rounded-md border border-input bg-background">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="tap flex w-full items-center justify-between gap-2 px-3 text-left text-sm"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="border-t border-border p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && shown[0]) {
                  e.preventDefault();
                  pick(shown[0].id);
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
              placeholder={searchPlaceholder}
              className="h-10 w-full rounded-md bg-muted pl-8 pr-2 text-sm outline-none"
            />
          </div>
          <ul role="listbox" className="mt-2 max-h-56 overflow-y-auto overscroll-contain">
            {shown.length === 0 ? (
              <li className="px-2 py-3 text-center text-sm text-muted-foreground">{empty}</li>
            ) : (
              shown.map((o) => (
                <li key={o.id} role="option" aria-selected={o.id === value}>
                  <button
                    type="button"
                    onClick={() => pick(o.id)}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm",
                      o.id === value
                        ? "bg-primary-soft font-semibold text-primary-soft-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    {o.id === value ? <Check className="size-4 shrink-0" /> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function FormError({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm font-semibold text-destructive">
      {error}
    </p>
  );
}

export function BackLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      aria-label="Back"
      className="tap -ml-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
    >
      <ArrowLeft className="size-5" />
    </Link>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4 shadow-soft", className)}>
      {children}
    </div>
  );
}

/** Row in a settings-style list. */
export function ListRow({
  title,
  subtitle,
  right,
  onClick,
  muted,
}: {
  title: ReactNode;
  subtitle?: ReactNode | undefined;
  right?: ReactNode | undefined;
  onClick?: (() => void) | undefined;
  muted?: boolean | undefined;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-semibold", muted && "text-muted-foreground")}>
          {title}
        </div>
        {subtitle ? <div className="truncate text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      {right}
    </>
  );
  const cls =
    "flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left shadow-soft";
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Reads an image file (camera or gallery) as a data URL. */
export function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Pick an image file"));
    if (file.size > 5 * 1024 * 1024) return reject(new Error("Image must be under 5 MB"));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the image"));
    r.readAsDataURL(file);
  });
}
