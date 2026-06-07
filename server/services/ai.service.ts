import Anthropic from "@anthropic-ai/sdk";
import { STRICT_BANNED_WORDS } from "../../shared/bannedWords.js";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "your-anthropic-api-key-here") {
    throw new Error("请在Railway环境变量或.env中设置有效的ANTHROPIC_API_KEY");
  }
  return new Anthropic({ apiKey });
}

export interface ReviewInputData {
  period: { start: string; end: string };
  accounts: { id: number; name: string; layer: string }[];
  notes: {
    id: number;
    title: string;
    accountName: string;
    topicType: string;
    keywords: string[];
    publishedAt: string;
    metrics: { day: number; impression: number; view: number; likeCount: number; collect: number; commentCount: number; shareCount: number }[];
  }[];
  totals: { noteCount: number; totalImpression: number; totalView: number; totalLike: number; totalCollect: number; totalComment: number; totalShare: number };
}

export interface AnalysisResult {
  summary: string;
  topPerformers: { title: string; reason: string }[];
  bottomPerformers: { title: string; reason: string }[];
  contentFormulas: string[];
  trends: string[];
  improvements: string[];
}

export interface RecommendationResult {
  recommendations: {
    title: string;
    topicType: string;
    keywords: string[];
    reason: string;
    priority: string;
  }[];
  strategy: string;
}

export async function analyzePerformance(data: ReviewInputData): Promise<{ result: AnalysisResult; tokensUsed: number; prompt: string }> {
  const prompt = `你是小红书内容运营分析专家。请根据以下数据，对这段时间的内容表现进行复盘分析。

## 周期
${data.period.start} 至 ${data.period.end}

## 账号矩阵
${data.accounts.map(a => `- ${a.name}（${a.layer}）`).join("\n")}

## 发布笔记数据
${data.notes.map(n => {
  const bestMetric = n.metrics.length > 0 ? n.metrics[n.metrics.length - 1] : null;
  return `- 「${n.title}」(${n.accountName}, ${n.topicType}, 关键词: ${n.keywords.join("/")})\n  发布: ${n.publishedAt}\n  ${bestMetric ? `最新数据(T+${bestMetric.day}): 曝光${bestMetric.impression} 阅读${bestMetric.view} 点赞${bestMetric.likeCount} 收藏${bestMetric.collect} 评论${bestMetric.commentCount} 分享${bestMetric.shareCount}` : "暂无数据"}`;
}).join("\n")}

## 整体汇总
发布笔记: ${data.totals.noteCount}篇
总曝光: ${data.totals.totalImpression} | 总阅读: ${data.totals.totalView} | 总点赞: ${data.totals.totalLike} | 总收藏: ${data.totals.totalCollect} | 总评论: ${data.totals.totalComment} | 总分享: ${data.totals.totalShare}

请以JSON格式输出分析结果，结构如下：
{
  "summary": "整体表现总结（2-3句话）",
  "topPerformers": [{"title": "笔记标题", "reason": "表现好的原因"}],
  "bottomPerformers": [{"title": "笔记标题", "reason": "表现不佳的原因分析"}],
  "contentFormulas": ["发现的有效内容公式，如XX类型+XX关键词效果好"],
  "trends": ["趋势洞察"],
  "improvements": ["具体改进建议"]
}

只输出JSON，不要其他文字。`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result: AnalysisResult = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { summary: text, topPerformers: [], bottomPerformers: [], contentFormulas: [], trends: [], improvements: [] };

    return { result, tokensUsed, prompt };
  } catch (e: any) {
    if (e.message?.includes("ANTHROPIC_API_KEY")) throw e;
    throw new Error(`AI分析失败: ${e.message || "未知错误"}`);
  }
}

export interface UpcomingEvent {
  title: string;
  eventDate: string;
  category: string;
}

export interface RejectedRec {
  title: string;
  topicType?: string | null;
  keywords?: string[] | null;
}

function rejectedBlock(rejected?: RejectedRec[]): string {
  if (!rejected || rejected.length === 0) return "";
  return `## 已否决方向（严禁再次推荐，也不要推荐与之高度相似/换汤不换药的选题）
${rejected.map(r => `- ${r.title}${r.topicType ? `（${r.topicType}）` : ""}${r.keywords && r.keywords.length ? ` 关键词: ${r.keywords.join("/")}` : ""}`).join("\n")}
`;
}

