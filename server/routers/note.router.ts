import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { leaderProcedure, protectedProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { accounts, metricSnapshots, notes, topics, users } from "../../drizzle/schema.js";
import { SNAPSHOT_DAYS } from "../../shared/enums.js";
import { extractNoteUrl, extractXhsNoteId, isSupportedXhsNoteUrl } from "../../shared/url.js";
import { toShanghaiDateKey } from "../../shared/xhsSync.js";

type CurrentUser = { id: number; role: string };

async function assertAccountAccess(user: CurrentUser, accountId: number) {
  const conditions = [eq(accounts.id, accountId), eq(accounts.status, "active")];
  if (user.role !== "leader") conditions.push(eq(accounts.ownerId, user.id));
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(...conditions))
    .limit(1);
  if (!account) throw new TRPCError({ code: "FORBIDDEN", message: "无权操作该账号" });
}

async function getAccessibleAccountIds(user: CurrentUser): Promise<number[]> {
  if (user.role === "leader") {
    return (await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.status, "active")))
      .map((account) => account.id);
  }
  return (await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.ownerId, user.id), eq(accounts.status, "active"))))
    .map((account) => account.id);
}

async function assertNoteAccess(user: CurrentUser, noteId: number) {
  const [note] = await db
    .select({ id: notes.id, accountId: notes.accountId, registeredBy: notes.registeredBy })
    .from(notes)
    .where(eq(notes.id, noteId))
    .limit(1);
  if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "帖子不存在" });
  if (user.role !== "leader") await assertAccountAccess(user, note.accountId);
  return note;
}

function snapshotDate(publishedAt: Date, day: number) {
  return toShanghaiDateKey(new Date(publishedAt.getTime() + day * 86_400_000));
}

const snapshotInput = z.object({
  daysSincePublish: z.number().refine((day) => (SNAPSHOT_DAYS as readonly number[]).includes(day)),
  impression: z.number().min(0),
  view: z.number().min(0),
  likeCount: z.number().min(0),
  collect: z.number().min(0),
  commentCount: z.number().min(0),
  shareCount: z.number().min(0),
  coverClickRate: z.number().min(0).max(100).nullable().optional(),
});

