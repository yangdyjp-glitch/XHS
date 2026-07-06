import { z } from "zod";
import { eq, and, gte, desc, sql, isNull, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { accounts, users, notes, topics, metricSnapshots } from "../../drizzle/schema.js";

interface NoteWithScore {
  noteId: number;
  title: string;
  accountId: number;
  accountName: string;
  topicType: string;
  creatorName: string;
  creatorId: number;
  publishedAt: string;
  impression: number;
  view: number;
  likeCount: number;
  collect: number;
  commentCount: number;
  shareCount: number;
  xhsNoteUrl: string;
  score: number;
}

const dashboardPeriodSchema = z.enum(["7", "14", "30", "all"]);
type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;

function computeScore(m: { impression: number; view: number; likeCount: number; collect: number; commentCount: number; shareCount: number }) {
  return m.impression + m.view * 2 + m.likeCount * 3 + m.collect * 4 + m.commentCount * 5 + m.shareCount * 3;
}

function getPeriodStart(period: DashboardPeriod) {
  if (period === "all") return undefined;
  const days = parseInt(period, 10);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  return start;
}

function getPeriodTarget(weeklyTarget: number | null, period: DashboardPeriod) {
  const target = weeklyTarget || 3;
  if (period === "all") return target;
  return Math.max(1, Math.ceil(target * (parseInt(period, 10) / 7)));
}

async function fetchAllNotesWithScores(since?: Date, accountIds?: number[]): Promise<NoteWithScore[]> {
  const conditions = [isNull(topics.deletedAt)]; // 排除已删进回收箱选题的孤儿笔记
  if (since) conditions.push(gte(notes.publishedAt, since));
  if (accountIds && accountIds.length > 0) conditions.push(inArray(notes.accountId, accountIds));

  const noteRows = await db
    .select({
      id: notes.id,
      finalTitle: notes.finalTitle,
      accountId: notes.accountId,
      accountName: accounts.accountName,
      topicType: topics.topicType,
      creatorName: users.name,
      creatorId: topics.creatorId,
      publishedAt: notes.publishedAt,
      xhsNoteUrl: notes.xhsNoteUrl,
    })
    .from(notes)
    .leftJoin(topics, eq(notes.topicId, topics.id))
    .leftJoin(accounts, eq(notes.accountId, accounts.id))
    .leftJoin(users, eq(topics.creatorId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(notes.publishedAt));

  if (noteRows.length === 0) return [];

  const noteIds = noteRows.map((n) => n.id);
  const allMetrics = await db
    .select()
    .from(metricSnapshots)
    .where(sql`${metricSnapshots.noteId} IN (${sql.join(noteIds.map(id => sql`${id}`), sql`, `)})`);

  return noteRows.map((n) => {
    const noteMetrics = allMetrics.filter((m) => m.noteId === n.id);
    const best = noteMetrics.length > 0 ? noteMetrics.reduce((a, b) => a.daysSincePublish > b.daysSincePublish ? a : b) : null;
    return {
      noteId: n.id,
      title: n.finalTitle,
      accountId: n.accountId,
      accountName: n.accountName || "",
      topicType: n.topicType || "",
      creatorName: n.creatorName || "",
      creatorId: n.creatorId || 0,
      publishedAt: new Date(n.publishedAt).toISOString().split("T")[0],
      impression: best?.impression || 0,
      view: best?.view || 0,
      likeCount: best?.likeCount || 0,
      collect: best?.collect || 0,
      commentCount: best?.commentCount || 0,
      shareCount: best?.shareCount || 0,
      xhsNoteUrl: n.xhsNoteUrl || "",
      score: best ? computeScore(best) : 0,
    };
  });
}

export const dashboardRouter = router({
  overview: protectedProcedure
  .input(z.object({ period: dashboardPeriodSchema }).optional())
  .query(async ({ input }) => {
    const period = input?.period ?? "30";
    const periodStart = getPeriodStart(period);
    const accts = await db
      .select({
        id: accounts.id,
        accountName: accounts.accountName,
        ownerName: users.name,
        layer: accounts.layer,
        mainColor: accounts.mainColor,
        weeklyTarget: accounts.weeklyTarget,
        status: accounts.status,
      })
      .from(accounts)
      .leftJoin(users, eq(accounts.ownerId, users.id))
      .where(eq(accounts.status, "active"))
      .orderBy(accounts.createdAt);

    const periodNotes = await fetchAllNotesWithScores(periodStart);

    // 按「账号 + 状态」统计选题数（排除回收箱），供选题进度按账号筛选
    const topicConditions = [isNull(topics.deletedAt)];
    if (periodStart) topicConditions.push(gte(topics.createdAt, periodStart));
    const topicCountsRaw = await db
      .select({ accountId: topics.accountId, status: topics.status, count: sql<number>`count(*)::int` })
      .from(topics)
      .where(and(...topicConditions))
      .groupBy(topics.accountId, topics.status);

    // 全矩阵选题进度（所有账号合计），保持原口径
    const matrixTopicsByStatus: Record<string, number> = {};
    for (const t of topicCountsRaw) {
      matrixTopicsByStatus[t.status] = (matrixTopicsByStatus[t.status] || 0) + t.count;
    }

    const accountStats = accts.map((acct) => {
      const acctPeriodNotes = periodNotes.filter((n) => n.accountId === acct.id);

      const totalImpression = acctPeriodNotes.reduce((s, n) => s + n.impression, 0);
      const totalView = acctPeriodNotes.reduce((s, n) => s + n.view, 0);
      const totalLike = acctPeriodNotes.reduce((s, n) => s + n.likeCount, 0);
      const totalCollect = acctPeriodNotes.reduce((s, n) => s + n.collect, 0);
      const totalComment = acctPeriodNotes.reduce((s, n) => s + n.commentCount, 0);

      const periodPublished = acctPeriodNotes.length;
      const target = getPeriodTarget(acct.weeklyTarget, period);
      let health: "green" | "yellow" | "red" = "green";
      if (periodPublished < target * 0.5) health = "red";
      else if (periodPublished < target) health = "yellow";

      // 该账号各状态的选题数（供前端按账号合计选题进度）
      const topicsByStatus: Record<string, number> = {};
      for (const t of topicCountsRaw) {
        if (t.accountId === acct.id) topicsByStatus[t.status] = (topicsByStatus[t.status] || 0) + t.count;
      }

      return {
        ...acct,
        weekPublished: periodPublished,
        periodPublished,
        periodTarget: target,
        recentNoteCount: acctPeriodNotes.length,
        totalImpression, totalView, totalLike, totalCollect, totalComment,
        topicsByStatus,
        health,
      };
    });

    const matrixTotals = {
      totalAccounts: accts.length,
      totalNotesThisWeek: periodNotes.length,
      totalNotesInPeriod: periodNotes.length,
      totalNotesMonth: periodNotes.length,
      totalImpression: accountStats.reduce((s, a) => s + a.totalImpression, 0),
      totalView: accountStats.reduce((s, a) => s + a.totalView, 0),
      totalLike: accountStats.reduce((s, a) => s + a.totalLike, 0),
      totalCollect: accountStats.reduce((s, a) => s + a.totalCollect, 0),
      totalComment: accountStats.reduce((s, a) => s + a.totalComment, 0),
      topicsByStatus: matrixTopicsByStatus,
    };

    return { accounts: accountStats, totals: matrixTotals, period };
  }),

  rankings: protectedProcedure
    .input(z.object({ period: dashboardPeriodSchema, accountIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const since = getPeriodStart(input.period);

      const allNotes = await fetchAllNotesWithScores(since, input.accountIds);
      const sorted = [...allNotes].sort((a, b) => b.score - a.score);
      const top5 = sorted.slice(0, 5);

      // By type: count + top 3
      const typeMap = new Map<string, NoteWithScore[]>();
      for (const n of allNotes) {
        if (!typeMap.has(n.topicType)) typeMap.set(n.topicType, []);
        typeMap.get(n.topicType)!.push(n);
      }
      const byType = Array.from(typeMap.entries()).map(([type, items]) => ({
        type,
        count: items.length,
        top3: [...items].sort((a, b) => b.score - a.score).slice(0, 3),
      })).sort((a, b) => b.count - a.count);

      // By type + teacher
      const typeTeacherMap = new Map<string, Map<string, number>>();
      for (const n of allNotes) {
        const key = n.topicType;
        if (!typeTeacherMap.has(key)) typeTeacherMap.set(key, new Map());
        const tMap = typeTeacherMap.get(key)!;
        tMap.set(n.creatorName, (tMap.get(n.creatorName) || 0) + 1);
      }
      const byTypeTeacher = Array.from(typeTeacherMap.entries()).map(([type, teacherMap]) => ({
        type,
        teachers: Array.from(teacherMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      })).sort((a, b) => a.type.localeCompare(b.type));

      // By teacher: top 3
      const teacherMap = new Map<string, NoteWithScore[]>();
      for (const n of allNotes) {
        if (!teacherMap.has(n.creatorName)) teacherMap.set(n.creatorName, []);
        teacherMap.get(n.creatorName)!.push(n);
      }
      const byTeacher = Array.from(teacherMap.entries()).map(([name, items]) => ({
        name,
        count: items.length,
        top3: [...items].sort((a, b) => b.score - a.score).slice(0, 3),
      })).sort((a, b) => b.count - a.count);

      return { top5, byType, byTypeTeacher, byTeacher };
    }),
});
