/* ============================================================================
 * ips-config.js — Investment Policy configuration (IPS v2.1)
 *
 * แอปนี้คือ "Buffett Investment Check" — เครื่องมือตรวจสอบก่อนเติมเงินเข้าพอร์ตจริง
 * ไม่ใช่สมุดบัญชีพอร์ต และไม่ใช่แหล่งความจริงของสัดส่วนที่ถืออยู่จริง
 *
 *   แอปนี้เป็นแหล่งความจริงของ : นโยบาย, สัดส่วนอ้างอิง, watchlist, thesis,
 *                                การประเมินมูลค่า, จังหวะสะสม, เช็กลิสต์ก่อนซื้อ
 *   DIME เป็นแหล่งความจริงของ  : ยอดถือจริง, น้ำหนักจริง, ต้นทุนเฉลี่ย,
 *                                รายการซื้อขาย, กำไรขาดทุน, เงินสดจริง
 *
 * กติกาของไฟล์นี้:
 *   1. ห้ามกระจายตัวเลข % ไปไว้ในไฟล์อื่น — แก้ที่นี่ที่เดียว
 *   2. ห้ามใส่ราคาหรือข้อมูลตลาดที่เปลี่ยนทุกวัน
 *   3. ค่าที่เปลี่ยนได้ (expense ratio ฯลฯ) ต้องมี effective date เสมอ
 *
 * โหลดได้ทั้งใน browser (<script src>) และ Node (require) — ดูท้ายไฟล์
 * ========================================================================== */

const IPS_VERSION = "2.1";
const IPS_VERSION_LABEL = "IPS v2.1 (2026)";
const IPS_EFFECTIVE_DATE = "2026-08-04";

const APP = {
  name: "Buffett Investment Check",
  subtitleTh: "เครื่องมือตรวจสอบก่อนเติมเงินเข้าพอร์ตจริง",
  ledgerName: "DIME",
  ledgerNoteTh: "ยอดถือจริง น้ำหนักจริง ต้นทุนเฉลี่ย และเงินสดจริง อยู่ใน DIME — แอปนี้ไม่ได้เชื่อมต่อกับ DIME",
  ownsTh: ["นโยบายการลงทุน", "สัดส่วนอ้างอิง", "Watchlist", "Thesis ของธุรกิจ",
           "การประเมินมูลค่า", "การวิเคราะห์จังหวะ", "เช็กลิสต์ก่อนซื้อ", "คำเตือนความเสี่ยง", "คุณภาพข้อมูล"],
  ledgerOwnsTh: ["ยอดถือจริง", "น้ำหนักจริงในพอร์ต", "ต้นทุนเฉลี่ย",
                 "ประวัติรายการซื้อขาย", "กำไรขาดทุนที่รับรู้", "เงินสดคงเหลือจริง"],
};

/* ---------------------------------------------------------------------------
 * 1. LISTED INVESTMENT REFERENCE ALLOCATION — ต้องรวมได้ 100% พอดี
 *
 * นี่คือ "สัดส่วนอ้างอิงสำหรับตรวจสอบก่อนซื้อ" ไม่ใช่ข้อมูลพอร์ตจริง
 * แอปไม่รู้ยอดจริง จึงห้ามสรุปว่า underweight/overweight เอง
 * ------------------------------------------------------------------------- */

const REFERENCE_ALLOCATION = [
  { key: "core",     label: "VOO · Core Market",      labelEn: "Core Market",     pct: 55, sleeve: "core",     color: "var(--green)" },
  { key: "mega",     label: "Mega Trend หุ้นรายตัว",   labelEn: "Mega Trend",      pct: 30, sleeve: "mega",     color: "var(--blue)" },
  { key: "dividend", label: "SCHD · Dividend Growth", labelEn: "Dividend Growth", pct: 10, sleeve: "dividend", color: "var(--teal)" },
  { key: "income",   label: "JEPQ · Current Income",  labelEn: "Current Income",  pct: 5,  sleeve: "income",   color: "var(--orange)" },
];

function referenceTotalPct() {
  return REFERENCE_ALLOCATION.reduce((s, r) => s + r.pct, 0);
}
function referenceTargetPct(sleeveKey) {
  const hit = REFERENCE_ALLOCATION.find((r) => r.key === sleeveKey || r.sleeve === sleeveKey);
  return hit ? hit.pct : null;
}

/* ---------------------------------------------------------------------------
 * 2. SLEEVES
 * ------------------------------------------------------------------------- */

