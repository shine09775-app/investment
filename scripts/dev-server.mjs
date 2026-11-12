#!/usr/bin/env node
/* dev-server.mjs — รันเว็บในเครื่องโดยไม่ต้อง login Cloudflare
 * ใช้ deploy/_worker.js ตัวจริง (proxy Yahoo /api/chart, /api/eps, /api/fundamentals)
 * ไม่มี Workers AI binding → /api/kirin จะตอบ 503 ซึ่งเป็นพฤติกรรมที่ออกแบบไว้
 * ใช้: npm run dev:local   แล้วเปิด http://localhost:8790
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const root = path.resolve(process.argv[2] || fileURLToPath(new URL("../deploy", import.meta.url)));
const port = +process.argv[3] || 8790;
const worker = (await import(pathToFileURL(path.join(root, "_worker.js")).href)).default;
const types = {".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".png":"image/png",".webmanifest":"application/manifest+json",".json":"application/json"};
const ASSETS = { async fetch(req) {
  let p = decodeURIComponent(new URL(req.url).pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response("not found", { status: 404 });
  return new Response(fs.readFileSync(f), { headers: { "content-type": types[path.extname(f)] || "application/octet-stream" } });
}};
http.createServer(async (req, res) => {
  try {
    const r = await worker.fetch(new Request("http://localhost:" + port + req.url, { method: req.method }), { ASSETS }, { waitUntil(){}, passThroughOnException(){} });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    console.log(req.method, req.url, r.status);
  } catch (e) { console.error(req.url, e); res.writeHead(500); res.end(String(e)); }
}).listen(port, () => console.log("listening", port));
