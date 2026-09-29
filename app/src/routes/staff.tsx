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
import { ALL_MODULES, ALL_SPECIAL, MODULE_LABEL, SPECIAL_LABEL } from "@/lib/pos/permissions";
import { tr } from "@/lib/pos/i18n";
import { usePos } from "@/lib/pos/store";
import {
  ROLES,
  type PermissionModule,
  type Permissions,
  type Role,
  type SpecialPermission,
  type Staff,
  type StandardAction,
} from "@/lib/pos/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/staff")({
  component: StaffPage,
});

const ASSIGNABLE: Role[] = ROLES.filter((r) => r !== "Owner");
const ACTIONS: StandardAction[] = ["view", "create", "edit", "delete"];

function StaffPage() {
  const pos = usePos();
  const data = pos.data!;
  const me = pos.session!.user;
  const canAdd = pos.can("users", "create");
  const canEdit = pos.can("users", "edit");
  const [tab, setTab] = useState<"staff" | "roles">("staff");
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const staff = [...data.staff].sort(
    (a, b) =>
      Number(b.isOwner) - Number(a.isOwner) ||
      Number(b.active) - Number(a.active) ||
      a.name.localeCompare(b.name),
  );

  return (
    <AppShell title="Staff">
      <div className="space-y-3">
        {pos.can("permissions") || pos.canSpecial("users.editPermissions") ? (
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { id: "staff", label: "Staff" },
              { id: "roles", label: "Roles & permissions" },
            ]}
          />
        ) : null}
        {tab === "staff" ? (
          <>
            {canAdd ? (
              <Button className="tap" onClick={() => setEditing("new")}>
                <Plus className="size-4" /> Add staff
              </Button>
            ) : null}
            {staff.length === 0 ? (
              <EmptyState title="No staff yet" />
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {staff.map((s) => {
                  // Owner lock: only the owner opens the owner's row.
                  const open = s.isOwner ? s.id === me.id : canEdit;
                  return (
                    <ListRow
                      key={s.id}
                      muted={!s.active}
                      title={
                        <span className="flex items-center gap-1.5">
                          <span translate="no">{s.name}</span>
                          {s.isOwner ? <Lock className="size-3.5 text-muted-foreground" /> : null}
                        </span>
                      }
                      subtitle={`${tr(s.role)} · ${s.mobile}${s.overrides ? ` · ${tr("custom permissions")}` : ""}`}
                      onClick={open ? () => setEditing(s) : undefined}
                      right={
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                            s.active
                              ? "bg-status-ready-soft text-status-ready"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {s.active ? "Active" : "Inactive"}
                        </span>
                      }
                    />
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <PermissionMatrix editable={pos.canSpecial("users.editPermissions")} />
        )}
      </div>
      {editing ? (
        <StaffSheet
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </AppShell>
  );
}

function StaffSheet({ initial, onClose }: { initial: Staff | null; onClose: () => void }) {
  const pos = usePos();
  const me = pos.session!.user;
  const [f, setF] = useState({
    name: initial?.name ?? "",
    mobile: initial?.mobile ?? "",
    role: initial?.role ?? ("Captain" as Role),
    pin: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...p }));
    setError(null);
  };
  const isSelf = initial?.id === me.id;
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? `Edit ${initial.name}` : "Add staff"}
      footer={
        <div className="flex gap-2">
          {initial && !initial.isOwner && !isSelf ? (
            <Button
              variant="outline"
              className="tap"
              onClick={async () => {
                const r = await pos.act((b) => b.setStaffActive(initial.id, !initial.active));
                if (!r.ok) return setError(r.error);
                toast.success(
                  initial.active
                    ? `${initial.name} can no longer log in`
                    : `${initial.name} activated`,
                );
                onClose();
              }}
            >
              {initial.active ? "Deactivate" : "Activate"}
            </Button>
          ) : null}
          <Button
            className="tap flex-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await pos.act((b) =>
                b.saveStaff({
                  id: initial?.id,
                  name: f.name,
                  mobile: f.mobile,
                  role: f.role,
                  pin: f.pin || undefined,
                  password: f.password || undefined,
                }),
              );
              setBusy(false);
              if (!r.ok) return setError(r.error);
              toast.success("Staff saved");
              onClose();
            }}
          >
            {busy ? <Spinner /> : null} Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3 py-2">
        <Field label="Name *">
          <Input
            className="tap"
            maxLength={60}
            value={f.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field label="Mobile * (used to log in)">
          <Input
            className="tap"
            inputMode="numeric"
            value={f.mobile}
            onChange={(e) => set({ mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
          />
        </Field>
        <Field label="Role" hint={initial?.isOwner ? "The owner's role cannot change." : undefined}>
          <div className="flex flex-wrap gap-2">
            {initial?.isOwner ? (
              <Chip active>Owner</Chip>
            ) : (
              ASSIGNABLE.map((r) => (
                <Chip key={r} active={f.role === r} onClick={() => set({ role: r })}>
                  {r}
                </Chip>
              ))
            )}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={initial ? "New PIN (blank = keep)" : "PIN (4 digits) *"}>
            <Input
              className="tap"
              inputMode="numeric"
              type="password"
              autoComplete="new-password"
              value={f.pin}
              onChange={(e) => set({ pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            />
          </Field>
          <Field label={initial ? "New password (blank = keep)" : "Password (6+) *"}>
            <Input
              className="tap"
              type="password"
              autoComplete="new-password"
              value={f.password}
              onChange={(e) => set({ password: e.target.value })}
            />
          </Field>
        </div>
        <FormError error={error} />
      </div>
    </ResponsiveSheet>
  );
}

function PermissionMatrix({ editable }: { editable: boolean }) {
  const pos = usePos();
  const data = pos.data!;
  const [target, setTarget] = useState<string>("Captain");
  const person = data.staff.find((s) => s.id === target);
  const role: Role = person ? person.role : (target as Role);
  const perms: Permissions = person
    ? (person.overrides ?? data.roleDefaults[person.role])
    : data.roleDefaults[role];
  const custom = Boolean(person?.overrides);
  const canToggle = editable && (!person || custom);

  const save = async (next: Permissions) => {
    const r = await pos.act((b) =>
      person ? b.setUserOverrides(person.id, next) : b.setRoleDefaults(role, next),
    );
    if (!r.ok) toast.error(r.error);
  };
  const toggleModule = (m: PermissionModule, a: StandardAction, v: boolean) => {
    const row = { ...perms.modules[m], [a]: v };
    // Create / edit / delete make no sense without view; view off turns everything off.
    if (a !== "view" && v) row.view = true;
    if (a === "view" && !v) Object.assign(row, { create: false, edit: false, delete: false });
    void save({ ...perms, modules: { ...perms.modules, [m]: row } });
  };
  const toggleSpecial = (k: SpecialPermission, v: boolean) =>
    void save({ ...perms, special: { ...perms.special, [k]: v } });

  return (
    <div className="space-y-3">
      {!editable ? (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          Only staff with “Edit permissions” (normally the owner) can change these. You can view
          them here.
        </p>
      ) : null}
      <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3">
        {ASSIGNABLE.map((r) => (
          <Chip key={r} active={target === r} onClick={() => setTarget(r)}>
            {r}
          </Chip>
        ))}
        <span className="mx-1 w-px shrink-0 bg-border" />
        {data.staff
          .filter((s) => !s.isOwner && s.active)
          .map((s) => (
            <Chip key={s.id} active={target === s.id} onClick={() => setTarget(s.id)}>
              <span translate="no">{s.name}</span>
            </Chip>
          ))}
      </div>
      {person ? (
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm font-semibold">
          <span>
            Custom permissions for <span translate="no">{person.name}</span>
            <span className="block text-xs font-normal text-muted-foreground">
              {custom ? `Overrides the ${person.role} role` : `Uses the ${person.role} role`}
            </span>
          </span>
          <Switch
            disabled={!editable}
            checked={custom}
            onCheckedChange={async (v) => {
              const r = await pos.act((b) =>
                b.setUserOverrides(
                  person.id,
                  v ? structuredClone(data.roleDefaults[person.role]) : null,
                ),
              );
              if (!r.ok) toast.error(r.error);
            }}
          />
        </label>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left">Module</th>
              {ACTIONS.map((a) => (
                <th key={a} className="px-3 py-2 capitalize">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_MODULES.map((m) => (
              <tr key={m} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 bg-card px-3 py-2 font-semibold">
                  {MODULE_LABEL[m]}
                </td>
                {ACTIONS.map((a) => (
                  <td key={a} className="px-3 py-2 text-center">
                    <Switch
                      disabled={!canToggle}
                      checked={Boolean(perms.modules[m]?.[a])}
                      onCheckedChange={(v) => toggleModule(m, a, v)}
                      aria-label={`${MODULE_LABEL[m]} ${a}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {ALL_SPECIAL.map((k) => (
          <label
            key={k}
            className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold"
          >
            {SPECIAL_LABEL[k]}
            <Switch
              disabled={!canToggle || k === "users.editPermissions"}
              checked={Boolean(perms.special[k])}
              onCheckedChange={(v) => toggleSpecial(k, v)}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Changes apply straight away on every device — tabs and buttons appear or disappear for that
        role.
      </p>
    </div>
  );
}
