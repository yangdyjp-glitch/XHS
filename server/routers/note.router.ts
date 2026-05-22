import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { protectedProcedure, leaderProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { notes, topics, accounts, metricSnapshots } from "../../drizzle/schema.js";

export const noteRouter = router({
  listByTopic: protectedProcedure
    .input(z.object({ topicId: z.number() }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(notes)
        .where(eq(notes.topicId, input.topicId))
        .orderBy(desc(notes.publishedAt));
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

    if (ctx.user.role === "teacher") {
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

    return db
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
  }),

  create: protectedProcedure
    .input(
      z.object({
        topicId: z.number(),
        finalTitle: z.string().min(1),
        xhsNoteUrl: z.string().url(),
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

      const [note] = await db
        .insert(notes)
        .values({
          topicId: input.topicId,
          accountId: topic.accountId,
          finalTitle: input.finalTitle,
          xhsNoteUrl: input.xhsNoteUrl,
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
        xhsNoteUrl: z.string().url().optional(),
        status: z.enum(["live", "hidden", "deleted"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      await db.update(notes).set(updates).where(eq(notes.id, id));
      return { success: true };
    }),

  listWithMetrics: leaderProcedure
    .input(z.object({ accountId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const conditions = [eq(notes.status, "live")];
      if (input?.accountId) {
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
