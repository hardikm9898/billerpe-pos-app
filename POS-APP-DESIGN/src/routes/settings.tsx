import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Card, Field, FormError, readImage, Segmented } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { NumberField } from "@/components/pos/primitives";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/pos/format";
import { can } from "@/lib/pos/permissions";
import { usePos } from "@/lib/pos/store";
import type { BillingSettings, PromoCode } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — BillerPe POS" },
      { name: "description", content: "Billing, payment modes, promo codes, invoice and KOT format, kitchens, business day, tokens and QR ordering." },
      { property: "og:title", content: "Settings — BillerPe POS" },
      { property: "og:description", content: "Billing, payment modes, promo codes, invoice and KOT format, kitchens, business day, tokens and QR ordering." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function Group({ value, title, sub, children }: { value: string; title: string; sub: string; children: ReactNode }) {
  return (
    <AccordionItem value={value} className="rounded-lg border border-border bg-card px-4 shadow-soft">
      <AccordionTrigger className="py-3 text-left hover:no-underline">
        <span><span className="block font-display font-bold">{title}</span><span className="block text-xs font-normal text-muted-foreground">{sub}</span></span>
      </AccordionTrigger>
      <AccordionContent className="space-y-3 pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
}

function SettingsPage() {
  const pos = usePos();
  const s = pos.billingSettings;
  const edit = can(pos.permissions, "settings", "edit");
  const [draft, setDraft] = useState<BillingSettings>(s);
  const [error, setError] = useState<string | null>(null);
  const [newMode, setNewMode] = useState("");
  const [promo, setPromo] = useState<{ p: PromoCode; original?: string | undefined } | null>(null);
  const set = (p: Partial<BillingSettings>) => { setDraft((d) => ({ ...d, ...p })); setError(null); };
  const save = async (keys: (keyof BillingSettings)[]) => {
    const patch = Object.fromEntries(keys.map((k) => [k, draft[k]])) as Partial<BillingSettings>;
    const r = await pos.updateSettings(patch);
    if (r.ok) toast.success("Settings saved");
    else setError(r.error ?? "Could not save");
  };
  const saveBtn = (keys: (keyof BillingSettings)[]) => edit ? <Button className="tap w-full" onClick={() => void save(keys)}>Save</Button> : null;

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-2xl space-y-3">
        {!edit ? <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">You can view settings. Only the owner can change them.</p> : null}
        <FormError error={error} />
        <fieldset disabled={!edit} className="contents">
          <Accordion type="single" collapsible className="space-y-2">
            <Group value="billing" title="Billing" sub="Tax, service charge, packaging, round-off, bill numbers">
              <div className="grid grid-cols-2 gap-2">
                <Field label="GST %" hint="Split equally as CGST + SGST"><NumberField value={round(draft.taxRate * 100)} onChange={(v) => set({ taxRate: v / 100 })} /></Field>
                <Field label="Service charge %"><NumberField value={round(draft.serviceChargeRate * 100)} onChange={(v) => set({ serviceChargeRate: v / 100 })} /></Field>
                <Field label="Packaging charge ₹"><NumberField value={draft.packagingCharge} onChange={(v) => set({ packagingCharge: v })} /></Field>
                <Field label="Delivery charge ₹"><NumberField value={draft.deliveryCharge} onChange={(v) => set({ deliveryCharge: v })} /></Field>
                <Field label="Bill number prefix"><Input className="tap uppercase" maxLength={6} value={draft.billPrefix} onChange={(e) => set({ billPrefix: e.target.value })} /></Field>
                <Field label="Reset bill numbers">
                  <Select value={draft.billReset} onValueChange={(v) => set({ billReset: v as BillingSettings["billReset"] })}>
                    <SelectTrigger className="tap"><SelectValue /></SelectTrigger>
                    <SelectContent>{["daily", "monthly", "yearly", "never"].map((x) => <SelectItem key={x} value={x} className="capitalize">{x}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <label className="flex items-center justify-between text-sm font-semibold">Round off to nearest rupee <Switch checked={draft.roundOff} onCheckedChange={(v) => set({ roundOff: v })} /></label>
              <p className="text-xs text-muted-foreground">Next bill: <b>{draft.billPrefix.toUpperCase()}{pos.billResetAt ? 1 : "…"}</b></p>
              <Field label="Discount limit per role (%)" hint="Owner has no limit and never needs a PIN.">
                <div className="grid grid-cols-3 gap-2">
                  {(["captain", "cashier", "manager"] as const).map((r) => (
                    <div key={r}><p className="mb-1 text-xs capitalize text-muted-foreground">{r}</p><NumberField value={draft.discountLimits[r] ?? 0} onChange={(v) => set({ discountLimits: { ...draft.discountLimits, [r]: Math.min(100, v) } })} /></div>
                  ))}
                </div>
              </Field>
              {saveBtn(["taxRate", "serviceChargeRate", "packagingCharge", "deliveryCharge", "billPrefix", "billReset", "roundOff", "discountLimits"])}
              {edit ? <Button variant="outline" className="tap w-full" onClick={() => { pos.resetBillNumbers(); toast.success("Bill numbers reset"); }}><RotateCcw className="size-4" /> Reset bill numbers now</Button> : null}
            </Group>

            <Group value="modes" title="Payment modes" sub="Cash and Due are locked. Add your own.">
              {s.paymentModes.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <Input className="tap flex-1" disabled={m.locked || !edit} defaultValue={m.label} onBlur={(e) => e.target.value !== m.label && void pos.updatePaymentMode(m.id, { label: e.target.value.trim() }).then((r) => !r.ok && toast.error(r.error ?? ""))} />
                  {m.locked ? <span className="w-16 text-center text-xs font-semibold text-muted-foreground">Locked</span> : (
                    <Switch aria-label={`${m.label} enabled`} checked={!m.disabled} onCheckedChange={(v) => void pos.updatePaymentMode(m.id, { disabled: !v })} />
                  )}
                  {m.custom && edit ? <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => void pos.removePaymentMode(m.id)}><Trash2 className="size-4" /></Button> : null}
                </div>
              ))}
              {edit ? (
                <div className="flex gap-2">
                  <Input className="tap flex-1" placeholder="e.g. PhonePe, Swiggy" value={newMode} onChange={(e) => setNewMode(e.target.value)} />
                  <Button className="tap" onClick={async () => { const r = await pos.addPaymentMode(newMode); if (r.ok) { setNewMode(""); toast.success("Mode added"); } else toast.error(r.error ?? ""); }}><Plus className="size-4" /> Add</Button>
                </div>
              ) : null}
            </Group>

            <Group value="promo" title="Promo codes" sub={`${s.promoCodes.length} active codes`}>
              {s.promoCodes.length === 0 ? <p className="text-sm text-muted-foreground">No promo codes yet.</p> : s.promoCodes.map((p) => (
                <button key={p.code} type="button" onClick={() => edit && setPromo({ p, original: p.code })} className="tap flex w-full items-center justify-between rounded-md border border-dashed border-border px-3 text-left">
                  <span className="font-display font-bold">{p.code}</span><span className="text-xs text-muted-foreground">{p.label}</span>
                </button>
              ))}
              {edit ? <Button variant="outline" className="tap w-full" onClick={() => setPromo({ p: { code: "", kind: "percent", value: 10, minBill: 0, label: "" } })}><Plus className="size-4" /> Promo code</Button> : null}
            </Group>

            <Group value="invoice" title="Invoice format" sub="Logo, header, footer, GSTIN, FSSAI, paper size">
              <div className="flex items-center gap-3">
                {draft.invoice.logo ? <img src={draft.invoice.logo} alt="Logo" className="size-14 rounded-md object-contain" /> : <span className="flex size-14 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">Logo</span>}
                <label className="tap inline-flex cursor-pointer items-center rounded-md border border-border px-3 text-sm font-semibold">
                  Upload logo
                  <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { set({ invoice: { ...draft.invoice, logo: await readImage(f) } }); } catch (err) { setError((err as Error).message); } }} />
                </label>
              </div>
              <Field label="Header"><Textarea maxLength={200} value={draft.invoice.header} onChange={(e) => set({ invoice: { ...draft.invoice, header: e.target.value } })} /></Field>
              <Field label="Footer"><Input className="tap" maxLength={120} value={draft.invoice.footer} onChange={(e) => set({ invoice: { ...draft.invoice, footer: e.target.value } })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="GSTIN"><Input className="tap uppercase" maxLength={15} value={draft.invoice.gstin} onChange={(e) => set({ invoice: { ...draft.invoice, gstin: e.target.value.toUpperCase() } })} /></Field>
                <Field label="FSSAI"><Input className="tap" inputMode="numeric" maxLength={14} value={draft.invoice.fssai} onChange={(e) => set({ invoice: { ...draft.invoice, fssai: e.target.value.replace(/\D/g, "") } })} /></Field>
              </div>
              <Segmented value={draft.invoice.paper} onChange={(v) => set({ invoice: { ...draft.invoice, paper: v } })} options={[{ id: "58mm", label: "58 mm" }, { id: "80mm", label: "80 mm" }]} />
              <Receipt paper={draft.invoice.paper}>
                {draft.invoice.logo ? <img src={draft.invoice.logo} alt="" className="mx-auto mb-1 h-8 object-contain" /> : null}
                <p className="whitespace-pre-line text-center font-bold">{draft.invoice.header}</p>
                <p className="text-center">GSTIN {draft.invoice.gstin} · FSSAI {draft.invoice.fssai}</p>
                <hr className="my-1 border-dashed border-border" />
                <p className="flex justify-between"><span>2 × Paneer Tikka</span><span>{money(560)}</span></p>
                <p className="flex justify-between"><span>GST</span><span>{money(28)}</span></p>
                <p className="flex justify-between font-bold"><span>Total</span><span>{money(588)}</span></p>
                <hr className="my-1 border-dashed border-border" />
                <p className="text-center">{draft.invoice.footer}</p>
              </Receipt>
              {saveBtn(["invoice"])}
            </Group>

            <Group value="kot" title="KOT format" sub="What the kitchen slip shows">
              <label className="flex items-center justify-between text-sm font-semibold">Show prices on KOT <Switch checked={draft.kotShowPrices} onCheckedChange={(v) => set({ kotShowPrices: v })} /></label>
              <Receipt paper="58mm">
                <p className="text-center font-bold">KOT #17 · Main Kitchen</p>
                <p className="text-center">T2 · Ravi Patil · 6:09 pm</p>
                <hr className="my-1 border-dashed border-border" />
                <p className="flex justify-between"><span>2 × Paneer Tikka (Full)</span>{draft.kotShowPrices ? <span>{money(920)}</span> : null}</p>
                <p className="font-bold">Note: less spicy</p>
              </Receipt>
              {saveBtn(["kotShowPrices"])}
            </Group>

            <Group value="kitchens" title="Kitchens" sub="Which kitchen gets each category">
              {pos.categories.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-semibold">{c.name}</span>
                  <Select disabled={!edit} value={s.categoryKitchen[c.id] ?? pos.outlet.kitchens[0] ?? ""} onValueChange={(v) => pos.setCategoryKitchen(c.id, v)}>
                    <SelectTrigger className="tap w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{pos.outlet.kitchens.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </Group>

            <Group value="day" title="Business day" sub={`Starts at ${s.businessDayStart}`}>
              <Field label="Start time" hint="Sales after midnight count for the previous day until this time.">
                <Input type="time" className="tap" value={draft.businessDayStart} onChange={(e) => set({ businessDayStart: e.target.value || "06:00" })} />
              </Field>
              {saveBtn(["businessDayStart"])}
            </Group>

            <Group value="tokens" title="Token settings" sub={`Tokens: ${s.tokenMode}`}>
              <Segmented value={draft.tokenMode} onChange={(v) => set({ tokenMode: v })} options={[{ id: "dine-in", label: "Dine-in" }, { id: "takeaway", label: "Takeaway" }, { id: "both", label: "Both" }, { id: "off", label: "Off" }]} />
              {saveBtn(["tokenMode"])}
              {edit ? <Button variant="outline" className="tap w-full" onClick={() => { pos.resetTokens(); toast.success("Tokens restart from 1"); }}><RotateCcw className="size-4" /> Reset tokens (next #{pos.nextTokenNo})</Button> : null}
            </Group>

            <Group value="qr" title="QR ordering" sub={s.qrOrdering ? "On — guests can order from table QR" : "Off"}>
              <label className="flex items-center justify-between text-sm font-semibold">Allow ordering from table QR codes <Switch checked={s.qrOrdering} onCheckedChange={(v) => void pos.updateSettings({ qrOrdering: v })} /></label>
            </Group>
          </Accordion>
        </fieldset>
        <Link to="/printers" className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 font-semibold shadow-soft">
          <Printer className="size-5 text-primary" /> <span className="flex-1">Printer settings for this device</span> <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </div>
      {promo ? <PromoSheet initial={promo.p} original={promo.original} onClose={() => setPromo(null)} /> : null}
    </AppShell>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

function Receipt({ paper, children }: { paper: "58mm" | "80mm"; children: ReactNode }) {
  return (
    <Card className={cn("mx-auto bg-background font-mono text-[11px] leading-snug", paper === "58mm" ? "max-w-[220px]" : "max-w-[300px]")}>{children}</Card>
  );
}

function PromoSheet({ initial, original, onClose }: { initial: PromoCode; original?: string | undefined; onClose: () => void }) {
  const pos = usePos();
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <ResponsiveSheet open onOpenChange={(o) => !o && onClose()} title={original ? `Edit ${original}` : "New promo code"} footer={
      <div className="flex gap-2">
        {original ? <Button variant="outline" className="tap text-destructive" onClick={() => { void pos.deletePromo(original); onClose(); }}><Trash2 className="size-4" /></Button> : null}
        <Button className="tap flex-1" onClick={async () => { const r = await pos.savePromo(f, original); if (r.ok) { toast.success("Promo saved"); onClose(); } else setError(r.error ?? ""); }}>Save</Button>
      </div>
    }>
      <div className="space-y-3 py-2">
        <Field label="Code *"><Input className="tap uppercase" maxLength={12} value={f.code} onChange={(e) => { setF({ ...f, code: e.target.value.toUpperCase() }); setError(null); }} /></Field>
        <Segmented value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ id: "percent", label: "Percent %" }, { id: "flat", label: "Flat ₹" }]} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Value"><NumberField value={f.value} onChange={(v) => setF({ ...f, value: v })} /></Field>
          <Field label="Minimum bill ₹"><NumberField value={f.minBill} onChange={(v) => setF({ ...f, minBill: v })} /></Field>
        </div>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}
