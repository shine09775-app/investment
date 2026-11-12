/* นโยบายและโครงสร้างอ้างอิง — ต้องถูกต้องเสมอ */
const test = require("node:test");
const assert = require("node:assert/strict");
const CFG = require("../src/ips-config.js");
const E = require("../src/portfolio-engine.js");

test("สัดส่วนอ้างอิงรวมได้ 100% พอดี และเป็นค่าตาม IPS v2.1", () => {
  assert.equal(CFG.referenceTotalPct(), 100);
  assert.equal(CFG.referenceTargetPct("core"), 55);
  assert.equal(CFG.referenceTargetPct("mega"), 30);
  assert.equal(CFG.referenceTargetPct("dividend"), 10);
  assert.equal(CFG.referenceTargetPct("income"), 5);
  assert.equal(CFG.REFERENCE_ALLOCATION.length, 4, "ต้องมี 4 บรรทัดเท่านั้น");
});

test("Mega Trend allocation รวมได้ 100% ของ sleeve", () => {
  assert.equal(CFG.megaThemeTotalPct(), 100);
  const by = Object.fromEntries(CFG.MEGA_THEMES.map((t) => [t.key, t.pct]));
  assert.deepEqual(by, { ai_infra: 30, energy_dc: 30, cloud_ai: 20, ai_app: 10, health_ai: 10 });
});

test("ธีมคิดเป็น % ของพอร์ตอ้างอิงได้ถูกต้อง (คำนวณ ไม่ hardcode)", () => {
  assert.equal(E.round(CFG.themePctOfReference("ai_infra"), 2), 9);
  assert.equal(E.round(CFG.themePctOfReference("energy_dc"), 2), 9);
  assert.equal(E.round(CFG.themePctOfReference("cloud_ai"), 2), 6);
  assert.equal(E.round(CFG.themePctOfReference("ai_app"), 2), 3);
  assert.equal(E.round(CFG.themePctOfReference("health_ai"), 2), 3);
  const sum = CFG.MEGA_THEMES.reduce((s, t) => s + CFG.themePctOfReference(t.key), 0);
  assert.equal(E.round(sum, 6), CFG.referenceTargetPct("mega"));
});

test("normalization ผูกกับ config จริง — เปลี่ยน mega แล้วธีมขยับตาม", () => {
  const row = CFG.REFERENCE_ALLOCATION.find((r) => r.key === "mega");
  const orig = row.pct;
  try {
    row.pct = 40;
    assert.equal(E.round(CFG.themePctOfReference("ai_infra"), 2), 12);
  } finally { row.pct = orig; }
  assert.equal(E.round(CFG.themePctOfReference("ai_infra"), 2), 9);
});

test("Moonshot อยู่ใน Mega Trend ไม่ใช่ก้อนที่ห้า", () => {
  assert.ok(!CFG.REFERENCE_ALLOCATION.some((r) => /moon/i.test(r.key)),
    "Moonshot ต้องไม่เป็นบรรทัดหนึ่งในสัดส่วนอ้างอิง");
  assert.ok(!CFG.MEGA_THEMES.some((t) => /moon/i.test(t.key)),
    "Moonshot ต้องไม่เป็นธีมธุรกิจ");
  for (const t of ["QBTS", "RGTI", "RKLB", "RXRX", "BBAI"]) {
    const s = CFG.SECURITIES[t];
    assert.equal(s.sleeve, "mega", `${t} ต้องอยู่ใน sleeve mega`);
    assert.equal(CFG.isMoonshot(s), true, `${t} ต้องถูกจัดเป็น moonshot`);
    assert.ok(s.theme, `${t} ต้องมีธีมธุรกิจหลักด้วย`);
  }
});

test("เพดาน Moonshot ตาม IPS v2.1 และสอดคล้องกัน", () => {
  const L = CFG.RISK_LIMITS;
  assert.equal(L.moonshotOfMegaSleeveMaxPct, 10);
  assert.equal(L.moonshotOfReferenceMaxPct, 3);
  assert.equal(L.moonshotSinglePositionMaxPct, 1);
  // 10% ของ sleeve 30% = 3% ของพอร์ตอ้างอิง — เพดานสองชั้นต้องไม่ขัดกัน
  const implied = (L.moonshotOfMegaSleeveMaxPct / 100) * CFG.referenceTargetPct("mega");
  assert.ok(implied <= L.moonshotOfReferenceMaxPct + 1e-9);
});

