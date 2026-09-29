import { createFileRoute, Link } from "@tanstack/react-router";
import { Contact, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Field, FormError } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { EmptyState, SectionTitle, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dateTime, dayLabel, money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import type { Customer } from "@/lib/pos/types";

export const Route = createFileRoute("/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const pos = usePos();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (pos.data?.customers ?? [])
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.mobile.includes(q))
      .sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""));
  }, [pos.data, query]);

  return (
    <AppShell title="Customers" subtitle={`${pos.data?.customers.length ?? 0} customers`}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="tap pl-9"
            placeholder="Name or mobile"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {pos.can("ops-ledger", "create") ? (
          <Button className="tap" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Customers are added automatically when a bill is settled with their mobile number.
      </p>
      <div className="mt-3 space-y-2">
        {list.length === 0 ? (
          <EmptyState
            icon={<Contact className="size-6" />}
            title="No customers yet"
            body={query ? "Nothing matches your search." : undefined}
          />
        ) : (
          list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setViewing(c)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-soft"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted font-display font-bold">
                {c.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  <span translate="no">{c.name}</span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {c.mobile} · {c.visits} visit{c.visits === 1 ? "" : "s"}
                  {c.lastVisit ? ` · last ${dayLabel(c.lastVisit)}` : ""}
                </span>
              </span>
              <span className="text-right">
                <span className="num block text-sm">{money(c.totalSpent)}</span>
                {c.dueOutstanding > 0 ? (
                  <span className="num block text-xs text-status-hold">
                    due {money(c.dueOutstanding)}
                  </span>
                ) : null}
              </span>
            </button>
          ))
        )}
      </div>

      <ResponsiveSheet
        open={Boolean(viewing)}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.name ?? ""}
        description={
          viewing ? `${viewing.mobile}${viewing.email ? ` · ${viewing.email}` : ""}` : undefined
        }
      >
        {viewing ? (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md bg-muted p-2">
                <p className="text-muted-foreground">Visits</p>
                <p className="num text-sm">{viewing.visits}</p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-muted-foreground">Spent</p>
                <p className="num text-sm">{money(viewing.totalSpent)}</p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-muted-foreground">Due</p>
                <p className="num text-sm">{money(viewing.dueOutstanding)}</p>
              </div>
            </div>
            {viewing.gstin || viewing.address || viewing.birthday ? (
              <p className="text-sm text-muted-foreground">
                {[
                  viewing.gstin && `GSTIN ${viewing.gstin}`,
                  viewing.address,
                  viewing.birthday && `Birthday ${viewing.birthday}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            <SectionTitle>Recent bills</SectionTitle>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {(pos.data?.orders ?? [])
                .filter((o) => o.customerMobile === viewing.mobile && o.status === "settled")
                .sort((a, b) => (b.settledAt ?? "").localeCompare(a.settledAt ?? ""))
                .slice(0, 10)
                .map((o) => (
                  <li key={o.id}>
                    <Link
                      to="/orders/$orderId"
                      params={{ orderId: o.id }}
                      className="flex justify-between px-3 py-2.5 text-sm"
                    >
                      <span>
                        Bill {o.billNo}{" "}
                        <span className="text-xs text-muted-foreground">
                          · {dateTime(o.settledAt!)}
                        </span>
                      </span>
                      <span className="num">{money(o.totals.grand)}</span>
                    </Link>
                  </li>
                ))}
            </ul>
            {pos.can("ops-ledger", "edit") ? (
              <Button
                variant="outline"
                className="tap w-full"
                onClick={() => {
                  setEditing(viewing);
                  setViewing(null);
                }}
              >
                Edit details
              </Button>
            ) : null}
          </div>
        ) : null}
      </ResponsiveSheet>

      <CustomerForm value={editing} onClose={() => setEditing(null)} />
    </AppShell>
  );
}

function CustomerForm({ value, onClose }: { value: Customer | "new" | null; onClose: () => void }) {
  const pos = usePos();
  const existing = value && value !== "new" ? value : undefined;
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    email: "",
    gstin: "",
    address: "",
    birthday: "",
  });
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = value ? (existing?.id ?? "new") : null;
  if (key !== openFor) {
    setOpenFor(key);
    setForm({
      name: existing?.name ?? "",
      mobile: existing?.mobile ?? "",
      email: existing?.email ?? "",
      gstin: existing?.gstin ?? "",
      address: existing?.address ?? "",
      birthday: existing?.birthday ?? "",
    });
    setError(null);
  }
  return (
    <ResponsiveSheet
      open={Boolean(value)}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Edit customer" : "New customer"}
      footer={
        <Button
          className="tap w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await pos.act((b) =>
              b.saveCustomer({
                id: existing?.id,
                name: form.name,
                mobile: form.mobile,
                email: form.email || undefined,
                gstin: form.gstin || undefined,
                address: form.address || undefined,
                birthday: form.birthday || undefined,
              }),
            );
            setBusy(false);
            if (!r.ok) return setError(r.error);
            toast.success("Customer saved");
            onClose();
          }}
        >
          {busy ? <Spinner /> : null} Save
        </Button>
      }
    >
      <div className="space-y-3 py-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *" htmlFor="c-name">
            <Input
              id="c-name"
              className="tap"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Mobile *" htmlFor="c-mobile">
            <Input
              id="c-mobile"
              className="tap"
              inputMode="numeric"
              maxLength={10}
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
          <Field label="Email" htmlFor="c-email">
            <Input
              id="c-email"
              type="email"
              className="tap"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="GSTIN (for B2B bills)" htmlFor="c-gstin">
            <Input
              id="c-gstin"
              className="tap uppercase"
              maxLength={15}
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="Birthday" htmlFor="c-bday">
            <Input
              id="c-bday"
              type="date"
              className="tap"
              value={form.birthday}
              onChange={(e) => setForm({ ...form, birthday: e.target.value })}
            />
          </Field>
          <Field label="Address" htmlFor="c-addr">
            <Input
              id="c-addr"
              className="tap"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
        </div>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}
