import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Printer, RotateCcw, Store } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Field, FormError, Segmented } from "@/components/pos/kit";
import { FormatEditor } from "@/components/pos/settings/FormatEditor";
import {
  ChargeRuleEditor,
  KitchenList,
  PaymentModes,
  PromoList,
  TaxList,
} from "@/components/pos/settings/RuleEditors";
import { Spinner } from "@/components/pos/primitives";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { usePos } from "@/lib/pos/store";
import type { OutletSettings, TokenScope } from "@/lib/pos/types";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function Group({
  value,
  title,
  sub,
  children,
}: {
  value: string;
  title: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem
      value={value}
      className="rounded-lg border border-border bg-card px-4 shadow-soft"
    >
      <AccordionTrigger className="py-3 text-left hover:no-underline">
        <span>
          <span className="block font-display font-bold">{title}</span>
          <span className="block text-xs font-normal text-muted-foreground">{sub}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
}

const SCOPES: { id: TokenScope; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "dinin", label: "Dine-in" },
  { id: "pickup", label: "Pickup" },
  { id: "both", label: "Both" },
];
const scopeLabel = (s: TokenScope) => SCOPES.find((x) => x.id === s)?.label ?? s;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Outlet configuration - the same settings the Web POS uses, so both plans mean the same thing. */
function SettingsPage() {
  const pos = usePos();
  const s = pos.data!.settings;
  const billing = pos.can("ops-billing", "edit");
  const hardware = pos.can("ops-hardware", "edit");
  const experience = pos.can("ops-experience", "edit");
  const toggle = async (patch: Partial<OutletSettings>) => {
    const r = await pos.act((b) => b.updateSettings(patch));
    if (!r.ok) toast.error(r.error);
  };
  const svc = s.serviceCharge;

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-2xl space-y-3">
        {!billing && !hardware && !experience ? (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            You can view settings. Only the owner (or staff given permission) can change them.
          </p>
        ) : null}
        <Link
          to="/outlet"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 font-semibold shadow-soft"
        >
          <Store className="size-5 text-primary" />{" "}
          <span className="flex-1">Outlet details, GSTIN, FSSAI, UPI ID</span>{" "}
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
        <Accordion type="single" collapsible className="space-y-2">
          <Group
            value="tax"
            title="Taxes"
            sub={
              s.gstOn
                ? s.taxes
                    .filter((t) => t.active)
                    .map((t) => `${t.name} ${t.type === "pr" ? `${t.rate}%` : ""}`)
                    .join(" + ") || "No tax"
                : "Tax off"
            }
          >
            <TaxList editable={billing} />
          </Group>
          <Group
            value="service"
            title="Service charge"
            sub={
              svc.active
                ? `${svc.value}${svc.type === "percentage" ? "%" : " ₹"} · ${svc.orderTypes.length ? "automatic" : "added by hand"}`
                : "Off"
            }
          >
            <ChargeRuleEditor which="service" editable={billing} />
          </Group>
          <Group
            value="packaging"
            title="Packaging charge"
            sub={
              s.packagingCharge.active
                ? `${s.packagingCharge.value}${s.packagingCharge.type === "percentage" ? "%" : " ₹"}`
                : "Off"
            }
          >
            <ChargeRuleEditor which="packaging" editable={billing} />
          </Group>
          <Group
            value="modes"
            title="Payment modes"
            sub="Cash and Due are always on. Add your own."
          >
            <PaymentModes editable={billing} />
          </Group>
          <Group
            value="promo"
            title="Promo codes"
            sub={`${s.promoCodes.filter((p) => p.active).length} active`}
          >
            <PromoList editable={billing} />
          </Group>
          <Group
            value="bills"
            title="Bill numbers & business day"
            sub={`Business day starts ${s.businessDayStart} · reset ${s.billReset === "financial_year" ? "every financial year" : s.billReset}`}
          >
            <BillAndDay editable={billing} />
          </Group>
          <Group
            value="tokens"
            title="Tokens"
            sub={`Token for ${scopeLabel(s.tokens.tokenFor).toLowerCase()}`}
          >
            <Tokens editable={billing} />
          </Group>
          <Group value="invoice" title="Bill format" sub="Header and footer lines, save as PDF">
            <FormatEditor kind="invoice" editable={billing} />
          </Group>
          <Group value="kot" title="KOT format" sub="What the kitchen slip shows">
            <FormatEditor kind="kot" editable={hardware} />
          </Group>
          <Group
            value="kitchens"
            title="Kitchens (KDS)"
            sub={`${s.kitchens.length} kitchen screen(s)`}
          >
            <KitchenList editable={hardware} />
          </Group>
          {pos.session?.user.isOwner ? (
            <Group
              value="owner-alerts"
              title="Owner alerts"
              sub="Sent to you (app + notification) when staff do these"
            >
              <OwnerAlerts />
            </Group>
          ) : null}
          <Group
            value="more"
            title="Table grid, QR ordering, cash session, purchases"
            sub="Switches"
          >
            <Field
              label="Table grid view"
              hint="Tabs: pick a section, or All for every table in one grid. Sections: every section one below the other, in rank order."
            >
              <Segmented
                value={s.tableGridView}
                onChange={(v) => {
                  if (experience) void toggle({ tableGridView: v });
                }}
                options={[
                  { id: "tabs", label: "Tabs" },
                  { id: "sections", label: "Sections" },
                ]}
              />
            </Field>
            <label className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span>
                Guests can order from the table QR
                <span className="block text-xs font-normal text-muted-foreground">
                  Off: the QR only shows the menu.
                </span>
              </span>
              <Switch
                disabled={!experience}
                checked={s.qrOrdering}
                onCheckedChange={(v) => void toggle({ qrOrdering: v })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span>
                Opening & closing (cash session)
                <span className="block text-xs font-normal text-muted-foreground">
                  Count the drawer at the start and end of the shift.
                </span>
              </span>
              <Switch
                disabled={!billing}
                checked={s.cashSessionOn}
                onCheckedChange={(v) => void toggle({ cashSessionOn: v })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span>
                Record supplier payments as expenses
                <span className="block text-xs font-normal text-muted-foreground">
                  Each purchase payment adds an expense under “Supplier payment”.
                </span>
              </span>
              <Switch
                disabled={!billing}
                checked={s.supplierPaymentsAsExpense}
                onCheckedChange={(v) => void toggle({ supplierPaymentsAsExpense: v })}
              />
            </label>
          </Group>
        </Accordion>
        <Link
          to="/printers"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 font-semibold shadow-soft"
        >
          <Printer className="size-5 text-primary" />{" "}
          <span className="flex-1">Printers on this device</span>{" "}
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </div>
    </AppShell>
  );
}

/** Owner only: what the owner is told about at once (owner list 2026-09-29 #10). */
function OwnerAlerts() {
  const pos = usePos();
  const a = pos.data!.settings.ownerAlerts;
  const [pct, setPct] = useState(String(a.discountPct));
  const [busy, setBusy] = useState(false);
  const save = async (patch: Partial<typeof a>) => {
    setBusy(true);
    const r = await pos.act((b) => b.updateSettings({ ownerAlerts: { ...a, ...patch } }));
    setBusy(false);
    if (!r.ok) toast.error(r.error);
    return r.ok;
  };
  const row = (
    key: "cancelAfterKot" | "bigDiscount" | "cashDifference",
    title: string,
    hint: string,
  ) => (
    <label className="flex items-center justify-between gap-3 text-sm font-semibold">
      <span>
        {title}
        <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
      </span>
      <Switch disabled={busy} checked={a[key]} onCheckedChange={(v) => void save({ [key]: v })} />
    </label>
  );
  return (
    <>
      {row(
        "cancelAfterKot",
        "Cancelled after KOT",
        "An order cancelled, or an item removed, after it went to the kitchen.",
      )}
      {row("bigDiscount", "Big discount", "A bill settled with a discount above your limit.")}
      {a.bigDiscount ? (
        <Field label="Discount limit (% of the bill)" hint="Default 20%.">
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="w-28"
              aria-label="Discount limit percent"
            />
            <Button
              variant="outline"
              className="tap"
              disabled={busy || Number(pct) === a.discountPct}
              onClick={async () => {
                const n = Number(pct);
                if (!(n >= 1 && n <= 100)) return void toast.error("Enter 1 to 100");
                if (await save({ discountPct: n })) toast.success(`Alert above ${n}% discount`);
              }}
            >
              Save
            </Button>
          </div>
        </Field>
      ) : null}
      {row(
        "cashDifference",
        "Cash difference at close",
        "The drawer is closed with more or less cash than expected.",
      )}
      <p className="text-xs text-muted-foreground">Nothing is sent for what you do yourself.</p>
    </>
  );
}

function BillAndDay({ editable }: { editable: boolean }) {
  const pos = usePos();
  const s = pos.data!.settings;
  const [f, setF] = useState({
    businessDayStart: s.businessDayStart,
    billReset: s.billReset,
    financialYearStartMonth: s.financialYearStartMonth,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <fieldset disabled={!editable} className="space-y-3">
      <Field
        label="Business day starts at"
        hint="Sales after midnight count for the previous day until this time. Reports and tokens follow it."
      >
        <Input
          type="time"
          className="tap"
          value={f.businessDayStart}
          onChange={(e) => setF({ ...f, businessDayStart: e.target.value })}
        />
      </Field>
      <Field
        label="Bill numbers restart"
        hint="Bill numbers never repeat. The bill prints the actual date and time."
      >
        <Segmented
          value={f.billReset}
          onChange={(v) => setF({ ...f, billReset: v })}
          options={[
            { id: "never", label: "Never" },
            { id: "daily", label: "Every day" },
            { id: "financial_year", label: "Every FY" },
          ]}
        />
      </Field>
      {f.billReset === "financial_year" ? (
        <Field label="Financial year starts in">
          <Select
            value={String(f.financialYearStartMonth)}
            onValueChange={(v) => setF({ ...f, financialYearStartMonth: Number(v) })}
          >
            <SelectTrigger className="tap">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      <FormError error={error} />
      {editable ? (
        <Button
          className="tap w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await pos.act((b) => b.updateSettings(f));
            setBusy(false);
            if (r.ok) toast.success("Saved");
            else setError(r.error);
          }}
        >
          {busy ? <Spinner /> : null} Save
        </Button>
      ) : null}
    </fieldset>
  );
}

function Tokens({ editable }: { editable: boolean }) {
  const pos = usePos();
  const t = pos.data!.settings.tokens;
  const [f, setF] = useState(t);
  const [busy, setBusy] = useState(false);
  const row = (key: keyof typeof f, label: string, hint: string) => (
    <Field label={label} hint={hint}>
      <Segmented value={f[key]} onChange={(v) => setF({ ...f, [key]: v })} options={SCOPES} />
    </Field>
  );
  return (
    <fieldset disabled={!editable} className="space-y-3">
      {row("tokenFor", "Give a token to", "Daily token 1, 2, 3… per business day.")}
      {row(
        "billWithKot",
        "Bill with KOT",
        "Printing the bill also prints items not yet sent to the kitchen, on the bill printer. Never on the kitchen screen.",
      )}
      {row(
        "billWithToken",
        "Bill with token",
        "Printing the bill also prints a token slip for the customer.",
      )}
      {editable ? (
        <>
          <Button
            className="tap w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await pos.act((b) => b.updateSettings({ tokens: f }));
              setBusy(false);
              toast[r.ok ? "success" : "error"](r.ok ? "Saved" : r.error);
            }}
          >
            {busy ? <Spinner /> : null} Save
          </Button>
          <Button
            variant="outline"
            className="tap w-full"
            onClick={async () => {
              const r = await pos.act((b) => b.resetTokens());
              toast[r.ok ? "success" : "error"](r.ok ? "Tokens restart from 1" : r.error);
            }}
          >
            <RotateCcw className="size-4" /> Reset tokens now
          </Button>
        </>
      ) : null}
    </fieldset>
  );
}
