const http = require("http");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 19527;
const ALLOWED_ORIGINS = [
  "https://ty-xhs.up.railway.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

const OPENCLI =
  os.platform() === "win32"
    ? path.join(process.env.APPDATA || "", "npm", "opencli.cmd")
    : "opencli";
const OPENCLI_JS = path.join(
  process.env.APPDATA || "",
  "npm",
  "node_modules",
  "@jackwener",
  "opencli",
  "dist",
  "src",
  "main.js",
);

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Content-Type": "application/json",
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function runOpencli(args, timeout = 60000) {
  const useNodeEntry = os.platform() === "win32" && fs.existsSync(OPENCLI_JS);
  return execFileSync(useNodeEntry ? process.execPath : OPENCLI, useNodeEntry ? [OPENCLI_JS, ...args] : args, {
    encoding: "utf-8",
    timeout,
    stdio: ["pipe", "pipe", "pipe"],
    shell: os.platform() === "win32" && !useNodeEntry,
  });
}

function findFirstImage(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (/\.(?:jpe?g|png|webp|gif)$/i.test(entry.name)) files.push(fullPath);
    }
  };
  visit(dir);
  files.sort((a, b) => a.localeCompare(b));
  return files[0] || null;
}

function readCover(noteUrl, noteId) {
  if (!noteUrl || !/^https?:\/\/(?:[^/]+\.)?xiaohongshu\.com\//i.test(noteUrl)) return null;
  const outputDir = path.join(os.tmpdir(), `xhs-cover-${process.pid}-${Date.now()}`);
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    runOpencli(["xiaohongshu", "download", noteUrl, "--output", outputDir, "-f", "json"], 120000);
    const imagePath = findFirstImage(outputDir);
    if (!imagePath) return null;
    const buffer = fs.readFileSync(imagePath);
    if (buffer.length > 5 * 1024 * 1024) return null;
    const extension = path.extname(imagePath).toLowerCase();
    const mimeType = extension === ".png"
      ? "image/png"
      : extension === ".webp"
      ? "image/webp"
      : extension === ".gif"
      ? "image/gif"
      : "image/jpeg";
    return { noteId, mimeType, base64: buffer.toString("base64") };
  } catch {
    return null;
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (req, res) => {
  const headers = corsHeaders(req.headers.origin || "");

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, headers);
    res.end(JSON.stringify({ status: "ok", version: "2.0" }));
    return;
  }

  if (req.method === "GET" && req.url === "/whoami") {
    try {
      let raw;
      try {
        raw = runOpencli(["xiaohongshu", "whoami", "-f", "json"]);
      } catch {
        raw = runOpencli(["xiaohongshu", "creator-profile", "-f", "json"]);
      }
      const data = JSON.parse(raw);
      res.writeHead(200, headers);
      res.end(JSON.stringify({ ok: true, data }));
    } catch (err) {
      res.writeHead(200, headers);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/fetch") {
    try {
      const body = await readBody(req);
      if (!body.noteId) {
        res.writeHead(400, headers);
        res.end(JSON.stringify({ error: "noteId is required" }));
        return;
      }
      if (!/^[a-f0-9]{24}$/i.test(String(body.noteId))) {
        res.writeHead(400, headers);
        res.end(JSON.stringify({ error: "noteId must be a 24-character Xiaohongshu ID" }));
        return;
      }
      const args = ["xiaohongshu", "creator-note-detail", String(body.noteId), "-f", "json"];
      if (body.profile) args.push("--profile", String(body.profile));
      const raw = runOpencli(args);
      const data = JSON.parse(raw);
      const cover = body.includeCover ? readCover(body.noteUrl, body.noteId) : null;
      res.writeHead(200, headers);
      res.end(JSON.stringify({ ok: true, data, cover }));
    } catch (err) {
      res.writeHead(500, headers);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, headers);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[XHS Agent] Running on http://127.0.0.1:${PORT}`);
  console.log("[XHS Agent] Waiting for fetch requests from the platform...");
});
