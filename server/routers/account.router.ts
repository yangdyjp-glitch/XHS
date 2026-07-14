import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { protectedProcedure, leaderProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { accounts, users, topics, notes } from "../../drizzle/schema.js";

export const accountRouter = router({
  // Returns accounts owned by the current user (for teacher account selection)
  listByOwner: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: accounts.id,
        accountName: accounts.accountName,
        mainColor: accounts.mainColor,
        weeklyTarget: accounts.weeklyTarget,
        status: accounts.status,
      })
      .from(accounts)
      .where(and(eq(accounts.ownerId, ctx.user.id), eq(accounts.status, "active")))
      .orderBy(accounts.createdAt);
  }),

  // Business selectors only expose active accounts. Paused/archived accounts remain in `list` for administration.
  listActive: protectedProcedure.query(async ({ ctx }) => {
    const conditions = [eq(accounts.status, "active")];
    if (ctx.user.role !== "leader") conditions.push(eq(accounts.ownerId, ctx.user.id));
    return db
      .select({
        id: accounts.id,
        accountName: accounts.accountName,
        ownerId: accounts.ownerId,
        ownerName: users.name,
        layer: accounts.layer,
        mainColor: accounts.mainColor,
        xhsAccountUrl: accounts.xhsAccountUrl,
        weeklyTarget: accounts.weeklyTarget,
        status: accounts.status,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .leftJoin(users, eq(accounts.ownerId, users.id))
      .where(and(...conditions))
      .orderBy(accounts.createdAt);
  }),

  list: protectedProcedure.query(async () => {
    return db
      .select({
        id: accounts.id,
        accountName: accounts.accountName,
        ownerId: accounts.ownerId,
        ownerName: users.name,
        layer: accounts.layer,
        mainColor: accounts.mainColor,
        xhsAccountUrl: accounts.xhsAccountUrl,
        weeklyTarget: accounts.weeklyTarget,
        status: accounts.status,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .leftJoin(users, eq(accounts.ownerId, users.id))
      .orderBy(accounts.createdAt);
  }),

  create: leaderProcedure
    .input(
      z.object({
        accountName: z.string().min(1),
        ownerId: z.number(),
        layer: z.enum(["upstream", "midstream", "closer"]),
        mainColor: z.string().optional(),
        xhsAccountUrl: z.string().optional(),
        weeklyTarget: z.number().min(1).default(3),
      })
    )
    .mutation(async ({ input }) => {
      const [account] = await db.insert(accounts).values(input).returning();
      return account;
    }),

  update: leaderProcedure
    .input(
      z.object({
        id: z.number(),
        accountName: z.string().min(1).optional(),
        ownerId: z.number().optional(),
        layer: z.enum(["upstream", "midstream", "closer"]).optional(),
        mainColor: z.string().optional(),
        xhsAccountUrl: z.string().optional(),
        weeklyTarget: z.number().min(1).optional(),
        status: z.enum(["active", "paused", "archived"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      await db
        .update(accounts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(accounts.id, id));
      return { success: true };
    }),

  delete: leaderProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const relatedTopics = await db.select({ id: topics.id }).from(topics).where(eq(topics.accountId, input.id));
      if (relatedTopics.length > 0) {
        throw new Error(`该账号有 ${relatedTopics.length} 个关联选题，请先删除关联选题`);
      }
      const relatedNotes = await db.select({ id: notes.id }).from(notes).where(eq(notes.accountId, input.id));
      if (relatedNotes.length > 0) {
        throw new Error(`该账号有 ${relatedNotes.length} 篇关联笔记，请先删除关联笔记`);
      }

      try {
        await db.delete(accounts).where(eq(accounts.id, input.id));
        return { success: true };
      } catch (e: any) {
        const code = e.code || e.cause?.code;
        if (code === "23503" || e.message?.includes("foreign key") || e.message?.includes("violates")) {
          throw new Error("该账号有关联数据，无法删除");
        }
        throw e;
      }
    }),
});
