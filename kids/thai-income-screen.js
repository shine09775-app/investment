/* ============================================================================
 * thai-income-screen.js — คัดกรองหุ้น Income ไทย + เครื่องมือตั้งขนาด sleeve
 * คู่กับ thai-income-sleeve.md
 *
 * เหตุผลที่ต้องมีไฟล์นี้:
 *   incomeSignal() ที่ portfolio.html:496 ใช้เกณฑ์ "yield > มัธยฐาน = น่าสะสม"
 *   เกณฑ์นี้ถูกกับ SCHD/JEPQ แต่ผิดกับหุ้นไทย — หุ้นที่ราคาร่วง 40% เพราะธุรกิจพัง
 *   และกำลังจะตัดปันผล จะถูกจัดเป็น "Yield สูงกว่าปกติ · น่าสะสม" พอดี
 *
 *   ไฟล์นี้แยกให้ออกว่า yield ที่สูงขึ้นมาจาก "ปันผลโต" หรือ "ราคาร่วง"
 *
 * ⚠️ เครื่องมือคัดกรอง ไม่ใช่คำแนะนำการลงทุน — ผ่านเกณฑ์ ≠ ควรซื้อ
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * 1. YIELD TRAP DETECTOR — หัวใจของไฟล์นี้
 * ------------------------------------------------------------------------- */

/**
 * yield เปลี่ยนได้จาก 2 ทาง — ต้องแยกให้ออกว่าทางไหน
 *
 *      yield = ปันผล / ราคา
 *
 *   ปันผลเพิ่ม → yield สูงขึ้น  ✅ ของดี
 *   ราคาลด    → yield สูงขึ้น  ⚠️ อาจเป็นกับดัก
 *
 * @param {Object} d
 *   divTTM      ปันผล 12 เดือนล่าสุด (ไม่รวม special)
 *   divTTMPrev  ปันผล 12 เดือนของปีก่อนหน้า
 *   price       ราคาปัจจุบัน
 *   pricePrev   ราคาเมื่อ 1 ปีก่อน
 */
function yieldDecomposition(d) {
  const yNow  = d.divTTM / d.price * 100;
  const yPrev = d.divTTMPrev / d.pricePrev * 100;

  const divChg   = (d.divTTM / d.divTTMPrev - 1) * 100;    // % ปันผลเปลี่ยน
  const priceChg = (d.price / d.pricePrev - 1) * 100;      // % ราคาเปลี่ยน

  let driver, flag;
  if (yNow <= yPrev) {
    driver = "yield ลดลง";  flag = "ok";
  } else if (divChg >= 5 && priceChg > -10) {
    driver = "ปันผลโต";      flag = "good";      // ของจริง
  } else if (priceChg <= -20 && divChg < 5) {
    driver = "ราคาร่วง";     flag = "trap-risk"; // 🚩 สัญญาณกับดัก
  } else if (priceChg < 0 && divChg < 5) {
    driver = "ราคาอ่อนตัว";  flag = "watch";
  } else {
    driver = "ผสม";          flag = "watch";
  }

  return {
    yieldNow: +yNow.toFixed(2), yieldPrev: +yPrev.toFixed(2),
    divChgPct: +divChg.toFixed(1), priceChgPct: +priceChg.toFixed(1),
    driver, flag,
  };
}

/* ---------------------------------------------------------------------------
 * 2. INCOME GATES — 5 ด่าน (thai-income-sleeve.md §4)
 * ------------------------------------------------------------------------- */

/**
 * @param {Object} f
 *   divTTM, divTTMPrev, price, pricePrev
 *   specialDivTTM    ปันผลพิเศษที่ปนอยู่ใน TTM (ต้องหักออก)
 *   fcfPerShare      กระแสเงินสดอิสระต่อหุ้น (เฉลี่ย 3 ปี)
 *   epsHistory       กำไรต่อหุ้นย้อนหลัง 5-7 ปี — ใช้จับวัฏจักร
 *   divHistory10y    ปันผลต่อหุ้นรายปี ย้อนหลัง 10 ปี
 */
