export const DEFAULT_RECOMMENDATION_TOPIC_TYPES = [
  "产品宣传",
  "合格实绩",
  "话题讨论",
  "节日祝福",
  "考试攻略",
  "考学攻略",
  "品牌建设",
  "热点借势",
  "申请服务",
  "生活内容",
  "专业科普",
];

const TYPE_ALIASES: Record<string, string> = {
  judgment_exam: "考试攻略",
  judgment_path: "考学攻略",
  judgment_application: "申请服务",
  judgment_result: "考试攻略",
  judgment_score: "考试攻略",
  judgment_school: "考学攻略",
  judgment_major: "专业科普",
  judgment_timing: "热点借势",
  judgment_case: "合格实绩",
  judgment_strategy: "考学攻略",
  judgment_content: "话题讨论",
  judgment_language: "考试攻略",
  judgment_language_school: "申请服务",
  exam: "考试攻略",
  path: "考学攻略",
  application: "申请服务",
  result: "考试攻略",
  score: "考试攻略",
  school: "考学攻略",
  major: "专业科普",
  timing: "热点借势",
  case: "合格实绩",
  strategy: "考学攻略",
  content: "话题讨论",
  language: "考试攻略",
  language_school: "申请服务",
  jlpt: "考试攻略",
  eju: "考试攻略",
  toefl: "考试攻略",
  ielts: "考试攻略",
  toeic: "考试攻略",
  coe: "申请服务",
  mext: "申请服务",
  gpa: "考学攻略",
};

function keyOf(label: string) {
  return label.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function uniqueTypes(types?: readonly string[]) {
  const source = types && types.length > 0 ? types : DEFAULT_RECOMMENDATION_TOPIC_TYPES;
  return Array.from(new Set(source.map((t) => String(t).trim()).filter(Boolean)));
}

function pickAllowed(target: string, allowed: string[]) {
  return allowed.includes(target) ? target : "";
}

function inferTypeFromText(text: string, allowed: string[]) {
  const rules: [RegExp, string][] = [
    [/jlpt|eju|toefl|ielts|toeic|考试|日语|留考|托福|雅思|托业|成绩|分数|刷题|备考/i, "考试攻略"],
    [/考学|升学|择校|路径|学校|院校|研究生|修士|学部|均分/i, "考学攻略"],
    [/出愿|申请|材料|报名|coe|在留|签证|文书|服务/i, "申请服务"],
    [/合格|实绩|录取|案例|offer/i, "合格实绩"],
    [/热点|趋势|节点|事件|截止|发布/i, "热点借势"],
    [/节日|祝福/i, "节日祝福"],
    [/品牌|信任|矩阵/i, "品牌建设"],
    [/产品|宣传|课程/i, "产品宣传"],
    [/生活|日常|体验/i, "生活内容"],
    [/专业|科普|知识|解析/i, "专业科普"],
    [/话题|讨论|观点|争议|判断/i, "话题讨论"],
  ];

  for (const [pattern, target] of rules) {
    if (pattern.test(text)) {
      const picked = pickAllowed(target, allowed);
      if (picked) return picked;
    }
  }
  return "";
}

export function toExistingTopicType(label: unknown, allowedTopicTypes?: readonly string[]): string {
  const raw = String(label ?? "").trim();
  const allowed = uniqueTypes(allowedTopicTypes);
  if (!raw) return allowed[0] || "";
  if (allowed.includes(raw)) return raw;

  const key = keyOf(raw);
  const alias = TYPE_ALIASES[key];
  if (alias) {
    const picked = pickAllowed(alias, allowed);
    if (picked) return picked;
  }

  if (key.startsWith("judgment_")) {
    const inferred = inferTypeFromText(key.slice("judgment_".length), allowed);
    if (inferred) return inferred;
  }

  const fromText = inferTypeFromText(`${raw} ${key}`, allowed);
  if (fromText) return fromText;

  return allowed[0] || raw;
}

export function toChineseRecommendationLabel(label: unknown): string {
  const raw = String(label ?? "").trim();
  if (!raw) return "";
  const key = keyOf(raw);
  if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
  if (key.startsWith("judgment_")) return toExistingTopicType(raw);
  return raw;
}

export function normalizeRecommendationLabels<T extends { topicType?: unknown; keywords?: unknown }>(
  rec: T,
  allowedTopicTypes?: readonly string[]
): T & {
  topicType: string;
  keywords: string[];
} {
  const topicType = toExistingTopicType(rec.topicType, allowedTopicTypes);
  const keywords = Array.isArray(rec.keywords)
    ? rec.keywords
        .map((keyword) => String(keyword ?? "").trim())
        .filter((keyword) => keyword && !/^judgment[_-]/i.test(keyword))
    : [];

  return {
    ...rec,
    topicType,
    keywords: Array.from(new Set(keywords.filter((k) => k !== topicType))),
  };
}
