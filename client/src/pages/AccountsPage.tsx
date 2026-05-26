import { useState } from "react";
import { trpc } from "../lib/trpc.js";
import { ACCOUNT_LAYER } from "../../../shared/enums.js";
import Dropdown from "../components/ui/Dropdown.js";

const PRESET_COLORS = [
  "#E74C3C", "#F39C12", "#F1C40F", "#2ECC71",
  "#1ABC9C", "#3498DB", "#1F3864", "#9B59B6",
  "#607D8B", "#34495E", "#000000",
];

type EditForm = {
  id: number;
  accountName: string;
  ownerId: number;
  layer: "upstream" | "midstream" | "closer";
  mainColor: string;
  xhsAccountUrl: string;
  weeklyTarget: number;
  status: "active" | "paused" | "archived";
};

function ColorPicker({ value, onChange, disabled }: { value: string; onChange: (c: string) => void; disabled?: boolean }) {
  const [useCustom, setUseCustom] = useState(!PRESET_COLORS.includes(value));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => { onChange(c); setUseCustom(false); }}
          disabled={disabled}
          className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-50"
          style={{
            backgroundColor: c,
            borderColor: value === c && !useCustom ? "#0F172A" : "transparent",
          }}
        />
      ))}
      <button
        type="button"
        onClick={() => setUseCustom(true)}
        disabled={disabled}
        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110 disabled:opacity-50 ${
          useCustom ? "border-ink bg-paper" : "border-hairline bg-paper"
        }`}
        title="其他颜色"
      >
        <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </button>
      {useCustom && (
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-9 h-9 border border-hairline cursor-pointer ml-1"
        />
      )}
      <span
        className="w-8 h-8 rounded-full border border-hairline ml-1"
        style={{ backgroundColor: value }}
        title={value}
      />
    </div>
  );
}

export default function AccountsPage() {
  const { data: accounts, refetch } = trpc.account.list.useQuery();
  const { data: usersList } = trpc.auth.listUsers.useQuery();
  const createAccount = trpc.account.create.useMutation({
    onSuccess: () => {
      refetch();
      setShowForm(false);
      setForm({ accountName: "", ownerId: 0, layer: "midstream", mainColor: "#1F3864", weeklyTarget: 3 });
    },
  });
  const updateAccount = trpc.account.update.useMutation({
    onSuccess: () => { refetch(); setEditing(null); },
  });
  const deleteAccount = trpc.account.delete.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => window.alert(err.message),
  });

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [useCustomColor, setUseCustomColor] = useState(false);
  const [form, setForm] = useState({
    accountName: "",
    ownerId: 0,
    layer: "midstream" as "upstream" | "midstream" | "closer",
    mainColor: "#1F3864",
    weeklyTarget: 3,
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ownerId || createAccount.isPending) return;
    createAccount.mutate(form);
  };

  const handleEdit = (acc: NonNullable<typeof accounts>[0]) => {
    setEditing({
      id: acc.id,
      accountName: acc.accountName,
      ownerId: acc.ownerId,
      layer: acc.layer as EditForm["layer"],
      mainColor: acc.mainColor || "#1F3864",
      xhsAccountUrl: acc.xhsAccountUrl || "",
      weeklyTarget: acc.weeklyTarget ?? 3,
      status: acc.status as EditForm["status"],
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || updateAccount.isPending) return;
    updateAccount.mutate(editing);
  };

  const handleDelete = (id: number, name: string) => {
    if (deleteAccount.isPending) return;
    if (window.confirm(`确定要删除账号「${name}」吗？此操作不可撤销。`)) {
      deleteAccount.mutate({ id });
    }
  };

  const isBusy = createAccount.isPending || updateAccount.isPending || deleteAccount.isPending;

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="eyebrow mb-1">ADMIN</p>
            <h1 className="editorial-heading text-[28px] leading-tight">账号管理</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            disabled={isBusy}
            className="bg-ink text-card px-4 py-1.5 text-sm font-medium rounded-full hover:bg-ink-soft transition-colors disabled:opacity-50"
          >
            {showForm ? "取消" : "+ 新建账号"}
          </button>
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card-surface p-5 mb-5 space-y-4">
          <p className="eyebrow mb-3">新建账号</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="eyebrow block mb-1.5">账号名称</label>
              <input
                value={form.accountName}
                onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                className="w-full border border-hairline bg-[#F0F4FA] px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                placeholder="如: 罗老师｜日本经济经营读研"
                required
                disabled={createAccount.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">负责人</label>
              <Dropdown
                value={String(form.ownerId)}
                onChange={(v) => setForm({ ...form, ownerId: Number(v) })}
                placeholder="请选择"
                options={[
                  { value: "0", label: "请选择" },
                  ...(usersList?.map((u) => ({ value: String(u.id), label: u.name })) || []),
                ]}
                disabled={createAccount.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">层级</label>
              <Dropdown
                value={form.layer}
                onChange={(v) => setForm({ ...form, layer: v as any })}
                options={Object.entries(ACCOUNT_LAYER).map(([k, v]) => ({ value: k, label: v }))}
                disabled={createAccount.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">周目标</label>
              <input
                value={form.weeklyTarget}
                onChange={(e) => setForm({ ...form, weeklyTarget: Number(e.target.value) || 0 })}
                className="w-full border border-hairline bg-[#F0F4FA] px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                min={1}
                disabled={createAccount.isPending}
              />
            </div>
            <div className="md:col-span-2">
              <label className="eyebrow block mb-1.5">颜色</label>
              <ColorPicker value={form.mainColor} onChange={(c) => setForm({ ...form, mainColor: c })} disabled={createAccount.isPending} />
            </div>
          </div>
          {createAccount.isError && (
            <p className="text-sm text-[#991B1B]">{createAccount.error?.message || "创建失败"}</p>
          )}
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={() => setShowForm(false)} disabled={createAccount.isPending} className="px-4 py-1.5 text-sm text-muted hover:text-ink transition-colors disabled:opacity-50">取消</button>
            <button type="submit" disabled={createAccount.isPending} className="px-5 py-1.5 bg-ink text-card text-sm rounded-full hover:bg-ink-soft transition-colors disabled:opacity-50">
              {createAccount.isPending ? "创建中..." : "创建"}
            </button>
          </div>
        </form>
      )}

      {editing && (
        <form onSubmit={handleUpdate} className="card-surface p-5 mb-5 space-y-4">
          <p className="eyebrow mb-3">编辑账号</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="eyebrow block mb-1.5">账号名称</label>
              <input
                value={editing.accountName}
                onChange={(e) => setEditing({ ...editing, accountName: e.target.value })}
                className="w-full border border-hairline bg-[#F0F4FA] px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                required
                disabled={updateAccount.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">负责人</label>
              <Dropdown
                value={String(editing.ownerId)}
                onChange={(v) => setEditing({ ...editing, ownerId: Number(v) })}
                options={usersList?.map((u) => ({ value: String(u.id), label: u.name })) || []}
                disabled={updateAccount.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">层级</label>
              <Dropdown
                value={editing.layer}
                onChange={(v) => setEditing({ ...editing, layer: v as EditForm["layer"] })}
                options={Object.entries(ACCOUNT_LAYER).map(([k, v]) => ({ value: k, label: v }))}
                disabled={updateAccount.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">周目标</label>
              <input
                value={editing.weeklyTarget}
                onChange={(e) => setEditing({ ...editing, weeklyTarget: Number(e.target.value) || 0 })}
                className="w-full border border-hairline bg-[#F0F4FA] px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                min={1}
                disabled={updateAccount.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">小红书主页</label>
              <input
                value={editing.xhsAccountUrl}
                onChange={(e) => setEditing({ ...editing, xhsAccountUrl: e.target.value })}
                className="w-full border border-hairline bg-[#F0F4FA] px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                placeholder="小红书主页链接"
                disabled={updateAccount.isPending}
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">状态</label>
              <Dropdown
                value={editing.status}
                onChange={(v) => setEditing({ ...editing, status: v as EditForm["status"] })}
                options={[
                  { value: "active", label: "启用" },
                  { value: "paused", label: "暂停" },
                  { value: "archived", label: "归档" },
                ]}
                disabled={updateAccount.isPending}
              />
            </div>
            <div className="md:col-span-2">
              <label className="eyebrow block mb-1.5">颜色</label>
              <ColorPicker value={editing.mainColor} onChange={(c) => setEditing({ ...editing, mainColor: c })} disabled={updateAccount.isPending} />
            </div>
          </div>
          {updateAccount.isError && (
            <p className="text-sm text-[#991B1B]">{updateAccount.error?.message || "保存失败"}</p>
          )}
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={() => setEditing(null)} disabled={updateAccount.isPending} className="px-4 py-1.5 text-sm text-muted hover:text-ink transition-colors disabled:opacity-50">取消</button>
            <button type="submit" disabled={updateAccount.isPending} className="px-5 py-1.5 bg-ink text-card text-sm rounded-full hover:bg-ink-soft transition-colors disabled:opacity-50">
              {updateAccount.isPending ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      )}

      <div className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink">
              <th className="px-4 py-3 text-left eyebrow">账号名称</th>
              <th className="px-4 py-3 text-left eyebrow">负责人</th>
              <th className="px-4 py-3 text-left eyebrow">层级</th>
              <th className="px-4 py-3 text-left eyebrow">周目标</th>
              <th className="px-4 py-3 text-left eyebrow">状态</th>
              <th className="px-4 py-3 text-right eyebrow">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {accounts?.map((acc) => (
              <tr key={acc.id} className="hover:bg-[#F0F4FA] transition-colors">
                <td className="px-4 py-3 flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: acc.mainColor || "#CBD5E1" }}
                  />
                  <span className="font-medium text-ink">{acc.accountName}</span>
                </td>
                <td className="px-4 py-3 text-ink-soft">{acc.ownerName}</td>
                <td className="px-4 py-3">
                  <span className="status-pill bg-[#DBEAFE] text-accent">
                    {ACCOUNT_LAYER[acc.layer as keyof typeof ACCOUNT_LAYER] || acc.layer}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-ink-soft">{acc.weeklyTarget}篇/周</td>
                <td className="px-4 py-3">
                  <span className={`status-pill ${acc.status === "active" ? "status-ok" : "bg-paper-alt text-muted"}`}>
                    {acc.status === "active" ? "启用" : acc.status === "paused" ? "暂停" : "归档"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleEdit(acc)}
                    disabled={isBusy}
                    className="text-xs text-accent hover:text-accent-deep mr-3 disabled:opacity-50"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(acc.id, acc.accountName)}
                    disabled={isBusy}
                    className="text-xs text-muted hover:text-[#991B1B] disabled:opacity-50"
                  >
                    {deleteAccount.isPending ? "删除中..." : "删除"}
                  </button>
                </td>
              </tr>
            ))}
            {(!accounts || accounts.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted font-serif italic">
                  暂无账号，点击上方"新建账号"添加
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