const SLEEVES = [
  {
    key: "core", label: "Core Market", labelTh: "ฐานพอร์ตตลาดหลัก",
    descTh: "ฐานพอร์ตสำหรับการเติบโตระยะยาว", mode: "core_market",
    color: "var(--green)", order: 1,
    purposeTh: ["กระจายลงทุนในบริษัทใหญ่ของสหรัฐทั้งตลาด", "ทบต้นระยะยาว",
                "เป็นปลายทางหลักของ DCA", "ลดการพึ่งพาการเลือกหุ้นรายตัว"],
  },
  {
    key: "mega", label: "Mega Trend", labelTh: "หุ้นธีมระยะยาว",
    descTh: "หุ้นธีมเพื่อเพิ่มโอกาสเติบโต โดยจำกัดขนาดความเสี่ยง", mode: "timing",
    color: "var(--blue)", order: 2,
    purposeTh: ["ตั้งใจให้น้ำหนักเกินตลาดในธีมระยะยาวที่เลือกไว้",
                "ยอมรับความกระจุกตัวและความเสี่ยงด้านมูลค่าที่สูงขึ้น"],
  },
  {
    key: "dividend", label: "Dividend Growth", labelTh: "ปันผลที่เติบโต",
    descTh: "คุณภาพและการเติบโตของเงินปันผล พร้อมการเติบโตของมูลค่าบางส่วน",
    mode: "dividend_growth", color: "var(--teal)", order: 3,
    purposeTh: ["คุณภาพของเงินปันผล", "การเติบโตของเงินปันผลระยะยาว",
                "การเติบโตของมูลค่าเงินต้น", "ผลตอบแทนรวม"],
  },
  {
    key: "income", label: "Current Income", labelTh: "กระแสเงินสดปัจจุบัน",
    descTh: "เงินจ่ายรายเดือนจากปันผลและกลยุทธ์ออปชัน — ผันผวนได้",
    mode: "current_income_option", color: "var(--orange)", order: 4,
    purposeTh: ["กระแสเงินสดรายเดือนที่นำออกมาใช้ได้",
                "รายได้จากเงินปันผลรวมกับการขายออปชัน",
                "จำนวนเงินจ่ายแต่ละงวดไม่คงที่",
                "ยอมแลกการตามตลาดขาขึ้นแรงไปบางส่วน"],
    warningTh: "เงินจ่ายของ JEPQ ไม่ใช่ดอกเบี้ยคงที่ จำนวนเงินอาจเปลี่ยนแปลง และ JEPQ ยังมีความเสี่ยงจากตลาดหุ้น",
  },
];
const SLEEVE_BY_KEY = SLEEVES.reduce((m, s) => { m[s.key] = s; return m; }, {});

/* ---------------------------------------------------------------------------
 * 3. MEGA TREND REFERENCE ALLOCATION — ต้องรวมได้ 100% ของ sleeve นี้
 *
 * Moonshot ไม่ใช่ธีมธุรกิจ — เป็น "ระดับความเสี่ยง" ที่อยู่ภายใน sleeve นี้
 * Income ไม่ใช่ธีมธุรกิจ — เป็นวัตถุประสงค์ของพอร์ต จึงอยู่คนละแท็บ
 * ------------------------------------------------------------------------- */

const MEGA_THEMES = [
  { key: "ai_infra",   label: "AI Infrastructure", short: "AI Infra", labelTh: "โครงสร้างพื้นฐาน AI",
    pct: 30, color: "var(--blue)" },
  { key: "energy_dc",  label: "Energy & Data Center", short: "Energy", labelTh: "พลังงานและดาต้าเซ็นเตอร์",
    pct: 30, color: "var(--green)" },
  { key: "cloud_ai",   label: "Cloud & AI Platforms", short: "Cloud", labelTh: "คลาวด์และแพลตฟอร์ม AI",
    pct: 20, color: "var(--purple)" },
  { key: "ai_app",     label: "AI Applications", short: "AI App", labelTh: "แอปพลิเคชัน AI",
    pct: 10, color: "var(--teal)" },
  { key: "health_ai",  label: "Healthcare AI & Silver Economy", short: "Health", labelTh: "สุขภาพ AI และสังคมสูงวัย",
    pct: 10, color: "var(--yellow)" },
];

function megaThemeTotalPct() {
  return MEGA_THEMES.reduce((s, t) => s + t.pct, 0);
}
/** % ของธีม เมื่อคิดเทียบพอร์ตอ้างอิงทั้งก้อน (ใช้ในรายละเอียดเท่านั้น ไม่ใช่ค่าหลัก) */
function themePctOfReference(themeKey) {
  const th = MEGA_THEMES.find((t) => t.key === themeKey);
  const mega = referenceTargetPct("mega");
  if (!th || mega == null) return null;
  return (th.pct / 100) * mega;
}

/* ---------------------------------------------------------------------------
 * 4. RISK LIMITS — เป็นคำเตือนเชิงนโยบาย ไม่ใช่คำสั่งซื้อขาย
 *    แอปไม่รู้ยอดจริง จึงใช้เทียบได้ต่อเมื่อผู้ใช้กรอกตัวเลขจาก DIME เองเท่านั้น
 * ------------------------------------------------------------------------- */

const RISK_LIMITS = {
  singleStockInitialTargetPct: 5,
  singleStockWarnPct: 5,
  singleStockHardPct: 8,
  moonshotOfMegaSleeveMaxPct: 10,   // ภายใน sleeve Mega Trend
  moonshotOfReferenceMaxPct: 3,     // เทียบพอร์ตอ้างอิงทั้งก้อน
  moonshotSinglePositionMaxPct: 1,  // ต่อ 1 บริษัท
  leverageAllowed: false,
};

/* ---------------------------------------------------------------------------
 * 5. VOO CORE — DCA OPPORTUNITY LEVEL
 *
 * ไม่ใช้ Buffett Score แบบบริษัทกับดัชนี เพราะไม่มีแหล่งประวัติ P/E ของดัชนี
 * ที่วิธีคิดสม่ำเสมอและตรวจสอบได้ — ใช้ drawdown ที่โปร่งใสแทน
 * ------------------------------------------------------------------------- */

