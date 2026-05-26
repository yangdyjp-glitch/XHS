import { z } from "zod";
import { eq } from "drizzle-orm";
import { publicProcedure, protectedProcedure, leaderProcedure, router } from "../_core/trpc.js";
import {
  hashPassword,
  verifyPassword,
  createToken,
  setTokenCookie,
  clearTokenCookie,
} from "../_core/auth.js";
import { db } from "../db.js";
import { users } from "../../drizzle/schema.js";

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (!user || !user.isActive) {
        throw new Error("邮箱或密码错误");
      }

      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid) {
        throw new Error("邮箱或密码错误");
      }

      await db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id));

      const token = await createToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      setTokenCookie(ctx.res, token);

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    clearTokenCookie(ctx.res);
    return { success: true };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.user;
  }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      const valid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new Error("当前密码错误");
      }

      const newHash = await hashPassword(input.newPassword);
      await db
        .update(users)
        .set({
          passwordHash: newHash,
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id));

      return { success: true };
    }),

  createUser: leaderProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().min(1),
        role: z.enum(["teacher", "leader", "observer"]),
        initialPassword: z.string().min(6),
        mainDirections: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("该邮箱已被注册");
      }

      const passwordHash = await hashPassword(input.initialPassword);
      const [newUser] = await db
        .insert(users)
        .values({
          email: input.email,
          name: input.name,
          role: input.role,
          passwordHash,
          mainDirections: input.mainDirections || [],
          mustChangePassword: true,
        })
        .returning();

      return {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      };
    }),

  listUsers: protectedProcedure.query(async () => {
    return db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        mainDirections: users.mainDirections,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.createdAt);
  }),

  updateUser: leaderProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        role: z.enum(["teacher", "leader", "observer"]).optional(),
        mainDirections: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, id));
      return { success: true };
    }),

  deleteUser: leaderProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async () => {
      throw new Error("为保护数据安全，不支持删除用户。请改为禁用该用户。");
    }),

  resetPassword: leaderProcedure
    .input(
      z.object({
        userId: z.number(),
        newPassword: z.string().min(6),
      })
    )
    .mutation(async ({ input }) => {
      const passwordHash = await hashPassword(input.newPassword);
      await db
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.userId));
      return { success: true };
    }),
});
