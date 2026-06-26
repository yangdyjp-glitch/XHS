#!/usr/bin/env node

/**
 * XHS Auto-Fetch Script
 *
 * Fetches note metrics from Xiaohongshu creator backend via OpenCLI,
 * computes T+1/T+7/T+14 snapshots from daily trend data,
 * and saves them to the platform API.
 *
 * Usage:
 *   node _fetch_xhs_data.js --api https://ty-xhs.up.railway.app --user ty.admin --password compass123
 *   node _fetch_xhs_data.js --api http://localhost:3000 --user ty.admin --password compass123 --dry-run
 *   node _fetch_xhs_data.js --api http://localhost:3000 --user ty.admin --password compass123 --profile "Profile 2"
 */

import { execSync } from "child_process";
import { platform } from "os";

// ─── CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}
const API_URL = getArg("api") || "http://localhost:3000";
const USERNAME = getArg("user");
const PASSWORD = getArg("password");
const DRY_RUN = args.includes("--dry-run");
const PROFILE = getArg("profile");

if (!USERNAME || !PASSWORD) {
  console.error("Usage: node _fetch_xhs_data.js --api <url> --user <username> --password <password> [--dry-run] [--profile <name>]");
  process.exit(1);
}

// ─── Resolve opencli path ────────────────────────────────────
const OPENCLI = platform() === "win32"
  ? `${process.env.APPDATA}\\npm\\opencli.cmd`
  : "opencli";

// ─── API helpers ─────────────────────────────────────────────
let bearerToken = "";

async function apiLogin() {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: USERNAME, password: PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    console.error("[FAIL] Login failed:", data.error || res.statusText);
    process.exit(1);
  }
  bearerToken = data.token;
  console.log("[OK] Logged in as", data.user.name, `(${data.user.role})`);
}

async function apiGet(path) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || res.statusText);
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearerToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || res.statusText);
  return data;
}

// ─── OpenCLI helper ──────────────────────────────────────────
function runOpencli(noteId) {
  try {
    const profileFlag = PROFILE ? ` --profile "${PROFILE}"` : "";
    const output = execSync(
      `"${OPENCLI}" xiaohongshu creator-note-detail ${noteId} -f json${profileFlag}`,
      { encoding: "utf-8", timeout: 60000, stdio: ["pipe", "pipe", "pipe"] }
    );
    return JSON.parse(output);
  } catch (err) {
    console.error(`  [FAIL] OpenCLI error for ${noteId}:`, err.stderr?.slice(0, 200) || err.message);
    return null;
  }
}

// ─── Parse trend data ────────────────────────────────────────
function parseDailyTrend(detail, metricName) {
  const entry = detail.find(
    (d) => d.section === "趋势数据" && d.metric === `按天/${metricName}`
  );
  if (!entry?.extra) return {};
  const map = {};
  for (const part of entry.extra.split(" | ")) {
    const [date, val] = part.split("=");
    if (date && val !== undefined) {
      map[date.trim()] = parseFloat(val);
    }
  }
  return map;
}

function computeSnapshot(detail, publishedAt, targetDay) {
  const pubDate = new Date(publishedAt);
  const metrics = ["曝光数", "观看数", "点赞数", "收藏数", "评论数", "分享数"];
  const fieldMap = {
    "曝光数": "impression",
    "观看数": "view",
    "点赞数": "likeCount",
    "收藏数": "collect",
    "评论数": "commentCount",
    "分享数": "shareCount",
  };

  const result = {};
  for (const metric of metrics) {
    const daily = parseDailyTrend(detail, metric);
    let sum = 0;
    for (let d = 0; d < targetDay; d++) {
      const date = new Date(pubDate);
      date.setDate(date.getDate() + d);
      const key = date.toISOString().split("T")[0];
      sum += daily[key] || 0;
    }
    result[fieldMap[metric]] = sum;
  }
  return result;
}

// ─── Extract noteId from XHS URL ─────────────────────────────
function extractNoteId(url) {
  if (!url) return null;
  const exploreMatch = url.match(/\/(?:explore|discovery\/item)\/([a-f0-9]+)/);
  if (exploreMatch) return exploreMatch[1];
  const queryMatch = url.match(/noteId=([a-f0-9]+)/);
  if (queryMatch) return queryMatch[1];
  const pathMatch = url.match(/\/([a-f0-9]{24})/);
  if (pathMatch) return pathMatch[1];
  return null;
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== XHS Auto-Fetch ===`);
  console.log(`API: ${API_URL}`);
  console.log(`User: ${USERNAME}`);
  if (PROFILE) console.log(`Chrome Profile: ${PROFILE}`);
  if (DRY_RUN) console.log(`Mode: DRY RUN (no data will be saved)\n`);
  else console.log();

  // 1. Login
  await apiLogin();

  // 2. Get pending fetches
  const pending = await apiGet("/api/metric/pending");
  if (!pending || pending.length === 0) {
    console.log("\n[OK] No pending fetches. All snapshots are up to date.");
    return;
  }

  console.log(`\n[INFO] Found ${pending.length} note(s) with missing snapshots:\n`);
  for (const p of pending) {
    const xhsId = extractNoteId(p.xhsNoteUrl);
    console.log(`  ${p.finalTitle}`);
    console.log(`    Account: ${p.accountName || "?"} | XHS ID: ${xhsId}`);
    console.log(`    Missing: ${p.missingDays.map((d) => `T+${d}`).join(", ")}`);
    console.log();
  }

  // 3. Fetch each note
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const p of pending) {
    const xhsId = extractNoteId(p.xhsNoteUrl);
    if (!xhsId) {
      console.log(`  [SKIP] Cannot extract noteId from URL: ${p.xhsNoteUrl}`);
      failCount++;
      continue;
    }

    console.log(`[FETCH] ${p.finalTitle} (${xhsId})...`);
    const detail = runOpencli(xhsId);
    if (!detail) {
      failCount++;
      continue;
    }

    // 4. Compute and save each missing snapshot
    for (const day of p.missingDays) {
      const snapshot = computeSnapshot(detail, p.publishedAt, day);
      const allZero = Object.values(snapshot).every((v) => v === 0);
      console.log(`  T+${day}: impression=${snapshot.impression} view=${snapshot.view} like=${snapshot.likeCount} collect=${snapshot.collect} comment=${snapshot.commentCount} share=${snapshot.shareCount}`);

      if (allZero) {
        console.log(`  [SKIP] All metrics are 0 — likely wrong creator account or no trend data`);
        skipCount++;
        continue;
      }

      if (!DRY_RUN) {
        try {
          const result = await apiPost("/api/metric/upsert", {
            noteId: p.noteId,
            daysSincePublish: day,
            ...snapshot,
            notes: `auto-fetch via OpenCLI`,
          });
          console.log(`  [SAVED] T+${day} ${result.updated ? "(updated)" : "(new)"}`);
          successCount++;
        } catch (err) {
          console.error(`  [FAIL] T+${day}:`, err.message);
          failCount++;
        }
      } else {
        console.log(`  [DRY] T+${day} would be saved`);
        successCount++;
      }
    }
    console.log();
  }

  console.log(`\n=== Done ===`);
  console.log(`Success: ${successCount} | Skipped: ${skipCount} | Failed: ${failCount}`);
}

main().catch((err) => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
