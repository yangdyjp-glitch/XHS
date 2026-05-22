import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../hooks/useAuth.js";
import { TOPIC_STATUS } from "@shared/enums.js";
import TopicCreateDialog from "../components/topic/TopicCreateDialog.js";
import PublishDialog from "../components/topic/PublishDialog.js";

const KANBAN_COLUMNS = [
  { key: "pending_review", label: "待审批", eyebrow: "PENDING" },
  { key: "approved", label: "已通过", eyebrow: "APPROVED" },
  { key: "writing", label: "写作中", eyebrow: "WRITING" },
  { key: "published", label: "已发布", eyebrow: "PUBLISHED" },
];

export default function KanbanPage() {
  const { user, isLeader } = useAuth();
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [publishTopic, setPublishTopic] = useState<{ id: number; title: string } | null>(null);
  const [filterAccount, setFilterAccount] = useState<number | "">("");
  const [search, setSearch] = useState("");

  const topicsQuery = trpc.topic.list.useQuery(
    { accountId: filterAccount || undefined, search: search || undefined },
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
    if (window.confirm("确定要删除这个选题吗？")) {
      deleteMutation.mutate({ id: topicId });
    }
  };

  const grouped = useMemo(() => {
    const map: Record<string, NonNullable<typeof topicsQuery.data>> = {};
    for (const col of KANBAN_COLUMNS) map[col.key] = [];
    if (topicsQuery.data) {
      for (const t of topicsQuery.data) {
        if (map[t.status]) map[t.status].push(t);
      }
    }
    return map;
  }, [topicsQuery.data]);

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
          className="text-xs bg-accent text-white px-3 py-1 rounded-full hover:bg-accent-deep"
        >
          开始写作
        </button>
      );
    }
    if (topic.status === "writing" && !isLeader && topic.creatorId === user?.id) {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); setPublishTopic({ id: topic.id, title: topic.title }); }}
          className="text-xs bg-[#166534] text-white px-3 py-1 rounded-full hover:bg-[#15803D]"
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
        <div className="flex items-end gap-8 mb-3">
          <div>
            <p className="eyebrow mb-1">KANBAN</p>
            <h1 className="editorial-heading text-[28px] leading-tight">选题看板</h1>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="搜索选题..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-hairline bg-card px-3 py-1.5 text-sm w-40 focus:outline-none focus:border-accent transition-colors"
            />
            {isLeader && (
              <select
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value ? Number(e.target.value) : "")}
                className="border border-hairline bg-card px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
              >
                <option value="">全部账号</option>
                {accountsQuery.data?.map((a) => (
                  <option key={a.id} value={a.id}>{a.accountName}</option>
                ))}
              </select>
            )}
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
              <div className="flex-1 overflow-y-auto space-y-2">
                {grouped[col.key]?.map((topic) => (
                  <div
                    key={topic.id}
                    onClick={() => navigate(`/topic/${topic.id}`)}
                    className="card-surface p-4 cursor-pointer hover:bg-[#F0F4FA] transition-colors"
                  >
                    <h3 className="text-sm font-medium text-ink line-clamp-2 leading-snug">{topic.title}</h3>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <span className="status-pill bg-[#DBEAFE] text-accent">{topic.topicType}</span>
                      {topic.keywords?.slice(0, 2).map((k) => (
                        <span key={k} className="status-pill bg-[#EDE9FE] text-[#6D28D9]">{k}</span>
                      ))}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <div className="mono-data text-muted">
                        {topic.accountName && <span>{topic.accountName}</span>}
                        {topic.creatorName && <span> · {topic.creatorName}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {getActionButton(topic)}
                        {(isLeader || topic.creatorId === user?.id) && (
                          <button
                            onClick={(e) => handleDelete(topic.id, e)}
                            className="mono-data text-muted hover:text-[#991B1B] px-1.5 py-1"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </div>
                    {topic.plannedPublishDate && (
                      <div className="mt-1.5 mono-data text-muted">
                        PLAN · {topic.plannedPublishDate}
                      </div>
                    )}
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
