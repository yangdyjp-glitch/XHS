import { z } from "zod";
import { eq, and, or, ilike, inArray, desc, isNull, isNotNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, leaderProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { topics, accounts, users, notes, metricSnapshots, comments } from "../../drizzle/schema.js";
import { PRESET_TOPIC_TYPES } from "../../shared/enums.js";

export const topicRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        accountId: z.number().optional(),
        accountIds: z.array(z.number()).optional(),
        status: z.string().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];

      // Feature 1: Exclude soft-deleted topics
      conditions.push(isNull(topics.deletedAt));

      if (ctx.user.role === "teacher" || ctx.user.role === "editor") {
        const ownAccounts = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.ownerId, ctx.user.id));
        const ownIds = ownAccounts.map((a) => a.id);
        if (ownIds.length > 0) {
          conditions.push(inArray(topics.accountId, ownIds));
        } else {
          return [];
        }
      }

      if (input?.accountId) conditions.push(eq(topics.accountId, input.accountId));
      if (input?.accountIds && input.accountIds.length > 0) conditions.push(inArray(topics.accountId, input.accountIds));
      if (input?.status) conditions.push(eq(topics.status, input.status));
      if (input?.search) {
        const pattern = `%${input.search}%`;
        conditions.push(
          or(
            ilike(topics.title, pattern),
            ilike(topics.topicType, pattern),
            sql`array_to_string(${topics.keywords}, ',') ILIKE ${pattern}`
          )!
        );
      }

      return db
        .select({
          id: topics.id,
          title: topics.title,
          accountId: topics.accountId,
          accountName: accounts.accountName,
          accountColor: accounts.mainColor,
          creatorId: topics.creatorId,
          creatorName: users.name,
          topicType: topics.topicType,
          keywords: topics.keywords,
          status: topics.status,
          plannedPublishDate: topics.plannedPublishDate,
          priority: topics.priority,
          createdAt: topics.createdAt,
          updatedAt: topics.updatedAt,
        })
        .from(topics)
        .leftJoin(accounts, eq(topics.accountId, accounts.id))
        .leftJoin(users, eq(topics.creatorId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(topics.updatedAt));
    }),

  // Feature 1: List soft-deleted topics (trash)
  listDeleted: protectedProcedure.query(async ({ ctx }) => {
    const conditions = [isNotNull(topics.deletedAt)];

    if (ctx.user.role === "teacher" || ctx.user.role === "editor") {
      const ownAccounts = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.ownerId, ctx.user.id));
      const ownIds = ownAccounts.map((a) => a.id);
      if (ownIds.length > 0) {
        conditions.push(inArray(topics.accountId, ownIds));
      } else {
        return [];
      }
    }

    return db
      .select({
        id: topics.id,
        title: topics.title,
        accountName: accounts.accountName,
        accountColor: accounts.mainColor,
        creatorName: users.name,
        topicType: topics.topicType,
        status: topics.status,
        deletedAt: topics.deletedAt,
        createdAt: topics.createdAt,
      })
      .from(topics)
      .leftJoin(accounts, eq(topics.accountId, accounts.id))
      .leftJoin(users, eq(topics.creatorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(topics.deletedAt));
  }),

  // Feature 1: Restore from trash
  restore: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [topic] = await db.select().from(topics).where(eq(topics.id, input.id)).limit(1);
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "选题不存在" });
      if (!topic.deletedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "该选题未在回收箱中" });

      if (ctx.user.role !== "leader" && topic.creatorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "没有权限恢复" });
      }

      await db.update(topics).set({ deletedAt: null, updatedAt: new Date() }).where(eq(topics.id, input.id));
      return { success: true };
    }),

  // Feature 1: Permanent delete (leader only)
  permanentDelete: leaderProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [topic] = await db.select().from(topics).where(eq(topics.id, input.id)).limit(1);
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "选题不存在" });

      const relatedNotes = await db.select({ id: notes.id }).from(notes).where(eq(notes.topicId, input.id));
      if (relatedNotes.length > 0) {
        const noteIds = relatedNotes.map((n) => n.id);
        await db.delete(metricSnapshots).where(inArray(metricSnapshots.noteId, noteIds));
        await db.delete(notes).where(eq(notes.topicId, input.id));
      }
      await db.delete(comments).where(eq(comments.topicId, input.id));
      await db.delete(topics).where(eq(topics.id, input.id));
      return { success: true };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [topic] = await db
        .select({
          id: topics.id,
          title: topics.title,
          accountId: topics.accountId,
          accountName: accounts.accountName,
          accountColor: accounts.mainColor,
          creatorId: topics.creatorId,
          creatorName: users.name,
          topicType: topics.topicType,
          keywords: topics.keywords,
          status: topics.status,
          plannedPublishDate: topics.plannedPublishDate,
          priority: topics.priority,
          deletedAt: topics.deletedAt,
          createdAt: topics.createdAt,
          updatedAt: topics.updatedAt,
        })
        .from(topics)
        .leftJoin(accounts, eq(topics.accountId, accounts.id))
        .leftJoin(users, eq(topics.creatorId, users.id))
        .where(eq(topics.id, input.id))
        .limit(1);

      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "选题不存在" });
      return topic;
    }),

  // 老师创建选题，绑定选定的账号
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1, "标题不能为空"),
        plannedPublishDate: z.string().min(1, "计划发布时间不能为空"),
        topicType: z.string().min(1, "类型不能为空"),
        keywords: z.array(z.string()).optional(),
        priority: z.string().optional(),
        accountId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let accountId = input.accountId;

      if (!accountId) {
        const [account] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.ownerId, ctx.user.id))
          .limit(1);

        if (!account) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "你还没有关联的账号，请联系管理员" });
        }
        accountId = account.id;
      } else {
        const [account] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.id, accountId), eq(accounts.ownerId, ctx.user.id)))
          .limit(1);

        if (!account) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "无权操作此账号" });
        }
      }

      const [topic] = await db
        .insert(topics)
        .values({
          title: input.title,
          accountId,
          creatorId: ctx.user.id,
          topicType: input.topicType,
          keywords: input.keywords || [],
          plannedPublishDate: input.plannedPublishDate,
          priority: input.priority || "normal",
          status: ctx.user.role === "editor" ? "writing" : "pending_review",
        })
        .returning();

      return topic;
    }),

  // Feature 5: Leaders and editors can edit title of "writing" topics (no re-approval needed)
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        topicType: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        plannedPublishDate: z.string().nullable().optional(),
        priority: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [topic] = await db.select().from(topics).where(eq(topics.id, id)).limit(1);
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "选题不存在" });

      // Leaders can always edit
      if (ctx.user.role === "leader") {
        await db.update(topics).set({ ...updates, updatedAt: new Date() }).where(eq(topics.id, id));
        return { success: true };
      }

      // Editors can edit title of "writing" topics even if not creator
      if (ctx.user.role === "editor" && topic.status === "writing" && input.title && Object.keys(updates).length === 1) {
        await db.update(topics).set({ title: input.title, updatedAt: new Date() }).where(eq(topics.id, id));
        return { success: true };
      }

      // Teachers/editors can edit their own topics
      if ((ctx.user.role === "teacher" || ctx.user.role === "editor") && topic.creatorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能编辑自己创建的选题" });
      }

      if (
        (topic.status === "pending_review" || topic.status === "writing") &&
        updates.plannedPublishDate !== undefined &&
        !updates.plannedPublishDate
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "待审批/写作中的选题必须填写计划发布时间" });
      }

      await db.update(topics).set({ ...updates, updatedAt: new Date() }).where(eq(topics.id, id));
      return { success: true };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      newStatus: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [topic] = await db.select().from(topics).where(eq(topics.id, input.id)).limit(1);
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "选题不存在" });

      const rules: Record<string, { to: string; by: string }[]> = {
        pending_review: [
          { to: "approved", by: "leader" },
        ],
        approved: [{ to: "writing", by: "teacher" }],
        writing: [{ to: "published", by: "teacher" }],
      };

      const allowed = rules[topic.status];
      if (!allowed) throw new TRPCError({ code: "BAD_REQUEST", message: "当前状态不可变更" });

      const rule = allowed.find((r) => r.to === input.newStatus);
      if (!rule) throw new TRPCError({ code: "BAD_REQUEST", message: `不能变更为"${input.newStatus}"` });

      if (rule.by === "leader" && ctx.user.role !== "leader") {
        throw new TRPCError({ code: "FORBIDDEN", message: "此操作需要负责人执行" });
      }
      if (rule.by === "teacher" && topic.creatorId !== ctx.user.id && ctx.user.role !== "leader" && ctx.user.role !== "editor") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能操作自己的选题" });
      }

      await db.update(topics).set({ status: input.newStatus, updatedAt: new Date() }).where(eq(topics.id, input.id));
      return { success: true };
    }),

  // Feature 1: Soft delete instead of hard delete
  publish: protectedProcedure
    .input(
      z.object({
        topicId: z.number(),
        xhsNoteUrl: z.string().min(1, "请填写笔记链接"),
        coverImage: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [topic] = await db.select().from(topics).where(eq(topics.id, input.topicId)).limit(1);
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "选题不存在" });
      if (topic.status === "published") {
        return { success: true };
      }
      if (topic.status !== "writing") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "只有写作中的选题才能发布" });
      }
      if (topic.creatorId !== ctx.user.id && ctx.user.role !== "leader") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能发布自己的选题" });
      }

      const existing = await db.select({ id: notes.id }).from(notes).where(eq(notes.topicId, topic.id)).limit(1);
      if (existing.length > 0) {
        // Note already exists — update with publish info (cover image, URL)
        await db.update(notes).set({
          xhsNoteUrl: input.xhsNoteUrl,
          coverImage: input.coverImage || null,
          publishedAt: new Date(),
        }).where(eq(notes.topicId, topic.id));
      } else {
        await db.insert(notes).values({
          topicId: topic.id,
          accountId: topic.accountId,
          finalTitle: topic.title,
          xhsNoteUrl: input.xhsNoteUrl,
          coverImage: input.coverImage || null,
          publishedAt: new Date(),
        });
      }

      await db
        .update(topics)
        .set({ status: "published", updatedAt: new Date() })
        .where(eq(topics.id, input.topicId));

      return { success: true };
    }),

  // Republish: overwrite existing note with new info
  republish: protectedProcedure
    .input(
      z.object({
        topicId: z.number(),
        xhsNoteUrl: z.string().min(1, "请填写笔记链接"),
        coverImage: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [topic] = await db.select().from(topics).where(eq(topics.id, input.topicId)).limit(1);
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "选题不存在" });
      if (topic.status !== "published") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "只有已发布的选题才能重新上传" });
      }
      if (topic.creatorId !== ctx.user.id && ctx.user.role !== "leader") {
        throw new TRPCError({ code: "FORBIDDEN", message: "没有权限操作" });
      }

      const existing = await db.select({ id: notes.id }).from(notes).where(eq(notes.topicId, topic.id)).limit(1);
      if (existing.length > 0) {
        // Overwrite existing note; only update coverImage if a new one was provided
        const updateData: Record<string, any> = {
          finalTitle: topic.title,
          xhsNoteUrl: input.xhsNoteUrl,
          publishedAt: new Date(),
        };
        if (input.coverImage !== undefined) {
          updateData.coverImage = input.coverImage || null;
        }
        await db.update(notes).set(updateData).where(eq(notes.topicId, topic.id));
      } else {
        // Create if somehow missing
        await db.insert(notes).values({
          topicId: topic.id,
          accountId: topic.accountId,
          finalTitle: topic.title,
          xhsNoteUrl: input.xhsNoteUrl,
          coverImage: input.coverImage || null,
          publishedAt: new Date(),
        });
      }

      await db.update(topics).set({ updatedAt: new Date() }).where(eq(topics.id, input.topicId));
      return { success: true };
    }),

  // Feature 1: Soft delete
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [topic] = await db.select().from(topics).where(eq(topics.id, input.id)).limit(1);
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "选题不存在" });

      if (ctx.user.role !== "leader" && topic.creatorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "没有权限删除" });
      }

      // Soft delete: set deletedAt timestamp
      await db
        .update(topics)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(topics.id, input.id));

      return { success: true };
    }),

  listTypes: protectedProcedure.query(async () => {
    const result = await db
      .selectDistinct({ topicType: topics.topicType })
      .from(topics)
      .where(isNull(topics.deletedAt))
      .orderBy(topics.topicType);
    return result.map((r) => r.topicType);
  }),

  listTypesWithCount: leaderProcedure.query(async () => {
    const dbResult = await db
      .select({
        topicType: topics.topicType,
        count: sql<number>`count(*)::int`,
      })
      .from(topics)
      .where(isNull(topics.deletedAt))
      .groupBy(topics.topicType)
      .orderBy(topics.topicType);

    const dbMap = new Map(dbResult.map((r) => [r.topicType, r.count]));

    for (const preset of PRESET_TOPIC_TYPES) {
      if (!dbMap.has(preset)) {
        dbMap.set(preset, 0);
      }
    }

    return Array.from(dbMap.entries())
      .map(([topicType, count]) => ({ topicType, count }))
      .sort((a, b) => a.topicType.localeCompare(b.topicType, "zh-CN"));
  }),

  renameType: leaderProcedure
    .input(z.object({ oldType: z.string().min(1), newType: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const affected = await db
        .update(topics)
        .set({ topicType: input.newType, updatedAt: new Date() })
        .where(eq(topics.topicType, input.oldType))
        .returning({ id: topics.id });
      return { success: true, updatedCount: affected.length };
    }),

  deleteType: leaderProcedure
    .input(z.object({ topicType: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const affected = await db
        .update(topics)
        .set({ topicType: "未分类", updatedAt: new Date() })
        .where(eq(topics.topicType, input.topicType))
        .returning({ id: topics.id });
      return { success: true, updatedCount: affected.length };
    }),
});
