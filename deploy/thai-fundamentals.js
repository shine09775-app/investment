/* ============================================================================
 * thai-fundamentals.js — "กำไร ปันผล และการใช้ทุน" + การ์ดธนาคาร (หุ้นไทย)
 *
 * pure functions: ไม่ยิงเน็ต ไม่แตะ DOM — ทดสอบด้วย node --test ได้ตรง ๆ
 * ข้อมูลเข้า: src/data/thai-fundamentals.json (ผู้ดูแลกรอกจาก IR / SET พร้อมแหล่งอ้างอิงรายค่า)
 *
 * กติกา:
 *   - ทุกค่าเป็น "fact" ที่มี value, unit, periodType, periodEnd, sourceName, sourceUrl,
 *     updatedAt, reported (true = ตัวเลขที่บริษัทรายงาน, false = คำนวณ)
 *   - ค่าที่ไม่มีแหล่งยืนยัน = null (ห้ามเป็น 0, ห้ามคำนวณย้อนจาก dividend yield)
 *   - ค่าที่คำนวณในไฟล์นี้ติด reported:false + formula เสมอ
 *   - ไม่สรุปว่า "สร้างมูลค่าแน่นอน" — ให้เป็น "สิ่งที่ควรตรวจต่อ"
 * ========================================================================== */

