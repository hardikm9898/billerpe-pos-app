import { Image as ImageIcon, Plus, ScanBarcode, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Field, FormError, SearchSelect, Segmented } from "@/components/pos/kit";
import { PhotoPickerSheet } from "@/components/pos/menu/Photos";
import { photoSrc } from "@/lib/pos/photos";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, NumberField, Spinner, VegMark } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { canScan, scanBarcode, ScannerNotReady } from "@/lib/pos/scanner";
import { usePos } from "@/lib/pos/store";
import {
  DIETARY_LABEL,
  ORDER_TYPE_LABEL,
  type AddonGroup,
  type AddonOption,
  type Dietary,
  type ItemVariant,
  type MenuCatalog,
  type MenuCategory,
  type MenuItem,
  type OrderType,
  type Variant,
} from "@/lib/pos/types";

// Editors for the real menu model: a menu owns its categories, items,
// variants and addon groups.

const DIETS: Dietary[] = ["veg", "nonveg", "egg", "jain", "vegan", "swaminarayan"];

function SheetFooter({
  busy,
  onSave,
  onDelete,
}: {
  busy: boolean;
  onSave: () => void;
  onDelete?: (() => void) | undefined;
}) {
  return (
    <div className="flex gap-2">
      {onDelete ? (
        <Button
          variant="outline"
          className="tap text-destructive"
          aria-label="Delete"
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : null}
      <Button className="tap flex-1" disabled={busy} onClick={onSave}>
        {busy ? <Spinner /> : null} Save
      </Button>
    </div>
  );
}

/* ------------------------------ item ------------------------------ */

export function ItemSheet({
  menuId,
  initial,
  onClose,
}: {
  menuId: string;
  initial: MenuItem | null;
  onClose: () => void;
}) {
  const pos = usePos();
  const data = pos.data!;
  const categories = data.categories.filter((c) => c.menuId === menuId);
  const variants = data.variants.filter((v) => v.menuId === menuId);
  const groups = data.addonGroups.filter((g) => g.menuId === menuId);
  const [picking, setPicking] = useState(false);
  const [f, setF] = useState<Omit<MenuItem, "id">>(
    initial ?? {
      menuId,
      categoryId: categories[0]?.id ?? "",
      name: "",
      shortCode: "",
      price: 0,
      dietary: "veg",
      gstType: "G",
      description: "",
      favorite: false,
      active: true,
      outOfStock: false,
      variants: [],
      addonGroupIds: [],
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...p }));
    setError(null);
  };
  const toggleVariant = (v: Variant) =>
    set({
      variants: f.variants.some((x) => x.variantId === v.id)
        ? f.variants.filter((x) => x.variantId !== v.id)
        : [...f.variants, { variantId: v.id, name: v.name, price: f.price || 0 }],
    });
  const setVariantPrice = (id: string, price: number) =>
    set({
      variants: f.variants.map((x: ItemVariant) => (x.variantId === id ? { ...x, price } : x)),
    });

  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit ${initial.name}` : "New item"}
      footer={
        <SheetFooter
          busy={busy}
          onSave={async () => {
            setBusy(true);
            const r = await pos.act((b) => b.saveItem({ ...f, id: initial?.id }));
            setBusy(false);
            if (!r.ok) return setError(r.error);
            toast.success(`${f.name} saved`);
            onClose();
          }}
          onDelete={
            initial && pos.can("menu", "delete")
              ? async () => {
                  const r = await pos.act((b) => b.deleteItem(initial.id));
                  if (!r.ok) return setError(r.error);
                  toast.success(`${initial.name} deleted`);
                  onClose();
                }
              : undefined
          }
        />
      }
    >
      <div className="space-y-3 py-2">
        <div className="flex items-center gap-3">
          {f.imageUrl ? (
            <img src={photoSrc(f.imageUrl)} alt="" className="size-16 rounded-md object-cover" />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
              Photo
            </span>
          )}
          {/* Photos come only from BillerPe's library (owner 2026-10-09): no camera, no uploads. */}
          <Button variant="outline" className="tap" onClick={() => setPicking(true)}>
            <ImageIcon className="size-4" /> {f.imageUrl ? "Change photo" : "Choose photo"}
          </Button>
          {f.imageUrl ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove photo"
              onClick={() => set({ imageUrl: undefined })}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
        <PhotoPickerSheet open={picking} onOpenChange={setPicking} itemName={f.name} menuId={initial?.id ?? null} onPick={(p) => set({ imageUrl: p.url })} />
        <Field label="Name *">
          <Input
            className="tap"
            maxLength={60}
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Short code *">
            <Input
              className="tap uppercase"
              maxLength={8}
              value={f.shortCode}
              onChange={(e) => set({ shortCode: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label={f.variants.length ? "Base price ₹" : "Price ₹ *"}>
            <NumberField value={f.price} onChange={(v) => set({ price: v })} />
          </Field>
        </div>
        <Field label="Category *">
          <SearchSelect
            value={f.categoryId || undefined}
            options={categories
              .filter((c) => c.active || c.id === f.categoryId)
              .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
              .map((c) => ({ id: c.id, label: c.active ? c.name : `${c.name} (hidden)` }))}
            onChange={(id) => set({ categoryId: id })}
            placeholder="Choose a category"
            searchPlaceholder="Search categories"
            empty="No category matches. Add it in the Categories tab."
          />
        </Field>
        <Field label="Food type">
          <div className="flex flex-wrap gap-1.5">
            {DIETS.map((d) => (
              <Chip key={d} active={f.dietary === d} onClick={() => set({ dietary: d })}>
                <VegMark type={d} /> {DIETARY_LABEL[d]}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="GST type">
          <Segmented
            value={f.gstType}
            onChange={(v) => set({ gstType: v })}
            options={[
              { id: "G", label: "Goods" },
              { id: "S", label: "Services" },
            ]}
          />
        </Field>
        <Field
          label="Variants"
          hint="Each variant has its own price. Add variants in the Variants tab."
        >
          {variants.length === 0 ? (
            <p className="text-xs text-muted-foreground">No variants in this menu yet.</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {variants.map((v) => (
              <Chip
                key={v.id}
                active={f.variants.some((x) => x.variantId === v.id)}
                onClick={() => toggleVariant(v)}
              >
                <span translate="no">{v.name}</span>
              </Chip>
            ))}
          </div>
          {f.variants.map((v) => (
            <div key={v.variantId} className="mt-2 flex items-center gap-2">
              <span className="w-24 text-sm font-semibold">
                <span translate="no">{v.name}</span>
              </span>
              <NumberField
                className="flex-1"
                value={v.price}
                onChange={(p) => setVariantPrice(v.variantId, p)}
              />
            </div>
          ))}
        </Field>
        <Field label="Add-on groups">
          {groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">No add-on groups in this menu yet.</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <Chip
                key={g.id}
                active={f.addonGroupIds.includes(g.id)}
                onClick={() =>
                  set({
                    addonGroupIds: f.addonGroupIds.includes(g.id)
                      ? f.addonGroupIds.filter((x) => x !== g.id)
                      : [...f.addonGroupIds, g.id],
                  })
                }
              >
                <span translate="no">{g.name}</span>
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Description">
          <Textarea
            rows={2}
            maxLength={200}
            value={f.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
        <Field label="Barcode">
          <div className="flex gap-2">
            <Input
              className="tap"
              value={f.barcode ?? ""}
              onChange={(e) => set({ barcode: e.target.value || undefined })}
            />
            {canScan() ? (
              <Button
                type="button"
                variant="outline"
                className="tap shrink-0"
                aria-label="Scan the item's barcode"
                onClick={async () => {
                  try {
                    const code = await scanBarcode();
                    if (code) set({ barcode: code });
                  } catch (e) {
                    toast.error(
                      e instanceof ScannerNotReady ? e.message : "Could not open the scanner",
                    );
                  }
                }}
              >
                <ScanBarcode className="size-4" /> Scan
              </Button>
            ) : null}
          </div>
        </Field>
        {/* One switch per row, as on the settings screens (owner bug list item 13:
            three in a row did not fit a phone). */}
        <div className="divide-y divide-border rounded-md border border-border">
          {(
            [
              [
                "Active",
                "Shown on the menu for ordering.",
                f.active,
                (v: boolean) => set({ active: v }),
              ],
              [
                "Favourite",
                "Listed first on the order screen.",
                f.favorite,
                (v: boolean) => set({ favorite: v }),
              ],
              [
                "In stock",
                "Off: shown as out of stock, cannot be ordered.",
                !f.outOfStock,
                (v: boolean) => set({ outOfStock: !v }),
              ],
            ] as const
          ).map(([label, hint, checked, onChange]) => (
            <label
              key={label}
              className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 text-sm font-semibold"
            >
              <span className="min-w-0">
                {label}
                <span className="block text-xs font-normal text-muted-foreground">{hint}</span>
              </span>
              <Switch checked={checked} onCheckedChange={onChange} />
            </label>
          ))}
        </div>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

/* ------------------------------ category / variant ------------------------------ */

export function CategorySheet({
  menuId,
  initial,
  rank,
  onClose,
}: {
  menuId: string;
  initial: MenuCategory | null;
  rank: number;
  onClose: () => void;
}) {
  const pos = usePos();
  const [name, setName] = useState(initial?.name ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit ${initial.name}` : "New category"}
      footer={
        <SheetFooter
          busy={busy}
          onSave={async () => {
            setBusy(true);
            const r = await pos.act((b) =>
              b.saveCategory({
                id: initial?.id,
                menuId,
                name,
                active,
                rank: initial?.rank ?? rank,
              }),
            );
            setBusy(false);
            if (!r.ok) return setError(r.error);
            onClose();
          }}
          onDelete={
            initial
              ? async () => {
                  const r = await pos.act((b) => b.deleteCategory(initial.id));
                  if (!r.ok) return setError(r.error);
                  onClose();
                }
              : undefined
          }
        />
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Name *">
          <Input
            className="tap"
            maxLength={40}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <label className="flex items-center justify-between text-sm font-semibold">
          Show on the menu <Switch checked={active} onCheckedChange={setActive} />
        </label>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

export function VariantSheet({
  menuId,
  initial,
  onClose,
}: {
  menuId: string;
  initial: Variant | null;
  onClose: () => void;
}) {
  const pos = usePos();
  const [name, setName] = useState(initial?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit variant ${initial.name}` : "New variant"}
      description="Variants like Half / Full or Small / Large. Each item sets its own price per variant."
      footer={
        <SheetFooter
          busy={busy}
          onSave={async () => {
            setBusy(true);
            const r = await pos.act((b) => b.saveVariant({ id: initial?.id, menuId, name }));
            setBusy(false);
            if (!r.ok) return setError(r.error);
            toast.success(`${name.trim()} saved`);
            onClose();
          }}
          onDelete={
            initial && pos.can("menu", "delete")
              ? async () => {
                  const r = await pos.act((b) => b.deleteVariant(initial.id));
                  if (!r.ok) return setError(r.error);
                  toast.success(`${initial.name} deleted`);
                  onClose();
                }
              : undefined
          }
        />
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Variant name *">
          <Input
            className="tap"
            maxLength={30}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Half"
          />
        </Field>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

/* ------------------------------ addon group ------------------------------ */

export function AddonGroupSheet({
  menuId,
  initial,
  onClose,
}: {
  menuId: string;
  initial: AddonGroup | null;
  onClose: () => void;
}) {
  const pos = usePos();
  const [f, setF] = useState<Omit<AddonGroup, "id">>(
    initial ?? {
      menuId,
      name: "",
      min: 0,
      max: 1,
      single: true,
      active: true,
      options: [{ id: crypto.randomUUID().slice(0, 8), name: "", price: 0, dietary: "veg" }],
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setOpt = (id: string, p: Partial<AddonOption>) =>
    setF({ ...f, options: f.options.map((o) => (o.id === id ? { ...o, ...p } : o)) });
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit ${initial.name}` : "New add-on group"}
      footer={
        <SheetFooter
          busy={busy}
          onSave={async () => {
            setBusy(true);
            const r = await pos.act((b) => b.saveAddonGroup({ ...f, id: initial?.id }));
            setBusy(false);
            if (!r.ok) return setError(r.error);
            onClose();
          }}
          onDelete={
            initial
              ? async () => {
                  await pos.act((b) => b.deleteAddonGroup(initial.id));
                  onClose();
                }
              : undefined
          }
        />
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Group name *">
          <Input
            className="tap"
            maxLength={40}
            value={f.name}
            onChange={(e) => {
              setF({ ...f, name: e.target.value });
              setError(null);
            }}
            placeholder="e.g. Spice level"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Pick at least" hint="0 = optional">
            <NumberField
              decimals={0}
              value={f.min}
              onChange={(v) => setF({ ...f, min: Math.floor(v) })}
            />
          </Field>
          <Field label="Pick at most" hint="1 = choose one">
            <NumberField
              decimals={0}
              value={f.max}
              onChange={(v) => setF({ ...f, max: Math.max(1, Math.floor(v)) })}
            />
          </Field>
        </div>
        <Field label="Options">
          <div className="space-y-2">
            {f.options.map((o) => (
              <div key={o.id} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Veg or non-veg"
                  onClick={() =>
                    setOpt(o.id, { dietary: o.dietary === "nonveg" ? "veg" : "nonveg" })
                  }
                >
                  <VegMark type={o.dietary} />
                </button>
                <Input
                  className="tap flex-1"
                  placeholder="Option"
                  value={o.name}
                  onChange={(e) => setOpt(o.id, { name: e.target.value })}
                />
                <NumberField
                  className="w-24"
                  value={o.price}
                  onChange={(v) => setOpt(o.id, { price: v })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove option"
                  onClick={() => setF({ ...f, options: f.options.filter((x) => x.id !== o.id) })}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="tap"
              onClick={() =>
                setF({
                  ...f,
                  options: [
                    ...f.options,
                    { id: crypto.randomUUID().slice(0, 8), name: "", price: 0, dietary: "veg" },
                  ],
                })
              }
            >
              <Plus className="size-4" /> Option
            </Button>
          </div>
        </Field>
        <label className="flex items-center justify-between text-sm font-semibold">
          Active <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />
        </label>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

/* ------------------------------ menu ------------------------------ */

export function MenuSheet({
  initial,
  onClose,
}: {
  initial: MenuCatalog | null;
  onClose: () => void;
}) {
  const pos = usePos();
  const data = pos.data!;
  const [f, setF] = useState<Omit<MenuCatalog, "id">>(
    initial ?? { name: "", isDefault: false, active: true, sectionIds: [], orderTypes: [] },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit ${initial.name}` : "New menu"}
      description="Each menu has its own categories, items and prices. An order uses the menu set for its table section / order type, else the default menu."
      footer={
        <SheetFooter
          busy={busy}
          onSave={async () => {
            setBusy(true);
            const r = await pos.act((b) => b.saveMenu({ ...f, id: initial?.id }));
            setBusy(false);
            if (!r.ok) return setError(r.error);
            onClose();
          }}
        />
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Menu name *">
          <Input
            className="tap"
            maxLength={40}
            value={f.name}
            onChange={(e) => {
              setF({ ...f, name: e.target.value });
              setError(null);
            }}
            placeholder="e.g. Garden Menu"
          />
        </Field>
        <label className="flex items-center justify-between text-sm font-semibold">
          Default menu{" "}
          <Switch checked={f.isDefault} onCheckedChange={(v) => setF({ ...f, isDefault: v })} />
        </label>
        {!f.isDefault ? (
          <>
            <Field label="Used for these sections">
              <div className="flex flex-wrap gap-1.5">
                {data.sections.map((s) => (
                  <Chip
                    key={s.id}
                    active={f.sectionIds.includes(s.id)}
                    onClick={() =>
                      setF({
                        ...f,
                        sectionIds: f.sectionIds.includes(s.id)
                          ? f.sectionIds.filter((x) => x !== s.id)
                          : [...f.sectionIds, s.id],
                      })
                    }
                  >
                    <span translate="no">{s.name}</span>
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label="Used for these order types">
              <div className="flex gap-1.5">
                {(["dinin", "pickup"] as OrderType[]).map((t) => (
                  <Chip
                    key={t}
                    active={f.orderTypes.includes(t)}
                    onClick={() =>
                      setF({
                        ...f,
                        orderTypes: f.orderTypes.includes(t)
                          ? f.orderTypes.filter((x) => x !== t)
                          : [...f.orderTypes, t],
                      })
                    }
                  >
                    {ORDER_TYPE_LABEL[t]}
                  </Chip>
                ))}
              </div>
            </Field>
          </>
        ) : null}
        <label className="flex items-center justify-between text-sm font-semibold">
          Active <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />
        </label>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}
