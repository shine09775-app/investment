// Cloudflare Pages — Advanced Mode Worker
// Handles /api/chart (Yahoo Finance proxy, same-origin, no CORS) and serves static assets.
// Service worker "ปลดระวาง" สำหรับแอปหุ้นไทยแบบแยกที่ถูกลบ: ล้าง cache ของตัวเอง ยกเลิกการลงทะเบียน แล้วพาไปหน้าหลัก
const RETIRED_THAI_SW = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("thai-stock-watchlist")) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: "window" })) c.navigate("/");
})()));
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/chart") {
      return handleChart(request, url);
    }
    if (url.pathname === "/api/eps") {
      return handleEps(request, url);
    }
    if (url.pathname === "/api/fundamentals") {
      return handleFundamentals(request, url);
    }
    if (url.pathname === "/api/kirin") {
      return handleKirin(request, env);
    }

    // แอปหุ้นไทยแบบแยก (/thai-stock-watchlist/) ถูกลบแล้ว — รวมอยู่ในหน้าหลักแท็บ "หุ้นไทย"
    // sw.js เดิมต้องได้ SW ตัวใหม่ที่ลบตัวเอง (ถ้า redirect, browser จะเก็บ SW เก่าที่ cache-first ไว้ต่อ)
    if (url.pathname.startsWith("/thai-stock-watchlist")) {
      if (url.pathname === "/thai-stock-watchlist/sw.js") {
        return new Response(RETIRED_THAI_SW, {
          headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
        });
      }
      return Response.redirect(new URL("/", url).toString(), 301);
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

// ตัวเลขพื้นฐานที่ Thai Stock Watchlist ใช้ (P/E, EPS, Operating income,
// สินทรัพย์, หนี้ และ equity) — Yahoo timeseries ใช้โดยไม่ต้องมี crumb.
async function handleFundamentals(request, url) {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "*",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const symbol = (url.searchParams.get("symbol") || "").toUpperCase().replace(/[^A-Z0-9.\-=^]/g, "");
  if (!symbol) return json({ error: "missing symbol" }, 400, cors);
  const p2 = Math.floor(Date.now() / 1000);
  const p1 = p2 - 8 * 365 * 86400;
  const types = [
    "trailingPeRatio", "trailingEps", "trailingMarketCap",
    "quarterlyDilutedEPS", "annualDilutedEPS",
    "quarterlyOperatingIncome", "annualOperatingIncome",
    "quarterlyTotalAssets", "annualTotalAssets",
    "quarterlyTotalDebt", "annualTotalDebt",
    "quarterlyStockholdersEquity", "annualStockholdersEquity",
  ].join(",");

  for (const h of ["query1", "query2"]) {
    const target = `https://${h}.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${symbol}?type=${types}&period1=${p1}&period2=${p2}`;
    try {
      const r = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept": "application/json,text/plain,*/*",
        },
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

// Kirin — Investment Check: สรุปสั้น ๆ ว่า "ก่อนซื้อรอบนี้ควรตรวจอะไร" ด้วย Workers AI
// หมายเหตุ: worker ไม่รู้ยอดถือจริงของผู้ใช้ (อยู่ใน DIME) prompt จึงห้าม AI สรุปน้ำหนักจริง
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
  // snapshot พ่วงบริบทนโยบาย (สัดส่วนอ้างอิง/จังหวะเงินสด/ตัวที่น่าศึกษา) มาด้วย
  const len = parseInt(request.headers.get("content-length") || "0", 10);
  if (len > 16000) return json({ error: "payload too large" }, 413, cors);

  let snap;
  try { snap = await request.json(); } catch (e) { return json({ error: "bad json" }, 400, cors); }
  if (typeof snap !== "object" || snap === null) return json({ error: "bad payload" }, 400, cors);

  const holdings = Array.isArray(snap.holdings) ? snap.holdings.slice(0, 30) : [];
  if (!holdings.length) return json({ error: "no holdings" }, 400, cors);
  // coerce/cap ทุก field กันการยัดสตริงยาวเพื่อพองต้นทุน prompt
  const s = (v, n) => String(v == null ? "" : v).replace(/[\r\n]+/g, " ").slice(0, n);
  const num = v => (typeof v === "number" && isFinite(v)) ? v : null;
  const SLEEVE_TH = {
    core: "Core Market", mega: "Mega Trend", dividend: "Dividend Growth", income: "Current Income",
  };
  const THEME_TH = {
    ai_infra: "AI Infrastructure", energy_dc: "Energy & Data Center",
    cloud_ai: "Cloud & AI Platforms", ai_app: "AI Applications", health_ai: "Healthcare AI & Silver Economy",
  };
  const lines = holdings.map(h => {
    const price = num(h.price), score = num(h.score), disc = num(h.disc), pe = num(h.pe), yld = num(h.yield);
    const sleeve = SLEEVE_TH[String(h.sleeve || "")] || "อื่น ๆ";
    const theme = THEME_TH[String(h.theme || "")] || null;
    const bits = [`${s(h.t, 8)} [${sleeve}${theme ? " · " + theme : ""}${h.moon ? " · Moonshot" : ""}]`,
                  `ราคา $${price ?? "?"}`];
    if (score != null) bits.push(`คะแนนจังหวะ ${score}/100 = ${s(h.status, 30)}`);
    if (h.noScore) bits.push(`ไม่มีคะแนน: ${s(h.noScore, 60)}`);
    if (h.coreBand) bits.push(`ระดับ DCA: ${s(h.coreBand, 40)}`);
    if (disc != null) bits.push(`ต่ำกว่าจุดสูง52wk ${disc}%`);
    if (pe != null) bits.push(`P/E ${pe} (มัธยฐานอดีต ${num(h.medPE) ?? "?"})`);
    if (yld != null) bits.push(`เงินจ่าย/ปี ${yld}%${num(h.medYield) != null ? ` (ปกติ ${num(h.medYield)}%)` : ""}`);
    if (num(h.divGrowth) != null) bits.push(`เงินจ่ายโต ${num(h.divGrowth)}%/ปี`);
    if (num(h.totalReturn) != null) bits.push(`ผลตอบแทนรวม ${num(h.totalReturn)}%`);
    if (h.yieldDriver) bits.push(`ที่มาของ yield: ${s(h.yieldDriver, 16)}`);
    if (h.incomeLevel) bits.push(`ความยั่งยืนเงินจ่าย: ${s(h.incomeLevel, 40)}`);
    return "- " + bits.join(", ");
  }).join("\n");

  const ledger = s(snap.ledger, 12) || "DIME";
  const ref = (snap.reference && typeof snap.reference === "object") ? snap.reference : {};
  const refLine = ["core", "mega", "dividend", "income"]
    .filter(k => num(ref[k]) != null)
    .map(k => `${SLEEVE_TH[k]} ${num(ref[k])}%`).join(" · ") || "(ไม่มีข้อมูลสัดส่วนอ้างอิง)";
  const top = Array.isArray(snap.top) ? snap.top.slice(0, 5) : [];
  const topLine = top.length
    ? top.map(x => `${s(x.t, 8)}${num(x.score) != null ? `(${num(x.score)})` : ""}${x.limited ? " [ข้อมูลจำกัด]" : ""}`).join(", ")
    : "(ยังไม่มี)";

  // --- GUARDRAIL: คำนวณรายชื่อที่อนุญาต/ห้าม เอง (ไม่พึ่งให้ AI กรอง) ---
  const tk = h => s(h.t, 8).toUpperCase();
  const moonTickers = holdings.filter(h => h.moon).map(tk).filter(Boolean);
  const megaRanked = holdings
    .filter(h => String(h.sleeve) === "mega" && !h.moon && num(h.score) != null)
    .sort((a, b) => num(b.score) - num(a.score));
  const allowList = ["VOO (Core — ปลายทาง DCA หลักเสมอ)"]
    .concat(megaRanked.slice(0, 5).map(h => `${tk(h)}(${num(h.score)})`)).join(", ");
  const denyList = moonTickers.join(", ") || "(ไม่มี)";

  const sys = `คุณคือ "Kirin" (麒麟) ผู้ช่วยตรวจสอบก่อนซื้อของแอป "Buffett Investment Check"
ทำงานตาม Investment Policy Statement (IPS) v${s(snap.ipsVersion, 8) || "2.1"} ของผู้ใช้

สิ่งที่ต้องเข้าใจก่อนตอบ (สำคัญที่สุด):
- แอปนี้ **ไม่รู้พอร์ตจริงของผู้ใช้** ยอดถือจริง น้ำหนักจริง ต้นทุนเฉลี่ย และเงินสดจริง อยู่ใน ${ledger}
- ตัวเลขสัดส่วนที่ให้มาเป็น "สัดส่วนอ้างอิงตามนโยบาย" ไม่ใช่สัดส่วนที่ผู้ใช้ถืออยู่จริง
- หน้าที่ของคุณคือช่วยตอบว่า "ก่อนซื้อรอบนี้ ควรตรวจอะไรบ้าง" ไม่ใช่สั่งให้ซื้อหรือขาย

โครงพอร์ตอ้างอิง (Core มาก่อนเสมอ):
1) Core Market = VOO — ฐานพอร์ต ปลายทางหลักของ DCA
2) Mega Trend — หุ้นธีมรายตัว ตั้งใจให้น้ำหนักเกินตลาด รับความเสี่ยงกระจุกตัวสูงกว่า
3) Dividend Growth = SCHD — คุณภาพและการเติบโตของเงินปันผล ไม่ใช่ผลิตภัณฑ์ yield สูง
4) Current Income = JEPQ — เงินจ่ายรายเดือนจากปันผล + การขายออปชัน ผันผวนได้ ไม่ใช่ตราสารหนี้ ไม่ใช่เงินสด
Moonshot อยู่ภายใน Mega Trend เป็นระดับความเสี่ยง ไม่ใช่ธีมธุรกิจ

คำที่ใช้ได้: "ตามสัดส่วนอ้างอิง", "ควรตรวจสอบใน ${ledger}", "อาจเหมาะกับการพิจารณา", "ข้อมูลยังไม่พอ"
คำที่ห้ามใช้เด็ดขาด (เพราะคุณไม่รู้ยอดจริง):
- "พอร์ตของคุณต่ำกว่าเป้าหมาย" / "คุณถือ X มากเกินไป"
- "คุณควรซื้อจำนวน..." (ห้ามระบุจำนวนเงินหรือจำนวนหุ้น)
- "ต้องเพิ่มน้ำหนักทันที"
- "ขายเพื่อปรับพอร์ต"

ข้อห้ามอื่น:
- ห้ามเรียก JEPQ ว่าตราสารหนี้ เงินฝาก หรือเงินสดสำรอง
- ห้ามบอกว่า yield ที่สูงขึ้นคือข่าวดีโดยอัตโนมัติ — ถ้าสูงขึ้นเพราะราคาลง ต้องอธิบายความเสี่ยงนั้น
- ห้ามสับสนระหว่างผลตอบแทนรวม กับเงินจ่ายที่ได้รับ
- ห้ามรับประกันหรือคาดการณ์ผลตอบแทนในอนาคต
- ห้ามแนะนำให้ขายโดยอ้าง RSI หรือราคาระยะสั้นอย่างเดียว
- ห้ามตีความ Watchlist Opportunity Index ว่าเป็นดัชนีความกลัวของตลาดทั้งตลาด
- ห้ามระบุหุ้น Moonshot ว่าน่าซื้อเพิ่ม แม้คะแนนจะสูง
- ถ้าข้อมูลขาดหรือเก่า ต้องบอกตรง ๆ ห้ามเดาแทน

รูปแบบคำตอบ (ภาษาไทย ใช้ 4 หัวข้อนี้เท่านั้น ตามลำดับ รวมทั้งหมดไม่เกิน 150 คำ
เขียนหัวข้อละ 1-2 บรรทัด ให้จบในการ์ดเดียวไม่ต้องเลื่อนยาว):
Core ตอนนี้:
ธีมที่น่าดู:
ตัวที่ควรรอ:
สิ่งที่ต้องเช็กใน ${ledger}:

ปิดท้ายบรรทัดเดียวว่าเป็นมุมมองเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน`;

  const gauge = num(snap.gauge);
  const user = `สแนปช็อตสภาพตลาด ณ ${s(snap.time, 40) || "ตอนนี้"}

สัดส่วนอ้างอิงตามนโยบาย (ไม่ใช่ยอดจริง): ${refLine}
จังหวะใช้เงินสดจากสภาพตลาด: ${s(snap.cashTiming, 60) || "ไม่มีข้อมูล"}
Watchlist Opportunity Index (ค่าเฉลี่ยของหุ้นใน watchlist ที่ประเมินได้ ไม่ใช่ดัชนีตลาด): ${gauge ?? "ไม่มีข้อมูล"}/100${num(snap.gaugeN) ? ` จาก ${num(snap.gaugeN)} ตัว` : ""}
ตัวที่ระบบจัดว่าน่าศึกษาต่อรอบนี้: ${topLine}

รายตัว:
${lines}

ข้อบังคับเด็ดขาด (ห้ามฝ่าฝืน):
- หัวข้อ "ธีมที่น่าดู" ให้อ้างถึงธีมและตัวอย่างหุ้นจากลิสต์นี้เท่านั้น: ${allowList}
- ห้ามระบุหุ้นเหล่านี้ว่าน่าซื้อเพิ่ม (พูดได้เฉพาะในเชิงความเสี่ยง): ${denyList}
- ห้ามสรุปว่าน้ำหนักจริงของผู้ใช้สูงหรือต่ำกว่าเป้า ให้บอกว่า "ต้องตรวจใน ${ledger}" แทน
- ถ้าตัวที่อนุญาตยังแพง ให้บอกตรง ๆ ว่ารอได้ อย่าฝืนเชียร์

ช่วยสรุปตามรูปแบบ 4 หัวข้อที่กำหนด`;

  const MODELS = {
    "llama": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "sealion": "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
  };
  const model = MODELS[snap.model] || MODELS.llama;

  // ส่วน "Core ตอนนี้" + "ธีมที่น่าดู" — moonshot ต้องไม่โผล่ในสองหัวข้อนี้
  // ตัดตั้งแต่ต้นคำตอบถึงหัวข้อ "ตัวที่ควรรอ" (ซึ่งพูดถึง moonshot เชิงความเสี่ยงได้)
  // ถ้าหาหัวข้อไม่เจอ ให้ตรวจทั้งข้อความ (เข้มไว้ก่อน)
  const accumPart = txt => {
    const end = txt.search(/ตัวที่ควรรอ|ควรรอ|ความเสี่ยง|ข้อควรระวัง|ต้องเช็ก/);
    return (end > 0 ? txt.slice(0, end) : txt).toUpperCase();
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
      const stricter = `\n\n[แก้ไข] ครั้งก่อนคุณระบุ ${leaked.join(", ")} ในหัวข้อ "Core ตอนนี้" หรือ "ธีมที่น่าดู" ซึ่งผิดกฎ — หุ้นเหล่านี้เป็น Moonshot ห้ามอยู่ในสองหัวข้อนั้นเด็ดขาด ให้ย้ายไปหัวข้อ "ตัวที่ควรรอ" เท่านั้น แล้วเขียนใหม่ทั้งหมดตามรูปแบบ 4 หัวข้อ`;
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
