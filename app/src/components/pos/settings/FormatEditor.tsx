import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, Segmented } from "@/components/pos/kit";
import { NumberField, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type { Outlet, PrintFormat, PrintLine, PrintLineContent } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

// Header / footer lines for the bill and the KOT (same model as the Web
// POS dynamic invoice / KOT format): each line shows one piece of outlet or
// order information, or free text, at its own font size.

const INVOICE_CONTENT: { id: PrintLineContent; label: string }[] = [
  { id: "logo", label: "Logo" },
  { id: "outlet-name", label: "Outlet name" },
  { id: "address", label: "Address" },
  { id: "phone", label: "Phone" },
  { id: "gstin", label: "GSTIN" },
  { id: "fssai", label: "FSSAI" },
  { id: "upi-qr", label: "UPI pay QR" },
  { id: "text", label: "Your text" },
];
const KOT_CONTENT: { id: PrintLineContent; label: string }[] = [
  { id: "outlet-name", label: "Outlet name" },
  { id: "order-type", label: "Order type" },
  { id: "kot-number", label: "KOT number" },
  { id: "token-number", label: "Token number" },
  { id: "bill-no", label: "Bill number" },
  { id: "customer-details", label: "Customer" },
  { id: "address", label: "Address" },
  { id: "text", label: "Your text" },
];

function sample(line: PrintLine, outlet: Outlet): string {
  switch (line.content) {
    case "logo":
      return "[ logo ]";
    case "outlet-name":
      return outlet.name;
    case "address":
      return outlet.address;
    case "phone":
      return `Ph: ${outlet.phone}`;
    case "gstin":
      return `GSTIN ${outlet.gstin || "—"}`;
    case "fssai":
      return `FSSAI ${outlet.fssai || "—"}`;
    case "upi-qr":
      return outlet.upiId
        ? `[ UPI QR · ${outlet.upiId} ]`
        : "[ UPI QR — set UPI ID in Outlet details ]";
    case "order-type":
      return "DINE-IN · T2";
    case "kot-number":
      return "KOT #17";
    case "token-number":
      return "Token 24";
    case "bill-no":
      return "Bill 1043";
    case "customer-details":
      return "Aarav · 98111 00001";
    case "text":
      return line.text || "(text)";
  }
}

function LineList({
  lines,
  onChange,
  options,
  disabled,
}: {
  lines: PrintLine[];
  onChange: (l: PrintLine[]) => void;
  options: { id: PrintLineContent; label: string }[];
  disabled: boolean;
}) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...lines];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={l.id} className="space-y-1.5 rounded-md border border-border p-2">
          <div className="flex items-center gap-1.5">
            <Select
              disabled={disabled}
              value={l.content}
              onValueChange={(v) =>
                onChange(
                  lines.map((x) => (x.id === l.id ? { ...x, content: v as PrintLineContent } : x)),
                )
              }
            >
              <SelectTrigger className="tap flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <NumberField
              decimals={0}
              className="w-16"
              value={l.fontSize}
              onChange={(v) =>
                onChange(
                  lines.map((x) =>
                    x.id === l.id
                      ? { ...x, fontSize: Math.max(8, Math.min(24, Math.floor(v) || 12)) }
                      : x,
                  ),
                )
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Move up"
              disabled={disabled || i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Move down"
              disabled={disabled || i === lines.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove line"
              disabled={disabled}
              onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          {l.content === "text" ? (
            <Input
              disabled={disabled}
              className="tap"
              maxLength={60}
              placeholder="Line text"
              value={l.text ?? ""}
              onChange={(e) =>
                onChange(lines.map((x) => (x.id === l.id ? { ...x, text: e.target.value } : x)))
              }
            />
          ) : null}
        </div>
      ))}
      {!disabled ? (
        <Button
          variant="outline"
          size="sm"
          className="tap"
          onClick={() =>
            onChange([
              ...lines,
              { id: crypto.randomUUID().slice(0, 8), content: "text", text: "", fontSize: 11 },
            ])
          }
        >
          <Plus className="size-4" /> Add line
        </Button>
      ) : null}
    </div>
  );
}