/* eslint-env browser, node */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.THAI_FUNDAMENTALS = api;
})(typeof self !== "undefined" ? self : this, function () {
"use strict";

const PERIOD_TYPES = ["FY", "quarter", "H1", "YTD", "TTM"];
const BANK_METRICS = [
  { key: "nim",        label: "NIM",          descTh: "ส่วนต่างดอกเบี้ยสุทธิ" },
  { key: "creditCost", label: "Credit Cost",  descTh: "ต้นทุนความเสี่ยงสินเชื่อ" },
  { key: "nplRatio",   label: "NPL Ratio",    descTh: "สัดส่วนสินเชื่อด้อยคุณภาพ" },
  { key: "cet1",       label: "CET1",         descTh: "เงินกองทุนชั้นที่ 1 ที่เป็นส่วนของผู้ถือหุ้นสามัญ" },
  { key: "car",        label: "CAR",          descTh: "อัตราส่วนเงินกองทุนทั้งสิ้นต่อสินทรัพย์เสี่ยง" },
];
const PE_MISMATCH_TOLERANCE = 0.03;   // ต่างกันเกิน 3% ถือว่าไม่สอดคล้อง

const isNum = (v) => typeof v === "number" && isFinite(v);
const factVal = (f) => (f && isNum(f.value) ? f.value : null);
const BE = (fy) => fy + 543;          // ปีบัญชี ค.ศ. -> พ.ศ. สำหรับแสดงผล

/* ---------------------------------------------------------------------------
 * 1. VALIDATION — ใช้ทั้งใน build และ test
 * ------------------------------------------------------------------------- */

const REQUIRED_FACT_FIELDS = ["unit", "periodType", "periodEnd", "sourceName", "sourceUrl", "updatedAt", "reported"];

function validateFact(f, where) {
  const errs = [];
  if (f === null || f === undefined) return errs;               // null = ไม่มีข้อมูล (อนุญาต)
  if (typeof f !== "object") return [`${where}: ต้องเป็น object หรือ null`];
  if (!(f.value === null || isNum(f.value))) errs.push(`${where}.value ต้องเป็นตัวเลขหรือ null`);
  if (f.value === null) return errs;                            // ไม่มีค่า ไม่ต้องมีแหล่ง
  for (const k of REQUIRED_FACT_FIELDS) {
    if (f[k] === undefined || f[k] === null || f[k] === "") errs.push(`${where}.${k} ขาด`);
  }
  if (f.periodType && !PERIOD_TYPES.includes(f.periodType)) errs.push(`${where}.periodType ต้องเป็น ${PERIOD_TYPES.join("/")}`);
  if (f.sourceUrl && !/^https:\/\//.test(f.sourceUrl)) errs.push(`${where}.sourceUrl ต้องเป็น https://`);
  if (f.periodEnd && !/^\d{4}-\d{2}-\d{2}$/.test(f.periodEnd)) errs.push(`${where}.periodEnd ต้องเป็น YYYY-MM-DD`);
  if (f.reported !== undefined && typeof f.reported !== "boolean") errs.push(`${where}.reported ต้องเป็น true/false`);
  if (f.reported === false && !f.formula) errs.push(`${where}: ค่าที่คำนวณ (reported:false) ต้องมี formula`);
  return errs;
}

function validateData(data) {
  const errs = [];
  if (!data || typeof data !== "object") return ["ไฟล์ต้องเป็น object"];
  if (data.schemaVersion !== 1) errs.push("schemaVersion ต้องเป็น 1");
  const stocks = data.stocks || {};
  for (const [t, s] of Object.entries(stocks)) {
    if (!Array.isArray(s.annual)) { errs.push(`${t}.annual ต้องเป็น array`); continue; }
    const seen = new Set();
    for (const [i, y] of s.annual.entries()) {
      const w = `${t}.annual[${i}]`;
      if (!Number.isInteger(y.fy)) errs.push(`${w}.fy ต้องเป็นปี ค.ศ.`);
      if (seen.has(y.fy)) errs.push(`${w}: ปี ${y.fy} ซ้ำ`);
      seen.add(y.fy);
      for (const k of ["eps", "bvps", "roe", "netIncomeToOwners", "equityToOwners", "dpsRegular", "dpsSpecial", "payoutRatio"]) {
        errs.push(...validateFact(y[k], `${w}.${k}`));
        if (y[k] && isNum(y[k].value) && y[k].periodType && y[k].periodType !== "FY") {
          errs.push(`${w}.${k}: ข้อมูลรายปีต้องเป็น periodType "FY"`);
        }
      }
    }
    for (const m of BANK_METRICS) {
      const f = s.bank && s.bank[m.key];
      errs.push(...validateFact(f, `${t}.bank.${m.key}`));
      if (f && isNum(f.value) && !f.periodLabel) errs.push(`${t}.bank.${m.key}.periodLabel ขาด (เช่น "ไตรมาส 2/2569")`);
    }
  }
  return errs;
}

/* ---------------------------------------------------------------------------
 * 2. FIVE CLOSED FISCAL YEARS — ปีที่ขาดเป็นช่องว่าง ไม่ใช่ศูนย์
 * ------------------------------------------------------------------------- */

/** ปีบัญชีล่าสุดที่ปิดงวดแล้ว ณ nowMs (fiscalYearEnd รูปแบบ "MM-DD", ค่าเริ่มต้น 31 ธ.ค.) */
function latestClosedFY(fiscalYearEnd, nowMs) {
  const [mm, dd] = String(fiscalYearEnd || "12-31").split("-").map(Number);
  const now = new Date(isNum(nowMs) ? nowMs : Date.now());
  const y = now.getUTCFullYear();
  const endThisYear = Date.UTC(y, mm - 1, dd);
  return now.getTime() > endThisYear ? y : y - 1;
}

function fiveYears(stock, nowMs) {
  const last = latestClosedFY(stock && stock.fiscalYearEnd, nowMs);
  const byFy = new Map(((stock && stock.annual) || []).map((y) => [y.fy, y]));
  const out = [];
  for (let fy = last - 4; fy <= last; fy++) out.push({ fy, row: byFy.get(fy) || null });
  return out;
}

/* ---------------------------------------------------------------------------
 * 3. ROE — ใช้ค่าที่รายงานก่อน; คำนวณเมื่อมีกำไรส่วนของผู้ถือหุ้นและทุนต้น/ปลายงวด
 * ------------------------------------------------------------------------- */

const ROE_FORMULA = "กำไรสุทธิส่วนของผู้ถือหุ้นบริษัทใหญ่ ÷ ส่วนของผู้ถือหุ้นบริษัทใหญ่เฉลี่ย (ต้นงวด + ปลายงวด) ÷ 2";

function roeFor(row, prevRow) {
  if (!row) return { value: null, reason: "ไม่มีข้อมูลปีนี้" };
  const rep = factVal(row.roe);
  if (rep !== null) return { value: rep, reported: !!row.roe.reported, fact: row.roe };
  const ni = factVal(row.netIncomeToOwners), eqEnd = factVal(row.equityToOwners);
  const eqBeg = prevRow ? factVal(prevRow.equityToOwners) : null;
  if (ni === null || eqEnd === null) return { value: null, reason: "ไม่มี ROE ที่รายงาน และไม่มีกำไร/ทุนให้คำนวณ" };
  if (eqBeg === null) return { value: null, reason: "ขาดทุนต้นงวด (ปีก่อนหน้า) จึงคำนวณ ROE เฉลี่ยไม่ได้" };
  const avg = (eqBeg + eqEnd) / 2;
  if (!(avg > 0)) return { value: null, reason: "ส่วนของผู้ถือหุ้นเฉลี่ย ≤ 0" };
  return { value: (ni / avg) * 100, reported: false, formula: ROE_FORMULA, fact: row.netIncomeToOwners };
}

/* ---------------------------------------------------------------------------
 * 4. DPS + PAYOUT — ปันผลผูกกับปีบัญชีของผลประกอบการ (ไม่ใช่วันจ่าย)
 * ------------------------------------------------------------------------- */

const sameBase = (a, b) => (a && b ? (a.shareBasis || null) === (b.shareBasis || null) : true);

function dividendFor(row) {
  if (!row) return { dps: null, regular: null, special: null, payout: null, reason: "ไม่มีข้อมูลปีนี้" };
  const regular = factVal(row.dpsRegular);
  // special: fact ที่มีค่า = ยืนยันได้; value 0 + reported = บริษัทยืนยันว่าไม่มีปันผลพิเศษ; null = ไม่ทราบ
  const special = factVal(row.dpsSpecial);
  const dps = regular === null ? null : regular + (special || 0);
  const eps = factVal(row.eps);
  const out = { dps, regular, special, specialKnown: row.dpsSpecial ? isNum(row.dpsSpecial.value) : false };

  const repPayout = factVal(row.payoutRatio);
  if (repPayout !== null) {
    Object.assign(out, { payout: repPayout, payoutReported: !!row.payoutRatio.reported, payoutFact: row.payoutRatio });
  } else if (dps === null) {
    Object.assign(out, { payout: null, reason: "ยังไม่มี DPS ของปีบัญชีนี้" });
  } else if (eps === null) {
    Object.assign(out, { payout: null, reason: "ไม่มี EPS ของปีเดียวกัน" });
  } else if (eps <= 0) {
    Object.assign(out, { payout: null, reason: "EPS ≤ 0 — คำนวณสัดส่วนจ่ายปันผลไม่ได้" });
  } else if (!sameBase(row.dpsRegular, row.eps)) {
    Object.assign(out, { payout: null, reason: "DPS และ EPS ใช้ฐานจำนวนหุ้นต่างกัน" });
  } else {
    Object.assign(out, { payout: (dps / eps) * 100, payoutReported: false, formula: "DPS ÷ EPS ของปีบัญชีเดียวกัน" });
  }
  if (isNum(out.payout) && out.payout > 100) out.overEarnings = true;
  return out;
}

/* ---------------------------------------------------------------------------
 * 5. BVPS vs EPS — "สิ่งที่ควรตรวจต่อ" (ไม่ใช่ข้อสรุปว่าสร้างมูลค่า)
 * ------------------------------------------------------------------------- */

function growthCheck(years) {
  const both = years.filter((y) => y.row && factVal(y.row.bvps) !== null && factVal(y.row.eps) !== null);
  const notes = years.filter((y) => y.row && y.row.shareBaseNote).map((y) => `ปี ${BE(y.fy)}: ${y.row.shareBaseNote}`);
  const epsYears = years.filter((y) => y.row && factVal(y.row.eps) !== null);

  const checks = [];
  // ความสม่ำเสมอของ EPS
  if (epsYears.length >= 3) {
    let up = 0, neg = 0;
    for (let i = 1; i < epsYears.length; i++) if (factVal(epsYears[i].row.eps) > factVal(epsYears[i - 1].row.eps)) up++;
    epsYears.forEach((y) => { if (factVal(y.row.eps) <= 0) neg++; });
    checks.push(`EPS เพิ่มขึ้น ${up} จาก ${epsYears.length - 1} ช่วงปีที่มีข้อมูล` + (neg ? ` · มี ${neg} ปีที่ EPS ≤ 0` : ""));
  }
  if (both.length < 3) {
    return { enough: false, headline: "ข้อมูลยังไม่พอสรุป", checks, shareBaseNotes: notes,
      detail: `ต้องมี BVPS และ EPS ปีเดียวกันอย่างน้อย 3 ปี (มี ${both.length} ปี)` };
  }
  const a = both[0], b = both[both.length - 1];
  const bv0 = factVal(a.row.bvps), bv1 = factVal(b.row.bvps), e0 = factVal(a.row.eps), e1 = factVal(b.row.eps);
  const bvUp = bv1 > bv0 * 1.02, bvDown = bv1 < bv0 * 0.98;
  const epsUp = e0 > 0 ? e1 > e0 * 1.02 : e1 > e0;
  const epsDown = e0 > 0 ? e1 < e0 * 0.98 : e1 < e0;
  let headline;
  if (bvUp && !epsUp) headline = "ทุนต่อหุ้นเพิ่ม แต่กำไรต่อหุ้นยังไม่เพิ่มตาม";
  else if (bvUp && epsUp) headline = "ทุนต่อหุ้นและกำไรต่อหุ้นเพิ่มไปด้วยกัน — ตรวจต่อว่ากำไรมาจากธุรกิจปกติ ไม่ใช่รายการพิเศษ";
  else if (!bvUp && epsUp) headline = "กำไรต่อหุ้นเพิ่มขณะที่ทุนต่อหุ้นไม่เพิ่ม — ตรวจการจ่ายปันผล ซื้อหุ้นคืน หรือกำไรพิเศษ";
  else if (bvDown && epsDown) headline = "ทุนต่อหุ้นและกำไรต่อหุ้นลดลงทั้งคู่";
  else headline = "ทุนต่อหุ้นและกำไรต่อหุ้นทรงตัว";
  return { enough: true, headline, checks, shareBaseNotes: notes,
    detail: `เทียบปี ${BE(a.fy)} → ${BE(b.fy)}: BVPS ${bv0.toFixed(2)} → ${bv1.toFixed(2)} บาท · EPS ${e0.toFixed(2)} → ${e1.toFixed(2)} บาท` };
}

/** รวมทุกส่วนของหน้ารายละเอียด */
function analyze(stock, nowMs) {
  const years = fiveYears(stock, nowMs);
  const rows = years.map((y, i) => {
    const prev = i > 0 ? years[i - 1].row : (stock && (stock.annual || []).find((r) => r.fy === y.fy - 1)) || null;
    return { fy: y.fy, labelBE: BE(y.fy), row: y.row, roe: roeFor(y.row, prev), div: dividendFor(y.row),
      eps: y.row ? factVal(y.row.eps) : null, bvps: y.row ? factVal(y.row.bvps) : null };
  });
  const hasAny = rows.some((r) => r.row);
  return { rows, hasAny, growth: growthCheck(years), basis: (stock && stock.statementBasis) || null };
}

/* ---------------------------------------------------------------------------
 * 6. BANK CARD — ใช้เมื่อหลักทรัพย์อยู่กลุ่ม banking (มาจากข้อมูลของแอป)
 * ------------------------------------------------------------------------- */

function bankCard(stock) {
  const bank = (stock && stock.bank) || {};
  const rows = BANK_METRICS.map((m) => {
    const f = bank[m.key];
    return { ...m, value: factVal(f), fact: isNum(f && f.value) ? f : null };
  });
  const cet1 = rows.find((r) => r.key === "cet1"), car = rows.find((r) => r.key === "car");
  const notes = [];
  if (car.value !== null && cet1.value === null) notes.push("มีเฉพาะ CAR — ยังไม่มีข้อมูล CET1 (สองค่านี้ใช้แทนกันไม่ได้)");
  const bases = [...new Set(rows.filter((r) => r.fact && r.fact.basis).map((r) => r.fact.basis))];
  if (bases.length > 1) notes.push(`ตัวเลขมาจากงบต่างฐานกัน (${bases.join(" / ")}) — เทียบกันโดยตรงไม่ได้`);
  return { rows, notes, hasAny: rows.some((r) => r.value !== null) };
}

/* ---------------------------------------------------------------------------
 * 7. P/E CONSISTENCY — แสดงแยกแหล่ง ไม่เขียนทับค่าของ provider
 * ------------------------------------------------------------------------- */

function peCheck({ price, eps, providerPe, tolerance }) {
  const tol = isNum(tolerance) ? tolerance : PE_MISMATCH_TOLERANCE;
  if (!isNum(price) || !isNum(eps)) return { computed: null, state: "missing" };
  if (eps <= 0) return { computed: null, state: "negative_eps" };
  const computed = price / eps;
  if (!isNum(providerPe)) return { computed, state: "computed_only" };
  const diff = Math.abs(computed - providerPe) / providerPe;
  return { computed, provider: providerPe, diffPct: diff * 100, state: diff > tol ? "mismatch" : "ok" };
}

return {
  PERIOD_TYPES, BANK_METRICS, ROE_FORMULA, PE_MISMATCH_TOLERANCE,
  validateFact, validateData, latestClosedFY, fiveYears, roeFor, dividendFor, growthCheck, analyze, bankCard, peCheck, BE,
};
});
