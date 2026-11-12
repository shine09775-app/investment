/* โหมดวิเคราะห์: core_market, timing, dividend_growth, current_income_option
   + การจัดอันดับโอกาส และการปิดคะแนนเมื่อข้อมูลไม่พอ */
const test = require("node:test");
const assert = require("node:assert/strict");
const CFG = require("../src/ips-config.js");
const E = require("../src/portfolio-engine.js");

const sec = (t) => CFG.SECURITIES[t];
const goodVal = { curPE: 20, medPE: 25, ratio: 0.8 };

/* ---- card modes -------------------------------------------------------- */

test("VOO ใช้โหมด core_market และไม่ต้องใช้ข้อมูลการถือครองจริง", () => {
  assert.equal(E.cardMode(sec("VOO"), goodVal).m, "core_market");
  assert.equal(E.cardMode(sec("VOO"), null).m, "core_market");
  // ประเมินได้จากราคาอย่างเดียว ไม่ต้องมี positionValue/holding ใด ๆ
  const band = E.coreDcaLevel(E.drawdownPct(90, 100));
  assert.equal(band.key, "watch");
});

test("SCHD และ JEPQ มีโหมดแยกของตัวเอง", () => {
  assert.equal(E.cardMode(sec("SCHD"), null).m, "dividend_growth");
  assert.equal(E.cardMode(sec("JEPQ"), null).m, "current_income_option");
});

test("หุ้น Mega Trend ใช้ timing เมื่อมูลค่าเชื่อถือได้ / ตกเป็น dca เมื่อไม่พอ", () => {
  assert.equal(E.cardMode(sec("NVDA"), goodVal).m, "timing");
  const m = E.cardMode(sec("NVDA"), { reason: "งบปีย้อนหลังไม่พอ (ต้องมี ≥ 2 ปี)" });
  assert.equal(m.m, "dca");
  assert.match(m.why, /งบปีย้อนหลังไม่พอ/);
});

test("Moonshot ไม่ได้คะแนนจังหวะเสมอ แม้มูลค่าจะดูดี", () => {
  assert.equal(E.cardMode(sec("QBTS"), goodVal).m, "dca");
  assert.match(E.cardMode(sec("QBTS"), goodVal).why, /falling knife/);
});

/* ---- score suppression ------------------------------------------------- */

test("okVal ปิดคะแนนเมื่อ valuation ใช้ไม่ได้", () => {
  assert.equal(E.okVal(null), false);
  assert.equal(E.okVal({ reason: "บริษัทขาดทุน — ไม่มี P/E ให้เทียบ" }), false);
  assert.equal(E.okVal({ ratio: 0 }), false);
  assert.equal(E.okVal({ ratio: -1 }), false);
  assert.equal(E.okVal(goodVal), true);
});

test("guard ยังเป็นค่าเดิมตาม IPS และน้ำหนักคะแนนไม่เปลี่ยน", () => {
  assert.equal(CFG.VALUATION_GUARDS.maxEpsSpread, 3);
  assert.equal(CFG.VALUATION_GUARDS.minPePoints, 24);
  assert.equal(CFG.VALUATION_GUARDS.minAnnualPeriods, 2);
  assert.deepEqual(CFG.BUFFETT_WEIGHTS, { valuation: 50, drawdown: 30, rsi: 20 });
});

test("buffettScore: ข้อมูลหายถูกตัดออกแล้ว renormalize ไม่ใช่นับเป็น 0", () => {
  assert.equal(E.buffettScore({ price: 100, hi52: 100, rsiv: 70, val: { ratio: 1.3 } }), 0);
  assert.equal(E.buffettScore({ price: 100, hi52: null, rsiv: null, val: { ratio: 0.7 } }), 100);
  assert.equal(E.buffettScore({ price: 100, hi52: null, rsiv: null, val: null }), 50);
});

test("Watchlist Opportunity Index นับเฉพาะตัวที่ประเมินได้ และมีคำอธิบายกำกับ", () => {
  const r = E.watchlistIndex({ NVDA: 60, MSFT: 40 });
  assert.equal(r.value, 50);
  assert.equal(r.n, 2);
  const none = E.watchlistIndex({});
  assert.equal(none.value, null);
  assert.equal(none.state, "missing");
  assert.equal(CFG.WATCHLIST_INDEX.label, "Watchlist Opportunity Index");
  assert.match(CFG.WATCHLIST_INDEX.noteTh, /ไม่ใช่ดัชนีความกลัวของตลาดทั้งหมด/);
});

test("คะแนนถูกกำกับว่าไม่ใช่ตัววัดคุณภาพ ไม่ใช่สัญญาณขาย", () => {
  const txt = CFG.SCORE_DISCLAIMER_TH.join(" ");
  assert.match(txt, /ไม่ใช่ตัววัดคุณภาพธุรกิจ/);
  assert.match(txt, /ไม่ใช่สัญญาณขาย/);
  assert.match(txt, /ไม่ใช่การพยากรณ์ผลตอบแทน/);
});

