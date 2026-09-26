import { RefreshCw } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const THRESHOLD = 70;

/** Lightweight pull-to-refresh wrapper for phone lists. */
export function PullToRefresh({
  onRefresh,
  children,
  className,
}: {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string | undefined;
}) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    await onRefresh();
    setBusy(false);
    setPull(0);
  };

  return (
    <div
      className={className}
      onTouchStart={(e) => {
        if (window.scrollY <= 0) startY.current = e.touches[0]?.clientY ?? null;
      }}
      onTouchMove={(e) => {
        if (startY.current === null || busy) return;
        const delta = (e.touches[0]?.clientY ?? startY.current) - startY.current;
        if (delta > 0) setPull(Math.min(delta * 0.5, THRESHOLD + 20));
      }}
      onTouchEnd={() => {
        if (pull >= THRESHOLD) void run();
        else setPull(0);
        startY.current = null;
      }}
    >
      <div
        className="flex items-center justify-center overflow-hidden text-muted-foreground transition-[height]"
        style={{ height: busy ? 36 : pull }}
      >
        <span className="flex items-center gap-2 text-xs font-semibold">
          <RefreshCw className={cn("size-4", busy && "animate-spin")} />
          {busy ? "Refreshing…" : pull >= THRESHOLD ? "Release to refresh" : "Pull to refresh"}
        </span>
      </div>
      {children}
    </div>
  );
}
