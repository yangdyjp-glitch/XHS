// 禁用词表 — 全局生效：新建选题标题、AI 策略建议均不得包含这些词
// 实际词条由运营提供后填入下方数组即可，无需改动其它代码。
export const BANNED_WORDS: string[] = [
  // 例：在此填入禁用词，每行一个，用引号包裹
];

// 返回 text 中命中的禁用词（去重，按出现顺序）
export function findBannedWords(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const word of BANNED_WORDS) {
    if (word && text.includes(word) && !found.includes(word)) found.push(word);
  }
  return found;
}
