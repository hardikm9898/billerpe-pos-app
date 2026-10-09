import { ImageOff, Search, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { backend, usePos } from "@/lib/pos/store";
import { initialTone, photoSrc } from "@/lib/pos/photos";
import type { LibPhoto, PhotoMatch } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

// Menu photos in the POS App (owner 2026-10-09). Photos come only from
// BillerPe's library: search (typos fine; related photos when nothing
// matches) and pick, "Match photos" for the menu, or ask BillerPe for a
// missing one. The phone's camera is never used for menu photos.

/** An item's small photo, else a coloured initial. */
export function ItemThumb({ name, url, className }: { name: string; url?: string | null | undefined; className?: string }) {
  const [broken, setBroken] = useState(false);
  const src = photoSrc(url);
  if (src && !broken) return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={cn("object-cover", className)} />;
  return (
    <span aria-hidden className={cn("grid place-items-center font-semibold text-foreground/60", className)} style={{ background: initialTone(name) }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Search the library and pick one photo. */
export function PhotoPickerSheet({ open, onOpenChange, itemName, menuId, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; itemName: string; menuId?: string | null; onPick: (p: LibPhoto) => void }) {
  const [q, setQ] = useState("");
  const [r, setR] = useState<{ matches: LibPhoto[]; related: LibPhoto[] } | null>(null);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (open) {
      setQ(itemName);
      setAsked(false);
    }
  }, [open, itemName]);
  useEffect(() => {
    if (!open) return;
    const h = setTimeout(() => {
      void backend.photoFind(q.trim()).then((x) => (x.ok ? setR({ matches: x.matches, related: x.related }) : toast.error(x.error)));
    }, 300);
    return () => clearTimeout(h);
  }, [open, q]);
  const ask = async () => {
    const x = await backend.photoRequest(menuId ?? null, itemName || q);
    if (!x.ok) {
      toast.error(x.error);
      return;
    }
    setAsked(true);
    toast.success(x.already ? "Already asked: BillerPe will add it." : "Asked BillerPe for this photo. It appears on the item when added.");
  };
  const grid = (list: LibPhoto[]) => (
    <div className="grid grid-cols-3 gap-2">
      {list.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => {
            onPick(p);
            onOpenChange(false);
          }}
          className="overflow-hidden rounded-lg border border-border text-left active:scale-[0.98]"
        >
          <img src={photoSrc(p.thumb || p.url)} alt={p.name} loading="lazy" className="aspect-square w-full object-cover" />
          <span className="line-clamp-2 px-1.5 py-1 text-[11px] font-semibold leading-tight">{p.name}</span>
        </button>
      ))}
    </div>
  );
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Choose a photo" description="From BillerPe's photo library. Spelling mistakes are fine.">
      <div className="space-y-3 py-2">
        <label className="flex items-center gap-2 rounded-md border border-input px-2">
          <Search className="size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search photos" placeholder="Dish name" className="tap border-0 px-0 shadow-none focus-visible:ring-0" />
        </label>
        {!r ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>
        ) : (
          <>
            {r.matches.length > 0 && grid(r.matches)}
            {r.related.length > 0 && (
              <>
                <p className="text-xs font-semibold text-muted-foreground">{r.matches.length ? "Related photos" : "No exact photo yet. Related ones:"}</p>
                {grid(r.related)}
              </>
            )}
            {!r.matches.length && !r.related.length && <p className="py-6 text-center text-sm text-muted-foreground">No photos found.</p>}
            {!r.matches.length && (
              <div className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
                <span>Not the right dish? BillerPe can add it to the library.</span>
                <Button variant="outline" className="tap" disabled={asked} onClick={() => void ask()}>
                  <Send className="size-4" /> {asked ? "Asked" : "Ask BillerPe for this photo"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </ResponsiveSheet>
  );
}

/** "Match photos": the library's best photo for every item without one; clear matches ticked, saved on confirm. */
export function MatchPhotosSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const pos = usePos();
  const [d, setD] = useState<{ items: PhotoMatch[]; total: number; withPhoto: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [chosen, setChosen] = useState<Record<string, LibPhoto>>({});
  const [picking, setPicking] = useState<PhotoMatch | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setD(null);
    setError(null);
    setChosen({});
    void backend.photoMenu(false).then((x) => {
      if (!x.ok) return setError(x.error);
      setD(x);
      setTicked(Object.fromEntries(x.items.map((i) => [String(i.menuId), i.sure && !!i.best])));
    });
  }, [open]);
  const pick = (i: PhotoMatch) => chosen[String(i.menuId)] || i.best;
  const toSave = (d?.items || []).filter((i) => ticked[String(i.menuId)] && pick(i));
  const save = async () => {
    setBusy(true);
    const r = await pos.act((b) => b.photoSet(toSave.map((i) => ({ menuId: String(i.menuId), photoId: pick(i)!.id }))));
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(`${r.set} photo${r.set === 1 ? "" : "s"} saved`);
    onOpenChange(false);
  };
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Match photos"
      description={d ? `${d.total - d.withPhoto} of ${d.total} items have no photo. Clear matches are ticked: check them, change any, then save.` : undefined}
      footer={
        <Button className="tap w-full" disabled={!toSave.length || busy} onClick={() => void save()}>
          {busy ? "Saving…" : `Save ${toSave.length || ""} photo${toSave.length === 1 ? "" : "s"}`}
        </Button>
      }
    >
      <div className="space-y-2 py-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!d && !error && <p className="py-6 text-center text-sm text-muted-foreground">Finding photos…</p>}
        {d && !d.items.length && <p className="py-6 text-center text-sm text-muted-foreground">Every item has a photo.</p>}
        {(d?.items || []).map((i) => {
          const k = String(i.menuId);
          const p = pick(i);
          return (
            <div key={k} className={cn("flex items-center gap-3 rounded-lg border px-2.5 py-2", ticked[k] && p ? "border-primary/50 bg-primary-soft/30" : "border-border")}>
              <Checkbox checked={!!ticked[k] && !!p} disabled={!p} onCheckedChange={(v) => setTicked((t) => ({ ...t, [k]: !!v }))} aria-label={`Use the photo for ${i.name}`} />
              <button type="button" onClick={() => setPicking(i)} aria-label={`Choose a photo for ${i.name}`} className="shrink-0">
                {p ? (
                  <img src={photoSrc(p.thumb || p.url)} alt="" className="size-12 rounded-md object-cover" />
                ) : (
                  <span className="grid size-12 place-items-center rounded-md bg-muted text-muted-foreground">
                    <ImageOff className="size-4" />
                  </span>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  <span translate="no">{i.name}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{chosen[k] ? "your choice" : p ? `${p.name}${p.score ? ` · ${p.score}%` : ""}` : "no match: choose one"}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPicking(i)}>
                Choose
              </Button>
            </div>
          );
        })}
      </div>
      <PhotoPickerSheet
        open={!!picking}
        onOpenChange={(o) => !o && setPicking(null)}
        itemName={picking?.name || ""}
        menuId={picking ? String(picking.menuId) : null}
        onPick={(p) => {
          if (!picking) return;
          setChosen((c) => ({ ...c, [String(picking.menuId)]: p }));
          setTicked((t) => ({ ...t, [String(picking.menuId)]: true }));
        }}
      />
    </ResponsiveSheet>
  );
}
