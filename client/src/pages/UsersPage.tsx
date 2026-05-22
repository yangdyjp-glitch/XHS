import { useState } from "react";
import { trpc } from "../lib/trpc.js";
import { USER_ROLE } from "../../../shared/enums.js";

type EditForm = {
  id: number;
  name: string;
  email: string;
  role: "teacher" | "leader" | "observer";
  isActive: boolean;
};

export default function UsersPage() {
  const { data: usersList, refetch } = trpc.auth.listUsers.useQuery();
  const createUser = trpc.auth.createUser.useMutation({ onSuccess: () => refetch() });
  const updateUser = trpc.auth.updateUser.useMutation({ onSuccess: () => { refetch(); setEditing(null); } });
  const deleteUser = trpc.auth.deleteUser.useMutation({ onSuccess: () => refetch() });

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "teacher" as "teacher" | "leader" | "observer",
    initialPassword: "",
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createUser.mutateAsync(form);
    setShowForm(false);
    setForm({ name: "", email: "", role: "teacher", initialPassword: "" });
  };

  const handleEdit = (u: NonNullable<typeof usersList>[0]) => {
    setEditing({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as EditForm["role"],
      isActive: u.isActive,
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    await updateUser.mutateAsync(editing);
  };

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`确定要删除用户「${name}」吗？此操作不可撤销。`)) {
      deleteUser.mutate({ id });
    }
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="eyebrow mb-1">ADMIN</p>
            <h1 className="editorial-heading text-[28px] leading-tight">用户管理</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-ink text-card px-4 py-1.5 text-sm font-medium rounded-full hover:bg-ink-soft transition-colors"
          >
            {showForm ? "取消" : "+ 创建用户"}
          </button>
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card-surface p-5 mb-5 space-y-4">
          <p className="eyebrow mb-3">NEW USER</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="eyebrow block mb-1.5">NAME</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                required
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">EMAIL</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                required
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">ROLE</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as any })}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                {Object.entries(USER_ROLE).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="eyebrow block mb-1.5">PASSWORD</label>
              <input
                type="text"
                value={form.initialPassword}
                onChange={(e) => setForm({ ...form, initialPassword: e.target.value })}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                placeholder="至少6位"
                required
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-1.5 text-sm text-muted hover:text-ink transition-colors">取消</button>
            <button type="submit" className="px-5 py-1.5 bg-ink text-card text-sm rounded-full hover:bg-ink-soft transition-colors">创建</button>
          </div>
        </form>
      )}

      {editing && (
        <form onSubmit={handleUpdate} className="card-surface p-5 mb-5 space-y-4">
          <p className="eyebrow mb-3">EDIT USER</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="eyebrow block mb-1.5">NAME</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                required
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">EMAIL</label>
              <input
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                required
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">ROLE</label>
              <select
                value={editing.role}
                onChange={(e) => setEditing({ ...editing, role: e.target.value as EditForm["role"] })}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                {Object.entries(USER_ROLE).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="eyebrow block mb-1.5">STATUS</label>
              <select
                value={editing.isActive ? "true" : "false"}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.value === "true" })}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                <option value="true">启用</option>
                <option value="false">禁用</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-1.5 text-sm text-muted hover:text-ink transition-colors">取消</button>
            <button type="submit" className="px-5 py-1.5 bg-ink text-card text-sm rounded-full hover:bg-ink-soft transition-colors">保存</button>
          </div>
        </form>
      )}

      <div className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink">
              <th className="px-4 py-3 text-left eyebrow">NAME</th>
              <th className="px-4 py-3 text-left eyebrow">EMAIL</th>
              <th className="px-4 py-3 text-left eyebrow">ROLE</th>
              <th className="px-4 py-3 text-left eyebrow">STATUS</th>
              <th className="px-4 py-3 text-left eyebrow">LAST LOGIN</th>
              <th className="px-4 py-3 text-right eyebrow">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {usersList?.map((u) => (
              <tr key={u.id} className="hover:bg-[#F0F4FA] transition-colors">
                <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-soft">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="status-pill bg-[#DBEAFE] text-accent">
                    {USER_ROLE[u.role as keyof typeof USER_ROLE] || u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`status-pill ${u.isActive ? "status-ok" : "bg-[#FEE2E2] text-[#991B1B]"}`}>
                    {u.isActive ? "ACTIVE" : "DISABLED"}
                  </span>
                </td>
                <td className="px-4 py-3 mono-data text-muted">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("zh-CN") : "从未登录"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleEdit(u)}
                    className="text-xs text-accent hover:text-accent-deep mr-3"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(u.id, u.name)}
                    className="text-xs text-muted hover:text-[#991B1B]"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {(!usersList || usersList.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted font-serif italic">
                  暂无用户
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
