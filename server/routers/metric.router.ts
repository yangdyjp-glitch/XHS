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
