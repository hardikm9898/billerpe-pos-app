import { Loader2, Minus, Plus, RefreshCw, WifiOff } from "lucide-react";
import { useState, type ReactNode } from "react";

import billerpeMark from "@/assets/billerpe-mark.png";
import { BillerPeWordmark } from "@/components/pos/BillerPeWordmark";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { parseNumberInput, qty as fmtQty } from "@/lib/pos/format";
import { DIETARY_LABEL, type Dietary, type TableStatus } from "@/lib/pos/types";

/** The B.Pe mark on a white tile (white in dark mode too: the "B." is black ink). */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-black/5 bg-white shadow-soft"
      style={{ width: size, height: size }}
    >
      <img src={billerpeMark} alt="BillerPe" className="w-[84%]" draggable={false} />
    </span>
  );
}

/** The BILLERPE wordmark with "POS" under it; `size` is the old tile size, kept for callers. */
export function Wordmark({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex flex-col items-center gap-1.5">
      <BillerPeWordmark height={Math.round(size * 0.5)} />
      <span className="font-display text-[11px] font-bold uppercase tracking-[0.45em] text-muted-foreground">
        POS
      </span>
    </span>
  );
}

export function VegMark({ type, className }: { type: Dietary; className?: string }) {
  // Indian food marks: red triangle for non-veg (and egg), green dot for every veg type.
  const nonveg = type === "nonveg" || type === "egg";
  const label = DIETARY_LABEL[type];
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        // White ground like a printed food mark: visible on a selected (red) chip too.
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[2px] border bg-white",
        nonveg ? "border-nonveg" : "border-veg",
        className,
      )}
    >
      {nonveg ? (
        <span
          className="size-0 border-x-4 border-b-[7px] border-x-transparent"
          style={{ borderBottomColor: "var(--nonveg)" }}
        />
      ) : (
        <span className="size-2 bg-veg" />
      )}
    </span>
  );
}

const statusMeta: Record<TableStatus, { label: string; cls: string }> = {
  free: { label: "Free", cls: "border-status-free/40 text-status-free bg-status-free-soft" },
  running: {
    label: "Running",
    cls: "border-status-running/30 text-status-running bg-status-running-soft",
  },
  hold: { label: "Hold", cls: "border-status-hold/35 text-status-hold bg-status-hold-soft" },
  billed: {
    label: "Bill generated",
    cls: "border-status-billed/30 text-status-billed bg-status-billed-soft",
  },
  reserved: {
    label: "Reserved",
    cls: "border-status-reserved/30 text-status-reserved bg-status-reserved-soft",
  },
};

export function statusLabel(status: TableStatus) {
  return statusMeta[status].label;
}

export function StatusPill({
  status,
  children,
  className,
}: {
  status: TableStatus;
  children?: ReactNode | undefined;
  className?: string | undefined;
}) {
  const meta = statusMeta[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        meta.cls,
        className,
      )}
    >
      {children ?? meta.label}
    </span>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean | undefined;
  onClick?: () => void | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-soft">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-3 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ items = 8 }: { items?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: items }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-lg" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode | undefined;
  title: string;
  body?: string | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-muted-foreground">{icon}</div> : null}
      <p className="font-display text-base font-bold">{title}</p>
      {body ? <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-12 text-center shadow-soft">
      <WifiOff className="mb-3 size-6 text-muted-foreground" />
      <p className="font-display text-base font-bold">Couldn't load this</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {message ?? "Something went wrong while talking to the cloud."}
      </p>
      <Button className="tap mt-4" onClick={onRetry}>
        <RefreshCw className="size-4" /> Retry
      </Button>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} />;
}

/** Quantity stepper, up to 2 decimals, never negative. */
export function QtyStepper({
  value,
  onChange,
  size = "md",
  min = 0,
  editable = true,
}: {
  value: number;
  onChange: (next: number) => void;
  size?: "sm" | "md" | undefined;
  min?: number | undefined;
  /** Tap the number to type a quantity (up to 2 decimals). */
  editable?: boolean | undefined;
}) {
  const btn = size === "sm" ? "size-8 rounded-md" : "size-11 rounded-md";
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const n = Math.round(parseNumberInput(text) * 100) / 100;
    setText(null);
    // Typing 0 (or clearing) removes an unsent line - owner rule; callers decide via min.
    onChange(Math.max(min, n));
  };
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary-soft p-0.5">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, Math.round((value - 1) * 100) / 100))}
        className={cn(btn, "inline-flex items-center justify-center text-primary-soft-foreground")}
      >
        <Minus className="size-4" />
      </button>
      {editable ? (
        <input
          aria-label="Quantity"
          inputMode="decimal"
          value={text ?? fmtQty(value)}
          onFocus={(e) => {
            setText(fmtQty(value));
            e.target.select();
          }}
          onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="num w-12 bg-transparent text-center text-sm text-primary-soft-foreground outline-none"
        />
      ) : (
        <span className="num min-w-7 text-center text-sm text-primary-soft-foreground">
          {fmtQty(value)}
        </span>
      )}
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(Math.round((value + 1) * 100) / 100)}
        className={cn(btn, "inline-flex items-center justify-center text-primary-soft-foreground")}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/** Number input: typing replaces the 0, no spinners, no negatives. */
export function NumberField({
  value,
  onChange,
  decimals = 2,
  placeholder,
  className,
  id,
}: {
  value: number;
  onChange: (next: number) => void;
  decimals?: number | undefined;
  placeholder?: string | undefined;
  className?: string | undefined;
  id?: string | undefined;
}) {
  return (
    <input
      id={id}
      inputMode="decimal"
      value={value === 0 ? "" : String(value)}
      placeholder={placeholder ?? "0"}
      onChange={(e) => onChange(parseNumberInput(e.target.value, { decimals }))}
      className={cn(
        "tap w-full rounded-md border border-input bg-card px-3 text-right font-display text-base font-bold tabular-nums outline-none focus:border-primary",
        className,
      )}
    />
  );
}
