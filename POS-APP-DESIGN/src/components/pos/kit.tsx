import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

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
    <div className={cn("no-scrollbar flex gap-1 overflow-x-auto rounded-md bg-muted p-1", className)}>
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

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string | undefined; htmlFor?: string | undefined }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function FormError({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>;
}

export function BackLink({ to }: { to: string }) {
  return (
    <Link to={to} aria-label="Back" className="tap -ml-2 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
      <ArrowLeft className="size-5" />
    </Link>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return <div className={cn("rounded-lg border border-border bg-card p-4 shadow-soft", className)}>{children}</div>;
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
        <div className={cn("truncate font-semibold", muted && "text-muted-foreground")}>{title}</div>
        {subtitle ? <div className="truncate text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      {right}
    </>
  );
  const cls = "flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left shadow-soft";
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
