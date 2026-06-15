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
