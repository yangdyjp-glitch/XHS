/**
 * 从「粘贴进来的笔记链接」中提取可点击的绝对 URL。
 *
 * 小红书 PC 端「复制链接」往往给出的是一整段分享口令，例如：
 *   61 【标题 - 账号 | 小红书 - 你的生活兴趣社区】 😆 vmTXxAhFDqFv1yP 😆 https://www.xiaohongshu.com/discovery/item/xxx?...
 * 真实链接被夹在文案中间。若把整段当作 <a href> 使用，浏览器会把它当成「相对路径」，
 * 在单页应用里被兜底路由捕获后跳到首页（选题看板），导致「点击笔记打不开」。
 *
 * 这里做宽容解析：
 *  1) 文本中含 http(s) 链接 → 取第一个（并去掉常见尾随标点）。
 *  2) 整体是个无协议的域名/路径（不含空白）→ 补 https://。
 *  3) 否则（纯标签/口令等）→ 返回 null，调用方据此不渲染「查看笔记」。
 */
export function extractNoteUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // 1) 抽取文本中的第一个 http(s) 链接（URL 内不含空白），去掉尾随中文/括号/引号标点
  const m = s.match(/https?:\/\/[^\s]+/i);
  if (m) {
    return m[0].replace(/[)\]）】，。、》>"']+$/, "");
  }

  // 2) 无协议但整体像域名/路径（不含空白）→ 补 https://
  if (!/\s/.test(s) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|\?|$)/i.test(s)) {
    return `https://${s}`;
  }

  // 3) 无法识别为链接
  return null;
}
