import { z } from "zod";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { metricSnapshots, notes, accounts } from "../../drizzle/schema.js";
import { SNAPSHOT_DAYS } from "../../shared/enums.js";
import { toShanghaiDateKey } from "../../shared/xhsSync.js";

export const metricRouter = router({
  pendingFetches: protectedProcedure.query(async ({ ctx }) => {
    const conditions = [];

    if (ctx.user.role === "teacher" || ctx.user.role === "editor") {
      const ownAccounts = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.ownerId, ctx.user.id), eq(accounts.status, "active")));
      const ids = ownAccounts.map((a) => a.id);
      if (ids.length > 0) {
        conditions.push(inArray(notes.accountId, ids));
      } else {
        return [];
      }
    }

    conditions.push(eq(notes.status, "live"));
    conditions.push(isNotNull(notes.publishedAt));
    conditions.push(eq(accounts.status, "active"));

    const allNotes = await db
      .select({
        id: notes.id,
        xhsNoteUrl: notes.xhsNoteUrl,
        publishedAt: notes.publishedAt,
        finalTitle: notes.finalTitle,
        accountName: accounts.accountName,
      })
      .from(notes)
      .leftJoin(accounts, eq(notes.accountId, accounts.id))
      .where(and(...conditions));

    const allSnapshots = await db
      .select({
        noteId: metricSnapshots.noteId,
        daysSincePublish: metricSnapshots.daysSincePublish,
      })
      .from(metricSnapshots);

    const snapshotSet = new Set(
      allSnapshots.map((s) => `${s.noteId}_${s.daysSincePublish}`)
    );

    const now = new Date();
    const pending: {
      noteId: number;
      xhsNoteUrl: string;
      publishedAt: string;
      finalTitle: string;
      accountName: string | null;
      missingDays: number[];
    }[] = [];

    for (const note of allNotes) {
      if (!note.publishedAt) continue;
      const daysSince = Math.floor(
        (now.getTime() - new Date(note.publishedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      const missing = (SNAPSHOT_DAYS as readonly number[]).filter(
        (d) => daysSince >= d && !snapshotSet.has(`${note.id}_${d}`)
      );
      if (missing.length > 0) {
        pending.push({
          noteId: note.id,
          xhsNoteUrl: note.xhsNoteUrl,
          publishedAt: new Date(note.publishedAt).toISOString(),
          finalTitle: note.finalTitle,
          accountName: note.accountName,
          missingDays: missing as number[],
        });
      }
    }

    return pending;
  }),

  listByNote: protectedProcedure
    .input(z.object({ noteId: z.number() }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(metricSnapshots)
        .where(eq(metricSnapshots.noteId, input.noteId))
        .orderBy(metricSnapshots.daysSincePublish);
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        noteId: z.number(),
        daysSincePublish: z.number().refine((v) => (SNAPSHOT_DAYS as readonly number[]).includes(v)),
        impression: z.number().min(0),
        view: z.number().min(0),
        likeCount: z.number().min(0),
        collect: z.number().min(0),
        commentCount: z.number().min(0),
        shareCount: z.number().min(0),
        coverClickRate: z.number().min(0).max(100).nullable().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [note] = await db
        .select({ publishedAt: notes.publishedAt, accountId: notes.accountId, accountStatus: accounts.status })
        .from(notes)
        .leftJoin(accounts, eq(notes.accountId, accounts.id))
        .where(eq(notes.id, input.noteId))
        .limit(1);
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "笔记不存在" });
      if (note.accountStatus !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "该账号已暂停或归档" });
      if (!note.publishedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "帖子尚未同步真实发布时间" });
      if (ctx.user.role !== "leader") {
        const owned = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.id, note.accountId), eq(accounts.ownerId, ctx.user.id), eq(accounts.status, "active")))
          .limit(1);
        if (owned.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "无权录入该账号的数据" });
      }

      const snapshotDate = new Date(new Date(note.publishedAt).getTime() + input.daysSincePublish * 86_400_000);
      const dateStr = toShanghaiDateKey(snapshotDate);

      const data = {
        noteId: input.noteId,
        daysSincePublish: input.daysSincePublish,
        impression: input.impression,
        view: input.view,
        likeCount: input.likeCount,
        collect: input.collect,
        commentCount: input.commentCount,
        shareCount: input.shareCount,
        coverClickRate: input.coverClickRate ?? null,
        notes: input.notes ?? null,
        snapshotDate: dateStr,
        recordedBy: ctx.user.id,
      };

      // 先查后写：不依赖数据库唯一约束（避免「ON CONFLICT 无匹配约束」导致保存直接失败）。
      const existing = await db
        .select({ id: metricSnapshots.id })
        .from(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.noteId, input.noteId),
            eq(metricSnapshots.daysSincePublish, input.daysSincePublish)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(metricSnapshots)
          .set(data)
          .where(eq(metricSnapshots.id, existing[0].id));
        return { id: existing[0].id, updated: true };
      }

      const [result] = await db
        .insert(metricSnapshots)
        .values(data)
        .returning({ id: metricSnapshots.id });

      return { id: result.id, updated: false };
    }),
});
