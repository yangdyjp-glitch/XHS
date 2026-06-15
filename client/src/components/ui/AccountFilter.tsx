import { useState, useRef, useEffect } from "react";

/**
 * 账号多选下拉。空选 = 全部账号（全矩阵）。
 * 选题看板与复盘报告共用，避免重复实现。
 */
export default function AccountFilter({ accounts, selected, onChange }: {
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
