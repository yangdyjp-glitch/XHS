import { useState } from "react";
import { trpc } from "../lib/trpc.js";
import { SNAPSHOT_DAYS } from "@shared/enums.js";

function daysSincePublish(publishedAt: string | Date): number {
  const pub = new Date(publishedAt);
  const now = new Date();
  return Math.floor((now.getTime() - pub.getTime()) / (1000 * 60 * 60 * 24));
}

export default function DataOverviewPage() {
  const [filterAccount, setFilterAccount] = useState<number | "">("");
  const accountsQuery = trpc.account.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const notesQuery = trpc.note.listWithMetrics.useQuery(
    { accountId: filterAccount || undefined },
    { refetchOnWindowFocus: false }
  );

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="eyebrow mb-1">DATA OVERVIEW</p>
            <h1 className="editorial-heading text-[28px] leading-tight">数据情况</h1>
          </div>
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value ? Number(e.target.value) : "")}
            className="border border-hairline bg-card px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors min-w-[160px]"
          >
            <option value="">全部账号</option>
            {accountsQuery.data?.map((a) => (
              <option key={a.id} value={a.id}>{a.accountName}</option>
            ))}
          </select>
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      {notesQuery.isLoading && (
        <p className="text-sm text-muted font-serif italic py-10 text-center">加载中...</p>
      )}

      {notesQuery.data?.length === 0 && (
        <p className="text-sm text-muted font-serif italic py-10 text-center">暂无已发布的笔记</p>
      )}

      <div className="space-y-3">
        {notesQuery.data?.map((note) => {
          const age = daysSincePublish(note.publishedAt);
          const latestMetric = note.metrics.length > 0
            ? note.metrics[note.metrics.length - 1]
            : null;

          return (
            <div key={note.id} className="card-surface p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {note.accountColor && (
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                        style={{ backgroundColor: note.accountColor }}
                      />
                    )}
                    <span className="mono-data text-muted">{note.accountName}</span>
                  </div>
                  <h3 className="text-sm font-medium text-ink leading-snug">{note.finalTitle}</h3>
                </div>
                <div className="text-right shrink-0">
                  <div className="mono-data text-muted">
                    {new Date(note.publishedAt).toLocaleDateString("zh-CN")}
                  </div>
                  <div className="mono-data text-muted mt-0.5">
                    发布 {age} 天
                  </div>
                </div>
              </div>

              {/* Snapshot pills */}
              <div className="flex gap-1.5 mb-3">
                {SNAPSHOT_DAYS.map((d) => {
                  const has = note.metrics.some((m) => m.daysSincePublish === d);
                  return (
                    <span
                      key={d}
                      className={`font-mono text-[10px] px-1.5 py-0.5 ${
                        has ? "status-ok" : age >= d ? "bg-[#FEF3C7] text-[#92400E]" : "bg-paper-alt text-muted"
                      }`}
                      style={{ borderRadius: 3 }}
                    >
                      T+{d} {has ? "" : age >= d ? "缺" : ""}
                    </span>
                  );
                })}
              </div>

              {/* Metrics grid */}
              {note.metrics.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-hairline">
                        <th className="py-1.5 pr-3 text-left eyebrow">快照</th>
                        <th className="py-1.5 px-3 text-right eyebrow">曝光</th>
                        <th className="py-1.5 px-3 text-right eyebrow">阅读</th>
                        <th className="py-1.5 px-3 text-right eyebrow">点赞</th>
                        <th className="py-1.5 px-3 text-right eyebrow">收藏</th>
                        <th className="py-1.5 px-3 text-right eyebrow">评论</th>
                        <th className="py-1.5 px-3 text-right eyebrow">分享</th>
                        <th className="py-1.5 pl-3 text-right eyebrow">互动率</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {note.metrics.map((m) => {
                        const engagement = m.impression > 0
                          ? (((m.likeCount + m.collect + m.commentCount + (m.shareCount ?? 0)) / m.impression) * 100).toFixed(1)
                          : "—";
                        return (
                          <tr key={m.daysSincePublish} className="hover:bg-[#F0F4FA]">
                            <td className="py-2 pr-3 font-mono text-ink-soft">T+{m.daysSincePublish}</td>
                            <td className="py-2 px-3 text-right font-mono">{m.impression.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right font-mono">{m.view.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right font-mono">{m.likeCount.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right font-mono">{m.collect.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right font-mono">{m.commentCount.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right font-mono">{(m.shareCount ?? 0).toLocaleString()}</td>
                            <td className="py-2 pl-3 text-right font-mono text-accent font-medium">{engagement}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted font-serif italic">暂无数据</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
