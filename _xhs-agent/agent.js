const http = require("http");
const { execSync } = require("child_process");
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

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

function fetchNote(noteId, profile) {
  const profileFlag = profile ? ` --profile "${profile}"` : "";
  const cmd = `"${OPENCLI}" xiaohongshu creator-note-detail ${noteId} -f json${profileFlag}`;
  const output = execSync(cmd, {
    encoding: "utf-8",
    timeout: 60000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(output);
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
    res.end(JSON.stringify({ status: "ok", version: "1.0" }));
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
      const data = fetchNote(body.noteId, body.profile);
      res.writeHead(200, headers);
      res.end(JSON.stringify({ ok: true, data }));
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
