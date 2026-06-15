import { useState } from "react";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../hooks/useAuth.js";
import { USER_ROLE } from "../../../shared/enums.js";
import Dropdown from "../components/ui/Dropdown.js";

type EditForm = {
  id: number;
  name: string;
  email: string;
  role: "teacher" | "editor" | "leader";
  isActive: boolean;
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { data: usersList, refetch } = trpc.auth.listUsers.useQuery();
  const impersonate = trpc.auth.impersonate.useMutation({
    onSuccess: () => window.location.assign("/"),
    onError: (e) => window.alert(e.message || "代理登录失败"),
  });
  const createUser = trpc.auth.createUser.useMutation({
    onSuccess: () => {
      refetch();
      setShowForm(false);
      setForm({ name: "", email: "", role: "teacher", initialPassword: "" });
    },
  });
  const updateUser = trpc.auth.updateUser.useMutation({
    onSuccess: () => { refetch(); setEditing(null); },
  });
  const deleteUser = trpc.auth.deleteUser.useMutation({ onSuccess: () => refetch() });
  const resetPassword = trpc.auth.resetPassword.useMutation();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "teacher" as "teacher" | "editor" | "leader",
    initialPassword: "",
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (createUser.isPending) return;
    createUser.mutate(form);
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

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || updateUser.isPending) return;
    updateUser.mutate(editing);
  };

  const handleDelete = (id: number, name: string) => {
    if (deleteUser.isPending) return;
    if (window.confirm(`确定要删除用户「${name}」吗？此操作不可撤销。`)) {
      deleteUser.mutate({ id });
    }
  };

  const handleResetPassword = (id: number, name: string) => {
    if (resetPassword.isPending) return;
    if (window.confirm(`确定要将用户「${name}」的密码重置为 compass123 吗？`)) {
      resetPassword.mutate({ userId: id, newPassword: "compass123" });
    }
  };

  const handleImpersonate = (id: number, name: string) => {
    if (impersonate.isPending) return;
    if (
      window.confirm(
        `将以「${name}」的身份登录其账户，期间你看到和操作的都是该用户的内容。\n\n此操作会被记入审计日志（谁、登录了谁、何时），不会修改对方密码。\n完成后可点击底部横幅「返回我的账户」。\n\n确定继续吗？`
      )
    ) {
      impersonate.mutate({ userId: id });
    }
  };

  const isBusy = createUser.isPending || updateUser.isPending || deleteUser.isPending || resetPassword.isPending || impersonate.isPending;

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
            disabled={isBusy}
            className="bg-ink text-card px-4 py-1.5 text-sm font-medium rounded-full hover:bg-ink-soft transition-colors disabled:opacity-50"
          >
            {showForm ? "取消" : "+ 创建用户"}
          </button>
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card-surface p-5 mb-5 space-y-4">
          <p className="eyebrow mb-3">新建用户</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="eyebrow block mb-1.5">姓名</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-hairline bg-[#F0F4FA] px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                required
                disabled={createUser.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">用户名</label>
              <input
                type="text"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-hairline bg-[#F0F4FA] px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                required
                disabled={createUser.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">角色</label>
              <Dropdown
                value={form.role}
                onChange={(v) => setForm({ ...form, role: v as any })}
                options={Object.entries(USER_ROLE).map(([k, v]) => ({ value: k, label: v }))}
                disabled={createUser.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">初始密码</label>
              <input
                type="text"
                value={form.initialPassword}
                onChange={(e) => setForm({ ...form, initialPassword: e.target.value })}
                className="w-full border border-hairline bg-[#F0F4FA] px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                placeholder="至少6位"
                required
                disabled={createUser.isPending}
              />
            </div>
          </div>
          {createUser.isError && (
            <p className="text-sm text-[#991B1B]">{createUser.error?.message || "创建失败"}</p>
          )}
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={() => setShowForm(false)} disabled={createUser.isPending} className="px-4 py-1.5 text-sm text-muted hover:text-ink transition-colors disabled:opacity-50">取消</button>
            <button type="submit" disabled={createUser.isPending} className="px-5 py-1.5 bg-ink text-card text-sm rounded-full hover:bg-ink-soft transition-colors disabled:opacity-50">
              {createUser.isPending ? "创建中..." : "创建"}
            </button>
          </div>
        </form>
      )}

      {editing && (
        <form onSubmit={handleUpdate} className="card-surface p-5 mb-5 space-y-4">
          <p className="eyebrow mb-3">编辑用户</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="eyebrow block mb-1.5">姓名</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full border border-hairline bg-[#F0F4FA] px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                required
                disabled={updateUser.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">用户名</label>
              <input
                type="text"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                className="w-full border border-hairline bg-[#F0F4FA] px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                required
                disabled={updateUser.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">角色</label>
              <Dropdown
                value={editing.role}
                onChange={(v) => setEditing({ ...editing, role: v as EditForm["role"] })}
                options={Object.entries(USER_ROLE).map(([k, v]) => ({ value: k, label: v }))}
                disabled={updateUser.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">状态</label>
              <Dropdown
                value={editing.isActive ? "true" : "false"}
                onChange={(v) => setEditing({ ...editing, isActive: v === "true" })}
                options={[
                  { value: "true", label: "启用" },
                  { value: "false", label: "禁用" },
                ]}
                disabled={updateUser.isPending}
              />
            </div>
          </div>
          {updateUser.isError && (
            <p className="text-sm text-[#991B1B]">{updateUser.error?.message || "保存失败"}</p>
          )}
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={() => setEditing(null)} disabled={updateUser.isPending} className="px-4 py-1.5 text-sm text-muted hover:text-ink transition-colors disabled:opacity-50">取消</button>
            <button type="submit" disabled={updateUser.isPending} className="px-5 py-1.5 bg-ink text-card text-sm rounded-full hover:bg-ink-soft transition-colors disabled:opacity-50">
              {updateUser.isPending ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      )}

      <div className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink">
              <th className="px-4 py-3 text-left eyebrow">姓名</th>
              <th className="px-4 py-3 text-left eyebrow">用户名</th>
              <th className="px-4 py-3 text-left eyebrow">角色</th>
              <th className="px-4 py-3 text-left eyebrow">状态</th>
              <th className="px-4 py-3 text-left eyebrow">最近登录</th>
              <th className="px-4 py-3 text-right eyebrow">操作</th>
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
                    {u.isActive ? "启用" : "禁用"}
                  </span>
                </td>
                <td className="px-4 py-3 mono-data text-muted">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("zh-CN") : "从未登录"}
                </td>
                <td className="px-4 py-3 text-right">
                  {currentUser && u.id !== currentUser.id && (
                    <button
                      onClick={() => handleImpersonate(u.id, u.name)}
                      disabled={isBusy || !u.isActive}
                      title="以该用户身份登录（会记入审计日志，不影响其密码）"
                      className="text-xs text-[#0F766E] hover:text-[#115E59] mr-3 disabled:opacity-50"
                    >
                      登录该账户
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(u)}
                    disabled={isBusy}
                    className="text-xs text-accent hover:text-accent-deep mr-3 disabled:opacity-50"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleResetPassword(u.id, u.name)}
                    disabled={isBusy}
                    className="text-xs text-[#D97706] hover:text-[#92400E] mr-3 disabled:opacity-50"
                  >
                    重置密码
                  </button>
                  <button
                    onClick={() => handleDelete(u.id, u.name)}
                    disabled={isBusy}
                    className="text-xs text-muted hover:text-[#991B1B] disabled:opacity-50"
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