/* ---- core DCA + cash timing -------------------------------------------- */

test("Core DCA bands ตรงตามนโยบาย และไม่มีคำสั่งหยุด DCA", () => {
  assert.equal(E.coreDcaLevel(0).labelTh, "DCA ตามแผน");
  assert.equal(E.coreDcaLevel(9.99).key, "normal");
  assert.equal(E.coreDcaLevel(10).labelTh, "เริ่มน่าสนใจ");
  assert.equal(E.coreDcaLevel(14.9).key, "watch");
  assert.equal(E.coreDcaLevel(15).labelTh, "โอกาสเพิ่มน้ำหนัก");
  assert.equal(E.coreDcaLevel(19.9).key, "opportunity");
  assert.equal(E.coreDcaLevel(20).labelTh, "ตลาดปรับฐานแรง — ทยอยใช้เงินสด");
  assert.equal(E.coreDcaLevel(60).key, "high");
  const all = CFG.CORE_DCA_BANDS.map((b) => b.labelTh + b.actionTh).join(" ");
  assert.ok(!/หยุด|เลิก|ขาย/.test(all));
  assert.match(CFG.CORE_STATEMENT_TH, /ไม่จำเป็นต้องรอจังหวะที่สมบูรณ์แบบ/);
});

test("ไม่มี drawdown = ไม่มีระดับ (null) ไม่ใช่ระดับ 0", () => {
  assert.equal(E.coreDcaLevel(null), null);
  assert.equal(E.coreDcaLevel(undefined), null);
  assert.equal(E.drawdownPct(100, null), null);
  assert.equal(E.cashTiming(null), null);
});

test("จังหวะใช้เงินสดอิงสภาพตลาด และไม่เคยบอกให้ใช้เงินสดทั้งหมด", () => {
  assert.equal(E.cashTiming(5).labelTh, "ยังไม่ต้องใช้เงินสดเพิ่ม — DCA ตามแผน");
  assert.equal(E.cashTiming(12).labelTh, "เริ่มใช้เงินสดได้เล็กน้อย");
  assert.equal(E.cashTiming(17).labelTh, "ทยอยใช้เงินสดเป็นไม้");
  assert.equal(E.cashTiming(30).labelTh, "ตลาดปรับฐานแรง — ใช้เงินสดตามแผนเป็นขั้น");
  const all = CFG.CASH_TIMING.map((c) => c.labelTh + c.detailTh).join(" ");
  assert.ok(!/ทั้งหมด|หมดหน้าตัก|all-in/i.test(all));
  assert.match(CFG.CASH_RULE_TH, /ไม่ถูกใช้หมดในครั้งเดียว/);
  assert.match(CFG.CASH_CHECK_TH, /DIME/);
});

test("RSI เป็นข้อมูลประกอบ ไม่สร้างคำแนะนำซื้อเอง", () => {
  assert.match(E.rsiContext(25), /ข้อมูลประกอบเท่านั้น/);
  assert.match(E.rsiContext(80), /ข้อมูลประกอบเท่านั้น/);
  assert.equal(E.rsiContext(null), null);
  assert.ok(!/ซื้อ/.test(E.rsiContext(25)));
});

/* ---- opportunity status & filters -------------------------------------- */

test("opportunityStatus แปลคะแนนเป็นป้ายสั้น ๆ ได้ถูกต้อง", () => {
  assert.equal(E.opportunityStatus({ mode: "timing", score: 70 }).key, "good");
  assert.equal(E.opportunityStatus({ mode: "timing", score: 55 }).key, "good");
  assert.equal(E.opportunityStatus({ mode: "timing", score: 45 }).key, "hold");
  assert.equal(E.opportunityStatus({ mode: "timing", score: 20 }).key, "wait");
  assert.equal(E.opportunityStatus({ mode: "dca" }).labelTh, "DCA ตามแผน");
  assert.equal(E.opportunityStatus({ error: true }).key, "error");
  assert.equal(E.opportunityStatus({ mode: "core_market", core: null }).key, "missing");
});

test("ฟิลเตอร์ Mega Trend ทำงานตามชนิดข้อมูล", () => {
  const nv = sec("NVDA"), qb = sec("QBTS");
  const scored = { mode: "timing", score: 60 }, dca = { mode: "dca" };
  assert.equal(E.matchesStatusFilter(nv, scored, "all"), true);
  assert.equal(E.matchesStatusFilter(nv, scored, "scored"), true);
  assert.equal(E.matchesStatusFilter(nv, dca, "scored"), false);
  assert.equal(E.matchesStatusFilter(nv, dca, "dca"), true);
  assert.equal(E.matchesStatusFilter(nv, scored, "good"), true);
  assert.equal(E.matchesStatusFilter(nv, { mode: "timing", score: 20 }, "wait"), true);
  assert.equal(E.matchesStatusFilter(qb, dca, "moon"), true);
  assert.equal(E.matchesStatusFilter(nv, scored, "moon"), false);
});

