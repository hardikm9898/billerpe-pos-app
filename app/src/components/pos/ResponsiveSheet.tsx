import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// The sheet is a column capped at the visible screen height (dvh: the
// WebView's real viewport, not the taller layout viewport vh can mean; vh
// on older Android WebViews that do not know dvh):
// title and footer stay put, and the middle - the only part allowed to grow
// - scrolls. Without min-h-0 + flex-1 the middle grows to fit its content,
// the cap just clips it, and a long list (paired Bluetooth printers, a cart
// with many rounds) cannot be scrolled at all. The body is itself a column,
// so content that has its own scrolling list and fixed buttons (the order
// cart: rounds scroll, total + Send KOT stay) can fill exactly this space.
const BODY =
  "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]";

/**
 * Actions open as a bottom sheet on phones and as a centred dialog on tablets.
 */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
  footer?: ReactNode | undefined;
  className?: string | undefined;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            "flex max-h-[92vh] flex-col gap-0 rounded-t-lg p-0 supports-[height:100dvh]:max-h-[92dvh]",
            className,
          )}
        >
          <SheetHeader className="shrink-0 px-4 pb-2 pt-4 pr-12 text-left">
            <SheetTitle className="font-display">{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </SheetHeader>
          <div className={cn(BODY, "px-4 pb-3")}>{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : (
            <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] max-w-lg flex-col gap-0 rounded-lg p-0 supports-[height:100dvh]:max-h-[90dvh]",
          className,
        )}
      >
        <DialogHeader className="shrink-0 px-5 pb-2 pt-5 pr-12 text-left">
          <DialogTitle className="font-display">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className={cn(BODY, "px-5 pb-3")}>{children}</div>
        {footer ? <div className="shrink-0 border-t border-border p-5">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  );
}
