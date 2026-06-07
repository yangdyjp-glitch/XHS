import { z } from "zod";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, leaderProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import {
  reviews,
  notes,
  topics,
  accounts,
  metricSnapshots,
  aiAnalysisResults,
  calendarEvents,
  rejectedRecommendations,
} from "../../drizzle/schema.js";
import {
  analyzePerformance,
  generateRecommendations,
  regenerateOneRecommendation,
  type ReviewInputData,
  type RejectedRec,
} from "../services/ai.service.js";

// 读取被否决的推荐（用于注入 prompt 排除 + 前端过滤）
async function getRejected(): Promise<RejectedRec[]> {
  const rows = await db
    .select({ title: rejectedRecommendations.title, topicType: rejectedRecommendations.topicType, keywords: rejectedRecommendations.keywords })
    .from(rejectedRecommendations)
    .orderBy(desc(rejectedRecommendations.createdAt))
    .limit(200);
  return rows.map((r) => ({ title: r.title, topicType: r.topicType, keywords: r.keywords as string[] | null }));
}

async function aggregateData(periodStart: string, periodEnd: string, accountId?: number): Promise<ReviewInputData> {
  const accountConditions = accountId ? [eq(accounts.id, accountId)] : [];
  const accts = await db
    .select({ id: accounts.id, name: accounts.accountName, layer: accounts.layer })
    .from(accounts)
    .where(accountConditions.length > 0 ? and(...accountConditions) : undefined);

  const noteConditions = [
    gte(notes.publishedAt, new Date(periodStart)),
    lte(notes.publishedAt, new Date(periodEnd + "T23:59:59Z")),
  ];
  if (accountId) noteConditions.push(eq(notes.accountId, accountId));

  const noteRows = await db
    .select({
      id: notes.id,
      finalTitle: notes.finalTitle,
      accountId: notes.accountId,
      accountName: accounts.accountName,
      topicType: topics.topicType,
      keywords: topics.keywords,
      publishedAt: notes.publishedAt,
    })
    .from(notes)
    .leftJoin(topics, eq(notes.topicId, topics.id))
    .leftJoin(accounts, eq(notes.accountId, accounts.id))
    .where(and(...noteConditions))
    .orderBy(desc(notes.publishedAt));

  const noteIds = noteRows.map((n) => n.id);
  let allMetrics: any[] = [];
  if (noteIds.length > 0) {
    allMetrics = await db
      .select()
      .from(metricSnapshots)
      .where(sql`${metricSnapshots.noteId} IN (${sql.join(noteIds.map(id => sql`${id}`), sql`, `)})`);
  }

  const notesWithMetrics = noteRows.map((n) => ({
    id: n.id,
    title: n.finalTitle,
    accountName: n.accountName || "",
    topicType: n.topicType || "",
    keywords: (n.keywords as string[]) || [],
    publishedAt: new Date(n.publishedAt).toISOString().split("T")[0],
    metrics: allMetrics
      .filter((m) => m.noteId === n.id)
      .map((m) => ({
        day: m.daysSincePublish,
        impression: m.impression,
        view: m.view,
        likeCount: m.likeCount,
        collect: m.collect,
        commentCount: m.commentCount,
        shareCount: m.shareCount || 0,
      })),
  }));

  const bestMetrics = notesWithMetrics.map((n) =>
    n.metrics.length > 0 ? n.metrics[n.metrics.length - 1] : null
  );

  const totals = {
    noteCount: notesWithMetrics.length,
    totalImpression: bestMetrics.reduce((s, m) => s + (m?.impression || 0), 0),
    totalView: bestMetrics.reduce((s, m) => s + (m?.view || 0), 0),
    totalLike: bestMetrics.reduce((s, m) => s + (m?.likeCount || 0), 0),
    totalCollect: bestMetrics.reduce((s, m) => s + (m?.collect || 0), 0),
    totalComment: bestMetrics.reduce((s, m) => s + (m?.commentCount || 0), 0),
    totalShare: bestMetrics.reduce((s, m) => s + (m?.shareCount || 0), 0),
  };

  return {
    period: { start: periodStart, end: periodEnd },
    accounts: accts,
    notes: notesWithMetrics,
    totals,
  };
}

function getWeekRange(weeksAgo: number = 0) {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday - weeksAgo * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
  };
}

