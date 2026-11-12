/* SCHD (dividend_growth) และ JEPQ (current_income_option) */
const test = require("node:test");
const assert = require("node:assert/strict");
const CFG = require("../src/ips-config.js");
const E = require("../src/portfolio-engine.js");

// เดินตามปฏิทินจริง ให้ตรงกับวิธีที่กองทุนจ่ายเงินจริง
const Y0 = 2026, M0 = 6;                                  // อ้างอิง 1 ก.ค. 2026
const now = Math.floor(Date.UTC(Y0, M0, 1) / 1000);
const monthsAgo = (i) => Math.floor(Date.UTC(Y0, M0 - i, 15) / 1000);

function monthlyDivs(years, amount, jitter = 0) {
  const out = [];
  for (let i = Math.round(years * 12); i >= 1; i--) {
    out.push({ date: monthsAgo(i), amount: amount * (1 + (i % 3) * jitter) });
  }
  return out;
}
function quarterlyDivs(years, startAmt, growth) {
  const out = [];
  const n = Math.round(years * 4);
  for (let i = n; i >= 1; i--) {
    out.push({ date: monthsAgo(i * 3), amount: startAmt * Math.pow(1 + growth, years - i / 4) });
  }
  return out;
}
function flatSeries(years, price) {
  const ts = [], close = [];
  for (let i = Math.round(years * 12); i >= 0; i--) { ts.push(monthsAgo(i)); close.push(price); }
  return { ts, close };
}

/* ---- distribution stats ------------------------------------------------- */

test("distributionStats คืน null ทุกช่องเมื่อไม่มีข้อมูล — ไม่ใช่ 0", () => {
  const s = E.distributionStats([], null, now);
  assert.equal(s.ttmDiv, null);
  assert.equal(s.growthCagrPct, null);
  assert.equal(s.medYieldPct, null);
  assert.equal(s.monthsWithDist12, null);
  assert.equal(s.variabilityCvPct, null);
});

test("SCHD-like: รายไตรมาสที่เงินจ่ายโต", () => {
  const s = E.distributionStats(quarterlyDivs(5, 0.7, 0.08), flatSeries(5, 80), now);
  assert.equal(s.distPerYear, 4);
  assert.ok(s.ttmDiv > 0);
  assert.ok(s.growthCagrPct > 3 && s.growthCagrPct < 15, "CAGR ควรใกล้ 8%: " + s.growthCagrPct);
  assert.equal(s.growthYears, 3);
  assert.ok(s.medYieldPct > 0);
});

test("JEPQ-like: รายเดือนที่ไม่เท่ากันทุกงวด", () => {
  const s = E.distributionStats(monthlyDivs(3, 0.45, 0.4), flatSeries(3, 55), now);
  assert.equal(s.monthsWithDist12, 12);
  assert.ok(s.variabilityCvPct > 10, "ต้องตรวจจับความผันผวนของเงินจ่ายได้");
});

test("totalReturnPct คืน null เมื่อไม่มี adjusted close", () => {
  assert.equal(E.totalReturnPct(null), null);
  assert.equal(E.totalReturnPct([100]), null);
  assert.equal(E.round(E.totalReturnPct([100, 150]), 2), 50);
});

/* ---- SCHD --------------------------------------------------------------- */

test("Dividend Growth View ไม่ให้คะแนนเมื่อข้อมูลไม่ถึงครึ่ง", () => {
  const r = E.dividendGrowthScore({ curYieldPct: null, stats: null, ddPct: null });
  assert.equal(r.score, null);
  assert.equal(r.state, "missing");
  assert.equal(r.messageTh, "ข้อมูลการเติบโตของเงินจ่ายไม่เพียงพอ");
});

test("yield สูงอย่างเดียวไม่พอให้คะแนนเต็ม", () => {
  const highYieldNoGrowth = E.dividendGrowthScore({
    curYieldPct: 6, stats: { medYieldPct: 3.5, growthCagrPct: 0, distPerYear: 4 }, ddPct: 25 });
  const balanced = E.dividendGrowthScore({
    curYieldPct: 3.6, stats: { medYieldPct: 3.5, growthCagrPct: 10, distPerYear: 4 }, ddPct: 5 });
  assert.ok(highYieldNoGrowth.score < 100);
  assert.ok(balanced.score > 40);
  assert.equal(CFG.ETF_METADATA.SCHD.category, "Dividend Growth");
  assert.equal(CFG.referenceTargetPct("dividend"), 10);
});

