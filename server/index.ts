import "dotenv/config";
import express from "express";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { appRouter } from "./routers/index.js";
import { createContext, verifyUploadAuth } from "./_core/trpc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || "3000");

// Supabase Storage client
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = "covers";

let supabase: ReturnType<typeof createClient> | null = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    realtime: { transport: ws as any },
  });
  console.log("[Compass] Supabase Storage enabled");
} else {
  console.warn("[Compass] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — file uploads disabled");
}

app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// File upload endpoint — Supabase Storage
app.post("/api/upload", async (req, res) => {
  try {
    const user = await verifyUploadAuth(req);
    if (!user) {
      res.status(401).json({ error: "请先登录" });
      return;
    }

    if (!supabase) {
      res.status(500).json({ error: "存储服务未配置" });
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", async () => {
      try {
        const body = Buffer.concat(chunks);
        const contentType = req.headers["content-type"] || "";

        if (!contentType.startsWith("image/")) {
          res.status(400).json({ error: "只支持上传图片" });
          return;
        }

        const ext = contentType.split("/")[1]?.split(";")[0] || "png";
        const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;

        const { error } = await supabase!.storage
          .from(STORAGE_BUCKET)
          .upload(filename, body, {
            contentType,
            upsert: false,
          });

        if (error) {
          console.error("[Compass] Storage upload error:", error.message);
          res.status(500).json({ error: "上传失败：" + error.message });
          return;
        }

        const { data: urlData } = supabase!.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(filename);

        res.json({ url: urlData.publicUrl });
      } catch (e: any) {
        console.error("[Compass] Upload processing error:", e.message);
        res.status(500).json({ error: "上传处理失败" });
      }
    });
  } catch {
    res.status(500).json({ error: "上传失败" });
  }
});

// REST login endpoint for external scripts (bypasses tRPC serialization)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { verifyPassword, createToken, setTokenCookie } = await import("./_core/auth.js");
    const { db } = await import("./db.js");
    const { users } = await import("../drizzle/schema.js");
    const { eq } = await import("drizzle-orm");
    const { email, password } = req.body;
    if (!email || !password) { res.status(400).json({ error: "Missing email or password" }); return; }
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.isActive) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const token = await createToken({ userId: user.id, email: user.email, role: user.role });
    setTokenCookie(res, token);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    const { db } = await import("./db.js");
    const { users } = await import("../drizzle/schema.js");
    const result = await db.select({ id: users.id }).from(users).limit(1);
    res.json({ status: "ok", db: "connected", userCount: result.length, timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.json({ status: "ok", db: "error", error: e.message, cause: e.cause?.message, timestamp: new Date().toISOString() });
  }
});

