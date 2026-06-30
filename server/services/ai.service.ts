import Anthropic from "@anthropic-ai/sdk";
import { STRICT_BANNED_WORDS } from "../../shared/bannedWords.js";
import { normalizeRecommendationLabels } from "../../shared/recommendationLabels.js";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "your-anthropic-api-key-here") {
    throw new Error("请在Railway环境变量或.env中设置有效的ANTHROPIC_API_KEY");
  }
  return new Anthropic({ apiKey });
}

const MODEL = "claude-opus-4-8";

// 用「强制工具调用」获取结构化结果：tool_choice 锁定到指定工具，
// SDK 直接返回已解析的对象（tool_use.input），不再靠正则抠文本 + JSON.parse，
// 从根本上避免模型输出非法 JSON 导致的解析报错。
async function callStructured<T>(
  prompt: string,
  tool: { name: string; description: string; input_schema: Record<string, unknown> },
  maxTokens: number
): Promise<{ result: T; tokensUsed: number }> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    tools: [tool as any],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: prompt }],
  });
  const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("AI 未返回结构化结果");
  return { result: block.input as T, tokensUsed };
}

// 单条推荐的字段结构（推荐列表与「换一个」共用）
const REC_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    topicType: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    reason: { type: "string" },
    priority: { type: "string" },
  },
  required: ["title", "topicType", "keywords", "reason", "priority"],
};

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    topPerformers: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, reason: { type: "string" } }, required: ["title", "reason"] } },
    bottomPerformers: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, reason: { type: "string" } }, required: ["title", "reason"] } },
    contentFormulas: { type: "array", items: { type: "string" } },
    trends: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "topPerformers", "bottomPerformers", "contentFormulas", "trends", "improvements"],
};

const RECOMMENDATIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommendations: { type: "array", items: REC_ITEM_SCHEMA },
    strategy: { type: "string" },
  },
  required: ["recommendations", "strategy"],
};

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

function buildAnalysisPrompt(data: ReviewInputData): string {
  return `你是小红书内容运营分析专家。请根据以下数据，对这段时间的内容表现进行复盘分析。

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

【硬性要求，必须遵守】
- summary 只是总览。真正的分析价值在 topPerformers / bottomPerformers / contentFormulas / trends / improvements 这五个分组里，**绝对不要把分析都堆在 summary 而让这些分组留空**。
- 这五个分组**都必须有实际内容、不得返回空数组**。即使本期笔记数量很多（几十篇），也要完整分析并填满每一个分组：topPerformers 至少 3 条、bottomPerformers 至少 3 条、contentFormulas 至少 3 条、trends 至少 3 条、improvements 至少 4 条。
- 笔记多的时候，按表现挑出最值得讲的代表案例来填充各分组即可，不必逐篇罗列，但分组本身不能空。

请通过 submit_analysis 工具提交结果（字段含义见上）。`;
}

