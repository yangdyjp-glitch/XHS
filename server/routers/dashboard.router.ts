import { z } from "zod";
import { eq, and, gte, desc, sql, isNotNull, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { accounts, users, notes, metricSnapshots } from "../../drizzle/schema.js";

interface NoteWithScore {
  noteId: number;
  title: string;
  accountId: number;
  accountName: string;
  creatorName: string;
  creatorId: number;
  publishedAt: string;
  impression: number;
  view: number;
  likeCount: number;
  collect: number;
  commentCount: number;
  shareCount: number;
  coverClickRate: number | null;
  xhsNoteUrl: string;
  score: number;
}

const dashboardPeriodSchema = z.enum(["7", "14", "30", "all"]);
type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;

function computeScore(m: { impression: number; view: number; likeCount: number; collect: number; commentCount: number; shareCount: number | null }) {
  return m.impression + m.view * 2 + m.likeCount * 3 + m.collect * 4 + m.commentCount * 5 + (m.shareCount ?? 0) * 3;
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
  const conditions = [eq(notes.status, "live"), isNotNull(notes.publishedAt), eq(accounts.status, "active")];
  if (since) conditions.push(gte(notes.publishedAt, since));
  if (accountIds && accountIds.length > 0) conditions.push(inArray(notes.accountId, accountIds));

  const noteRows = await db
    .select({
      id: notes.id,
      finalTitle: notes.finalTitle,
      accountId: notes.accountId,
      accountName: accounts.accountName,
      creatorName: users.name,
      creatorId: notes.registeredBy,
      publishedAt: notes.publishedAt,
      xhsNoteUrl: notes.xhsNoteUrl,
    })
    .from(notes)
    .leftJoin(accounts, eq(notes.accountId, accounts.id))
    .leftJoin(users, eq(notes.registeredBy, users.id))
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
      creatorName: n.creatorName || "",
      creatorId: n.creatorId || 0,
      publishedAt: new Date(n.publishedAt!).toISOString().split("T")[0],
      impression: best?.impression || 0,
      view: best?.view || 0,
      likeCount: best?.likeCount || 0,
      collect: best?.collect || 0,
      commentCount: best?.commentCount || 0,
      shareCount: best?.shareCount || 0,
      coverClickRate: best?.coverClickRate ?? null,
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

      return {
        ...acct,
        weekPublished: periodPublished,
        periodPublished,
        periodTarget: target,
        recentNoteCount: acctPeriodNotes.length,
        totalImpression, totalView, totalLike, totalCollect, totalComment,
        topicsByStatus: {},
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
      topicsByStatus: {},
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

      // By uploader: top 3
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

      return { top5, byTeacher };
    }),
});
