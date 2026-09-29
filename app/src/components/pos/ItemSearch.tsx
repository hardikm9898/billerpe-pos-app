import { ScanBarcode, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canScan, itemByBarcode, scanBarcode, ScannerNotReady } from "@/lib/pos/scanner";
import type { MenuItem } from "@/lib/pos/types";

// The item search on Counter and Order screens, with barcode adding:
// - the camera button (phone app) scans and adds the item;
// - a hardware scanner (POS terminal, USB/Bluetooth gun) types the code and
//   presses Enter: an exact barcode match is added and the box cleared.

export function ItemSearch({
  value,
  onChange,
  items,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Items of the current menu (barcode lookup). */
  items: MenuItem[];
  onPick: (item: MenuItem) => void;
}) {
  const pick = (code: string) => {
    const item = itemByBarcode(items, code);
    if (!item) return false;
    if (item.outOfStock) toast.error(`${item.name} is out of stock`);
    else onPick(item);
    return true;
  };

  const scan = async () => {
    try {
      const code = await scanBarcode();
      if (!code) return;
      if (!pick(code)) toast.error(`No item has barcode ${code}`);
    } catch (e) {
      toast.error(e instanceof ScannerNotReady ? e.message : "Could not open the scanner");
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className={canScan() ? "tap pl-9 pr-11" : "tap pl-9"}
        placeholder="Search item, short code or barcode"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && pick(value)) {
            e.preventDefault();
            onChange("");
          }
        }}
        enterKeyHint="search"
      />
      {canScan() ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Scan barcode"
          className="absolute right-1 top-1/2 size-9 -translate-y-1/2 text-primary"
          onClick={() => void scan()}
        >
          <ScanBarcode className="size-5" />
        </Button>
      ) : null}
    </div>
  );
}
