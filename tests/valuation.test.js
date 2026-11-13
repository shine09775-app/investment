"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../src/portfolio-engine.js");

// ราคารายเดือน 5 ปี (60 จุด) ที่ราคา = P/E × EPS ณ ขณะนั้น
const NOW = Date.UTC(2026, 10, 12);
function monthly(pe, epsByYear) {
  const out = [];
  for (let k = 59; k >= 0; k--) {
    const t = NOW - k * 30.4 * 86400000;
    const y = new Date(t - 45 * 86400000).getUTCFullYear() - 1;   // งบปีล่าสุดที่ประกาศแล้ว
    const eps = epsByYear[y] ?? epsByYear[Math.min(...Object.keys(epsByYear).map(Number))];
    out.push({ t: Math.floor(t / 1000), c: pe * eps });
  }
  return out;
}
const ANNUAL = [2020, 2021, 2022, 2023, 2024, 2025].map((y) => ({ d: `${y}-12-31`, eps: 10 + (y - 2020) }));
const EPS = Object.fromEntries(ANNUAL.map((x) => [Number(x.d.slice(0, 4)), x.eps]));

test("valuationFromHistory: P/E ปัจจุบันเทียบมัธยฐานอดีตของตัวเอง", () => {
  const v = E.valuationFromHistory({ annual: ANNUAL, monthly: monthly(20, EPS), price: 15 * 15, nowMs: NOW });
  assert.equal(v.eps, 15);
  assert.ok(Math.abs(v.medPE - 20) < 1e-9);
  assert.ok(Math.abs(v.ratio - 0.75) < 1e-9);   // P/E 15 เทียบอดีต 20
});

test("valuationFromHistory: ด่านข้อมูลเหมือนฝั่งสหรัฐ — ไม่เดาเมื่อข้อมูลไม่พอ", () => {
  assert.match(E.valuationFromHistory({ annual: ANNUAL.slice(0, 1), monthly: [], price: 100 }).reason, /งบปีย้อนหลังไม่พอ/);
  assert.match(E.valuationFromHistory({ annual: ANNUAL.map((x) => ({ ...x, eps: -1 })), monthly: [], price: 100 }).reason, /ขาดทุน/);
  assert.match(E.valuationFromHistory({ annual: [{ d: "2023-12-31", eps: 1 }, { d: "2025-12-31", eps: 5 }], monthly: [], price: 100 }).reason, /โตเร็วเกิน/);
  const short = E.valuationFromHistory({ annual: ANNUAL, monthly: monthly(20, EPS).slice(-6), price: 100, nowMs: NOW });
  assert.equal(short.needsHistory, true);
  assert.equal(short.ratio, undefined);
});

test("scoreStock: มีมูลค่า -> timing + คะแนนเท่ากับ buffettScore; ไม่มี -> dca ไม่มีคะแนน", () => {
  const val = { ratio: 0.8, curPE: 16, medPE: 20 };
  const r = E.scoreStock({ price: 90, hi52: 100, rsiv: 45, val });
  assert.equal(r.mode, "timing");
  assert.equal(r.score, E.buffettScore({ price: 90, hi52: 100, rsiv: 45, val }));
  const n = E.scoreStock({ price: 90, hi52: 100, rsiv: 45, val: { reason: "บริษัทขาดทุน — ไม่มี P/E ให้เทียบ" } });
  assert.equal(n.mode, "dca");
  assert.equal(n.score, null);
  assert.match(n.modeWhy, /ขาดทุน/);
});
