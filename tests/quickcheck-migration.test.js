/* Quick DIME Check, migration v3, และคุณภาพข้อมูล/ออฟไลน์ */
const test = require("node:test");
const assert = require("node:assert/strict");
const CFG = require("../src/ips-config.js");
const E = require("../src/portfolio-engine.js");

function mockStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

/* ---- Quick DIME Check --------------------------------------------------- */

test("คำนวณน้ำหนักก่อน/หลังซื้อจากตัวเลขที่ผู้ใช้กรอกเอง", () => {
  const r = E.quickDimeCheck({ totalListed: 1000000, positionValue: 50000, buyAmount: 50000 }, "NVDA");
  assert.equal(r.ok, true);
  assert.equal(E.round(r.weightBeforePct, 2), 5);
  assert.equal(E.round(r.weightAfterPct, 4), 9.5238);   // 100,000 / 1,050,000
  assert.equal(r.totalAfter, 1050000);
  assert.match(r.noteTh, /ไม่ได้ดึงจาก DIME/);
});

test("ข้อมูลไม่พอ -> ไม่คำนวณ และไม่แปลงค่าว่างเป็น 0", () => {
  const r = E.quickDimeCheck({ totalListed: "", positionValue: "50000", buyAmount: "" }, "NVDA");
  assert.equal(r.ok, false);
  assert.equal(r.messageTh, "กรอกข้อมูลไม่พอสำหรับคำนวณ");
  assert.equal(r.weightBeforePct, null);
  assert.equal(r.weightAfterPct, null);
  assert.ok(r.missing.includes("มูลค่าพอร์ตหุ้นรวมโดยประมาณ"));
  assert.ok(r.missing.includes("จำนวนเงินที่จะซื้อรอบนี้"));
  assert.equal(r.warnings.length, 0);
});

test("ศูนย์ที่ผู้ใช้พิมพ์เองคือศูนย์จริง ต่างจากช่องว่าง", () => {
  assert.equal(E.parseAmount("0"), 0);
  assert.equal(E.parseAmount(""), null);
  assert.equal(E.parseAmount("   "), null);
  assert.equal(E.parseAmount(null), null);
  assert.equal(E.parseAmount("-5"), null);
  assert.equal(E.parseAmount("abc"), null);
  assert.equal(E.parseAmount("1,250,000"), 1250000);
  // ซื้อตัวใหม่ที่ยังไม่เคยถือ = positionValue 0 -> คำนวณได้
  const r = E.quickDimeCheck({ totalListed: 100000, positionValue: 0, buyAmount: 1000 }, "LLY");
  assert.equal(r.ok, true);
  assert.equal(r.weightBeforePct, 0);
});

test("เตือนเมื่อหลังซื้อจะเกินเพดานหุ้นรายตัว", () => {
  const warn = E.quickDimeCheck({ totalListed: 100000, positionValue: 5000, buyAmount: 2000 }, "NVDA");
  assert.equal(warn.warnings[0].level, "warn");
  assert.match(warn.warnings[0].th, /เกินเป้าหมายเริ่มต้นรายตัว 5%/);

  const hard = E.quickDimeCheck({ totalListed: 100000, positionValue: 9000, buyAmount: 2000 }, "NVDA");
  assert.equal(hard.warnings[0].level, "hard");
  assert.match(hard.warnings[0].th, /8%/);
});

test("เพดาน Moonshot รายตัวคุมที่ 1%", () => {
  const r = E.quickDimeCheck({ totalListed: 100000, positionValue: 500, buyAmount: 1500 }, "QBTS");
  assert.equal(r.warnings[0].level, "hard");
  assert.match(r.warnings[0].th, /Moonshot รายตัว 1%/);
  const ok = E.quickDimeCheck({ totalListed: 1000000, positionValue: 2000, buyAmount: 2000 }, "QBTS");
  assert.equal(ok.warnings.length, 0);
});

