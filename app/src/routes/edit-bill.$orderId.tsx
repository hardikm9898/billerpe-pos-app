import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BadgePercent, Plus, RotateCcw, Save, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { DiscountSheet } from "@/components/pos/billing/BillSheets";
import { EditPaySheet, type EditPayment } from "@/components/pos/billing/EditPaySheet";
import { CustomItemSheet, OptionsSheet } from "@/components/pos/ordering";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import {
  Chip,
  EmptyState,
  QtyStepper,
  SectionTitle,
  Spinner,
  VegMark,
} from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { billTotals, orderLines } from "@/lib/pos/bill";
import { engineLineTotal } from "@/lib/pos/billEngine";
import { money } from "@/lib/pos/format";
import { backend, usePos } from "@/lib/pos/store";
import type { DraftLine, MenuItem, Order, OrderDiscount, OrderLine } from "@/lib/pos/types";
import { ORDER_TYPE_LABEL } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/edit-bill/$orderId")({
  component: EditBillPage,
});

const lineAmount = (l: Pick<OrderLine, "price" | "qty" | "addons">) =>
  engineLineTotal({ price: l.price, qty: l.qty, addons: l.addons });
const lineDetail = (l: Pick<OrderLine, "variantName" | "addons" | "note">) =>
  [l.variantName, ...l.addons.map((a) => a.name), l.note].filter(Boolean).join(", ");

/**
 * Edit a settled bill (owner bug list 2026-09-26, item 11 - Web POS
 * edit-settled-order). Nothing is saved until the payment for the new
 * total is given; the table stays free the whole time.
 */
function EditBillPage() {
  const { orderId } = Route.useParams();
  const pos = usePos();
  const loaded = pos.orderById(orderId);
  const [fetched, setFetched] = useState<Order | null | undefined>(undefined);
  useEffect(() => {
    if (loaded) return;
    let live = true;
    backend.getOrder(orderId).then(
      (o) => live && setFetched(o),
      () => live && setFetched(null),
    );
    return () => {
      live = false;
    };
  }, [orderId, loaded]);
  const order = loaded ?? fetched ?? undefined;

  if (!order) {
    return (
      <AppShell title="Edit bill">
        {fetched === undefined && !loaded ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <EmptyState title="Bill not found" body="It may have been cancelled." />
        )}
      </AppShell>
    );
  }
  if (!pos.canSpecial("orders.reopenSettled")) {
    return (
      <AppShell title="Edit bill">
        <EmptyState
          title="Not allowed"
          body="Editing a settled bill needs the “Edit a settled bill” permission."
        />
      </AppShell>
    );
  }
  if (order.status !== "settled") {
    return (
      <AppShell title="Edit bill">
        <EmptyState
          title={`Bill ${order.billNo} is not settled`}
          body="Only a settled bill can be edited here."
        />
      </AppShell>
    );
  }
  return <Editor key={order.id} order={order} />;
}

