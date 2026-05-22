import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, leaderProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { accounts, users } from "../../drizzle/schema.js";

export const accountRouter = router({
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
      try {
        await db.delete(accounts).where(eq(accounts.id, input.id));
        return { success: true };
      } catch (e: any) {
        if (e.cause?.code === "23503") {
          throw new Error("该账号有关联数据（选题/笔记等），请先删除关联数据或改为归档");
        }
        throw e;
      }
    }),
});
