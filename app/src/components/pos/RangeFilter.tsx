import { Input } from "@/components/ui/input";
import type { RangeKey } from "@/lib/pos/backend/types";
import { Chip } from "./primitives";

export const rangeOptions: { id: RangeKey; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "custom", label: "Custom" },
];

function hint(start: string) {
  const [h, m] = start.split(":").map(Number);
  const fmt = (hh: number, mm: number) =>
    `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "pm" : "am"}`;
  const endMin = ((h ?? 6) * 60 + (m ?? 0) + 1439) % 1440;
  return `Business day: ${fmt(h ?? 6, m ?? 0)} – ${fmt(Math.floor(endMin / 60), endMin % 60)}`;
}

export function RangeFilter({
  value,
  onChange,
  custom,
  onCustom,
  businessDayStart,
}: {
  value: RangeKey;
  onChange: (v: RangeKey) => void;
  custom: { from: string; to: string };
  onCustom: (c: { from: string; to: string }) => void;
  businessDayStart: string;
}) {
  return (
    <div className="space-y-2">
      <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
        {rangeOptions.map((o) => (
          <Chip key={o.id} active={value === o.id} onClick={() => onChange(o.id)}>
            {o.label}
          </Chip>
        ))}
      </div>
      {value === "custom" ? (
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            className="tap"
            aria-label="From date"
            value={custom.from}
            max={custom.to || undefined}
            onChange={(e) => onCustom({ ...custom, from: e.target.value })}
          />
          <Input
            type="date"
            className="tap"
            aria-label="To date"
            value={custom.to}
            min={custom.from || undefined}
            onChange={(e) => onCustom({ ...custom, to: e.target.value })}
          />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{hint(businessDayStart)}</p>
    </div>
  );
}

export function defaultCustom() {
  const t = new Date();
  const f = new Date(Date.now() - 6 * 86400000);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(f), to: iso(t) };
}
