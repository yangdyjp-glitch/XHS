import { useState } from "react";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../hooks/useAuth.js";

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
  other: "其他",
};

const CATEGORY_STYLE: Record<string, string> = {
  jlpt: "bg-[#EDE9FE] text-[#6D28D9]",
  eju: "bg-[#FFF7ED] text-[#9A3412]",
  undergraduate: "bg-[#DCFCE7] text-[#166534]",
  graduate: "bg-[#DBEAFE] text-accent",
  other: "bg-paper-alt text-ink-soft",
};

export default function RecommendationPage() {
  const { isLeader } = useAuth();
  const [creating, setCreating] = useState<number | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [eventForm, setEventForm] = useState({ title: "", eventDate: "", category: "other" });

  const utils = trpc.useUtils();
  const recommendMutation = trpc.review.aiRecommend.useMutation();
  const pastQuery = trpc.review.listRecommendations.useQuery({ limit: 5 }, { refetchOnWindowFocus: false });
  const reviewsQuery = trpc.review.list.useQuery({ type: "weekly", limit: 5 }, { refetchOnWindowFocus: false });
  const upcomingQuery = trpc.event.upcoming.useQuery({ days: 90 }, { refetchOnWindowFocus: false });
  const seedMutation = trpc.event.seedBuiltin.useMutation({ onSuccess: () => utils.event.upcoming.invalidate() });
  const createEventMutation = trpc.event.create.useMutation({
    onSuccess: () => { setShowAddEvent(false); setEventForm({ title: "", eventDate: "", category: "other" }); utils.event.upcoming.invalidate(); },
  });
  const deleteEventMutation = trpc.event.delete.useMutation({ onSuccess: () => utils.event.upcoming.invalidate() });
  const createTopicMutation = trpc.topic.create.useMutation({ onSuccess: () => setCreating(null) });

  const result = recommendMutation.data?.result;
  const latestPast = pastQuery.data?.[0];
  const latestPastResult = latestPast?.resultJson as any;
  const displayResult = result || latestPastResult;

  const handleGenerate = (reviewId?: number) => { recommendMutation.mutate({ reviewId }); };

  const handleCreateTopic = (rec: any, index: number) => {
    setCreating(index);
    createTopicMutation.mutate({
      title: rec.title, topicType: rec.topicType, keywords: rec.keywords,
      plannedPublishDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
      priority: rec.priority || "normal",
    });
  };

  const handleAddEvent = () => {
    if (!eventForm.title || !eventForm.eventDate) return;
    createEventMutation.mutate(eventForm);
  };

  const upcomingEvents = upcomingQuery.data || [];
  const groupedEvents: Record<string, typeof upcomingEvents> = {};
  for (const ev of upcomingEvents) {
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
              <select
                onChange={(e) => { const val = e.target.value; if (val) handleGenerate(Number(val)); }}
                className="border border-hairline bg-card px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
                defaultValue=""
              >
                <option value="" disabled>基于已有报告...</option>
                {reviewsQuery.data.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reviewType === "weekly" ? "周报" : "月报"} {r.periodStart}~{r.periodEnd}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => handleGenerate()}
              disabled={recommendMutation.isPending}
              className="bg-accent text-white px-4 py-1.5 text-sm rounded-full hover:bg-accent-deep disabled:opacity-50"
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
          <p className="eyebrow">近期事件</p>
          <div className="flex items-center gap-2">
            {upcomingEvents.length === 0 && (
              <button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}
                className="mono-data text-muted hover:text-ink px-3 py-1 border border-hairline transition-colors">
                {seedMutation.isPending ? "导入中..." : "导入内置事件"}
              </button>
            )}
            <button onClick={() => setShowAddEvent(!showAddEvent)}
              className="mono-data text-accent hover:text-accent-deep">
              {showAddEvent ? "取消" : "+ 添加事件"}
            </button>
          </div>
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
              <select value={eventForm.category} onChange={(e) => setEventForm((f) => ({ ...f, category: e.target.value }))}
                className="border border-hairline bg-card px-2 py-1.5 text-sm focus:outline-none focus:border-accent">
                {Object.entries(EVENT_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <button onClick={handleAddEvent} disabled={createEventMutation.isPending || !eventForm.title || !eventForm.eventDate}
              className="bg-ink text-card px-3 py-1.5 text-sm rounded-full hover:bg-ink-soft disabled:opacity-50 shrink-0">
              添加
            </button>
          </div>
        )}

        {upcomingEvents.length === 0 ? (
          <p className="text-sm text-muted font-serif italic">暂无近期事件，点击「导入内置事件」加载考试/升学节点</p>
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
        <p className="mono-data text-muted mt-3">事件会自动纳入 AI 推荐上下文</p>
      </div>

      {recommendMutation.isError && (
        <div className="text-sm text-[#991B1B] bg-[#FEE2E2] px-3 py-2">{recommendMutation.error?.message || "生成失败"}</div>
      )}

      {displayResult ? (
        <div className="space-y-5">
          {displayResult.strategy && (
            <div className="card-surface p-5 border-l-[3px] border-accent">
              <p className="eyebrow mb-2">策略建议</p>
              <p className="text-sm text-ink-soft leading-relaxed">{displayResult.strategy}</p>
            </div>
          )}

          <div className="space-y-3">
            {displayResult.recommendations?.map((rec: any, i: number) => (
              <div key={i} className="card-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <h3 className="font-serif font-bold text-ink">{rec.title}</h3>
                      <span className={`status-pill ${PRIORITY_STYLE[rec.priority] || PRIORITY_STYLE.normal}`}>
                        {PRIORITY_LABEL[rec.priority] || "NORMAL"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="status-pill bg-[#DBEAFE] text-accent">{rec.topicType}</span>
                      {rec.keywords?.map((k: string) => (
                        <span key={k} className="status-pill bg-[#EDE9FE] text-[#6D28D9]">{k}</span>
                      ))}
                    </div>
                    <p className="text-sm text-ink-soft">{rec.reason}</p>
                  </div>
                  {!isLeader && (
                    <button onClick={() => handleCreateTopic(rec, i)}
                      disabled={creating === i || createTopicMutation.isPending}
                      className="shrink-0 bg-ink text-card px-3 py-1.5 text-sm rounded-full hover:bg-ink-soft disabled:opacity-50">
                      {creating === i && createTopicMutation.isPending ? "创建中..." : "创建选题"}
                    </button>
                  )}
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
    </div>
  );
}
