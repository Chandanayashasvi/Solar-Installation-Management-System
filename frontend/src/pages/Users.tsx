import { useState } from "react";
import { api, dt, run, toast } from "../api";
import { Badge, Btn, Card, Empty, Field, Select, Skeleton, Th, useLoad } from "../ui";

const roles = ["ADMIN", "SALES", "SURVEYOR", "WAREHOUSE", "TECHNICIAN", "SUPPORT", "FINANCE"];
type ManagedUser = { id: string; name: string; email: string; role: string; active: boolean; createdAt: string };
type UserDraft = { name: string; email: string; role: string };

export default function Users() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [active, setActive] = useState("");
  const [draft, setDraft] = useState<UserDraft>({ name: "", email: "", role: "SALES" });
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [credential, setCredential] = useState<{ name: string; password: string } | null>(null);
  const query = new URLSearchParams({ ...(search ? { search } : {}), ...(role ? { role } : {}), ...(active ? { active } : {}) }).toString();
  const { data: users, loading, err, reload } = useLoad<ManagedUser[]>(() => api(`/admin/users?${query}`), [query]);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const created = await api<{ user: ManagedUser; temporaryPassword: string }>("/admin/users", { body: draft });
      setCredential({ name: created.user.name, password: created.temporaryPassword });
      setDraft({ name: "", email: "", role: "SALES" });
      toast("User created");
      reload();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to create user", false);
    }
  };

  const saveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (await run(() => api(`/admin/users/${editing.id}`, { method: "PATCH", body: { name: editing.name, email: editing.email } }), "User details updated")) {
      setEditing(null);
      reload();
    }
  };

  const resetPassword = async (user: ManagedUser) => {
    try {
      const result = await api<{ temporaryPassword: string }>(`/admin/users/${user.id}/reset-password`, { body: {} });
      setCredential({ name: user.name, password: result.temporaryPassword });
    } catch (error) {
      await run(() => Promise.reject(error));
    }
  };

  const copyCredential = async () => {
    if (!credential) return;
    if (!navigator.clipboard) {
      await run(() => Promise.reject(new Error("Clipboard access is unavailable in this browser")));
      return;
    }
    await run(() => navigator.clipboard.writeText(credential.password), "Temporary password copied");
  };

  return <div className="space-y-4">
    <div><h1 className="text-xl font-bold">Team and access</h1><p className="mt-1 text-sm text-slate-500">Manage accounts and the permissions associated with each role.</p></div>
    <Card title="Create team account">
      <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => void createUser(event)}>
        <Field label="Full name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} minLength={2} required />
        <Field label="Email address" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required />
        <Select label="Role" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })}>{roles.map((item) => <option key={item}>{item}</option>)}</Select>
        <Btn className="self-end">Create account</Btn>
      </form>
      <p className="mt-2 text-xs text-slate-500">A secure temporary password is generated once and shown after creation. Share it directly with the team member.</p>
    </Card>

    {credential && <Card title="Temporary sign-in credential" right={<Btn kind="ghost" onClick={() => setCredential(null)}>Dismiss</Btn>}>
      <p className="text-sm">For <b>{credential.name}</b>. This password is shown only once; store or share it securely.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2"><code className="rounded bg-slate-100 px-3 py-2 font-mono">{credential.password}</code><Btn kind="ghost" onClick={() => void copyCredential()}>Copy password</Btn></div>
    </Card>}

    <Card title="Registered users">
      <div className="mb-3 grid gap-2 md:grid-cols-3">
        <Field label="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select label="Filter by role" value={role} onChange={(event) => setRole(event.target.value)}><option value="">All roles</option>{roles.map((item) => <option key={item}>{item}</option>)}</Select>
        <Select label="Account status" value={active} onChange={(event) => setActive(event.target.value)}><option value="">All accounts</option><option value="true">Active</option><option value="false">Inactive</option></Select>
      </div>
      {err && <p role="alert" className="mb-2 text-sm text-red-600">{err}</p>}
      {loading ? <Skeleton /> : !users?.length ? <Empty text="No matching accounts" /> : <div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr><Th>Team member</Th><Th>Role</Th><Th>Status</Th><Th>Created</Th><Th>Actions</Th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id} className="border-t align-top">
            <td className="px-2 py-2"><b>{user.name}</b><span className="block text-xs text-slate-500">{user.email}</span></td>
            <td className="px-2 py-2"><Badge v={user.role} /></td>
            <td className="px-2 py-2"><Badge v={user.active ? "ACTIVE" : "INACTIVE"} /></td>
            <td className="px-2 py-2">{dt(user.createdAt)}</td>
            <td className="px-2 py-2"><div className="flex flex-wrap gap-1">
              <Btn kind="ghost" onClick={() => setEditing(user)}>Edit</Btn>
              <Btn kind="ghost" onClick={() => void resetPassword(user)}>Reset password</Btn>
              <Btn kind={user.active ? "danger" : "ghost"} onClick={() => void run(
                () => api(`/admin/users/${user.id}`, { method: "PATCH", body: { active: !user.active } }),
                user.active ? "Account deactivated" : "Account activated",
              ).then((ok) => { if (ok) reload(); })}>{user.active ? "Deactivate" : "Activate"}</Btn>
              {user.role !== "ADMIN" && <Select label="Change role" value={user.role} onChange={(event) => void run(
                () => api(`/admin/users/${user.id}`, { method: "PATCH", body: { role: event.target.value } }),
                "Role updated",
              ).then((ok) => { if (ok) reload(); })}>{roles.filter((item) => item !== "ADMIN").map((item) => <option key={item}>{item}</option>)}</Select>}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </Card>

    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
      <Card title="Edit account details" right={<Btn type="button" kind="ghost" onClick={() => setEditing(null)}>Cancel</Btn>}>
        <form className="min-w-[min(90vw,28rem)] space-y-3" onSubmit={(event) => void saveUser(event)}>
          <Field label="Full name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} required />
          <Field label="Email address" type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} required />
          <p className="text-xs text-slate-500">Role changes are managed separately and cannot change your own administrator role.</p>
          <Btn>Save changes</Btn>
        </form>
      </Card>
    </div>}
  </div>;
}