import { useState } from "react";
import { trpc } from "../lib/trpc.js";

export default function TypesPage() {
  const typesQuery = trpc.topic.listTypesWithCount.useQuery(undefined, { refetchOnWindowFocus: false });
  const renameMutation = trpc.topic.renameType.useMutation({ onSuccess: () => typesQuery.refetch() });
  const deleteMutation = trpc.topic.deleteType.useMutation({ onSuccess: () => typesQuery.refetch() });

  const [editingType, setEditingType] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState("");

  const types = typesQuery.data || [];
  const isBusy = renameMutation.isPending || deleteMutation.isPending;

  const handleRename = (oldType: string) => {
    if (!newName.trim() || newName.trim() === oldType || isBusy) return;
    renameMutation.mutate({ oldType, newType: newName.trim() }, {
      onSuccess: () => { setEditingType(null); setNewName(""); },
    });
  };

  const handleMerge = (sourceType: string) => {
    if (!mergeInto || mergeInto === sourceType || isBusy) return;
    renameMutation.mutate({ oldType: sourceType, newType: mergeInto }, {
      onSuccess: () => { setMergeTarget(null); setMergeInto(""); },
    });
  };

  const handleDelete = (topicType: string, count: number) => {
    if (isBusy) return;
    const msg = count > 0
      ? `确定要删除类型「${topicType}」吗？${count}个选题将被标记为"未分类"。`
      : `确定要删除类型「${topicType}」吗？`;
    if (window.confirm(msg)) {
      deleteMutation.mutate({ topicType });
    }
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="eyebrow mb-1">ADMIN</p>
            <h1 className="editorial-heading text-[28px] leading-tight">类型管理</h1>
          </div>
          <span className="mono-data text-muted">
            共 {types.length} 个类型
          </span>
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      {typesQuery.isLoading && (
        <div className="text-muted text-center py-20 font-serif italic">加载中...</div>
      )}

      {types.length === 0 && !typesQuery.isLoading && (
        <div className="text-muted text-center py-20 font-serif italic">暂无类型数据</div>
      )}

      <div className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink">
              <th className="px-4 py-3 text-left eyebrow">类型名称</th>
              <th className="px-4 py-3 text-left eyebrow">选题数量</th>
              <th className="px-4 py-3 text-right eyebrow">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {types.map((t) => (
              <tr key={t.topicType} className="hover:bg-[#F0F4FA] transition-colors">
                <td className="px-4 py-3">
                  {editingType === t.topicType ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRename(t.topicType)}
                        className="border border-accent bg-card px-2 py-1 text-sm w-40 focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleRename(t.topicType)}
                        disabled={isBusy || !newName.trim() || newName.trim() === t.topicType}
                        className="text-xs text-accent hover:text-accent-deep disabled:opacity-50"
                      >
                        确认
                      </button>
                      <button
                        onClick={() => { setEditingType(null); setNewName(""); }}
                        className="text-xs text-muted hover:text-ink"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <span className="font-medium text-ink">{t.topicType}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {t.count > 0 ? (
                    <span className="status-pill bg-[#DBEAFE] text-accent">{t.count} 个选题</span>
                  ) : (
                    <span className="status-pill bg-paper-alt text-muted">未使用</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {mergeTarget === t.topicType ? (
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-xs text-muted">合并到：</span>
                      <select
                        value={mergeInto}
                        onChange={(e) => setMergeInto(e.target.value)}
                        className="border border-hairline bg-card px-2 py-1 text-sm focus:outline-none focus:border-accent"
                      >
                        <option value="">选择目标类型</option>
                        {types.filter((tt) => tt.topicType !== t.topicType).map((tt) => (
                          <option key={tt.topicType} value={tt.topicType}>{tt.topicType}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleMerge(t.topicType)}
                        disabled={isBusy || !mergeInto}
                        className="text-xs text-accent hover:text-accent-deep disabled:opacity-50"
                      >
                        确认
                      </button>
                      <button
                        onClick={() => { setMergeTarget(null); setMergeInto(""); }}
                        className="text-xs text-muted hover:text-ink"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => { setEditingType(t.topicType); setNewName(t.topicType); setMergeTarget(null); }}
                        disabled={isBusy}
                        className="text-xs text-accent hover:text-accent-deep disabled:opacity-50"
                      >
                        重命名
                      </button>
                      <button
                        onClick={() => { setMergeTarget(t.topicType); setMergeInto(""); setEditingType(null); }}
                        disabled={isBusy || types.length < 2 || t.count === 0}
                        className="text-xs text-[#6D28D9] hover:text-[#5B21B6] disabled:opacity-50"
                      >
                        合并
                      </button>
                      <button
                        onClick={() => handleDelete(t.topicType, t.count)}
                        disabled={isBusy}
                        className="text-xs text-muted hover:text-[#991B1B] disabled:opacity-50"
                      >
                        删除
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(renameMutation.isError || deleteMutation.isError) && (
        <div className="mt-4 text-sm text-[#991B1B] bg-[#FEE2E2] px-3 py-2">
          {renameMutation.error?.message || deleteMutation.error?.message || "操作失败"}
        </div>
      )}
    </div>
  );
}
