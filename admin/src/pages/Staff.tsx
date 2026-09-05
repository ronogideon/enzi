import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Role, StaffMember } from "@/lib/types";
import {
  PageHeader, Spinner, EmptyState, Modal, Badge, Toggle, useAsync,
} from "@/components/ui";

/**
 * What each role can actually do, in the words the shop owner would use.
 * Shown inline when picking a role so nobody has to guess — the difference
 * between STAFF and ADMIN is "can they change your M-Pesa keys", which is
 * worth being explicit about.
 */
const ROLE_INFO: Record<Role, { label: string; blurb: string }> = {
  SUPERADMIN: {
    label: "Owner",
    blurb: "Everything, including managing other admins. Keep this to yourself.",
  },
  ADMIN: {
    label: "Manager",
    blurb: "Everything day to day — products, pricing, promotions, payment keys, staff.",
  },
  STAFF: {
    label: "Shop floor",
    blurb: "Orders, packing and dispatch, products and stock. No payment keys, no marketing.",
  },
  SUPPORT: {
    label: "Customer care",
    blurb: "Orders and customer contact details, for answering calls and messages.",
  },
};

const ROLES = Object.keys(ROLE_INFO) as Role[];

/** Readable temporary password: no ambiguous characters, easy to dictate. */
function suggestPassword(): string {
  const words = ["packing", "mailer", "kraft", "parcel", "bubble", "carton", "ribbon", "sticker"];
  const word = words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${word}-${digits}`;
}

export default function Staff() {
  const { staff: me } = useAuth();
  const list = useAsync(() => api.staffList(), []);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setActive(member: StaffMember, active: boolean) {
    setError(null);
    try {
      await api.updateStaff(member.id, { active });
      list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update that account");
    }
  }

  async function remove(member: StaffMember) {
    if (!confirm(`Remove ${member.name}'s access?\n\nIf they've packed orders, the account is deactivated instead of deleted so order history stays intact.`))
      return;
    setError(null);
    try {
      await api.deleteStaff(member.id);
      list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that account");
    }
  }

  return (
    <>
      <PageHeader
        title="Staff accounts"
        subtitle="Logins for the people who work in the shop"
        action={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            Add staff member
          </button>
        }
      />

      {error && (
        <div className="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <EmptyState title="Couldn't load staff" hint={list.error} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-ink-line">
              <tr>
                <th className="th">Name</th>
                <th className="th">Email</th>
                <th className="th">Role</th>
                <th className="th text-right">Orders packed</th>
                <th className="th">Last sign-in</th>
                <th className="th text-center">Active</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((m) => {
                const isMe = m.id === me?.id;
                return (
                  <tr key={m.id} className="border-b border-ink-line/60 last:border-0">
                    <td className="td font-medium text-white">
                      {m.name}
                      {isMe && <span className="ml-2 text-xs text-faint">(you)</span>}
                      {m.mustChangePassword && (
                        <span className="ml-2">
                          <Badge tone="gold">must reset</Badge>
                        </span>
                      )}
                    </td>
                    <td className="td text-muted">
                      {m.email}
                      {m.phone && <div className="text-xs text-faint">{m.phone}</div>}
                    </td>
                    <td className="td">
                      <Badge tone={m.role === "SUPERADMIN" ? "indigo" : "muted"}>
                        {ROLE_INFO[m.role]?.label ?? m.role}
                      </Badge>
                    </td>
                    <td className="td text-right text-muted">{m._count?.packedOrders ?? 0}</td>
                    <td className="td text-xs text-muted">
                      {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : "never"}
                    </td>
                    <td className="td text-center">
                      <div className="flex justify-center">
                        <Toggle
                          checked={m.active}
                          disabled={isMe}
                          onChange={(v) => setActive(m, v)}
                        />
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-3 text-sm">
                        <button className="text-indigo hover:underline" onClick={() => setEditing(m)}>
                          Edit
                        </button>
                        <button className="text-muted hover:text-cloud" onClick={() => setResetting(m)}>
                          Reset password
                        </button>
                        {!isMe && (
                          <button className="text-muted hover:text-danger" onClick={() => remove(m)}>
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r} className="card p-4">
            <p className="text-sm font-medium text-white">{ROLE_INFO[r].label}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-faint">{r}</p>
            <p className="mt-2 text-xs text-muted">{ROLE_INFO[r].blurb}</p>
          </div>
        ))}
      </div>

      {creating && (
        <StaffModal
          canGrantSuperadmin={me?.role === "SUPERADMIN"}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); list.reload(); }}
        />
      )}
      {editing && (
        <StaffModal
          member={editing}
          canGrantSuperadmin={me?.role === "SUPERADMIN"}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); list.reload(); }}
        />
      )}
      {resetting && (
        <ResetModal
          member={resetting}
          onClose={() => setResetting(null)}
          onSaved={() => { setResetting(null); list.reload(); }}
        />
      )}
    </>
  );
}

function StaffModal({
  member, canGrantSuperadmin, onClose, onSaved,
}: {
  member?: StaffMember;
  canGrantSuperadmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!member;
  const [form, setForm] = useState({
    name: member?.name ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    role: (member?.role ?? "STAFF") as Role,
    password: editing ? "" : suggestPassword(),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const roles = ROLES.filter((r) => r !== "SUPERADMIN" || canGrantSuperadmin);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.updateStaff(member!.id, {
          name: form.name,
          phone: form.phone || undefined,
          role: form.role,
        });
        onSaved();
      } else {
        await api.createStaff({
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          role: form.role,
          password: form.password,
          mustChangePassword: true,
        });
        // Hold the modal open so the temporary password can be copied — it is
        // never retrievable again once this closes.
        setCreated({ email: form.email, password: form.password });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Modal title="Staff account created" onClose={onSaved}>
        <p className="text-sm text-muted">
          Give these details to your employee. They'll be asked to set their own password
          the first time they sign in — this temporary one won't be shown again.
        </p>
        <div className="mt-4 space-y-2 rounded-xl border border-ink-line bg-ink-800/60 p-4 font-mono text-sm">
          <div><span className="text-faint">Email:&nbsp;&nbsp;&nbsp;</span><span className="text-white">{created.email}</span></div>
          <div><span className="text-faint">Password:</span> <span className="text-white">{created.password}</span></div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            className="btn-ghost"
            onClick={() => navigator.clipboard?.writeText(
              `Enzi Admin\nEmail: ${created.email}\nPassword: ${created.password}`
            )}
          >
            Copy details
          </button>
          <button className="btn-primary" onClick={onSaved}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={editing ? `Edit ${member!.name}` : "Add staff member"} onClose={onClose}>
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="label">Full name</label>
          <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label">Email (this is their username)</label>
          <input
            className="field"
            type="email"
            value={form.email}
            disabled={editing}
            onChange={(e) => set("email", e.target.value)}
            placeholder="jane@enzipackaging.co.ke"
          />
          {editing && <p className="mt-1 text-xs text-faint">Email can't be changed after creation.</p>}
        </div>
        <div>
          <label className="label">Phone (optional)</label>
          <input
            className="field"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="0712 345 678"
          />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="field" value={form.role} onChange={(e) => set("role", e.target.value)}>
            {roles.map((r) => (
              <option key={r} value={r}>{ROLE_INFO[r].label} ({r})</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted">{ROLE_INFO[form.role].blurb}</p>
        </div>

        {!editing && (
          <div>
            <label className="label">Temporary password</label>
            <div className="flex gap-2">
              <input
                className="field font-mono"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
              <button type="button" className="btn-ghost shrink-0" onClick={() => set("password", suggestPassword())}>
                New
              </button>
            </div>
            <p className="mt-1 text-xs text-faint">
              At least 8 characters. They'll be prompted to change it on first sign-in.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={save}
          disabled={
            busy || !form.name.trim() ||
            (!editing && (!form.email.trim() || form.password.length < 8))
          }
        >
          {busy ? "Saving…" : editing ? "Save changes" : "Create account"}
        </button>
      </div>
    </Modal>
  );
}

function ResetModal({
  member, onClose, onSaved,
}: {
  member: StaffMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState(suggestPassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.resetStaffPassword(member.id, password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reset the password");
      setBusy(false);
    }
  }

  return (
    <Modal title={`Reset password — ${member.name}`} onClose={done ? onSaved : onClose}>
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {done ? (
        <>
          <p className="text-sm text-muted">
            Password reset. Give {member.name} these details — they'll set their own on
            next sign-in.
          </p>
          <div className="mt-4 space-y-2 rounded-xl border border-ink-line bg-ink-800/60 p-4 font-mono text-sm">
            <div><span className="text-faint">Email:&nbsp;&nbsp;&nbsp;</span><span className="text-white">{member.email}</span></div>
            <div><span className="text-faint">Password:</span> <span className="text-white">{password}</span></div>
          </div>
          <div className="mt-5 flex justify-end">
            <button className="btn-primary" onClick={onSaved}>Done</button>
          </div>
        </>
      ) : (
        <>
          <label className="label">New temporary password</label>
          <div className="flex gap-2">
            <input
              className="field font-mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="btn-ghost shrink-0" onClick={() => setPassword(suggestPassword())}>
              New
            </button>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={busy || password.length < 8}>
              {busy ? "Resetting…" : "Reset password"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
