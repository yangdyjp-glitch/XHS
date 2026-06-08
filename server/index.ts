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
import { appRouter } from "./routers/index.js";
import { createContext, verifyUploadAuth } from "./_core/trpc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "../uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
const PORT = parseInt(process.env.PORT || "3000");

app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Serve uploaded files
app.use("/uploads", express.static(UPLOADS_DIR));

// File upload endpoint
app.post("/api/upload", async (req, res) => {
  try {
    const user = await verifyUploadAuth(req);
    if (!user) {
      res.status(401).json({ error: "请先登录" });
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const contentType = req.headers["content-type"] || "";

      if (!contentType.startsWith("image/")) {
        res.status(400).json({ error: "只支持上传图片" });
        return;
      }

      const ext = contentType.split("/")[1]?.split(";")[0] || "png";
      const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filepath, body);
      res.json({ url: `/uploads/${filename}` });
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
  } catch (e: any) {
    console.warn("[Compass] Auto-migration warning:", e.message);
  }
}

async function startServer() {
  await runAutoMigrations();
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
  });
}

startServer();
