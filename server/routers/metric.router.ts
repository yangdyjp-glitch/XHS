import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { metricSnapshots, notes } from "../../drizzle/schema.js";
import { SNAPSHOT_DAYS } from "../../shared/enums.js";

export const metricRouter = router({
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
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [note] = await db
        .select({ publishedAt: notes.publishedAt })
        .from(notes)
        .where(eq(notes.id, input.noteId))
        .limit(1);
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "笔记不存在" });

      const snapshotDate = new Date(note.publishedAt);
      snapshotDate.setDate(snapshotDate.getDate() + input.daysSincePublish);
      const dateStr = snapshotDate.toISOString().split("T")[0];

      const data = {
        noteId: input.noteId,
        daysSincePublish: input.daysSincePublish,
        impression: input.impression,
        view: input.view,
        likeCount: input.likeCount,
        collect: input.collect,
        commentCount: input.commentCount,
        shareCount: input.shareCount,
        notes: input.notes ?? null,
        snapshotDate: dateStr,
        recordedBy: ctx.user.id,
      };

      // 仅用于「已保存/已更新」文案提示（非关键，可容忍并发下的轻微偏差）
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

      // 原子 upsert：依赖唯一约束 uq_note_snapshot(note_id, days_since_publish)。
      // 取代「先查后插」，避免并发保存时撞唯一约束报错、或两次写入互相覆盖。
      const [result] = await db
        .insert(metricSnapshots)
        .values(data)
        .onConflictDoUpdate({
          target: [metricSnapshots.noteId, metricSnapshots.daysSincePublish],
          set: {
            impression: data.impression,
            view: data.view,
            likeCount: data.likeCount,
            collect: data.collect,
            commentCount: data.commentCount,
            shareCount: data.shareCount,
            notes: data.notes,
            snapshotDate: data.snapshotDate,
            recordedBy: data.recordedBy,
          },
        })
        .returning({ id: metricSnapshots.id });

      return { id: result.id, updated: existing.length > 0 };
    }),
});
