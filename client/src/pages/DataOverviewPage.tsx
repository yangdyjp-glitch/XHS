import { useState } from "react";
import { trpc } from "../lib/trpc.js";
import { SNAPSHOT_DAYS } from "@shared/enums.js";
import Dropdown from "../components/ui/Dropdown.js";

function daysSincePublish(publishedAt: string | Date): number {
  const pub = new Date(publishedAt);
  const now = new Date();
  return Math.floor((now.getTime() - pub.getTime()) / (1000 * 60 * 60 * 24));
}

export default function DataOverviewPage() {
  const [filterAccount, setFilterAccount] = useState<number | "">("");
  const [expandedNote, setExpandedNote] = useState<number | null>(null);
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
          <Dropdown
            value={String(filterAccount)}
            onChange={(v) => setFilterAccount(v ? Number(v) : "")}
            className="w-[16.5rem]"
            options={[
              { value: "", label: "全部账号" },
              ...(accountsQuery.data?.map((a) => ({ value: String(a.id), label: a.accountName })) || []),
            ]}
          />
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      {notesQuery.isLoading && (
        <p className="text-sm text-muted font-serif italic py-10 text-center">加载中...</p>
      )}

      {notesQuery.data?.length === 0 && (
        <p className="text-sm text-muted font-serif italic py-10 text-center">暂无已发布的笔记</p>
      )}

      {notesQuery.data && notesQuery.data.length > 0 && (
        <div className="card-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <th className="px-3 py-2.5 text-left eyebrow">笔记</th>
                <th className="px-2 py-2.5 text-left eyebrow w-20">账号</th>
                <th className="px-2 py-2.5 text-center eyebrow w-16">天数</th>
                <th className="px-2 py-2.5 text-center eyebrow w-20">快照</th>
                <th className="px-2 py-2.5 text-right eyebrow">曝光</th>
                <th className="px-2 py-2.5 text-right eyebrow">阅读</th>
                <th className="px-2 py-2.5 text-right eyebrow">点赞</th>
                <th className="px-2 py-2.5 text-right eyebrow">收藏</th>
                <th className="px-2 py-2.5 text-right eyebrow">评论</th>
                <th className="px-2 py-2.5 text-right eyebrow">分享</th>
                <th className="px-2 py-2.5 text-right eyebrow">互动率</th>
                <th className="px-2 py-2.5 text-center eyebrow pr-3 w-16">链接</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {notesQuery.data.map((note) => {
                const age = daysSincePublish(note.publishedAt);
                const latest = note.metrics.length > 0 ? note.metrics[note.metrics.length - 1] : null;
                const engagement = latest && latest.impression > 0
                  ? (((latest.likeCount + latest.collect + latest.commentCount + (latest.shareCount ?? 0)) / latest.impression) * 100).toFixed(1)
                  : null;
                const hasMultiple = note.metrics.length > 1;
                const isExpanded = expandedNote === note.id;

                return (
                  <tr
                    key={note.id}
                    onClick={() => hasMultiple && setExpandedNote(isExpanded ? null : note.id)}
                    className={`transition-colors ${hasMultiple ? "cursor-pointer" : ""} ${isExpanded ? "bg-[#EFF6FF]" : "hover:bg-[#F0F4FA]"}`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {note.accountColor && (
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: note.accountColor }} />
                        )}
                        <span className="text-ink font-medium truncate max-w-[280px]">{note.finalTitle}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-muted text-xs truncate">{note.accountName}</td>
                    <td className="px-2 py-2.5 text-center font-mono text-xs text-muted">{age}天</td>
                    <td className="px-2 py-2.5 text-center">
                      <div className="flex gap-0.5 justify-center">
                        {SNAPSHOT_DAYS.map((d) => {
                          const has = note.metrics.some((m) => m.daysSincePublish === d);
                          return (
                            <span
                              key={d}
                              className={`font-mono text-[9px] px-1 py-0.5 leading-none ${
                                has ? "status-ok" : age >= d ? "bg-[#FEF3C7] text-[#92400E]" : "bg-paper-alt text-muted"
                              }`}
                              style={{ borderRadius: 2 }}
                              title={has ? `T+${d} 已录入` : age >= d ? `T+${d} 缺失` : `T+${d} 未到`}
                            >
                              {d}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    {latest ? (
                      <>
                        <td className="px-2 py-2.5 text-right font-mono">{latest.impression.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right font-mono">{latest.view.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right font-mono">{latest.likeCount.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right font-mono">{latest.collect.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right font-mono">{latest.commentCount.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right font-mono">{(latest.shareCount ?? 0).toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-accent font-medium">
                          {engagement}%
                          {hasMultiple && <span className="text-muted text-[9px] ml-1">{isExpanded ? "▲" : "▼"}</span>}
                        </td>
                        <td className="px-2 py-2.5 text-center pr-3">
                          {note.xhsNoteUrl && (
                            <a
                              href={note.xhsNoteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-block text-[11px] font-mono text-accent hover:text-accent-deep hover:underline"
                            >
                              查看
                            </a>
                          )}
                        </td>
                      </>
                    ) : (
                      <td colSpan={8} className="px-2 py-2.5 text-center text-muted text-xs italic">暂无数据</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Expanded detail rows rendered outside main table to avoid nesting issues */}
          {expandedNote && (() => {
            const note = notesQuery.data.find((n) => n.id === expandedNote);
            if (!note || note.metrics.length <= 1) return null;
            return (
              <div className="bg-[#F8FAFC] border-t border-hairline px-6 py-3">
                <div className="flex gap-6 text-xs">
                  {note.metrics.map((m) => {
                    const eng = m.impression > 0
                      ? (((m.likeCount + m.collect + m.commentCount + (m.shareCount ?? 0)) / m.impression) * 100).toFixed(1)
                      : "—";
                    return (
                      <div key={m.daysSincePublish} className="flex items-center gap-3">
                        <span className="font-mono text-ink-soft font-medium">T+{m.daysSincePublish}</span>
                        <span className="text-muted">{m.impression.toLocaleString()} 曝光</span>
                        <span className="text-muted">{m.view.toLocaleString()} 阅读</span>
                        <span className="text-muted">{m.likeCount} 赞</span>
                        <span className="text-muted">{m.collect} 藏</span>
                        <span className="text-muted">{m.commentCount} 评</span>
                        <span className="text-accent font-mono font-medium">{eng}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
