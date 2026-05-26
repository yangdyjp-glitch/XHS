import { useState, useRef, useEffect } from "react";
import { trpc } from "../../lib/trpc.js";
import { useAuth } from "../../hooks/useAuth.js";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function TopicCreateDialog({ onClose, onCreated }: Props) {
  const { selectedAccountId } = useAuth();
  const typesQuery = trpc.topic.listTypes.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const createMutation = trpc.topic.create.useMutation({ onSuccess: onCreated });

  const [form, setForm] = useState({
    title: "",
    plannedPublishDate: "",
    topicType: "",
    keywords: "",
  });
  const [showTypeSuggestions, setShowTypeSuggestions] = useState(false);
  const [error, setError] = useState("");
  const typeInputRef = useRef<HTMLInputElement>(null);

  const filteredTypes = (typesQuery.data || []).filter(
    (t) => !form.topicType || t.toLowerCase().includes(form.topicType.toLowerCase())
  );

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (typeInputRef.current && !typeInputRef.current.parentElement?.contains(e.target as Node)) {
        setShowTypeSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
            <p className="eyebrow mb-0.5">NEW TOPIC</p>
            <h2 className="font-serif font-bold text-ink text-lg">新建选题</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="text-sm text-[#991B1B] bg-[#FEE2E2] px-3 py-2">{error}</div>
          )}

          <div>
            <label className="eyebrow block mb-1.5">TITLE *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="输入选题标题"
              autoFocus
            />
          </div>

          <div>
            <label className="eyebrow block mb-1.5">PUBLISH DATE *</label>
            <input
              type="date"
              value={form.plannedPublishDate}
              onChange={(e) => setForm({ ...form, plannedPublishDate: e.target.value })}
              className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="relative">
            <label className="eyebrow block mb-1.5">TYPE *</label>
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
            <label className="eyebrow block mb-1.5">KEYWORDS</label>
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
