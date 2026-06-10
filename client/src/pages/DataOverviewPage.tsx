import { useState, useRef, useEffect, useMemo } from "react";
import { trpc } from "../lib/trpc.js";
import { SNAPSHOT_DAYS } from "@shared/enums.js";

function daysSincePublish(publishedAt: string | Date): number {
  const pub = new Date(publishedAt);
  const now = new Date();
  return Math.floor((now.getTime() - pub.getTime()) / (1000 * 60 * 60 * 24));
}

function AccountMultiSelect({ accounts, selected, onChange }: {
  accounts?: { id: number; accountName: string; mainColor?: string | null }[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const label = selected.length === 0
    ? "全部账号"
    : selected.length === 1
      ? accounts?.find((a) => a.id === selected[0])?.accountName || "1 个账号"
      : `已选 ${selected.length} 个账号`;

  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="border border-hairline bg-card px-3 py-2 text-sm flex items-center gap-2 hover:border-accent transition-colors w-[16.5rem] justify-between"
      >
        <span className={selected.length > 0 ? "text-ink" : "text-muted"}>{label}</span>
        <svg className={`w-3 h-3 text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-card border border-hairline shadow-lg z-20 min-w-[16.5rem] max-h-60 overflow-y-auto">
          <div
            onClick={() => { onChange([]); setOpen(false); }}
            className={`px-3 py-2 text-sm cursor-pointer transition-colors ${selected.length === 0 ? "bg-[#EFF6FF] text-accent font-medium" : "hover:bg-[#F0F4FA]"}`}
          >
            全部账号
          </div>
          {accounts?.map((a) => (
            <div
              key={a.id}
              onClick={() => toggle(a.id)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2 ${selected.includes(a.id) ? "bg-[#EFF6FF] text-accent font-medium" : "hover:bg-[#F0F4FA]"}`}
            >
              <span className={`w-3.5 h-3.5 border rounded-sm flex items-center justify-center shrink-0 ${selected.includes(a.id) ? "bg-accent border-accent" : "border-hairline"}`}>
                {selected.includes(a.id) && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </span>
              {a.mainColor && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.mainColor }} />}
              <span className="truncate">{a.accountName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DataOverviewPage() {
  const [filterAccounts, setFilterAccounts] = useState<number[]>([]);
  const [filterStart, setFilterStart] = useState(() => toYMD(new Date(Date.now() - 30 * 86400000)));
  const [filterEnd, setFilterEnd] = useState(() => toYMD(new Date()));
  const [expandedNote, setExpandedNote] = useState<number | null>(null);
  const [snapshotDay, setSnapshotDay] = useState<number>(SNAPSHOT_DAYS[0]); // 当前查看的天数（T+N）
  const [ageSort, setAgeSort] = useState<"asc" | "desc">("asc"); // asc=发布时长升序(发布时间从近到远) desc=从远到近
  const accountsQuery = trpc.account.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const notesQuery = trpc.note.listWithMetrics.useQuery(
    { accountIds: filterAccounts.length > 0 ? filterAccounts : undefined },
    { refetchOnWindowFocus: false }
  );

  const filteredNotes = useMemo(() => {
    if (!notesQuery.data) return undefined;
    const filtered = notesQuery.data.filter((n) => {
      const pub = toYMD(new Date(n.publishedAt));
      if (filterStart && pub < filterStart) return false;
      if (filterEnd && pub > filterEnd) return false;
      return true;
    });
    // 按发布时间排序：asc=发布时长从小到大（最新发布在前，发布时间从近到远）；desc 相反
    return [...filtered].sort((a, b) => {
      const ta = new Date(a.publishedAt).getTime();
      const tb = new Date(b.publishedAt).getTime();
      return ageSort === "asc" ? tb - ta : ta - tb;
    });
  }, [notesQuery.data, filterStart, filterEnd, ageSort]);

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="eyebrow mb-1">DATA OVERVIEW</p>
            <h1 className="editorial-heading text-[28px] leading-tight">数据情况</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm">
              <input
                type="date"
                value={filterStart}
                onChange={(e) => setFilterStart(e.target.value)}
                className="border border-hairline bg-card px-3 py-2 text-ink focus:border-accent outline-none"
              />
              <span className="text-muted">至</span>
              <input
                type="date"
                value={filterEnd}
                onChange={(e) => setFilterEnd(e.target.value)}
                className="border border-hairline bg-card px-3 py-2 text-ink focus:border-accent outline-none"
              />
            </div>
            <AccountMultiSelect
              accounts={accountsQuery.data}
              selected={filterAccounts}
              onChange={setFilterAccounts}
            />
          </div>
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      {notesQuery.isLoading && (
        <p className="text-sm text-muted font-serif italic py-10 text-center">加载中...</p>
      )}

      {filteredNotes?.length === 0 && (
        <p className="text-sm text-muted font-serif italic py-10 text-center">该天数区间内暂无笔记</p>
      )}

      {filteredNotes && filteredNotes.length > 0 && (
        <div className="card-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink">
                <th className="px-3 py-2.5 text-left eyebrow">笔记</th>
                <th className="px-2 py-2.5 text-left eyebrow w-20">账号</th>
                <th className="px-2 py-2.5 text-center w-24">
                  <button
                    onClick={() => setAgeSort((s) => (s === "asc" ? "desc" : "asc"))}
                    title={ageSort === "asc" ? "当前：发布时间从近到远（点击切换为从远到近）" : "当前：发布时间从远到近（点击切换为从近到远）"}
                    className="eyebrow inline-flex items-center gap-0.5 hover:text-ink transition-colors cursor-pointer"
                  >
                    发布时长
                    <span className="text-[9px] leading-none">{ageSort === "asc" ? "▲" : "▼"}</span>
                  </button>
                </th>
                <th className="px-2 py-1.5 text-center w-28">
                  <div className="eyebrow mb-1">天数</div>
                  <div className="flex gap-1 justify-center">
                    {SNAPSHOT_DAYS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setSnapshotDay(d)}
                        title={`查看 T+${d} 天数据`}
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded-sm transition-colors ${
                          snapshotDay === d ? "bg-ink text-card" : "bg-paper-alt text-muted hover:text-ink"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </th>
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
              {filteredNotes.map((note) => {
                const age = daysSincePublish(note.publishedAt);
                const snap = note.metrics.find((m) => m.daysSincePublish === snapshotDay) || null;
                const engagement = snap && snap.impression > 0
                  ? (((snap.likeCount + snap.collect + snap.commentCount + (snap.shareCount ?? 0)) / snap.impression) * 100).toFixed(1)
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
                    {snap ? (
                      <>
                        <td className="px-2 py-2.5 text-right font-mono text-[#2563EB]">{snap.impression.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-[#059669]">{snap.view.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-[#DC2626]">{snap.likeCount.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-[#D97706]">{snap.collect.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-[#7C3AED]">{snap.commentCount.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right font-mono text-[#0891B2]">{(snap.shareCount ?? 0).toLocaleString()}</td>
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
                              className="inline-block text-[10px] font-mono bg-ink text-card px-2 py-0.5 rounded-full hover:bg-ink-soft transition-colors leading-tight"
                            >
                              查看
                            </a>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td colSpan={7} className="px-2 py-2.5 text-center text-muted text-xs italic">
                          暂无{snapshotDay}天数据
                        </td>
                        <td className="px-2 py-2.5 text-center pr-3">
                          {note.xhsNoteUrl && (
                            <a
                              href={note.xhsNoteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-block text-[10px] font-mono bg-ink text-card px-2 py-0.5 rounded-full hover:bg-ink-soft transition-colors leading-tight"
                            >
                              查看
                            </a>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Expanded detail rows rendered outside main table to avoid nesting issues */}
          {expandedNote && (() => {
            const note = filteredNotes.find((n) => n.id === expandedNote);
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
                        <span><span className="text-[#2563EB]">{m.impression.toLocaleString()}</span> <span className="text-muted">曝光</span></span>
                        <span><span className="text-[#059669]">{m.view.toLocaleString()}</span> <span className="text-muted">阅读</span></span>
                        <span><span className="text-[#DC2626]">{m.likeCount}</span> <span className="text-muted">赞</span></span>
                        <span><span className="text-[#D97706]">{m.collect}</span> <span className="text-muted">藏</span></span>
                        <span><span className="text-[#7C3AED]">{m.commentCount}</span> <span className="text-muted">评</span></span>
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
