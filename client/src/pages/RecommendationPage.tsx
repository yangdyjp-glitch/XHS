import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../hooks/useAuth.js";
import Dropdown from "../components/ui/Dropdown.js";
import { BANNED_WORDS } from "@shared/bannedWords.js";
import TopicCreateDialog from "../components/topic/TopicCreateDialog.js";

const PRIORITY_LABEL: Record<string, string> = { high: "高", normal: "普通", low: "低" };
const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-[#FEE2E2] text-[#991B1B]",
  normal: "bg-paper-alt text-ink-soft",
  low: "bg-[#DBEAFE] text-accent",
};

const EVENT_CATEGORIES: Record<string, string> = {
  jlpt: "JLPT",
  eju: "EJU",
  undergraduate: "学部升学",
  graduate: "大学院升学",
  master_exam: "修士入试",
  language_school: "语言学校",
  coe: "在留资格",
  english_test: "英语考试",
  other: "其他",
};

const CATEGORY_STYLE: Record<string, string> = {
  jlpt: "bg-[#EDE9FE] text-[#6D28D9]",
  eju: "bg-[#FFF7ED] text-[#9A3412]",
  undergraduate: "bg-[#DCFCE7] text-[#166534]",
  graduate: "bg-[#DBEAFE] text-accent",
  master_exam: "bg-[#FEF3C7] text-[#92400E]",
  language_school: "bg-[#CFFAFE] text-[#155E75]",
  coe: "bg-[#FCE7F3] text-[#9D174D]",
  english_test: "bg-[#E0E7FF] text-[#3730A3]",
  other: "bg-paper-alt text-ink-soft",
};