function Editor({ order }: { order: Order }) {
  const pos = usePos();
  const navigate = useNavigate();
  const data = pos.data!;
  const lines = useMemo(() => orderLines(order), [order]);
  const [qtys, setQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, l.qty])),
  );
  const [added, setAdded] = useState<DraftLine[]>([]);
  const [discount, setDiscount] = useState<OrderDiscount | null>(order.discount ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [clientKey] = useState(() => crypto.randomUUID());
  const table = pos.tableById(order.tableId);

  const nextLines = [
    ...lines.map((l) => ({ ...l, qty: qtys[l.id] ?? l.qty })).filter((l) => l.qty > 0),
    ...added,
  ];
  const totals = billTotals(
    {
      type: order.type,
      sectionId: table?.sectionId,
      lines: nextLines,
      discount: discount ?? undefined,
      serviceOverride: order.serviceOverride,
    },
    data.settings,
  );
  const subtotalBeforeDiscount = billTotals(
    { type: order.type, sectionId: table?.sectionId, lines: nextLines },
    data.settings,
  ).subtotal;
  const discountTooBig =
    discount?.type === "fix" && discount.value > subtotalBeforeDiscount && nextLines.length > 0;
  const changed =
    added.length > 0 ||
    lines.some((l) => (qtys[l.id] ?? l.qty) !== l.qty) ||
    JSON.stringify(discount ?? null) !== JSON.stringify(order.discount ?? null);

  const save = async (p: EditPayment): Promise<string | null> => {
    const r = await pos.act((b) =>
      b.editSettled(order.id, {
        lines: lines.map((l) => ({ lineId: l.id, qty: qtys[l.id] ?? l.qty })),
        added,
        discount,
        payments: p.payments,
        refundLater: p.refundLater,
        customerName: p.customerName,
        customerMobile: p.customerMobile,
        clientKey,
      }),
    );
    if (!r.ok) return r.error;
    toast.success(`Bill ${order.billNo} updated`, {
      description:
        r.refundOwed > 0
          ? `${money(r.refundOwed)} refund owed to the customer`
          : r.cashOut > 0
            ? `Hand back ${money(r.cashOut)} cash`
            : r.due > 0
              ? `${money(r.due)} now due`
              : "Fully settled",
    });
    setPayOpen(false);
    void navigate({ to: "/orders/$orderId", params: { orderId: order.id }, replace: true });
    return null;
  };

  return (
    <AppShell
      title={`Edit bill ${order.billNo}`}
      subtitle={
        table
          ? `${table.name} · settled`
          : `${ORDER_TYPE_LABEL[order.type]}${order.token ? ` · token ${order.token}` : ""} · settled`
      }
    >
      <div className="mx-auto max-w-2xl space-y-4 pb-40">
        <p className="rounded-lg bg-status-billed-soft px-3 py-2 text-xs font-semibold text-status-billed">
          Change items, quantities or the discount, then save and give the payment for the new
          total. The table is not used again.
        </p>

        <section className="space-y-2">
          <SectionTitle
            action={
              <Button
                size="sm"
                variant="outline"
                className="tap"
                onClick={() => setPickerOpen(true)}
              >
                <Plus className="size-4" /> Add items
              </Button>
            }
          >
            Items
          </SectionTitle>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card px-3">
            {lines.map((l) => {
              const q = qtys[l.id] ?? l.qty;
              const removed = q === 0;
              return (
                <li key={l.id} className="flex items-center gap-2 py-2.5">
                  <VegMark type={l.dietary} />
                  <div className={cn("min-w-0 flex-1", removed && "opacity-50")}>
                    <p className={cn("truncate text-sm font-semibold", removed && "line-through")}>
                      <span translate="no">{l.name}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lineDetail(l) ? `${lineDetail(l)} · ` : ""}
                      {money(l.price)}
                      {q !== l.qty && !removed ? ` · was ${l.qty}` : ""}
                    </p>
                  </div>
                  {removed ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="tap"
                      onClick={() => setQtys((m) => ({ ...m, [l.id]: l.qty }))}
                    >
                      <RotateCcw className="size-4" /> Undo
                    </Button>
                  ) : (
                    <>
                      <QtyStepper
                        size="sm"
                        value={q}
                        onChange={(n) => setQtys((m) => ({ ...m, [l.id]: n }))}
                      />
                      <span className="num w-16 text-right text-sm">
                        {money(lineAmount({ ...l, qty: q }))}
                      </span>
                    </>
                  )}
                </li>
              );
            })}
            {added.map((l) => (
              <li key={l.key} className="flex items-center gap-2 py-2.5">
                <VegMark type={l.dietary} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    <span translate="no">{l.name}</span>{" "}
                    <span className="rounded bg-status-ready-soft px-1.5 py-0.5 text-[10px] font-bold text-status-ready">
                      NEW
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {lineDetail(l) ? `${lineDetail(l)} · ` : ""}
                    {money(l.price)}
                  </p>
                </div>
                <QtyStepper
                  size="sm"
                  value={l.qty}
                  onChange={(n) =>
                    setAdded((a) =>
                      n > 0
                        ? a.map((x) => (x.key === l.key ? { ...x, qty: n } : x))
                        : a.filter((x) => x.key !== l.key),
                    )
                  }
                />
                <span className="num w-16 text-right text-sm">{money(lineAmount(l))}</span>
              </li>
            ))}
          </ul>
          {nextLines.length === 0 ? (
            <p className="text-sm font-semibold text-destructive">
              A bill needs at least one item.
            </p>
          ) : null}
        </section>

        <button
          type="button"
          onClick={() => setDiscountOpen(true)}
          className="tap flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 text-left"
        >
          <BadgePercent className="size-5 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {discount
                ? `Discount ${discount.type === "pr" ? `${discount.value}%` : money(discount.value)}`
                : "Add discount"}
            </span>
            {discount ? (
              <span className="block truncate text-xs text-muted-foreground">
                {discount.reason}
              </span>
            ) : null}
          </span>
          {discount ? (
            <span className="num text-sm text-status-ready">− {money(totals.discount)}</span>
          ) : null}
        </button>
        {discountTooBig ? (
          <p className="text-sm font-semibold text-destructive">
            The discount is more than the bill — change it.
          </p>
        ) : null}

        <dl className="space-y-1.5 rounded-lg border border-border bg-card p-4 text-sm">
          <Row label="Subtotal" value={totals.subtotal} />
          {totals.discount ? <Row label="Discount" value={-totals.discount} /> : null}
          {totals.service ? <Row label="Service charge" value={totals.service} /> : null}
          {totals.packaging ? <Row label="Packaging" value={totals.packaging} /> : null}
          {totals.taxLines.map((t) => (
            <Row key={t.id} label={t.name} value={t.amount} />
          ))}
          {totals.roundOff ? <Row label="Round off" value={totals.roundOff} /> : null}
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
            <dt>New total</dt>
            <dd className="num">{money(totals.grand)}</dd>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <dt>Was</dt>
            <dd className="num">{money(order.totals.grand)}</dd>
          </div>
        </dl>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-border bg-background/95 p-3 backdrop-blur md:bottom-0">
        <div className="mx-auto grid max-w-2xl grid-cols-[auto_1fr] gap-2">
          <Button
            variant="outline"
            className="tap"
            onClick={() =>
              void navigate({
                to: "/orders/$orderId",
                params: { orderId: order.id },
                replace: true,
              })
            }
          >
            <X className="size-4" /> Cancel
          </Button>
          <Button
            className="tap"
            disabled={!changed || nextLines.length === 0 || discountTooBig}
            onClick={() => setPayOpen(true)}
          >
            <Save className="size-4" /> Save changes · {money(totals.grand)}
          </Button>
        </div>
      </div>

      <ItemPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        menuId={order.menuId}
        onAdd={(l) => setAdded((a) => [...a, { ...l, key: crypto.randomUUID() }])}
      />

      <DiscountSheet
        order={order}
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        local={{ subtotal: subtotalBeforeDiscount, discount, onChange: setDiscount }}
      />

      <EditPaySheet
        order={order}
        total={totals.grand}
        open={payOpen}
        onOpenChange={setPayOpen}
        onSave={save}
      />
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="num">{value < 0 ? `− ${money(-value)}` : money(value)}</dd>
    </div>
  );
}

