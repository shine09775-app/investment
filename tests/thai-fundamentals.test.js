"use strict";
// ทดสอบ src/thai-fundamentals.js ด้วยข้อมูลสมมติที่สร้างในไฟล์นี้เท่านั้น
// (ไม่ใช่ข้อมูลจริงของบริษัทใด และไม่ถูกนำไปปนกับ src/data/thai-fundamentals.json)
const test = require("node:test");
const assert = require("node:assert/strict");
const TF = require("../src/thai-fundamentals.js");
const REAL = require("../src/data/thai-fundamentals.json");

const NOW = Date.UTC(2026, 10, 13);   // 13 พ.ย. 2569 -> ปีบัญชีที่ปิดแล้วล่าสุด = 2025 (2568)
const SRC = { sourceName: "ทดสอบ", sourceUrl: "https://example.test/ir", updatedAt: "2026-11-13" };
const fy = (value, unit, year, extra) => ({ value, unit, periodType: "FY", periodEnd: `${year}-12-31`, reported: true, ...SRC, ...extra });
const year = (y, o) => ({
  fy: y,
  eps: o.eps == null ? null : fy(o.eps, "THB/share", y, o.epsExtra),
  bvps: o.bvps == null ? null : fy(o.bvps, "THB/share", y),
  roe: o.roe == null ? null : fy(o.roe, "%", y),
  netIncomeToOwners: o.ni == null ? null : fy(o.ni, "THB", y),
  equityToOwners: o.eq == null ? null : fy(o.eq, "THB", y),
  dpsRegular: o.dps == null ? null : fy(o.dps, "THB/share", y, o.dpsExtra),
  dpsSpecial: o.special == null ? null : fy(o.special, "THB/share", y),
  payoutRatio: o.payout == null ? null : fy(o.payout, "%", y),
  shareBaseNote: o.note || null,
});

test("ข้อมูลจริงใน repo ผ่าน validation และไม่มีตัวเลขที่ไม่มีแหล่ง", () => {
  assert.deepEqual(TF.validateData(REAL), []);
});

test("ปีบัญชีที่ปิดแล้ว: 5 ปีล่าสุด ปีที่ขาดเป็นช่องว่าง ไม่ใช่ศูนย์", () => {
  assert.equal(TF.latestClosedFY("12-31", NOW), 2025);
  assert.equal(TF.latestClosedFY("12-31", Date.UTC(2026, 11, 31)), 2025);
  assert.equal(TF.latestClosedFY("12-31", Date.UTC(2027, 0, 2)), 2026);
  const s = { annual: [year(2021, { eps: 2 }), year(2022, { eps: 2.2 }), year(2024, { eps: 2.5 }), year(2025, { eps: 2.6 })] };
  const A = TF.analyze(s, NOW);
  assert.deepEqual(A.rows.map((r) => r.fy), [2021, 2022, 2023, 2024, 2025]);
  assert.deepEqual(A.rows.map((r) => r.labelBE), [2564, 2565, 2566, 2567, 2568]);
  assert.equal(A.rows[2].row, null);
  assert.equal(A.rows[2].eps, null);
  assert.equal(A.rows[2].div.dps, null);
  assert.equal(A.rows[2].roe.value, null);
});

test("ROE: ใช้ค่าที่รายงานก่อน; คำนวณจากทุนเฉลี่ยต้น/ปลายงวดพร้อมสูตร; ขาดปีก่อนหน้า = N/A", () => {
  const rep = TF.roeFor(year(2025, { roe: 14.2, ni: 999, eq: 1 }), null);
  assert.equal(rep.value, 14.2);
  assert.equal(rep.reported, true);
  const calc = TF.roeFor(year(2025, { ni: 110, eq: 1100 }), year(2024, { eq: 900 }));
  assert.equal(calc.reported, false);
  assert.equal(calc.formula, TF.ROE_FORMULA);
  assert.ok(Math.abs(calc.value - 11) < 1e-9);   // 110 / ((900+1100)/2)
  const gap = TF.roeFor(year(2025, { ni: 110, eq: 1100 }), null);
  assert.equal(gap.value, null);
  assert.match(gap.reason, /ต้นงวด/);
});

test("ปันผลพิเศษ: แยกจากปันผลปกติ และ payout คำนวณรวมทั้งสองพร้อมป้ายคำนวณ", () => {
  const d = TF.dividendFor(year(2025, { eps: 4, dps: 2, special: 1 }));
  assert.equal(d.regular, 2);
  assert.equal(d.special, 1);
  assert.equal(d.dps, 3);
  assert.equal(d.payout, 75);
  assert.equal(d.payoutReported, false);
  assert.ok(d.formula);
  // ไม่ทราบว่ามีปันผลพิเศษ = null (ไม่ใช่ 0)
  const u = TF.dividendFor(year(2025, { eps: 4, dps: 2 }));
  assert.equal(u.special, null);
  assert.equal(u.specialKnown, false);
});

test("payout: ใช้ค่าที่บริษัทรายงานก่อน; จ่ายเกิน 100% แสดงค่าจริงพร้อมธง", () => {
  const rep = TF.dividendFor(year(2025, { eps: 4, dps: 2, payout: 52 }));
  assert.equal(rep.payout, 52);
  assert.equal(rep.payoutReported, true);
  const over = TF.dividendFor(year(2025, { eps: 4, dps: 5 }));
  assert.equal(over.payout, 125);
  assert.equal(over.overEarnings, true);
});

