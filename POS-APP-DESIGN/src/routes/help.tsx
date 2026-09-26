import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Phone, TicketPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { shareWhatsApp } from "@/components/pos/billing/share";
import { Field, FormError } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Spinner } from "@/components/pos/primitives";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dateTime } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & support — BillerPe POS" },
      { name: "description", content: "FAQs, raise a support ticket, call or WhatsApp BillerPe support." },
      { property: "og:title", content: "Help & support — BillerPe POS" },
      { property: "og:description", content: "FAQs, raise a support ticket, call or WhatsApp BillerPe support." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HelpPage,
});

const faqs = [
  ["The KOT did not print. Is the order lost?", "No. The KOT is saved and shows on the kitchen screen. Open the order and tap Retry print, or pick another printer."],
  ["How do I merge two tables?", "Long-press a running table on the Tables screen and choose Merge. Held tables and tables with a generated bill cannot be merged."],
  ["Why do I need a manager PIN for a discount?", "Each role has a discount limit set by the owner. Above it, a manager or owner approves with their PIN."],
  ["How do I add a Wi-Fi printer?", "Profile → Printers on this device → Add printer → Wi-Fi. Enter the IP and port 9100, then Test print."],
  ["Can I add more devices?", "The device limit is set by BillerPe support. Raise a ticket or call us to increase it."],
];

function HelpPage() {
  const pos = usePos();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <AppShell title="Help & support">
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="tap h-16 flex-col" asChild><a href="tel:+918000000000"><Phone className="size-5" /> Call</a></Button>
          <Button variant="outline" className="tap h-16 flex-col" onClick={() => shareWhatsApp(`Hi BillerPe, I need help with ${pos.outlet.restaurant} (${pos.outlet.name}).`, "8000000000")}><MessageCircle className="size-5" /> WhatsApp</Button>
          <Button className="tap h-16 flex-col" onClick={() => { setSubject(""); setBody(""); setError(null); setOpen(true); }}><TicketPlus className="size-5" /> Raise ticket</Button>
        </div>
        <Accordion type="single" collapsible className="rounded-lg border border-border bg-card px-4">
          {faqs.map(([q, a], i) => (
            <AccordionItem key={i} value={String(i)}>
              <AccordionTrigger className="text-left">{q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {pos.tickets.length ? (
          <section className="space-y-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Your tickets</h2>
            {pos.tickets.map((t) => (
              <div key={t.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <p className="font-semibold">{t.id} · {t.subject}</p>
                <p className="text-xs text-muted-foreground">{dateTime(t.at)} · Open</p>
              </div>
            ))}
          </section>
        ) : null}
      </div>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title="Raise a ticket" footer={
        <Button className="tap w-full" disabled={busy} onClick={async () => { setBusy(true); const r = await pos.raiseTicket(subject, body); setBusy(false); if (r.ok) { toast.success(`Ticket ${r.ticketId} raised — we'll call you`); setOpen(false); } else setError(r.error ?? ""); }}>{busy ? <Spinner /> : null} Send</Button>
      }>
        <div className="space-y-3 py-2">
          <Field label="Subject *"><Input className="tap" maxLength={80} value={subject} onChange={(e) => { setSubject(e.target.value); setError(null); }} /></Field>
          <Field label="What happened? *"><Textarea maxLength={1000} value={body} onChange={(e) => { setBody(e.target.value); setError(null); }} /></Field>
          <FormError error={error} />
        </div>
      </ResponsiveSheet>
    </AppShell>
  );
}
