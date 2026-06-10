import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../hooks/useAuth.js";
import { TOPIC_STATUS } from "@shared/enums.js";
import TopicCreateDialog from "../components/topic/TopicCreateDialog.js";
import PublishDialog from "../components/topic/PublishDialog.js";

const KANBAN_COLUMNS = [
  { key: "pending_review", label: "待审批", eyebrow: "待审批" },
  { key: "approved", label: "已通过", eyebrow: "已通过" },
  { key: "writing", label: "写作中", eyebrow: "写作中" },
  { key: "published", label: "已发布", eyebrow: "已发布" },
];

function AccountFilter({ accounts, selected, onChange }: {
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

export default function KanbanPage() {
  const { user, isLeader, isTeacher, selectedAccountId } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [publishTopic, setPublishTopic] = useState<{ id: number; title: string } | null>(null);
  const [filterAccounts, setFilterAccounts] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [filterStart, setFilterStart] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [filterEnd, setFilterEnd] = useState(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  });

  const topicsQuery = trpc.topic.list.useQuery(
    {
      accountId: isTeacher ? (selectedAccountId || undefined) : undefined,
      accountIds: !isTeacher && filterAccounts.length > 0 ? filterAccounts : undefined,
      search: search || undefined,
    },
    { refetchOnWindowFocus: false }
  );
  const accountsQuery = trpc.account.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const statusMutation = trpc.topic.updateStatus.useMutation({
    onSuccess: () => topicsQuery.refetch(),
  });
  const deleteMutation = trpc.topic.delete.useMutation({
    onSuccess: () => topicsQuery.refetch(),
  });

  const handleDelete = (topicId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("确定要删除这个选题吗？删除后可在回收箱中恢复。")) {
      deleteMutation.mutate({ id: topicId });
    }
  };

  const grouped = useMemo(() => {
    const map: Record<string, NonNullable<typeof topicsQuery.data>> = {};
    for (const col of KANBAN_COLUMNS) map[col.key] = [];
    if (topicsQuery.data) {
      for (const t of topicsQuery.data) {
        // 日期筛选只作用于「已发布」列；待审批/已通过/写作中等进行中的列始终全部显示，
        // 避免计划发布在其他月份（或暂未填日期）的选题被隐藏导致漏审批，口径与总览一致。
        if (t.status === "published" && (filterStart || filterEnd)) {
          if (!t.plannedPublishDate) continue;
          if (filterStart && t.plannedPublishDate < filterStart) continue;
          if (filterEnd && t.plannedPublishDate > filterEnd) continue;
        }
        if (map[t.status]) map[t.status].push(t);
      }
    }
    return map;
  }, [topicsQuery.data, filterStart, filterEnd]);

  const handleStatusChange = (topicId: number, newStatus: string) => {
    statusMutation.mutate({ id: topicId, newStatus });
  };

  const getActionButton = (topic: NonNullable<typeof topicsQuery.data>[0]) => {
    if (topic.status === "pending_review" && isLeader) {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); handleStatusChange(topic.id, "approved"); }}
          className="text-xs bg-ink text-card px-3 py-1 rounded-full hover:bg-ink-soft"
        >
          通过
        </button>
      );
    }
    if (topic.status === "approved" && !isLeader && topic.creatorId === user?.id) {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); handleStatusChange(topic.id, "writing"); }}
          className="text-[10px] bg-[#6D28D9] text-white px-1.5 py-0.5 rounded-full hover:bg-[#5B21B6]"
        >
          开始写作
        </button>
      );
    }
    if (topic.status === "writing" && !isLeader && topic.creatorId === user?.id) {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); setPublishTopic({ id: topic.id, title: topic.title }); }}
          className="text-[10px] bg-[#166534] text-white px-1.5 py-0.5 rounded-full hover:bg-[#15803D]"
        >
          发布
        </button>
      );
    }
    return null;
  };

  return (
    <div className="h-full flex flex-col -mx-5 lg:-mx-10 -my-6 lg:-my-8 px-5 lg:px-10 py-6 lg:py-8">
      {/* Editorial Header */}
      <div className="mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="eyebrow mb-1">KANBAN</p>
            <h1 className="editorial-heading text-[28px] leading-tight">选题看板</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={filterStart}
                onChange={(e) => setFilterStart(e.target.value)}
                className="border border-hairline bg-card px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
              />
              <span className="text-muted text-sm">至</span>
              <input
                type="date"
                value={filterEnd}
                onChange={(e) => setFilterEnd(e.target.value)}
                className="border border-hairline bg-card px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <input
              type="text"
              placeholder="搜索选题..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-hairline bg-card px-3 py-1.5 text-sm w-40 focus:outline-none focus:border-accent transition-colors"
            />
            {isLeader && <AccountFilter accounts={accountsQuery.data} selected={filterAccounts} onChange={setFilterAccounts} />}
            {!isLeader && (
              <button
                onClick={() => setShowCreate(true)}
                className="bg-ink text-card px-4 py-1.5 text-sm font-medium rounded-full hover:bg-ink-soft transition-colors"
              >
                + 新建选题
              </button>
            )}
          </div>
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-5 h-full pb-4">
          {KANBAN_COLUMNS.map((col) => (
            <div key={col.key} className="flex-1 min-w-[220px] flex flex-col">
              {/* Column header */}
              <div className="flex items-center justify-between mb-3">
                <span className="eyebrow">{col.eyebrow}</span>
                <span className="font-mono text-xs text-muted">{grouped[col.key]?.length || 0}</span>
              </div>
              <div className="h-px bg-ink mb-3" />

              {/* Cards */}
              <div className="flex-1 overflow-y-auto space-y-1">
                {grouped[col.key]?.map((topic) => (
                  <div
                    key={topic.id}
                    onClick={() => navigate(`/topic/${topic.id}`)}
                    onMouseEnter={() => {
                      utils.topic.getById.prefetch({ id: topic.id });
                      utils.note.listByTopic.prefetch({ topicId: topic.id });
                      utils.comment.listByTopic.prefetch({ topicId: topic.id });
                    }}
                    className="card-surface px-2.5 py-1.5 cursor-pointer hover:bg-[#F0F4FA] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="text-[13px] font-medium text-ink line-clamp-1 leading-tight flex-1">{topic.title}</h3>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {getActionButton(topic)}
                        {(isLeader || topic.creatorId === user?.id) && (
                          <button
                            onClick={(e) => handleDelete(topic.id, e)}
                            className="text-[10px] text-muted hover:text-[#991B1B] px-0.5"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted truncate">
                        {topic.accountColor && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: topic.accountColor }} />}
                        <span className="truncate">{topic.accountName}{topic.creatorName ? ` · ${topic.creatorName}` : ""}</span>
                      </div>
                      <span className="status-pill bg-[#DBEAFE] text-accent shrink-0" style={{ fontSize: 10, padding: "1px 6px" }}>{topic.topicType}</span>
                    </div>
                  </div>
                ))}
                {grouped[col.key]?.length === 0 && (
                  <div className="text-sm text-muted text-center py-10 font-serif italic">暂无选题</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreate && (
        <TopicCreateDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); topicsQuery.refetch(); }}
        />
      )}
      {publishTopic && (
        <PublishDialog
          topicId={publishTopic.id}
          topicTitle={publishTopic.title}
          onClose={() => setPublishTopic(null)}
          onPublished={() => { setPublishTopic(null); topicsQuery.refetch(); }}
        />
      )}
    </div>
  );
}