test("น้ำหนัก Mega Trend คำนวณต่อเมื่อกรอกมูลค่า sleeve มาด้วย", () => {
  const without = E.quickDimeCheck({ totalListed: 100000, positionValue: 1000, buyAmount: 1000 }, "NVDA");
  assert.equal(without.megaWeightAfterPct, null, "ไม่กรอก = ไม่เดา");

  const withMega = E.quickDimeCheck(
    { totalListed: 100000, positionValue: 1000, buyAmount: 1000, megaValue: 35000 }, "NVDA");
  assert.equal(E.round(withMega.megaWeightAfterPct, 4), 35.6436);  // 36,000 / 101,000
  assert.ok(withMega.warnings.some((w) => /Mega Trend/.test(w.th)), "เกิน 30% ต้องเตือน");

  // ซื้อ VOO ไม่ทำให้ Mega Trend โต
  const core = E.quickDimeCheck(
    { totalListed: 100000, positionValue: 50000, buyAmount: 10000, megaValue: 20000 }, "VOO");
  assert.equal(E.round(core.megaWeightAfterPct, 4), 18.1818);      // 20,000 / 110,000
  assert.equal(core.warnings.length, 0);
});

test("VOO ไม่ถูกคุมด้วยเพดานหุ้นรายตัว (เป็นกองทุนกระจาย)", () => {
  const r = E.quickDimeCheck({ totalListed: 100000, positionValue: 50000, buyAmount: 10000 }, "VOO");
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 0);
  assert.ok(r.weightAfterPct > 50);
});

/* ---- migration v3 ------------------------------------------------------- */

test("migration ตั้ง schema 3 และสร้าง ui state", () => {
  const s = mockStorage();
  const r = E.runMigration(s);
  assert.equal(r.to, 3);
  assert.equal(r.migrated, true);
  assert.equal(s.getItem(CFG.STORAGE.schemaKey), "3");
  const ui = JSON.parse(s.getItem(CFG.STORAGE.uiKey));
  assert.equal(ui.guideSeen, false, "เข็มทิศต้องกางในครั้งแรก");
  assert.equal(ui.tab, "today");
  assert.equal(ui.market, "us", "ค่าเริ่มต้นต้องอยู่ตลาดสหรัฐ");
});

test("migration เป็น idempotent", () => {
  const s = mockStorage();
  E.runMigration(s);
  const first = s.getItem(CFG.STORAGE.uiKey);
  const r2 = E.runMigration(s);
  assert.equal(s.getItem(CFG.STORAGE.uiKey), first);
  assert.equal(r2.migrated, false);
  E.runMigration(s);
  assert.equal(s.getItem(CFG.STORAGE.uiKey), first);
});

test("migration จาก v2 เก็บข้อมูลพอร์ตเดิมไว้เป็น legacy โดยไม่ลบของเดิม", () => {
  const v2 = JSON.stringify({ schemaVersion: 2, household: { cash: 50000 }, positions: { VOO: 150000 } });
  const s = mockStorage({ "mtp.schema": "2", "mtp.portfolio": v2 });
  const r = E.runMigration(s);
  assert.equal(r.migrated, true);
  assert.equal(r.legacyMoved, true);
  assert.equal(s.getItem("mtp.portfolio"), v2, "ของเดิมต้องไม่ถูกลบ");
  assert.equal(s.getItem(CFG.STORAGE.legacyPortfolioKey), v2, "ต้องมีสำเนาไว้ export");
  const legacy = E.readLegacyPortfolio(s);
  assert.equal(legacy.positions.VOO, 150000);
  // รันซ้ำต้องไม่เขียนทับสำเนา
  E.runMigration(s);
  assert.equal(s.getItem(CFG.STORAGE.legacyPortfolioKey), v2);
});

test("migration ไม่ลบ watchlist / ราคา / คะแนน / บทวิเคราะห์ที่แคชไว้", () => {
  const s = mockStorage({
    snap1: JSON.stringify({ savedAt: 1, cards: { NVDA: { price: 100 } } }),
    snap2: JSON.stringify({ savedAt: 2, cards: { MSFT: { price: 400, score: 55 } } }),
    "val2:NVDA": JSON.stringify({ ts: 1, eps: 2, medPE: 30 }),
    "inc1:SCHD": JSON.stringify({ ts: 1, ttmDiv: 2.7 }),
    "dist2:JEPQ": JSON.stringify({ ts: 1, divs: [{ date: 1, amount: 0.4 }] }),
    "kirin:2026-08-01": JSON.stringify({ ts: 1, analysis: "เดิม" }),
    "kirinCalls:2026-08-01": "2",
  });
  const before = s.keys().slice();
  const r = E.runMigration(s);
  for (const k of before) assert.notEqual(s.getItem(k), null, `${k} ต้องยังอยู่หลัง migration`);
  assert.equal(JSON.parse(s.getItem("snap2")).cards.MSFT.score, 55);
  assert.equal(JSON.parse(s.getItem("val2:NVDA")).medPE, 30);
  assert.equal(JSON.parse(s.getItem("dist2:JEPQ")).divs.length, 1);
  assert.ok(r.preserved.includes("snap1") && r.preserved.includes("snap2"));
});

