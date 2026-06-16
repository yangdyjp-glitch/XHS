import { z } from "zod";
import { eq, and, gte, desc, sql, isNull, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { accounts, users, notes, topics, metricSnapshots } from "../../drizzle/schema.js";

interface NoteWithScore {
  noteId: number;
  title: string;
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

function computeScore(m: { impression: number; view: number; likeCount: number; collect: number; commentCount: number; shareCount: number }) {
  return m.impression + m.view * 2 + m.likeCount * 3 + m.collect * 4 + m.commentCount * 5 + m.shareCount * 3;
}

async function fetchAllNotesWithScores(since?: Date, accountIds?: number[]): Promise<NoteWithScore[]> {
  const conditions = [];
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
  overview: protectedProcedure.query(async () => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

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

    const allNotes = await fetchAllNotesWithScores();
    const recentNotes = allNotes.filter((n) => new Date(n.publishedAt) >= thirtyDaysAgo);
    const thisWeekNotes = allNotes.filter((n) => new Date(n.publishedAt) >= weekStart);

    const topicCounts = await db
      .select({ status: topics.status, count: sql<number>`count(*)::int` })
      .from(topics)
      .where(isNull(topics.deletedAt)) // 排除回收箱中的选题，口径与看板一致
      .groupBy(topics.status);

    const accountStats = accts.map((acct) => {
      const acctWeekNotes = thisWeekNotes.filter((n) => n.accountName === acct.accountName);
      const acctRecentNotes = recentNotes.filter((n) => n.accountName === acct.accountName);

      const totalImpression = acctRecentNotes.reduce((s, n) => s + n.impression, 0);
      const totalView = acctRecentNotes.reduce((s, n) => s + n.view, 0);
      const totalLike = acctRecentNotes.reduce((s, n) => s + n.likeCount, 0);
      const totalCollect = acctRecentNotes.reduce((s, n) => s + n.collect, 0);
      const totalComment = acctRecentNotes.reduce((s, n) => s + n.commentCount, 0);

      const weekPublished = acctWeekNotes.length;
      const target = acct.weeklyTarget || 3;
      let health: "green" | "yellow" | "red" = "green";
      if (weekPublished < target * 0.5) health = "red";
      else if (weekPublished < target) health = "yellow";

      return {
        ...acct,
        weekPublished,
        recentNoteCount: acctRecentNotes.length,
        totalImpression, totalView, totalLike, totalCollect, totalComment,
        health,
      };
    });

    const matrixTotals = {
      totalAccounts: accts.length,
      totalNotesThisWeek: thisWeekNotes.length,
      totalNotesMonth: recentNotes.length,
      totalImpression: accountStats.reduce((s, a) => s + a.totalImpression, 0),
      totalView: accountStats.reduce((s, a) => s + a.totalView, 0),
      totalLike: accountStats.reduce((s, a) => s + a.totalLike, 0),
      totalCollect: accountStats.reduce((s, a) => s + a.totalCollect, 0),
      totalComment: accountStats.reduce((s, a) => s + a.totalComment, 0),
      topicsByStatus: Object.fromEntries(topicCounts.map((t) => [t.status, t.count])),
    };

    return { accounts: accountStats, totals: matrixTotals };
  }),

  rankings: protectedProcedure
    .input(z.object({ period: z.enum(["7", "14", "30", "all"]), accountIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const now = new Date();
      let since: Date | undefined;
      if (input.period !== "all") {
        since = new Date(now);
        since.setDate(now.getDate() - parseInt(input.period));
      }

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