/* ---- top opportunities -------------------------------------------------- */

function card(mode, score, dd, val) {
  return { mode, score, dd, val: val || (mode === "timing" ? { ratio: 0.9 } : null), rsi: 50 };
}

test("หน้าภาพรวมแสดงโอกาสไม่เกิน 3 ตัว", () => {
  const cards = {};
  for (const s of CFG.universe()) if (s.sleeve === "mega") cards[s.t] = card("timing", 60, 10);
  assert.equal(CFG.MAX_TOP_OPPORTUNITIES, 3);
  assert.equal(E.rankOpportunities(cards).length, 3);
  assert.equal(E.rankOpportunities(cards, { limit: 2 }).length, 2);
});

test("Moonshot ไม่เข้าชิงอันดับโอกาสที่ควรศึกษาเพิ่ม", () => {
  const cards = { QBTS: card("timing", 99, 60), NVDA: card("timing", 50, 5) };
  const top = E.rankOpportunities(cards);
  assert.ok(!top.some((r) => r.ticker === "QBTS"));
  assert.equal(top[0].ticker, "NVDA");
});

test("ตัวที่ร่วงแรงแต่ประเมินมูลค่าไม่ได้ ต้องไม่แซงตัวที่ข้อมูลครบ", () => {
  const cards = {
    NVDA: { mode: "dca", dd: 45, rsi: 25, val: { reason: "บริษัทขาดทุน" }, modeWhy: "บริษัทขาดทุน" },
    MSFT: card("timing", 42, 8),
  };
  const top = E.rankOpportunities(cards);
  assert.equal(top[0].ticker, "MSFT", "ตัวที่มีข้อมูลครบต้องมาก่อน");
  const nvda = top.find((r) => r.ticker === "NVDA");
  assert.equal(nvda.limitedData, true);
  assert.match(nvda.limitationTh, /จัดอันดับได้จำกัด/, "ต้องอธิบายข้อจำกัดให้ชัด");
  assert.equal(nvda.score, null, "ไม่มีคะแนนก็ต้องไม่แสดงคะแนน");
});

test("จัดอันดับกระจายธีม — ไม่กระจุกธีมเดียวทั้งสามอันดับ", () => {
  const cards = {
    NVDA: card("timing", 80, 20), AVGO: card("timing", 78, 19), ASML: card("timing", 76, 18),
    ETN: card("timing", 60, 12), MSFT: card("timing", 58, 11),
  };
  const themes = E.rankOpportunities(cards).map((r) => r.themeKey);
  assert.equal(new Set(themes).size, 3, "สามอันดับควรมาจากสามธีม: " + themes.join(","));
  assert.equal(themes[0], "ai_infra");
});

test("แต่ละโอกาสมีเหตุผลหลักและความเสี่ยงหลักเสมอ", () => {
  const cards = { NVDA: card("timing", 65, 18), ETN: card("timing", 60, 12), MSFT: card("timing", 55, 9) };
  for (const r of E.rankOpportunities(cards)) {
    assert.ok(r.reasonTh && r.reasonTh.length > 5, r.ticker + " ขาดเหตุผล");
    assert.ok(r.riskTh && r.riskTh.length > 5, r.ticker + " ขาดความเสี่ยง");
    assert.ok(r.status && r.status.labelTh);
    assert.ok(r.rank >= 1 && r.rank <= 3);
  }
});

test("เหตุผลอธิบายมูลค่าเทียบอดีตได้ทั้งสองทิศทาง", () => {
  assert.match(E.candidateReason(sec("NVDA"), { val: { ratio: 0.8 }, dd: 12 }), /P\/E ต่ำกว่ามัธยฐาน/);
  assert.match(E.candidateReason(sec("NVDA"), { val: { ratio: 1.2 }, dd: 2 }), /P\/E สูงกว่ามัธยฐาน/);
  assert.match(E.candidateReason(sec("NVDA"), { val: null, dd: 1 }), /ยังไม่มีส่วนลดที่ชัดเจน/);
});

test("การ์ดที่โหลดไม่สำเร็จ ไม่เข้าการจัดอันดับ", () => {
  const top = E.rankOpportunities({ NVDA: { error: true }, MSFT: card("timing", 50, 5) });
  assert.equal(top.length, 1);
  assert.equal(top[0].ticker, "MSFT");
  assert.equal(E.rankOpportunities({}).length, 0);
});

/* ---- indicators --------------------------------------------------------- */

test("RSI deterministic และคืน null เมื่อข้อมูลสั้นเกินไป", () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 5);
  assert.equal(E.rsi(closes), E.rsi(closes));
  assert.equal(E.rsi([1, 2, 3]), null);
  assert.equal(E.rsi(Array.from({ length: 30 }, (_, i) => 100 + i)), 100);
  assert.equal(E.sma([1, 2, 3], 200), null);
  assert.equal(E.sma([2, 4, 6], 3), 4);
});
