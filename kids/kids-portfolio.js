/* ============================================================================
 * kids-portfolio.js — Kids Portfolio engine
 * ส่วนขยายของ mega-trend-portfolio (portfolio.html)
 *
 * แอปเดิมมี buffettScore() ที่วัด "จังหวะราคา" (52w high, RSI, MA200, P/E)
 * ไฟล์นี้เติมอีกครึ่งที่ขาดไป: "คุณภาพธุรกิจ" + โครงพอร์ต + กติกา rebalance
 *
 *   qualityScore()  → ธุรกิจดีไหม        (ข้อมูลงบการเงิน, อัปเดตรายไตรมาส)
 *   buffettScore()  → ตอนนี้ราคาแพงไหม   (ของเดิมในแอป, realtime)
 *   verdict()       → รวมสองอย่างเป็นคำตอบเดียว
 *
 * ⚠️ ไฟล์นี้เป็น "เครื่องมือคัดกรองและติดตาม" ไม่ใช่คำแนะนำการลงทุน
 *    ค่าใน KIDS / BUCKETS เป็น placeholder — ผู้ปกครองกรอกเอง
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * 1. CONFIG — กรอกเอง
 * ------------------------------------------------------------------------- */

const KIDS = [
  {
    id: "arthy",
    name: "Arthy",
    color: "var(--blue)",
    birthYear: null,       // [กรอก] เช่น 2015
    targetYear: null,      // [กรอก] ปีที่เริ่มใช้เงิน เช่น 2033
    monthlyDCA: 0,         // [กรอก] THB ต่อเดือน
    baseCurrency: "THB",   // สกุลที่จะใช้เงินจริง — ตัวนี้กำหนด currency split
  },
  {
    id: "indy",
    name: "Indy",
    color: "var(--purple)",
    birthYear: null,
    targetYear: null,
    monthlyDCA: 0,
    baseCurrency: "THB",
  },
];

/** ความกล้ารับความเสี่ยงของครอบครัว — ตั้งครั้งเดียว ห้ามเปลี่ยนกลางทาง
 *  4 = อนุรักษ์ / 5 = สมดุล / 6 = รับผันผวนได้มาก  (ดู IPS-kids.md §3) */
const RISK_K = 5;

/** เพดานสัดส่วนต่อหุ้น 1 ตัวใน Bucket B (% ของพอร์ตรวม) */
const MAX_SINGLE_NAME = 8;

/** เบี่ยงจาก target เกินกี่ percentage point ถึงจะ rebalance */
const REBALANCE_BAND = 5;

/** ปล่อย Cash Opportunity เมื่อ Buffett Opportunity Index ถึงระดับนี้ */
const FEAR_TRIGGER = 70;

/**
 * โครงถัง — items เว้นว่างไว้ตั้งใจ
 * ผู้ปกครองเป็นคนใส่เอง (หรือใส่ร่วมกับผู้แนะนำการลงทุนที่มีใบอนุญาต)
 * รูปแบบ item เหมือน GROUPS ใน portfolio.html เป๊ะ ๆ เพื่อ reuse การ์ดเดิมได้เลย
 *   { t:"TICKER", n:"ชื่อ · ธีม", status:"OWN|BUY1|WATCH|INC", ccy:"USD|THB", kid:"arthy|indy|both" }
 * หุ้นไทยใช้ suffix .BK ตาม Yahoo Finance เช่น "PTT.BK"
 */