function getMonthRange(monthsAgo: number = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

export const reviewRouter = router({
  list: protectedProcedure
    .input(z.object({ type: z.enum(["weekly", "monthly"]).optional(), limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.type) conditions.push(eq(reviews.reviewType, input.type));
      return db
        .select()
        .from(reviews)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(reviews.createdAt))
        .limit(input?.limit || 20);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [review] = await db.select().from(reviews).where(eq(reviews.id, input.id)).limit(1);
      if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "报告不存在" });

      const analyses = await db
        .select()
        .from(aiAnalysisResults)
        .where(eq(aiAnalysisResults.reviewId, review.id))
        .orderBy(desc(aiAnalysisResults.createdAt));

      return { ...review, analyses };
    }),

  generate: protectedProcedure
    .input(
      z.object({
        type: z.enum(["weekly", "monthly"]),
        periodStart: z.string().optional(),
        periodEnd: z.string().optional(),
        accountId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      let periodStart: string, periodEnd: string;

      if (input.periodStart && input.periodEnd) {
        periodStart = input.periodStart;
        periodEnd = input.periodEnd;
      } else if (input.type === "weekly") {
        const range = getWeekRange(1);
        periodStart = range.start;
        periodEnd = range.end;
      } else {
        const range = getMonthRange(1);
        periodStart = range.start;
        periodEnd = range.end;
      }

      const data = await aggregateData(periodStart, periodEnd, input.accountId);

      const scope = input.accountId ? "account" : "matrix";

      const [review] = await db
        .insert(reviews)
        .values({
          reviewType: input.type,
          scope,
          accountId: input.accountId || null,
          periodStart,
          periodEnd,
          summaryJson: data.totals,
          highlights: `发布${data.totals.noteCount}篇笔记，总曝光${data.totals.totalImpression}，总阅读${data.totals.totalView}`,
        })
        .returning();

      return { review, data };
    }),

  preview: protectedProcedure
    .input(
      z.object({
        type: z.enum(["weekly", "monthly"]),
        periodStart: z.string().optional(),
        periodEnd: z.string().optional(),
        accountId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      let periodStart: string, periodEnd: string;

      if (input.periodStart && input.periodEnd) {
        periodStart = input.periodStart;
        periodEnd = input.periodEnd;
      } else if (input.type === "weekly") {
        const range = getWeekRange(1);
        periodStart = range.start;
        periodEnd = range.end;
      } else {
        const range = getMonthRange(1);
        periodStart = range.start;
        periodEnd = range.end;
      }

      return aggregateData(periodStart, periodEnd, input.accountId);
    }),

  aiAnalyze: protectedProcedure
    .input(z.object({ reviewId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [review] = await db.select().from(reviews).where(eq(reviews.id, input.reviewId)).limit(1);
      if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "报告不存在" });

      const data = await aggregateData(review.periodStart, review.periodEnd, review.accountId || undefined);

      if (data.notes.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该周期内没有发布笔记，无法分析" });
      }

      const { result, tokensUsed, prompt } = await analyzePerformance(data);

      const [analysis] = await db
        .insert(aiAnalysisResults)
        .values({
          reviewId: review.id,
          analysisType: "retrospective",
          scope: review.scope,
          accountId: review.accountId,
          periodStart: review.periodStart,
          periodEnd: review.periodEnd,
          promptUsed: prompt,
          inputDataJson: data,
          resultJson: result,
          resultText: result.summary,
          modelUsed: "claude-sonnet-4-20250514",
          tokensUsed,
          createdBy: ctx.user.id,
        })
        .returning();

      return { analysis, result };
    }),

  aiRecommend: protectedProcedure
    .input(z.object({ reviewId: z.number().optional(), periodStart: z.string().optional(), periodEnd: z.string().optional(), accountId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      let data: ReviewInputData;
      let reviewId = input.reviewId || null;
      let analysisResult;

      if (reviewId) {
        const [review] = await db.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
        if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "报告不存在" });
        data = await aggregateData(review.periodStart, review.periodEnd, review.accountId || undefined);

        const [latestAnalysis] = await db
          .select()
          .from(aiAnalysisResults)
          .where(and(eq(aiAnalysisResults.reviewId, reviewId), eq(aiAnalysisResults.analysisType, "retrospective")))
          .orderBy(desc(aiAnalysisResults.createdAt))
          .limit(1);
        if (latestAnalysis) analysisResult = latestAnalysis.resultJson as any;
      } else {
        const range = getWeekRange(1);
        data = await aggregateData(input.periodStart || range.start, input.periodEnd || range.end, input.accountId);
      }

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const future = new Date(now);
      future.setDate(now.getDate() + 60);
      const futureStr = future.toISOString().split("T")[0];
      const upcomingEvents = await db
        .select({ title: calendarEvents.title, eventDate: calendarEvents.eventDate, category: calendarEvents.category })
        .from(calendarEvents)
        .where(and(gte(calendarEvents.eventDate, today), lte(calendarEvents.eventDate, futureStr)))
        .orderBy(asc(calendarEvents.eventDate));

      const rejected = await getRejected();
      const { result, tokensUsed, prompt } = await generateRecommendations(data, analysisResult, upcomingEvents, rejected);

      const [analysis] = await db
        .insert(aiAnalysisResults)
        .values({
          reviewId: reviewId,
          analysisType: "recommendation",
          scope: input.accountId ? "account" : "matrix",
          accountId: input.accountId || null,
          periodStart: data.period.start,
          periodEnd: data.period.end,
          promptUsed: prompt,
          inputDataJson: data,
          resultJson: result,
          resultText: result.strategy,
          modelUsed: "claude-sonnet-4-20250514",
          tokensUsed,
          createdBy: ctx.user.id,
        })
        .returning();

      return { analysis, result };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [review] = await db.select().from(reviews).where(eq(reviews.id, input.id)).limit(1);
      if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "报告不存在" });

      await db.delete(aiAnalysisResults).where(eq(aiAnalysisResults.reviewId, input.id));
      await db.delete(reviews).where(eq(reviews.id, input.id));
      return { success: true };
    }),

  listRecommendations: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return db
        .select()
        .from(aiAnalysisResults)
        .where(eq(aiAnalysisResults.analysisType, "recommendation"))
        .orderBy(desc(aiAnalysisResults.createdAt))
        .limit(input?.limit || 10);
    }),

  // 被否决推荐标题列表（前端用于过滤展示）
  listRejectedTitles: protectedProcedure.query(async () => {
    const rows = await db
      .select({ title: rejectedRecommendations.title })
      .from(rejectedRecommendations);
    return rows.map((r) => r.title);
  }),

  // 持久化推荐列表（刷新后写回，避免切换页面丢失）
  updateRecommendationResult: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        recommendations: z.array(
          z.object({
            title: z.string(),
            topicType: z.string(),
            keywords: z.array(z.string()),
            reason: z.string(),
            priority: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const [row] = await db
        .select()
        .from(aiAnalysisResults)
        .where(eq(aiAnalysisResults.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "推荐结果不存在" });
      const existing = (row.resultJson as any) || {};
      const updated = { ...existing, recommendations: input.recommendations };
      await db
        .update(aiAnalysisResults)
        .set({ resultJson: updated })
        .where(eq(aiAnalysisResults.id, input.id));
      return { success: true };
    }),

  // 否决一条推荐：记录后 AI 不再生成类似推荐
  rejectRecommendation: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        topicType: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        reason: z.string().optional(),
        accountId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.insert(rejectedRecommendations).values({
        title: input.title,
        topicType: input.topicType || null,
        keywords: input.keywords || [],
        reason: input.reason || null,
        accountId: input.accountId || null,
        createdBy: ctx.user.id,
      });
      return { success: true };
    }),

  // 刷新一条推荐：重新生成一个类似但不同的替代推荐
  refreshRecommendation: protectedProcedure
    .input(
      z.object({
        seed: z.object({
          title: z.string(),
          topicType: z.string(),
          keywords: z.array(z.string()),
          reason: z.string(),
          priority: z.string().optional(),
        }),
        avoidTitles: z.array(z.string()).optional(),
        reviewId: z.number().optional(),
        periodStart: z.string().optional(),
        periodEnd: z.string().optional(),
        accountId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      let data: ReviewInputData;
      if (input.reviewId) {
        const [review] = await db.select().from(reviews).where(eq(reviews.id, input.reviewId)).limit(1);
        if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "报告不存在" });
        data = await aggregateData(review.periodStart, review.periodEnd, review.accountId || undefined);
      } else {
        const range = getWeekRange(1);
        data = await aggregateData(input.periodStart || range.start, input.periodEnd || range.end, input.accountId);
      }

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const future = new Date(now);
      future.setDate(now.getDate() + 60);
      const futureStr = future.toISOString().split("T")[0];
      const upcomingEvents = await db
        .select({ title: calendarEvents.title, eventDate: calendarEvents.eventDate, category: calendarEvents.category })
        .from(calendarEvents)
        .where(and(gte(calendarEvents.eventDate, today), lte(calendarEvents.eventDate, futureStr)))
        .orderBy(asc(calendarEvents.eventDate));

      const rejected = await getRejected();
      const { recommendation } = await regenerateOneRecommendation(
        data,
        { ...input.seed, priority: input.seed.priority || "normal" },
        upcomingEvents,
        rejected,
        input.avoidTitles
      );
      return { recommendation };
    }),
});
