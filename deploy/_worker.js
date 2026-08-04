// Cloudflare Pages — Advanced Mode Worker
// Handles /api/chart (Yahoo Finance proxy, same-origin, no CORS) and serves static assets.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/chart") {
      return handleChart(request, url);
    }
    if (url.pathname === "/api/eps") {
      return handleEps(request, url);
    }
    if (url.pathname === "/api/kirin") {
      return handleKirin(request, env);
    }

    // everything else -> static assets (index.html, icons, sw.js, manifest, ...)
    return env.ASSETS.fetch(request);
  },
};

async function handleChart(request, url) {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "*",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const symbol = (url.searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z0-9.\-=^]/g, "");
  const range = (url.searchParams.get("range") || "1y").replace(/[^a-z0-9]/gi, "");
  const interval = (url.searchParams.get("interval") || "1d").replace(/[^a-z0-9]/gi, "");
  const events = (url.searchParams.get("events") || "").replace(/[^a-z,]/gi, "");
  if (!symbol) return json({ error: "missing symbol" }, 400, cors);

  for (const h of ["query1", "query2"]) {
    const target = `https://${h}.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}` + (events ? `&events=${events}` : "");
    try {
      const r = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept": "application/json,text/plain,*/*",
        },
        cf: { cacheTtl: 60, cacheEverything: true },
      });
      const body = await r.text();
      if (r.ok && body.includes('"chart"')) {
        return new Response(body, {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60", ...cors },
        });
      }
    } catch (e) { /* try next host */ }
  }
  return json({ error: "upstream unavailable" }, 502, cors);
}

// EPS รายไตรมาส/รายปีจาก fundamentals-timeseries (endpoint นี้ไม่ต้องใช้ crumb)
async function handleEps(request, url) {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "*",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const symbol = (url.searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z0-9.\-=^]/g, "");
  if (!symbol) return json({ error: "missing symbol" }, 400, cors);

  const p2 = Math.floor(Date.now() / 1000);
  const p1 = p2 - 8 * 365 * 86400; // ขอ 8 ปี (Yahoo คืนจริง ~4 ปีรายปี + 5 ไตรมาส)

  for (const h of ["query1", "query2"]) {
    const target = `https://${h}.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${symbol}?type=quarterlyDilutedEPS,annualDilutedEPS&period1=${p1}&period2=${p2}`;
    try {
      const r = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept": "application/json,text/plain,*/*",
        },
        // งบออกเป็นรายไตรมาส — แคชที่ edge 6 ชม. พอ
        cf: { cacheTtl: 21600, cacheEverything: true },
      });
      const body = await r.text();
      if (r.ok && body.includes('"timeseries"')) {
        return new Response(body, {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=21600", ...cors },
        });
      }
    } catch (e) { /* try next host */ }
  }
  return json({ error: "upstream unavailable" }, 502, cors);
}

