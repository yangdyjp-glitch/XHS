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

// 判断型内容方法论：留学机构账号的增长命脉，复盘分析与下期建议都用它当评判尺子。
// 提炼自实战方法论，并对齐本系统能看到的指标（曝光/阅读/互动结构），而非照搬原文。
const JUDGMENT_CONTENT_GUIDE = `## 核心方法论：判断型内容 > 知识型干货（这是留学机构账号的增长命脉，必须当作评判与推荐的尺子）
- 用户付费买的是「判断」而不是「知识」。攻略、模板、时间线、考点速记、资料合集这类纯干货网上到处都有，只会吸引"求资料/领模板"的白嫖党——他们会关注但几乎不转化。
- 真正带来付费用户的是判断型内容：围绕「一个具体的学生 + 一个反直觉的决定 + 为什么」，有立场、有取舍、有"我建议/我劝/我让"、有反常识结论，展现的是决策和思考过程，而不是干巴巴的结论或罗列。
- 判断高低要看互动结构而不仅是曝光量：高曝光却只换来收藏/泛泛点赞、缺乏评论讨论，往往是吸引了白嫖党；能引发"为什么、怎么选、我也在纠结"这类讨论的，才是判断型内容在起效。
- 强工具性内容（考试速记、套磁模板、纯专业科普）受众窄、起量难，只适合做精准转化的补充，不该当作起量主力。`;

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

${JUDGMENT_CONTENT_GUIDE}

请结合上面的「判断型 vs 知识型」方法论，以JSON格式输出分析结果，结构如下：
{
  "summary": "整体表现总结（2-3句话），点明这批内容整体偏判断型还是偏知识型干货，以及它如何影响了起量与转化",
  "topPerformers": [{"title": "笔记标题", "reason": "表现好的原因，并指出它是否具备判断型特征（具体的人/反直觉决定/有立场有取舍）"}],
  "bottomPerformers": [{"title": "笔记标题", "reason": "表现不佳的原因，重点判断它是否落入了纯干货/强工具性内容的陷阱（受众窄、只吸引白嫖党）"}],
  "contentFormulas": ["可复制的有效公式，优先提炼判断型角度（如某种'反直觉决策+理由'的结构），而不是单纯的关键词堆叠"],
  "trends": ["趋势洞察，关注判断型内容与工具型内容在起量、互动结构上的分化"],
  "improvements": ["具体改进建议，给出如何把表现差的知识型选题改写成判断型的可执行方向（具体到对象、立场、反差点）"]
}

只输出JSON，不要其他文字。`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
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
${JUDGMENT_CONTENT_GUIDE}

请推荐5-8个下期选题方向，要求：
1. **务必结合近期事件节点，提前布局热点内容**。
2. 每个方向尽量做成判断型角度：能落到「一个具体的学生 / 一次具体决策 + 反直觉结论 + 为什么」，标题带立场与取舍（例如"为什么我不建议这个分数段死磕EJU""同样均分，为什么我劝一个冲早大、另一个先保MARCH"），而不是"XX攻略 / XX怎么写 / XX时间线 / 考点速记"这类知识型干货。
3. 主动规避强工具性、纯专业科普、以及"求资料 / 领模板 / 扣1领取"式诱导白嫖的选题。
以JSON格式输出：
{
  "recommendations": [
    {
      "title": "判断型选题标题（聚焦具体对象、带立场或反差，而非泛泛的攻略）",
      "topicType": "选题类型",
      "keywords": ["关键词1", "关键词2"],
      "reason": "推荐理由：这个判断角度为什么能吸引'需要别人帮他做决策'的付费用户，以及与哪个时间节点相关",
      "priority": "high/normal/low"
    }
  ],
  "strategy": "整体策略建议（2-3句话），点明下期如何从知识型干货转向判断型内容"
}

只输出JSON，不要其他文字。`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
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

${JUDGMENT_CONTENT_GUIDE}

请只输出**一条**新的选题推荐，保持与原方向主题相关但角度/切入点不同，并且尽量做成判断型角度（具体对象 + 反直觉决策 + 为什么，有立场有取舍），避免退化成纯攻略/纯科普/工具型干货。以JSON格式输出：
{
  "title": "判断型选题标题（聚焦具体对象、带立场或反差）",
  "topicType": "选题类型",
  "keywords": ["关键词1", "关键词2"],
  "reason": "推荐理由（这个判断角度为什么能吸引付费用户）",
  "priority": "high/normal/low"
}

只输出JSON，不要其他文字。`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2000,
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
