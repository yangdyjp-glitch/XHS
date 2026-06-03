import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../hooks/useAuth.js";

const STATUS_BG: Record<string, string> = {
  pending_review: "bg-[#F3F4F6]",   // 浅灰
  approved: "bg-[#FEF9C3]",         // 浅黄
  writing: "bg-[#DCFCE7]",          // 浅绿
  published: "bg-[#DBEAFE]",        // 浅蓝
};

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

export default function CalendarPage() {
  const { isTeacher, selectedAccountId } = useAuth();
  const [, navigate] = useLocation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const effectiveAccountId = isTeacher ? (selectedAccountId || undefined) : undefined;
  const topicsQuery = trpc.topic.list.useQuery(
    { accountId: effectiveAccountId },
    { refetchOnWindowFocus: false }
  );

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  const topicsByDate = useMemo(() => {
    const map: Record<string, NonNullable<typeof topicsQuery.data>> = {};
    if (topicsQuery.data) {
      for (const t of topicsQuery.data) {
        if (t.plannedPublishDate) {
          const key = t.plannedPublishDate;
          if (!map[key]) map[key] = [];
          map[key].push(t);
        }
      }
    }
    return map;
  }, [topicsQuery.data]);

  const goPrev = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  };
  const goNext = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (day: number) =>
    year === now.getFullYear() && month === now.getMonth() && day === now.getDate();

  const formatDateKey = (day: number) => {
    const m = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="eyebrow mb-1">CALENDAR</p>
            <h1 className="editorial-heading text-[28px] leading-tight">发布日历</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={goPrev} className="border border-hairline bg-card px-3 py-1.5 text-sm hover:border-accent transition-colors">←</button>
            <button onClick={goToday} className="border border-hairline bg-card px-3 py-1.5 text-sm hover:border-accent transition-colors font-mono">今天</button>
            <span className="font-serif font-bold text-ink text-lg px-3 min-w-[140px] text-center">
              {year}年{month + 1}月
            </span>
            <button onClick={goNext} className="border border-hairline bg-card px-3 py-1.5 text-sm hover:border-accent transition-colors">→</button>
          </div>
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#F3F4F6] border border-hairline" /> 待审批</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#FEF9C3] border border-hairline" /> 已通过</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#DCFCE7] border border-hairline" /> 写作中</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#DBEAFE] border border-hairline" /> 已发布</span>
      </div>

      {/* Calendar Grid */}
      <div className="card-surface overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-ink">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center eyebrow">{w}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const dateKey = day ? formatDateKey(day) : "";
            const dayTopics = day ? (topicsByDate[dateKey] || []) : [];
            return (
              <div
                key={idx}
                className={`border-b border-r border-hairline min-h-[120px] ${
                  day ? "bg-card" : "bg-paper-alt/50"
                } ${idx % 7 === 0 ? "" : ""}`}
              >
                {day && (
                  <div className="p-1.5">
                    <div className={`text-xs font-mono mb-1 ${
                      isToday(day)
                        ? "bg-accent text-white w-6 h-6 rounded-full flex items-center justify-center font-bold"
                        : "text-muted pl-1"
                    }`}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayTopics.map((topic) => (
                        <div
                          key={topic.id}
                          onClick={() => navigate(`/topic/${topic.id}`)}
                          className={`px-1.5 py-1 cursor-pointer rounded-sm text-[11px] leading-tight hover:opacity-80 transition-opacity ${STATUS_BG[topic.status] || "bg-paper-alt"}`}
                        >
                          <div className="font-medium text-ink line-clamp-1">{topic.title}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {topic.accountColor && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: topic.accountColor }} />}
                            <span className="text-muted truncate">{topic.accountName}{topic.creatorName ? ` · ${topic.creatorName}` : ""}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
