import { useEffect, useMemo, useState } from "react";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../hooks/useAuth.js";
import Dropdown from "../components/ui/Dropdown.js";
import NoteLink from "../components/ui/NoteLink.js";
import { SNAPSHOT_DAYS } from "@shared/enums.js";
import { computeXhsSnapshot, getDueSnapshotDays, hasXhsDailyTrend, parseXhsMetadata, type XhsDetailRow } from "@shared/xhsSync.js";

const AGENT_URL = "http://127.0.0.1:19527";

type AgentStatus = "checking" | "online" | "offline";
type SyncProgress = { id: number; title: string; status: "running" | "done" | "error"; message: string };

function extractUrls(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s]+/gi) ?? [];
  return Array.from(new Set(matches.map((url) => url.replace(/[)\]）】，。、“”"']+$/, ""))));
}

async function uploadCover(cover?: { mimeType?: string; base64?: string } | null): Promise<string | undefined> {
  if (!cover?.base64) return undefined;
  const binary = atob(cover.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": cover.mimeType || "image/jpeg" },
    credentials: "include",
    body: new Blob([bytes], { type: cover.mimeType || "image/jpeg" }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.url) throw new Error(payload.error || "首图上传失败");
  return payload.url;
}

export default function PostsPage() {
  const { isTeacher, selectedAccountId } = useAuth();
  const utils = trpc.useUtils();
  const accountsQuery = trpc.account.listActive.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: true });
  const [leaderAccountId, setLeaderAccountId] = useState<number | null>(null);
  const accountId = isTeacher ? selectedAccountId : leaderAccountId;
  const [links, setLinks] = useState("");
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("checking");
  const [xhsAccount, setXhsAccount] = useState<string>("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<SyncProgress[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (isTeacher || !accountsQuery.data) return;
    const isCurrentActive = leaderAccountId != null
      && accountsQuery.data.some((account) => account.id === leaderAccountId);
    if (!isCurrentActive) setLeaderAccountId(accountsQuery.data[0]?.id ?? null);
  }, [accountsQuery.data, isTeacher, leaderAccountId]);

  const postsQuery = trpc.note.listManaged.useQuery(
    { accountId: accountId || undefined },
    { enabled: Boolean(accountId), staleTime: 0, refetchOnWindowFocus: true },
  );
  const registerMutation = trpc.note.registerLinks.useMutation();
  const applySyncMutation = trpc.note.applySync.useMutation();
  const markErrorMutation = trpc.note.markSyncError.useMutation();
  const deleteMutation = trpc.note.delete.useMutation({ onSuccess: () => postsQuery.refetch() });

  const checkAgent = async () => {
    setAgentStatus("checking");
    setXhsAccount("");
    try {
      const health = await fetch(`${AGENT_URL}/health`, { signal: AbortSignal.timeout(3_000) });
      if (!health.ok) throw new Error("代理未响应");
      setAgentStatus("online");
      try {
        const response = await fetch(`${AGENT_URL}/whoami`, { signal: AbortSignal.timeout(15_000) });
        const result = await response.json();
        if (result.ok) {
          const raw = result.data;
          const name = raw?.nickname || raw?.username || raw?.name || raw?.userName
            || (Array.isArray(raw) ? raw.find((row: any) => row.metric === "昵称")?.value : "");
          setXhsAccount(name || "已登录");
        }
      } catch {
        setXhsAccount("");
      }
    } catch {
      setAgentStatus("offline");
    }
  };

  useEffect(() => { void checkAgent(); }, []);

  const updateProgress = (id: number, patch: Partial<SyncProgress>) => {
    setProgress((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const runSync = async () => {
    if (!accountId || syncing) return;
    setMessage("");
    if (agentStatus !== "online") {
      setMessage("链接已经保存；本地抓取代理未运行，启动代理后点击“同步到期数据”即可继续。");
      return;
    }

    setSyncing(true);
    let queue: Awaited<ReturnType<typeof utils.note.syncQueue.fetch>> = [];
    try {
      queue = await utils.note.syncQueue.fetch({ accountId });
    } catch (error: any) {
      setMessage(error.message || "读取同步队列失败");
      setSyncing(false);
      return;
    }

    setProgress(queue.map((item) => ({
      id: item.id,
      title: item.finalTitle || item.externalNoteId || `帖子 ${item.id}`,
      status: "running",
      message: "等待抓取",
    })));

    for (const item of queue) {
      try {
        updateProgress(item.id, { status: "running", message: "正在读取小红书后台…" });
        const response = await fetch(`${AGENT_URL}/fetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: item.externalNoteId,
            noteUrl: item.xhsNoteUrl,
            includeCover: item.needsMetadata && !item.coverImage,
          }),
          signal: AbortSignal.timeout(190_000),
        });
        const result = await response.json();
        if (!response.ok || !result.ok || !Array.isArray(result.data)) {
          throw new Error(result.error || "小红书后台未返回有效数据");
        }

        const detail = result.data as XhsDetailRow[];
        const metadata = parseXhsMetadata(detail);
        if (!metadata.title || !metadata.publishedAt) {
          throw new Error("未识别到帖子标题或真实发布时间，请确认当前 Chrome 登录了对应创作者账号");
        }
        const dueDays = getDueSnapshotDays(metadata.publishedAt, item.existingDays);
        const hasDailyTrend = hasXhsDailyTrend(detail);
        const currentAge = Math.floor((Date.now() - new Date(metadata.publishedAt).getTime()) / 86_400_000);
        const snapshotDays = hasDailyTrend ? dueDays : dueDays.filter((day) => day === currentAge);
        const historicalTrendUnavailable = snapshotDays.length < dueDays.length;
        const snapshots = snapshotDays.map((day) => computeXhsSnapshot(detail, metadata.publishedAt!, day));
        updateProgress(item.id, { message: "正在保存首图和到期快照…" });

        let coverImage: string | undefined;
        if (result.cover?.base64) coverImage = await uploadCover(result.cover);
        await applySyncMutation.mutateAsync({
          id: item.id,
          title: metadata.title,
          publishedAt: metadata.publishedAt,
          coverImage,
          snapshots,
        });
        updateProgress(item.id, {
          title: metadata.title,
          status: "done",
          message: historicalTrendUnavailable
            ? "资料已同步；后台暂未返回历史趋势，到期快照会在后续同步时继续补抓"
            : snapshots.length > 0
            ? `已同步资料并更新 ${snapshots.map((snapshot) => `T+${snapshot.daysSincePublish}`).join("、")}`
            : "资料已同步，当前没有到期快照",
        });
      } catch (error: any) {
        const errorMessage = error.message || "同步失败";
        updateProgress(item.id, { status: "error", message: errorMessage });
        try { await markErrorMutation.mutateAsync({ id: item.id, message: errorMessage }); } catch { /* 保留原始错误 */ }
      }
    }

    await postsQuery.refetch();
    setSyncing(false);
    setMessage(queue.length === 0 ? "当前账号没有待同步资料或到期数据。" : "本轮自动同步已完成。");
  };

  const handleRegister = async () => {
    if (!accountId || registerMutation.isPending || syncing) return;
    const urls = extractUrls(links);
    if (urls.length === 0) {
      setMessage("请至少粘贴一个小红书完整链接，每行一个或直接连续粘贴。 ");
      return;
    }
    setMessage("");
    try {
      const result = await registerMutation.mutateAsync({ accountId, urls });
      const invalid = result.results.filter((item) => item.status === "invalid").length;
      const existing = result.results.filter((item) => item.status === "existing").length;
      setLinks("");
      await postsQuery.refetch();
      setMessage(`新增 ${result.createdCount} 篇${existing ? `，已存在 ${existing} 篇` : ""}${invalid ? `，无效 ${invalid} 条` : ""}。`);
      await runSync();
    } catch (error: any) {
      setMessage(error.message || "链接保存失败");
    }
  };

  const stats = useMemo(() => {
    const rows = postsQuery.data ?? [];
    return {
      total: rows.length,
      pending: rows.filter((post) => post.syncStatus !== "synced").length,
      completed: rows.filter((post) => post.metrics.length >= SNAPSHOT_DAYS.length).length,
    };
  }, [postsQuery.data]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
          <div>
            <p className="eyebrow mb-1">POSTS</p>
            <h1 className="editorial-heading text-[28px] leading-tight">帖子管理</h1>
          </div>
          {!isTeacher && (
            <Dropdown
              value={accountId ? String(accountId) : ""}
              onChange={(value) => setLeaderAccountId(Number(value))}
              className="w-64"
              options={(accountsQuery.data ?? []).map((account) => ({ value: String(account.id), label: account.accountName }))}
            />
          )}
        </div>
        <div className="h-[1.5px] bg-ink" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-5">
        <div className="card-surface p-5 space-y-4">
          <div>
            <p className="eyebrow mb-1">批量登记</p>
            <h2 className="font-serif font-bold text-lg text-ink">粘贴小红书帖子链接</h2>
            <p className="text-sm text-muted mt-1">支持 xiaohongshu.com 和 rednote.com，可一次粘贴多个链接。保存后自动同步首图、真实发布时间和所有已到期快照。</p>
          </div>
          <textarea
            value={links}
            onChange={(event) => setLinks(event.target.value)}
            rows={6}
            placeholder={"https://www.xiaohongshu.com/explore/...\nhttps://www.rednote.com/explore/..."}
            className="w-full border border-hairline bg-paper px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-accent resize-y"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleRegister}
              disabled={!accountId || registerMutation.isPending || syncing}
              className="bg-ink text-card px-5 py-2 text-sm rounded-full hover:bg-ink-soft disabled:opacity-50"
            >
              {registerMutation.isPending ? "保存中…" : "保存并自动同步"}
            </button>
            <button
              onClick={runSync}
              disabled={!accountId || syncing || agentStatus !== "online"}
              className="border border-hairline px-5 py-2 text-sm rounded-full text-ink-soft hover:border-accent disabled:opacity-50"
            >
              {syncing ? "同步中…" : "同步到期数据"}
            </button>
            {message && <span className="text-sm text-muted">{message}</span>}
          </div>
        </div>

        <div className="card-surface p-5 space-y-4">
          <p className="eyebrow">同步环境</p>
          <div className="flex items-center gap-2 text-sm">
            <span className={`w-2.5 h-2.5 rounded-full ${agentStatus === "online" ? "bg-[#22C55E]" : agentStatus === "offline" ? "bg-[#EF4444]" : "bg-[#F59E0B] animate-pulse"}`} />
            <span>{agentStatus === "online" ? "本地代理已连接" : agentStatus === "offline" ? "本地代理未运行" : "正在检测本地代理"}</span>
          </div>
          {xhsAccount && <p className="text-sm text-muted">小红书账号：<span className="text-ink font-medium">{xhsAccount}</span></p>}
          <button onClick={checkAgent} className="mono-data text-accent hover:text-accent-deep">重新检测</button>
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-hairline text-center">
            <div><div className="kpi-value text-xl">{stats.total}</div><div className="mono-data text-muted">帖子</div></div>
            <div><div className="kpi-value text-xl text-[#D97706]">{stats.pending}</div><div className="mono-data text-muted">待同步</div></div>
            <div><div className="kpi-value text-xl text-[#166534]">{stats.completed}</div><div className="mono-data text-muted">全快照</div></div>
          </div>
        </div>
      </div>

      {progress.length > 0 && (
        <div className="card-surface p-5 space-y-2">
          <p className="eyebrow mb-3">本轮同步</p>
          {progress.map((item) => (
            <div key={item.id} className="flex items-start gap-3 border-b border-hairline pb-2 last:border-0">
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${item.status === "done" ? "bg-[#22C55E]" : item.status === "error" ? "bg-[#EF4444]" : "bg-[#F59E0B] animate-pulse"}`} />
              <div className="min-w-0"><div className="text-sm text-ink truncate">{item.title}</div><div className="mono-data text-muted">{item.message}</div></div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="eyebrow">已登记帖子</p>
          <span className="mono-data text-muted">按真实发布时间排序</span>
        </div>
        {postsQuery.isLoading ? (
          <p className="text-sm text-muted text-center py-12 font-serif italic">加载中…</p>
        ) : postsQuery.data?.length === 0 ? (
          <p className="text-sm text-muted text-center py-12 font-serif italic">当前账号还没有登记帖子</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {postsQuery.data?.map((post) => {
              const recorded = new Set(post.metrics.map((metric) => metric.daysSincePublish));
              return (
                <div key={post.id} className="card-surface p-4 flex gap-3">
                  <img src={post.coverImage || "/cover-placeholder.png"} alt="" className="w-20 h-24 object-cover bg-paper-alt shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-ink line-clamp-2">{post.finalTitle}</h3>
                    <p className="mono-data text-muted mt-1">{post.publishedAt ? new Date(post.publishedAt).toLocaleString("zh-CN") : "等待同步真实发布时间"}</p>
                    <div className="flex gap-1 mt-2">
                      {SNAPSHOT_DAYS.map((day) => (
                        <span key={day} className={`font-mono text-[10px] px-1.5 py-0.5 rounded-sm ${recorded.has(day) ? "status-ok" : "bg-paper-alt text-muted"}`}>T+{day}</span>
                      ))}
                    </div>
                    {post.latestMetric?.coverClickRate != null && (
                      <p className="text-xs text-muted mt-2">首图点击率 <span className="font-mono text-accent">{post.latestMetric.coverClickRate.toFixed(2)}%</span></p>
                    )}
                    {post.syncStatus !== "synced" && <p className="text-xs text-[#991B1B] mt-1 line-clamp-2">{post.syncError || "等待自动同步"}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <NoteLink raw={post.xhsNoteUrl} className="text-xs text-accent hover:underline">查看帖子</NoteLink>
                      <button
                        onClick={() => window.confirm("确定删除该帖子及其全部数据快照吗？") && deleteMutation.mutate({ id: post.id })}
                        className="text-xs text-muted hover:text-[#991B1B]"
                      >删除</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