const KID_BUCKETS = [
  {
    id: "core",
    title: "A · Core (แกนพอร์ต)",
    short: "Core",
    color: "var(--green)",
    role: "เครื่องยนต์หลัก กระจายกว้าง ค่าธรรมเนียมต่ำ ไม่ต้องตัดสินใจรายตัว",
    target: null,          // [กรอก] % — ปกติเป็นถังใหญ่ที่สุด
    needsQualityGate: false,
    items: [],
  },
  {
    id: "compounder",
    title: "B · Quality Compounders",
    short: "Quality",
    color: "var(--blue)",
    role: "หุ้นรายตัวที่ผ่าน 7 Gates — ส่วนที่ใช้สอนลูกว่าถือหุ้น = เป็นเจ้าของธุรกิจ",
    target: null,          // [กรอก] %
    needsQualityGate: true,
    maxNames: 12,
    items: [],
  },
  {
    id: "ballast",
    title: "C · Income / Ballast",
    short: "Ballast",
    color: "var(--orange)",
    role: "ตัวถ่วงให้พอร์ตนิ่ง — ถังนี้คือเหตุผลเดียวที่เป้า 'ผันผวนน้อย' จะเป็นจริง",
    target: null,          // [กรอก] %
    needsQualityGate: false,
    items: [],
  },
  {
    id: "cash",
    title: "D · Cash",
    short: "Cash",
    color: "var(--sub)",
    role: "Reserve (ห้ามแตะ) + Opportunity (ปล่อยเมื่อตลาดกลัว)",
    target: null,          // [กรอก] %
    splitReserve: null,    // [กรอก] % ของพอร์ตรวม
    splitOpportunity: null,// [กรอก] % ของพอร์ตรวม
    needsQualityGate: false,
    items: [],
  },
];

/* ---------------------------------------------------------------------------
 * 2. GLIDE PATH — อายุ → สัดส่วนที่ควรเป็น
 * ------------------------------------------------------------------------- */

/**
 * คืนสัดส่วนแนะนำตาม horizon ที่เหลือ (IPS-kids.md §3)
 * @param {number} yearsLeft  ปีที่เหลือก่อนใช้เงิน
 * @param {number} k          RISK_K
 * @returns {{growth:number, stability:number, cash:number}} % รวม 100
 */
function glidePath(yearsLeft, k = RISK_K) {
  const y = Math.max(0, yearsLeft);

  // เงินสดเพิ่มขึ้นเมื่อใกล้ใช้เงิน: 5% ที่ horizon ยาว → 30% ที่ปีสุดท้าย
  const cash = y >= 10 ? 5 : Math.round(5 + (10 - y) * 2.5);

  // ส่วนเติบโตผูกกับเวลาที่เหลือ
  const growth = Math.max(10, Math.min(90, Math.round(y * k)));

  const stability = Math.max(0, 100 - growth - cash);
  return { growth, stability, cash };
}

/** ปีที่เหลือของเด็กคนหนึ่ง ณ วันนี้ */
function yearsLeft(kid, now = new Date()) {
  if (!kid.targetYear) return null;
  return kid.targetYear - now.getFullYear();
}

/** อายุ ณ วันนี้ */
function ageOf(kid, now = new Date()) {
  if (!kid.birthYear) return null;
  return now.getFullYear() - kid.birthYear;
}

/* ---------------------------------------------------------------------------
 * 3. QUALITY GATE — 7 ด่าน (IPS-kids.md §5.1)
 * ------------------------------------------------------------------------- */

/**
 * f = ข้อมูลพื้นฐานของบริษัท (กรอกมือรายไตรมาส หรือดึงจาก API งบการเงิน)
 * {
 *   understandable: bool,   // Gate 1 — อธิบายให้เด็ก 12 ขวบฟังรู้เรื่องไหม
 *   moat: string|null,      // Gate 2 — "brand"|"network"|"switching"|"cost"|"patent"|null
 *   roe5: number[],         // ROE ย้อนหลัง 5 ปี (%)
 *   debtToEquity: number,
 *   interestCoverage: number,
 *   fcf5: number[],         // FCF ย้อนหลัง 5 ปี
 *   fcfToNetIncome: number,
 *   revenueCagr5: number,   // %
 *   epsCagr5: number,       // %
 *   shareChangePct: number, // % ต่อปี (+ = เพิ่มทุน, − = ซื้อหุ้นคืน)
 *   fcfMargin: number,      // %
 *   grossMargin: number,    // %
 * }
 */