export const noteRouter = router({
  registerLinks: protectedProcedure
    .input(z.object({ accountId: z.number(), urls: z.array(z.string().min(1)).min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      await assertAccountAccess(ctx.user, input.accountId);
      const seen = new Set<string>();
      const results: Array<{
        raw: string;
        status: "created" | "existing" | "invalid";
        noteId?: number;
        message?: string;
      }> = [];

      for (const raw of input.urls) {
        const cleanUrl = extractNoteUrl(raw);
        const externalNoteId = extractXhsNoteId(cleanUrl);
        if (!cleanUrl || !externalNoteId || !isSupportedXhsNoteUrl(cleanUrl)) {
          results.push({ raw, status: "invalid", message: "不是支持的小红书完整笔记链接" });
          continue;
        }
        if (seen.has(externalNoteId)) continue;
        seen.add(externalNoteId);

        const [existing] = await db
          .select({ id: notes.id, accountId: notes.accountId })
          .from(notes)
          .where(eq(notes.externalNoteId, externalNoteId))
          .limit(1);
        if (existing) {
          results.push({
            raw,
            status: "existing",
            noteId: existing.id,
            message: existing.accountId === input.accountId ? "该帖子已经登记" : "该帖子已登记在其他账号下",
          });
          continue;
        }

        const [created] = await db
          .insert(notes)
          .values({
            topicId: null,
            accountId: input.accountId,
            finalTitle: "待同步",
            xhsNoteUrl: cleanUrl,
            externalNoteId,
            publishedAt: null,
            registeredBy: ctx.user.id,
            syncStatus: "pending",
          })
          .returning({ id: notes.id });
        results.push({ raw, status: "created", noteId: created.id });
      }

      return {
        results,
        createdCount: results.filter((result) => result.status === "created").length,
      };
    }),

  listManaged: protectedProcedure
    .input(z.object({ accountId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const accessibleIds = await getAccessibleAccountIds(ctx.user);
      if (accessibleIds.length === 0) return [];
      if (input?.accountId && !accessibleIds.includes(input.accountId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权查看该账号" });
      }
      const ids = input?.accountId ? [input.accountId] : accessibleIds;
      const noteRows = await db
        .select({
          id: notes.id,
          accountId: notes.accountId,
          accountName: accounts.accountName,
          accountColor: accounts.mainColor,
          finalTitle: notes.finalTitle,
          xhsNoteUrl: notes.xhsNoteUrl,
          externalNoteId: notes.externalNoteId,
          coverImage: notes.coverImage,
          publishedAt: notes.publishedAt,
          syncStatus: notes.syncStatus,
          syncError: notes.syncError,
          lastSyncedAt: notes.lastSyncedAt,
          status: notes.status,
          registeredBy: notes.registeredBy,
          registeredByName: users.name,
          createdAt: notes.createdAt,
        })
        .from(notes)
        .leftJoin(accounts, eq(notes.accountId, accounts.id))
        .leftJoin(users, eq(notes.registeredBy, users.id))
        .where(inArray(notes.accountId, ids))
        .orderBy(desc(notes.publishedAt), desc(notes.createdAt));

      if (noteRows.length === 0) return [];
      const allMetrics = await db
        .select()
        .from(metricSnapshots)
        .where(inArray(metricSnapshots.noteId, noteRows.map((note) => note.id)));

      return noteRows.map((note) => {
        const metrics = allMetrics
          .filter((metric) => metric.noteId === note.id)
          .sort((a, b) => a.daysSincePublish - b.daysSincePublish);
        return { ...note, metrics, latestMetric: metrics.at(-1) ?? null };
      });
    }),

  syncQueue: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertAccountAccess(ctx.user, input.accountId);
      const noteRows = await db
        .select({
          id: notes.id,
          xhsNoteUrl: notes.xhsNoteUrl,
          externalNoteId: notes.externalNoteId,
          finalTitle: notes.finalTitle,
          coverImage: notes.coverImage,
          publishedAt: notes.publishedAt,
          syncStatus: notes.syncStatus,
        })
        .from(notes)
        .leftJoin(topics, eq(notes.topicId, topics.id))
        .where(and(
          eq(notes.accountId, input.accountId),
          eq(notes.status, "live"),
          or(isNull(notes.topicId), isNull(topics.deletedAt)),
        ));
      if (noteRows.length === 0) return [];

      const recorded = await db
        .select({ noteId: metricSnapshots.noteId, day: metricSnapshots.daysSincePublish })
        .from(metricSnapshots)
        .where(inArray(metricSnapshots.noteId, noteRows.map((note) => note.id)));
      const recordedByNote = new Map<number, number[]>();
      for (const item of recorded) {
        const days = recordedByNote.get(item.noteId) ?? [];
        days.push(item.day);
        recordedByNote.set(item.noteId, days);
      }

      const now = Date.now();
      return noteRows
        .map((note) => {
          const existingDays = recordedByNote.get(note.id) ?? [];
          const age = note.publishedAt
            ? Math.floor((now - new Date(note.publishedAt).getTime()) / 86_400_000)
            : -1;
          const missingDays = (SNAPSHOT_DAYS as readonly number[]).filter(
            (day) => age >= day && !existingDays.includes(day),
          );
          return {
            ...note,
            existingDays,
            missingDays,
            needsMetadata: !note.publishedAt || note.syncStatus !== "synced" || !note.coverImage,
          };
        })
        .filter((note) => note.needsMetadata || note.missingDays.length > 0);
    }),

  applySync: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().trim().min(1).max(200),
      publishedAt: z.string().datetime(),
      coverImage: z.string().url().optional(),
      snapshots: z.array(snapshotInput).max(SNAPSHOT_DAYS.length),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertNoteAccess(ctx.user, input.id);
      const publishedAt = new Date(input.publishedAt);
      if (Number.isNaN(publishedAt.getTime()) || publishedAt.getTime() > Date.now() + 10 * 60_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "小红书返回的真实发布时间无效" });
      }

      const update: Record<string, unknown> = {
        finalTitle: input.title.trim(),
        publishedAt,
        syncStatus: "synced",
        syncError: null,
        lastSyncedAt: new Date(),
      };
      if (input.coverImage) update.coverImage = input.coverImage;
      await db.update(notes).set(update).where(eq(notes.id, input.id));

      for (const snapshot of input.snapshots) {
        const data = {
          noteId: input.id,
          snapshotDate: snapshotDate(publishedAt, snapshot.daysSincePublish),
          daysSincePublish: snapshot.daysSincePublish,
          impression: snapshot.impression,
          view: snapshot.view,
          likeCount: snapshot.likeCount,
          collect: snapshot.collect,
          commentCount: snapshot.commentCount,
          shareCount: snapshot.shareCount,
          coverClickRate: snapshot.coverClickRate ?? null,
          recordedBy: ctx.user.id,
          notes: "auto-fetch via platform",
        };
        const [existing] = await db
          .select({ id: metricSnapshots.id })
          .from(metricSnapshots)
          .where(and(
            eq(metricSnapshots.noteId, input.id),
            eq(metricSnapshots.daysSincePublish, snapshot.daysSincePublish),
          ))
          .limit(1);
        if (existing) await db.update(metricSnapshots).set(data).where(eq(metricSnapshots.id, existing.id));
        else await db.insert(metricSnapshots).values(data);
      }

      return { success: true, savedSnapshots: input.snapshots.length };
    }),

  markSyncError: protectedProcedure
    .input(z.object({ id: z.number(), message: z.string().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      await assertNoteAccess(ctx.user, input.id);
      await db
        .update(notes)
        .set({ syncStatus: "failed", syncError: input.message, lastSyncedAt: new Date() })
        .where(eq(notes.id, input.id));
      return { success: true };
    }),

  listByTopic: protectedProcedure
    .input(z.object({ topicId: z.number() }))
    .query(async ({ input }) => {
      const noteList = await db.select().from(notes).where(eq(notes.topicId, input.topicId)).orderBy(desc(notes.publishedAt));
      if (noteList.length === 0) return [];
      const metrics = await db
        .select()
        .from(metricSnapshots)
        .where(inArray(metricSnapshots.noteId, noteList.map((note) => note.id)));
      return noteList.map((note) => {
        const ownMetrics = metrics
          .filter((metric) => metric.noteId === note.id)
          .sort((a, b) => b.daysSincePublish - a.daysSincePublish);
        return { ...note, metrics: ownMetrics, latestMetric: ownMetrics[0] ?? null };
      });
    }),

  listByAccount: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertAccountAccess(ctx.user, input.accountId);
      return db.select().from(notes).where(eq(notes.accountId, input.accountId)).orderBy(desc(notes.publishedAt));
    }),

  listForDataEntry: protectedProcedure.query(async ({ ctx }) => {
    const ids = await getAccessibleAccountIds(ctx.user);
    if (ids.length === 0) return [];
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
      .where(and(
        inArray(notes.accountId, ids),
        eq(notes.status, "live"),
        isNotNull(notes.publishedAt),
        or(isNull(notes.topicId), isNull(topics.deletedAt)),
      ))
      .orderBy(desc(notes.publishedAt));
    if (noteList.length === 0) return [];

    const recorded = await db
      .select({ noteId: metricSnapshots.noteId, day: metricSnapshots.daysSincePublish })
      .from(metricSnapshots)
      .where(inArray(metricSnapshots.noteId, noteList.map((note) => note.id)));
    const recordedMap = new Map<number, Set<number>>();
    for (const item of recorded) {
      const set = recordedMap.get(item.noteId) ?? new Set<number>();
      set.add(item.day);
      recordedMap.set(item.noteId, set);
    }
    const now = Date.now();
    return noteList.filter((note) => {
      if (!note.publishedAt) return false;
      const age = Math.floor((now - new Date(note.publishedAt).getTime()) / 86_400_000);
      const days = recordedMap.get(note.id) ?? new Set<number>();
      return SNAPSHOT_DAYS.some((day) => age >= day && !days.has(day));
    });
  }),

  create: protectedProcedure
    .input(z.object({ topicId: z.number(), finalTitle: z.string().min(1), xhsNoteUrl: z.string().min(1), publishedAt: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [topic] = await db.select({ accountId: topics.accountId }).from(topics).where(eq(topics.id, input.topicId)).limit(1);
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "选题不存在" });
      await assertAccountAccess(ctx.user, topic.accountId);
      const cleanUrl = extractNoteUrl(input.xhsNoteUrl);
      if (!cleanUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "无法识别笔记链接" });
      const [note] = await db.insert(notes).values({
        topicId: input.topicId,
        accountId: topic.accountId,
        finalTitle: input.finalTitle,
        xhsNoteUrl: cleanUrl,
        externalNoteId: extractXhsNoteId(cleanUrl),
        publishedAt: new Date(input.publishedAt),
        registeredBy: ctx.user.id,
        syncStatus: "synced",
      }).returning();
      return note;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      finalTitle: z.string().min(1).optional(),
      xhsNoteUrl: z.string().min(1).optional(),
      status: z.enum(["live", "hidden", "deleted"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertNoteAccess(ctx.user, input.id);
      const { id, ...updates } = input;
      if (updates.xhsNoteUrl) {
        const cleanUrl = extractNoteUrl(updates.xhsNoteUrl);
        if (!cleanUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "无法识别笔记链接" });
        updates.xhsNoteUrl = cleanUrl;
      }
      await db.update(notes).set(updates).where(eq(notes.id, id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertNoteAccess(ctx.user, input.id);
      await db.delete(metricSnapshots).where(eq(metricSnapshots.noteId, input.id));
      await db.delete(notes).where(eq(notes.id, input.id));
      return { success: true };
    }),

  listWithMetrics: leaderProcedure
    .input(z.object({ accountId: z.number().optional(), accountIds: z.array(z.number()).optional() }).optional())
    .query(async ({ input }) => {
      const conditions = [eq(notes.status, "live"), isNotNull(notes.publishedAt), eq(accounts.status, "active")];
      if (input?.accountIds?.length) conditions.push(inArray(notes.accountId, input.accountIds));
      else if (input?.accountId) conditions.push(eq(notes.accountId, input.accountId));
      const noteRows = await db
        .select({
          id: notes.id,
          finalTitle: notes.finalTitle,
          xhsNoteUrl: notes.xhsNoteUrl,
          coverImage: notes.coverImage,
          publishedAt: notes.publishedAt,
          accountId: notes.accountId,
          accountName: accounts.accountName,
          accountColor: accounts.mainColor,
        })
        .from(notes)
        .leftJoin(accounts, eq(notes.accountId, accounts.id))
        .where(and(...conditions))
        .orderBy(desc(notes.publishedAt));
      if (noteRows.length === 0) return [];
      const metrics = await db
        .select()
        .from(metricSnapshots)
        .where(inArray(metricSnapshots.noteId, noteRows.map((note) => note.id)));
      return noteRows.map((note) => ({
        ...note,
        metrics: metrics
          .filter((metric) => metric.noteId === note.id)
          .sort((a, b) => a.daysSincePublish - b.daysSincePublish),
      }));
    }),
});