// REST endpoints for external fetch script
app.get("/api/metric/pending", async (req, res) => {
  try {
    const { getTokenFromRequest, verifyToken } = await import("./_core/auth.js");
    const { db } = await import("./db.js");
    const { notes, accounts, metricSnapshots } = await import("../drizzle/schema.js");
    const { SNAPSHOT_DAYS } = await import("../shared/enums.js");
    const { eq, and, inArray } = await import("drizzle-orm");
    const token = getTokenFromRequest(req);
    if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
    const payload = await verifyToken(token);
    if (!payload) { res.status(401).json({ error: "Invalid token" }); return; }
    const { users } = await import("../drizzle/schema.js");
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const conditions = [];
    if (user.role === "teacher" || user.role === "editor") {
      const ownAccounts = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.ownerId, user.id));
      const ids = ownAccounts.map((a: any) => a.id);
      if (ids.length > 0) conditions.push(inArray(notes.accountId, ids));
      else { res.json([]); return; }
    }
    conditions.push(eq(notes.status, "live"));
    const allNotes = await db.select({ id: notes.id, xhsNoteUrl: notes.xhsNoteUrl, publishedAt: notes.publishedAt, finalTitle: notes.finalTitle, accountName: accounts.accountName })
      .from(notes).leftJoin(accounts, eq(notes.accountId, accounts.id)).where(and(...conditions));
    const allSnaps = await db.select({ noteId: metricSnapshots.noteId, daysSincePublish: metricSnapshots.daysSincePublish }).from(metricSnapshots);
    const snapSet = new Set(allSnaps.map((s: any) => `${s.noteId}_${s.daysSincePublish}`));
    const now = new Date();
    const pending = [];
    for (const note of allNotes) {
      const daysSince = Math.floor((now.getTime() - new Date(note.publishedAt).getTime()) / 86400000);
      const missing = (SNAPSHOT_DAYS as readonly number[]).filter((d) => daysSince >= d && !snapSet.has(`${note.id}_${d}`));
      if (missing.length > 0) pending.push({ noteId: note.id, xhsNoteUrl: note.xhsNoteUrl, publishedAt: new Date(note.publishedAt).toISOString(), finalTitle: note.finalTitle, accountName: note.accountName, missingDays: missing });
    }
    res.json(pending);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post("/api/metric/upsert", async (req, res) => {
  try {
    const { getTokenFromRequest, verifyToken } = await import("./_core/auth.js");
    const { db } = await import("./db.js");
    const { metricSnapshots, notes } = await import("../drizzle/schema.js");
    const { SNAPSHOT_DAYS } = await import("../shared/enums.js");
    const { eq, and } = await import("drizzle-orm");
    const token = getTokenFromRequest(req);
    if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
    const payload = await verifyToken(token);
    if (!payload) { res.status(401).json({ error: "Invalid token" }); return; }
    const input = req.body;
    if (!(SNAPSHOT_DAYS as readonly number[]).includes(input.daysSincePublish)) { res.status(400).json({ error: "Invalid daysSincePublish" }); return; }
    const [note] = await db.select({ publishedAt: notes.publishedAt }).from(notes).where(eq(notes.id, input.noteId)).limit(1);
    if (!note) { res.status(404).json({ error: "Note not found" }); return; }
    const snapshotDate = new Date(note.publishedAt);
    snapshotDate.setDate(snapshotDate.getDate() + input.daysSincePublish);
    const data = { noteId: input.noteId, daysSincePublish: input.daysSincePublish, impression: input.impression, view: input.view, likeCount: input.likeCount, collect: input.collect, commentCount: input.commentCount, shareCount: input.shareCount, notes: input.notes ?? null, snapshotDate: snapshotDate.toISOString().split("T")[0], recordedBy: payload.userId };
    const existing = await db.select({ id: metricSnapshots.id }).from(metricSnapshots).where(and(eq(metricSnapshots.noteId, input.noteId), eq(metricSnapshots.daysSincePublish, input.daysSincePublish))).limit(1);
    if (existing.length > 0) {
      await db.update(metricSnapshots).set(data).where(eq(metricSnapshots.id, existing[0].id));
      res.json({ id: existing[0].id, updated: true });
    } else {
      const [result] = await db.insert(metricSnapshots).values(data).returning({ id: metricSnapshots.id });
      res.json({ id: result.id, updated: false });
    }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => createContext(req, res),
  })
);

// Auto-migration: ensure new columns exist
async function runAutoMigrations() {
  try {
    const { db } = await import("./db.js");
    const { sql } = await import("drizzle-orm");

    // Feature 1: Add deleted_at column to topics
    await db.execute(sql`
      ALTER TABLE topics ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP
    `);
    console.log("[Compass] Auto-migration: deleted_at column ensured.");

    // Feature: 负责人可审计的“登录为该用户”——审计日志表
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS impersonation_logs (
        id serial PRIMARY KEY,
        actor_id integer NOT NULL REFERENCES users(id),
        target_user_id integer NOT NULL REFERENCES users(id),
        action varchar(20) NOT NULL DEFAULT 'start',
        created_at timestamp DEFAULT now() NOT NULL
      )
    `);
    console.log("[Compass] Auto-migration: impersonation_logs table ensured.");

    // Feature: 多账号复盘——reviews 增加 account_ids（整型数组），记录所选的一个或多个账号
    await db.execute(sql`
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS account_ids integer[]
    `);
    console.log("[Compass] Auto-migration: reviews.account_ids column ensured.");

    // Clean up old /uploads/ URLs (Railway ephemeral storage, now using Supabase Storage)
    const cleanResult = await db.execute(sql`
      UPDATE notes SET cover_image = NULL WHERE cover_image LIKE '/uploads/%'
    `);
    console.log("[Compass] Cleaned old /uploads/ cover URLs.");

    // 一次性回填：历史上发布时把 published_at 误写成了创建时刻。把"发布时间≈创建时间"
    // (相差<120秒，明显是 bug)的笔记，改为其选题的计划发布日期(::timestamp = UTC 午夜，
    // 服务器时区为 UTC，与 publish/republish 的 new Date(planned) 结果一致)。
    // 单条纯 SQL、显式类型转换，避免参数类型推断问题；带 <> 守卫，幂等(已修正者不再更新)。
    const fix: any = await db.execute(sql`
      UPDATE notes n
      SET published_at = t.planned_publish_date::timestamp
      FROM topics t
      WHERE t.id = n.topic_id
        AND t.planned_publish_date IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (n.published_at - n.created_at))) < 120
        AND n.published_at <> t.planned_publish_date::timestamp
    `);
    console.log(`[Compass] Backfilled published_at (创建时间→计划发布日期) for ${fix?.count ?? 0} notes.`);

    // 一次性回填：历史上「复制链接」把整段小红书分享口令(真实链接夹在文案中间)存进了
    // xhs_note_url，被当成相对路径后点击会跳到首页(选题看板)。把含 http(s) 但不是以
    // http(s) 开头的行，提取出第一个链接(到空白为止)。幂等：已是 http 开头者被守卫排除；
    // 纯标签/无链接的行不含 http，跳过(由前端 NoteLink 显示「链接无效」)。尾随中文标点
    // 由前端 extractNoteUrl 在渲染时再清理一次。
    const urlFix: any = await db.execute(sql`
      UPDATE notes
      SET xhs_note_url = substring(xhs_note_url from 'https?://[^[:space:]]+')
      WHERE xhs_note_url ~ 'https?://'
        AND xhs_note_url !~ '^https?://'
    `);
    console.log(`[Compass] Normalized embedded xhs_note_url (分享口令→纯链接) for ${urlFix?.count ?? 0} notes.`);
  } catch (e: any) {
    console.warn("[Compass] Auto-migration warning:", e.message);
  }
}

// Ensure Supabase Storage bucket exists
async function ensureStorageBucket() {
  if (!supabase) return;
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === STORAGE_BUCKET);
    if (!exists) {
      const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
        public: true,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
        fileSizeLimit: 5 * 1024 * 1024, // 5MB
      });
      if (error) {
        console.warn("[Compass] Create bucket error:", error.message);
      } else {
        console.log("[Compass] Storage bucket 'covers' created.");
      }
    } else {
      console.log("[Compass] Storage bucket 'covers' exists.");
    }
  } catch (e: any) {
    console.warn("[Compass] Storage bucket check error:", e.message);
  }
}

async function startServer() {
  if (process.env.NODE_ENV === "production") {
    const clientDist = path.resolve(__dirname, "../dist/client");
    // Hashed assets (JS/CSS) — cache for 1 year
    app.use("/assets", express.static(path.join(clientDist, "assets"), {
      maxAge: "365d",
      immutable: true,
    }));
    // Other static files (index.html, favicon, etc.) — no cache
    app.use(express.static(clientDist, { maxAge: 0 }));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
    console.log(`[Compass] Serving production build from ${clientDist}`);
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, "../vite.config.ts"),
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);

    app.use(async (req, res, next) => {
      try {
        const htmlPath = path.resolve(__dirname, "../client/index.html");
        let html = fs.readFileSync(htmlPath, "utf-8");
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  }

  const host = process.env.HOST || "0.0.0.0";
  app.listen(PORT, host, () => {
    console.log(`[Compass] Server running at http://${host}:${PORT} (${process.env.NODE_ENV || "development"})`);

    // Run migrations & storage setup AFTER server is listening (so healthcheck passes)
    runAutoMigrations()
      .then(() => ensureStorageBucket())
      .catch((e) => console.warn("[Compass] Post-start init error:", e.message));
  });
}

startServer();