function qualityGates(f) {
  const avg = a => (a && a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

  const gates = [
    { id: 1, name: "Circle of Competence", pass: f.understandable === true,
      why: "อธิบายโมเดลธุรกิจให้เด็ก 12 ขวบเข้าใจได้ใน 2 ประโยค" },

    { id: 2, name: "Moat", pass: !!f.moat,
      why: "ระบุสิ่งที่กันคู่แข่งได้ชัดเจนอย่างน้อย 1 อย่าง" },

    { id: 3, name: "Profitability", pass: (f.roe5 || []).length >= 5 && f.roe5.every(r => r >= 15),
      why: "ROE ≥ 15% ติดต่อกัน 5 ปี" },

    { id: 4, name: "Balance Sheet", pass: f.debtToEquity <= 1.0 && f.interestCoverage >= 5,
      why: "D/E ≤ 1.0 และ Interest Coverage ≥ 5×" },

    { id: 5, name: "Cash Generation", pass: (f.fcf5 || []).length >= 5 && f.fcf5.every(v => v > 0) && f.fcfToNetIncome >= 0.8,
      why: "FCF บวก 5 ปีติด และ FCF/Net Income ≥ 0.8" },

    { id: 6, name: "Growth", pass: f.revenueCagr5 >= 5 && f.epsCagr5 >= f.revenueCagr5,
      why: "รายได้โต ≥ 5%/ปี และกำไรต่อหุ้นโตเร็วกว่ารายได้" },

    { id: 7, name: "Shareholder Friendly", pass: f.shareChangePct <= 2,
      why: "จำนวนหุ้นเพิ่มไม่เกิน 2%/ปี (ติดลบ = ซื้อหุ้นคืน ยิ่งดี)" },
  ];

  const failed = gates.filter(g => !g.pass);
  return { gates, passedAll: failed.length === 0, failed, avgRoe: avg(f.roe5) };
}

/* ---------------------------------------------------------------------------
 * 4. QUALITY SCORE 0–100 (IPS-kids.md §5.2)
 * ------------------------------------------------------------------------- */

/** map ค่า v จากช่วง [lo,hi] เป็น 0..w แบบ linear (คลิปปลายทั้งสองข้าง) */
const band = (v, lo, hi, w) =>
  !isFinite(v) ? 0 : Math.max(0, Math.min(w, ((v - lo) / (hi - lo)) * w));

function qualityScore(f) {
  const roe = f.roe5 || [];
  const mean = roe.length ? roe.reduce((s, x) => s + x, 0) / roe.length : NaN;
  const sd = roe.length > 1
    ? Math.sqrt(roe.reduce((s, x) => s + (x - mean) ** 2, 0) / roe.length)
    : NaN;

  const parts = {
    roe:        band(mean, 15, 30, 20),                  // 20
    consistency: isFinite(sd) ? band(-sd, -10, 0, 15) : 0, // 15 — SD ต่ำ = ได้เต็ม
    fcfMargin:  band(f.fcfMargin, 5, 25, 15),            // 15
    growth:     band(f.revenueCagr5, 5, 20, 15),         // 15
    pricing:    band(f.grossMargin, 20, 60, 15),         // 15
    balance:    band(-f.debtToEquity, -1, 0, 10),        // 10 — D/E ต่ำ = ได้เต็ม
    dilution:   band(-f.shareChangePct, -2, 2, 10),      // 10 — ซื้อหุ้นคืน = ได้เต็ม
  };

  const total = Math.round(Object.values(parts).reduce((s, x) => s + x, 0));
  return { total, parts };
}

/* ---------------------------------------------------------------------------
 * 5. VERDICT — รวม "ธุรกิจดีไหม" + "ราคาแพงไหม"
 * ------------------------------------------------------------------------- */

/**
 * Calibration — เกณฑ์ใน qualityScore() ตั้งไว้เข้ม คะแนนเต็มแทบเป็นไปไม่ได้
 * จุดอ้างอิงจากการทดสอบ (ธุรกิจที่ผ่าน 7 Gates มาแล้วทั้งนั้น):
 *   ~65  = compounder คุณภาพสูง (ROE 24%, FCF margin 18%, GM 52%, ซื้อหุ้นคืน)
 *   ~50  = ธุรกิจดีแต่มีจุดอ่อนชัด 1–2 ด้าน
 *   <50  = ผ่าน Gate แบบเฉียดฉิว
 * ดังนั้น QUALITY_HIGH ตั้งที่ 60 ไม่ใช่ 70 — อย่าเทียบคะแนนนี้กับสเกล 0–100 ทั่วไป
 */
const QUALITY_HIGH = 60;
const QUALITY_OK   = 45;

/**
 * @param {number} quality  0–100 จาก qualityScore()
 * @param {number} timing   0–100 จาก buffettScore() ที่มีอยู่แล้วใน portfolio.html
 * @param {boolean} gatesPassed
 */
function verdict(quality, timing, gatesPassed) {
  if (!gatesPassed)
    return { l: "ตัดออก · ไม่ผ่าน Gate", c: "var(--red)", act: "ไม่พิจารณา ไม่ว่าราคาจะถูกแค่ไหน" };

  if (quality >= QUALITY_HIGH && timing >= 70)
    return { l: "ธุรกิจดี · ราคาน่าสนใจ", c: "var(--green)", act: "ช่วงที่ DCA ได้เต็มไม้ + พิจารณาปล่อย Cash Opportunity" };

  if (quality >= QUALITY_HIGH && timing >= 45)
    return { l: "ธุรกิจดี · ราคาปกติ", c: "var(--teal)", act: "DCA ตามแผนปกติ" };

  if (quality >= QUALITY_HIGH)
    return { l: "ธุรกิจดี · ราคาแพง", c: "var(--yellow)", act: "ถือของเดิม ชะลอซื้อเพิ่ม อย่าไล่ราคา" };

  if (quality >= QUALITY_OK && timing >= 70)
    return { l: "ราคาถูก · แต่ธุรกิจกลาง ๆ", c: "var(--orange)", act: "กับดักราคาถูก — พอร์ตลูกไม่ควรเสี่ยง" };

  return { l: "ไม่เข้าเกณฑ์", c: "var(--red)", act: "ข้ามไป" };
}

/* ---------------------------------------------------------------------------
 * 6. REBALANCE — แบบ band ไม่ใช่แบบปฏิทิน (IPS-kids.md §8)
 * ------------------------------------------------------------------------- */

/**
 * @param {Object} actual  { core:42.1, compounder:28.0, ballast:20.4, cash:9.5 }
 * @param {Object} target  { core:40, compounder:30, ballast:20, cash:10 }
 */
function rebalanceCheck(actual, target, bandPP = REBALANCE_BAND) {
  const rows = Object.keys(target).map(k => {
    const a = actual[k] ?? 0, t = target[k] ?? 0, drift = +(a - t).toFixed(1);
    return {
      bucket: k, actual: a, target: t, drift,
      breached: Math.abs(drift) > bandPP,
      action: Math.abs(drift) <= bandPP ? "ไม่ต้องทำอะไร"
            : drift < 0 ? "ส่งเงิน DCA เดือนหน้ามาถังนี้ก่อน"
            : "หยุด DCA ถังนี้ชั่วคราว — ขายเป็นทางเลือกสุดท้าย",
    };
  });

  return {
    rows,
    needsAction: rows.some(r => r.breached),
    // หลักการ: ปรับด้วยเงินใหม่ก่อนเสมอ ประหยัดค่าธรรมเนียมและภาษี
    preferredMethod: "new-money-first",
  };
}

/** เตือนเมื่อหุ้นตัวใดตัวหนึ่งใหญ่เกินเพดาน */
function concentrationCheck(holdings, cap = MAX_SINGLE_NAME) {
  const total = holdings.reduce((s, h) => s + (h.valueTHB || 0), 0) || 1;
  return holdings
    .map(h => ({ t: h.t, pct: +((h.valueTHB / total) * 100).toFixed(1) }))
    .filter(x => x.pct > cap)
    .map(x => ({ ...x, msg: `${x.t} = ${x.pct}% เกินเพดาน ${cap}% — หยุดซื้อเพิ่ม` }));
}

/* ---------------------------------------------------------------------------
 * 7. TRACKING SCHEMA — โครงข้อมูลสำหรับ localStorage / D1 / KV
 * ------------------------------------------------------------------------- */

const KID_SCHEMA = {
  holding: {
    kidId: "arthy",
    ticker: "",            // หุ้นไทยใช้ .BK เช่น "PTT.BK"
    bucket: "compounder",  // core | compounder | ballast | cash
    ccy: "USD",
    shares: 0,
    avgCost: 0,            // ในสกุล ccy
    firstBuy: "",          // YYYY-MM-DD — ใช้บังคับกติกา "ถือขั้นต่ำ 3 ปี"
    thesis: "",            // ⭐ บังคับกรอก — ไม่มี thesis = ห้ามซื้อ
    thesisBy: "",          // "พ่อ" | "arthy" | "indy" — ใครเป็นคนเขียน
    gates: null,           // ผลจาก qualityGates() ครั้งล่าสุด
    qualityScore: null,
    lastFundamentalUpdate: "",
  },

  transaction: {
    kidId: "", date: "", ticker: "",
    type: "BUY",           // BUY | SELL | DIV | DEPOSIT
    shares: 0, price: 0, ccy: "USD", fxRate: 0,
    reason: "",            // ⭐ บังคับกรอกทุกครั้ง โดยเฉพาะ SELL
    fearIndexAtTrade: null,// บันทึก Buffett Opportunity Index ตอนเทรด → รีวิวย้อนหลังได้ว่าซื้อตอนกลัวหรือตอนโลภ
  },

  journal: {
    kidId: "", date: "",
    type: "birthday-review",  // birthday-review | semi-annual | thesis-change | lesson
    note: "",
    kidWords: "",             // ⭐ คำพูดของลูกเอง — ของมีค่าที่สุดในไฟล์นี้
    portfolioValueTHB: 0,
    cagrSinceInception: null,
  },
};

/* ---------------------------------------------------------------------------
 * 8. FX & SET — หมายเหตุการดึงข้อมูล
 * ------------------------------------------------------------------------- */

/**
 * ใช้ proxy /api/chart เดิมใน deploy/_worker.js ได้เลย ไม่ต้องแก้อะไร
 *   หุ้นไทย    : "PTT.BK", "CPALL.BK"      (Yahoo ใช้ suffix .BK สำหรับ SET)
 *   อัตราแลกฯ  : "THB=X"                   (USD→THB)
 *   ดัชนี SET  : "^SET.BK"
 *
 * ข้อควรระวังกับหุ้นไทยบน Yahoo:
 *   - ข้อมูลงบการเงินไม่ครบเท่าหุ้น US → Gate 3/5/6 มักต้องกรอกมือจาก set.or.th
 *   - สภาพคล่องบางตัวต่ำ ทำให้ RSI / MA200 ในแอปเดิมมี noise สูงกว่า
 *   - ปันผลไทยจ่ายเป็นก้อนใหญ่ปีละ 1–2 ครั้ง → ราคา gap ลงวัน XD
 *     ต้องใช้ adjusted close ไม่งั้นกราฟจะหลอกตา
 */
const FX_TICKER = "THB=X";
const SET_INDEX = "^SET.BK";
const toTHB = (amount, ccy, usdthb) => (ccy === "THB" ? amount : amount * usdthb);

/* ------------------------------------------------------------------------- */

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    KIDS, KID_BUCKETS, KID_SCHEMA, RISK_K, MAX_SINGLE_NAME, REBALANCE_BAND, FEAR_TRIGGER,
    glidePath, yearsLeft, ageOf,
    qualityGates, qualityScore, verdict,
    rebalanceCheck, concentrationCheck,
    FX_TICKER, SET_INDEX, toTHB,
  };
}
