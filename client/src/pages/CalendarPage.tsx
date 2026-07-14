import { useMemo, useState } from "react";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../hooks/useAuth.js";
import NoteLink from "../components/ui/NoteLink.js";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function dateKey(value: string | Date) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export default function CalendarPage() {
  const { isTeacher, selectedAccountId } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const postsQuery = trpc.note.listManaged.useQuery(
    { accountId: isTeacher ? (selectedAccountId || undefined) : undefined },
    { staleTime: 0, refetchOnWindowFocus: true },
  );

  const byDate = useMemo(() => {
    const result: Record<string, NonNullable<typeof postsQuery.data>> = {};
    for (const post of postsQuery.data ?? []) {
      if (!post.publishedAt) continue;
      const key = dateKey(post.publishedAt);
      if (!result[key]) result[key] = [];
      result[key].push(post);
    }
    return result;
  }, [postsQuery.data]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const sundayBased = new Date(year, month, 1).getDay();
  const firstDay = sundayBased === 0 ? 6 : sundayBased - 1;
  const cells: Array<number | null> = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const goPrevious = () => {
    if (month === 0) { setYear((value) => value - 1); setMonth(11); }
    else setMonth((value) => value - 1);
  };
  const goNext = () => {
    if (month === 11) { setYear((value) => value + 1); setMonth(0); }
    else setMonth((value) => value + 1);
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-end justify-between gap-4 mb-3">
          <div>
            <p className="eyebrow mb-1">CALENDAR</p>
            <h1 className="editorial-heading text-[28px] leading-tight">真实发布日历</h1>
            <p className="text-sm text-muted mt-1">发布时间全部来自小红书创作者后台，不使用计划日期。</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={goPrevious} className="border border-hairline bg-card px-3 py-1.5 text-sm hover:border-accent">←</button>
            <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }} className="border border-hairline bg-card px-3 py-1.5 text-sm hover:border-accent">今天</button>
            <span className="font-serif font-bold text-ink text-lg min-w-[130px] text-center">{year}年{month + 1}月</span>
            <button onClick={goNext} className="border border-hairline bg-card px-3 py-1.5 text-sm hover:border-accent">→</button>
          </div>
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      <div className="card-surface overflow-hidden">
        <div className="grid grid-cols-7 border-b border-ink">
          {WEEKDAYS.map((weekday) => <div key={weekday} className="px-2 py-2 text-center eyebrow">{weekday}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, index) => {
            const key = day ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
            const posts = day ? (byDate[key] ?? []) : [];
            const isToday = day && year === now.getFullYear() && month === now.getMonth() && day === now.getDate();
            return (
              <div key={`${key}-${index}`} className={`border-b border-r border-hairline min-h-[125px] ${day ? "bg-card" : "bg-paper-alt/50"}`}>
                {day && (
                  <div className="p-1.5">
                    <div className={`text-xs font-mono mb-1 ${isToday ? "bg-accent text-white w-6 h-6 rounded-full flex items-center justify-center" : "text-muted pl-1"}`}>{day}</div>
                    <div className="space-y-1">
                      {posts.map((post) => (
                        <NoteLink key={post.id} raw={post.xhsNoteUrl} className="block rounded-sm bg-[#DBEAFE] px-1.5 py-1 hover:bg-[#BFDBFE]">
                          <div className="text-[11px] font-medium text-ink line-clamp-2">{post.finalTitle}</div>
                          <div className="text-[10px] text-muted truncate mt-0.5">{post.accountName}</div>
                        </NoteLink>
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