function Paper({ width, children }: { width: "58mm" | "80mm"; children: React.ReactNode }) {
  return (
    <Card
      className={cn(
        "mx-auto bg-background font-mono text-[11px] leading-snug",
        width === "58mm" ? "max-w-[220px]" : "max-w-[300px]",
      )}
    >
      {children}
    </Card>
  );
}

export function FormatEditor({ kind, editable }: { kind: "invoice" | "kot"; editable: boolean }) {
  const pos = usePos();
  const data = pos.data!;
  const current = kind === "invoice" ? data.settings.invoiceFormat : data.settings.kotFormat;
  const [f, setF] = useState<PrintFormat>({ header: current.header, footer: current.footer });
  const [showPrices, setShowPrices] = useState(data.settings.kotFormat.showPrices);
  const [saveBehave, setSaveBehave] = useState(data.settings.saveBehave);
  const [paper, setPaper] = useState<"58mm" | "80mm">("80mm");
  const [busy, setBusy] = useState(false);
  const options = kind === "invoice" ? INVOICE_CONTENT : KOT_CONTENT;
  const line = (l: PrintLine) => (
    <p key={l.id} className="text-center" style={{ fontSize: `${l.fontSize}px` }}>
      {sample(l, data.outlet)}
    </p>
  );
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">Header</p>
      <LineList
        lines={f.header}
        onChange={(header) => setF({ ...f, header })}
        options={options}
        disabled={!editable}
      />
      <p className="text-xs font-semibold uppercase text-muted-foreground">Footer</p>
      <LineList
        lines={f.footer}
        onChange={(footer) => setF({ ...f, footer })}
        options={options}
        disabled={!editable}
      />
      {kind === "kot" ? (
        <label className="flex items-center justify-between text-sm font-semibold">
          Show prices on KOT{" "}
          <Switch disabled={!editable} checked={showPrices} onCheckedChange={setShowPrices} />
        </label>
      ) : (
        <label className="flex items-center justify-between gap-3 text-sm font-semibold">
          <span>
            Save also opens the bill as PDF
            <span className="block text-xs font-normal text-muted-foreground">
              For outlets without a bill printer.
            </span>
          </span>
          <Switch
            disabled={!editable}
            checked={saveBehave === "pdf"}
            onCheckedChange={(v) => setSaveBehave(v ? "pdf" : "save")}
          />
        </label>
      )}
      <Segmented
        value={paper}
        onChange={setPaper}
        options={[
          { id: "58mm", label: "58 mm preview" },
          { id: "80mm", label: "80 mm preview" },
        ]}
      />
      <Paper width={paper}>
        {f.header.map(line)}
        <hr className="my-1 border-dashed border-border" />
        {kind === "invoice" ? (
          <>
            <p className="flex justify-between">
              <span>2 × Paneer Tikka</span>
              <span>{money(560)}</span>
            </p>
            <p className="flex justify-between">
              <span>CGST 2.5% + SGST 2.5%</span>
              <span>{money(28)}</span>
            </p>
            <p className="flex justify-between font-bold">
              <span>Total</span>
              <span>{money(588)}</span>
            </p>
          </>
        ) : (
          <>
            <p className="flex justify-between">
              <span>2 × Paneer Tikka (Full)</span>
              {showPrices ? <span>{money(920)}</span> : null}
            </p>
            <p className="font-bold">* less spicy</p>
          </>
        )}
        <hr className="my-1 border-dashed border-border" />
        {f.footer.map(line)}
      </Paper>
      {editable ? (
        <Button
          className="tap w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await pos.act((b) =>
              b.updateSettings(
                kind === "invoice"
                  ? { invoiceFormat: f, saveBehave }
                  : { kotFormat: { ...f, showPrices } },
              ),
            );
            setBusy(false);
            toast[r.ok ? "success" : "error"](r.ok ? "Saved" : r.error);
          }}
        >
          {busy ? <Spinner /> : null} Save
        </Button>
      ) : null}
    </div>
  );
}