export async function analyzePerformance(data: ReviewInputData): Promise<{ result: AnalysisResult; tokensUsed: number; prompt: string }> {
  const prompt = buildAnalysisPrompt(data);
  const arr = (x: any): any[] => (Array.isArray(x) ? x : []);
  const normalize = (raw: any): AnalysisResult => ({
    summary: typeof raw?.summary === "string" ? raw.summary : String(raw?.summary ?? ""),
    topPerformers: arr(raw?.topPerformers),
    bottomPerformers: arr(raw?.bottomPerformers),
    contentFormulas: arr(raw?.contentFormulas),
    trends: arr(raw?.trends),
    improvements: arr(raw?.improvements),
  });
  // schema 的 required 只能保证字段存在，无法保证数组非空；
  // 笔记较多时模型偶发把分析都写进 summary、各分组留空，检测到后强制补全一次。
  const allSectionsEmpty = (r: AnalysisResult) =>
    r.topPerformers.length === 0 &&
    r.bottomPerformers.length === 0 &&
    r.contentFormulas.length === 0 &&
    r.trends.length === 0 &&
    r.improvements.length === 0;
  const tool = { name: "submit_analysis", description: "提交本期复盘分析结果", input_schema: ANALYSIS_SCHEMA };

  try {
    const first = await callStructured<AnalysisResult>(prompt, tool, 8000);
    let tokensUsed = first.tokensUsed;
    let result = normalize(first.result);

    if (allSectionsEmpty(result)) {
      const retryPrompt = `${prompt}

⚠️ 上一次你把 topPerformers / bottomPerformers / contentFormulas / trends / improvements 全部留成了空数组，这是错误的、不被接受的。请重新分析，这五个分组都必须有实际内容、不得为空（topPerformers≥3、bottomPerformers≥3、contentFormulas≥3、trends≥3、improvements≥4）。${result.summary ? `\n\n（你上一次的整体总结，供参考，可改写）：${result.summary}` : ""}`;
      const retry = await callStructured<AnalysisResult>(retryPrompt, tool, 8000);
      tokensUsed += retry.tokensUsed;
      const retried = normalize(retry.result);
      result = {
        summary: retried.summary || result.summary,
        topPerformers: retried.topPerformers.length ? retried.topPerformers : result.topPerformers,
        bottomPerformers: retried.bottomPerformers.length ? retried.bottomPerformers : result.bottomPerformers,
        contentFormulas: retried.contentFormulas.length ? retried.contentFormulas : result.contentFormulas,
        trends: retried.trends.length ? retried.trends : result.trends,
        improvements: retried.improvements.length ? retried.improvements : result.improvements,
      };
    }

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

function allowedTopicTypePrompt(allowedTopicTypes?: readonly string[]) {
  if (!allowedTopicTypes || allowedTopicTypes.length === 0) return "";
  return `## 可用选题类型（topicType 必须且只能从下列现有类型中选择，不得新增）
${allowedTopicTypes.map((t) => `- ${t}`).join("\n")}
`;
}

export async function generateRecommendations(data: ReviewInputData, analysisResult?: AnalysisResult, upcomingEvents?: UpcomingEvent[], rejected?: RejectedRec[], allowedTopicTypes?: readonly string[]): Promise<{ result: RecommendationResult; tokensUsed: number; prompt: string }> {
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
${allowedTopicTypePrompt(allowedTopicTypes)}
${JUDGMENT_CONTENT_GUIDE}

请推荐5-8个下期选题方向，要求：
1. **务必结合近期事件节点，提前布局热点内容**。
2. 每个方向尽量做成判断型角度：能落到「一个具体的学生 / 一次具体决策 + 反直觉结论 + 为什么」，标题带立场与取舍（例如"为什么我不建议这个分数段死磕EJU""同样均分，为什么我劝一个冲早大、另一个先保MARCH"），而不是"XX攻略 / XX怎么写 / XX时间线 / 考点速记"这类知识型干货。
3. 主动规避强工具性、纯专业科普、以及"求资料 / 领模板 / 扣1领取"式诱导白嫖的选题。
4. topicType 是类别标签，**必须从上方可用选题类型中选择**；不要输出英文、拼音、snake_case、代码名或任何新类型（禁止 judgment_exam、judgment_path 这类值）。
5. keywords 会作为关键词标签展示，可以不受类型列表限制，但必须是中文短词或 JLPT/EJU/TOEFL/IELTS 这类常见考试简称；不要输出英文代码词、拼音、snake_case 或 judgment_*。
以JSON格式输出：
{
  "recommendations": [
    {
      "title": "判断型选题标题（聚焦具体对象、带立场或反差，而非泛泛的攻略）",
      "topicType": "必须填写上方可用选题类型之一",
      "keywords": ["中文关键词1", "中文关键词2"],
      "reason": "推荐理由：这个判断角度为什么能吸引'需要别人帮他做决策'的付费用户，以及与哪个时间节点相关",
      "priority": "high/normal/low"
    }
  ],
  "strategy": "整体策略建议（2-3句话），点明下期如何从知识型干货转向判断型内容"
}

请通过 submit_recommendations 工具提交结果（字段含义见上）。`;

  try {
    const { result, tokensUsed } = await callStructured<RecommendationResult>(
      prompt,
      { name: "submit_recommendations", description: "提交下期选题推荐与整体策略", input_schema: RECOMMENDATIONS_SCHEMA },
      4096
    );

    // 兜底：规整结构为数组 + 剔除禁用词（scrub 对非字符串安全）
    const scrub = (s: any) => STRICT_BANNED_WORDS.reduce((acc, w) => (w ? acc.split(w).join("") : acc), typeof s === "string" ? s : "");
    result.strategy = scrub(result.strategy);
    result.recommendations = (Array.isArray(result.recommendations) ? result.recommendations : []).map((r: any) => normalizeRecommendationLabels({
      ...r,
      topicType: scrub(r.topicType),
      title: scrub(r.title),
      reason: scrub(r.reason),
      keywords: (Array.isArray(r.keywords) ? r.keywords : []).map(scrub),
    }, allowedTopicTypes));

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
  avoidTitles?: string[],
  allowedTopicTypes?: readonly string[]
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

${allowedTopicTypePrompt(allowedTopicTypes)}
${JUDGMENT_CONTENT_GUIDE}

请只输出**一条**新的选题推荐，保持与原方向主题相关但角度/切入点不同，并且尽量做成判断型角度（具体对象 + 反直觉决策 + 为什么，有立场有取舍），避免退化成纯攻略/纯科普/工具型干货。topicType 必须从上方可用选题类型中选择，不要输出英文、拼音、snake_case、代码名或任何新类型（禁止 judgment_exam、judgment_path 这类值）。keywords 会作为关键词标签展示，可以不受类型列表限制，但必须是中文短词或 JLPT/EJU/TOEFL/IELTS 这类常见考试简称；不要输出英文代码词、拼音、snake_case 或 judgment_*。以JSON格式输出：
{
  "title": "判断型选题标题（聚焦具体对象、带立场或反差）",
  "topicType": "必须填写上方可用选题类型之一",
  "keywords": ["中文关键词1", "中文关键词2"],
  "reason": "推荐理由（这个判断角度为什么能吸引付费用户）",
  "priority": "high/normal/low"
}

请通过 submit_recommendation 工具提交这一条新推荐。`;

  try {
    const { result: parsed, tokensUsed } = await callStructured<SingleRecommendation>(
      prompt,
      { name: "submit_recommendation", description: "提交一条替代选题推荐", input_schema: REC_ITEM_SCHEMA },
      2000
    );

    const scrub = (s: any) => STRICT_BANNED_WORDS.reduce((acc, w) => (w ? acc.split(w).join("") : acc), typeof s === "string" ? s : "");
    const recommendation: SingleRecommendation = normalizeRecommendationLabels({
      ...parsed,
      topicType: scrub(parsed.topicType),
      title: scrub(parsed.title),
      reason: scrub(parsed.reason),
      keywords: (Array.isArray(parsed.keywords) ? parsed.keywords : []).map(scrub),
    }, allowedTopicTypes);

    return { recommendation, tokensUsed, prompt };
  } catch (e: any) {
    if (e.message?.includes("ANTHROPIC_API_KEY")) throw e;
    throw new Error(`AI推荐刷新失败: ${e.message || "未知错误"}`);
  }
}

export interface TitleSuggestionResult {
  diagnosis: string;
  suggestions: { title: string; reason: string }[];
}

// 新建选题时，针对用户写的原始标题，基于全局方法论给出「标题修改意见」+ 改写候选
export async function suggestTitle(input: { title: string; topicType?: string; keywords?: string[] }): Promise<{ result: TitleSuggestionResult; tokensUsed: number }> {
  const prompt = `你是小红书内容运营与标题优化专家，专注于日本留学领域。用户正在新建一个选题，下面是他写的原始标题，请基于全局方法论给出「标题修改意见」。

## 原始标题
${input.title}
${input.topicType ? `\n## 选题类型\n${input.topicType}` : ""}
${input.keywords && input.keywords.length ? `\n## 关键词\n${input.keywords.join("/")}` : ""}

${STRICT_BANNED_WORDS.length > 0 ? `## 禁用词（改写后的标题里绝对不得出现，也不要用近义表达规避）
${STRICT_BANNED_WORDS.map(w => `- ${w}`).join("\n")}
` : ""}
${JUDGMENT_CONTENT_GUIDE}

## 小红书标题优化原则
- 前几个字就要抓住眼球，善用具体数字、具体对象或反差冲突。
- 优先判断型角度：具体的人 + 反直觉的决定 + 为什么，而不是泛泛的"XX攻略 / XX怎么写 / 时间线 / 考点速记"。
- 口语化、有情绪、有立场，避免官方腔和形容词堆砌。
- 长度适中（一般不超过 20 字），可用一个疑问/反问或钩子收尾。

请针对原始标题：先给出简短诊断（指出它当前偏知识型还是判断型、存在什么问题），再给出 4 个改写后的更优标题（每个附一句话理由）。以JSON格式输出：
{
  "diagnosis": "对原标题的简短点评（1-2句）",
  "suggestions": [
    { "title": "改写后的标题", "reason": "为什么更好（1句话）" }
  ]
}

只输出JSON，不要其他文字。`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed: TitleSuggestionResult = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : { diagnosis: text, suggestions: [] };

    const scrub = (s: string) => STRICT_BANNED_WORDS.reduce((acc, w) => (w ? acc.split(w).join("") : acc), s || "");
    const result: TitleSuggestionResult = {
      diagnosis: scrub(parsed.diagnosis || ""),
      suggestions: (parsed.suggestions || []).map((s) => ({ title: scrub(s.title || ""), reason: scrub(s.reason || "") })),
    };

    return { result, tokensUsed };
  } catch (e: any) {
    if (e.message?.includes("ANTHROPIC_API_KEY")) throw e;
    throw new Error(`AI标题建议失败: ${e.message || "未知错误"}`);
  }
}
