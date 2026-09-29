import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, FileDown, FileUp, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { ExportMenuSheet, ImportMenuSheet } from "@/components/pos/menu/MenuCsv";
import { ListRow, Segmented } from "@/components/pos/kit";
import {
  AddonGroupSheet,
  CategorySheet,
  ItemSheet,
  MenuSheet,
  VariantSheet,
} from "@/components/pos/menu/MenuEditors";
import { Chip, EmptyState, VegMark } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { money } from "@/lib/pos/format";
import { usePos } from "@/lib/pos/store";
import {
  ORDER_TYPE_LABEL,
  type AddonGroup,
  type MenuCatalog,
  type MenuCategory,
  type MenuItem,
  type Variant,
} from "@/lib/pos/types";

export const Route = createFileRoute("/menu")({
  component: MenuPage,
});

type Tab = "items" | "categories" | "variants" | "addons" | "menus";

/**
 * Menu management on the real model: pick a menu, then manage its own
 * categories, items, variants and add-on groups. "Menus" sets which menu each
 * section / order type uses.
 */
function MenuPage() {
  const pos = usePos();
  const data = pos.data!;
  const canCreate = pos.can("menu", "create");
  const canEdit = pos.can("menu", "edit");
  const menus = data.menus;
  const [menuId, setMenuId] = useState(menus.find((m) => m.isDefault)?.id ?? menus[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("items");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [item, setItem] = useState<MenuItem | "new" | null>(null);
  const [category, setCategory] = useState<MenuCategory | "new" | null>(null);
  const [variant, setVariant] = useState<Variant | "new" | null>(null);
  const [group, setGroup] = useState<AddonGroup | "new" | null>(null);
  const [menuEdit, setMenuEdit] = useState<MenuCatalog | "new" | null>(null);
  const [csv, setCsv] = useState<"import" | "export" | null>(null);

  const categories = data.categories
    .filter((c) => c.menuId === menuId)
    .sort((a, b) => a.rank - b.rank);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.items
      .filter(
        (i) =>
          i.menuId === menuId &&
          (cat === "all" || i.categoryId === cat) &&
          (!q || i.name.toLowerCase().includes(q) || i.shortCode.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.items, menuId, cat, query]);

  const move = async (c: MenuCategory, dir: -1 | 1) => {
    const idx = categories.findIndex((x) => x.id === c.id);
    const other = categories[idx + dir];
    if (!other) return;
    await pos.act((b) => b.saveCategory({ ...c, rank: other.rank }));
    await pos.act((b) => b.saveCategory({ ...other, rank: c.rank }));
  };

  return (
    <AppShell title="Menu">
      <div className="space-y-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: "items", label: "Items" },
            { id: "categories", label: "Categories" },
            { id: "variants", label: "Variants" },
            { id: "addons", label: "Add-ons" },
            { id: "menus", label: "Menus" },
          ]}
        />
        {tab !== "menus" && menus.length > 1 ? (
          <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
            {menus.map((m) => (
              <Chip
                key={m.id}
                active={m.id === menuId}
                onClick={() => {
                  setMenuId(m.id);
                  setCat("all");
                }}
              >
                <span translate="no">{m.name}</span>
              </Chip>
            ))}
          </div>
        ) : null}

        {tab === "items" ? (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="tap pl-9"
                  placeholder="Search name or short code"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {canCreate ? (
                <Button
                  className="tap"
                  disabled={categories.length === 0}
                  onClick={() => setItem("new")}
                >
                  <Plus className="size-4" /> Item
                </Button>
              ) : null}
            </div>
            {/* Web POS menu CSV (owner bug list item 15). */}
            <div className="grid grid-cols-2 gap-2">
              {canCreate && canEdit ? (
                <Button variant="outline" className="tap" onClick={() => setCsv("import")}>
                  <FileUp className="size-4" /> Import CSV
                </Button>
              ) : null}
              <Button
                variant="outline"
                className={canCreate && canEdit ? "tap" : "tap col-span-2"}
                onClick={() => setCsv("export")}
              >
                <FileDown className="size-4" /> Export CSV
              </Button>
            </div>
            <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
              <Chip active={cat === "all"} onClick={() => setCat("all")}>
                All
              </Chip>
              {categories.map((c) => (
                <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                  <span translate="no">{c.name}</span>
                </Chip>
              ))}
            </div>
            {categories.length === 0 ? (
              <EmptyState
                title="Add a category first"
                body="Items belong to a category of this menu."
              />
            ) : items.length === 0 ? (
              <EmptyState
                title="No items"
                body={query ? "Nothing matches your search." : "Add your first item."}
              />
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {items.map((i) => (
                  <div
                    key={i.id}
                    className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-2 shadow-soft"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      disabled={!canEdit}
                      onClick={() => setItem(i)}
                    >
                      {i.imageUrl ? (
                        <img
                          src={i.imageUrl}
                          alt=""
                          className="size-12 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted font-display text-xs font-bold text-muted-foreground">
                          {i.shortCode}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <VegMark type={i.dietary} />{" "}
                          <span className="truncate">
                            <span translate="no">{i.name}</span>
                          </span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {i.variants.length
                            ? i.variants.map((v) => `${v.name} ${money(v.price)}`).join(" · ")
                            : money(i.price)}{" "}
                          · {categories.find((c) => c.id === i.categoryId)?.name}
                          {!i.active ? " · hidden" : ""}
                        </span>
                      </span>
                    </button>
                    {/* Quick "86": out of stock for today, anyone who can edit the menu. */}
                    <label className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
                      <Switch
                        checked={!i.outOfStock}
                        disabled={!canEdit}
                        onCheckedChange={async (v) => {
                          const r = await pos.act((b) => b.setOutOfStock(i.id, !v));
                          if (!r.ok) toast.error(r.error);
                        }}
                        aria-label={`${i.name} in stock`}
                      />
                      {i.outOfStock ? "Out" : "In stock"}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}

        {tab === "categories" ? (
          <div className="space-y-2">
            {canCreate ? (
              <Button className="tap" onClick={() => setCategory("new")}>
                <Plus className="size-4" /> Category
              </Button>
            ) : null}
            {categories.length === 0 ? (
              <EmptyState title="No categories" />
            ) : (
              categories.map((c, idx) => (
                <ListRow
                  key={c.id}
                  muted={!c.active}
                  title={c.name}
                  subtitle={`${data.items.filter((i) => i.categoryId === c.id).length} items${c.active ? "" : " · hidden"}`}
                  onClick={canEdit ? () => setCategory(c) : undefined}
                  right={
                    canEdit ? (
                      <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Move up"
                          disabled={idx === 0}
                          onClick={() => void move(c, -1)}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Move down"
                          disabled={idx === categories.length - 1}
                          onClick={() => void move(c, 1)}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                      </span>
                    ) : undefined
                  }
                />
              ))
            )}
          </div>
        ) : null}

        {tab === "variants" ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Variants like Half / Full. Each item picks its variants and sets a price for each. Tap
              one to rename or delete it.
            </p>
            {canCreate ? (
              <Button className="tap" onClick={() => setVariant("new")}>
                <Plus className="size-4" /> Variant
              </Button>
            ) : null}
            {data.variants.filter((v) => v.menuId === menuId).length === 0 ? (
              <EmptyState title="No variants" />
            ) : (
              data.variants
                .filter((v) => v.menuId === menuId)
                .map((v) => (
                  <ListRow
                    key={v.id}
                    title={v.name}
                    subtitle={`${data.items.filter((i) => i.variants.some((x) => x.variantId === v.id)).length} items`}
                    onClick={canEdit ? () => setVariant(v) : undefined}
                  />
                ))
            )}
          </div>
        ) : null}

        {tab === "addons" ? (
          <div className="space-y-2">
            {canCreate ? (
              <Button className="tap" onClick={() => setGroup("new")}>
                <Plus className="size-4" /> Add-on group
              </Button>
            ) : null}
            {data.addonGroups.filter((g) => g.menuId === menuId).length === 0 ? (
              <EmptyState title="No add-on groups" />
            ) : (
              data.addonGroups
                .filter((g) => g.menuId === menuId)
                .map((g) => (
                  <ListRow
                    key={g.id}
                    muted={!g.active}
                    title={g.name}
                    subtitle={`${g.min === g.max ? `pick ${g.max}` : `pick ${g.min}–${g.max}`} · ${g.options.map((o) => `${o.name}${o.price ? ` +${money(o.price)}` : ""}`).join(", ")}`}
                    onClick={canEdit ? () => setGroup(g) : undefined}
                  />
                ))
            )}
          </div>
        ) : null}

        {tab === "menus" ? (
          <div className="space-y-2">
            {canCreate ? (
              <Button className="tap" onClick={() => setMenuEdit("new")}>
                <Plus className="size-4" /> Menu
              </Button>
            ) : null}
            {menus.map((m) => (
              <ListRow
                key={m.id}
                muted={!m.active}
                title={`${m.name}${m.isDefault ? " · default" : ""}`}
                subtitle={
                  m.isDefault
                    ? "Used when no other menu matches"
                    : `${m.sectionIds.length ? m.sectionIds.map((id) => data.sections.find((s) => s.id === id)?.name).join(", ") : "any section"} · ${m.orderTypes.length ? m.orderTypes.map((t) => ORDER_TYPE_LABEL[t]).join(", ") : "any order type"}`
                }
                onClick={canEdit ? () => setMenuEdit(m) : undefined}
              />
            ))}
          </div>
        ) : null}
      </div>

      {item ? (
        <ItemSheet
          key={item === "new" ? "new" : item.id}
          menuId={menuId}
          initial={item === "new" ? null : item}
          onClose={() => setItem(null)}
        />
      ) : null}
      {category ? (
        <CategorySheet
          menuId={menuId}
          initial={category === "new" ? null : category}
          rank={categories.length + 1}
          onClose={() => setCategory(null)}
        />
      ) : null}
      {variant ? (
        <VariantSheet
          menuId={menuId}
          initial={variant === "new" ? null : variant}
          onClose={() => setVariant(null)}
        />
      ) : null}
      {group ? (
        <AddonGroupSheet
          menuId={menuId}
          initial={group === "new" ? null : group}
          onClose={() => setGroup(null)}
        />
      ) : null}
      {menuEdit ? (
        <MenuSheet
          initial={menuEdit === "new" ? null : menuEdit}
          onClose={() => setMenuEdit(null)}
        />
      ) : null}
      <ImportMenuSheet
        menu={menus.find((m) => m.id === menuId)}
        open={csv === "import"}
        onOpenChange={(o) => setCsv(o ? "import" : null)}
      />
      <ExportMenuSheet
        menu={menus.find((m) => m.id === menuId)}
        open={csv === "export"}
        onOpenChange={(o) => setCsv(o ? "export" : null)}
      />
    </AppShell>
  );
}