function thaiIncomeGates(f) {
  // หัก special dividend ออกก่อนเสมอ — ไม่งั้น yield หลอก
  const coreDiv = f.divTTM - (f.specialDivTTM || 0);
  const decomp  = yieldDecomposition({ ...f, divTTM: coreDiv });

  // ตัดปันผลครั้งใหญ่สุดในรอบ 10 ปี
  const h = f.divHistory10y || [];
  let worstCut = 0;
  for (let i = 1; i < h.length; i++) {
    if (h[i - 1] > 0) worstCut = Math.min(worstCut, (h[i] / h[i - 1] - 1) * 100);
  }

  // ความเป็นวัฏจักรของกำไร: กำไรปีล่าสุด สูงกว่าค่าเฉลี่ยระยะยาวแค่ไหน
  const eps = f.epsHistory || [];
  const epsAvg = eps.length ? eps.reduce((s, x) => s + x, 0) / eps.length : NaN;
  const epsLast = eps.length ? eps[eps.length - 1] : NaN;
  const cyclicality = isFinite(epsAvg) && epsAvg !== 0 ? epsLast / epsAvg : NaN;

  const payoutOfFcf = f.fcfPerShare > 0 ? (coreDiv / f.fcfPerShare) * 100 : Infinity;

  const gates = [
    { id: 1, name: "ไม่ใช่ Yield Trap", pass: decomp.flag !== "trap-risk",
      why: `yield สูงขึ้นเพราะ${decomp.driver} (ราคา ${decomp.priceChgPct}% / ปันผล ${decomp.divChgPct}%)` },

    { id: 2, name: "จ่ายไหวจริง", pass: payoutOfFcf <= 80,
      why: `จ่ายปันผล ${isFinite(payoutOfFcf) ? payoutOfFcf.toFixed(0) : "∞"}% ของ FCF (เกณฑ์ ≤ 80%)` },

    { id: 3, name: "ไม่เคยตัดปันผลหนัก", pass: worstCut > -20,
      why: `ลดปันผลมากสุด ${worstCut.toFixed(0)}% ใน 10 ปี (เกณฑ์ > −20%)` },

    { id: 4, name: "ปันผลไม่ใช่ของชั่วคราว", pass: (f.specialDivTTM || 0) / f.divTTM < 0.25,
      why: "ปันผลพิเศษต้องไม่เกิน 25% ของปันผลรวม" },

    { id: 5, name: "ไม่ได้อยู่ยอดวัฏจักร", pass: !isFinite(cyclicality) ? false : cyclicality <= 1.5,
      why: `กำไรปีล่าสุด = ${isFinite(cyclicality) ? cyclicality.toFixed(2) : "?"}× ของค่าเฉลี่ย (เกณฑ์ ≤ 1.5×)` },
  ];

  const failed = gates.filter(g => !g.pass);

  // yield ที่ยั่งยืน = ใช้ตัวเลขที่ระมัดระวังกว่าเสมอ
  const sustainableYield = Math.min(
    coreDiv / f.price * 100,
    (f.fcfPerShare > 0 ? f.fcfPerShare * 0.8 / f.price * 100 : Infinity)
  );

  return {
    gates, passedAll: failed.length === 0, failed,
    decomposition: decomp,
    headlineYield: +(f.divTTM / f.price * 100).toFixed(2),
    sustainableYield: +sustainableYield.toFixed(2),
    payoutOfFcf: isFinite(payoutOfFcf) ? +payoutOfFcf.toFixed(0) : null,
    worstCut10y: +worstCut.toFixed(0),
  };
}

/** สัญญาณสำหรับการ์ดในแอป — แทน incomeSignal() เมื่อเป็นหุ้นไทย */
function thaiIncomeSignal(r) {
  if (!r.passedAll) {
    const first = r.failed[0];
    return { l: `ตัดออก · ${first.name}`, c: "var(--red)", bg: "rgba(239,83,101,.15)", detail: first.why };
  }
  const f = r.decomposition.flag;
  if (f === "good")
    return { l: "ปันผลโตจริง · น่าสะสม", c: "var(--green)", bg: "rgba(38,194,129,.15)", detail: r.decomposition.driver };
  if (f === "watch")
    return { l: "ผ่านเกณฑ์ · ดูอาการก่อน", c: "var(--yellow)", bg: "rgba(240,192,64,.13)", detail: r.decomposition.driver };
  return { l: "Income · DCA ตามแผน", c: "var(--teal)", bg: "rgba(45,212,191,.13)", detail: r.decomposition.driver };
}

