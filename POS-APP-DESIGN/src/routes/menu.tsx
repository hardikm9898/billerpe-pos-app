import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Camera, ImagePlus, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Field, FormError, ListRow, readImage, Segmented } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, NumberField, Spinner, VegMark } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { money } from "@/lib/pos/format";
import { can } from "@/lib/pos/permissions";
import { usePos } from "@/lib/pos/store";
import type { AddonGroup, MenuCategory, MenuItem, MenuList, VegType } from "@/lib/pos/types";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu — BillerPe POS" },
      { name: "description", content: "Items, categories, variants, addon groups and menus with their own prices." },
      { property: "og:title", content: "Menu — BillerPe POS" },
      { property: "og:description", content: "Items, categories, variants, addon groups and menus with their own prices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MenuPage,
});

type Tab = "items" | "categories" | "variants" | "addons" | "menus";
const vegTypes: { id: VegType; label: string }[] = [
  { id: "veg", label: "Veg" }, { id: "nonveg", label: "Non-veg" }, { id: "egg", label: "Egg" }, { id: "jain", label: "Jain" }, { id: "vegan", label: "Vegan" },
];
let seq = 1;
const uid = (p: string) => `${p}-${Date.now().toString(36)}${seq++}`;

function MenuPage() {
  const pos = usePos();
  const edit = can(pos.permissions, "menu", "edit");
  const [tab, setTab] = useState<Tab>("items");
  const [query, setQuery] = useState("");
  const [item, setItem] = useState<MenuItem | null>(null);
  const [cat, setCat] = useState<MenuCategory | null>(null);
  const [group, setGroup] = useState<AddonGroup | null>(null);
  const [menu, setMenu] = useState<MenuList | null>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pos.menuItems.filter((i) => !q || i.name.toLowerCase().includes(q) || i.shortCode.toLowerCase().includes(q));
  }, [pos.menuItems, query]);

  const newItem = (): MenuItem => ({
    id: uid("itm"), name: "", shortCode: "", categoryId: pos.categories[0]?.id ?? "", price: 0, vegType: "veg",
    kitchen: pos.outlet.kitchens[0] ?? "Main Kitchen", menuIds: pos.menus.map((m) => m.id), active: true, taxRate: 0.05, variants: [], addonGroups: [],
  });

  return (
    <AppShell title="Menu">
      <div className="space-y-3">
        <Segmented value={tab} onChange={setTab} options={[
          { id: "items", label: "Items" }, { id: "categories", label: "Categories" }, { id: "variants", label: "Variants" },
          { id: "addons", label: "Addon groups" }, { id: "menus", label: "Menus" },
        ]} />

        {tab === "items" ? (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="tap pl-9" placeholder="Search name or short code" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              {edit ? <Button className="tap" onClick={() => setItem(newItem())}><Plus className="size-4" /> Item</Button> : null}
            </div>
            {items.length === 0 ? (
              <EmptyState title="No items" body={query ? "Nothing matches your search." : "Add your first menu item."} />
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {items.map((i) => (
                  <div key={i.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-2 shadow-soft">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => edit && setItem(i)}>
                      {i.photo ? (
                        <img src={i.photo} alt="" className="size-12 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted font-display text-xs font-bold text-muted-foreground">{i.shortCode}</span>
                      )}
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-semibold"><VegMark type={i.vegType} /> <span className="truncate">{i.name}</span></span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {money(i.price)} · {pos.categories.find((c) => c.id === i.categoryId)?.name} · {i.kitchen}{i.active === false ? " · Inactive" : ""}
                        </span>
                      </span>
                    </button>
                    <label className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
                      <Switch checked={!i.outOfStock} disabled={!edit} onCheckedChange={() => void pos.toggleOutOfStock(i.id)} aria-label={`${i.name} in stock`} />
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
            {edit ? <Button className="tap" onClick={() => setCat({ id: uid("cat"), name: "", sort: pos.categories.length + 1 })}><Plus className="size-4" /> Category</Button> : null}
            {pos.categories.length === 0 ? <EmptyState title="No categories" /> : pos.categories.map((c, idx) => (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={`${pos.menuItems.filter((i) => i.categoryId === c.id).length} items · sort ${c.sort}`}
                onClick={edit ? () => setCat(c) : undefined}
                right={edit ? (
                  <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" aria-label="Move up" disabled={idx === 0} onClick={() => {
                      const prev = pos.categories[idx - 1]!;
                      void pos.saveCategory({ ...c, sort: prev.sort }); void pos.saveCategory({ ...prev, sort: c.sort });
                    }}><ArrowUp className="size-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Move down" disabled={idx === pos.categories.length - 1} onClick={() => {
                      const next = pos.categories[idx + 1]!;
                      void pos.saveCategory({ ...c, sort: next.sort }); void pos.saveCategory({ ...next, sort: c.sort });
                    }}><ArrowDown className="size-4" /></Button>
                  </span>
                ) : undefined}
              />
            ))}
          </div>
        ) : null}

        {tab === "variants" ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Variants belong to an item (e.g. Half / Full). Tap an item to edit its variants.</p>
            {pos.menuItems.filter((i) => i.variants?.length).length === 0 ? <EmptyState title="No items with variants" /> : pos.menuItems.filter((i) => i.variants?.length).map((i) => (
              <ListRow key={i.id} title={i.name} subtitle={i.variants!.map((v) => `${v.name} ${money(v.price)}`).join(" · ")} onClick={edit ? () => setItem(i) : undefined} />
            ))}
          </div>
        ) : null}

        {tab === "addons" ? (
          <div className="space-y-2">
            {edit ? <Button className="tap" onClick={() => setGroup({ id: uid("ag"), name: "", min: 0, max: 1, options: [{ id: uid("ao"), name: "", price: 0 }] })}><Plus className="size-4" /> Addon group</Button> : null}
            {pos.addonGroups.length === 0 ? <EmptyState title="No addon groups" body="Create groups like Spice level or Extras." /> : pos.addonGroups.map((g) => (
              <ListRow key={g.id} title={g.name} subtitle={`${g.max === 1 ? "Single" : "Multi"} choice · min ${g.min}, max ${g.max} · ${g.options.map((o) => o.name).join(", ")}`} onClick={edit ? () => setGroup(g) : undefined} />
            ))}
          </div>
        ) : null}

        {tab === "menus" ? (
          <div className="space-y-2">
            {edit ? <Button className="tap" onClick={() => setMenu({ id: uid("menu"), name: "" })}><Plus className="size-4" /> Menu</Button> : null}
            {pos.menus.map((m) => (
              <ListRow key={m.id} title={m.name} subtitle={`${pos.menuItems.filter((i) => i.menuIds.includes(m.id)).length} items · ${pos.menuItems.filter((i) => i.menuPrices?.[m.id] !== undefined).length} own prices`} onClick={edit ? () => setMenu(m) : undefined} />
            ))}
          </div>
        ) : null}
      </div>

      {item ? <ItemSheet key={item.id} initial={item} isNew={!pos.menuItems.some((i) => i.id === item.id)} onClose={() => setItem(null)} /> : null}
      {cat ? <CategorySheet key={cat.id} initial={cat} onClose={() => setCat(null)} /> : null}
      {group ? <AddonSheet key={group.id} initial={group} onClose={() => setGroup(null)} /> : null}
      {menu ? <MenuSheet key={menu.id} initial={menu} onClose={() => setMenu(null)} /> : null}
    </AppShell>
  );
}

function ItemSheet({ initial, isNew, onClose }: { initial: MenuItem; isNew: boolean; onClose: () => void }) {
  const pos = usePos();
  const [f, setF] = useState<MenuItem>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<MenuItem>) => { setF((x) => ({ ...x, ...p })); setError(null); };

  const onPhoto = async (file?: File) => {
    if (!file) return;
    try { set({ photo: await readImage(file) }); } catch (e) { setError((e as Error).message); }
  };

  const save = async () => {
    if (f.variants?.some((v) => !v.name.trim() || v.price <= 0)) return setError("Every variant needs a name and price");
    setBusy(true);
    const res = await pos.saveMenuItem(f);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Could not save");
    toast.success(`${f.name} saved`);
    onClose();
  };

  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? "Add item" : `Edit ${initial.name}`}
      footer={
        <div className="flex gap-2">
          {!isNew ? <Button variant="outline" className="tap text-destructive" onClick={() => { void pos.deleteMenuItem(f.id); toast.success("Item deleted"); onClose(); }}><Trash2 className="size-4" /></Button> : null}
          <Button className="tap flex-1" disabled={busy} onClick={() => void save()}>{busy ? <Spinner /> : null} Save item</Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div className="flex items-center gap-3">
          {f.photo ? <img src={f.photo} alt="" className="size-20 rounded-lg object-cover" /> : <span className="flex size-20 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ImagePlus className="size-6" /></span>}
          <div className="grid flex-1 gap-2">
            <label className="tap inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border text-sm font-semibold">
              <Camera className="size-4" /> Camera
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onPhoto(e.target.files?.[0])} />
            </label>
            <label className="tap inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border text-sm font-semibold">
              <ImagePlus className="size-4" /> Gallery
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onPhoto(e.target.files?.[0])} />
            </label>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2"><Field label="Name *" htmlFor="it-name"><Input id="it-name" className="tap" maxLength={60} value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field></div>
          <Field label="Short code *" htmlFor="it-code"><Input id="it-code" className="tap uppercase" maxLength={6} value={f.shortCode} onChange={(e) => set({ shortCode: e.target.value.replace(/[^a-z0-9]/gi, "") })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Category">
            <Select value={f.categoryId} onValueChange={(v) => set({ categoryId: v, kitchen: pos.billingSettings.categoryKitchen[v] ?? f.kitchen })}>
              <SelectTrigger className="tap"><SelectValue /></SelectTrigger>
              <SelectContent>{pos.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Price ₹ *"><NumberField value={f.price} onChange={(v) => set({ price: v })} /></Field>
          <Field label="Tax">
            <Select value={String(f.taxRate ?? 0.05)} onValueChange={(v) => set({ taxRate: Number(v) })}>
              <SelectTrigger className="tap"><SelectValue /></SelectTrigger>
              <SelectContent>{[0, 0.05, 0.12, 0.18].map((t) => <SelectItem key={t} value={String(t)}>GST {t * 100}%</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Kitchen">
            <Select value={f.kitchen} onValueChange={(v) => set({ kitchen: v })}>
              <SelectTrigger className="tap"><SelectValue /></SelectTrigger>
              <SelectContent>{pos.outlet.kitchens.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Veg type">
          <div className="flex flex-wrap gap-2">{vegTypes.map((v) => <Chip key={v.id} active={f.vegType === v.id} onClick={() => set({ vegType: v.id })}><VegMark type={v.id} /> {v.label}</Chip>)}</div>
        </Field>

        <Field label="Variants" hint="Leave empty if the item has one price.">
          <div className="space-y-2">
            {(f.variants ?? []).map((v, idx) => (
              <div key={v.id} className="flex gap-2">
                <Input className="tap flex-1" placeholder="e.g. Half" value={v.name} onChange={(e) => set({ variants: f.variants!.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)) })} />
                <NumberField className="w-28" value={v.price} onChange={(p) => set({ variants: f.variants!.map((x, i) => (i === idx ? { ...x, price: p } : x)) })} />
                <Button variant="ghost" size="icon" aria-label="Remove variant" onClick={() => set({ variants: f.variants!.filter((_, i) => i !== idx) })}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => set({ variants: [...(f.variants ?? []), { id: uid("v"), name: "", price: f.price }] })}><Plus className="size-4" /> Variant</Button>
          </div>
        </Field>

        <Field label="Addon groups">
          {pos.addonGroups.length === 0 ? <p className="text-sm text-muted-foreground">No addon groups yet.</p> : (
            <div className="flex flex-wrap gap-2">
              {pos.addonGroups.map((g) => {
                const on = f.addonGroups?.some((x) => x.id === g.id);
                return <Chip key={g.id} active={on} onClick={() => set({ addonGroups: on ? f.addonGroups!.filter((x) => x.id !== g.id) : [...(f.addonGroups ?? []), g] })}>{g.name}</Chip>;
              })}
            </div>
          )}
        </Field>

        <Field label="Menus">
          <div className="space-y-2">
            {pos.menus.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm font-semibold">
                <Checkbox checked={f.menuIds.includes(m.id)} onCheckedChange={(c) => set({ menuIds: c ? [...f.menuIds, m.id] : f.menuIds.filter((x) => x !== m.id) })} /> {m.name}
              </label>
            ))}
          </div>
        </Field>
        <label className="flex items-center justify-between rounded-lg border border-border p-3 text-sm font-semibold">
          Active (shows on order screens) <Switch checked={f.active !== false} onCheckedChange={(v) => set({ active: v })} />
        </label>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

function CategorySheet({ initial, onClose }: { initial: MenuCategory; onClose: () => void }) {
  const pos = usePos();
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const exists = pos.categories.some((c) => c.id === initial.id);
  return (
    <ResponsiveSheet open onOpenChange={(o) => !o && onClose()} title={exists ? "Edit category" : "Add category"} footer={
      <div className="flex gap-2">
        {exists ? <Button variant="outline" className="tap text-destructive" onClick={async () => { const r = await pos.deleteCategory(f.id); if (r.ok) onClose(); else setError(r.error ?? ""); }}><Trash2 className="size-4" /></Button> : null}
        <Button className="tap flex-1" onClick={async () => { const r = await pos.saveCategory({ ...f, name: f.name.trim() }); if (r.ok) { toast.success("Category saved"); onClose(); } else setError(r.error ?? ""); }}>Save</Button>
      </div>
    }>
      <div className="space-y-3 py-2">
        <Field label="Name *"><Input className="tap" maxLength={40} value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setError(null); }} /></Field>
        <Field label="Sort order"><NumberField decimals={0} value={f.sort} onChange={(v) => setF({ ...f, sort: Math.floor(v) })} /></Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

function AddonSheet({ initial, onClose }: { initial: AddonGroup; onClose: () => void }) {
  const pos = usePos();
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const exists = pos.addonGroups.some((g) => g.id === initial.id);
  const single = f.max === 1;
  return (
    <ResponsiveSheet open onOpenChange={(o) => !o && onClose()} title={exists ? "Edit addon group" : "Add addon group"} footer={
      <div className="flex gap-2">
        {exists ? <Button variant="outline" className="tap text-destructive" onClick={() => { void pos.deleteAddonGroup(f.id); onClose(); }}><Trash2 className="size-4" /></Button> : null}
        <Button className="tap flex-1" onClick={async () => { const r = await pos.saveAddonGroup(f); if (r.ok) { toast.success("Addon group saved"); onClose(); } else setError(r.error ?? ""); }}>Save</Button>
      </div>
    }>
      <div className="space-y-3 py-2">
        <Field label="Name *"><Input className="tap" value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setError(null); }} placeholder="e.g. Spice level" /></Field>
        <Segmented value={single ? "single" : "multi"} onChange={(v) => setF({ ...f, max: v === "single" ? 1 : Math.max(2, f.options.length), min: Math.min(f.min, 1) })} options={[{ id: "single", label: "Single choice" }, { id: "multi", label: "Multiple choice" }]} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min"><NumberField decimals={0} value={f.min} onChange={(v) => setF({ ...f, min: Math.floor(v) })} /></Field>
          <Field label="Max"><NumberField decimals={0} value={f.max} onChange={(v) => setF({ ...f, max: Math.max(1, Math.floor(v)) })} /></Field>
        </div>
        <Field label="Options">
          <div className="space-y-2">
            {f.options.map((o, idx) => (
              <div key={o.id} className="flex gap-2">
                <Input className="tap flex-1" placeholder="Option" value={o.name} onChange={(e) => setF({ ...f, options: f.options.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)) })} />
                <NumberField className="w-24" value={o.price} onChange={(p) => setF({ ...f, options: f.options.map((x, i) => (i === idx ? { ...x, price: p } : x)) })} />
                <Button variant="ghost" size="icon" aria-label="Remove option" onClick={() => setF({ ...f, options: f.options.filter((_, i) => i !== idx) })}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setF({ ...f, options: [...f.options, { id: uid("ao"), name: "", price: 0 }] })}><Plus className="size-4" /> Option</Button>
          </div>
        </Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

function MenuSheet({ initial, onClose }: { initial: MenuList; onClose: () => void }) {
  const pos = usePos();
  const [name, setName] = useState(initial.name);
  const [error, setError] = useState<string | null>(null);
  const exists = pos.menus.some((m) => m.id === initial.id);
  return (
    <ResponsiveSheet open onOpenChange={(o) => !o && onClose()} title={exists ? initial.name : "Add menu"} description="Pick which items are on this menu and set its own prices." footer={
      <Button className="tap w-full" onClick={async () => { const r = await pos.saveMenuList({ ...initial, name: name.trim() }); if (r.ok) { toast.success("Menu saved"); onClose(); } else setError(r.error ?? ""); }}>Save menu</Button>
    }>
      <div className="space-y-3 py-2">
        <Field label="Menu name *"><Input className="tap" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="e.g. Garden Menu" /></Field>
        <FormError error={error} />
        {!exists ? <p className="text-sm text-muted-foreground">Save the menu first, then open it again to set items and prices.</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {pos.menuItems.map((i) => {
              const on = i.menuIds.includes(initial.id);
              const own = i.menuPrices?.[initial.id];
              return (
                <li key={i.id} className="flex items-center gap-2 px-3 py-2">
                  <Checkbox checked={on} onCheckedChange={(c) => void pos.setMenuPrice(i.id, initial.id, own ?? null, Boolean(c))} aria-label={`${i.name} on menu`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{i.name}<span className="block text-xs font-normal text-muted-foreground">Base {money(i.price)}</span></span>
                  <NumberField className="h-10 w-24" placeholder={String(i.price)} value={own ?? 0} onChange={(v) => void pos.setMenuPrice(i.id, initial.id, v > 0 ? v : null, on)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ResponsiveSheet>
  );
}
