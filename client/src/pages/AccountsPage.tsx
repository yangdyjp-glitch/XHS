import { useState } from "react";
import { trpc } from "../lib/trpc.js";
import { ACCOUNT_LAYER } from "../../../shared/enums.js";

const PRESET_COLORS = [
  "#E74C3C", "#F39C12", "#F1C40F", "#2ECC71",
  "#1ABC9C", "#3498DB", "#1F3864", "#9B59B6",
  "#E91E63", "#FF5722", "#607D8B", "#34495E",
];

export default function AccountsPage() {
  const { data: accounts, refetch } = trpc.account.list.useQuery();
  const { data: usersList } = trpc.auth.listUsers.useQuery();
  const createAccount = trpc.account.create.useMutation({ onSuccess: () => refetch() });

  const [showForm, setShowForm] = useState(false);
  const [useCustomColor, setUseCustomColor] = useState(false);
  const [form, setForm] = useState({
    accountName: "",
    ownerId: 0,
    layer: "midstream" as "upstream" | "midstream" | "closer",
    mainColor: "#1F3864",
    weeklyTarget: 3,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ownerId) return;
    await createAccount.mutateAsync(form);
    setShowForm(false);
    setForm({ accountName: "", ownerId: 0, layer: "midstream", mainColor: "#1F3864", weeklyTarget: 3 });
    setUseCustomColor(false);
  };

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
            className="bg-ink text-card px-4 py-1.5 text-sm font-medium rounded-full hover:bg-ink-soft transition-colors"
          >
            {showForm ? "取消" : "+ 新建账号"}
          </button>
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card-surface p-5 mb-5 space-y-4">
          <p className="eyebrow mb-3">NEW ACCOUNT</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="eyebrow block mb-1.5">NAME</label>
              <input
                value={form.accountName}
                onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                placeholder="如: 罗老师｜日本经济经营读研"
                required
              />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">OWNER</label>
              <select
                value={form.ownerId}
                onChange={(e) => setForm({ ...form, ownerId: Number(e.target.value) })}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent"
                required
              >
                <option value={0}>请选择</option>
                {usersList?.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="eyebrow block mb-1.5">LAYER</label>
              <select
                value={form.layer}
                onChange={(e) => setForm({ ...form, layer: e.target.value as any })}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                {Object.entries(ACCOUNT_LAYER).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="eyebrow block mb-1.5">WEEKLY TARGET</label>
              <input
                type="number"
                value={form.weeklyTarget}
                onChange={(e) => setForm({ ...form, weeklyTarget: Number(e.target.value) })}
                className="w-full border border-hairline bg-paper px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                min={1}
              />
            </div>
            <div className="md:col-span-2">
              <label className="eyebrow block mb-1.5">COLOR</label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setForm({ ...form, mainColor: c }); setUseCustomColor(false); }}
                    className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: form.mainColor === c && !useCustomColor ? "#0F172A" : "transparent",
                    }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setUseCustomColor(true)}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs transition-transform hover:scale-110 ${
                    useCustomColor ? "border-ink bg-paper" : "border-hairline bg-paper"
                  }`}
                  title="其他颜色"
                >
                  <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
                {useCustomColor && (
                  <input
                    type="color"
                    value={form.mainColor}
                    onChange={(e) => setForm({ ...form, mainColor: e.target.value })}
                    className="w-9 h-9 border border-hairline cursor-pointer ml-1"
                  />
                )}
                <span
                  className="w-8 h-8 rounded-full border border-hairline ml-1"
                  style={{ backgroundColor: form.mainColor }}
                  title={form.mainColor}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-1.5 text-sm text-muted hover:text-ink transition-colors">取消</button>
            <button type="submit" className="px-5 py-1.5 bg-ink text-card text-sm rounded-full hover:bg-ink-soft transition-colors">创建</button>
          </div>
        </form>
      )}

      <div className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink">
              <th className="px-4 py-3 text-left eyebrow">NAME</th>
              <th className="px-4 py-3 text-left eyebrow">OWNER</th>
              <th className="px-4 py-3 text-left eyebrow">LAYER</th>
              <th className="px-4 py-3 text-left eyebrow">TARGET</th>
              <th className="px-4 py-3 text-left eyebrow">STATUS</th>
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
                    {acc.status === "active" ? "ACTIVE" : acc.status}
                  </span>
                </td>
              </tr>
            ))}
            {(!accounts || accounts.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted font-serif italic">
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