test("Income ไม่อยู่ในแถวธีมของ Mega Trend", () => {
  const themeText = CFG.MEGA_THEMES.map((t) => t.key + t.label).join(" ").toLowerCase();
  assert.ok(!themeText.includes("income"));
  assert.ok(!themeText.includes("schd"));
  assert.ok(!themeText.includes("jepq"));
  assert.equal(CFG.SECURITIES.SCHD.sleeve, "dividend");
  assert.equal(CFG.SECURITIES.JEPQ.sleeve, "income");
  assert.equal(CFG.SECURITIES.SCHD.theme, undefined, "ETF รายได้ต้องไม่มีธีม Mega Trend");
  assert.equal(CFG.SECURITIES.JEPQ.theme, undefined);
});

test("Moonshot อยู่ในแถวฟิลเตอร์ความเสี่ยง ไม่ใช่แถวธีม", () => {
  const keys = CFG.MEGA_STATUS_FILTERS.map((f) => f.key);
  assert.deepEqual(keys, ["all", "scored", "dca", "good", "wait", "moon"]);
});

test("Moonshot ไม่โผล่ในกลุ่มธีมธุรกิจใด ๆ", () => {
  for (const th of CFG.MEGA_THEMES) {
    for (const t of CFG.tickersInTheme(th.key)) {
      assert.equal(CFG.isMoonshot(CFG.SECURITIES[t]), false,
        `${t} เป็น Moonshot จึงต้องไม่อยู่ในธีม ${th.key}`);
    }
  }
  // RKLB/QBTS/RGTI ยังผูกกับ ai_infra ไว้เป็นข้อมูล แต่ต้องดึงออกมาได้เมื่อขอเท่านั้น
  const withMoon = CFG.tickersInTheme("ai_infra", { includeMoonshot: true });
  for (const t of ["RKLB", "QBTS", "RGTI"]) assert.ok(withMoon.includes(t));
  assert.ok(!CFG.tickersInTheme("ai_infra").includes("RKLB"));
  assert.ok(!CFG.tickersInTheme("health_ai").includes("RXRX"));
  assert.ok(!CFG.tickersInTheme("ai_app").includes("BBAI"));
});

test("มีสามแท็บหลักเท่านั้น และไม่มีแท็บพอร์ตของฉัน", () => {
  assert.deepEqual(CFG.TABS.map((t) => t.key), ["today", "mega", "income"]);
  assert.deepEqual(CFG.TABS.map((t) => t.labelTh), ["ภาพรวมวันนี้", "Mega Trend", "Income"]);
  const all = JSON.stringify(CFG.TABS);
  assert.ok(!/พอร์ตของฉัน/.test(all));
});

test("การแมป ticker -> ธีม ตรงตามที่กำหนด และมีที่เดียว", () => {
  const expect = {
    ai_infra: ["NVDA", "AVGO", "ASML"],
    energy_dc: ["ETN", "VRT", "CEG", "GEV"],
    cloud_ai: ["MSFT", "AMZN", "GOOG"],
    ai_app: ["META"],
    health_ai: ["LLY"],
  };
  for (const [theme, tickers] of Object.entries(expect)) {
    assert.deepEqual(CFG.tickersInTheme(theme).sort(), tickers.slice().sort(), "ธีม " + theme);
  }
  // META ย้ายมา AI Applications แต่ยังแท็ก Cloud เป็นธีมรองได้
  assert.equal(CFG.SECURITIES.META.theme, "ai_app");
  assert.deepEqual(CFG.SECURITIES.META.themesExtra, ["cloud_ai"]);
});

test("watchlist เดิมยังอยู่ครบทุกตัว", () => {
  const legacy = ["VOO", "NVDA", "AVGO", "ASML", "ETN", "VRT", "CEG", "GEV", "MSFT", "AMZN",
                  "GOOG", "META", "LLY", "SCHD", "JEPQ", "RKLB", "RXRX", "QBTS", "RGTI", "BBAI"];
  for (const t of legacy) assert.ok(CFG.SECURITIES[t], `${t} หายไปจาก watchlist`);
});