const CORE_DCA_BANDS = [
  { key: "normal",      maxDrawdownPct: 10,       level: 1, labelTh: "DCA ตามแผน",
    actionTh: "ซื้อสะสมตามกำหนดปกติ", color: "var(--blue)" },
  { key: "watch",       maxDrawdownPct: 15,       level: 2, labelTh: "เริ่มน่าสนใจ",
    actionTh: "ซื้อตามแผน และพิจารณาเพิ่มไม้เล็กได้", color: "var(--teal)" },
  { key: "opportunity", maxDrawdownPct: 20,       level: 3, labelTh: "โอกาสเพิ่มน้ำหนัก",
    actionTh: "ทยอยเพิ่มน้ำหนัก ไม่เทหมดครั้งเดียว", color: "var(--yellow)" },
  { key: "high",        maxDrawdownPct: Infinity, level: 4, labelTh: "ตลาดปรับฐานแรง — ทยอยใช้เงินสด",
    actionTh: "แบ่งเป็นหลายไม้ ทยอยเข้าตามแผน", color: "var(--green)" },
];

const CORE_STATEMENT_TH =
  "VOO เป็น Core Holding จึงสะสมตามแผนเป็นหลัก ไม่จำเป็นต้องรอจังหวะที่สมบูรณ์แบบ";

/* ---------------------------------------------------------------------------
 * 6. CASH TIMING — ตัวชี้ "จังหวะใช้เงินสด" จากสภาพตลาดที่สังเกตได้
 *    ไม่ใช่สัดส่วนเงินสดจริง เพราะแอปไม่รู้ยอดเงินสดของผู้ใช้
 * ------------------------------------------------------------------------- */

const CASH_TIMING = [
  { key: "normal",      level: 1, labelTh: "ยังไม่ต้องใช้เงินสดเพิ่ม — DCA ตามแผน",
    detailTh: "ตลาดยังไม่ได้ให้ส่วนลดที่ชัดเจน ใช้แผน DCA ปกติก็พอ", color: "var(--blue)" },
  { key: "watch",       level: 2, labelTh: "เริ่มใช้เงินสดได้เล็กน้อย",
    detailTh: "เพิ่มไม้เล็กได้ แต่ยังไม่ใช่จังหวะที่ต้องเร่ง", color: "var(--teal)" },
  { key: "opportunity", level: 3, labelTh: "ทยอยใช้เงินสดเป็นไม้",
    detailTh: "แบ่งเงินเป็นหลายไม้ เว้นระยะ อย่าใช้ทีเดียวหมด", color: "var(--yellow)" },
  { key: "high",        level: 4, labelTh: "ตลาดปรับฐานแรง — ใช้เงินสดตามแผนเป็นขั้น",
    detailTh: "ยังต้องแบ่งไม้ตามแผน เพราะการปรับฐานอาจยาวกว่าที่คาด", color: "var(--green)" },
];

const CASH_RULE_TH = "เงินสดโอกาสต้องไม่ถูกใช้หมดในครั้งเดียว";
const CASH_CHECK_TH = "ตรวจเงินสำรองและภาระธุรกิจใน DIME หรือบัญชีจริงก่อนใช้เงินสด";

/* ---------------------------------------------------------------------------
 * 7. INDIVIDUAL-STOCK BUFFETT SCORE — น้ำหนักเดิม 50/30/20 (ไม่เปลี่ยน)
 *
 * คะแนนนี้ช่วยจับ "จังหวะซื้อ" เท่านั้น
 * ไม่ใช่ตัววัดคุณภาพบริษัท ไม่ใช่สัญญาณขาย และไม่ใช่การพยากรณ์ผลตอบแทน
 * ------------------------------------------------------------------------- */

const BUFFETT_WEIGHTS = { valuation: 50, drawdown: 30, rsi: 20 };

const VALUATION_GUARDS = {
  maxEpsSpread: 3,        // EPS สูงสุด/ต่ำสุดเกินเท่านี้ = มัธยฐาน P/E ใช้เทียบไม่ได้
  minPePoints: 24,        // ต้องมีจุด P/E รายเดือน ≥ 24 (2 ปี)
  minAnnualPeriods: 2,    // ต้องมีงบปี ≥ 2 ปี
};

const SCORE_DISCLAIMER_TH = [
  "คะแนนนี้ช่วยดูจังหวะราคา ไม่ใช่ตัววัดคุณภาพธุรกิจ",
  "ไม่ใช่สัญญาณขาย และไม่ใช่การพยากรณ์ผลตอบแทน",
];

const WATCHLIST_INDEX = {
  label: "Watchlist Opportunity Index",
  labelTh: "ดัชนีโอกาสของ Watchlist",
  noteTh: "ค่าเฉลี่ยจังหวะของหุ้นใน Watchlist ที่ประเมินได้ ไม่ใช่ดัชนีความกลัวของตลาดทั้งหมด",
};

/* ---------------------------------------------------------------------------
 * 8. ETF METADATA
 *    ห้ามใส่ yield ปัจจุบันตรงนี้ — yield ต้องมาจากข้อมูลที่มีวันที่กำกับ
 * ------------------------------------------------------------------------- */

