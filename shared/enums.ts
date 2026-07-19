import { isSupportedXhsNoteUrl } from "./url.js";

export const TOPIC_STATUS = {
  pending_review: "待审批",
  approved: "已通过",
  writing: "写作中",
  published: "已发布",
} as const;

export const TOPIC_PRIORITY = {
  high: "高",
  normal: "普通",
  low: "低",
} as const;

export const TOPIC_SOURCE = {
  self: "自选",
  comment: "评论区",
  dm: "私信",
  monthly_theme: "月度主题",
  cross_post: "互推",
} as const;

export const ACCOUNT_LAYER = {
  upstream: "上游入口",
  midstream: "中游专业",
  closer: "收口",
} as const;

export const USER_ROLE = {
  teacher: "老师",
  leader: "负责人",
} as const;

export const NOTE_STATUS = {
  live: "在线",
  hidden: "已隐藏",
  deleted: "已删除",
} as const;

export const REVIEW_TYPE = {
  weekly: "周报",
  monthly: "月报",
} as const;

export const REVIEW_SCOPE = {
  account: "单号",
  matrix: "全矩阵",
} as const;

export const NOTIFICATION_TYPE = {
  data_entry_reminder: "数据录入提醒",
  approval_request: "审批请求",
  approval_result: "审批结果",
  review_ready: "报告生成",
  system: "系统通知",
} as const;

export const VALID_STATUS_TRANSITIONS: Record<string, { next: string[]; by: "teacher" | "leader" | "any" }[]> = {
  pending_review: [
    { next: ["approved"], by: "leader" },
  ],
  approved: [
    { next: ["writing"], by: "teacher" },
  ],
  writing: [
    { next: ["published"], by: "teacher" },
  ],
  published: [],
};

export const SNAPSHOT_DAYS = [1, 7, 14] as const;

export const PRESET_TOPIC_TYPES = [
  "产品宣传",
  "申请服务",
  "品牌建设",
  "专业科普",
  "合格实绩",
  "热点借势",
  "生活内容",
] as const;

export function isValidXhsNoteUrl(url: string): boolean {
  return isSupportedXhsNoteUrl(url);
}

export const XHS_URL_HINT = "请粘贴完整的小红书笔记链接（支持 xiaohongshu.com 和 rednote.com），不支持短链接（xhslink.com）";
