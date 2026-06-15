import { useState, useRef, useEffect } from "react";
import { trpc } from "../../lib/trpc.js";
import { useAuth } from "../../hooks/useAuth.js";
import { PRESET_TOPIC_TYPES } from "@shared/enums.js";
import { findBannedWords } from "@shared/bannedWords.js";

interface Props {
  onClose: () => void;
  onCreated: () => void;
  initialTitle?: string;
  initialTopicType?: string;
  initialKeywords?: string[];
}

export default function TopicCreateDialog({ onClose, onCreated, initialTitle, initialTopicType, initialKeywords }: Props) {
  const { selectedAccountId } = useAuth();
  const typesQuery = trpc.topic.listTypes.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const createMutation = trpc.topic.create.useMutation({ onSuccess: onCreated });
  const suggestMutation = trpc.topic.suggestTitle.useMutation();

  const [form, setForm] = useState({
    title: initialTitle || "",
    plannedPublishDate: "",
    topicType: initialTopicType || "",
    keywords: (initialKeywords || []).join(", "),
  });
  const [showTypeSuggestions, setShowTypeSuggestions] = useState(false);
  const [error, setError] = useState("");
  const typeInputRef = useRef<HTMLInputElement>(null);

  const allTypes = Array.from(new Set([...PRESET_TOPIC_TYPES, ...(typesQuery.data || [])]));
  const filteredTypes = allTypes.filter(
    (t) => !form.topicType || t.toLowerCase().includes(form.topicType.toLowerCase())
  );
  const bannedHits = findBannedWords(form.title);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (typeInputRef.current && !typeInputRef.current.parentElement?.contains(e.target as Node)) {
        setShowTypeSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSuggest = () => {
    if (!form.title.trim() || suggestMutation.isPending) return;
    suggestMutation.mutate({
      title: form.title.trim(),
      topicType: form.topicType.trim() || undefined,
      keywords: form.keywords ? form.keywords.split(/[,，\s]+/).filter(Boolean) : undefined,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (createMutation.isPending) return;

    if (!form.title.trim()) { setError("请填写标题"); return; }
    if (!form.plannedPublishDate) { setError("请选择计划发布时间"); return; }
    if (!form.topicType.trim()) { setError("请填写类型"); return; }

    createMutation.mutate({
      title: form.title.trim(),
      plannedPublishDate: form.plannedPublishDate,
      topicType: form.topicType.trim(),
      keywords: form.keywords ? form.keywords.split(/[,，\s]+/).filter(Boolean) : undefined,
      accountId: selectedAccountId || undefined,
    }, {
      onError: (err) => setError(err.message || "创建失败"),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20">
      <div className="bg-card w-full max-w-md mx-4 border border-hairline">
        <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
          <div>
            <p className="eyebrow mb-0.5">新建</p>
            <h2 className="font-serif font-bold text-ink text-lg">新建选题</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="text-sm text-[#991B1B] bg-[#FEE2E2] px-3 py-2">{error}</div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="eyebrow">标题 *</label>
              <button
                type="button"
                onClick={handleSuggest}
                disabled={!form.title.trim() || suggestMutation.isPending}
                className="text-xs text-accent hover:text-accent-deep disabled:opacity-40 disabled:cursor-not-allowed"
                title="根据全局方法论给出标题修改意见"
              >
                {suggestMutation.isPending ? "AI 生成中..." : "✨ AI建议"}
              </button>
            </div>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="输入选题标题"
              autoFocus
            />
            {bannedHits.length > 0 && (
              <p className="mt-1.5 text-xs text-[#92400E] bg-[#FEF3C7] px-2 py-1.5 rounded">
                提示：标题可能含禁用词 <span className="font-medium">{bannedHits.join("、")}</span>，建议检查后再提交（不强制）
              </p>
            )}
            {suggestMutation.isError && (
              <p className="mt-1.5 text-xs text-[#991B1B]">{suggestMutation.error?.message || "AI 建议生成失败"}</p>
            )}
            {suggestMutation.data && (
              <div className="mt-2 border border-hairline bg-paper rounded p-2.5 space-y-2 max-h-60 overflow-y-auto">
                {suggestMutation.data.diagnosis && (
                  <p className="text-xs text-ink-soft leading-relaxed">{suggestMutation.data.diagnosis}</p>
                )}
                {suggestMutation.data.suggestions?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="eyebrow">点击采用建议标题</p>
                    {suggestMutation.data.suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setForm({ ...form, title: s.title })}
                        className="w-full text-left px-2 py-1.5 rounded border border-hairline hover:bg-[#EFF6FF] hover:border-accent transition-colors"
                      >
                        <div className="text-sm text-ink font-medium">{s.title}</div>
                        {s.reason && <div className="text-xs text-muted mt-0.5">{s.reason}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="eyebrow block mb-1.5">计划发布日期 *</label>
            <input
              type="date"
              value={form.plannedPublishDate}
              onChange={(e) => setForm({ ...form, plannedPublishDate: e.target.value })}
              className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="relative">
            <label className="eyebrow block mb-1.5">类型 *</label>
            <input
              ref={typeInputRef}
              value={form.topicType}
              onChange={(e) => {
                setForm({ ...form, topicType: e.target.value });
                setShowTypeSuggestions(true);
              }}
              onFocus={() => setShowTypeSuggestions(true)}
              className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="输入类型，或从已有类型中选择"
            />
            {showTypeSuggestions && filteredTypes.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-card border border-hairline max-h-40 overflow-y-auto">
                {filteredTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setForm({ ...form, topicType: t });
                      setShowTypeSuggestions(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[#EFF6FF] text-ink-soft"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="eyebrow block mb-1.5">关键词</label>
            <input
              value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="用逗号分隔，如：留学,日本,签证（选填）"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:text-ink transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-5 py-2 text-sm bg-ink text-card rounded-full hover:bg-ink-soft disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? "提交中..." : "提交选题"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