/* ---------------------------------------------------------------------------
 * 3. SLEEVE SIZING — ตั้งขนาดจากตัวเลข ไม่ใช่ความรู้สึก
 * ------------------------------------------------------------------------- */

/**
 * วิธี A — ตั้งจากความต้องการใช้เงินสดจริง (thai-income-sleeve.md §2A)
 * @param {number} annualCashNeedTHB  เงินสดที่ต้องใช้จากพอร์ตต่อปี
 * @param {number} sustainableYield   % — ใช้ sustainableYield ไม่ใช่ headline
 * @param {number} portfolioTHB       ขนาดพอร์ตรวม
 */
function sizeByIncomeNeed(annualCashNeedTHB, sustainableYield, portfolioTHB) {
  if (!annualCashNeedTHB || annualCashNeedTHB <= 0) {
    return {
      sleeveTHB: 0, sleevePct: 0,
      note: "ยังไม่ต้องใช้เงินสดจากพอร์ต → วิธีนี้ตอบ 0% " +
            "ถ้ายังอยากมี sleeve นี้ ต้องตอบให้ได้ก่อนว่าต้องการอะไรจากมัน (ดู §6 ข้อ 2)",
    };
  }
  const sleeveTHB = annualCashNeedTHB / (sustainableYield / 100);
  const pct = (sleeveTHB / portfolioTHB) * 100;
  return {
    sleeveTHB: Math.round(sleeveTHB),
    sleevePct: +pct.toFixed(1),
    note: pct > 40
      ? "⚠️ ต้องใช้พอร์ตเกิน 40% เพื่อสร้างกระแสเงินสดนี้ — แปลว่าเป้ากระแสเงินสดสูงเกินกว่าขนาดพอร์ต"
      : "ขนาดที่คำนวณจากความต้องการใช้เงินจริง",
  };
}

/**
 * วิธี B — ดูว่า sleeve ช่วยลดความผันผวนได้จริงแค่ไหน (thai-income-sleeve.md §2B)
 * ใช้สูตร variance ของพอร์ต 2 สินทรัพย์
 *
 * @param {number} wSleeve  น้ำหนัก sleeve (0-1)
 * @param {number} sdMain   ความผันผวนพอร์ตหลัก (% ต่อปี) เช่น 22 สำหรับพอร์ตหุ้นเติบโต
 * @param {number} sdSleeve ความผันผวน sleeve เช่น 18 สำหรับหุ้นปันผลไทย, 4 สำหรับตราสารหนี้
 * @param {number} corr     สหสัมพันธ์ — หุ้นไทย vs หุ้นโลก ~0.5-0.7 / ตราสารหนี้ ~0-0.2
 */
function sleeveVolImpact(wSleeve, sdMain, sdSleeve, corr) {
  const w = Math.max(0, Math.min(1, wSleeve)), m = 1 - w;
  const varP = m * m * sdMain ** 2 + w * w * sdSleeve ** 2 + 2 * m * w * corr * sdMain * sdSleeve;
  const sdP = Math.sqrt(varP);
  const reduction = sdMain - sdP;

  return {
    sdBefore: +sdMain.toFixed(2),
    sdAfter: +sdP.toFixed(2),
    reductionPP: +reduction.toFixed(2),
    reductionPct: +((reduction / sdMain) * 100).toFixed(1),
    verdict: reduction < 0.5
      ? "แทบไม่มีผล — ถ้าเป้าคือลดผันผวน ต้องเพิ่มขนาดหรือเปลี่ยนไปใช้สินทรัพย์ที่ correlation ต่ำกว่านี้"
      : reduction < 1.5
      ? "ลดได้เล็กน้อย"
      : "ลดได้อย่างมีนัย",
  };
}