/** The outlet's menu for adding items to the bill: search, category, variants/add-ons, custom item. */
function ItemPicker({
  open,
  onOpenChange,
  menuId,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  menuId: string;
  onAdd: (l: Omit<DraftLine, "key">) => void;
}) {
  const pos = usePos();
  const data = pos.data!;
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [optionItem, setOptionItem] = useState<MenuItem | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const categories = pos.categoriesFor(menuId);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pos
      .itemsFor(menuId)
      .filter(
        (i) =>
          (categoryId === "all" || i.categoryId === categoryId) &&
          (!q || i.name.toLowerCase().includes(q) || i.shortCode.toLowerCase().startsWith(q)),
      )
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }, [pos, menuId, query, categoryId]);

  const pick = (item: MenuItem) => {
    const groups = data.addonGroups.filter((g) => g.active && item.addonGroupIds.includes(g.id));
    if (item.variants.length || groups.length) return setOptionItem(item);
    onAdd({
      itemId: item.id,
      name: item.name,
      categoryId: item.categoryId,
      dietary: item.dietary,
      addons: [],
      price: item.price,
      qty: 1,
      custom: false,
    });
    toast.success(`${item.name} added`);
  };

  return (
    <>
      <ResponsiveSheet
        open={open && !optionItem && !customOpen}
        onOpenChange={onOpenChange}
        title="Add items"
        description="Tap an item to add it to the bill."
      >
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="tap pl-9"
                placeholder="Search item or short code"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className="tap shrink-0 px-3"
              onClick={() => setCustomOpen(true)}
            >
              <Plus className="size-4" /> Custom
            </Button>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <Chip active={categoryId === "all"} onClick={() => setCategoryId("all")}>
              All
            </Chip>
            {categories.map((c) => (
              <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
                <span translate="no">{c.name}</span>
              </Chip>
            ))}
          </div>
          {items.length === 0 ? (
            <EmptyState title="No items match" body="Try another search or category." />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card px-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={cn("flex items-center gap-3 py-3", item.outOfStock && "opacity-55")}
                >
                  <VegMark type={item.dietary} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      <span translate="no">{item.name}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.shortCode}
                      {item.variants.length ? " · variants" : ""}
                      {item.addonGroupIds.length ? " · add-ons" : ""}
                    </p>
                  </div>
                  <span className="num text-sm">
                    {money(item.variants[0]?.price ?? item.price)}
                  </span>
                  {item.outOfStock ? (
                    <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                      Out of stock
                    </span>
                  ) : (
                    <Button size="sm" className="tap px-3" onClick={() => pick(item)}>
                      <Plus className="size-4" /> Add
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </ResponsiveSheet>

      <OptionsSheet
        item={optionItem}
        groups={data.addonGroups}
        onClose={() => setOptionItem(null)}
        onAdd={(l) => {
          onAdd(l);
          setOptionItem(null);
          toast.success(`${l.name} added`);
        }}
      />

      <CustomItemSheet
        open={customOpen}
        onOpenChange={setCustomOpen}
        kitchens={data.settings.kitchens}
        printers={pos.thisDevice?.printers ?? []}
        onAdd={(l) => {
          onAdd(l);
          setCustomOpen(false);
          toast.success(`${l.name} added`);
        }}
      />
    </>
  );
}