const ETF_METADATA = {
  VOO: {
    ticker: "VOO", name: "Vanguard S&P 500 ETF",
    category: "Core Market", categoryTh: "ฐานพอร์ตตลาดหลัก",
    strategy: "Passive broad-market index exposure",
    strategyTh: "ลงทุนตามดัชนี S&P 500 แบบ passive",
    distributionFrequency: "Quarterly", distributionFrequencyTh: "รายไตรมาส",
    expenseRatioPct: 0.03, issuer: "Vanguard",
    officialSource: "https://investor.vanguard.com/investment-products/etfs/profile/voo",
    domicile: "US", effectiveDate: "2026-08-04", verified: false,
  },
  SCHD: {
    ticker: "SCHD", name: "Schwab U.S. Dividend Equity ETF",
    category: "Dividend Growth", categoryTh: "ปันผลที่เติบโต",
    strategy: "Passive dividend-quality index",
    strategyTh: "ลงทุนตามดัชนีคุณภาพเงินปันผลแบบ passive",
    distributionFrequency: "Quarterly", distributionFrequencyTh: "รายไตรมาส",
    expenseRatioPct: 0.06, issuer: "Schwab Asset Management",
    officialSource: "https://www.schwabassetmanagement.com/products/schd",
    domicile: "US", effectiveDate: "2026-08-04", verified: false,
  },
  JEPQ: {
    ticker: "JEPQ", name: "JPMorgan Nasdaq Equity Premium Income ETF",
    category: "Current Income", categoryTh: "กระแสเงินสดปัจจุบัน",
    strategy: "Active equity portfolio plus options overlay",
    strategyTh: "บริหารเชิงรุก ถือหุ้นและขายออปชันเพื่อสร้างกระแสเงินสด",
    distributionFrequency: "Monthly", distributionFrequencyTh: "รายเดือน",
    expenseRatioPct: 0.35, issuer: "J.P. Morgan Asset Management",
    officialSource: "https://am.jpmorgan.com/us/en/asset-management/adv/products/jpmorgan-nasdaq-equity-premium-income-etf-etf-shares-46641q332",
    domicile: "US", effectiveDate: "2026-08-04", verified: false,
  },
};

const JEPQ_EDUCATION_TH = [
  "รายได้มาจากเงินปันผลของหุ้นที่ถือ รวมกับค่าพรีเมียมจากการขายออปชัน",
  "เงินจ่ายรายเดือนไม่เท่ากันทุกงวด และไม่รับประกัน",
  "Yield ที่สูงไม่ได้แปลว่าผลตอบแทนรวมจะสูงตาม",
  "กลยุทธ์ออปชันทำให้ตามตลาด Nasdaq ขาขึ้นแรงได้ไม่เต็มที่",
  "กระจุกตัวในหุ้นกลุ่ม Nasdaq — ทับกับหุ้นเทคโนโลยีที่ถืออยู่แล้ว",
  "ยังเป็นสินทรัพย์ที่มีความเสี่ยงแบบหุ้น ไม่ใช่ตราสารหนี้ และไม่ใช่เงินสดสำรอง",
];

/* ---------------------------------------------------------------------------
 * 9. SECURITY UNIVERSE
 *
 *   theme          = ธีมหลัก (ใช้อ้างอิงสัดส่วน)
 *   themesExtra    = ธีมรอง (ใช้เป็นแท็กอธิบายเท่านั้น ไม่คิดสัดส่วน)
 *   quality        = 1 ดีที่สุด .. 3 (ใช้ถ่วงการจัดอันดับ "โอกาสที่ควรศึกษาเพิ่ม")
 *   thesisTh/moatTh/riskTh = เนื้อหาสำหรับหน้าอ่านรายละเอียด
 * ------------------------------------------------------------------------- */

