import { useState, useMemo } from "react";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../hooks/useAuth.js";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

// Generate recent weeks list (last 12 weeks)
function getRecentWeeks(count = 12) {
  const weeks: { label: string; start: string; end: string }[] = [];
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday - i * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const s = monday.toISOString().split("T")[0];
    const e = sunday.toISOString().split("T")[0];
    const mStr = `${monday.getMonth() + 1}/${monday.getDate()}`;
    const sStr = `${sunday.getMonth() + 1}/${sunday.getDate()}`;
    weeks.push({ label: `${mStr} – ${sStr}`, start: s, end: e });
  }
  return weeks;
}

// Generate recent months list (last 12 months)
function getRecentMonths(count = 12) {
  const months: { label: string; start: string; end: string }[] = [];
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    months.push({
      label: `${s.getFullYear()}年${s.getMonth() + 1}月`,
      start: s.toISOString().split("T")[0],
      end: e.toISOString().split("T")[0],
    });
  }
  return months;
}

export default function ReviewPage() {
  const { isLeader, isTeacher } = useAuth();
  // Teachers can only use monthly reports
  const [tab, setTab] = useState<"weekly" | "monthly">(isTeacher ? "monthly" : "weekly");
  const [selectedReview, setSelectedReview] = useState<number | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(0); // index into weeks/months list

  const utils = trpc.useUtils();

  const weeks = useMemo(() => getRecentWeeks(), []);
  const months = useMemo(() => getRecentMonths(), []);
  const periods = tab === "weekly" ? weeks : months;

  const reviewsQuery = trpc.review.list.useQuery(
    { type: tab, limit: 20 },
    { refetchOnWindowFocus: false }
  );
  const detailQuery = trpc.review.getById.useQuery(
    { id: selectedReview! },
    { enabled: !!selectedReview, refetchOnWindowFocus: false }
  );

  const generateMutation = trpc.review.generate.useMutation({
    onSuccess: (data) => {
      reviewsQuery.refetch();
      setSelectedReview(data.review.id);
    },
  });
  const deleteMutation = trpc.review.delete.useMutation({
    // 乐观更新：点击后立即从列表移除，无需等待服务器
    onMutate: async ({ id }) => {
      const key = { type: tab, limit: 20 } as const;
      setSelectedReview((cur) => (cur === id ? null : cur));
      await utils.review.list.cancel(key);
      const prev = utils.review.list.getData(key);
      utils.review.list.setData(key, (old) => old?.filter((r) => r.id !== id));
      return { prev, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.review.list.setData(ctx.key, ctx.prev);
    },
    onSettled: () => utils.review.list.invalidate(),
  });
  const analyzeMutation = trpc.review.aiAnalyze.useMutation({
    onSuccess: () => detailQuery.refetch(),
  });

  const review = detailQuery.data;
  const summaryJson = review?.summaryJson as any;
  const latestAnalysis = review?.analyses?.[0];
  const analysisResult = latestAnalysis?.resultJson as any;

  return (
    <div>
      {/* Editorial Header */}
      <div className="mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="eyebrow mb-1">REVIEW</p>
            <h1 className="editorial-heading text-[28px] leading-tight">复盘报告</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Leaders can switch between weekly/monthly; teachers only see monthly */}
            {isLeader ? (
              <div className="flex border border-hairline bg-card">
                <button
                  onClick={() => { setTab("weekly"); setSelectedReview(null); setSelectedPeriod(0); }}
                  className={`px-4 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${tab === "weekly" ? "bg-ink text-card" : "text-muted hover:text-ink"}`}
                >
                  WEEKLY
                </button>
                <button
                  onClick={() => { setTab("monthly"); setSelectedReview(null); setSelectedPeriod(0); }}
                  className={`px-4 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${tab === "monthly" ? "bg-ink text-card" : "text-muted hover:text-ink"}`}
                >
                  MONTHLY
                </button>
              </div>
            ) : null}
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(Number(e.target.value))}
              className="border border-hairline bg-card px-3 py-1.5 text-sm text-ink focus:border-accent outline-none min-w-[10rem]"
            >
              {periods.map((p, i) => (
                <option key={i} value={i}>{p.label}</option>
              ))}
            </select>
            <button
              onClick={() => generateMutation.mutate({
                type: tab,
                periodStart: periods[selectedPeriod].start,
                periodEnd: periods[selectedPeriod].end,
              })}
              disabled={generateMutation.isPending}
              className="bg-ink text-card px-4 py-1.5 text-sm font-medium rounded-full hover:bg-ink-soft disabled:opacity-50"
            >
              {generateMutation.isPending ? "生成中..." : "生成报告"}
            </button>
          </div>
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Report List */}
        <div className="md:col-span-1 space-y-2">
          <p className="eyebrow mb-2">HISTORY</p>
          {reviewsQuery.isLoading && <p className="text-sm text-muted font-serif italic">加载中...</p>}
          {reviewsQuery.data?.length === 0 && <p className="text-sm text-muted font-serif italic">暂无报告</p>}
          {reviewsQuery.data?.map((r) => (
            <div
              key={r.id}
              onClick={() => setSelectedReview(r.id)}
              className={`card-surface p-3 cursor-pointer text-sm transition-colors ${
                selectedReview === r.id ? "border-accent bg-[#EFF6FF]" : "hover:bg-[#F0F4FA]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-ink">
                  {r.reviewType === "weekly" ? "周报" : "月报"}
                  {r.scope === "account" ? " (单号)" : " (全矩阵)"}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm("确定要删除这份报告吗？")) {
                      deleteMutation.mutate({ id: r.id });
                    }
                  }}
                  className="text-[10px] text-muted hover:text-[#991B1B] px-1"
                >
                  删除
                </button>
              </div>
              <div className="mono-data text-muted mt-1">
                {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
              </div>
            </div>
          ))}
        </div>

        {/* Report Detail */}
        <div className="md:col-span-3">
          {!selectedReview ? (
            <div className="text-muted flex items-center justify-center min-h-[400px] font-serif italic md:-translate-x-[17%]">
              {reviewsQuery.data?.length ? "选择一份报告查看详情" : "点击右上角按钮生成第一份报告"}
            </div>
          ) : detailQuery.isLoading ? (
            <div className="text-muted text-center py-20 font-serif italic">加载中...</div>
          ) : review ? (
            <div className="space-y-5">
              {/* Header */}
              <div className="card-surface p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-serif font-bold text-lg text-ink">
                    {review.reviewType === "weekly" ? "周报" : "月报"} ·{" "}
                    {formatDate(review.periodStart)} – {formatDate(review.periodEnd)}
                  </h2>
                  <span className="status-pill bg-[#DBEAFE] text-accent">
                    {review.scope === "account" ? "单号" : "全矩阵"}
                  </span>
                </div>
                {review.highlights && (
                  <p className="text-sm text-ink-soft">{review.highlights}</p>
                )}
              </div>

              {/* KPI Summary — 设计与「矩阵总览」完全一致：标签在上、数字带色 */}
              {summaryJson && (
                <div className="card-surface">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      { eyebrow: "发布笔记", value: summaryJson.noteCount, unit: "篇", color: "" },
                      { eyebrow: "总曝光", value: summaryJson.totalImpression, unit: "", color: "text-[#2563EB]" },
                      { eyebrow: "总阅读", value: summaryJson.totalView, unit: "", color: "text-[#059669]" },
                      { eyebrow: "总点赞", value: summaryJson.totalLike, unit: "", color: "text-[#DC2626]" },
                      { eyebrow: "总收藏", value: summaryJson.totalCollect, unit: "", color: "text-[#D97706]" },
                      { eyebrow: "总评论", value: summaryJson.totalComment, unit: "", color: "text-[#7C3AED]" },
                    ].map((m, i) => (
                      <div key={m.eyebrow} className={`px-5 py-5 ${i > 0 ? "border-l border-hairline" : ""}`}>
                        <p className="eyebrow mb-2">{m.eyebrow}</p>
                        <div className={`kpi-value ${m.color}`}>
                          {(m.value || 0).toLocaleString()}
                          {m.unit && <span className="text-muted text-sm font-sans font-normal ml-1">{m.unit}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Analysis */}
              <div className="card-surface p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="eyebrow">AI 分析</p>
                  <button
                    onClick={() => analyzeMutation.mutate({ reviewId: review.id })}
                    disabled={analyzeMutation.isPending}
                    className="bg-accent text-white px-4 py-1.5 text-sm rounded-full hover:bg-accent-deep disabled:opacity-50"
                  >
                    {analyzeMutation.isPending ? "分析中..." : latestAnalysis ? "重新分析" : "AI 分析"}
                  </button>
                </div>

                {analyzeMutation.isError && (
                  <div className="text-sm text-[#991B1B] bg-[#FEE2E2] px-3 py-2 mb-3">{analyzeMutation.error?.message || "分析失败"}</div>
                )}

                {analysisResult ? (
                  <div className="space-y-5 text-sm">
                    <p className="text-ink-soft leading-relaxed">{analysisResult.summary}</p>

                    {analysisResult.topPerformers?.length > 0 && (
                      <div>
                        <p className="eyebrow mb-2 text-[#166534]">表现优异</p>
                        {analysisResult.topPerformers.map((t: any, i: number) => (
                          <div key={i} className="flex gap-2 py-1.5 border-b border-hairline last:border-0">
                            <span className="text-[#166534] shrink-0 font-mono text-xs">+</span>
                            <span className="text-ink-soft"><strong className="text-ink">{t.title}</strong> — {t.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {analysisResult.bottomPerformers?.length > 0 && (
                      <div>
                        <p className="eyebrow mb-2 text-[#9A3412]">有待改进</p>
                        {analysisResult.bottomPerformers.map((t: any, i: number) => (
                          <div key={i} className="flex gap-2 py-1.5 border-b border-hairline last:border-0">
                            <span className="text-[#9A3412] shrink-0 font-mono text-xs">-</span>
                            <span className="text-ink-soft"><strong className="text-ink">{t.title}</strong> — {t.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {analysisResult.contentFormulas?.length > 0 && (
                      <div>
                        <p className="eyebrow mb-2">内容公式</p>
                        <ul className="space-y-1 text-ink-soft">
                          {analysisResult.contentFormulas.map((f: string, i: number) => (
                            <li key={i} className="flex gap-2"><span className="text-accent font-mono text-xs">*</span>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysisResult.trends?.length > 0 && (
                      <div>
                        <p className="eyebrow mb-2">趋势洞察</p>
                        <ul className="space-y-1 text-ink-soft">
                          {analysisResult.trends.map((t: string, i: number) => (
                            <li key={i} className="flex gap-2"><span className="text-[#6D28D9] font-mono text-xs">*</span>{t}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysisResult.improvements?.length > 0 && (
                      <div>
                        <p className="eyebrow mb-2">改进建议</p>
                        <ul className="space-y-1 text-ink-soft">
                          {analysisResult.improvements.map((imp: string, i: number) => (
                            <li key={i} className="flex gap-2"><span className="text-[#9A3412] font-mono text-xs">*</span>{imp}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mono-data text-muted pt-3 border-t border-hairline">
                      {latestAnalysis?.modelUsed} · {latestAnalysis?.tokensUsed} tokens ·{" "}
                      {new Date(latestAnalysis!.createdAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted font-serif italic">点击「AI 分析」获取智能复盘报告</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
