import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  date,
  jsonb,
  unique,
  doublePrecision,
} from "drizzle-orm/pg-core";

// ==================== 用户与组织 ====================

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("teacher"),
  mainDirections: text("main_directions").array(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  accountName: varchar("account_name", { length: 100 }).notNull(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id),
  layer: varchar("layer", { length: 20 }).notNull(),
  mainColor: varchar("main_color", { length: 7 }),
  xhsAccountUrl: varchar("xhs_account_url", { length: 500 }),
  weeklyTarget: integer("weekly_target").default(3),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const columns = pgTable("columns", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  description: text("description"),
  targetUserType: varchar("target_user_type", { length: 200 }),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ==================== 业务核心 ====================

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  columnId: integer("column_id").references(() => columns.id),
  creatorId: integer("creator_id")
    .notNull()
    .references(() => users.id),
  topicType: varchar("topic_type", { length: 30 }).notNull(),
  keywords: text("keywords").array(),
  targetUser: varchar("target_user", { length: 200 }),
  painPoint: text("pain_point"),
  source: varchar("source", { length: 20 }),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  plannedPublishDate: date("planned_publish_date"),
  priority: varchar("priority", { length: 10 }).default("normal"),
  parentTopicId: integer("parent_topic_id"),
  rejectReason: text("reject_reason"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id")
    .references(() => topics.id),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  finalTitle: varchar("final_title", { length: 200 }).notNull(),
  xhsNoteUrl: varchar("xhs_note_url", { length: 500 }).notNull(),
  externalNoteId: varchar("external_note_id", { length: 64 }),
  coverImage: varchar("cover_image", { length: 500 }),
  // 真实发布时间只接受小红书创作者后台返回值；首次登记链接时允许为空。
  publishedAt: timestamp("published_at"),
  registeredBy: integer("registered_by").references(() => users.id),
  syncStatus: varchar("sync_status", { length: 20 }).notNull().default("pending"),
  syncError: text("sync_error"),
  lastSyncedAt: timestamp("last_synced_at"),
  status: varchar("status", { length: 20 }).notNull().default("live"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id")
      .notNull()
      .references(() => notes.id),
    snapshotDate: date("snapshot_date").notNull(),
    daysSincePublish: integer("days_since_publish").notNull(),
    impression: integer("impression").notNull(),
    view: integer("view").notNull(),
    likeCount: integer("like_count").notNull(),
    collect: integer("collect").notNull(),
    commentCount: integer("comment_count").notNull(),
    shareCount: integer("share_count"),
    coverClickRate: doublePrecision("cover_click_rate"),
    dmCount: integer("dm_count"),
    dmValidCount: integer("dm_valid_count"),
    recordedBy: integer("recorded_by")
      .notNull()
      .references(() => users.id),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [unique("uq_note_snapshot").on(table.noteId, table.daysSincePublish)]
);

// ==================== 分析与通知 ====================

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  reviewType: varchar("review_type", { length: 10 }).notNull(),
  scope: varchar("scope", { length: 10 }).notNull(),
  accountId: integer("account_id").references(() => accounts.id),
  // 多账号复盘：所选的一个或多个账号 id（NULL 或空数组 = 全矩阵）。
  // 单号时同时写入 accountId 以兼容历史读取逻辑。
  accountIds: integer("account_ids").array(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  summaryJson: jsonb("summary_json").notNull(),
  highlights: text("highlights"),
  actionItems: jsonb("action_items"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const aiAnalysisResults = pgTable("ai_analysis_results", {
  id: serial("id").primaryKey(),
  reviewId: integer("review_id").references(() => reviews.id),
  analysisType: varchar("analysis_type", { length: 30 }).notNull(),
  scope: varchar("scope", { length: 10 }).notNull(),
  accountId: integer("account_id").references(() => accounts.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  promptUsed: text("prompt_used").notNull(),
  inputDataJson: jsonb("input_data_json").notNull(),
  resultJson: jsonb("result_json").notNull(),
  resultText: text("result_text").notNull(),
  modelUsed: varchar("model_used", { length: 50 }).notNull(),
  tokensUsed: integer("tokens_used"),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 被否决的推荐选题：记录后，AI 不再生成与之类似的推荐
export const rejectedRecommendations = pgTable("rejected_recommendations", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  topicType: varchar("topic_type", { length: 30 }),
  keywords: text("keywords").array(),
  reason: text("reason"),
  accountId: integer("account_id").references(() => accounts.id),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id")
    .notNull()
    .references(() => topics.id),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  type: varchar("type", { length: 30 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  link: varchar("link", { length: 500 }),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ==================== 日历事件 ====================

export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  eventDate: date("event_date").notNull(),
  category: varchar("category", { length: 30 }).notNull(),
  isBuiltin: boolean("is_builtin").notNull().default(false),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ==================== 审计：负责人代理登录（“登录为该用户”） ====================
// 仅负责人可发起；每次发起/退出都写一条日志（谁 actorId、登录了谁 targetUserId、何时）。
// 不接触、不影响任何账户的密码，仅作可追溯的审计记录。
export const impersonationLogs = pgTable("impersonation_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id")
    .notNull()
    .references(() => users.id),
  targetUserId: integer("target_user_id")
    .notNull()
    .references(() => users.id),
  action: varchar("action", { length: 20 }).notNull().default("start"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