/**
 * วิธี C — ดูความเสี่ยงกระจุกตัวรายประเทศ (thai-income-sleeve.md §3)
 * หัวใจ: ธุรกิจ + อสังหาฯ ในไทย เป็นความเสี่ยง "เศรษฐกิจไทย" ก้อนเดียวกับหุ้นไทย
 *
 * @param {Object} nw  สัดส่วนความมั่งคั่งรวม เช่น {business:30, realEstate:30, globalEquity:25, incomeEtf:10, cash:5}
 * @param {number} addThaiEquityPct  สัดส่วนหุ้นไทยที่จะเพิ่ม (% ของความมั่งคั่งรวม)
 */
function thailandConcentration(nw, addThaiEquityPct = 0) {
  const thaiNow = (nw.business || 0) + (nw.realEstate || 0);
  const thaiAfter = thaiNow + addThaiEquityPct;
  return {
    beforePct: +thaiNow.toFixed(1),
    afterPct: +thaiAfter.toFixed(1),
    deltaPP: +addThaiEquityPct.toFixed(1),
    note: thaiAfter > 70
      ? "⚠️ ความเสี่ยงเศรษฐกิจไทยเกิน 70% ของความมั่งคั่งรวม"
      : "ประโยชน์จากการกระจายความเสี่ยงน้อยกว่าที่ตัวเลข % บอก — " +
        "ธุรกิจ อสังหาฯ และหุ้นไทย ขับเคลื่อนด้วยปัจจัยเดียวกัน",
  };
}

/* ---------------------------------------------------------------------------
 * 4. หมวดสินทรัพย์ Income ในตลาดไทย — จัดกลุ่มตามหน้าที่ ไม่ใช่รายชื่อ
 * ------------------------------------------------------------------------- */

const THAI_INCOME_CATEGORIES = [
  {
    id: "high-div-equity",
    label: "หุ้นปันผลสูง",
    role: "กระแสเงินสด + เป็นเจ้าของธุรกิจ (ใช้สอนลูกได้ดีที่สุด)",
    volatility: "สูง — ยังเป็นหุ้น ลง 30-40% ตอนตลาดพังได้",
    mainRisk: "Yield trap · ถูกตัดปันผลตอนธุรกิจแย่",
    goodFor: "Bucket B (สอนลูก) มากกว่า Bucket C (ถ่วงให้นิ่ง)",
  },
  {
    id: "reit-property",
    label: "REIT / กองทุนอสังหาฯ",
    role: "กระแสเงินสดจากค่าเช่า",
    volatility: "ปานกลาง-สูง · สภาพคล่องต่ำกว่าหุ้นทั่วไป",
    mainRisk: "อ่อนไหวต่อดอกเบี้ย · สัญญาเช่าหมดอายุ · ซ้ำซ้อนกับอสังหาฯ ที่ถืออยู่แล้ว",
    goodFor: "⚠️ ตรวจก่อนว่าซ้ำกับ Real Estate 30% ที่มีอยู่ใน IPS หรือไม่",
  },
  {
    id: "infra-fund",
    label: "กองทุนโครงสร้างพื้นฐาน",
    role: "กระแสเงินสดระยะยาวจากสัมปทาน",
    volatility: "ปานกลาง",
    mainRisk: "ความเสี่ยงเชิงนโยบาย/สัมปทาน · อายุโครงการจำกัด (ปันผลบางส่วนคือการคืนทุน)",
    goodFor: "Bucket C — แต่ต้องแยกให้ออกว่าปันผลส่วนไหนคือคืนทุน ไม่ใช่ผลตอบแทน",
  },
  {
    id: "bond-mmf",
    label: "ตราสารหนี้ / กองทุนตลาดเงิน",
    role: "ตัวถ่วงให้พอร์ตนิ่งของจริง",
    volatility: "ต่ำ",
    mainRisk: "ผลตอบแทนต่ำ · ความเสี่ยงเครดิตในตราสารหนี้เอกชน",
    goodFor: "✅ Bucket C ตัวจริง — ถ้าเป้าคือ 'ผันผวนน้อย' ตัวนี้ทำงานได้ ต่างจากหุ้นปันผล",
  },
];

/* ------------------------------------------------------------------------- */

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    yieldDecomposition, thaiIncomeGates, thaiIncomeSignal,
    sizeByIncomeNeed, sleeveVolImpact, thailandConcentration,
    THAI_INCOME_CATEGORIES,
  };
}