const SECURITIES = {
  VOO: {
    t: "VOO", n: "Vanguard S&P 500", sleeve: "core", status: "CORE", isEtf: true, domicile: "US",
    sector: "Broad Market", quality: 1,
    thesisTh: "เป็นเจ้าของบริษัทใหญ่ของสหรัฐทั้งตลาดในกองเดียว ค่าธรรมเนียมต่ำ ไม่ต้องเลือกหุ้นถูกตัว",
    moatTh: "ตัวดัชนีคัดบริษัทที่อ่อนแอออกเองตามเวลา — ไม่ต้องพึ่งการตัดสินใจของเรา",
    riskTh: "กระจุกในตลาดสหรัฐและในบริษัทใหญ่ไม่กี่ตัวมากขึ้นเรื่อย ๆ · ผันผวนตามตลาดเต็มที่",
  },

  NVDA: { t:"NVDA", n:"NVIDIA", sleeve:"mega", theme:"ai_infra", status:"OWN", domicile:"US", sector:"Technology", quality:1,
    thesisTh:"ชิปและซอฟต์แวร์สำหรับงาน AI — เป็นด่านที่งานประมวลผล AI ส่วนใหญ่ต้องผ่าน",
    moatTh:"ระบบซอฟต์แวร์รอบตัวชิปทำให้ย้ายไปใช้ของคู่แข่งได้ยาก",
    riskTh:"รายได้พึ่งลูกค้ารายใหญ่ไม่กี่ราย · ลูกค้ากำลังพัฒนาชิปของตัวเอง · มูลค่าสะท้อนการเติบโตสูงไว้แล้ว" },
  AVGO: { t:"AVGO", n:"Broadcom", sleeve:"mega", theme:"ai_infra", status:"BUY1", domicile:"US", sector:"Technology", quality:1,
    thesisTh:"ชิปเครือข่ายในศูนย์ข้อมูล และชิปเฉพาะทางที่ออกแบบร่วมกับลูกค้ารายใหญ่ + ธุรกิจซอฟต์แวร์องค์กร",
    moatTh:"ถูกออกแบบฝังอยู่ในระบบของลูกค้า เปลี่ยนยากและมีสัญญายาว",
    riskTh:"พึ่งลูกค้าไม่กี่ราย · ภาระหนี้จากการซื้อกิจการ · วัฏจักรการลงทุนศูนย์ข้อมูล" },
  ASML: { t:"ASML", n:"ASML", sleeve:"mega", theme:"ai_infra", status:"BUY2", domicile:"NL", sector:"Technology", quality:1,
    thesisTh:"ผู้ผลิตเครื่องพิมพ์ลายวงจรขั้นสูงสุดเพียงรายเดียวของโลก ชิปล้ำสมัยทุกตัวต้องใช้",
    moatTh:"ผูกขาดเทคโนโลยีจริงในระดับที่คู่แข่งตามไม่ทันในเวลาอันสั้น",
    riskTh:"ยอดขายเป็นวัฏจักรและรับรู้เป็นก้อนใหญ่ · ข้อจำกัดการส่งออกไปจีน · จดทะเบียนนอกสหรัฐ" },

  ETN:  { t:"ETN",  n:"Eaton", sleeve:"mega", theme:"energy_dc", status:"WATCH", domicile:"IE", sector:"Industrials", quality:1,
    thesisTh:"อุปกรณ์จัดการไฟฟ้าสำหรับศูนย์ข้อมูลและโครงข่าย — AI ใช้ไฟมากขึ้นทุกปี",
    moatTh:"งานติดตั้งต้องผ่านการรับรอง เปลี่ยนผู้ขายกลางคันได้ยาก",
    riskTh:"ผูกกับวัฏจักรการก่อสร้าง · คำสั่งซื้ออาจชะลอถ้าการลงทุนศูนย์ข้อมูลชะลอ" },
  VRT:  { t:"VRT",  n:"Vertiv", sleeve:"mega", theme:"energy_dc", status:"WATCH", domicile:"US", sector:"Industrials", quality:2,
    thesisTh:"ระบบระบายความร้อนและจ่ายไฟในศูนย์ข้อมูล — ชิปยิ่งร้อน ยิ่งต้องใช้ระบบที่ซับซ้อนขึ้น",
    moatTh:"ความสัมพันธ์กับผู้สร้างศูนย์ข้อมูลรายใหญ่ และงานบริการหลังติดตั้ง",
    riskTh:"แข่งขันสูง · อัตรากำไรอ่อนไหวต่อต้นทุน · ราคาหุ้นผันผวนแรงตามข่าวการลงทุน AI" },
  CEG:  { t:"CEG",  n:"Constellation Energy", sleeve:"mega", theme:"energy_dc", status:"WATCH", domicile:"US", sector:"Utilities", quality:2,
    thesisTh:"ผู้ผลิตไฟฟ้าคาร์บอนต่ำรายใหญ่ ขายไฟตรงให้ศูนย์ข้อมูลด้วยสัญญายาว",
    moatTh:"โรงไฟฟ้าที่มีอยู่แล้วสร้างใหม่ยากมาก ทั้งด้านทุนและใบอนุญาต",
    riskTh:"รายได้อิงราคาไฟที่ผันผวน · ถูกกำกับดูแลเข้ม · ความเสี่ยงด้านการเดินเครื่อง" },
  GEV:  { t:"GEV",  n:"GE Vernova", sleeve:"mega", theme:"energy_dc", status:"WATCH", domicile:"US", sector:"Industrials", quality:2,
    thesisTh:"อุปกรณ์ผลิตไฟและอุปกรณ์โครงข่าย — โลกต้องเปลี่ยนสายส่งครั้งใหญ่เพื่อรองรับไฟฟ้าที่ใช้มากขึ้น",
    moatTh:"ฐานอุปกรณ์ที่ติดตั้งไปแล้วทั่วโลก ทำให้มีงานบริการต่อเนื่อง",
    riskTh:"เพิ่งแยกบริษัทออกมา ประวัติงบสั้น · งานโครงการขนาดใหญ่มีความเสี่ยงต้นทุนบานปลาย" },

  MSFT: { t:"MSFT", n:"Microsoft", sleeve:"mega", theme:"cloud_ai", status:"OWN", domicile:"US", sector:"Technology", quality:1,
    thesisTh:"คลาวด์ระดับองค์กรและซอฟต์แวร์ที่องค์กรทั่วโลกใช้ทำงานทุกวัน กำลังขายบริการ AI เพิ่มบนฐานเดิม",
    moatTh:"ต้นทุนการย้ายระบบขององค์กรสูงมาก และมีสัญญาระยะยาว",
    riskTh:"ต้องลงทุนศูนย์ข้อมูลหนักมากล่วงหน้า · การกำกับดูแลด้านการแข่งขัน · มูลค่าไม่ถูก" },
  AMZN: { t:"AMZN", n:"Amazon", sleeve:"mega", theme:"cloud_ai", status:"BUY3", domicile:"US", sector:"Technology", quality:1,
    thesisTh:"AWS เป็นผู้ให้บริการคลาวด์รายใหญ่ที่สุด บวกกับธุรกิจค้าปลีกและโฆษณาที่ทำกำไรมากขึ้น",
    moatTh:"ขนาดของระบบคลาวด์และเครือข่ายคลังสินค้าที่คู่แข่งสร้างตามได้ยาก",
    riskTh:"กำไรค้าปลีกบาง · ลงทุนหนักต่อเนื่อง · การแข่งขันในคลาวด์รุนแรงขึ้น" },
  GOOG: { t:"GOOG", n:"Alphabet", sleeve:"mega", theme:"cloud_ai", status:"BUY4", domicile:"US", sector:"Technology", quality:1,
    thesisTh:"ธุรกิจค้นหาและโฆษณาที่สร้างเงินสดมหาศาล + คลาวด์ที่โตเร็ว + งานวิจัย AI ของตัวเอง",
    moatTh:"ข้อมูลการใช้งานมหาศาลและพฤติกรรมผู้ใช้ที่เคยชิน",
    riskTh:"คดีด้านการแข่งขัน · AI แบบสนทนาอาจเปลี่ยนวิธีที่คนค้นหา · พึ่งรายได้โฆษณาสูง" },

  META: { t:"META", n:"Meta", sleeve:"mega", theme:"ai_app", themesExtra:["cloud_ai"], status:"OWN", domicile:"US", sector:"Technology", quality:1,
    thesisTh:"นำ AI มาใช้กับผู้ใช้หลายพันล้านคนโดยตรง เพื่อเพิ่มการมีส่วนร่วมและประสิทธิภาพโฆษณา",
    moatTh:"ผลจากเครือข่ายผู้ใช้ขนาดใหญ่ ทำให้คู่แข่งเริ่มใหม่ได้ยาก",
    riskTh:"พึ่งรายได้โฆษณาเกือบทั้งหมด · ใช้เงินลงทุนกับโครงการระยะยาวสูง · ความเสี่ยงด้านกฎระเบียบ" },

  LLY:  { t:"LLY",  n:"Eli Lilly", sleeve:"mega", theme:"health_ai", status:"WATCH", domicile:"US", sector:"Healthcare", quality:1,
    thesisTh:"ยากลุ่มเบาหวานและลดน้ำหนักที่ความต้องการสูงมาก บวกกับการนำ AI มาช่วยค้นหายาใหม่",
    moatTh:"สิทธิบัตร กำลังการผลิตที่ขยายยาก และความเชื่อมั่นของแพทย์",
    riskTh:"พึ่งยาไม่กี่ตัว · สิทธิบัตรมีวันหมดอายุ · แรงกดดันเรื่องราคายา · มูลค่าสูงเทียบอดีต" },

  RKLB: { t:"RKLB", n:"Rocket Lab", sleeve:"mega", theme:"ai_infra", status:"MOON", risk:"moonshot", domicile:"US", sector:"Industrials", quality:3,
    thesisTh:"บริการส่งดาวเทียมและผลิตชิ้นส่วนอวกาศ — เดิมพันว่าเศรษฐกิจอวกาศจะโตจริง",
    moatTh:"ยังพิสูจน์ไม่ได้ชัดเจน", riskTh:"ยังไม่ทำกำไรสม่ำเสมอ · ใช้เงินลงทุนสูง · ผันผวนรุนแรง" },
  RXRX: { t:"RXRX", n:"Recursion", sleeve:"mega", theme:"health_ai", status:"MOON", risk:"moonshot", domicile:"US", sector:"Healthcare", quality:3,
    thesisTh:"ใช้ AI ค้นหายาใหม่ — เดิมพันว่าวิธีนี้จะย่นเวลาและลดต้นทุนได้จริง",
    moatTh:"ยังพิสูจน์ไม่ได้ชัดเจน", riskTh:"ยังไม่มีรายได้จากยาที่ขายจริง · ผลการทดลองอาจล้มเหลวทั้งหมด" },
  QBTS: { t:"QBTS", n:"D-Wave Quantum", sleeve:"mega", theme:"ai_infra", status:"MOON", risk:"moonshot", domicile:"US", sector:"Technology", quality:3,
    thesisTh:"คอมพิวเตอร์ควอนตัมเชิงพาณิชย์ — เดิมพันเทคโนโลยีที่ยังอยู่ระยะเริ่มต้นมาก",
    moatTh:"ยังพิสูจน์ไม่ได้ชัดเจน", riskTh:"รายได้น้อยมาก · ต้องระดมทุนเรื่อย ๆ · อาจไม่มีตลาดจริงในเวลาที่คาด" },
  RGTI: { t:"RGTI", n:"Rigetti Computing", sleeve:"mega", theme:"ai_infra", status:"MOON", risk:"moonshot", domicile:"US", sector:"Technology", quality:3,
    thesisTh:"ผู้พัฒนาชิปควอนตัม — เดิมพันระยะยาวมากกับเทคโนโลยีที่ยังไม่พร้อมใช้งานจริง",
    moatTh:"ยังพิสูจน์ไม่ได้ชัดเจน", riskTh:"ขาดทุนต่อเนื่อง · เสี่ยงเพิ่มทุนทำให้สัดส่วนผู้ถือหุ้นเดิมลด" },
  BBAI: { t:"BBAI", n:"BigBear.ai", sleeve:"mega", theme:"ai_app", status:"MOON", risk:"moonshot", domicile:"US", sector:"Technology", quality:3,
    thesisTh:"วิเคราะห์ข้อมูลด้วย AI ให้หน่วยงานรัฐและกลาโหม",
    moatTh:"ยังพิสูจน์ไม่ได้ชัดเจน", riskTh:"พึ่งสัญญาภาครัฐไม่กี่สัญญา · ขนาดเล็ก · ผันผวนสูงมาก" },

  SCHD: { t:"SCHD", n:"Schwab US Dividend Equity", sleeve:"dividend", status:"INC_DIV", isEtf:true, domicile:"US", sector:"Dividend Equity", quality:1,
    thesisTh:"กองหุ้นที่คัดบริษัทซึ่งจ่ายปันผลสม่ำเสมอและมีงบแข็งแรง เน้นปันผลที่โตได้ในระยะยาว",
    moatTh:"วิธีคัดหุ้นตามดัชนีมีวินัย ไม่ขึ้นกับดุลพินิจผู้จัดการ",
    riskTh:"น้ำหนักน้อยในกลุ่มเทคโนโลยี จึงอาจตามตลาดไม่ทันในรอบที่เทคโนโลยีนำ" },
  JEPQ: { t:"JEPQ", n:"JPMorgan Nasdaq Equity Premium Income", sleeve:"income", status:"INC_OPT", isEtf:true, domicile:"US", sector:"Equity Income", quality:2,
    thesisTh:"ถือหุ้นกลุ่ม Nasdaq แล้วขายออปชันเพื่อสร้างกระแสเงินสดรายเดือน",
    moatTh:"ไม่ใช่ประเด็นเรื่อง moat — เป็นเรื่องการออกแบบกลยุทธ์",
    riskTh:"เงินจ่ายไม่คงที่ · ตามตลาดขาขึ้นแรงไม่ทัน · ยังรับความเสี่ยงขาลงแบบหุ้นเต็ม" },
};

