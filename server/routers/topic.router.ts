import { z } from "zod";
import { eq, and, or, ilike, inArray, desc, sql } from "drizzle-orm";
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
        status: z.string().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const conditions = [];

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
          creatorId: topics.creatorId,
          creatorName: users.name,
          topicType: topics.topicType,
          keywords: topics.keywords,
          status: topics.status,
          plannedPublishDate: topics.plannedPublishDate,
          priority: topics.priority,
          rejectReason: topics.rejectReason,
          createdAt: topics.createdAt,
          updatedAt: topics.updatedAt,
        })
        .from(topics)
        .leftJoin(accounts, eq(topics.accountId, accounts.id))
        .leftJoin(users, eq(topics.creatorId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(topics.updatedAt));
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
          creatorId: topics.creatorId,
          creatorName: users.name,
          topicType: topics.topicType,
          keywords: topics.keywords,
          status: topics.status,
          plannedPublishDate: topics.plannedPublishDate,
          priority: topics.priority,
          rejectReason: topics.rejectReason,
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
        // Fallback: find first owned account
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
        // Verify the teacher owns this account
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

      if ((ctx.user.role === "teacher" || ctx.user.role === "editor") && topic.creatorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能编辑自己创建的选题" });
      }

      await db.update(topics).set({ ...updates, updatedAt: new Date() }).where(eq(topics.id, id));
      return { success: true };
    }),

  // 状态流转
  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), newStatus: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [topic] = await db.select().from(topics).where(eq(topics.id, input.id)).limit(1);
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "选题不存在" });

      const rules: Record<string, { to: string; by: string }[]> = {
        pending_review: [{ to: "approved", by: "leader" }],
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

      await db
        .update(topics)
        .set({ status: input.newStatus, updatedAt: new Date() })
        .where(eq(topics.id, input.id));

      return { success: true };
    }),

  // 发布：老师填写头图+链接，创建笔记记录并将状态改为已发布
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

      // Prevent duplicate notes
      const existing = await db.select({ id: notes.id }).from(notes).where(eq(notes.topicId, topic.id)).limit(1);
      if (existing.length === 0) {
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

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [topic] = await db.select().from(topics).where(eq(topics.id, input.id)).limit(1);
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "选题不存在" });

      if (ctx.user.role !== "leader" && topic.creatorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "没有权限删除" });
      }

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

  // 获取所有已有的选题类型（供下拉选择）
  listTypes: protectedProcedure.query(async () => {
    const result = await db
      .selectDistinct({ topicType: topics.topicType })
      .from(topics)
      .orderBy(topics.topicType);
    return result.map((r) => r.topicType);
  }),

  // 获取类型及其选题数量（含预设类型）
  listTypesWithCount: leaderProcedure.query(async () => {
    const dbResult = await db
      .select({
        topicType: topics.topicType,
        count: sql<number>`count(*)::int`,
      })
      .from(topics)
      .groupBy(topics.topicType)
      .orderBy(topics.topicType);

    const dbMap = new Map(dbResult.map((r) => [r.topicType, r.count]));

    // Merge preset types (show with count 0 if unused)
    for (const preset of PRESET_TOPIC_TYPES) {
      if (!dbMap.has(preset)) {
        dbMap.set(preset, 0);
      }
    }

    return Array.from(dbMap.entries())
      .map(([topicType, count]) => ({ topicType, count }))
      .sort((a, b) => a.topicType.localeCompare(b.topicType, "zh-CN"));
  }),

  // 重命名类型（也可用于合并：将A重命名为已有的B）
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

  // 删除类型：将该类型的所有选题改为"未分类"
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