test("บอกได้ว่าข้อมูลส่วนไหนขาด แต่ยังให้คะแนนเมื่อเกินครึ่ง", () => {
  const r = E.dividendGrowthScore({
    curYieldPct: 3.6, stats: { medYieldPct: 3.5, growthCagrPct: null, distPerYear: 4 }, ddPct: 5 });
  assert.equal(r.state, "partial");
  assert.ok(r.missing.includes("การเติบโตของเงินจ่าย"));
  assert.ok(r.score !== null);
});

/* ---- JEPQ --------------------------------------------------------------- */

test("Current Income View ไม่ดีขึ้นอัตโนมัติเมื่อ yield สูงขึ้นจากราคาที่ลดลง", () => {
  const stats = { monthsWithDist12: 12, variabilityCvPct: 10 };
  const calm = E.incomeSustainabilityView({
    curYieldPct: 9, stats, ddPct: 3, rsiv: 50, totalReturn: 8,
    driver: { driver: "both_up", riskTh: "x" } });
  const fallingPrice = E.incomeSustainabilityView({
    curYieldPct: 13, stats, ddPct: 22, rsiv: 28, totalReturn: -6,
    driver: E.yieldDriver({ ttmDiv: 5, ttmDivPrev: 5, price: 40, pricePrev: 50 }) });
  assert.equal(calm.level, "steady");
  assert.equal(fallingPrice.level, "watch", "yield สูงขึ้นเพราะราคาลง ต้องไม่ถูกจัดว่าดีกว่า");
  assert.ok(fallingPrice.flags.some((f) => f.level === "risk"));
  assert.equal(calm.label, "Current Income View");
});

test("yieldDriver อธิบายทั้งผลของเงินจ่ายและผลของราคา", () => {
  const d = E.yieldDriver({ ttmDiv: 5, ttmDivPrev: 5, price: 40, pricePrev: 50 });
  assert.equal(d.driver, "price_down");
  assert.match(d.riskTh, /ราคาลดลง/);
  assert.ok(d.distChgPct === 0 && d.priceChgPct < 0, "ต้องคืนทั้งสองผลให้แสดงได้");
  assert.equal(E.yieldDriver({ ttmDiv: null, ttmDivPrev: 5, price: 40, pricePrev: 50 }), null);
});

test("เตือนเมื่อจ่ายไม่ครบทุกเดือน และเมื่อเงินจ่ายผันผวนสูง", () => {
  const v = E.incomeSustainabilityView({
    curYieldPct: 10, stats: { monthsWithDist12: 9, variabilityCvPct: 40 }, ddPct: 5, rsiv: 50, totalReturn: 3 });
  assert.ok(v.flags.some((f) => /9 เดือนจาก 12/.test(f.th)));
  assert.ok(v.flags.some((f) => /ผันผวน/.test(f.th)));
});

test("คำอธิบาย JEPQ ครบ และไม่ถูกเรียกว่าเงินสดหรือตราสารหนี้", () => {
  const txt = CFG.JEPQ_EDUCATION_TH.join(" ");
  assert.match(txt, /ออปชัน/);
  assert.match(txt, /ไม่ใช่เงินสดสำรอง/);
  assert.match(txt, /ไม่ใช่ตราสารหนี้/);
  assert.match(txt, /Nasdaq/);
  assert.match(CFG.SLEEVE_BY_KEY.income.warningTh,
    /เงินจ่ายของ JEPQ ไม่ใช่ดอกเบี้ยคงที่[\s\S]*ความเสี่ยงจากตลาดหุ้น/);
  assert.equal(CFG.referenceTargetPct("income"), 5);
});

test("SCHD กับ JEPQ ถูกอธิบายว่าทำหน้าที่ต่างกัน", () => {
  const d = CFG.SLEEVE_BY_KEY.dividend, i = CFG.SLEEVE_BY_KEY.income;
  assert.equal(d.label, "Dividend Growth");
  assert.equal(i.label, "Current Income");
  assert.ok(d.purposeTh.some((p) => /ผลตอบแทนรวม/.test(p)));
  assert.ok(i.purposeTh.some((p) => /รายเดือน/.test(p)));
  assert.ok(i.purposeTh.some((p) => /ไม่คงที่/.test(p)));
  assert.notEqual(d.mode, i.mode);
});
