import { useState, useEffect, useRef, useCallback } from "react";

const AGENT_URL = "http://127.0.0.1:19527";

interface PendingNote {
  noteId: number;
  xhsNoteUrl: string;
  publishedAt: string;
  finalTitle: string;
  accountName: string;
  missingDays: number[];
}

type NoteStatus = "pending" | "fetching" | "computing" | "saving" | "done" | "skipped" | "error";

interface NoteProgress {
  note: PendingNote;
  status: NoteStatus;
  message: string;
  savedDays: number[];
  skippedDays: number[];
}

interface WhoamiInfo {
  ok: boolean;
  nickname?: string;
  redId?: string;
  raw?: any;
  error?: string;
}

function extractNoteId(url: string | null): string | null {
  if (!url) return null;
  const exploreMatch = url.match(/\/(?:explore|discovery\/item)\/([a-f0-9]+)/);
  if (exploreMatch) return exploreMatch[1];
  const queryMatch = url.match(/noteId=([a-f0-9]+)/);
  if (queryMatch) return queryMatch[1];
  const pathMatch = url.match(/\/([a-f0-9]{24})/);
  if (pathMatch) return pathMatch[1];
  return null;
}

function parseDailyTrend(detail: any[], metricName: string): Record<string, number> {
  const entry = detail.find(
    (d: any) => d.section === "趋势数据" && d.metric === `按天/${metricName}`
  );
  if (!entry?.extra) return {};
  const map: Record<string, number> = {};
  for (const part of entry.extra.split(" | ")) {
    const [date, val] = part.split("=");
    if (date && val !== undefined) {
      map[date.trim()] = parseFloat(val);
    }
  }
  return map;
}

function computeSnapshot(detail: any[], publishedAt: string, targetDay: number) {
  const pubDate = new Date(publishedAt);
  const metrics = ["曝光数", "观看数", "点赞数", "收藏数", "评论数", "分享数"];
  const fieldMap: Record<string, string> = {
    "曝光数": "impression",
    "观看数": "view",
    "点赞数": "likeCount",
    "收藏数": "collect",
    "评论数": "commentCount",
    "分享数": "shareCount",
  };
  const result: Record<string, number> = {};
  for (const metric of metrics) {
    const daily = parseDailyTrend(detail, metric);
    let sum = 0;
    for (let d = 0; d < targetDay; d++) {
      const date = new Date(pubDate);
      date.setDate(date.getDate() + d);
      const key = date.toISOString().split("T")[0];
      sum += daily[key] || 0;
    }
    result[fieldMap[metric]] = sum;
  }
  return result;
}

