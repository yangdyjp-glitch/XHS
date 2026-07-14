import { SNAPSHOT_DAYS } from "./enums.js";

export interface XhsDetailRow {
  section?: string;
  metric?: string;
  value?: string | number;
  extra?: string;
}

export interface XhsSnapshotInput {
  daysSincePublish: number;
  impression: number;
  view: number;
  likeCount: number;
  collect: number;
  commentCount: number;
  shareCount: number;
  coverClickRate: number | null;
}

const METRIC_ALIASES: Record<string, string[]> = {
  impression: ["曝光数", "曝光"],
  view: ["观看数", "阅读数", "观看", "阅读"],
  likeCount: ["点赞数", "点赞"],
  collect: ["收藏数", "收藏"],
  commentCount: ["评论数", "评论"],
  shareCount: ["分享数", "分享"],
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function findRow(rows: XhsDetailRow[], aliases: string[]): XhsDetailRow | undefined {
  return rows.find((row) => aliases.includes(normalizeText(row.metric)));
}

function parseNumber(value: unknown): number {
  const normalized = normalizeText(value).replace(/,/g, "");
  const number = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || normalizeText(value) === "") return null;
  const normalized = normalizeText(value).replace(/,/g, "");
  const number = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

export function parseXhsMetadata(rows: XhsDetailRow[]) {
  const title = normalizeText(findRow(rows, ["title", "标题"])?.value);
  const rawPublishedAt = normalizeText(findRow(rows, ["published_at", "发布时间"])?.value);
  const directCoverClickRate = parseNullableNumber(findRow(rows, ["封面点击率", "首图点击率"])?.value);

  let publishedAt: string | null = null;
  if (rawPublishedAt) {
    const normalized = rawPublishedAt
      .replace(/年|\//g, "-")
      .replace(/月/g, "-")
      .replace(/日/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    const isoLike = normalized.replace(" ", "T");
    const date = new Date(hasTimeZone ? isoLike : `${isoLike}+08:00`);
    if (!Number.isNaN(date.getTime())) publishedAt = date.toISOString();
  }

  return {
    title: title || null,
    publishedAt,
    directCoverClickRate,
  };
}

function parseDailyTrend(rows: XhsDetailRow[], aliases: string[]): Record<string, number> {
  const entry = rows.find((row) => {
    const metric = normalizeText(row.metric);
    return aliases.some((alias) => metric === `按天/${alias}` || metric === `按日/${alias}`);
  });
  if (!entry?.extra) return {};

  const result: Record<string, number> = {};
  for (const part of String(entry.extra).split(" | ")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const date = part.slice(0, separator).trim();
    const value = parseNumber(part.slice(separator + 1));
    if (date) result[date] = value;
  }
  return result;
}

export function hasXhsDailyTrend(rows: XhsDetailRow[]): boolean {
  const available = new Set(rows.filter((row) => {
    const metric = normalizeText(row.metric);
    return (metric.startsWith("按天/") || metric.startsWith("按日/")) && String(row.extra || "").includes("=");
  }).map((row) => normalizeText(row.metric).replace(/^按[天日]\//, "")));
  return METRIC_ALIASES.impression.some((alias) => available.has(alias))
    && METRIC_ALIASES.view.some((alias) => available.has(alias));
}

export function toShanghaiDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function computeXhsSnapshot(
  rows: XhsDetailRow[],
  publishedAt: string,
  targetDay: number,
): XhsSnapshotInput {
  const published = new Date(publishedAt);
  const result: Record<string, number> = {};
  const useDailyTrend = hasXhsDailyTrend(rows);

  for (const [field, aliases] of Object.entries(METRIC_ALIASES)) {
    let total = parseNumber(findRow(rows, aliases)?.value);
    if (useDailyTrend) {
      const daily = parseDailyTrend(rows, aliases);
      total = 0;
      for (let offset = 0; offset < targetDay; offset += 1) {
        const date = new Date(published.getTime() + offset * 86_400_000);
        total += daily[toShanghaiDateKey(date)] || 0;
      }
    }
    result[field] = Math.round(total);
  }

  const metadata = parseXhsMetadata(rows);
  const derivedRate = result.impression > 0 ? (result.view / result.impression) * 100 : null;

  return {
    daysSincePublish: targetDay,
    impression: result.impression || 0,
    view: result.view || 0,
    likeCount: result.likeCount || 0,
    collect: result.collect || 0,
    commentCount: result.commentCount || 0,
    shareCount: result.shareCount || 0,
    coverClickRate: useDailyTrend && derivedRate !== null
      ? Number(derivedRate.toFixed(2))
      : metadata.directCoverClickRate,
  };
}

export function getDueSnapshotDays(publishedAt: string, existingDays: number[], now = new Date()): number[] {
  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return [];
  const age = Math.floor((now.getTime() - published.getTime()) / 86_400_000);
  const existing = new Set(existingDays);
  return SNAPSHOT_DAYS.filter((day) => age >= day && !existing.has(day));
}
