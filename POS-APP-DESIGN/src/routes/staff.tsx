import { createFileRoute } from "@tanstack/react-router";
import { Lock, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/pos/AppShell";
import { Field, FormError, ListRow, Segmented } from "@/components/pos/kit";
import { ResponsiveSheet } from "@/components/pos/ResponsiveSheet";
import { Chip, EmptyState, Spinner } from "@/components/pos/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { can, canSpecial, moduleLabels, roleLabel, specialLabels } from "@/lib/pos/permissions";
import { usePos } from "@/lib/pos/store";
import type { CrudAction, ModuleKey, Permissions, Role, SpecialPermission, Staff } from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff & permissions — BillerPe POS" },
      { name: "description", content: "Staff list, roles, PINs and the roles & permissions matrix." },
      { property: "og:title", content: "Staff & permissions — BillerPe POS" },
      { property: "og:description", content: "Staff list, roles, PINs and the roles & permissions matrix." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffPage,
});

const roles: Role[] = ["manager", "captain", "cashier", "kitchen"];
const modules = Object.keys(moduleLabels) as ModuleKey[];
const actions: CrudAction[] = ["view", "create", "edit", "delete"];
const specials = Object.keys(specialLabels) as SpecialPermission[];

function StaffPage() {
  const pos = usePos();
  const editStaff = can(pos.permissions, "staff", "edit");
  const editPerms = canSpecial(pos.permissions, "editPermissions");
  const [tab, setTab] = useState<"staff" | "roles">("staff");
  const [editing, setEditing] = useState<Staff | null>(null);

  return (
    <AppShell title="Staff">
      <div className="space-y-3">
        <Segmented value={tab} onChange={setTab} options={[{ id: "staff", label: "Staff" }, { id: "roles", label: "Roles & permissions" }]} />
        {tab === "staff" ? (
          <>
            {editStaff ? (
              <Button className="tap" onClick={() => setEditing({ id: `stf-${Date.now()}`, name: "", mobile: "", role: "captain", pin: "", password: "", active: true })}>
                <Plus className="size-4" /> Add staff
              </Button>
            ) : null}
            {pos.staff.length === 0 ? <EmptyState title="No staff yet" /> : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {pos.staff.map((s) => {
                  const locked = s.isOwner && pos.user?.id !== s.id;
                  return (
                    <ListRow
                      key={s.id}
                      muted={!s.active}
                      title={<span className="flex items-center gap-1.5">{s.name}{s.isOwner ? <Lock className="size-3.5 text-muted-foreground" /> : null}</span>}
                      subtitle={`${roleLabel[s.role]} · ${s.mobile}${s.permissionOverrides ? " · custom permissions" : ""}`}
                      onClick={editStaff && !locked ? () => setEditing(s) : undefined}
                      right={<span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", s.active ? "bg-status-ready-soft text-status-ready" : "bg-muted text-muted-foreground")}>{s.active ? "Active" : "Inactive"}</span>}
                    />
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <PermissionMatrix editable={editPerms} />
        )}
      </div>
      {editing ? <StaffSheet key={editing.id} initial={editing} onClose={() => setEditing(null)} /> : null}
    </AppShell>
  );
}

function StaffSheet({ initial, onClose }: { initial: Staff; onClose: () => void }) {
  const pos = usePos();
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const exists = pos.staff.some((s) => s.id === initial.id);
  const set = (p: Partial<Staff>) => { setF((x) => ({ ...x, ...p })); setError(null); };
  return (
    <ResponsiveSheet open onOpenChange={(o) => !o && onClose()} title={exists ? `Edit ${initial.name}` : "Add staff"} footer={
      <div className="flex gap-2">
        {exists && !f.isOwner ? (
          <Button variant="outline" className="tap" onClick={async () => { const r = await pos.setStaffActive(f.id, !f.active); if (r.ok) { toast.success(f.active ? "Deactivated" : "Activated"); onClose(); } else setError(r.error ?? ""); }}>
            {f.active ? "Deactivate" : "Activate"}
          </Button>
        ) : null}
        <Button className="tap flex-1" disabled={busy} onClick={async () => { setBusy(true); const r = await pos.saveStaff(f); setBusy(false); if (r.ok) { toast.success("Staff saved"); onClose(); } else setError(r.error ?? ""); }}>
          {busy ? <Spinner /> : null} Save
        </Button>
      </div>
    }>
      <div className="space-y-3 py-2">
        <Field label="Name *"><Input className="tap" maxLength={60} value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Mobile *"><Input className="tap" inputMode="numeric" value={f.mobile} onChange={(e) => set({ mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></Field>
        <Field label="Role" hint={f.isOwner ? "The owner's role cannot change." : undefined}>
          <div className="flex flex-wrap gap-2">
            {f.isOwner ? <Chip active>Owner</Chip> : roles.map((r) => <Chip key={r} active={f.role === r} onClick={() => set({ role: r })}>{roleLabel[r]}</Chip>)}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="PIN (4 digits) *"><Input className="tap" inputMode="numeric" type="password" value={f.pin} onChange={(e) => set({ pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></Field>
          <Field label="Password (6+) *"><Input className="tap" type="password" value={f.password} onChange={(e) => set({ password: e.target.value })} /></Field>
        </div>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

function PermissionMatrix({ editable }: { editable: boolean }) {
  const pos = usePos();
  const [target, setTarget] = useState<string>("captain");
  const person = pos.staff.find((s) => s.id === target);
  const role: Role = person ? person.role : (target as Role);
  const perms: Permissions = person ? person.permissionOverrides ?? pos.rolePerms[person.role] : pos.rolePerms[role];
  const custom = Boolean(person?.permissionOverrides);
  const canToggle = editable && (!person || custom);

  const toggle = (key: ModuleKey | SpecialPermission, action: CrudAction | "special", v: boolean) => {
    if (person) pos.setUserPermission(person.id, key, action, v);
    else pos.setRolePermission(role, key, action, v);
  };

  return (
    <div className="space-y-3">
      {!editable ? <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Only the owner can change permissions. You can view them here.</p> : null}
      <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
        {roles.map((r) => <Chip key={r} active={target === r} onClick={() => setTarget(r)}>{roleLabel[r]}</Chip>)}
        <span className="mx-1 w-px shrink-0 bg-border" />
        {pos.staff.filter((s) => !s.isOwner).map((s) => <Chip key={s.id} active={target === s.id} onClick={() => setTarget(s.id)}>{s.name}</Chip>)}
      </div>
      {person ? (
        <label className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm font-semibold">
          <span>Custom permissions for {person.name}<span className="block text-xs font-normal text-muted-foreground">{custom ? "Overrides the " + roleLabel[person.role] + " role" : "Uses the " + roleLabel[person.role] + " role"}</span></span>
          <Switch disabled={!editable} checked={custom} onCheckedChange={(v) => pos.setUserOverride(person.id, v ? structuredClone(pos.rolePerms[person.role]) : undefined)} />
        </label>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="sticky left-0 bg-muted px-3 py-2 text-left">Module</th>
              {actions.map((a) => <th key={a} className="px-3 py-2 capitalize">{a}</th>)}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m} className="border-b border-border last:border-0">
                <td className="sticky left-0 bg-card px-3 py-2 font-semibold">{moduleLabels[m]}</td>
                {actions.map((a) => (
                  <td key={a} className="px-3 py-2 text-center">
                    <Switch disabled={!canToggle} checked={Boolean(perms.modules[m]?.[a])} onCheckedChange={(v) => toggle(m, a, v)} aria-label={`${moduleLabels[m]} ${a}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {specials.map((k) => (
          <label key={k} className="flex items-center justify-between px-3 py-2.5 text-sm font-semibold">
            {specialLabels[k]}
            <Switch disabled={!canToggle || k === "editPermissions"} checked={Boolean(perms.special[k])} onCheckedChange={(v) => toggle(k, "special", v)} />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Changes apply straight away — buttons appear or disappear for that role.</p>
    </div>
  );
}
