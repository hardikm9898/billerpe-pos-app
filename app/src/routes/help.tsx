import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Phone, TicketPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { shareWhatsApp } from "@/components/pos/billing/share";
import { Field, FormError } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Spinner } from "@/components/pos/primitives";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dateTime } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";

export const Route = createFileRoute("/help")({
  component: HelpPage,
});

const faqs = [
  [
    "The KOT did not print. Is the order lost?",
    "No. The KOT is saved and shows on the kitchen screen. Open the order and tap Retry print, or pick another printer.",
  ],
  [
    "How do I merge two tables?",
    "Long-press a running table on the Tables screen and choose Merge. Held tables and tables with a generated bill cannot be merged.",
  ],
  [
    "Who can give a discount?",
    "Anyone whose role can edit bills. The owner decides this in Staff → Roles & permissions. Every discount needs a reason and is in the audit log.",
  ],
  [
    "The internet went off in the middle of an order. What happens?",
    "BillerPe POS works only online. Items you added stay in the cart on your phone; when the internet is back, tap Send KOT again — it is never sent twice.",
  ],
  [
    "Who can remove an item after the KOT?",
    "Only the person who sent it, or a Manager/Owner, and only before it is served. A reason is required.",
  ],
  [
    "How do I add a Wi-Fi printer?",
    "More → Printers → Add printer → Wi-Fi. Enter the IP and port 9100, then Test print. Each phone has its own printers.",
  ],
  [
    "My Android POS terminal's built-in printer does not print.",
    "More → Printers → Find built-in printer. If it says the model is not supported yet, raise a ticket with the model name and we add a driver.",
  ],
  [
    "Can I add more devices?",
    "The device limit is set by BillerPe support. Raise a ticket or call us to increase it.",
  ],
];

function HelpPage() {
  const pos = usePos();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tickets = pos.data?.tickets ?? [];

  return (
    <AppShell title="Help & support">
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="tap h-16 flex-col" asChild>
            <a href="tel:+918000000000">
              <Phone className="size-5" /> Call
            </a>
          </Button>
          <Button
            variant="outline"
            className="tap h-16 flex-col"
            onClick={() =>
              shareWhatsApp(
                `Hi BillerPe, I need help with ${pos.data?.outlet.name ?? "my outlet"}.`,
                "8000000000",
              )
            }
          >
            <MessageCircle className="size-5" /> WhatsApp
          </Button>
          <Button
            className="tap h-16 flex-col"
            onClick={() => {
              setSubject("");
              setBody("");
              setError(null);
              setOpen(true);
            }}
          >
            <TicketPlus className="size-5" /> Raise ticket
          </Button>
        </div>
        <Accordion
          type="single"
          collapsible
          className="rounded-lg border border-border bg-card px-4"
        >
          {faqs.map(([q, a], i) => (
            <AccordionItem key={i} value={String(i)}>
              <AccordionTrigger className="text-left">{q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {tickets.length ? (
          <section className="space-y-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Your tickets
            </h2>
            {tickets.map((t) => (
              <div key={t.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <p className="font-semibold">
                  {t.id} · {t.subject}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dateTime(t.at)} · {t.status === "open" ? "Open" : "Closed"}
                </p>
              </div>
            ))}
          </section>
        ) : null}
      </div>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title="Raise a ticket"
        footer={
          <Button
            className="tap w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await pos.act((b) => b.raiseTicket(subject, body, "support"));
              setBusy(false);
              if (r.ok) {
                toast.success(`Ticket ${r.ticketId} raised — we'll call you`);
                setOpen(false);
              } else setError(r.error);
            }}
          >
            {busy ? <Spinner /> : null} Send
          </Button>
        }
      >
        <div className="space-y-3 py-2">
          <Field label="Subject *">
            <Input
              className="tap"
              maxLength={80}
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setError(null);
              }}
            />
          </Field>
          <Field label="What happened? *">
            <Textarea
              maxLength={1000}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setError(null);
              }}
            />
          </Field>
          <FormError error={error} />
        </div>
      </ResponsiveSheet>
    </AppShell>
  );
}
