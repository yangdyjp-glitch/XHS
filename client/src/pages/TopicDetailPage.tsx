import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../hooks/useAuth.js";
import { TOPIC_STATUS } from "@shared/enums.js";
import PublishDialog from "../components/topic/PublishDialog.js";

export default function TopicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, isLeader } = useAuth();
  const topicId = Number(id);

  const topicQuery = trpc.topic.getById.useQuery({ id: topicId }, { enabled: !!topicId, refetchOnWindowFocus: false });
  const notesQuery = trpc.note.listByTopic.useQuery({ topicId }, { enabled: !!topicId, refetchOnWindowFocus: false });
  const commentsQuery = trpc.comment.listByTopic.useQuery({ topicId }, { enabled: !!topicId, refetchOnWindowFocus: false });

  const statusMutation = trpc.topic.updateStatus.useMutation({ onSuccess: () => topicQuery.refetch() });
  const deleteMutation = trpc.topic.delete.useMutation({ onSuccess: () => navigate("/") });
  const createNoteMutation = trpc.note.create.useMutation({ onSuccess: () => notesQuery.refetch() });
  const createCommentMutation = trpc.comment.create.useMutation({ onSuccess: () => commentsQuery.refetch() });

  const [commentText, setCommentText] = useState("");
  const [noteForm, setNoteForm] = useState({ finalTitle: "", xhsNoteUrl: "", publishedAt: "" });
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  const topic = topicQuery.data;

  if (topicQuery.isLoading) {
    return <div className="text-muted py-10 text-center font-serif italic">加载中...</div>;
  }
  if (!topic) {
    return <div className="text-muted py-10 text-center font-serif italic">选题不存在</div>;
  }

  const handleStatusChange = (newStatus: string) => {
    statusMutation.mutate({ id: topicId, newStatus });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteForm.finalTitle || !noteForm.xhsNoteUrl || !noteForm.publishedAt || createNoteMutation.isPending) return;
    createNoteMutation.mutate({ topicId, ...noteForm }, {
      onSuccess: () => { setNoteForm({ finalTitle: "", xhsNoteUrl: "", publishedAt: "" }); setShowNoteForm(false); },
    });
  };

  const handleAddComment = () => {
    if (!commentText.trim() || createCommentMutation.isPending) return;
    createCommentMutation.mutate({ topicId, content: commentText }, {
      onSuccess: () => setCommentText(""),
    });
  };

  const getStatusAction = () => {
    if (topic.status === "pending_review" && isLeader) {
      return (
        <button onClick={() => handleStatusChange("approved")} disabled={statusMutation.isPending} className="bg-ink text-card px-4 py-1.5 text-sm rounded-full hover:bg-ink-soft disabled:opacity-50">
          {statusMutation.isPending ? "处理中..." : "审批通过"}
        </button>
      );
    }
    if (topic.status === "approved" && topic.creatorId === user?.id) {
      return (
        <button onClick={() => handleStatusChange("writing")} disabled={statusMutation.isPending} className="bg-ink text-card px-4 py-1.5 text-sm rounded-full hover:bg-ink-soft disabled:opacity-50">
          {statusMutation.isPending ? "处理中..." : "开始写作"}
        </button>
      );
    }
    if (topic.status === "writing" && topic.creatorId === user?.id) {
      return (
        <button onClick={() => setShowPublish(true)} className="bg-[#166534] text-white px-4 py-1.5 text-sm rounded-full hover:bg-[#15803D]">
          发布笔记
        </button>
      );
    }
    return null;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back + Header */}
      <div>
        <button onClick={() => navigate("/")} className="mono-data text-accent hover:text-accent-deep mb-3 inline-block">
          ← 返回看板
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="editorial-heading text-2xl">{topic.title}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {topic.status !== "published" && (
                <span className="status-pill bg-accent text-white">
                  {(TOPIC_STATUS as Record<string, string>)[topic.status]}
                </span>
              )}
              <span className="mono-data text-muted">
                {topic.accountName} · {topic.creatorName}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusAction()}
            {(isLeader || topic.creatorId === user?.id) && (
              <button
                onClick={() => {
                  if (window.confirm("确定要删除这个选题吗？删除后无法恢复。")) {
                    deleteMutation.mutate({ id: topicId });
                  }
                }}
                className="mono-data text-[#991B1B] hover:text-[#7F1D1D] px-3 py-1.5 border border-[#FECACA] hover:border-[#991B1B] transition-colors"
              >
                删除
              </button>
            )}
          </div>
        </div>
        <div className="h-[1.5px] bg-ink mt-4" />
      </div>

      {/* Topic Info */}
      <div className="card-surface p-5 space-y-3">
        <p className="eyebrow">选题信息</p>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted">类型：</span>
            <span className="text-ink">{topic.topicType}</span>
          </div>
          <div>
            <span className="text-muted">计划发布：</span>
            <span className="text-ink">{topic.plannedPublishDate || "未设定"}</span>
          </div>
          <div className="col-span-2">
            <span className="text-muted">关键词：</span>
            <span className="text-ink">{topic.keywords?.length ? topic.keywords.join("、") : "无"}</span>
          </div>
        </div>
        <div className="mono-data text-muted">
          创建于 · {new Date(topic.createdAt).toLocaleString("zh-CN")}
        </div>
      </div>

      {/* Notes */}
      <div className="card-surface p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="eyebrow">关联笔记</p>
          {(topic.status === "published" || topic.status === "writing") && (
            <button onClick={() => setShowNoteForm(!showNoteForm)} className="mono-data text-accent hover:text-accent-deep">
              {showNoteForm ? "取消" : "+ 添加笔记"}
            </button>
          )}
        </div>

        {showNoteForm && (
          <form onSubmit={handleAddNote} className="space-y-2 bg-paper p-3 border border-hairline">
            <input value={noteForm.finalTitle} onChange={(e) => setNoteForm({ ...noteForm, finalTitle: e.target.value })} placeholder="笔记标题" className="w-full border border-hairline bg-card px-3 py-1.5 text-sm focus:outline-none focus:border-accent" />
            <input value={noteForm.xhsNoteUrl} onChange={(e) => setNoteForm({ ...noteForm, xhsNoteUrl: e.target.value })} placeholder="小红书笔记链接" className="w-full border border-hairline bg-card px-3 py-1.5 text-sm focus:outline-none focus:border-accent" />
            <input type="datetime-local" value={noteForm.publishedAt} onChange={(e) => setNoteForm({ ...noteForm, publishedAt: e.target.value })} className="w-full border border-hairline bg-card px-3 py-1.5 text-sm focus:outline-none focus:border-accent" />
            <button type="submit" disabled={createNoteMutation.isPending} className="bg-ink text-card px-4 py-1.5 text-sm rounded-full hover:bg-ink-soft disabled:opacity-50">
              添加
            </button>
          </form>
        )}

        {notesQuery.data?.length === 0 && <p className="text-sm text-muted font-serif italic">暂无关联笔记</p>}
        {notesQuery.data?.map((note: any) => (
          <div key={note.id} className="border-b border-hairline pb-3 last:border-0 last:pb-0 text-sm">
            <div className="flex gap-3">
              {note.coverImage && (
                <img
                  src={note.coverImage}
                  alt=""
                  className="w-20 h-20 object-cover shrink-0 bg-paper-alt"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-ink">{note.finalTitle}</div>
                <div className="flex items-center gap-3 mt-1 mono-data text-muted">
                  {note.xhsNoteUrl && (
                    <a href={note.xhsNoteUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      查看笔记
                    </a>
                  )}
                  <span>{new Date(note.publishedAt).toLocaleDateString("zh-CN")}</span>
                </div>
              </div>
            </div>
            {/* Metrics */}
            {note.latestMetric && (
              <div className="mt-2 flex items-center gap-3 font-mono text-xs text-ink-soft pl-0">
                <span><span className="text-[#2563EB]">{note.latestMetric.impression?.toLocaleString()}</span> <span className="text-muted">曝光</span></span>
                <span><span className="text-[#059669]">{note.latestMetric.view?.toLocaleString()}</span> <span className="text-muted">阅读</span></span>
                <span><span className="text-[#DC2626]">{note.latestMetric.likeCount}</span> <span className="text-muted">赞</span></span>
                <span><span className="text-[#D97706]">{note.latestMetric.collect}</span> <span className="text-muted">藏</span></span>
                <span><span className="text-[#7C3AED]">{note.latestMetric.commentCount}</span> <span className="text-muted">评</span></span>
                <span><span className="text-[#0891B2]">{note.latestMetric.shareCount ?? 0}</span> <span className="text-muted">转</span></span>
                <span className="text-muted ml-auto">T+{note.latestMetric.daysSincePublish}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Comments */}
      <div className="card-surface p-5 space-y-3">
        <p className="eyebrow">讨论</p>
        <div className="flex gap-2">
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="输入评论..."
            className="flex-1 border border-hairline bg-paper px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
          />
          <button
            onClick={handleAddComment}
            disabled={createCommentMutation.isPending || !commentText.trim()}
            className="bg-ink text-card px-4 py-1.5 text-sm rounded-full hover:bg-ink-soft disabled:opacity-50"
          >
            发送
          </button>
        </div>
        {commentsQuery.data?.length === 0 && <p className="text-sm text-muted font-serif italic">暂无评论</p>}
        {commentsQuery.data?.map((c) => (
          <div key={c.id} className="border-b border-hairline pb-2 last:border-0">
            <div className="flex items-center gap-2 mono-data text-muted">
              <span className="font-medium text-ink-soft">{c.authorName}</span>
              <span>{new Date(c.createdAt).toLocaleString("zh-CN")}</span>
            </div>
            <p className="text-sm text-ink-soft mt-1">{c.content}</p>
          </div>
        ))}
      </div>

      {showPublish && topic && (
        <PublishDialog
          topicId={topic.id} topicTitle={topic.title}
          onClose={() => setShowPublish(false)}
          onPublished={() => { setShowPublish(false); topicQuery.refetch(); notesQuery.refetch(); }}
        />
      )}
    </div>
  );
}
