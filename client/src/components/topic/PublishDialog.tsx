import { useState, useRef } from "react";
import { trpc } from "../../lib/trpc.js";

interface Props {
  topicId: number;
  topicTitle: string;
  onClose: () => void;
  onPublished: () => void;
}

export default function PublishDialog({ topicId, topicTitle, onClose, onPublished }: Props) {
  const [noteUrl, setNoteUrl] = useState("");
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const publishMutation = trpc.topic.publish.useMutation({
    onSuccess: onPublished,
  });

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("只支持上传图片文件");
      return;
    }

    setCoverPreview(URL.createObjectURL(file));
    setUploading(true);
    setError("");

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": file.type },
        credentials: "include",
        body: file,
      });
      const data = await res.json();
      if (data.url) {
        setCoverUrl(data.url);
      } else {
        setError(data.error || "上传失败");
      }
    } catch {
      setError("上传失败，请重试");
    } finally {
      setUploading(false);
    }
  };

  // Feature 2: Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (publishMutation.isPending) return;

    if (!noteUrl.trim()) {
      setError("请填写笔记链接");
      return;
    }

    publishMutation.mutate({
      topicId,
      xhsNoteUrl: noteUrl.trim(),
      coverImage: coverUrl || undefined,
    }, {
      onError: (err) => setError(err.message || "发布失败"),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20" onClick={onClose}>
      <div
        className="bg-card w-full max-w-md mx-4 border border-hairline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-hairline">
          <p className="eyebrow mb-0.5">发布</p>
          <h2 className="font-serif font-bold text-ink text-lg">发布笔记</h2>
          <p className="text-sm text-muted mt-1 truncate">{topicTitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="text-sm text-[#991B1B] bg-[#FEE2E2] px-3 py-2">{error}</div>
          )}

          <div>
            <label className="eyebrow block mb-1.5">头图</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            {coverPreview ? (
              <div className="relative">
                <img
                  src={coverPreview}
                  alt="头图预览"
                  className="w-full h-48 object-cover border border-hairline"
                />
                {uploading && (
                  <div className="absolute inset-0 bg-card/70 flex items-center justify-center">
                    <span className="mono-data text-muted">上传中...</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCoverPreview(null);
                    setCoverUrl("");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="absolute top-2 right-2 bg-ink/50 text-white w-6 h-6 text-sm flex items-center justify-center hover:bg-ink/70"
                >
                  &times;
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`w-full h-32 border-2 border-dashed flex flex-col items-center justify-center transition-colors ${
                  dragging
                    ? "border-accent bg-[#EFF6FF] text-accent"
                    : "border-hairline text-muted hover:border-accent hover:text-accent"
                }`}
              >
                <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm">{dragging ? "释放以上传图片" : "点击或拖拽上传头图"}</span>
              </button>
            )}
          </div>

          <div>
            <label className="eyebrow block mb-1.5">笔记链接 *</label>
            <input
              value={noteUrl}
              onChange={(e) => setNoteUrl(e.target.value)}
              className="w-full border border-hairline bg-paper px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="粘贴小红书笔记链接"
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
              disabled={publishMutation.isPending || uploading}
              className="px-5 py-2 text-sm bg-[#166534] text-white rounded-full hover:bg-[#15803D] disabled:opacity-50 transition-colors"
            >
              {publishMutation.isPending ? "发布中..." : "确认发布"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
