import { useState } from "react";
import { trpc } from "../lib/trpc.js";
import { ACCOUNT_LAYER, TOPIC_STATUS } from "@shared/enums.js";
import Dropdown from "../components/ui/Dropdown.js";

const HEALTH_DOT: Record<string, string> = {
  green: "bg-[#166534]",
  yellow: "bg-[#A16207]",
  red: "bg-[#991B1B]",
};
const HEALTH_LABEL: Record<string, { bg: string; text: string; label: string }> = {
  green: { bg: "bg-[#DCFCE7]", text: "text-[#166534]", label: "健康" },
  yellow: { bg: "bg-[#FEF9C3]", text: "text-[#854D0E]", label: "注意" },
  red: { bg: "bg-[#FEE2E2]", text: "text-[#991B1B]", label: "告警" },
};

const PERIOD_OPTIONS = [
  { value: "7" as const, label: "7天" },
  { value: "14" as const, label: "14天" },
  { value: "30" as const, label: "30天" },
  { value: "all" as const, label: "全部" },
];

function NoteRankRow({ n, rank }: { n: any; rank: number }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-hairline last:border-0">
      <span className="font-mono text-muted text-xs w-5 text-right shrink-0">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink font-medium truncate">{n.title}</div>
        <div className="mono-data text-muted mt-0.5">
          {n.accountName} · {n.creatorName} · {n.topicType}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
        <span>{n.impression.toLocaleString()} <span className="text-muted">曝光</span></span>
        <span>{n.view.toLocaleString()} <span className="text-muted">阅读</span></span>
        <span>{n.likeCount} <span className="text-muted">赞</span></span>
        <span>{n.collect} <span className="text-muted">藏</span></span>
        <span>{n.commentCount} <span className="text-muted">评</span></span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<"7" | "14" | "30" | "all">("30");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const dashQuery = trpc.dashboard.overview.useQuery(undefined, { refetchOnWindowFocus: false });
  const rankingsQuery = trpc.dashboard.rankings.useQuery({ period }, { refetchOnWindowFocus: false });

  const data = dashQuery.data;
  const rankings = rankingsQuery.data;

  if (dashQuery.isLoading) {
    return <div className="text-muted text-center py-20 font-serif text-lg">加载中...</div>;
  }
  if (!data) {
    return <div className="text-muted text-center py-20 font-serif text-lg">暂无数据</div>;
  }

  const { accounts, totals } = data;
  const statusMap = totals.topicsByStatus as Record<string, number>;

  const kpiItems = [
    { eyebrow: "活跃账号", value: totals.totalAccounts, unit: "个" },
    { eyebrow: "本周发布", value: totals.totalNotesThisWeek, unit: "篇" },
    { eyebrow: "总曝光", value: totals.totalImpression, unit: "" },
    { eyebrow: "总阅读", value: totals.totalView, unit: "" },
    { eyebrow: "总点赞", value: totals.totalLike, unit: "" },
    { eyebrow: "总收藏", value: totals.totalCollect, unit: "" },
    { eyebrow: "总评论", value: totals.totalComment, unit: "" },
  ];

  return (
    <div className="space-y-10">
      {/* Editorial Header */}
      <div>
        <p className="eyebrow mb-2">总览</p>
        <div className="flex items-end justify-between">
          <h1 className="editorial-heading text-[36px] leading-tight">矩阵总览</h1>
          <span className="mono-data text-muted">
            数据快照 · {new Date().toLocaleDateString("zh-CN")}
          </span>
        </div>
        <div className="h-[1.5px] bg-ink mt-3" />
      </div>

      {/* KPI Row */}
      <div className="card-surface">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
          {kpiItems.map((k, i) => (
            <div
              key={k.eyebrow}
              className={`px-5 py-5 ${i > 0 ? "border-l border-hairline" : ""} ${i >= 2 && i < 3 ? "sm:border-l" : ""}`}
            >
              <p className="eyebrow mb-2">{k.eyebrow}</p>
              <div className="kpi-value">
                {(k.value || 0).toLocaleString()}
                {k.unit && <span className="text-muted text-sm font-sans font-normal ml-1">{k.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Topic Pipeline */}
      <div>
        <p className="eyebrow mb-3">选题进度</p>
        <div className="card-surface px-6 py-5">
          <div className="flex gap-6 flex-wrap">
            {Object.entries(TOPIC_STATUS).map(([key, label]) => (
              <div key={key} className="flex items-baseline gap-2">
                <span className="kpi-value text-2xl">{statusMap[key] || 0}</span>
                <span className="text-sm text-muted">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Account Health Grid */}
      <div>
        <p className="eyebrow mb-3">账号健康度</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-hairline card-surface overflow-hidden">
          {accounts.map((acct) => {
            const health = HEALTH_LABEL[acct.health] || HEALTH_LABEL.green;
            const pct = Math.min(100, (acct.weekPublished / (acct.weeklyTarget || 3)) * 100);
            return (
              <div key={acct.id} className="bg-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${HEALTH_DOT[acct.health]}`} />
                    <h3 className="font-serif font-bold text-ink text-[15px]">{acct.accountName}</h3>
                  </div>
                  <span className={`status-pill ${health.bg} ${health.text}`}>{health.label}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                  <span>{acct.ownerName}</span>
                  <span className="font-mono">
                    {(ACCOUNT_LAYER as Record<string, string>)[acct.layer] || acct.layer}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted">本周发布</span>
                    <span className="font-mono text-ink-soft">{acct.weekPublished} / {acct.weeklyTarget || 3}</span>
                  </div>
                  <div className="w-full bg-paper-alt h-1.5">
                    <div
                      className="h-1.5 bg-accent transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                {/* Metrics row */}
                <div className="grid grid-cols-4 gap-2 pt-3 border-t border-hairline">
                  {[
                    { label: "曝光", value: acct.totalImpression },
                    { label: "阅读", value: acct.totalView },
                    { label: "点赞", value: acct.totalLike },
                    { label: "收藏", value: acct.totalCollect },
                  ].map((m) => (
                    <div key={m.label} className="text-center">
                      <div className="font-serif font-bold text-ink text-sm">{m.value.toLocaleString()}</div>
                      <div className="font-mono text-[9px] tracking-widest text-muted mt-0.5">{m.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mono-data text-muted mt-2">
                  近30天 {acct.recentNoteCount} 篇
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rankings Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="eyebrow">内容排行</p>
          <div className="flex border border-hairline bg-card">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-3.5 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${
                  period === opt.value
                    ? "bg-ink text-card font-medium"
                    : "text-muted hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {rankingsQuery.isLoading ? (
          <div className="text-muted text-center py-10 font-serif">加载中...</div>
        ) : rankings ? (
          <div className="space-y-6">
            {/* Top 5 */}
            <div className="card-surface p-5 lg:p-6">
              <p className="eyebrow mb-4">总排名 TOP 5</p>
              {rankings.top5.length === 0 ? (
                <p className="text-sm text-muted">暂无数据</p>
              ) : (
                rankings.top5.map((n, i) => <NoteRankRow key={n.noteId} n={n} rank={i + 1} />)
              )}
            </div>

            {/* By Type */}
            <div className="card-surface p-5 lg:p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="eyebrow">按类型</p>
                {rankings.byType.length > 0 && (
                  <Dropdown
                    value={typeFilter}
                    onChange={setTypeFilter}
                    className="w-36"
                    options={[
                      { value: "", label: "全部类型" },
                      ...rankings.byType.map((t) => ({ value: t.type, label: `${t.type} (${t.count}篇)` })),
                    ]}
                  />
                )}
              </div>
              {rankings.byType.length === 0 ? (
                <p className="text-sm text-muted">暂无数据</p>
              ) : (
                <div className="space-y-5">
                  {rankings.byType
                    .filter((t) => !typeFilter || t.type === typeFilter)
                    .map((t) => (
                    <div key={t.type}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-serif font-bold text-ink text-sm">{t.type}</span>
                        <span className="status-pill bg-[#DBEAFE] text-accent">{t.count}篇</span>
                      </div>
                      {t.top3.map((n, i) => <NoteRankRow key={n.noteId} n={n} rank={i + 1} />)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Type x Teacher */}
            <div className="card-surface p-5 lg:p-6">
              <p className="eyebrow mb-4">类型 × 老师</p>
              {rankings.byTypeTeacher.length === 0 ? (
                <p className="text-sm text-muted">暂无数据</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-ink">
                      <th className="eyebrow text-left py-2.5 pr-4">类型</th>
                      <th className="eyebrow text-left py-2.5">分布</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.byTypeTeacher.map((t) => (
                      <tr key={t.type} className="border-b border-hairline">
                        <td className="py-3 pr-4 font-serif font-bold text-ink">{t.type}</td>
                        <td className="py-3">
                          <div className="flex gap-4 flex-wrap">
                            {t.teachers.map((tc) => (
                              <span key={tc.name} className="text-muted text-xs">
                                {tc.name} <span className="font-mono font-medium text-ink">{tc.count}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* By Teacher */}
            <div className="card-surface p-5 lg:p-6">
              <p className="eyebrow mb-4">按老师 · TOP 3</p>
              {rankings.byTeacher.length === 0 ? (
                <p className="text-sm text-muted">暂无数据</p>
              ) : (
                <div className="space-y-5">
                  {rankings.byTeacher.map((t) => (
                    <div key={t.name}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-serif font-bold text-ink text-sm">{t.name}</span>
                        <span className="status-pill bg-[#EDE9FE] text-[#6D28D9]">共{t.count}篇</span>
                      </div>
                      {t.top3.map((n, i) => <NoteRankRow key={n.noteId} n={n} rank={i + 1} />)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="border-t border-hairline pt-4 pb-2">
        <p className="mono-data text-muted text-center">
          数据快照 · {new Date().toLocaleDateString("zh-CN")} · 矩阵罗盘
        </p>
      </div>
    </div>
  );
}