export default function AutoFetchPage() {
  const [agentStatus, setAgentStatus] = useState<"checking" | "online" | "offline">("checking");
  const [whoami, setWhoami] = useState<WhoamiInfo | null>(null);
  const [whoamiLoading, setWhoamiLoading] = useState(false);
  const [pending, setPending] = useState<PendingNote[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [progress, setProgress] = useState<NoteProgress[]>([]);
  const [fetching, setFetching] = useState(false);
  const [done, setDone] = useState(false);
  const abortRef = useRef(false);

  const checkAgent = useCallback(async () => {
    setAgentStatus("checking");
    setWhoami(null);
    try {
      const res = await fetch(`${AGENT_URL}/health`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      if (data.status === "ok") {
        setAgentStatus("online");
        checkWhoami();
      } else {
        setAgentStatus("offline");
      }
    } catch {
      setAgentStatus("offline");
    }
  }, []);

  const checkWhoami = async () => {
    setWhoamiLoading(true);
    try {
      const res = await fetch(`${AGENT_URL}/whoami`, { signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      if (data.ok && data.data) {
        const raw = data.data;
        const nickname = raw.nickname || raw.name || raw.userName || (Array.isArray(raw) ? raw.find((r: any) => r.metric === "昵称")?.value : null);
        const redId = raw.redId || raw.red_id || (Array.isArray(raw) ? raw.find((r: any) => r.metric === "小红书号")?.value : null);
        setWhoami({ ok: true, nickname, redId, raw });
      } else {
        setWhoami({ ok: false, error: data.error || "未登录小红书" });
      }
    } catch {
      setWhoami({ ok: false, error: "whoami 检测超时" });
    } finally {
      setWhoamiLoading(false);
    }
  };

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await fetch("/api/metric/pending", { credentials: "include" });
      const data = await res.json();
      setPending(data || []);
    } catch {
      setPending([]);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    checkAgent();
  }, [checkAgent]);

  useEffect(() => {
    if (agentStatus === "online") loadPending();
  }, [agentStatus, loadPending]);

  const startFetch = async () => {
    if (pending.length === 0) return;
    setFetching(true);
    setDone(false);
    abortRef.current = false;

    const progressList: NoteProgress[] = pending.map((note) => ({
      note,
      status: "pending",
      message: "等待中",
      savedDays: [],
      skippedDays: [],
    }));
    setProgress([...progressList]);

    for (let i = 0; i < progressList.length; i++) {
      if (abortRef.current) break;
      const item = progressList[i];
      const xhsId = extractNoteId(item.note.xhsNoteUrl);

      if (!xhsId) {
        item.status = "error";
        item.message = "无法从链接中提取笔记ID";
        setProgress([...progressList]);
        continue;
      }

      item.status = "fetching";
      item.message = "正在从小红书抓取数据...";
      setProgress([...progressList]);

      let detail: any[];
      try {
        const res = await fetch(`${AGENT_URL}/fetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId: xhsId }),
        });
        const result = await res.json();
        if (!result.ok || !result.data) {
          item.status = "error";
          item.message = result.error || "抓取失败";
          setProgress([...progressList]);
          continue;
        }
        detail = result.data;
      } catch (err: any) {
        item.status = "error";
        item.message = "本地代理通信失败: " + (err.message || "未知错误");
        setProgress([...progressList]);
        continue;
      }

      item.status = "computing";
      item.message = "正在计算快照数据...";
      setProgress([...progressList]);

      for (const day of item.note.missingDays) {
        if (abortRef.current) break;
        const snapshot = computeSnapshot(detail, item.note.publishedAt, day);
        const allZero = Object.values(snapshot).every((v) => v === 0);

        if (allZero) {
          item.skippedDays.push(day);
          item.message = `T+${day} 数据全为0，已跳过（可能非当前登录账号的笔记）`;
          setProgress([...progressList]);
          continue;
        }

        item.status = "saving";
        item.message = `正在保存 T+${day} 数据...`;
        setProgress([...progressList]);

        try {
          await fetch("/api/metric/upsert", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              noteId: item.note.noteId,
              daysSincePublish: day,
              ...snapshot,
              notes: "auto-fetch via platform",
            }),
          });
          item.savedDays.push(day);
        } catch (err: any) {
          item.status = "error";
          item.message = `T+${day} 保存失败: ${err.message}`;
          setProgress([...progressList]);
        }
      }

      if (item.status !== "error") {
        if (item.savedDays.length > 0) {
          item.status = "done";
          item.message = `已保存 ${item.savedDays.map((d) => `T+${d}`).join(", ")}`;
        } else if (item.skippedDays.length > 0) {
          item.status = "skipped";
          item.message = "所有快照数据为0，已跳过";
        }
      }
      setProgress([...progressList]);
    }

    setFetching(false);
    setDone(true);
  };

  const stats = {
    total: progress.length,
    done: progress.filter((p) => p.status === "done").length,
    skipped: progress.filter((p) => p.status === "skipped").length,
    error: progress.filter((p) => p.status === "error").length,
    savedSnapshots: progress.reduce((sum, p) => sum + p.savedDays.length, 0),
  };

  const xhsReady = whoami?.ok === true;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="editorial-heading text-2xl">数据抓取</h1>
        <p className="text-sm text-muted mt-1">从小红书创作者后台自动抓取笔记数据</p>
        <div className="h-[1.5px] bg-ink mt-4" />
      </div>

      {/* Agent + XHS status */}
      <div className="card-surface p-5 space-y-4">
        {/* Row 1: Agent status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                agentStatus === "online"
                  ? "bg-[#22C55E]"
                  : agentStatus === "offline"
                  ? "bg-[#EF4444]"
                  : "bg-[#F59E0B] animate-pulse"
              }`}
            />
            <span className="text-sm font-medium text-ink">
              {agentStatus === "checking" && "正在检测本地代理..."}
              {agentStatus === "online" && "本地代理已连接"}
              {agentStatus === "offline" && "本地代理未运行"}
            </span>
          </div>
          {agentStatus !== "checking" && (
            <button
              onClick={checkAgent}
              className="mono-data text-accent hover:text-accent-deep"
            >
              重新检测
            </button>
          )}
        </div>

        {/* Row 2: XHS login status (only when agent is online) */}
        {agentStatus === "online" && (
          <div className="flex items-center gap-3">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                whoamiLoading
                  ? "bg-[#F59E0B] animate-pulse"
                  : xhsReady
                  ? "bg-[#22C55E]"
                  : "bg-[#EF4444]"
              }`}
            />
            <span className="text-sm text-ink">
              {whoamiLoading && "正在检测小红书登录状态..."}
              {!whoamiLoading && xhsReady && (
                <>
                  小红书已登录：
                  <span className="font-medium text-accent">
                    {whoami.nickname || "未知昵称"}
                  </span>
                  {whoami.redId && (
                    <span className="text-muted ml-1">({whoami.redId})</span>
                  )}
                </>
              )}
              {!whoamiLoading && !xhsReady && whoami && (
                <span className="text-[#EF4444]">
                  小红书未登录 —— 请先在 Chrome 打开创作者后台并登录
                </span>
              )}
            </span>
          </div>
        )}

        {/* Offline instructions */}
        {agentStatus === "offline" && (
          <div className="bg-[#FEF3C7] text-[#92400E] text-sm px-4 py-3 space-y-2">
            <p className="font-medium">Please start the local agent first:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Make sure Node.js and OpenCLI are installed</li>
              <li>Find the <code className="bg-[#FDE68A] px-1 rounded">_xhs-agent</code> folder, run <code className="bg-[#FDE68A] px-1 rounded">install.bat</code></li>
              <li>The agent auto-starts with Windows. You can also run <code className="bg-[#FDE68A] px-1 rounded">start-agent.vbs</code> manually</li>
            </ol>
          </div>
        )}

        {/* Not logged in warning */}
        {agentStatus === "online" && !whoamiLoading && !xhsReady && whoami && (
          <div className="bg-[#FEE2E2] text-[#991B1B] text-sm px-4 py-3 space-y-1">
            <p className="font-medium">Chrome 未登录小红书创作者后台</p>
            <p className="text-xs">
              请在 Chrome 中打开 <a href="https://creator.xiaohongshu.com" target="_blank" rel="noopener noreferrer" className="underline">creator.xiaohongshu.com</a> 并登录你管理的账号，然后点「重新检测」。
            </p>
          </div>
        )}
      </div>

      {/* Pending notes (only when agent online + XHS logged in) */}
      {agentStatus === "online" && xhsReady && (
        <div className="card-surface p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="eyebrow">待抓取笔记</p>
            {!fetching && (
              <button onClick={loadPending} className="mono-data text-accent hover:text-accent-deep">
                刷新列表
              </button>
            )}
          </div>

          {loadingPending && (
            <p className="text-sm text-muted font-serif italic">加载中...</p>
          )}

          {!loadingPending && pending.length === 0 && !done && (
            <div className="text-center py-8">
              <p className="text-sm text-muted font-serif italic">所有快照数据均已完成，无需抓取</p>
            </div>
          )}

          {!loadingPending && pending.length > 0 && !fetching && !done && (
            <>
              <div className="text-sm text-muted">
                共 {pending.length} 篇笔记需要抓取数据，涉及{" "}
                {pending.reduce((sum, p) => sum + p.missingDays.length, 0)} 个快照
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {pending.map((p) => (
                  <div key={p.noteId} className="flex items-center justify-between text-sm border-b border-hairline pb-2 last:border-0">
                    <div className="min-w-0 flex-1">
                      <span className="text-ink truncate block">{p.finalTitle}</span>
                      <span className="mono-data text-muted text-xs">{p.accountName}</span>
                    </div>
                    <div className="mono-data text-xs text-muted shrink-0 ml-3">
                      {p.missingDays.map((d) => `T+${d}`).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={startFetch}
                className="w-full bg-ink text-card py-2.5 text-sm rounded-full hover:bg-ink-soft transition-colors"
              >
                开始抓取
              </button>
            </>
          )}

          {/* Progress */}
          {(fetching || done) && progress.length > 0 && (
            <div className="space-y-3">
              {done && (
                <div className="bg-paper-alt px-4 py-3 text-sm space-y-1">
                  <p className="font-medium text-ink">抓取完成</p>
                  <p className="mono-data text-muted">
                    成功保存 {stats.savedSnapshots} 个快照 · 跳过 {stats.skipped} 篇 · 失败 {stats.error} 篇
                  </p>
                </div>
              )}

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {progress.map((p, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-sm border-b border-hairline pb-2 last:border-0">
                    <span className="mt-0.5 shrink-0">
                      {p.status === "pending" && <span className="text-muted">○</span>}
                      {(p.status === "fetching" || p.status === "computing" || p.status === "saving") && (
                        <span className="text-[#F59E0B] animate-pulse">◉</span>
                      )}
                      {p.status === "done" && <span className="text-[#22C55E]">●</span>}
                      {p.status === "skipped" && <span className="text-[#94A3B8]">●</span>}
                      {p.status === "error" && <span className="text-[#EF4444]">●</span>}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-ink block truncate">{p.note.finalTitle}</span>
                      <span className="mono-data text-xs text-muted">{p.message}</span>
                    </div>
                  </div>
                ))}
              </div>

              {fetching && (
                <button
                  onClick={() => { abortRef.current = true; }}
                  className="w-full border border-hairline text-muted py-2 text-sm rounded-full hover:border-[#EF4444] hover:text-[#EF4444] transition-colors"
                >
                  停止抓取
                </button>
              )}

              {done && (
                <button
                  onClick={() => { setDone(false); setProgress([]); loadPending(); }}
                  className="w-full bg-ink text-card py-2.5 text-sm rounded-full hover:bg-ink-soft transition-colors"
                >
                  重新检查
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