function universe() {
  const order = { core: 1, mega: 2, dividend: 3, income: 4 };
  return Object.values(SECURITIES).sort((a, b) => (order[a.sleeve] || 9) - (order[b.sleeve] || 9));
}
function isMoonshot(sec) { return !!(sec && sec.risk === "moonshot"); }

/**
 * หลักทรัพย์ใน "ธีมธุรกิจ" หนึ่ง ๆ
 * Moonshot ถูกตัดออกโดยค่าเริ่มต้น เพราะเป็นระดับความเสี่ยง ไม่ใช่ธีมธุรกิจ
 * (ยังเก็บ theme ไว้บนตัว moonshot เพื่อบอกว่าเป็นเดิมพันในพื้นที่ไหน แต่ไม่นับรวมในธีม)
 */
function tickersInTheme(themeKey, opts) {
  const includeMoonshot = !!(opts && opts.includeMoonshot);
  return universe()
    .filter((s) => s.sleeve === "mega" && s.theme === themeKey && (includeMoonshot || !isMoonshot(s)))
    .map((s) => s.t);
}

const STATUS_LABEL = {
  CORE:    { l: "Core · DCA หลัก", c: "var(--green)" },
  OWN:     { l: "ถืออยู่ ✅",       c: "var(--green)" },
  BUY1:    { l: "Next Buy #1",     c: "var(--blue)" },
  BUY2:    { l: "Next Buy #2",     c: "var(--blue)" },
  BUY3:    { l: "Next Buy #3",     c: "var(--blue)" },
  BUY4:    { l: "Next Buy #4",     c: "var(--blue)" },
  WATCH:   { l: "Watchlist",       c: "var(--sub)" },
  INC_DIV: { l: "Dividend Growth", c: "var(--teal)" },
  INC_OPT: { l: "Current Income",  c: "var(--orange)" },
  MOON:    { l: "Moonshot",        c: "var(--red)" },
};

