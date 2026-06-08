import { useState } from "react";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../hooks/useAuth.js";

export default function TrashPage() {
  const { isLeader } = useAuth();
  const deletedQuery = trpc.topic.listDeleted.useQuery(undefined, { refetchOnWindowFocus: false });
  const restoreMutation = trpc.topic.restore.useMutation({ onSuccess: () => deletedQuery.refetch() });
  const permanentDeleteMutation = trpc.topic.permanentDelete.useMutation({ onSuccess: () => deletedQuery.refetch() });

  const [confirmId, setConfirmId] = useState<number | null>(null);

  const handleRestore = (id: number) => {
    restoreMutation.mutate({ id });
  };

  const handlePermanentDelete = (id: number) => {
    setConfirmId(id);
  };

  const confirmPermanent = () => {
    if (confirmId) {
      permanentDeleteMutation.mutate({ id: confirmId });
      setConfirmId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="eyebrow mb-1">TRASH</p>
        <h1 className="editorial-heading text-[28px] leading-tight">回收箱</h1>
        <p className="text-sm text-muted mt-1">已删除的选题可以在此恢复，或永久删除。</p>
        <div className="h-[1.5px] bg-ink mt-4" />
      </div>

      {deletedQuery.isLoading && (
        <div className="text-muted py-10 text-center font-serif italic">加载中...</div>
      )}

      {deletedQuery.data?.length === 0 && (
        <div className="text-muted py-16 text-center font-serif italic">
          回收箱为空
        </div>
      )}

      <div className="space-y-2">
        {deletedQuery.data?.map((topic: any) => (
          <div key={topic.id} className="card-surface p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-ink truncate">{topic.title}</h3>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                <span>{topic.accountName}</span>
                <span>·</span>
                <span>{topic.creatorName}</span>
                <span>·</span>
                <span>删除于 {new Date(topic.deletedAt).toLocaleDateString("zh-CN")}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleRestore(topic.id)}
                disabled={restoreMutation.isPending}
                className="text-sm text-accent hover:text-accent-deep border border-accent/30 px-3 py-1.5 rounded-full hover:border-accent transition-colors disabled:opacity-50"
              >
                恢复
              </button>
              {isLeader && (
                <button
                  onClick={() => handlePermanentDelete(topic.id)}
                  disabled={permanentDeleteMutation.isPending}
                  className="text-sm text-[#991B1B] hover:text-[#7F1D1D] border border-[#FECACA] px-3 py-1.5 rounded-full hover:border-[#991B1B] transition-colors disabled:opacity-50"
                >
                  永久删除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Permanent delete confirmation */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20" onClick={() => setConfirmId(null)}>
          <div className="bg-card w-full max-w-sm mx-4 border border-hairline p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="eyebrow mb-1 text-[#991B1B]">警告</p>
              <h3 className="font-serif font-bold text-ink">永久删除选题</h3>
            </div>
            <p className="text-sm text-muted">
              此操作不可恢复，选题将被永久删除。确定要继续吗？
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmId(null)} className="px-4 py-2 text-sm text-muted hover:text-ink">取消</button>
              <button onClick={confirmPermanent} className="px-5 py-2 text-sm bg-[#991B1B] text-white rounded-full hover:bg-[#7F1D1D]">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