export default function RecommendationPage() {
  const { isLeader, isTeacher, selectedAccountId } = useAuth();
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [showBannedWords, setShowBannedWords] = useState(false);
  const [eventForm, setEventForm] = useState({ title: "", eventDate: "", category: "other" });
  const [localRecs, setLocalRecs] = useState<any[] | null>(null);
  const [refreshingTitles, setRefreshingTitles] = useState<Set<string>>(new Set());
  const [useSeed, setUseSeed] = useState<any | null>(null);

  const utils = trpc.useUtils();
  const recommendMutation = trpc.review.aiRecommend.useMutation();
  const pastQuery = trpc.review.listRecommendations.useQuery({ limit: 5 }, { refetchOnWindowFocus: false });
  const reviewsQuery = trpc.review.list.useQuery({ limit: 10 }, { refetchOnWindowFocus: false, staleTime: 0 });
  const upcomingQuery = trpc.event.upcoming.useQuery({ days: 365 }, { refetchOnWindowFocus: false });
  const rejectedTitlesQuery = trpc.review.listRejectedTitles.useQuery(undefined, { refetchOnWindowFocus: false });
  const createEventMutation = trpc.event.create.useMutation({
    onSuccess: () => { setShowAddEvent(false); setEventForm({ title: "", eventDate: "", category: "other" }); utils.event.upcoming.invalidate(); },
  });
  const deleteEventMutation = trpc.event.delete.useMutation({ onSuccess: () => utils.event.upcoming.invalidate() });
  const refreshRecMutation = trpc.review.refreshRecommendation.useMutation();
  const rejectRecMutation = trpc.review.rejectRecommendation.useMutation();

  const result = recommendMutation.data?.result;
  const latestPast = pastQuery.data?.[0];
  const latestPastResult = latestPast?.resultJson as any;
  const displayResult = result || latestPastResult;

  // 推荐列表同步到本地可编辑副本（刷新/删除在副本上操作）
  useEffect(() => {
    setLocalRecs(displayResult?.recommendations ?? null);
  }, [displayResult]);

  const rejectedSet = new Set(rejectedTitlesQuery.data || []);
  const visibleRecs = (localRecs || []).filter((r) => !rejectedSet.has(r.title));

  const handleGenerate = () => {
    recommendMutation.mutate({
      reviewId: selectedReviewId || undefined,
      accountId: isTeacher ? (selectedAccountId || undefined) : undefined,
    });
  };

  const handleRefreshRec = (rec: any) => {
    if (refreshingTitles.has(rec.title)) return;
    const seedTitle = rec.title;
    setRefreshingTitles((prev) => new Set(prev).add(seedTitle));
    const stopRefreshing = () =>
      setRefreshingTitles((prev) => {
        const next = new Set(prev);
        next.delete(seedTitle);
        return next;
      });
    refreshRecMutation.mutate({
      seed: { title: rec.title, topicType: rec.topicType, keywords: rec.keywords || [], reason: rec.reason, priority: rec.priority || "normal" },
      avoidTitles: (localRecs || []).map((r) => r.title).filter((t) => t !== rec.title),
      reviewId: selectedReviewId || undefined,
      accountId: isTeacher ? (selectedAccountId || undefined) : undefined,
    }, {
      onSuccess: (data) => {
        setLocalRecs((prev) => (prev || []).map((r) => (r.title === seedTitle ? data.recommendation : r)));
        stopRefreshing();
      },
      onError: stopRefreshing,
    });
  };

  const handleRejectRec = (rec: any) => {
    if (!window.confirm("删除该推荐？之后 AI 将不再生成与之类似的选题。")) return;
    rejectRecMutation.mutate({
      title: rec.title, topicType: rec.topicType, keywords: rec.keywords || [], reason: rec.reason,
      accountId: isTeacher ? (selectedAccountId || undefined) : undefined,
    }, {
      onSuccess: () => {
        setLocalRecs((prev) => (prev || []).filter((r) => r.title !== rec.title));
        utils.review.listRejectedTitles.invalidate();
      },
    });
  };

  const handleAddEvent = () => {
    if (!eventForm.title || !eventForm.eventDate) return;
    createEventMutation.mutate(eventForm);
  };

  const upcomingEvents = upcomingQuery.data || [];
  const urgentEvents = upcomingEvents.filter((ev) => {
    const daysUntil = Math.ceil((new Date(ev.eventDate).getTime() - Date.now()) / 86400000);
    return daysUntil >= 0 && daysUntil <= 10;
  });
  const displayEvents = showAllEvents ? upcomingEvents : urgentEvents;
  const groupedEvents: Record<string, typeof upcomingEvents> = {};
  for (const ev of displayEvents) {
    const cat = ev.category || "other";
    if (!groupedEvents[cat]) groupedEvents[cat] = [];
    groupedEvents[cat].push(ev);
  }

  return (
    <div className="space-y-8">
      {/* Editorial Header */}
      <div>
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="eyebrow mb-1">RECOMMEND</p>
            <h1 className="editorial-heading text-[28px] leading-tight">下期调整</h1>
          </div>
          <div className="flex items-center gap-3">
            {reviewsQuery.data && reviewsQuery.data.length > 0 && (
              <Dropdown
                value={selectedReviewId ? String(selectedReviewId) : ""}
                onChange={(v) => setSelectedReviewId(v ? Number(v) : null)}
                placeholder="选择报告（可选）"
                className="w-56"
                options={[
                  { value: "", label: "不基于报告" },
                  ...reviewsQuery.data.map((r) => ({
                    value: String(r.id),
                    label: `${r.reviewType === "weekly" ? "周报" : "月报"} ${r.periodStart}~${r.periodEnd}`,
                  })),
                ]}
              />
            )}
            <button
              onClick={handleGenerate}
              disabled={recommendMutation.isPending}
              className="bg-ink text-card px-4 py-1.5 text-sm rounded-full hover:bg-ink-soft disabled:opacity-50"
            >
              {recommendMutation.isPending ? "AI 生成中..." : "AI 生成推荐"}
            </button>
          </div>
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      {/* Calendar Events */}
      <div className="card-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="font-serif font-bold text-ink text-lg">近期事件</h2>
            <span className="text-[11px] font-mono text-muted">
              {showAllEvents ? `共 ${upcomingEvents.length} 项` : `10天内 ${urgentEvents.length} 项`}
            </span>
          </div>
          <button onClick={() => setShowAddEvent(!showAddEvent)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              showAddEvent ? "bg-paper-alt text-muted hover:text-ink" : "bg-ink text-card hover:bg-ink-soft"
            }`}>
            {showAddEvent ? "取消" : "+ 添加事件"}
          </button>
        </div>

        {showAddEvent && (
          <div className="flex items-end gap-2 mb-4 p-3 bg-paper border border-hairline">
            <div className="flex-1">
              <label className="eyebrow block mb-1.5">名称</label>
              <input value={eventForm.title} onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full border border-hairline bg-card px-2 py-1.5 text-sm focus:outline-none focus:border-accent" placeholder="如：MEXT奖学金申请截止" />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">日期</label>
              <input type="date" value={eventForm.eventDate} onChange={(e) => setEventForm((f) => ({ ...f, eventDate: e.target.value }))}
                className="border border-hairline bg-card px-2 py-1.5 text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="eyebrow block mb-1.5">分类</label>
              <Dropdown
                value={eventForm.category}
                onChange={(v) => setEventForm((f) => ({ ...f, category: v }))}
                className="w-32"
                options={Object.entries(EVENT_CATEGORIES).map(([k, v]) => ({ value: k, label: v }))}
              />
            </div>
            <button onClick={handleAddEvent} disabled={createEventMutation.isPending || !eventForm.title || !eventForm.eventDate}
              className="bg-ink text-card px-3 py-1.5 text-sm rounded-full hover:bg-ink-soft disabled:opacity-50 shrink-0">
              添加
            </button>
          </div>
        )}

        {displayEvents.length === 0 ? (
          <p className="text-sm text-muted font-serif italic">{upcomingEvents.length === 0 ? "加载中..." : "10天内暂无紧急事件"}</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedEvents).map(([cat, events]) => (
              <div key={cat}>
                <div className="eyebrow mb-1.5" style={{ fontSize: 10 }}>
                  {EVENT_CATEGORIES[cat] || cat}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {events.map((ev) => {
                    const daysUntil = Math.ceil((new Date(ev.eventDate).getTime() - Date.now()) / 86400000);
                    return (
                      <div key={ev.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono ${CATEGORY_STYLE[cat] || CATEGORY_STYLE.other}`} style={{ borderRadius: 3 }}>
                        <span className="font-medium">{ev.eventDate}</span>
                        <span>{ev.title}</span>
                        <span className={daysUntil <= 14 ? "text-[#991B1B] font-bold" : "opacity-50"}>
                          {daysUntil > 0 ? `${daysUntil}天` : daysUntil === 0 ? "今天" : "已过"}
                        </span>
                        {!ev.isBuiltin && (
                          <button onClick={() => deleteEventMutation.mutate({ id: ev.id })} className="ml-0.5 opacity-40 hover:opacity-100 hover:text-[#991B1B]">x</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <p className="mono-data text-muted">事件会自动纳入 AI 推荐上下文</p>
          <button onClick={() => setShowAllEvents(!showAllEvents)}
            className="mono-data text-accent hover:text-accent-deep transition-colors">
            {showAllEvents ? "收起 ▲" : `查看全部事件 (${upcomingEvents.length}) ▼`}
          </button>
        </div>
      </div>

      {/* 禁用词表 */}
      <div className="card-surface p-5">
        <button
          onClick={() => setShowBannedWords(!showBannedWords)}
          className="w-full flex items-center justify-between"
        >
          <h2 className="font-serif font-bold text-ink text-lg">禁用词表</h2>
          <span className="mono-data text-accent hover:text-accent-deep transition-colors">
            {showBannedWords ? "收起 ▲" : "展开 ▼"}
          </span>
        </button>
        {showBannedWords && (
          <div className="mt-3">
            {BANNED_WORDS.length === 0 ? (
              <p className="text-sm text-muted font-serif italic">禁用词表待补充</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {BANNED_WORDS.map((w) => (
                  <span key={w} className="status-pill bg-[#FEE2E2] text-[#991B1B]">{w}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {recommendMutation.isError && (
        <div className="text-sm text-[#991B1B] bg-[#FEE2E2] px-3 py-2">{recommendMutation.error?.message || "生成失败"}</div>
      )}

      {displayResult ? (
        <div className="space-y-5">
          {displayResult.strategy && (
            <div className="card-surface p-5 border-l-[3px] border-accent">
              <h2 className="font-serif font-bold text-ink text-lg mb-2">策略建议</h2>
              <p className="text-sm text-ink-soft leading-relaxed">{displayResult.strategy}</p>
            </div>
          )}

          <div className="space-y-3">
            {visibleRecs.map((rec: any, i: number) => (
              <div key={`${rec.title}-${i}`} className="card-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <h3 className="font-serif font-bold text-ink">{rec.title}</h3>
                      {(() => {
                        const pr = String(rec.priority || "normal").toLowerCase();
                        return (
                          <span className={`status-pill ${PRIORITY_STYLE[pr] || PRIORITY_STYLE.normal}`}>
                            {PRIORITY_LABEL[pr] || "普通"}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="status-pill bg-[#DBEAFE] text-accent">{rec.topicType}</span>
                      {rec.keywords?.map((k: string) => (
                        <span key={k} className="status-pill bg-[#EDE9FE] text-[#6D28D9]">{k}</span>
                      ))}
                    </div>
                    <p className="text-sm text-ink-soft">{rec.reason}</p>
                  </div>
                  <div className="shrink-0 flex flex-col gap-1.5">
                    <button onClick={() => handleRefreshRec(rec)}
                      disabled={refreshingTitles.has(rec.title)}
                      className="px-3 py-1.5 text-sm rounded-full border border-hairline text-ink-soft hover:bg-paper-alt disabled:opacity-50 transition-colors">
                      {refreshingTitles.has(rec.title) ? "刷新中..." : "刷新"}
                    </button>
                    {!isLeader && (
                      <button onClick={() => setUseSeed(rec)}
                        className="px-3 py-1.5 text-sm rounded-full bg-ink text-card hover:bg-ink-soft transition-colors">
                        使用
                      </button>
                    )}
                    <button onClick={() => handleRejectRec(rec)}
                      disabled={rejectRecMutation.isPending}
                      className="px-3 py-1.5 text-sm rounded-full border border-hairline text-[#991B1B] hover:bg-[#FEE2E2] disabled:opacity-50 transition-colors">
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {(recommendMutation.data?.analysis || latestPast) && (
            <div className="mono-data text-muted text-right">
              {(recommendMutation.data?.analysis || latestPast)?.modelUsed} ·{" "}
              {(recommendMutation.data?.analysis || latestPast)?.tokensUsed} tokens ·{" "}
              {new Date((recommendMutation.data?.analysis || latestPast)!.createdAt).toLocaleString("zh-CN")}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-muted font-serif text-lg italic">基于复盘数据和近期事件节点，AI 为你推荐下期选题方向</p>
          <p className="mono-data text-muted mt-2">点击「AI 生成推荐」开始</p>
        </div>
      )}

      {useSeed && (
        <TopicCreateDialog
          initialTitle={useSeed.title}
          initialTopicType={useSeed.topicType}
          initialKeywords={useSeed.keywords || []}
          onClose={() => setUseSeed(null)}
          onCreated={() => setUseSeed(null)}
        />
      )}
    </div>
  );
}
