/* ============================================================================
 * portfolio-engine.js — ตรรกะการคำนวณทั้งหมด (pure, deterministic, testable)
 *
 * ไฟล์นี้ไม่ยิงเน็ต ไม่แตะ DOM ไม่แตะ localStorage โดยตรง
 * รับข้อมูลเข้า -> คืนผลลัพธ์ ทำให้ทดสอบด้วย node --test ได้ตรง ๆ
 *
 * หลักการสำคัญ:
 *   1. ข้อมูลที่หายไปคืน null พร้อมสถานะ "missing" — ห้ามแปลงเป็น 0
 *   2. ทุกตัวเลขที่เปลี่ยนตามเวลา ต้องพ่วง asOf กลับไปด้วย
 *   3. ไม่มีฟังก์ชันไหนสั่งซื้อ/ขาย/rebalance
 *   4. ห้ามสรุปว่า "น้ำหนักจริงต่ำ/เกินเป้า" เพราะแอปไม่รู้ยอดจริง (อยู่ใน DIME)
 *      คำนวณน้ำหนักได้เฉพาะตอนผู้ใช้กรอกตัวเลขเองใน Quick DIME Check เท่านั้น
 * ========================================================================== */

/* eslint-env browser, node */
(function (root, factory) {
  const cfg = (typeof module !== "undefined" && module.exports)
    ? require("./ips-config.js")
    : root.IPS_CONFIG;
  const api = factory(cfg);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.PORTFOLIO_ENGINE = api;
})(typeof self !== "undefined" ? self : this, function (CFG) {
"use strict";

const {
  REFERENCE_ALLOCATION, referenceTargetPct, MEGA_THEMES, RISK_LIMITS,
  CORE_DCA_BANDS, CASH_TIMING, SCORE_BANDS, SECURITIES, universe, isMoonshot, STORAGE,
} = CFG;

/* ---------------------------------------------------------------------------
 * 0. DATA-QUALITY PRIMITIVES
 * ------------------------------------------------------------------------- */

const STALE_AFTER_MS = 36 * 3600 * 1000;

/** ห่อค่าให้มี metadata ครบ — value=null คือ "ไม่มีข้อมูล" ไม่ใช่ "ศูนย์" */
function metric(value, opts) {
  const o = opts || {};
  const has = value !== null && value !== undefined && !(typeof value === "number" && !isFinite(value));
  let state = o.state || (has ? "ok" : "missing");
  if (state === "ok" && o.asOfMs && Date.now() - o.asOfMs > (o.staleAfterMs || STALE_AFTER_MS)) state = "stale";
  return {
    value: has ? value : null,
    source: o.source || null, asOf: o.asOf || null, asOfMs: o.asOfMs || null,
    state, note: o.note || null,
  };
}

const isNum = (v) => typeof v === "number" && isFinite(v);
function pct(part, whole) {
  if (!isNum(part) || !isNum(whole) || whole === 0) return null;
  return (part / whole) * 100;
}
function median(arr) {
  if (!arr || !arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
const clamp01 = (v) => Math.max(0, Math.min(100, v));
const round = (v, d = 2) => (isNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/* ---------------------------------------------------------------------------
 * 1. INDICATORS
 * ------------------------------------------------------------------------- */

/** Wilder's RSI — มาตรฐานเดียวกับแพลตฟอร์มเทรดทั่วไป */
function rsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let ag = gain / period, al = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

function sma(closes, n) {
  if (!closes || closes.length < n) return null;
  let s = 0;
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i];
  return s / n;
}

function drawdownPct(price, hi52) {
  if (!isNum(price) || !isNum(hi52) || hi52 <= 0) return null;
  return Math.max(0, ((hi52 - price) / hi52) * 100);
}

/* ---------------------------------------------------------------------------
 * 2. INDIVIDUAL-STOCK BUFFETT SCORE — น้ำหนักเดิม 50/30/20
 * ------------------------------------------------------------------------- */

const okVal = (v) => !!(v && isNum(v.ratio) && v.ratio > 0);

function buffettScore({ price, hi52, rsiv, val }) {
  const W = CFG.BUFFETT_WEIGHTS;
  const parts = [];
  // 1) Valuation: P/E ปัจจุบัน เทียบมัธยฐาน P/E ในอดีตของตัวเอง (0.7 -> 100, 1.3 -> 0)
  if (okVal(val)) parts.push({ s: clamp01(((1.3 - val.ratio) / 0.6) * 100), w: W.valuation });
  // 2) ส่วนลดจาก High 52w: 0% -> 0, 35%+ -> 100 (ไม่มีข้อมูล = ไม่นับ ไม่ใช่หักคะแนน)
  const dd = drawdownPct(price, hi52);
  if (dd !== null) parts.push({ s: Math.min(100, (dd / 35) * 100), w: W.drawdown });
  // 3) RSI: 30 -> 100 (oversold), 70 -> 0 (overbought)
  if (isNum(rsiv)) parts.push({ s: clamp01(((70 - rsiv) / 40) * 100), w: W.rsi });
  const tw = parts.reduce((s, p) => s + p.w, 0);
  return tw ? Math.round(parts.reduce((s, p) => s + p.s * p.w, 0) / tw) : 50;
}

function signal(score) {
  if (score >= 70) return { l: "โอกาสซื้อ STRONG", c: "var(--green)",  bg: "rgba(38,194,129,.15)" };
  if (score >= SCORE_BANDS.good) return { l: "ทยอยสะสม", c: "var(--teal)", bg: "rgba(45,212,191,.15)" };
  if (score >= SCORE_BANDS.wait) return { l: "ถือ / รอจังหวะ", c: "var(--yellow)", bg: "rgba(240,192,64,.13)" };
  if (score >= 25) return { l: "แพง · รอย่อ", c: "var(--orange)", bg: "rgba(245,158,66,.13)" };
  return { l: "แพงมาก · WAIT", c: "var(--red)", bg: "rgba(239,83,101,.13)" };
}

/**
 * โหมดของการ์ด — sleeve เป็นตัวกำหนดหลัก
 *   core     -> core_market            (DCA + ระดับโอกาสจาก drawdown ไม่ใช้ P/E ดัชนี)
 *   dividend -> dividend_growth        (SCHD)
 *   income   -> current_income_option  (JEPQ)
 *   moonshot -> dca                    (ราคาร่วงแรงทำให้คะแนนจังหวะสูงหลอก)
 *   mega     -> timing ถ้ามูลค่าเชื่อถือได้ / dca ถ้าไม่พอ
 */
function cardMode(sec, val) {
  if (sec.sleeve === "core")     return { m: "core_market", why: "" };
  if (sec.sleeve === "dividend") return { m: "dividend_growth", why: "" };
  if (sec.sleeve === "income")   return { m: "current_income_option", why: "" };
  if (isMoonshot(sec)) {
    return { m: "dca", why: "Moonshot — ราคาร่วงแรงทำให้คะแนนจังหวะสูงหลอก (falling knife) จึงไม่ให้คะแนน" };
  }
  if (!okVal(val)) return { m: "dca", why: (val && val.reason) || "ข้อมูลมูลค่าไม่พอ" };
  return { m: "timing", why: "" };
}

/**
 * มูลค่าเทียบอดีตของตัวเอง — ใช้ร่วมกันทั้งหุ้นสหรัฐและหุ้นไทย
 *   annual   : [{d:"YYYY-MM-DD", eps}]   EPS งบปี (diluted)
 *   monthly  : [{t:<unix sec>, c:<close>}] ราคารายเดือนย้อนหลัง ~5 ปี
 *   price    : ราคาล่าสุด
 * คืน { eps, medPE, curPE, ratio } หรือ { reason } เมื่อข้อมูลไม่ผ่าน VALUATION_GUARDS
 * งบออกช้ากว่าปิดงวด ~45 วัน จึงหน่วงก่อนนำ EPS ไปจับคู่กับราคา
 */
const EPS_LAG_MS = 45 * 86400 * 1000;
function valuationFromHistory({ annual, monthly, price, nowMs }) {
  const G = CFG.VALUATION_GUARDS;
  const ann = (annual || []).filter((x) => x && isNum(x.eps) && x.d)
    .slice().sort((a, b) => new Date(a.d) - new Date(b.d));
  const pos = ann.filter((x) => x.eps > 0);
  if (ann.length < G.minAnnualPeriods) return { reason: `งบปีย้อนหลังไม่พอ (ต้องมี ≥ ${G.minAnnualPeriods} ปี)` };
  if (pos.length < 2) return { reason: "บริษัทขาดทุน — ไม่มี P/E ให้เทียบ" };
  const hi = Math.max(...pos.map((x) => x.eps)), lo = Math.min(...pos.map((x) => x.eps));
  if (hi / lo > G.maxEpsSpread) {
    return { reason: `กำไรโตเร็วเกินกว่าจะเทียบอดีต (EPS ${lo.toFixed(2)}→${hi.toFixed(2)} = ${(hi / lo).toFixed(1)}×)` };
  }
  const epsAt = (tm) => { let e = null; for (const x of ann) if (new Date(x.d).getTime() + EPS_LAG_MS <= tm) e = x.eps; return e; };
  const pes = [];
  for (const p of monthly || []) {
    if (!p || !isNum(p.c) || !isNum(p.t)) continue;
    const e = epsAt(p.t * 1000);
    if (e != null && e > 0) pes.push(p.c / e);
  }
  // needsHistory=true: งบผ่านด่านแล้ว ขาดแค่ราคาย้อนหลัง (ผู้เรียกใช้ตัดสินใจว่าจะดึงราคา 5 ปีหรือไม่)
  if (pes.length < G.minPePoints) return { reason: `ประวัติ P/E สั้นเกินไป (${pes.length}/${G.minPePoints} เดือน)`, needsHistory: true };
  pes.sort((a, b) => a - b);
  const medPE = pes[Math.floor(pes.length / 2)];
  const eps = epsAt(isNum(nowMs) ? nowMs : Date.now()) ?? ann[ann.length - 1].eps;
  if (!(eps > 0)) return { reason: "กำไรงบปีล่าสุดติดลบ" };
  if (!isNum(price) || price <= 0) return { eps, medPE, reason: "ไม่มีราคาล่าสุด" };
  const curPE = price / eps;
  return { eps, medPE, curPE, ratio: curPE / medPE };
}

/**
 * ให้คะแนนหุ้นรายตัวด้วยตรรกะเดียวกับ Mega Trend (ใช้กับหุ้นไทยที่ไม่มี sleeve)
 * คืน { mode, modeWhy, score }  — score มีเฉพาะโหมด timing
 */
function scoreStock({ price, hi52, rsiv, val }) {
  const m = cardMode({ sleeve: "mega" }, val);
  return { mode: m.m, modeWhy: m.why, score: m.m === "timing" ? buffettScore({ price, hi52, rsiv, val }) : null };
}

/** เฉพาะการ์ดโหมด timing เท่านั้นที่เข้า Watchlist Opportunity Index */
function watchlistIndex(scoresByTicker) {
  const vals = Object.values(scoresByTicker || {}).filter(isNum);
  if (!vals.length) return { value: null, n: 0, state: "missing" };
  return { value: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), n: vals.length, state: "ok" };
}

/* ---------------------------------------------------------------------------
 * 3. VOO CORE — DCA OPPORTUNITY LEVEL + จังหวะใช้เงินสด
 * ------------------------------------------------------------------------- */

function coreDcaLevel(ddPct) {
  if (!isNum(ddPct)) return null;
  for (const b of CORE_DCA_BANDS) if (ddPct < b.maxDrawdownPct) return b;
  return CORE_DCA_BANDS[CORE_DCA_BANDS.length - 1];
}

/**
 * "จังหวะใช้เงินสด" — อิงสภาพตลาดที่สังเกตได้ (drawdown ของ Core) เท่านั้น
 * ไม่อิงสัดส่วนเงินสดจริง เพราะแอปไม่รู้ยอดเงินสดของผู้ใช้
 * และไม่มีสถานะไหนที่แปลว่า "ใช้เงินสดทั้งหมดทีเดียว"
 */
function cashTiming(ddPct) {
  const band = coreDcaLevel(ddPct);
  if (!band) return null;
  return CASH_TIMING.find((c) => c.level === band.level) || null;
}

/** RSI เป็นข้อความประกอบ ไม่ใช่คำแนะนำซื้อ */
function rsiContext(rsiv) {
  if (!isNum(rsiv)) return null;
  if (rsiv < 30) return "RSI ต่ำกว่า 30 — ราคาถูกขายลงมาเร็วในระยะสั้น (ข้อมูลประกอบเท่านั้น)";
  if (rsiv > 70) return "RSI สูงกว่า 70 — ราคาวิ่งขึ้นเร็วในระยะสั้น (ข้อมูลประกอบเท่านั้น)";
  return "RSI อยู่ในช่วงปกติ (ข้อมูลประกอบเท่านั้น)";
}

/* ---------------------------------------------------------------------------
 * 4. DISTRIBUTION ANALYTICS (SCHD / JEPQ)
 *    รับ divs = [{date: unixSec, amount}] และ series = {ts:[], close:[]}
 * ------------------------------------------------------------------------- */

const YEAR_SEC = 365.25 * 86400;

function ttmSum(divs, atSec) {
  if (!divs || !divs.length) return null;
  const inWin = divs.filter((d) => d.date > atSec - YEAR_SEC && d.date <= atSec);
  if (!inWin.length) return null;
  return inWin.reduce((s, d) => s + d.amount, 0);
}

/** ทุกฟิลด์เป็น null ได้ ถ้าข้อมูลไม่พอ (ห้ามเดา) */
function distributionStats(divs, series, nowSec) {
  const out = {
    ttmDiv: null, ttmDivPrev: null, growthCagrPct: null, growthYears: null,
    medYieldPct: null, yieldPoints: 0, distPerYear: null, monthsWithDist12: null,
    variabilityCvPct: null, lastDistDate: null, historyYears: null,
  };
  if (!divs || divs.length < 2) return out;
  const d = divs.slice().filter((x) => x && isNum(x.amount) && x.amount > 0 && isNum(x.date))
                .sort((a, b) => a.date - b.date);
  if (d.length < 2) return out;
  const now = isNum(nowSec) ? nowSec : Date.now() / 1000;

  out.lastDistDate = d[d.length - 1].date;
  out.historyYears = (now - d[0].date) / YEAR_SEC;
  out.ttmDiv = ttmSum(d, now);

  const last12 = d.filter((x) => x.date > now - YEAR_SEC);
  out.distPerYear = last12.length || null;
  if (last12.length) {
    const months = new Set(last12.map((x) => new Date(x.date * 1000).toISOString().slice(0, 7)));
    out.monthsWithDist12 = months.size;
    const amts = last12.map((x) => x.amount);
    const mean = amts.reduce((a, b) => a + b, 0) / amts.length;
    if (mean > 0 && amts.length >= 3) {
      const varc = amts.reduce((s, a) => s + (a - mean) ** 2, 0) / amts.length;
      out.variabilityCvPct = (Math.sqrt(varc) / mean) * 100;
    }
  }

  // การเติบโตของเงินจ่าย: CAGR เทียบ TTM ย้อนหลังสูงสุด 3 ปี ตามข้อมูลที่มีจริง
  const back = Math.min(3, Math.floor(out.historyYears - 1));
  if (back >= 1 && isNum(out.ttmDiv)) {
    const past = ttmSum(d, now - back * YEAR_SEC);
    if (isNum(past) && past > 0) {
      out.ttmDivPrev = past;
      out.growthYears = back;
      out.growthCagrPct = (Math.pow(out.ttmDiv / past, 1 / back) - 1) * 100;
    }
  }

  // มัธยฐาน yield ในอดีต: yield(t) = TTM ณ เวลานั้น / ราคาปิด ณ เวลานั้น
  if (series && series.ts && series.close) {
    const ys = [];
    for (let i = 0; i < series.ts.length; i++) {
      const c = series.close[i];
      if (!isNum(c) || c <= 0) continue;
      if (series.ts[i] < d[0].date + YEAR_SEC) continue;
      const t = ttmSum(d, series.ts[i]);
      if (isNum(t) && t > 0) ys.push((t / c) * 100);
    }
    out.yieldPoints = ys.length;
    if (ys.length >= 12) out.medYieldPct = median(ys);
  }
  return out;
}

/** แยกว่า yield ที่เปลี่ยนไป มาจาก "เงินจ่ายโต" หรือ "ราคาร่วง" */
function yieldDriver({ ttmDiv, ttmDivPrev, price, pricePrev }) {
  if (![ttmDiv, ttmDivPrev, price, pricePrev].every(isNum) || ttmDivPrev <= 0 || pricePrev <= 0) return null;
  const distChgPct = (ttmDiv / ttmDivPrev - 1) * 100;
  const priceChgPct = (price / pricePrev - 1) * 100;
  let driver, riskTh;
  if (distChgPct >= 0 && priceChgPct >= 0) {
    driver = "both_up"; riskTh = "เงินจ่ายและราคาไปด้วยกัน — ยังไม่มีสัญญาณผิดปกติ";
  } else if (distChgPct >= 0 && priceChgPct < 0) {
    driver = "price_down";
    riskTh = "Yield สูงขึ้นส่วนหนึ่งเพราะราคาลดลง ไม่ใช่เพราะเงินจ่ายโตอย่างเดียว — ต้องดูสาเหตุที่ราคาลง";
  } else if (distChgPct < 0 && priceChgPct < 0) {
    driver = "both_down";
    riskTh = "ทั้งเงินจ่ายและราคาลดลง — ตรวจสอบว่ากลยุทธ์กองทุนหรือตลาดอ้างอิงเปลี่ยนไปหรือไม่";
  } else {
    driver = "dist_down";
    riskTh = "เงินจ่ายลดลงแม้ราคาขึ้น — เงินจ่ายรายงวดของกองทุนแบบนี้ไม่คงที่ตามปกติ";
  }
  return { driver, distChgPct, priceChgPct, riskTh };
}

/** ผลตอบแทนรวม (%) จากซีรีส์ adjusted close — คืน null ถ้าไม่มี adjclose */
function totalReturnPct(adjClose) {
  if (!adjClose || adjClose.length < 2) return null;
  const clean = adjClose.filter(isNum);
  if (clean.length < 2 || clean[0] <= 0) return null;
  return (clean[clean.length - 1] / clean[0] - 1) * 100;
}

/* ---------------------------------------------------------------------------
 * 5. SCHD — DIVIDEND GROWTH VIEW
 *    ห้ามแนะนำเพียงเพราะ yield สูง
 * ------------------------------------------------------------------------- */

const DIV_GROWTH_WEIGHTS = { yieldVsOwnHistory: 40, growthTrend: 30, consistency: 15, drawdown: 15 };

function dividendGrowthScore({ curYieldPct, stats, ddPct }) {
  const parts = [], missing = [];

  if (isNum(curYieldPct) && stats && isNum(stats.medYieldPct) && stats.medYieldPct > 0) {
    const r = curYieldPct / stats.medYieldPct;            // 0.9 -> 0, 1.2 -> 100
    parts.push({ s: clamp01(((r - 0.9) / 0.3) * 100), w: DIV_GROWTH_WEIGHTS.yieldVsOwnHistory });
  } else missing.push("yield เทียบอดีตของตัวเอง");

  if (stats && isNum(stats.growthCagrPct)) {
    parts.push({ s: clamp01((stats.growthCagrPct / 10) * 100), w: DIV_GROWTH_WEIGHTS.growthTrend });
  } else missing.push("การเติบโตของเงินจ่าย");

  if (stats && isNum(stats.distPerYear)) {
    parts.push({ s: clamp01((stats.distPerYear / 4) * 100), w: DIV_GROWTH_WEIGHTS.consistency });
  } else missing.push("ความสม่ำเสมอของเงินจ่าย");

  if (isNum(ddPct)) {
    parts.push({ s: Math.min(100, (ddPct / 20) * 100), w: DIV_GROWTH_WEIGHTS.drawdown });
  } else missing.push("ส่วนลดจากจุดสูง 52 สัปดาห์");

  const tw = parts.reduce((s, p) => s + p.w, 0);
  const coverage = tw / 100;
  if (coverage < 0.5) {
    return { score: null, coverage, missing, state: "missing",
             messageTh: "ข้อมูลการเติบโตของเงินจ่ายไม่เพียงพอ" };
  }
  return {
    score: Math.round(parts.reduce((s, p) => s + p.s * p.w, 0) / tw),
    coverage, missing,
    state: missing.length ? "partial" : "ok",
    messageTh: missing.length ? ("ข้อมูลไม่ครบ: " + missing.join(", ")) : null,
  };
}

function dividendGrowthSignal(res) {
  if (!res || res.score === null) return { l: "ข้อมูลไม่พอ", c: "var(--mut)", bg: "rgba(93,106,130,.13)" };
  if (res.score >= 65) return { l: "ปันผลแข็งแรง · ราคาน่าสะสม", c: "var(--green)", bg: "rgba(38,194,129,.15)" };
  if (res.score >= 45) return { l: "ปกติ · DCA ตามแผน",          c: "var(--teal)",  bg: "rgba(45,212,191,.13)" };
  return { l: "ยังไม่ต้องรีบเพิ่มน้ำหนัก", c: "var(--yellow)", bg: "rgba(240,192,64,.13)" };
}

/* ---------------------------------------------------------------------------
 * 6. JEPQ — CURRENT INCOME VIEW
 *    ห้ามให้ "ดีขึ้นอัตโนมัติเมื่อ yield สูงขึ้น"
 * ------------------------------------------------------------------------- */

function incomeSustainabilityView({ curYieldPct, stats, ddPct, rsiv, driver, totalReturn }) {
  const flags = [], missing = [];

  if (!isNum(curYieldPct)) missing.push("distribution yield ปัจจุบัน");
  if (!stats || !isNum(stats.monthsWithDist12)) missing.push("ความสม่ำเสมอของเงินจ่ายรายเดือน");
  if (!stats || !isNum(stats.variabilityCvPct)) missing.push("ความผันผวนของเงินจ่าย");
  if (!isNum(ddPct)) missing.push("ส่วนลดจากจุดสูง 52 สัปดาห์");
  if (!isNum(totalReturn)) missing.push("ผลตอบแทนรวม");

  if (stats && isNum(stats.monthsWithDist12) && stats.monthsWithDist12 < 12) {
    flags.push({ level: "warn", th: `จ่ายเงิน ${stats.monthsWithDist12} เดือนจาก 12 เดือนล่าสุด — ไม่ได้จ่ายครบทุกเดือน` });
  }
  if (stats && isNum(stats.variabilityCvPct) && stats.variabilityCvPct >= 25) {
    flags.push({ level: "warn", th: `เงินจ่ายแต่ละงวดต่างกันมาก (ผันผวน ~${Math.round(stats.variabilityCvPct)}%) — วางแผนใช้เงินแบบคงที่ไม่ได้` });
  }
  if (driver && (driver.driver === "price_down" || driver.driver === "both_down")) {
    flags.push({ level: "risk", th: driver.riskTh });
  }
  if (isNum(totalReturn) && totalReturn < 0) {
    flags.push({ level: "risk", th: "ผลตอบแทนรวมติดลบในช่วงที่วัด — เงินจ่ายที่ได้รับไม่ได้แปลว่าพอร์ตโตขึ้น" });
  }

  let level = "review", labelTh = "ข้อมูลไม่พอสรุป", color = "var(--mut)";
  const haveCore = stats && isNum(stats.monthsWithDist12) && isNum(stats.variabilityCvPct);
  if (haveCore) {
    const risky = flags.some((f) => f.level === "risk");
    if (!risky && stats.monthsWithDist12 >= 11 && stats.variabilityCvPct < 25) {
      level = "steady"; labelTh = "จ่ายสม่ำเสมอ · ตามบทบาท Current Income"; color = "var(--teal)";
    } else if (risky) {
      level = "watch"; labelTh = "ต้องดูที่มาของ Yield"; color = "var(--orange)";
    } else {
      level = "variable"; labelTh = "เงินจ่ายไม่สม่ำเสมอ"; color = "var(--yellow)";
    }
  }
  return {
    label: "Current Income View", level, labelTh, color, flags, missing,
    state: missing.length ? (haveCore ? "partial" : "missing") : "ok",
    rsiNote: rsiContext(rsiv),
    educationTh: CFG.JEPQ_EDUCATION_TH,
  };
}

/* ---------------------------------------------------------------------------
 * 7. OPPORTUNITY STATUS & FILTERS
 * ------------------------------------------------------------------------- */

/** ป้ายสถานะสั้น ๆ ของการ์ดหนึ่งใบ (ใช้ทั้ง collapsed card และหน้าภาพรวม) */
function opportunityStatus(card) {
  if (!card || card.error) return { key: "error", labelTh: "โหลดข้อมูลไม่สำเร็จ", color: "var(--red)" };
  if (card.mode === "core_market") {
    const b = card.core;
    return b ? { key: b.key, labelTh: b.labelTh, color: b.color }
             : { key: "missing", labelTh: "ข้อมูลไม่พอประเมิน", color: "var(--mut)" };
  }
  if (card.mode === "timing") {
    const s = card.score;
    if (s >= SCORE_BANDS.good) return { key: "good", labelTh: "น่าสนใจ", color: "var(--green)" };
    if (s >= SCORE_BANDS.wait) return { key: "hold", labelTh: "ถือ / รอจังหวะ", color: "var(--yellow)" };
    return { key: "wait", labelTh: "รอราคา", color: "var(--orange)" };
  }
  if (card.mode === "dividend_growth" || card.mode === "current_income_option") {
    return { key: "income", labelTh: "ดูที่บทบาทรายได้", color: "var(--teal)" };
  }
  return { key: "dca", labelTh: "DCA ตามแผน", color: "var(--blue)" };
}

/** ฟิลเตอร์สถานะในแท็บ Mega Trend */
function matchesStatusFilter(sec, card, filterKey) {
  if (!filterKey || filterKey === "all") return true;
  if (filterKey === "moon") return isMoonshot(sec);
  if (!card || card.error) return false;
  const st = opportunityStatus(card);
  if (filterKey === "scored") return card.mode === "timing";
  if (filterKey === "dca")    return card.mode === "dca";
  if (filterKey === "good")   return st.key === "good";
  if (filterKey === "wait")   return st.key === "wait";
  return true;
}

/* ---------------------------------------------------------------------------
 * 8. TOP OPPORTUNITIES — "โอกาสที่ควรศึกษาเพิ่ม" (ไม่ใช่คำแนะนำให้ซื้อ)
 *
 * กติกาการจัดอันดับ:
 *   - Moonshot ไม่เข้าชิง (เป็นระดับความเสี่ยง ไม่ใช่ตัวเลือกเชิงคุณภาพ)
 *   - ตัวที่มีข้อมูลมูลค่าครบ (mode=timing) อยู่เหนือกว่าตัวที่ข้อมูลไม่ครบ "เสมอ"
 *     -> หุ้นที่ร่วงแรงแต่ประเมินมูลค่าไม่ได้ จะไม่ขึ้นมาอันดับหนึ่งเพราะร่วงเยอะ
 *   - คุณภาพธุรกิจ (quality) และความครบของข้อมูล ถ่วงน้ำหนักร่วมกับคะแนนจังหวะ
 *   - กระจายธีม: หยิบธีมละไม่เกิน 1 ตัวก่อน แล้วค่อยเติมถ้ายังไม่ครบ
 * ------------------------------------------------------------------------- */

const QUALITY_POINTS = { 1: 100, 2: 70, 3: 40 };

/** ความครบของข้อมูลที่ใช้ตัดสินใจ (0..1) */
function dataCompleteness(card) {
  if (!card) return 0;
  const checks = [okVal(card.val), isNum(card.dd), isNum(card.rsi)];
  return checks.filter(Boolean).length / checks.length;
}

function candidateReason(sec, card) {
  const bits = [];
  if (okVal(card.val)) {
    const diff = (1 - card.val.ratio) * 100;
    bits.push(diff >= 0
      ? `P/E ต่ำกว่ามัธยฐานอดีตของตัวเอง ~${Math.round(diff)}%`
      : `P/E สูงกว่ามัธยฐานอดีตของตัวเอง ~${Math.round(-diff)}%`);
  }
  if (isNum(card.dd) && card.dd >= 5) bits.push(`ราคาต่ำกว่าจุดสูง 52 สัปดาห์ ${Math.round(card.dd)}%`);
  if (!bits.length) bits.push("ยังไม่มีส่วนลดที่ชัดเจน — ติดตามต่อ");
  return bits.join(" · ");
}

/**
 * @param cards  map { TICKER: cardData }
 * @param opts   { limit }
 * @returns array of { ticker, sec, card, status, score, composite, limitedData, reasonTh, riskTh, themeKey }
 */
function rankOpportunities(cards, opts) {
  const limit = (opts && opts.limit) || CFG.MAX_TOP_OPPORTUNITIES;
  const rows = [];
  for (const sec of universe()) {
    if (sec.sleeve !== "mega" || isMoonshot(sec)) continue;
    const card = cards && cards[sec.t];
    if (!card || card.error) continue;
    const q = QUALITY_POINTS[sec.quality] || 40;
    const comp = dataCompleteness(card);
    const scored = card.mode === "timing" && isNum(card.score);
    let composite;
    if (scored) {
      composite = 0.60 * card.score + 0.25 * q + 0.15 * comp * 100;
    } else {
      // ไม่มีมูลค่าให้เทียบ — ใช้ส่วนลดราคาได้บ้าง แต่ต้องอยู่ชั้นล่างเสมอ
      const ddScore = isNum(card.dd) ? Math.min(100, (card.dd / 35) * 100) : 0;
      composite = 0.50 * ddScore + 0.35 * q + 0.15 * comp * 100;
    }
    rows.push({
      ticker: sec.t, sec, card, tier: scored ? 0 : 1,
      status: opportunityStatus(card),
      score: scored ? card.score : null,
      composite: round(composite, 2),
      limitedData: !scored,
      limitationTh: scored ? null : ((card.modeWhy || "ข้อมูลมูลค่าไม่พอ") + " — จัดอันดับได้จำกัด"),
      reasonTh: candidateReason(sec, card),
      riskTh: sec.riskTh || null,
      themeKey: sec.theme || null,
    });
  }
  // ตัวที่มีข้อมูลครบมาก่อนเสมอ แล้วค่อยเรียงตาม composite
  rows.sort((a, b) => (a.tier - b.tier) || (b.composite - a.composite));

  // กระจายธีม: รอบแรกธีมละ 1 ตัว รอบสองค่อยเติมที่เหลือ
  const picked = [], usedThemes = new Set();
  for (const r of rows) {
    if (picked.length >= limit) break;
    if (r.themeKey && usedThemes.has(r.themeKey)) continue;
    picked.push(r); if (r.themeKey) usedThemes.add(r.themeKey);
  }
  for (const r of rows) {
    if (picked.length >= limit) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked.slice(0, limit).map((r, i) => Object.assign({ rank: i + 1 }, r));
}

/* ---------------------------------------------------------------------------
 * 9. QUICK DIME CHECK — เครื่องคิดเลขชั่วคราวสำหรับตรวจสัดส่วนก่อนซื้อ
 *
 * แอปไม่รู้ยอดจริง ผู้ใช้ต้องเปิด DIME แล้วกรอกเอง
 * ค่าที่กรอกไม่ถูกบันทึกโดยอัตโนมัติ (ดู STORAGE.quickCheckKey)
 * ค่าว่าง = "ไม่ทราบ" ห้ามแปลงเป็น 0 เงียบ ๆ
 * ------------------------------------------------------------------------- */

/** แปลงค่าที่ผู้ใช้พิมพ์เป็นตัวเลข — ว่าง = null (ไม่ทราบ) ไม่ใช่ 0 */
function parseAmount(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/[, ]/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (!isFinite(n) || n < 0) return null;
  return n;
}

const INSUFFICIENT_TH = "กรอกข้อมูลไม่พอสำหรับคำนวณ";

function quickDimeCheck(input, ticker) {
  const totalListed = parseAmount(input && input.totalListed);
  const positionValue = parseAmount(input && input.positionValue);
  const buyAmount = parseAmount(input && input.buyAmount);
  const megaValue = parseAmount(input && input.megaValue);

  const missing = [];
  if (totalListed === null) missing.push("มูลค่าพอร์ตหุ้นรวมโดยประมาณ");
  if (positionValue === null) missing.push("มูลค่าที่ถืออยู่ของตัวนี้");
  if (buyAmount === null) missing.push("จำนวนเงินที่จะซื้อรอบนี้");
  if (missing.length || totalListed <= 0) {
    return { ok: false, missing, messageTh: INSUFFICIENT_TH,
             weightBeforePct: null, weightAfterPct: null, megaWeightAfterPct: null, warnings: [] };
  }

  const totalAfter = totalListed + buyAmount;
  const weightBeforePct = pct(positionValue, totalListed);
  const weightAfterPct = pct(positionValue + buyAmount, totalAfter);
  const sec = SECURITIES[String(ticker || "").toUpperCase()] || null;

  // น้ำหนัก Mega Trend คำนวณได้ต่อเมื่อผู้ใช้กรอกมูลค่า sleeve มาด้วยเท่านั้น
  let megaWeightAfterPct = null;
  if (megaValue !== null) {
    const addsToMega = !!(sec && sec.sleeve === "mega");
    megaWeightAfterPct = pct(megaValue + (addsToMega ? buyAmount : 0), totalAfter);
  }

  const warnings = [];
  const L = RISK_LIMITS;
  if (sec && isMoonshot(sec)) {
    if (weightAfterPct > L.moonshotSinglePositionMaxPct) {
      warnings.push({ level: "hard",
        th: `หลังซื้อ ${sec.t} จะเป็น ${round(weightAfterPct, 1)}% ของพอร์ตหุ้น เกินเพดาน Moonshot รายตัว ${L.moonshotSinglePositionMaxPct}%` });
    }
  } else if (sec && sec.sleeve === "mega") {
    if (weightAfterPct > L.singleStockHardPct) {
      warnings.push({ level: "hard",
        th: `หลังซื้อ ${sec.t} จะเป็น ${round(weightAfterPct, 1)}% เกินระดับที่ควรทบทวน ${L.singleStockHardPct}%` });
    } else if (weightAfterPct > L.singleStockWarnPct) {
      warnings.push({ level: "warn",
        th: `หลังซื้อ ${sec.t} จะเป็น ${round(weightAfterPct, 1)}% เกินเป้าหมายเริ่มต้นรายตัว ${L.singleStockWarnPct}%` });
    }
  }
  if (isNum(megaWeightAfterPct)) {
    const megaTarget = referenceTargetPct("mega");
    if (megaWeightAfterPct > megaTarget) {
      warnings.push({ level: "warn",
        th: `หลังซื้อ กลุ่ม Mega Trend จะเป็น ${round(megaWeightAfterPct, 1)}% สูงกว่าสัดส่วนอ้างอิง ${megaTarget}%` });
    }
  }
  return {
    ok: true, missing: [], messageTh: null,
    totalListed, totalAfter, buyAmount,
    weightBeforePct, weightAfterPct, megaWeightAfterPct,
    warnings,
    noteTh: "ตัวเลขนี้เป็นค่าประมาณจากที่กรอกเอง ไม่ได้ดึงจาก DIME — ตรวจกับ DIME อีกครั้งก่อนซื้อ",
  };
}

/* ---------------------------------------------------------------------------
 * 10. STORAGE MIGRATION (v3) — idempotent, ห้ามลบข้อมูลเดิม
 *
 * v3 เลิกพึ่งข้อมูลพอร์ตจริง:
 *   - คัดลอก mtp.portfolio (v2) ไปเก็บที่ mtp.legacy.portfolio เพื่อ export ในอนาคต
 *   - ไม่ลบของเดิม และไม่นำมาใช้สร้างคำแนะนำ
 *   - watchlist / ราคา / คะแนน / เงินปันผล / บทวิเคราะห์ ที่แคชไว้ ต้องอยู่ครบ
 * ------------------------------------------------------------------------- */

function defaultUiState() {
  return { schemaVersion: STORAGE.schemaVersion, guideSeen: false, tab: "today", market: "us", checklist: {} };
}

/** ทำให้ ui state ถูกต้องเสมอ เรียกซ้ำได้ผลเหมือนเดิม */
function migrateUiState(raw) {
  const base = defaultUiState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  return {
    schemaVersion: STORAGE.schemaVersion,
    guideSeen: raw.guideSeen === true,
    tab: CFG.TABS.some((t) => t.key === raw.tab) ? raw.tab : base.tab,
    market: raw.market === "thai" ? "thai" : "us",
    checklist: (raw.checklist && typeof raw.checklist === "object" && !Array.isArray(raw.checklist))
      ? raw.checklist : {},
  };
}

function runMigration(storage) {
  const readRaw = (k) => { try { return storage.getItem(k); } catch (_) { return null; } };
  const before = parseInt(readRaw(STORAGE.schemaKey) || "0", 10) || 0;

  // 1) เก็บข้อมูลพอร์ตของ v2 ไว้เป็น legacy (คัดลอก ไม่ย้าย ไม่ลบ)
  let legacyMoved = false;
  const oldPortfolio = readRaw("mtp.portfolio");
  if (oldPortfolio !== null && readRaw(STORAGE.legacyPortfolioKey) === null) {
    try { storage.setItem(STORAGE.legacyPortfolioKey, oldPortfolio); legacyMoved = true; } catch (_) {}
  }

  // 2) UI state
  let ui;
  try { ui = migrateUiState(JSON.parse(readRaw(STORAGE.uiKey) || "null")); }
  catch (_) { ui = defaultUiState(); }
  try { storage.setItem(STORAGE.uiKey, JSON.stringify(ui)); } catch (_) {}

  // 3) schema version
  try { storage.setItem(STORAGE.schemaKey, String(STORAGE.schemaVersion)); } catch (_) {}

  const preserved = STORAGE.legacyKeys.filter((k) => readRaw(k) !== null);
  return {
    migrated: before !== STORAGE.schemaVersion,
    from: before, to: STORAGE.schemaVersion,
    legacyMoved, preserved, ui,
  };
}

/** ticker -> sleeve (ใช้ backfill ให้ข้อมูลเก่าที่ไม่มี category) */
function sleeveOf(ticker) {
  const s = SECURITIES[String(ticker || "").toUpperCase()];
  return s ? s.sleeve : null;
}

/** อ่านข้อมูลพอร์ตเดิมไว้ export — ไม่ถูกใช้สร้างคำแนะนำใด ๆ */
function readLegacyPortfolio(storage) {
  try {
    const raw = storage.getItem(STORAGE.legacyPortfolioKey) || storage.getItem("mtp.portfolio");
    if (!raw) return null;
    const j = JSON.parse(raw);
    return (j && typeof j === "object") ? j : null;
  } catch (_) { return null; }
}

/* ------------------------------------------------------------------------- */

return {
  // primitives
  metric, isNum, pct, median, clamp01, round, STALE_AFTER_MS,
  // indicators
  rsi, sma, drawdownPct,
  // stock scoring
  okVal, buffettScore, signal, cardMode, watchlistIndex, valuationFromHistory, scoreStock,
  opportunityStatus, matchesStatusFilter,
  // core / cash
  coreDcaLevel, cashTiming, rsiContext,
  // distributions
  ttmSum, distributionStats, yieldDriver, totalReturnPct,
  dividendGrowthScore, dividendGrowthSignal, DIV_GROWTH_WEIGHTS,
  incomeSustainabilityView,
  // opportunities
  rankOpportunities, dataCompleteness, candidateReason, QUALITY_POINTS,
  // quick check
  parseAmount, quickDimeCheck, INSUFFICIENT_TH,
  // storage
  defaultUiState, migrateUiState, runMigration, sleeveOf, readLegacyPortfolio,
};
});
