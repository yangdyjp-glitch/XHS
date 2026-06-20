import type { ReactNode, MouseEvent } from "react";
import { extractNoteUrl } from "@shared/url.js";

interface NoteLinkProps {
  /** 数据库里存的「笔记链接」原文：可能是裸链接，也可能是整段分享口令，甚至纯标签。 */
  raw?: string | null;
  className?: string;
  children: ReactNode;
  onClick?: (e: MouseEvent) => void;
  /** 当原文存在但解析不出有效链接时，是否显示「链接无效」提示。默认显示。 */
  showInvalidHint?: boolean;
}

/**
 * 「查看笔记」链接的统一渲染。
 *
 * 历史数据里 xhsNoteUrl 常常混入小红书分享口令（真实链接被夹在文案中间），
 * 若直接当成 <a href> 会被当作相对路径，在单页应用里跳到首页（选题看板）。
 * 这里统一用 extractNoteUrl 提取出可点击的绝对链接：
 *  - 能解析出链接 → 渲染真正的外链；
 *  - 原文存在但无法解析 → 渲染不可点的「链接无效」提示（而不是一个会乱跳的链接）；
 *  - 原文为空 → 什么都不渲染。
 */
export default function NoteLink({ raw, className, children, onClick, showInvalidHint = true }: NoteLinkProps) {
  const url = extractNoteUrl(raw);
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
        {children}
      </a>
    );
  }
  if (raw && showInvalidHint) {
    return (
      <span className="text-muted text-[10px] italic" title="保存的笔记链接无法识别，请重新粘贴包含 http(s) 的链接">
        链接无效
      </span>
    );
  }
  return null;
}
