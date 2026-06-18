import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc.js";
import { SNAPSHOT_DAYS } from "@shared/enums.js";

const METRIC_FIELDS = [
  { key: "impression", label: "曝光" },
  { key: "view", label: "阅读" },
  { key: "likeCount", label: "点赞" },
  { key: "collect", label: "收藏" },
  { key: "commentCount", label: "评论" },
  { key: "shareCount", label: "分享" },
] as const;

function daysSincePublish(publishedAt: string | Date): number {
  const pub = new Date(publishedAt);
  const now = new Date();
  return Math.floor((now.getTime() - pub.getTime()) / (1000 * 60 * 60 * 24));
}

function getAvailableSnapshots(publishedAt: string | Date): number[] {
  const days = daysSincePublish(publishedAt);
  return SNAPSHOT_DAYS.filter((d) => days >= d);
}

export default function DataEntryPage() {
  const notesQuery = trpc.note.listForDataEntry.useQuery(undefined, { refetchOnWindowFocus: false });
  const [selectedNote, setSelectedNote] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [form, setForm] = useState({
    impression: "", view: "", likeCount: "", collect: "", commentCount: "", shareCount: "", notes: "",
  });
  const [saveMsg, setSaveMsg] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const metricsQuery = trpc.metric.listByNote.useQuery(
    { noteId: selectedNote! },
    { enabled: !!selectedNote, refetchOnWindowFocus: false }
  );
  const upsertMutation = trpc.metric.upsert.useMutation({
    onSuccess: (data) => {
      setSaveMsg(data.updated ? "已更新" : "已保存");
      metricsQuery.refetch();
      setTimeout(() => setSaveMsg(""), 2000);
    },
  });

  const note = notesQuery.data?.find((n) => n.id === selectedNote);
  const availableDays = note ? getAvailableSnapshots(note.publishedAt) : [];
  const existingSnapshot = metricsQuery.data?.find((m) => m.daysSincePublish === selectedDay);

  // 始终让表单反映「当前笔记 + 当前天数」已存的快照。
  // 不再用 justSaved 跳过刷新——那个标志会在切换笔记后泄漏，导致新笔记的已有数据
  // 不被载入、表单显示为空，员工再保存就把原数据覆盖成 0，造成保存后数据丢失。
  // 保留 if(snap) 守卫：没有快照时不强制清空，避免冲掉正在输入但尚未保存的内容。
  useEffect(() => {
    if (!metricsQuery.data) return;
    const snap = metricsQuery.data.find((m) => m.daysSincePublish === selectedDay);
    if (snap) {
      setForm({
        impression: String(snap.impression), view: String(snap.view),
        likeCount: String(snap.likeCount), collect: String(snap.collect),
        commentCount: String(snap.commentCount), shareCount: String(snap.shareCount ?? ""),
        notes: snap.notes ?? "",
      });
    }
  }, [metricsQuery.data, selectedDay]);

  const handleSelectNote = (noteId: number) => {
    if (noteId === selectedNote) return;
    setSelectedNote(noteId);
    setSelectedDay(1);
    setForm({ impression: "", view: "", likeCount: "", collect: "", commentCount: "", shareCount: "", notes: "" });
    setSaveMsg("");
    setCollapsed(false);
  };

  const handleSelectDay = (day: number) => {
    setSelectedDay(day);
    const snap = metricsQuery.data?.find((m) => m.daysSincePublish === day);
    if (snap) {
      setForm({
        impression: String(snap.impression), view: String(snap.view),
        likeCount: String(snap.likeCount), collect: String(snap.collect),
        commentCount: String(snap.commentCount), shareCount: String(snap.shareCount ?? ""),
        notes: snap.notes ?? "",
      });
    } else {
      setForm({ impression: "", view: "", likeCount: "", collect: "", commentCount: "", shareCount: "", notes: "" });
    }
  };

  const handleSave = () => {
    if (!selectedNote) return;
    upsertMutation.mutate({
      noteId: selectedNote, daysSincePublish: selectedDay,
      impression: parseInt(form.impression) || 0, view: parseInt(form.view) || 0,
      likeCount: parseInt(form.likeCount) || 0, collect: parseInt(form.collect) || 0,
      commentCount: parseInt(form.commentCount) || 0, shareCount: parseInt(form.shareCount) || 0,
      notes: form.notes || undefined,
    });
  };

  return (
    <div>
      {/* Editorial Header */}
      <div className="mb-6">
        <p className="eyebrow mb-1">DATA ENTRY</p>
        <h1 className="editorial-heading text-[28px] leading-tight">数据录入</h1>
        <div className="h-[1.5px] bg-ink mt-3" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Note list */}
        <div className="md:col-span-1">
          <p className="eyebrow mb-2">SELECT NOTE</p>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {notesQuery.isLoading && <p className="text-sm text-muted font-serif italic">加载中...</p>}
            {notesQuery.data?.length === 0 && (
              <p className="text-sm text-muted font-serif italic">暂无待录入数据的笔记</p>
            )}
            {notesQuery.data?.map((n) => {
              const avail = getAvailableSnapshots(n.publishedAt);
              return (
                <div
                  key={n.id}
                  onClick={() => handleSelectNote(n.id)}
                  className={`card-surface p-3 cursor-pointer transition-colors ${
                    selectedNote === n.id ? "border-accent bg-[#EFF6FF]" : "hover:bg-[#F0F4FA]"
                  }`}
                >
                  <div className="text-sm font-medium text-ink line-clamp-2">{n.finalTitle}</div>
                  <div className="mono-data text-muted mt-1">
                    {n.accountName} · {new Date(n.publishedAt).toLocaleDateString("zh-CN", { timeZone: "UTC" })}
                  </div>
                  <div className="flex gap-1 mt-1.5">
                    {SNAPSHOT_DAYS.map((d) => (
                      <span
                        key={d}
                        className={`font-mono text-[10px] px-1.5 py-0.5 ${
                          avail.includes(d) ? "status-ok" : "bg-paper-alt text-muted"
                        }`}
                        style={{ borderRadius: 3 }}
                      >
                        T+{d}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Data entry form */}
        <div className="md:col-span-2">
          {!selectedNote ? (
            <div className="text-muted flex items-center justify-center min-h-[400px] font-serif italic md:-translate-x-1/4">请选择一个笔记</div>
          ) : collapsed ? (
            <div className="text-center py-20">
              <button onClick={() => setCollapsed(false)} className="text-sm text-accent hover:text-accent-deep">
                展开数据录入
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {SNAPSHOT_DAYS.map((d) => {
                  const available = availableDays.includes(d);
                  const hasData = metricsQuery.data?.some((m) => m.daysSincePublish === d);
                  return (
                    <button
                      key={d}
                      onClick={() => available && handleSelectDay(d)}
                      disabled={!available}
                      className={`px-4 py-2 font-mono text-sm transition-colors ${
                        selectedDay === d
                          ? "bg-ink text-card font-medium"
                          : available
                          ? hasData
                            ? "card-surface text-[#166534] font-medium"
                            : "card-surface text-ink-soft hover:bg-[#F0F4FA]"
                          : "bg-paper-alt text-muted cursor-not-allowed opacity-50"
                      }`}
                    >
                      T+{d} {hasData && selectedDay !== d ? " *" : ""}
                    </button>
                  );
                })}
                {existingSnapshot && (
                  <span className="mono-data text-muted ml-2">已有数据，提交将覆盖</span>
                )}
                <button onClick={() => setCollapsed(true)} className="ml-auto mono-data text-muted hover:text-ink">
                  收起
                </button>
              </div>

              <div className="card-surface p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {METRIC_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="eyebrow block mb-1.5">{f.label}</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form[f.key as keyof typeof form]}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^\d]/g, "");
                          setForm({ ...form, [f.key]: val });
                        }}
                        placeholder="0"
                        className="w-full border border-hairline bg-paper px-3 py-2.5 text-sm font-mono text-ink focus:outline-none focus:border-accent transition-colors"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <label className="eyebrow block mb-1.5">备注</label>
                  <input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full border border-hairline bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-accent transition-colors"
                    placeholder="可选备注..."
                  />
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={upsertMutation.isPending}
                    className="bg-ink text-card px-6 py-2 text-sm font-medium rounded-full hover:bg-ink-soft disabled:opacity-50"
                  >
                    {upsertMutation.isPending ? "保存中..." : "保存数据"}
                  </button>
                  {saveMsg && <span className="text-sm text-[#166534] font-medium">{saveMsg}</span>}
                  {upsertMutation.isError && (
                    <span className="text-sm text-[#991B1B]">{upsertMutation.error?.message || "保存失败"}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