/* ---------------------------------------------------------------------------
 * 10. FILTERS สำหรับแท็บ Mega Trend
 *     Income และ Moonshot ไม่ใช่ธีมธุรกิจ จึงไม่อยู่ในแถวธีม
 * ------------------------------------------------------------------------- */

const MEGA_STATUS_FILTERS = [
  { key: "all",     labelTh: "ทั้งหมด" },
  { key: "scored",  labelTh: "มีคะแนน" },
  { key: "dca",     labelTh: "DCA" },
  { key: "good",    labelTh: "น่าสนใจ" },
  { key: "wait",    labelTh: "รอราคา" },
  { key: "moon",    labelTh: "Moonshot" },
];

/** เกณฑ์แปลคะแนนเป็นกลุ่มสถานะ (ใช้ทั้งฟิลเตอร์และป้ายสถานะ) */
const SCORE_BANDS = { good: 55, wait: 40 };

/* ---------------------------------------------------------------------------
 * 11. PRE-BUY CHECKLIST
 * ------------------------------------------------------------------------- */

const PREBUY_CHECKLIST = {
  titleTh: "ตรวจ 6 ข้อก่อนซื้อ",
  items: [
    { id: "understand", th: "ฉันเข้าใจว่าบริษัททำเงินอย่างไรหรือไม่?" },
    { id: "thesis",     th: "Thesis ระยะยาวยังเหมือนเดิมหรือไม่?" },
    { id: "moat",       th: "บริษัทมีความได้เปรียบที่รักษาไว้ได้หรือไม่?" },
    { id: "financials", th: "งบการเงินและกระแสเงินสดรองรับการเติบโตหรือไม่?" },
    { id: "valuation",  th: "ราคาปัจจุบันสมเหตุผลเมื่อเทียบกับคุณภาพหรือไม่?" },
    { id: "dime",       th: "เมื่อเปิด DIME แล้ว หุ้นหรือธีมนี้มีสัดส่วนมากเกินไปหรือไม่?" },
  ],
  finalActionTh: "เปิด DIME เพื่อตรวจสัดส่วนจริงก่อนซื้อ",
  noteTh: "แอปนี้ไม่ได้เชื่อมต่อกับ DIME — ต้องเปิดตรวจเอง",
};