test("migration ทนต่อ ui state ที่พัง โดยไม่ทำให้แอปล่ม", () => {
  for (const bad of [null, undefined, 42, "x", [], { tab: "ไม่มีแท็บนี้" }, { checklist: 5 }]) {
    const ui = E.migrateUiState(bad);
    assert.equal(ui.schemaVersion, 3);
    assert.equal(ui.tab, "today");
    assert.equal(ui.market, "us");
    assert.equal(typeof ui.checklist, "object");
    assert.equal(ui.guideSeen, false);
  }
  const kept = E.migrateUiState({ guideSeen: true, tab: "income", checklist: { moat: true } });
  assert.equal(kept.guideSeen, true);
  assert.equal(kept.tab, "income");
  assert.equal(kept.market, "us");
  assert.equal(kept.checklist.moat, true);
});

test("ui state จดจำตลาดหุ้นไทยได้ โดยไม่กระทบแท็บสหรัฐ", () => {
  const thai = E.migrateUiState({ market: "thai", tab: "mega" });
  assert.equal(thai.market, "thai");
  assert.equal(thai.tab, "mega");
});

test("Quick Check ไม่ถูกบันทึกโดย migration และมีคีย์แยกไว้ต่างหาก", () => {
  const s = mockStorage();
  E.runMigration(s);
  assert.equal(s.getItem(CFG.STORAGE.quickCheckKey), null,
    "ค่าจาก Quick Check ต้องไม่ถูกเขียนลงเครื่องเอง");
  assert.equal(CFG.STORAGE.quickCheckKey, "mtp.quickcheck");
});

/* ---- data quality / offline -------------------------------------------- */

test("metric: ข้อมูลหาย = missing, ห้ามกลายเป็น 0", () => {
  assert.equal(E.metric(null, { source: "Yahoo Finance" }).value, null);
  assert.equal(E.metric(null, {}).state, "missing");
  assert.equal(E.metric(0, {}).value, 0, "ศูนย์จริงต้องไม่ถูกมองว่าหาย");
  assert.equal(E.metric(0, {}).state, "ok");
  assert.equal(E.metric(NaN, {}).state, "missing");
  assert.equal(E.metric(Infinity, {}).state, "missing");
});

test("metric: ข้อมูลเก่ากว่าเกณฑ์ถูกติดป้าย stale แต่ยังแสดงค่าได้", () => {
  assert.equal(E.metric(100, { asOfMs: Date.now() - 1000 }).state, "ok");
  const old = E.metric(100, { asOfMs: Date.now() - 5 * 24 * 3600 * 1000 });
  assert.equal(old.state, "stale");
  assert.equal(old.value, 100);
});

test("metric รองรับ source / asOf / loading / error ครบตามกติกาคุณภาพข้อมูล", () => {
  const m = E.metric(4.2, { source: "Yahoo Finance", asOf: "2026-08-04", asOfMs: Date.now() });
  assert.equal(m.source, "Yahoo Finance");
  assert.equal(m.asOf, "2026-08-04");
  assert.equal(E.metric(null, { state: "loading" }).state, "loading");
  assert.equal(E.metric(null, { state: "error" }).state, "error");
});

test("offline: snapshot ที่บันทึกไว้ยังใช้ประเมินต่อได้ครบ", () => {
  const snap = { savedAt: Date.now() - 3600e3, gauge: 42, gaugeN: 7,
    cards: { VOO: { mode: "core_market", price: 500, dd: 12, core: E.coreDcaLevel(12) },
             MSFT: { mode: "timing", score: 58, dd: 9, val: { ratio: 0.95 }, rsi: 45 } } };
  const reloaded = JSON.parse(JSON.stringify(snap));
  assert.equal(E.opportunityStatus(reloaded.cards.VOO).labelTh, "เริ่มน่าสนใจ");
  assert.equal(E.opportunityStatus(reloaded.cards.MSFT).key, "good");
  const top = E.rankOpportunities(reloaded.cards);
  assert.equal(top.length, 1);
  assert.equal(top[0].ticker, "MSFT");
});
