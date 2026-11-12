#!/usr/bin/env node
/* build.js — "production build" ของโปรเจกต์นี้
 *
 * แอปเป็น static site ไม่มี bundler โดยตั้งใจ (โหลดเร็ว, ออฟไลน์ง่าย, ไม่มี dependency)
 *
 *   src/      ✏️  ต้นฉบับทั้งหมด — แก้ที่นี่เท่านั้น
 *   deploy/   🤖  ผลลัพธ์จาก build — ถูกล้างและสร้างใหม่ทุกครั้ง ห้ามแก้ตรง
 *
 * ขั้นตอน:
 *   1. ล้าง deploy/ แล้วคัดลอก src/ -> deploy/
 *      (ไฟล์เฉพาะ standalone ของ thai-stock-watchlist ไม่ถูกคัดลอก: wrangler.toml, _worker.js, README.md)
 *   2. ตรวจ syntax ของ JS ทุกไฟล์ที่ deploy จริง
 *   3. ตรวจว่า index.html อ้างถึงไฟล์ที่มีอยู่จริง และ service worker แคชครบ
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src");
const outDir = path.join(root, "deploy");
const THAI_STANDALONE_ONLY = ["wrangler.toml", "_worker.js", "README.md"];

const fail = (m) => { console.error("✗ " + m); process.exitCode = 1; };
const ok = (m) => console.log("✓ " + m);

// 1. clean + copy
if (!fs.existsSync(path.join(srcDir, "index.html"))) {
  console.error("✗ ไม่พบ src/index.html");
  process.exit(1);
}
fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(srcDir, outDir, {
  recursive: true,
  filter: (from) => {
    const rel = path.relative(srcDir, from).split(path.sep);
    return !(rel[0] === "thai-stock-watchlist" && rel.length === 2 && THAI_STANDALONE_ONLY.includes(rel[1]));
  },
});
const html = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
ok(`src/ -> deploy/ (index.html ${Buffer.byteLength(html).toLocaleString()} bytes)`);

// 2. syntax check
const jsFiles = ["ips-config.js", "portfolio-engine.js", "_worker.js", "sw.js",
  "thai-stock-watchlist/app.js", "thai-stock-watchlist/sw.js"];
for (const f of jsFiles) {
  const p = path.join(outDir, f);
  if (!fs.existsSync(p)) { fail(`ไม่พบไฟล์ ${f}`); continue; }
  try {
    execFileSync(process.execPath, ["--check", p], { stdio: "pipe" });
    ok(`syntax ok: ${f}`);
  } catch (e) {
    fail(`syntax error ใน ${f}\n${e.stderr ? e.stderr.toString() : e.message}`);
  }
}

// 3. referenced assets exist
const refs = [...html.matchAll(/(?:src|href)="\.?\/?([\w.\-]+\.(?:js|css|webmanifest|png|svg))"/g)]
  .map((m) => m[1])
  .filter((f, i, a) => a.indexOf(f) === i);
for (const f of refs) {
  if (fs.existsSync(path.join(outDir, f))) ok(`asset present: ${f}`);
  else fail(`index.html อ้างถึง ${f} แต่ไม่มีไฟล์นี้ใน src/`);
}

// 4. service worker must precache the app-logic scripts (ไม่งั้นออฟไลน์พัง)
const sw = fs.readFileSync(path.join(outDir, "sw.js"), "utf8");
for (const f of ["ips-config.js", "portfolio-engine.js"]) {
  if (sw.includes(f)) ok(`sw precache: ${f}`);
  else fail(`sw.js ไม่ได้แคช ${f} — โหมดออฟไลน์จะพัง`);
}

if (process.exitCode) console.error("\nbuild failed");
else console.log("\nbuild ok");