/* ---------------------------------------------------------------------------
 * 12. BUFFETT-INSPIRED PRINCIPLES
 *     แรงบันดาลใจจากแนวคิดการลงทุนแบบเน้นคุณค่า — ไม่ใช่คำพูดของ Warren Buffett
 *     และไม่ได้แปลว่าเขารับรองแอป กองทุน หุ้น หรือคะแนนใด ๆ
 * ------------------------------------------------------------------------- */

const PRINCIPLES_TH = [
  "มองหุ้นเป็นการเป็นเจ้าของธุรกิจ ไม่ใช่ตัวเลขที่วิ่งขึ้นลง",
  "เลือกธุรกิจที่เราเข้าใจได้จริง",
  "สนใจความสามารถในการทำกำไรระยะยาว",
  "ดูคุณภาพธุรกิจและความได้เปรียบที่รักษาไว้ได้",
  "ให้ความสำคัญกับมูลค่าที่จ่าย",
  "หลีกเลี่ยงการซื้อขายบ่อยโดยไม่จำเป็น",
  "รักษาต้นทุนให้ต่ำ",
  "ใช้กองทุนดัชนีต้นทุนต่ำเป็นฐานของพอร์ต",
  "สะสมอย่างต่อเนื่องตามเวลา",
  "ไม่ขายเพียงเพราะข่าวร้ายระยะสั้น",
  "อยู่ในขอบเขตความรู้ของตัวเอง",
];

const PRINCIPLES_DISCLAIMER_TH =
  "หลักการเหล่านี้ได้แรงบันดาลใจจากแนวคิดการลงทุนแบบเน้นคุณค่า ไม่ใช่คำพูดของ Warren Buffett และไม่ได้หมายความว่าเขารับรองแอป กองทุน หุ้น หรือคะแนนใด ๆ ในแอปนี้";

const PERSONAL_MOTTO = {
  labelTh: "Personal Investment Motto",
  textEn: "We don't invest in stock prices. We invest in the future of humanity.",
  noteTh: "คติส่วนตัวของผู้ใช้ ไม่ใช่คำพูดของ Warren Buffett",
};

/* ---------------------------------------------------------------------------
 * 13. NAVIGATION
 * ------------------------------------------------------------------------- */

const TABS = [
  { key: "today",  labelTh: "ภาพรวมวันนี้" },
  { key: "mega",   labelTh: "Mega Trend" },
  { key: "income", labelTh: "Income" },
];

/** จำนวนสูงสุดของ "โอกาสที่ควรศึกษาเพิ่ม" บนหน้าภาพรวม */
const MAX_TOP_OPPORTUNITIES = 3;

/* ---------------------------------------------------------------------------
 * 14. STORAGE SCHEMA
 *
 * v3 เลิกพึ่งข้อมูลพอร์ตจริง — ข้อมูลเดิมของ v2 ถูกเก็บไว้เป็น legacy
 * ไม่ถูกลบ ไม่ถูกใช้คำนวณคำแนะนำ และไม่แสดงในหน้าจอที่ทำให้สับสน
 * ------------------------------------------------------------------------- */

const STORAGE = {
  schemaVersion: 3,
  schemaKey: "mtp.schema",
  uiKey: "mtp.ui",                 // สถานะ UI เช่น เข็มทิศถูกย่อแล้ว, แท็บล่าสุด
  quickCheckKey: "mtp.quickcheck", // เก็บก็ต่อเมื่อผู้ใช้ติ๊กยินยอมเท่านั้น
  legacyPortfolioKey: "mtp.legacy.portfolio",
  /** คีย์เดิมที่ต้องรักษาไว้เสมอ (ราคา คะแนน เงินปันผล บทวิเคราะห์ที่แคชไว้) */
  legacyKeys: ["snap1", "snap2", "mtp.portfolio"],
  legacyPrefixes: ["val2:", "inc1:", "dist2:", "kirin:", "kirinCalls:"],
};

/* ------------------------------------------------------------------------- */

const IPS_CONFIG = {
  IPS_VERSION, IPS_VERSION_LABEL, IPS_EFFECTIVE_DATE, APP,
  REFERENCE_ALLOCATION, referenceTotalPct, referenceTargetPct,
  SLEEVES, SLEEVE_BY_KEY,
  MEGA_THEMES, megaThemeTotalPct, themePctOfReference,
  RISK_LIMITS,
  CORE_DCA_BANDS, CORE_STATEMENT_TH,
  CASH_TIMING, CASH_RULE_TH, CASH_CHECK_TH,
  BUFFETT_WEIGHTS, VALUATION_GUARDS, SCORE_DISCLAIMER_TH, WATCHLIST_INDEX, SCORE_BANDS,
  ETF_METADATA, JEPQ_EDUCATION_TH,
  SECURITIES, universe, isMoonshot, tickersInTheme, STATUS_LABEL,
  MEGA_STATUS_FILTERS, PREBUY_CHECKLIST,
  PRINCIPLES_TH, PRINCIPLES_DISCLAIMER_TH, PERSONAL_MOTTO,
  TABS, MAX_TOP_OPPORTUNITIES, STORAGE,
};

if (typeof module !== "undefined" && module.exports) module.exports = IPS_CONFIG;
if (typeof window !== "undefined") window.IPS_CONFIG = IPS_CONFIG;
