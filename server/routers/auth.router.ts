import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { publicProcedure, protectedProcedure, leaderProcedure, router } from "../_core/trpc.js";
import {
  hashPassword,
  verifyPassword,
  createToken,
  setTokenCookie,
  clearTokenCookie,
} from "../_core/auth.js";
import { db } from "../db.js";
import { users, accounts, topics, comments, calendarEvents, metricSnapshots, aiAnalysisResults, notifications, impersonationLogs } from "../../drizzle/schema.js";

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (!user || !user.isActive) {
        throw new Error("用户名或密码错误");
      }

      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid) {
        throw new Error("用户名或密码错误");
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
    return {
      ...ctx.user,
      // 代理登录期间不强制目标用户的“改密”流程（负责人只是代为操作，不应被引导改他人密码）
      mustChangePassword: ctx.impersonator ? false : ctx.user.mustChangePassword,
      // 向前端暴露代理信息：非空即表示当前处于“负责人代理登录”状态
      impersonator: ctx.impersonator ?? null,
    };
  }),

  // ============ 负责人代理登录：可审计的“登录为该用户” ============
  // 仅负责人可发起。换发一张“目标用户”的会话令牌（额外携带 impersonatorId，
  // 以便前端显示横幅、并支持一键返回），同时写入审计日志。
  // 不读取、不修改、不影响任何账户的密码，原密码照常可用。
  impersonate: leaderProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.impersonator) {
        throw new Error("请先退出当前代理登录，再切换到其他用户");
      }
      if (input.userId === ctx.user.id) {
        throw new Error("无需登录自己的账户");
      }

      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!target || !target.isActive) {
        throw new Error("目标用户不存在或已停用");
      }

      // 审计：谁(actorId) 登录了 谁(targetUserId) 何时(createdAt)
      await db.insert(impersonationLogs).values({
        actorId: ctx.user.id,
        targetUserId: target.id,
        action: "start",
      });

      const token = await createToken({
        userId: target.id,
        email: target.email,
        role: target.role,
        impersonatorId: ctx.user.id,
      });
      setTokenCookie(ctx.res, token);

      return {
        id: target.id,
        name: target.name,
        email: target.email,
        role: target.role,
      };
    }),

  // 退出代理登录，恢复负责人本人的会话
  stopImpersonating: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.impersonator) {
      throw new Error("当前不处于代理登录状态");
    }

    const [leader] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.impersonator.id))
      .limit(1);
    if (!leader || !leader.isActive) {
      throw new Error("原负责人账户不可用，请重新登录");
    }

    await db.insert(impersonationLogs).values({
      actorId: leader.id,
      targetUserId: ctx.user.id,
      action: "stop",
    });

    // 以负责人“当前”角色换发令牌：若其间被降权，则不会再以负责人身份返回
    const token = await createToken({
      userId: leader.id,
      email: leader.email,
      role: leader.role,
    });
    setTokenCookie(ctx.res, token);

    return {
      id: leader.id,
      name: leader.name,
      email: leader.email,
      role: leader.role,
    };
  }),

  // 代理登录审计日志（仅负责人可查看）
  listImpersonationLogs: leaderProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ input }) => {
      const actor = alias(users, "actor");
      const target = alias(users, "target");
      return db
        .select({
          id: impersonationLogs.id,
          action: impersonationLogs.action,
          createdAt: impersonationLogs.createdAt,
          actorId: impersonationLogs.actorId,
          actorName: actor.name,
          targetUserId: impersonationLogs.targetUserId,
          targetName: target.name,
        })
        .from(impersonationLogs)
        .leftJoin(actor, eq(impersonationLogs.actorId, actor.id))
        .leftJoin(target, eq(impersonationLogs.targetUserId, target.id))
        .orderBy(desc(impersonationLogs.createdAt))
        .limit(input?.limit ?? 100);
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
        email: z.string().min(1),
        name: z.string().min(1),
        role: z.enum(["teacher", "editor", "leader"]),
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
        throw new Error("该用户名已被注册");
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
        email: z.string().min(1).optional(),
        role: z.enum(["teacher", "editor", "leader"]).optional(),
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
    .mutation(async ({ input }) => {
      // Pre-check: identify ALL blocking references
      const checks: { label: string; count: number }[] = [];

      const ownedAccounts = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.ownerId, input.id));
      if (ownedAccounts.length > 0) checks.push({ label: "关联账号", count: ownedAccounts.length });

      const createdTopics = await db.select({ id: topics.id }).from(topics).where(eq(topics.creatorId, input.id));
      if (createdTopics.length > 0) checks.push({ label: "关联选题", count: createdTopics.length });

      const userComments = await db.select({ id: comments.id }).from(comments).where(eq(comments.authorId, input.id));
      if (userComments.length > 0) checks.push({ label: "条评论", count: userComments.length });

      const userEvents = await db.select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.createdBy, input.id));
      if (userEvents.length > 0) checks.push({ label: "个日历事件", count: userEvents.length });

      const userMetrics = await db.select({ id: metricSnapshots.id }).from(metricSnapshots).where(eq(metricSnapshots.recordedBy, input.id));
      if (userMetrics.length > 0) checks.push({ label: "条数据快照", count: userMetrics.length });

      const userAnalyses = await db.select({ id: aiAnalysisResults.id }).from(aiAnalysisResults).where(eq(aiAnalysisResults.createdBy, input.id));
      if (userAnalyses.length > 0) checks.push({ label: "条AI分析记录", count: userAnalyses.length });

      const userNotifs = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.userId, input.id));
      if (userNotifs.length > 0) checks.push({ label: "条通知", count: userNotifs.length });

      if (checks.length > 0) {
        const detail = checks.map((c) => `${c.count} ${c.label}`).join("、");
        throw new Error(`该用户有 ${detail}，无法直接删除，请先处理关联数据`);
      }

      try {
        await db.delete(users).where(eq(users.id, input.id));
        return { success: true };
      } catch (e: any) {
        const code = e.code || e.cause?.code;
        if (code === "23503" || e.message?.includes("foreign key") || e.message?.includes("violates")) {
          throw new Error("该用户有关联数据，无法删除");
        }
        throw e;
      }
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
