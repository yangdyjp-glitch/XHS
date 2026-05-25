import { z } from "zod";
import { eq, gte, lte, and, desc, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc.js";
import { db } from "../db.js";
import { calendarEvents } from "../../drizzle/schema.js";

export const EVENT_CATEGORIES = {
  jlpt: "JLPT",
  eju: "EJU",
  undergraduate: "学部升学",
  graduate: "大学院升学",
  master_exam: "修士入试",
  language_school: "语言学校",
  coe: "在留资格",
  english_test: "英语考试",
  other: "其他",
} as const;

const BUILTIN_EVENTS = [
  // ==================== JLPT ====================
  // 2026年7月
  { title: "JLPT 7月考试报名开始", eventDate: "2026-03-15", category: "jlpt" },
  { title: "JLPT 7月考试报名截止", eventDate: "2026-04-15", category: "jlpt" },
  { title: "JLPT 7月考试", eventDate: "2026-07-05", category: "jlpt" },
  { title: "JLPT 7月成绩发布", eventDate: "2026-08-25", category: "jlpt" },
  // 2026年12月
  { title: "JLPT 12月考试报名开始", eventDate: "2026-08-20", category: "jlpt" },
  { title: "JLPT 12月考试报名截止", eventDate: "2026-09-20", category: "jlpt" },
  { title: "JLPT 12月考试", eventDate: "2026-12-06", category: "jlpt" },
  { title: "JLPT 12月成绩发布", eventDate: "2027-01-25", category: "jlpt" },
  // 2027年7月（下一周期）
  { title: "JLPT 2027年7月报名开始", eventDate: "2027-03-15", category: "jlpt" },
  { title: "JLPT 2027年7月报名截止", eventDate: "2027-04-15", category: "jlpt" },

  // ==================== EJU ====================
  // 2026年第1回
  { title: "EJU 第1回考试报名开始", eventDate: "2026-02-16", category: "eju" },
  { title: "EJU 第1回考试报名截止", eventDate: "2026-03-13", category: "eju" },
  { title: "EJU 第1回考试", eventDate: "2026-06-21", category: "eju" },
  { title: "EJU 第1回成绩发布", eventDate: "2026-07-23", category: "eju" },
  // 2026年第2回
  { title: "EJU 第2回考试报名开始", eventDate: "2026-07-06", category: "eju" },
  { title: "EJU 第2回考试报名截止", eventDate: "2026-07-31", category: "eju" },
  { title: "EJU 第2回考试", eventDate: "2026-11-08", category: "eju" },
  { title: "EJU 第2回成绩发布", eventDate: "2026-12-24", category: "eju" },
  // 2027年第1回（下一周期）
  { title: "EJU 2027年第1回报名开始", eventDate: "2027-02-16", category: "eju" },
  { title: "EJU 2027年第1回报名截止", eventDate: "2027-03-13", category: "eju" },

  // ==================== 学部升学 ====================
  // 2026年度
  { title: "学部生 4月入学出愿截止（多数校）", eventDate: "2025-11-30", category: "undergraduate" },
  { title: "学部生 4月入学合格发表", eventDate: "2026-02-15", category: "undergraduate" },
  { title: "学部生 10月入学出愿截止（多数校）", eventDate: "2026-05-31", category: "undergraduate" },
  { title: "学部生 10月入学合格发表", eventDate: "2026-08-15", category: "undergraduate" },
  // 2027年4月入学（下一周期）
  { title: "学部生 2027年4月入学出愿截止（多数校）", eventDate: "2026-11-30", category: "undergraduate" },
  { title: "学部生 2027年4月入学合格发表", eventDate: "2027-02-15", category: "undergraduate" },

  // ==================== 大学院研究生 ====================
  // 2026年度
  { title: "研究生 4月入学 海外申请截止", eventDate: "2025-10-31", category: "graduate" },
  { title: "研究生 4月入学 日本国内申请截止", eventDate: "2025-12-15", category: "graduate" },
  { title: "研究生 4月入学 合格发表", eventDate: "2026-01-31", category: "graduate" },
  { title: "研究生 10月入学 海外申请截止", eventDate: "2026-04-30", category: "graduate" },
  { title: "研究生 10月入学 日本国内申请截止", eventDate: "2026-06-15", category: "graduate" },
  { title: "研究生 10月入学 合格发表", eventDate: "2026-07-31", category: "graduate" },
  // 2027年4月入学（下一周期）
  { title: "研究生 2027年4月入学 海外申请截止", eventDate: "2026-10-31", category: "graduate" },
  { title: "研究生 2027年4月入学 日本国内申请截止", eventDate: "2026-12-15", category: "graduate" },
  { title: "研究生 2027年4月入学 合格发表", eventDate: "2027-01-31", category: "graduate" },

  // ==================== 修士入试 ====================
  // 夏季入试（国公立为主）
  { title: "修士 夏季入试出愿开始（多数国公立）", eventDate: "2026-06-01", category: "master_exam" },
  { title: "修士 夏季入试出愿截止（多数国公立）", eventDate: "2026-07-15", category: "master_exam" },
  { title: "修士 夏季入试（多数国公立）", eventDate: "2026-08-20", category: "master_exam" },
  { title: "修士 夏季入试合格发表", eventDate: "2026-09-10", category: "master_exam" },
  // 秋季入试（私立为主）
  { title: "修士 秋季入试出愿开始（私立为主）", eventDate: "2026-09-01", category: "master_exam" },
  { title: "修士 秋季入试出愿截止（私立为主）", eventDate: "2026-10-15", category: "master_exam" },
  { title: "修士 秋季入试（私立为主）", eventDate: "2026-11-15", category: "master_exam" },
  { title: "修士 秋季入试合格发表", eventDate: "2026-12-15", category: "master_exam" },
  // 冬季入试（2026年4月入学）
  { title: "修士 冬季入试出愿开始", eventDate: "2025-11-15", category: "master_exam" },
  { title: "修士 冬季入试出愿截止", eventDate: "2025-12-20", category: "master_exam" },
  { title: "修士 冬季入试", eventDate: "2026-01-25", category: "master_exam" },
  { title: "修士 冬季入试合格发表", eventDate: "2026-02-20", category: "master_exam" },
  // 冬季入试（2027年4月入学）
  { title: "修士 冬季入试出愿开始（2027年4月入学）", eventDate: "2026-11-15", category: "master_exam" },
  { title: "修士 冬季入试出愿截止（2027年4月入学）", eventDate: "2026-12-20", category: "master_exam" },
  { title: "修士 冬季入试（2027年4月入学）", eventDate: "2027-01-25", category: "master_exam" },
  { title: "修士 冬季入试合格发表（2027年4月入学）", eventDate: "2027-02-20", category: "master_exam" },

  // ==================== 语言学校 ====================
  // 4月生（2026）
  { title: "语言学校 4月生材料截止", eventDate: "2025-11-15", category: "language_school" },
  { title: "语言学校 4月生COE下发", eventDate: "2026-02-25", category: "language_school" },
  { title: "语言学校 4月生入学", eventDate: "2026-04-01", category: "language_school" },
  // 7月生
  { title: "语言学校 7月生材料截止", eventDate: "2026-03-15", category: "language_school" },
  { title: "语言学校 7月生COE下发", eventDate: "2026-05-25", category: "language_school" },
  { title: "语言学校 7月生入学", eventDate: "2026-07-01", category: "language_school" },
  // 10月生
  { title: "语言学校 10月生材料截止", eventDate: "2026-05-15", category: "language_school" },
  { title: "语言学校 10月生COE下发", eventDate: "2026-08-25", category: "language_school" },
  { title: "语言学校 10月生入学", eventDate: "2026-10-01", category: "language_school" },
  // 1月生
  { title: "语言学校 1月生材料截止", eventDate: "2026-09-15", category: "language_school" },
  { title: "语言学校 1月生COE下发", eventDate: "2026-11-25", category: "language_school" },
  { title: "语言学校 1月生入学", eventDate: "2027-01-10", category: "language_school" },
  // 2027年4月生（下一周期）
  { title: "语言学校 2027年4月生材料截止", eventDate: "2026-11-15", category: "language_school" },
  { title: "语言学校 2027年4月生COE下发", eventDate: "2027-02-25", category: "language_school" },
  { title: "语言学校 2027年4月生入学", eventDate: "2027-04-01", category: "language_school" },
  // 2027年7月生（下一周期）
  { title: "语言学校 2027年7月生材料截止", eventDate: "2027-03-15", category: "language_school" },

  // ==================== 在留资格 ====================
  // 2026年度
  { title: "4月入学 COE申请截止（大学）", eventDate: "2025-12-15", category: "coe" },
  { title: "4月入学 COE结果下发", eventDate: "2026-02-28", category: "coe" },
  { title: "10月入学 COE申请截止（大学）", eventDate: "2026-06-15", category: "coe" },
  { title: "10月入学 COE结果下发", eventDate: "2026-08-28", category: "coe" },
  // 2027年4月入学（下一周期）
  { title: "2027年4月入学 COE申请截止（大学）", eventDate: "2026-12-15", category: "coe" },
  { title: "2027年4月入学 COE结果下发", eventDate: "2027-02-28", category: "coe" },

  // ==================== 英语考试 ====================
  { title: "英语成绩准备建议截止（秋季出愿前）", eventDate: "2026-05-31", category: "english_test" },
  { title: "TOEFL iBT 考试（每月多场）", eventDate: "2026-06-15", category: "english_test" },
  { title: "IELTS 考试（每月多场）", eventDate: "2026-06-20", category: "english_test" },
  { title: "TOEIC 考试", eventDate: "2026-06-28", category: "english_test" },
  { title: "TOEFL iBT 考试", eventDate: "2026-09-15", category: "english_test" },
  { title: "IELTS 考试", eventDate: "2026-09-20", category: "english_test" },
  { title: "英语成绩准备建议截止（冬季出愿前）", eventDate: "2026-10-31", category: "english_test" },
];

export const eventRouter = router({
  list: protectedProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      category: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.from) conditions.push(gte(calendarEvents.eventDate, input.from));
      if (input?.to) conditions.push(lte(calendarEvents.eventDate, input.to));
      if (input?.category) conditions.push(eq(calendarEvents.category, input.category));
      return db
        .select()
        .from(calendarEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(calendarEvents.eventDate));
    }),

  upcoming: protectedProcedure
    .input(z.object({ days: z.number().default(60) }).optional())
    .query(async ({ input }) => {
      // Sync built-in events: insert any that don't already exist
      const existingBuiltin = await db
        .select({ title: calendarEvents.title, eventDate: calendarEvents.eventDate })
        .from(calendarEvents)
        .where(eq(calendarEvents.isBuiltin, true));
      const existingKeys = new Set(existingBuiltin.map((e) => `${e.title}|${e.eventDate}`));
      const newEvents = BUILTIN_EVENTS.filter((e) => !existingKeys.has(`${e.title}|${e.eventDate}`));
      if (newEvents.length > 0) {
        await db.insert(calendarEvents).values(
          newEvents.map((e) => ({ ...e, isBuiltin: true }))
        );
      }

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const future = new Date(now);
      future.setDate(now.getDate() + (input?.days || 60));
      const futureStr = future.toISOString().split("T")[0];
      return db
        .select()
        .from(calendarEvents)
        .where(and(gte(calendarEvents.eventDate, today), lte(calendarEvents.eventDate, futureStr)))
        .orderBy(asc(calendarEvents.eventDate));
    }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      eventDate: z.string().min(1),
      category: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const [event] = await db
        .insert(calendarEvents)
        .values({ ...input, isBuiltin: false, createdBy: ctx.user.id })
        .returning();
      return event;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, input.id)).limit(1);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "事件不存在" });
      if (event.isBuiltin) throw new TRPCError({ code: "FORBIDDEN", message: "内置事件不可删除" });
      await db.delete(calendarEvents).where(eq(calendarEvents.id, input.id));
      return { success: true };
    }),

  seedBuiltin: protectedProcedure.mutation(async () => {
    const existingBuiltin = await db
      .select({ title: calendarEvents.title, eventDate: calendarEvents.eventDate })
      .from(calendarEvents)
      .where(eq(calendarEvents.isBuiltin, true));
    const existingKeys = new Set(existingBuiltin.map((e) => `${e.title}|${e.eventDate}`));
    const newEvents = BUILTIN_EVENTS.filter((e) => !existingKeys.has(`${e.title}|${e.eventDate}`));
    if (newEvents.length === 0) return { seeded: false, message: "所有内置事件已存在" };

    await db.insert(calendarEvents).values(
      newEvents.map((e) => ({ ...e, isBuiltin: true }))
    );
    return { seeded: true, count: newEvents.length };
  }),
});