// Kirin — วิเคราะห์สถานการณ์พอร์ตด้วย Workers AI (Llama 3.3 70B) ตามหลัก IPS
async function handleKirin(request, env) {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "POST only" }, 405, cors);
  if (!env.AI) return json({ error: "AI binding not configured" }, 503, cors);

  // --- Layer 1: origin/client guard -------------------------------------
  // (ก) Sec-Fetch-Site: ถ้ามีค่า ต้องเป็น same-origin/none (JS ปลอมไม่ได้ — forbidden header)
  //     * ไม่บังคับว่าต้องมี เพราะ Safari รุ่นเก่าไม่ส่ง header นี้ — จะไปปิดช่องด้วย (ค) แทน
  // (ข) Origin: ถ้ามี ต้องเป็นโดเมนเดียวกัน
  // (ค) x-kirin-client: หน้าเว็บเราใส่ให้ทุกครั้ง — ปิดช่อง curl/บอทที่ไม่ได้ตั้ง header นี้
  //     (ข้ามโดเมนผ่านเบราว์เซอร์จะโดน preflight บล็อก เพราะ OPTIONS ไม่อนุญาต header นี้)
  //     ไม่ใช่ auth เชิงลับ (อ่าน JS แล้วก็อปได้) แต่รวมกับ rate-limit ด้านล่างเพียงพอสำหรับ endpoint นี้
  const url = new URL(request.url);
  const sfs = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const crossSiteFetch = sfs && sfs !== "same-origin" && sfs !== "none";
  const originMismatch = origin && (() => { try { return new URL(origin).host !== url.host; } catch { return true; } })();
  if (crossSiteFetch || originMismatch) return json({ error: "forbidden origin" }, 403, cors);
  if (request.headers.get("x-kirin-client") !== "1") return json({ error: "forbidden client" }, 403, cors);

  // --- Layer 2: per-IP rate limit (fixed window, Cache API) --------------
  const ip = request.headers.get("cf-connecting-ip");
  if (await rateLimited(ip, 12, 60)) return json({ error: "rate limited — ลองใหม่ในอีกครู่" }, 429, cors);

  // --- Layer 3: input hardening (bound cost per call) -------------------
  const len = parseInt(request.headers.get("content-length") || "0", 10);
  if (len > 12000) return json({ error: "payload too large" }, 413, cors);

  let snap;
  try { snap = await request.json(); } catch (e) { return json({ error: "bad json" }, 400, cors); }
  if (typeof snap !== "object" || snap === null) return json({ error: "bad payload" }, 400, cors);

  const holdings = Array.isArray(snap.holdings) ? snap.holdings.slice(0, 30) : [];
  if (!holdings.length) return json({ error: "no holdings" }, 400, cors);
  // coerce/cap ทุก field กันการยัดสตริงยาวเพื่อพองต้นทุน prompt
  const s = (v, n) => String(v == null ? "" : v).replace(/[\r\n]+/g, " ").slice(0, n);
  const num = v => (typeof v === "number" && isFinite(v)) ? v : null;
  const lines = holdings.map(h => {
    const price = num(h.price), chg = num(h.chgPct), score = num(h.score), disc = num(h.disc), pe = num(h.pe), yld = num(h.yield);
    const bits = [`${s(h.t, 8)} (${s(h.status, 8)})`, `ราคา $${price ?? "?"}`, `วันนี้ ${chg == null ? "?" : (chg >= 0 ? "+" : "") + chg}%`];
    if (score != null) bits.push(`คะแนน ${score}/100 = ${s(h.signal, 40)}`);
    if (disc != null) bits.push(`ต่ำกว่าจุดสูง52wk ${disc}%`);
    if (pe != null) bits.push(`P/E ${pe} (มัธยฐานอดีต ${num(h.medPE) ?? "?"})`);
    if (yld != null) bits.push(`ปันผล ${yld}% (ปกติ ${num(h.medYield) ?? "?"}%)`);
    return "- " + bits.join(", ");
  }).join("\n");

  // --- GUARDRAIL: คำนวณรายชื่อที่อนุญาต/ห้าม เอง (ไม่พึ่งให้ AI กรอง) ---
  const isCore = st => /^(OWN|BUY\d?|WATCH)$/.test(String(st || ""));
  const tk = h => s(h.t, 8).toUpperCase();
  const coreRanked = holdings
    .filter(h => isCore(h.status) && num(h.score) != null)
    .sort((a, b) => num(b.score) - num(a.score));
  const moonTickers = holdings.filter(h => String(h.status) === "MOON").map(tk).filter(Boolean);
  const allowList = coreRanked.slice(0, 5).map(h => `${tk(h)}(${num(h.score)})`).join(", ") || "(ไม่มีหุ้น core ที่มีคะแนน)";
  const denyList = moonTickers.join(", ") || "(ไม่มี)";

  const sys = `คุณคือ "Kirin" (麒麟) ที่ปรึกษาการลงทุนระยะยาวสไตล์ Warren Buffett ของพอร์ต Mega Trend
หลักการที่ต้องยึด (Investment Policy Statement ของผู้ใช้):
- ลงทุนตาม Mega Trend: AI Infrastructure, Energy/Data Center, Cloud, Healthcare AI
- ถือยาว 10-20 ปี, DCA อย่างมีวินัย, ไม่เล่นตามกระแส
- "โลภเมื่อคนอื่นกลัว" ซื้อเพิ่มตอนราคาย่อ/ตลาดกลัว ไม่ขายเพราะข่าวสั้นหรือตลาด panic
- Income (SCHD/JEPQ) ดูที่ปันผล ไม่ใช่จับจังหวะราคา
- Moonshot คุมไม่เกิน 5% ของพอร์ต

กฎสำคัญในการแนะนำ:
- "หุ้นน่าสะสม" ให้เลือกจากกลุ่ม core เท่านั้น (status = OWN, BUY, WATCH) ที่คะแนนสูงและถูกเทียบประวัติ
- ห้ามแนะนำหุ้น Moonshot (status = MOON) ว่าน่าสะสม แม้คะแนนจะสูง เพราะคะแนนที่สูงของ moonshot มักมาจากราคาที่ร่วงแรง (falling knife) ไม่ใช่ของถูกที่มีคุณภาพ — ให้พูดถึง moonshot เฉพาะในหัวข้อข้อควรระวัง และย้ำเพดาน 5%
- Income (SCHD/JEPQ) ห้ามให้ "คะแนน" หรือจับจังหวะราคา ให้พูดถึงเฉพาะว่าปันผลปกติหรือสูงกว่าปกติ

หน้าที่: อ่านข้อมูลสแนปช็อตพอร์ต แล้วสรุปสถานการณ์เป็นภาษาไทยกระชับ ให้ข้อคิดที่นำไปใช้ได้จริง
รูปแบบคำตอบ (ห้ามเกิน 180 คำ, ใช้ bullet):
1. ภาพรวมตลาดจากดัชนี Buffett Opportunity Index
2. หุ้น core 2-3 ตัวที่ "น่าสะสมตอนนี้" ที่สุด (อ้างคะแนน + ราคาที่ต่ำกว่าประวัติ/P-E ต่ำกว่ามัธยฐาน) พร้อมเหตุผลเชื่อมโยง Mega Trend
3. ข้อควรระวัง 1-2 ข้อ (หุ้นที่แพงเทียบประวัติ และ/หรือ moonshot ที่ผันผวน)
4. คำแนะนำเชิงปฏิบัติที่ตรงกับ IPS (DCA ต่อ, เก็บเงินสดรอจังหวะ, เพิ่มน้ำหนักกลุ่มไหน)
ปิดท้ายบรรทัดเดียวว่าเป็นมุมมองเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน`;

  const gauge = num(snap.gauge);
  const user = `สแนปช็อตพอร์ต ณ ${s(snap.time, 40) || "ตอนนี้"}:
Buffett Opportunity Index (เฉลี่ยหุ้นที่ถือ+Next Buy+Watchlist): ${gauge ?? "?"}/100 — "${s(snap.mood, 40)}"
(ยิ่งสูง = ยิ่งถูก/ตลาดกลัว = จังหวะสะสมดี)

รายตัว:
${lines}

ข้อบังคับเด็ดขาด (ห้ามฝ่าฝืน):
- หัวข้อ "หุ้นน่าสะสม" ให้เลือก 2-3 ตัวจากลิสต์นี้เท่านั้น (เรียงตามคะแนนแล้ว): ${allowList}
- ห้ามระบุหุ้นเหล่านี้ว่า "น่าสะสม" โดยเด็ดขาด พูดถึงได้เฉพาะในหัวข้อ "ข้อควรระวัง": ${denyList}
- ถ้าหุ้นในลิสต์ที่อนุญาตยังแพง (คะแนนต่ำ) ให้บอกตรงๆ ว่ารอจังหวะได้ อย่าฝืนเชียร์

ช่วยวิเคราะห์ตามรูปแบบที่กำหนด`;

  const MODELS = {
    "llama": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "sealion": "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
  };
  const model = MODELS[snap.model] || MODELS.llama;

  // ส่วน "น่าสะสม" = ข้อความก่อนหัวข้อข้อควรระวัง — moonshot ต้องไม่โผล่ในนี้
  const accumPart = txt => {
    const i = txt.search(/ข้อควรระวัง|ควรระวัง|ระวัง|WAIT/i);
    return (i > 0 ? txt.slice(0, i) : txt).toUpperCase();
  };
  const moonLeaks = txt => {
    const head = accumPart(txt);
    // boundary แบบ [^A-Z0-9] (ไม่ใช้ \b เพราะเพี้ยนกับข้อความ Thai ผสม ASCII)
    // กัน substring ชน เช่น QBTS จะไม่แมตช์ใน "QBTSX"
    return moonTickers.filter(t => new RegExp("(^|[^A-Z0-9])" + t + "([^A-Z0-9]|$)").test(head));
  };

  async function callModel(extra) {
    const out = await env.AI.run(model, {
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user + (extra || "") },
      ],
      max_tokens: 700,
      temperature: 0.4,
    });
    return (out && (
      out.response ||
      (out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content) ||
      out.result || ""
    )) || "";
  }

  try {
    const t0 = Date.now();
    let text = (await callModel("")).trim();
    if (!text) return json({ error: "empty ai output" }, 502, cors);

    let guardrail = "clean";
    let leaked = moonLeaks(text);
    if (leaked.length) {
      // retry ครั้งเดียวด้วยคำสั่งเข้มขึ้น (ระบุตัวที่หลุดตรงๆ)
      const stricter = `\n\n[แก้ไข] ครั้งก่อนคุณระบุ ${leaked.join(", ")} ในหัวข้อน่าสะสม ซึ่งผิดกฎ — หุ้นเหล่านี้เป็น Moonshot ห้ามอยู่ในหัวข้อน่าสะสมเด็ดขาด ให้ย้ายไปข้อควรระวังเท่านั้น แล้วเขียนใหม่ทั้งหมด`;
      const retry = (await callModel(stricter)).trim();
      if (retry && !moonLeaks(retry).length) { text = retry; guardrail = "corrected"; }
      else { guardrail = "flagged"; } // retry ยังหลุด -> คงคำตอบเดิมไว้ พร้อม flag
    }

    return json({ analysis: text, model, guardrail, ms: Date.now() - t0 }, 200, cors);
  } catch (e) {
    return json({ error: "ai error: " + String(e && e.message || e) }, 502, cors);
  }
}

// Best-effort per-IP fixed-window rate limit via the Cache API (per-colo).
// ไม่ใช่ auth แต่กันการยิงถล่มจาก IP เดียว (throttle) โดยไม่ต้องใช้ KV/DO
async function rateLimited(ip, limit, windowSec) {
  if (!ip) return false; // ไม่มี IP (เช่น local dev) -> ข้าม
  try {
    const bucket = Math.floor(Date.now() / 1000 / windowSec);
    const key = new Request(`https://ratelimit.internal/kirin/${encodeURIComponent(ip)}/${bucket}`);
    const cache = caches.default;
    const hit = await cache.match(key);
    const count = hit ? (parseInt(await hit.text(), 10) || 0) : 0;
    if (count >= limit) return true;
    await cache.put(key, new Response(String(count + 1), {
      headers: { "cache-control": `max-age=${windowSec}` },
    }));
    return false;
  } catch (e) {
    return false; // ถ้า cache มีปัญหา อย่าบล็อกผู้ใช้จริง
  }
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors },
  });
}