test("ทุกหลักทรัพย์มี thesis และความเสี่ยงสำหรับหน้ารายละเอียด", () => {
  for (const s of CFG.universe()) {
    assert.ok(s.thesisTh && s.thesisTh.length > 10, `${s.t} ขาด thesis`);
    assert.ok(s.riskTh && s.riskTh.length > 10, `${s.t} ขาดคำอธิบายความเสี่ยง`);
  }
});

test("ไม่มีส่วนของ household / portfolio tracker หลงเหลือใน config", () => {
  assert.equal(CFG.HOUSEHOLD_TARGETS, undefined);
  assert.equal(CFG.householdTotalPct, undefined);
  assert.equal(CFG.CURRENCY_TARGETS, undefined);
  assert.equal(CFG.HEALTH_STATUS, undefined);
  assert.equal(CFG.TAX_NOTICES_TH, undefined);
  assert.equal(E.portfolioHealth, undefined);
  assert.equal(E.householdWeights, undefined);
  assert.equal(E.listedWeights, undefined);
  assert.equal(E.overlapReport, undefined);
});

test("แอประบุชัดว่า DIME เป็นแหล่งความจริงของยอดจริง", () => {
  assert.equal(CFG.APP.ledgerName, "DIME");
  assert.equal(CFG.APP.subtitleTh, "เครื่องมือตรวจสอบก่อนเติมเงินเข้าพอร์ตจริง");
  assert.ok(CFG.APP.ledgerOwnsTh.includes("ยอดถือจริง"));
  assert.ok(CFG.APP.ledgerOwnsTh.includes("เงินสดคงเหลือจริง"));
  assert.ok(CFG.APP.ownsTh.includes("Watchlist"));
});

test("เช็กลิสต์ก่อนซื้อมี 6 ข้อ และจบที่การเปิด DIME", () => {
  assert.equal(CFG.PREBUY_CHECKLIST.items.length, 6);
  assert.equal(CFG.PREBUY_CHECKLIST.titleTh, "ตรวจ 6 ข้อก่อนซื้อ");
  assert.equal(CFG.PREBUY_CHECKLIST.finalActionTh, "เปิด DIME เพื่อตรวจสัดส่วนจริงก่อนซื้อ");
  assert.match(CFG.PREBUY_CHECKLIST.noteTh, /ไม่ได้เชื่อมต่อกับ DIME/);
});

test("หลักการไม่ถูกอ้างว่าเป็นคำพูดของ Warren Buffett และคติเป็นของผู้ใช้เอง", () => {
  assert.match(CFG.PRINCIPLES_DISCLAIMER_TH, /ไม่ใช่คำพูดของ Warren Buffett/);
  assert.match(CFG.PRINCIPLES_DISCLAIMER_TH, /ไม่ได้หมายความว่าเขารับรอง/);
  assert.equal(CFG.PERSONAL_MOTTO.labelTh, "Personal Investment Motto");
  assert.match(CFG.PERSONAL_MOTTO.noteTh, /ไม่ใช่คำพูดของ Warren Buffett/);
  assert.ok(CFG.PRINCIPLES_TH.some((p) => /กองทุนดัชนีต้นทุนต่ำ/.test(p)));
  assert.ok(CFG.PRINCIPLES_TH.some((p) => /ขอบเขตความรู้/.test(p)));
});

test("ETF metadata ครบ และไม่ฝัง yield ไว้ถาวร", () => {
  for (const k of ["VOO", "SCHD", "JEPQ"]) {
    const m = CFG.ETF_METADATA[k];
    for (const f of ["category", "strategy", "distributionFrequency", "expenseRatioPct",
                     "issuer", "officialSource", "effectiveDate"]) {
      assert.ok(m[f] !== undefined && m[f] !== null, `${k}.${f} ต้องมีค่า`);
    }
    assert.ok(!("yield" in m) && !("currentYield" in m), `${k} ห้ามฝัง yield`);
  }
});
