import { z } from "zod";
import { eq, and, desc, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, leaderProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { notes, topics, accounts, metricSnapshots } from "../../drizzle/schema.js";
import { SNAPSHOT_DAYS } from "../../shared/enums.js";
import { extractNoteUrl } from "../../shared/url.js";

export const noteRouter = router({
  listByTopic: protectedProcedure
    .input(z.object({ topicId: z.number() }))
    .query(async ({ input }) => {
      const noteList = await db
        .select()
        .from(notes)
        .where(eq(notes.topicId, input.topicId))
        .orderBy(desc(notes.publishedAt));

      if (noteList.length === 0) return [];

      const noteIds = noteList.map((n) => n.id);
      const allMetrics = await db
        .select()
        .from(metricSnapshots)
        .where(inArray(metricSnapshots.noteId, noteIds))
        .orderBy(desc(metricSnapshots.daysSincePublish));

      return noteList.map((n) => {
        const metrics = allMetrics.filter((m) => m.noteId === n.id);
        const latest = metrics[0] || null;
        return { ...n, metrics, latestMetric: latest };
      });
    }),

  listByAccount: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ input }) => {
      return db
        .select({
          id: notes.id,
          topicId: notes.topicId,
          topicTitle: topics.title,
          accountId: notes.accountId,
          finalTitle: notes.finalTitle,
          xhsNoteUrl: notes.xhsNoteUrl,
          publishedAt: notes.publishedAt,
          status: notes.status,
          createdAt: notes.createdAt,
        })
        .from(notes)
        .leftJoin(topics, eq(notes.topicId, topics.id))
        .where(eq(notes.accountId, input.accountId))
        .orderBy(desc(notes.publishedAt));
    }),

  listForDataEntry: protectedProcedure.query(async ({ ctx }) => {
    const conditions = [];

    if (ctx.user.role === "teacher" || ctx.user.role === "editor") {
      const ownAccounts = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.ownerId, ctx.user.id));
      const ids = ownAccounts.map((a) => a.id);
      if (ids.length > 0) {
        conditions.push(inArray(notes.accountId, ids));
      } else {
        return [];
      }
    }

    conditions.push(eq(notes.status, "live"));
    conditions.push(isNull(topics.deletedAt)); // 排除选题已被删进回收箱的孤儿笔记

    const noteList = await db
      .select({
        id: notes.id,
        topicId: notes.topicId,
        topicTitle: topics.title,
        accountId: notes.accountId,
        accountName: accounts.accountName,
        finalTitle: notes.finalTitle,
        xhsNoteUrl: notes.xhsNoteUrl,
        publishedAt: notes.publishedAt,
        status: notes.status,
      })
      .from(notes)
      .leftJoin(topics, eq(notes.topicId, topics.id))
      .leftJoin(accounts, eq(notes.accountId, accounts.id))
      .where(and(...conditions))
      .orderBy(desc(notes.publishedAt));

    if (noteList.length === 0) return [];

    // 只保留"当前有到期但尚未录入快照"的笔记：
    // 例如 T+1 已录入后，第 2-6 天不再出现；到第 7 天 T+7 到期才重新出现。
    const noteIds = noteList.map((n) => n.id);
    const recorded = await db
      .select({ noteId: metricSnapshots.noteId, daysSincePublish: metricSnapshots.daysSincePublish })
      .from(metricSnapshots)
      .where(inArray(metricSnapshots.noteId, noteIds));

    const recordedMap = new Map<number, Set<number>>();
    for (const r of recorded) {
      const set = recordedMap.get(r.noteId) ?? new Set<number>();
      set.add(r.daysSincePublish);
      recordedMap.set(r.noteId, set);
    }

    const dayMs = 1000 * 60 * 60 * 24;
    const now = Date.now();

    return noteList.filter((n) => {
      const daysSince = Math.floor((now - new Date(n.publishedAt).getTime()) / dayMs);
      const recordedDays = recordedMap.get(n.id) ?? new Set<number>();
      // 存在已到期(daysSince>=d)但尚未录入的快照天 → 仍需录入
      return SNAPSHOT_DAYS.some((d) => daysSince >= d && !recordedDays.has(d));
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        topicId: z.number(),
        finalTitle: z.string().min(1),
        xhsNoteUrl: z.string().min(1, "请填写笔记链接"),
        publishedAt: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const [topic] = await db
        .select({ accountId: topics.accountId })
        .from(topics)
        .where(eq(topics.id, input.topicId))
        .limit(1);
      if (!topic) throw new Error("选题不存在");

      const cleanUrl = extractNoteUrl(input.xhsNoteUrl);
      if (!cleanUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "未能识别有效的笔记链接，请粘贴包含 http(s) 的小红书链接" });
      }

      const [note] = await db
        .insert(notes)
        .values({
          topicId: input.topicId,
          accountId: topic.accountId,
          finalTitle: input.finalTitle,
          xhsNoteUrl: cleanUrl,
          publishedAt: new Date(input.publishedAt),
        })
        .returning();

      return note;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        finalTitle: z.string().min(1).optional(),
        xhsNoteUrl: z.string().min(1).optional(),
        status: z.enum(["live", "hidden", "deleted"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      if (updates.xhsNoteUrl !== undefined) {
        const cleanUrl = extractNoteUrl(updates.xhsNoteUrl);
        if (!cleanUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "未能识别有效的笔记链接，请粘贴包含 http(s) 的小红书链接" });
        }
        updates.xhsNoteUrl = cleanUrl;
      }
      await db.update(notes).set(updates).where(eq(notes.id, id));
      return { success: true };
    }),

  // 删除一篇关联笔记（硬删除，含其指标快照）。每个选题至少保留一篇。
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [note] = await db
        .select({ id: notes.id, topicId: notes.topicId })
        .from(notes)
        .where(eq(notes.id, input.id))
        .limit(1);
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "笔记不存在" });

      // 权限：仅负责人或选题创建者可删除
      const [topic] = await db
        .select({ creatorId: topics.creatorId })
        .from(topics)
        .where(eq(topics.id, note.topicId))
        .limit(1);
      if (topic && ctx.user.role !== "leader" && topic.creatorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "没有权限删除该笔记" });
      }

      // 至少保留一篇：少于等于一篇时不允许删除
      const siblings = await db.select({ id: notes.id }).from(notes).where(eq(notes.topicId, note.topicId));
      if (siblings.length <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "每个选题至少保留一篇关联笔记" });
      }

      await db.delete(metricSnapshots).where(eq(metricSnapshots.noteId, input.id));
      await db.delete(notes).where(eq(notes.id, input.id));
      return { success: true };
    }),

  listWithMetrics: leaderProcedure
    .input(z.object({ accountId: z.number().optional(), accountIds: z.array(z.number()).optional() }).optional())
    .query(async ({ input }) => {
      const conditions = [eq(notes.status, "live"), isNull(topics.deletedAt)];
      if (input?.accountIds && input.accountIds.length > 0) {
        conditions.push(inArray(notes.accountId, input.accountIds));
      } else if (input?.accountId) {
        conditions.push(eq(notes.accountId, input.accountId));
      }

      const notesList = await db
        .select({
          id: notes.id,
          finalTitle: notes.finalTitle,
          xhsNoteUrl: notes.xhsNoteUrl,
          publishedAt: notes.publishedAt,
          accountId: notes.accountId,
          accountName: accounts.accountName,
          accountColor: accounts.mainColor,
        })
        .from(notes)
        .leftJoin(accounts, eq(notes.accountId, accounts.id))
        .leftJoin(topics, eq(notes.topicId, topics.id))
        .where(and(...conditions))
        .orderBy(desc(notes.publishedAt));

      const noteIds = notesList.map((n) => n.id);
      if (noteIds.length === 0) return [];

      const metrics = await db
        .select()
        .from(metricSnapshots)
        .where(inArray(metricSnapshots.noteId, noteIds));

      const metricsMap = new Map<number, typeof metrics>();
      for (const m of metrics) {
        const arr = metricsMap.get(m.noteId) || [];
        arr.push(m);
        metricsMap.set(m.noteId, arr);
      }

      return notesList.map((n) => ({
        ...n,
        metrics: (metricsMap.get(n.id) || []).sort((a, b) => a.daysSincePublish - b.daysSincePublish),
      }));
    }),
});