export async function generateRecommendations(data: ReviewInputData, analysisResult?: AnalysisResult, upcomingEvents?: UpcomingEvent[], rejected?: RejectedRec[]): Promise<{ result: RecommendationResult; tokensUsed: number; prompt: string }> {
  const prompt = `你是小红书内容运营策略专家，专注于日本留学领域。根据以下复盘数据、分析结果和近期重要事件节点，为下一周期推荐选题方向。

## 历史数据概览
周期: ${data.period.start} 至 ${data.period.end}
发布${data.totals.noteCount}篇笔记

## 账号矩阵定位
${data.accounts.map(a => `- ${a.name}（${a.layer}）`).join("\n")}

## 各笔记表现
${data.notes.slice(0, 15).map(n => {
  const bestMetric = n.metrics.length > 0 ? n.metrics[n.metrics.length - 1] : null;
  return `- 「${n.title}」(${n.topicType}, ${n.keywords.join("/")}) ${bestMetric ? `曝光${bestMetric.impression} 阅读${bestMetric.view} 互动${bestMetric.likeCount + bestMetric.collect + bestMetric.commentCount}` : "无数据"}`;
}).join("\n")}

${analysisResult ? `## 上期复盘分析
- 有效公式: ${analysisResult.contentFormulas.join("; ")}
- 趋势: ${analysisResult.trends.join("; ")}
- 改进方向: ${analysisResult.improvements.join("; ")}` : ""}

${upcomingEvents && upcomingEvents.length > 0 ? `## 近期重要事件节点（请重点结合这些时间节点推荐蹭热点选题）
${upcomingEvents.map(e => `- ${e.eventDate} ${e.title}（${e.category}）`).join("\n")}` : ""}

${STRICT_BANNED_WORDS.length > 0 ? `## 禁用词（严格禁止出现）
以下词语为平台禁用词，所有选题标题、关键词、推荐理由和策略建议中都**绝对不得出现**，也不要使用其近义表达规避：
${STRICT_BANNED_WORDS.map(w => `- ${w}`).join("\n")}` : ""}

${rejectedBlock(rejected)}
请推荐5-8个下期选题方向。**务必结合近期事件节点，提前布局热点内容**。以JSON格式输出：
{
  "recommendations": [
    {
      "title": "建议的选题标题",
      "topicType": "选题类型",
      "keywords": ["关键词1", "关键词2"],
      "reason": "推荐理由（为什么这个方向值得做，与哪个时间节点相关）",
      "priority": "high/normal/low"
    }
  ],
  "strategy": "整体策略建议（2-3句话）"
}

只输出JSON，不要其他文字。`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result: RecommendationResult = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { recommendations: [], strategy: text };

    // 兜底：万一模型仍输出禁用词，从策略与推荐文本中剔除
    const scrub = (s: string) => STRICT_BANNED_WORDS.reduce((acc, w) => (w ? acc.split(w).join("") : acc), s || "");
    result.strategy = scrub(result.strategy);
    result.recommendations = (result.recommendations || []).map((r) => ({
      ...r,
      title: scrub(r.title),
      reason: scrub(r.reason),
      keywords: (r.keywords || []).map(scrub),
    }));

    return { result, tokensUsed, prompt };
  } catch (e: any) {
    if (e.message?.includes("ANTHROPIC_API_KEY")) throw e;
    throw new Error(`AI推荐生成失败: ${e.message || "未知错误"}`);
  }
}

export type SingleRecommendation = RecommendationResult["recommendations"][number];

// 针对单条推荐重新生成一个「类似但不同」的替代推荐
export async function regenerateOneRecommendation(
  data: ReviewInputData,
  seed: SingleRecommendation,
  upcomingEvents?: UpcomingEvent[],
  rejected?: RejectedRec[],
  avoidTitles?: string[]
): Promise<{ recommendation: SingleRecommendation; tokensUsed: number; prompt: string }> {
  const prompt = `你是小红书内容运营策略专家，专注于日本留学领域。下面这条选题推荐用户希望「换一个类似方向但更好/不同角度」的新建议。

## 历史数据概览
周期: ${data.period.start} 至 ${data.period.end}，发布${data.totals.noteCount}篇笔记

## 当前这条推荐（请基于它的方向，给出一个相似但不重复的新选题）
- 标题: ${seed.title}
- 类型: ${seed.topicType}
- 关键词: ${(seed.keywords || []).join("/")}
- 理由: ${seed.reason}

${upcomingEvents && upcomingEvents.length > 0 ? `## 近期重要事件节点（可结合）
${upcomingEvents.map(e => `- ${e.eventDate} ${e.title}（${e.category}）`).join("\n")}` : ""}

${STRICT_BANNED_WORDS.length > 0 ? `## 禁用词（标题/关键词/理由中绝对不得出现）
${STRICT_BANNED_WORDS.map(w => `- ${w}`).join("\n")}` : ""}

${rejectedBlock(rejected)}
${avoidTitles && avoidTitles.length > 0 ? `## 当前已有的其它推荐（不要与这些重复）
${avoidTitles.map(t => `- ${t}`).join("\n")}` : ""}

请只输出**一条**新的选题推荐，保持与原方向主题相关但角度/切入点不同。以JSON格式输出：
{
  "title": "建议的选题标题",
  "topicType": "选题类型",
  "keywords": ["关键词1", "关键词2"],
  "reason": "推荐理由",
  "priority": "high/normal/low"
}

只输出JSON，不要其他文字。`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed: SingleRecommendation = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { title: seed.title, topicType: seed.topicType, keywords: seed.keywords, reason: text, priority: seed.priority };

    const scrub = (s: string) => STRICT_BANNED_WORDS.reduce((acc, w) => (w ? acc.split(w).join("") : acc), s || "");
    const recommendation: SingleRecommendation = {
      ...parsed,
      title: scrub(parsed.title),
      reason: scrub(parsed.reason),
      keywords: (parsed.keywords || []).map(scrub),
    };

    return { recommendation, tokensUsed, prompt };
  } catch (e: any) {
    if (e.message?.includes("ANTHROPIC_API_KEY")) throw e;
    throw new Error(`AI推荐刷新失败: ${e.message || "未知错误"}`);
  }
}
