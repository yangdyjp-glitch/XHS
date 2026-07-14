import { useEffect, useState } from "react";
import { trpc } from "../lib/trpc.js";
import { ACCOUNT_LAYER } from "@shared/enums.js";
import Dropdown from "../components/ui/Dropdown.js";
import AccountFilter from "../components/ui/AccountFilter.js";
import NoteLink from "../components/ui/NoteLink.js";

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
  { value: "7" as const, label: "近7天", metricLabel: "近7天发布" },
  { value: "14" as const, label: "近14天", metricLabel: "近14天发布" },
  { value: "30" as const, label: "近30天", metricLabel: "近30天发布" },
  { value: "all" as const, label: "全部时间", metricLabel: "累计发布" },
];
type DashboardPeriod = (typeof PERIOD_OPTIONS)[number]["value"];

function NoteRankRow({ n, rank }: { n: any; rank: number }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-hairline last:border-0">
      <span className="font-mono text-muted text-xs w-5 text-right shrink-0">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink font-medium truncate">{n.title}</div>
        <div className="mono-data text-muted mt-0.5">
          {n.accountName} · 上传人 {n.creatorName || "未知"}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
        <span><span className="text-[#2563EB]">{n.impression.toLocaleString()}</span> <span className="text-muted">曝光</span></span>
        <span><span className="text-[#059669]">{n.view.toLocaleString()}</span> <span className="text-muted">阅读</span></span>
        <span><span className="text-[#DC2626]">{n.likeCount}</span> <span className="text-muted">赞</span></span>
        <span><span className="text-[#D97706]">{n.collect}</span> <span className="text-muted">藏</span></span>
        <span><span className="text-[#7C3AED]">{n.commentCount}</span> <span className="text-muted">评</span></span>
        <span><span className="text-[#0891B2]">{(n.shareCount ?? 0)}</span> <span className="text-muted">转</span></span>
        {n.coverClickRate != null && <span><span className="text-accent">{n.coverClickRate.toFixed(2)}%</span> <span className="text-muted">首图</span></span>}
      </div>
      <NoteLink raw={n.xhsNoteUrl}
        className="shrink-0 text-[11px] font-mono bg-ink text-card px-2.5 py-1 rounded-full hover:bg-ink-soft transition-colors"
      >查看</NoteLink>
    </div>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("30");
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]); // 空 = 全部账号

  const dashQuery = trpc.dashboard.overview.useQuery({ period }, { staleTime: 0, refetchOnWindowFocus: true });
  const rankingsQuery = trpc.dashboard.rankings.useQuery(
    { period, accountIds: selectedAccounts.length > 0 ? selectedAccounts : undefined },
    { staleTime: 0, refetchOnWindowFocus: true }
  );

  const data = dashQuery.data;
  const rankings = rankingsQuery.data;
  const selectedPeriod = PERIOD_OPTIONS.find((p) => p.value === period) || PERIOD_OPTIONS[2];

  useEffect(() => {
    if (!data) return;
    const activeIds = new Set(data.accounts.map((account) => account.id));
    setSelectedAccounts((current) => {
      const next = current.filter((id) => activeIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [data]);

  if (dashQuery.isLoading) {
    return <div className="text-muted text-center py-20 font-serif text-lg">加载中...</div>;
  }
  if (!data) {
    return <div className="text-muted text-center py-20 font-serif text-lg">暂无数据</div>;
  }

  const { accounts, totals } = data;

  // 账号筛选：选中账号时，KPI 概览与健康度卡片只看所选账号(可多选)；未选则看全矩阵
  const shownAccounts = selectedAccounts.length > 0 ? accounts.filter((a) => selectedAccounts.includes(a.id)) : accounts;
  const displayTotals = selectedAccounts.length > 0
    ? {
        totalAccounts: shownAccounts.length,
        totalNotesInPeriod: shownAccounts.reduce((s, a) => s + (a.periodPublished ?? a.weekPublished), 0),
        totalNotesThisWeek: shownAccounts.reduce((s, a) => s + (a.periodPublished ?? a.weekPublished), 0),
        totalImpression: shownAccounts.reduce((s, a) => s + a.totalImpression, 0),
        totalView: shownAccounts.reduce((s, a) => s + a.totalView, 0),
        totalLike: shownAccounts.reduce((s, a) => s + a.totalLike, 0),
        totalCollect: shownAccounts.reduce((s, a) => s + a.totalCollect, 0),
        totalComment: shownAccounts.reduce((s, a) => s + a.totalComment, 0),
      }
    : totals;

  const kpiItems = [
    { eyebrow: "活跃账号", value: displayTotals.totalAccounts, unit: "个", color: "" },
    { eyebrow: selectedPeriod.metricLabel, value: displayTotals.totalNotesInPeriod ?? displayTotals.totalNotesThisWeek, unit: "篇", color: "" },
    { eyebrow: "总曝光", value: displayTotals.totalImpression, unit: "", color: "text-[#2563EB]" },
    { eyebrow: "总阅读", value: displayTotals.totalView, unit: "", color: "text-[#059669]" },
    { eyebrow: "总点赞", value: displayTotals.totalLike, unit: "", color: "text-[#DC2626]" },
    { eyebrow: "总收藏", value: displayTotals.totalCollect, unit: "", color: "text-[#D97706]" },
    { eyebrow: "总评论", value: displayTotals.totalComment, unit: "", color: "text-[#7C3AED]" },
  ];

  return (
    <div className="space-y-10">
      {/* Editorial Header */}
      <div>
        <p className="eyebrow mb-2">总览</p>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="editorial-heading text-[36px] leading-tight">矩阵总览</h1>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <Dropdown
              value={period}
              onChange={(value) => setPeriod(value as DashboardPeriod)}
              className="w-32"
              options={PERIOD_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
            />
            <AccountFilter
              accounts={accounts}
              selected={selectedAccounts}
              onChange={setSelectedAccounts}
              widthClass="w-72"
            />
            <span className="mono-data text-muted hidden lg:inline">
              数据快照 · {selectedPeriod.label} · {new Date().toLocaleDateString("zh-CN")}
            </span>
          </div>
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
              <div className={`kpi-value ${k.color}`}>
                {(k.value || 0).toLocaleString()}
                {k.unit && <span className="text-muted text-sm font-sans font-normal ml-1">{k.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Account Health Grid */}
      <div>
        <p className="eyebrow mb-3">账号健康度</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-hairline card-surface overflow-hidden">
          {shownAccounts.map((acct) => {
            const health = HEALTH_LABEL[acct.health] || HEALTH_LABEL.green;
            const periodPublished = acct.periodPublished ?? acct.weekPublished;
            const periodTarget = acct.periodTarget ?? (acct.weeklyTarget || 3);
            const pct = Math.min(100, (periodPublished / periodTarget) * 100);
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
                    <span className="text-muted">时段发布</span>
                    <span className="font-mono text-ink-soft">{periodPublished} / {periodTarget}</span>
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
                    { label: "曝光", value: acct.totalImpression, color: "text-[#2563EB]" },
                    { label: "阅读", value: acct.totalView, color: "text-[#059669]" },
                    { label: "点赞", value: acct.totalLike, color: "text-[#DC2626]" },
                    { label: "收藏", value: acct.totalCollect, color: "text-[#D97706]" },
                  ].map((m) => (
                    <div key={m.label} className="text-center">
                      <div className={`font-serif font-bold text-sm ${m.color}`}>{m.value.toLocaleString()}</div>
                      <div className="font-mono text-[9px] tracking-widest text-muted mt-0.5">{m.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mono-data text-muted mt-2">
                  {selectedPeriod.label} {acct.recentNoteCount} 篇
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rankings Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="eyebrow">内容排行 · {selectedPeriod.label}</p>
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

            {/* By Uploader */}
            <div className="card-surface p-5 lg:p-6">
              <p className="eyebrow mb-4">按上传人 · TOP 3</p>
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
          数据快照 · {selectedPeriod.label} · {new Date().toLocaleDateString("zh-CN")} · 矩阵罗盘
        </p>
      </div>
    </div>
  );
}