test("EPS ติดลบ: payout = N/A พร้อมเหตุผล, P/E ไม่คำนวณ, นับปีที่ EPS ≤ 0", () => {
  const d = TF.dividendFor(year(2025, { eps: -1.5, dps: 0.5 }));
  assert.equal(d.payout, null);
  assert.match(d.reason, /EPS ≤ 0/);
  assert.equal(TF.peCheck({ price: 20, eps: -1.5, providerPe: 15 }).state, "negative_eps");
  const g = TF.growthCheck(TF.fiveYears({ annual: [2021, 2022, 2023, 2024, 2025].map((y, i) => year(y, { eps: i === 2 ? -1 : 2 + i, bvps: 20 })) }, NOW));
  assert.match(g.checks[0], /1 ปีที่ EPS ≤ 0/);
});

test("payout: DPS กับ EPS คนละฐานจำนวนหุ้น (เช่นหลังแตกพาร์) ห้ามหารกัน", () => {
  const d = TF.dividendFor(year(2025, { eps: 4, dps: 2, dpsExtra: { shareBasis: "par 10" }, epsExtra: { shareBasis: "par 1" } }));
  assert.equal(d.payout, null);
  assert.match(d.reason, /ฐานจำนวนหุ้นต่างกัน/);
});

test("BVPS vs EPS: ทุนต่อหุ้นเพิ่มแต่กำไรไม่ตาม -> สิ่งที่ควรตรวจต่อ; ข้อมูล < 3 ปี -> ยังไม่พอสรุป", () => {
  const up = TF.growthCheck(TF.fiveYears({ annual: [2021, 2022, 2023, 2024, 2025].map((y, i) => year(y, { eps: 3, bvps: 20 + i * 2, note: i === 3 ? "เพิ่มทุน RO" : null })) }, NOW));
  assert.equal(up.enough, true);
  assert.equal(up.headline, "ทุนต่อหุ้นเพิ่ม แต่กำไรต่อหุ้นยังไม่เพิ่มตาม");
  assert.match(up.shareBaseNotes[0], /2567: เพิ่มทุน RO/);
  const thin = TF.growthCheck(TF.fiveYears({ annual: [year(2024, { eps: 3, bvps: 20 }), year(2025, { eps: 3, bvps: 22 })] }, NOW));
  assert.equal(thin.enough, false);
  assert.equal(thin.headline, "ข้อมูลยังไม่พอสรุป");
});

test("P/E ไม่ตรงฐานข้อมูล: 246 ÷ 20.63 = 11.92× เทียบ provider 11.27× -> mismatch ไม่เขียนทับ", () => {
  const c = TF.peCheck({ price: 246, eps: 20.63, providerPe: 11.27 });
  assert.equal(c.state, "mismatch");
  assert.equal(Math.round(c.computed * 100) / 100, 11.92);
  assert.equal(c.provider, 11.27);
  assert.ok(c.diffPct > 5);
  assert.equal(TF.peCheck({ price: 246, eps: 20.63, providerPe: 11.9 }).state, "ok");
  assert.equal(TF.peCheck({ price: null, eps: 20.63, providerPe: 11.27 }).state, "missing");
});

test("ธนาคาร: มี CAR แต่ไม่มี CET1 -> แสดง CAR และแจ้งว่าไม่มี CET1 (ไม่ใช้แทนกัน)", () => {
  const q = { unit: "%", periodType: "quarter", periodEnd: "2026-06-30", periodLabel: "ไตรมาส 2/2569", basis: "consolidated", reported: true, ...SRC };
  const B = TF.bankCard({ bank: { car: { value: 19.1, ...q }, nim: { value: 3.4, annualized: true, ...q } } });
  assert.equal(B.rows.find((r) => r.key === "car").value, 19.1);
  assert.equal(B.rows.find((r) => r.key === "cet1").value, null);
  assert.match(B.notes.join(" "), /ยังไม่มีข้อมูล CET1/);
  // งบต่างฐานต้องแจ้ง
  const mixed = TF.bankCard({ bank: { car: { value: 19.1, ...q }, cet1: { value: 16, ...q, basis: "separate" } } });
  assert.match(mixed.notes.join(" "), /ต่างฐาน/);
  assert.equal(TF.bankCard({ bank: {} }).hasAny, false);
});

test("validation: ค่าไม่มีแหล่ง/งวด, calculated ไม่มีสูตร, ข้อมูลรายปีที่ไม่ใช่ FY และค่าธนาคารไม่มีชื่องวด ถูกปฏิเสธ", () => {
  const bad = { schemaVersion: 1, stocks: { X: {
    annual: [
      { fy: 2025, eps: { value: 3, unit: "THB/share", periodType: "FY", periodEnd: "2025-12-31", reported: true } },
      { fy: 2024, eps: { ...fy(3, "THB/share", 2024), reported: false } },
      { fy: 2023, eps: { ...fy(3, "THB/share", 2023), periodType: "YTD" } },
    ],
    bank: { car: { value: 19, unit: "%", periodType: "quarter", periodEnd: "2026-06-30", reported: true, ...SRC } },
  } } };
  const errs = TF.validateData(bad).join("\n");
  assert.match(errs, /annual\[0\]\.eps\.sourceName ขาด/);
  assert.match(errs, /annual\[1\]\.eps: ค่าที่คำนวณ .* ต้องมี formula/);
  assert.match(errs, /annual\[2\]\.eps: ข้อมูลรายปีต้องเป็น periodType "FY"/);
  assert.match(errs, /bank\.car\.periodLabel ขาด/);
  // null = ยังไม่มีข้อมูล (อนุญาต) — ห้ามบังคับให้ใส่ 0
  assert.deepEqual(TF.validateData({ schemaVersion: 1, stocks: { X: { annual: [{ fy: 2025, eps: null }], bank: { cet1: null } } } }), []);
});
