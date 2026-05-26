import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, leaderProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { accounts, users } from "../../drizzle/schema.js";

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
      .where(eq(accounts.ownerId, ctx.user.id))
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
    .mutation(async () => {
      throw new Error("为保护数据安全，不支持删除账号。请改为归档该账号。");
    }),
});
