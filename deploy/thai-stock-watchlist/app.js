const stocks = [
  {symbol:"ADVANC",name:"แอดวานซ์ อินโฟร์ เซอร์วิส",sector:"telecom",sectorName:"สื่อสาร",color:"#3158b8",role:"รายได้ประจำจากมือถือและเน็ตบ้าน มีบทบาทด้านปันผล",reason:"ผู้ให้บริการมือถือและเน็ตบ้านที่มีรายได้ประจำจากการให้บริการ",risk:"ต้นทุนโครงข่ายและคลื่นเพิ่มจนกดกระแสเงินสด หรือเงินสดที่สร้างได้รองรับปันผลได้น้อยลง",metrics:["รายได้ค่าบริการ","ARPU","กระแสเงินสดหลังลงทุน","หนี้สุทธิ"],priority:1},
  {symbol:"BDMS",name:"กรุงเทพดุสิตเวชการ",sector:"healthcare",sectorName:"สุขภาพ",color:"#27806b",role:"เพิ่มธุรกิจสุขภาพ มีทั้งผู้ป่วยไทยและต่างชาติ",reason:"ธุรกิจโรงพยาบาลที่ได้แรงหนุนจากการรักษาพยาบาลของผู้ป่วยไทยและต่างชาติ",risk:"รายได้โตแต่กำไรลดต่อเนื่อง หรืออัตรากำไรอ่อนลงจากต้นทุนที่ส่งผ่านไม่ได้",metrics:["รายได้ผู้ป่วยแยกกลุ่ม","อัตรากำไร","ต้นทุนบุคลากร"],priority:2},
  {symbol:"CPALL",name:"ซีพี ออลล์",sector:"retail",sectorName:"ค้าปลีก",color:"#d65337",role:"เพิ่มโอกาสจากการบริโภคในชีวิตประจำวัน",reason:"เครือข่ายร้านสะดวกซื้อที่รับการใช้จ่ายประจำวัน",risk:"ยอดขายโตจากเปิดสาขาเพิ่ม ขณะที่ยอดขายสาขาเดิมและกระแสเงินสดอ่อนลง",metrics:["ยอดขายสาขาเดิม","อัตรากำไร","หนี้และดอกเบี้ย","กระแสเงินสด"],priority:3},
  {symbol:"CPN",name:"เซ็นทรัลพัฒนา",sector:"property",sectorName:"อสังหาริมทรัพย์เชิงพาณิชย์",color:"#a56d2d",role:"รายได้ค่าเช่าศูนย์การค้า และโอกาสโตจากโครงการใหม่",reason:"ศูนย์การค้าและโครงการผสมที่มีรายได้ค่าเช่า พร้อมโอกาสจากโครงการใหม่",risk:"ค่าเช่าหรืออัตราการเช่าลดลงพร้อมกับหนี้และเงินลงทุนที่เพิ่มขึ้น",metrics:["ค่าเช่าสาขาเดิม","อัตราการเช่าพื้นที่","เงินลงทุน","หนี้และต้นทุนการเงิน"],priority:4},
  {symbol:"PTT",name:"ปตท.",sector:"energy",sectorName:"พลังงาน",color:"#c33a45",role:"ธุรกิจพลังงานแบบครบวงจร เพิ่มความหลากหลายของธุรกิจไทยในพอร์ต",reason:"โครงสร้างธุรกิจพลังงานที่หลากหลาย ทั้งก๊าซธรรมชาติ การค้าปลีก และการลงทุนในบริษัทย่อย",risk:"กำไรผันผวนตามราคาพลังงาน นโยบายภาครัฐ และรายการพิเศษของบริษัทย่อย",metrics:["กำไรจากธุรกิจก๊าซ","ค่าการตลาด","กำไรบริษัทย่อย","หนี้สุทธิ"],priority:5},
  {symbol:"PTTEP",name:"ปตท. สำรวจและผลิตปิโตรเลียม",sector:"energy",sectorName:"พลังงาน",color:"#b52c43",role:"พลังงานต้นน้ำที่มีอยู่แล้วในพอร์ต ใช้ติดตามความเสี่ยงการกระจุกตัว",reason:"ผู้ผลิตและสำรวจปิโตรเลียมที่มีกระแสเงินสดผูกกับราคาน้ำมันและก๊าซ",risk:"ราคาพลังงานอ่อนตัว ต้นทุนผลิตเพิ่ม หรือความเสี่ยงจากโครงการและประเทศที่ดำเนินงาน",metrics:["ปริมาณขาย","ต้นทุนต่อหน่วย","ราคาขายเฉลี่ย","กระแสเงินสดหลังลงทุน"],priority:6},
  {symbol:"KBANK",name:"ธนาคารกสิกรไทย",sector:"banking",sectorName:"ธนาคาร",color:"#25826c",role:"เพิ่มการติดตามธุรกิจธนาคารที่มีฐานลูกค้ารายย่อยและธุรกิจ",reason:"รายได้ดอกเบี้ยและค่าธรรมเนียมจากฐานลูกค้าหลากหลาย",risk:"คุณภาพสินทรัพย์อ่อนลง หนี้เสียเพิ่ม หรือส่วนต่างดอกเบี้ยถูกกดดัน",metrics:["NIM","NPL","Credit cost","เงินกองทุน"],priority:7},
  {symbol:"SCB",name:"เอสซีบี เอกซ์",sector:"banking",sectorName:"ธนาคาร",color:"#6c3b91",role:"เพิ่มธุรกิจธนาคารและแพลตฟอร์มการเงินในพอร์ต",reason:"กลุ่มธุรกิจการเงินที่มีธนาคารเป็นแกนและลงทุนในธุรกิจดิจิทัล",risk:"คุณภาพสินทรัพย์ ต้นทุนเครดิต และผลลัพธ์ของการลงทุนใหม่ไม่เป็นไปตามสมมติฐาน",metrics:["NIM","NPL","Credit cost","ROE"],priority:8}
];

const storageKey = "thai-stock-watchlist-v1";
const initial = {status:"watch",lastPrice:"",priceAsOf:"",entryRange:"",peTtm:"",valuationAsOf:"",normalEarnings:"",valuationMethod:"",notes:"",source:""};
let data = JSON.parse(localStorage.getItem(storageKey) || "{}");
let activeSymbol = null;
let deferredPrompt = null;
const $ = (selector) => document.querySelector(selector);
const statusText = {watch:"ติดตาม",review:"ทบทวน",hold:"ถืออยู่",archived:"เลิกติดตาม"};
const liveStorageKey = "thai-stock-yahoo-v1";
let liveData = JSON.parse(localStorage.getItem(liveStorageKey) || "{}");
let liveBusy = false;

const yahooTicker = symbol => `${symbol}.BK`;
const apiRoot = location.pathname.startsWith("/thai-stock-watchlist/") ? "/api" : "./api";
const number = value => typeof value === "number" && Number.isFinite(value) ? value : null;
const last = values => values && values.length ? values[values.length - 1] : null;
const numberText = (value, digits = 2) => number(value) === null ? "ยังไม่มีข้อมูล" : value.toLocaleString("th-TH", { maximumFractionDigits: digits });
const ratioText = value => number(value) === null ? "ยังไม่มีข้อมูล" : `${numberText(value, 2)}×`;
const pctText = value => number(value) === null ? "ยังไม่มีข้อมูล" : `${numberText(value, 1)}%`;
function moneyText(value) {
  if (number(value) === null) return "ยังไม่มีข้อมูล";
  const unit = Math.abs(value) >= 1e9 ? [1e9, "พัน ลบ."] : Math.abs(value) >= 1e6 ? [1e6, "ลบ."] : [1, "บาท"];
  return `${numberText(value / unit[0], 2)} ${unit[1]}`;
}
function cacheLive() { localStorage.setItem(liveStorageKey, JSON.stringify(liveData)); }
function fundamentalsRows(payload, type) {
  const result = payload?.timeseries?.result || [];
  const group = result.find(item => item?.meta?.type?.includes(type));
  return (group?.[type] || []).filter(item => number(item?.reportedValue?.raw) !== null)
    .map(item => ({ date: item.asOfDate, value: item.reportedValue.raw })).sort((a, b) => new Date(a.date) - new Date(b.date));
}
function chartPoints(payload) {
  const result = payload?.chart?.result?.[0] || payload || {};
  const times = result.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  return times.map((time, i) => ({ time, close: closes[i] })).filter(point => number(point.close) !== null);
}
function sumLatest(rows, take) { const slice = rows.slice(-take); return slice.length === take ? slice.reduce((total, row) => total + row.value, 0) : null; }
function median(values) { const copy = values.filter(v => number(v) !== null).sort((a, b) => a - b); return copy.length ? copy[Math.floor(copy.length / 2)] : null; }
function historicalPe(prices, annualEps) {
  const lag = 45 * 86400;
  const values = prices.map(point => {
    let eps = null;
    annualEps.forEach(row => { if (new Date(row.date).getTime() + lag * 1000 <= point.time * 1000) eps = row.value; });
    return eps > 0 ? point.close / eps : null;
  });
  return values.filter(v => v > 0 && v < 200);
}
function dividendsLastYear(payload, nowSeconds) {
  const events = payload?.chart?.result?.[0]?.events?.dividends || {};
  return Object.values(events).filter(item => number(item?.amount) !== null && item.date >= nowSeconds - 370 * 86400)
    .reduce((total, item) => total + item.amount, 0);
}
function buildLiveMetrics(chart1y, chart5y, fundamentals) {
  const daily = chartPoints(chart1y), monthly = chartPoints(chart5y);
  const current = last(daily)?.close ?? last(monthly)?.close ?? null;
  const high52 = daily.length ? Math.max(...daily.map(p => p.close)) : null;
  const annualEps = fundamentalsRows(fundamentals, "annualDilutedEPS");
  const trailingEps = last(fundamentalsRows(fundamentals, "trailingEps"))?.value ?? last(annualEps)?.value ?? null;
  const directPe = last(fundamentalsRows(fundamentals, "trailingPeRatio"))?.value ?? null;
  const pe = directPe ?? (trailingEps > 0 && current ? current / trailingEps : null);
  const pastPe = historicalPe(monthly, annualEps);
  const peMedian = median(pastPe);
  const dividends = dividendsLastYear(chart1y, Math.floor(Date.now() / 1000));
  const yieldPct = current && dividends > 0 ? dividends / current * 100 : null;
  const operatingQ = sumLatest(fundamentalsRows(fundamentals, "quarterlyOperatingIncome"), 4);
  const operating = operatingQ ?? last(fundamentalsRows(fundamentals, "annualOperatingIncome"))?.value ?? null;
  const assets = last(fundamentalsRows(fundamentals, "quarterlyTotalAssets"))?.value ?? last(fundamentalsRows(fundamentals, "annualTotalAssets"))?.value ?? null;
  const debt = last(fundamentalsRows(fundamentals, "quarterlyTotalDebt"))?.value ?? last(fundamentalsRows(fundamentals, "annualTotalDebt"))?.value ?? null;
  const equity = last(fundamentalsRows(fundamentals, "quarterlyStockholdersEquity"))?.value ?? last(fundamentalsRows(fundamentals, "annualStockholdersEquity"))?.value ?? null;
  const marketCap = last(fundamentalsRows(fundamentals, "trailingMarketCap"))?.value ?? null;
  return { current, high52, drawdown: current && high52 ? (current / high52 - 1) * 100 : null, pe, peMedian, peVsMedian: pe && peMedian ? (pe / peMedian - 1) * 100 : null, eps: trailingEps, yieldPct, operating, pbv: marketCap && equity > 0 ? marketCap / equity : null, debtAssets: debt !== null && assets > 0 ? debt / assets * 100 : null, updatedAt: last(daily)?.time ? last(daily).time * 1000 : Date.now() };
}
async function fetchJson(url) { const response = await fetch(url); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }
async function updateOne(symbol) {
  const ticker = encodeURIComponent(yahooTicker(symbol));
  const [chart1y, chart5y, fundamentals] = await Promise.all([
    fetchJson(`${apiRoot}/chart?symbol=${ticker}&range=1y&interval=1d&events=div`),
    fetchJson(`${apiRoot}/chart?symbol=${ticker}&range=5y&interval=1mo`),
    fetchJson(`${apiRoot}/fundamentals?symbol=${ticker}`),
  ]);
  return buildLiveMetrics(chart1y, chart5y, fundamentals);
}
function renderDataStatus(message, loading = false) { $("#dataStatus").textContent = message; $(".statusbar").classList.toggle("loading", loading); $("#refreshButton").disabled = loading; }
async function updateLiveData(force = false) {
  if (location.protocol === "file:") {
    renderDataStatus("เปิดผ่าน Cloudflare Pages เพื่อเชื่อม Yahoo Finance", false);
    return;
  }
  if (liveBusy) return;
  liveBusy = true; renderDataStatus("กำลังอัปเดต Yahoo Finance…", true);
  const now = Date.now();
  const toLoad = stocks.filter(stock => force || !liveData[stock.symbol] || now - liveData[stock.symbol].cachedAt > 15 * 60 * 1000);
  if (!toLoad.length) {
    liveBusy = false;
    renderDataStatus("ใช้ข้อมูล Yahoo Finance ที่เพิ่งอัปเดต", false);
    renderCards(document.querySelector(".filter.is-selected").dataset.sector);
    return;
  }
  const results = await Promise.allSettled(toLoad.map(stock => updateOne(stock.symbol)));
  let success = 0;
  results.forEach((result, index) => { if (result.status === "fulfilled") { liveData[toLoad[index].symbol] = { ...result.value, cachedAt: now }; success += 1; } });
  cacheLive(); liveBusy = false;
  renderDataStatus(success ? `Yahoo Finance อัปเดต ${success}/${toLoad.length || stocks.length} หุ้น` : "Yahoo Finance ยังเชื่อมต่อไม่ได้", false);
  renderCards(document.querySelector(".filter.is-selected").dataset.sector);
  if (activeSymbol) renderLivePanel(activeSymbol);
}

function record(symbol){ return {...initial,...(data[symbol] || {})}; }
function save(){ localStorage.setItem(storageKey,JSON.stringify(data)); }
function priceText(r, live){ const value = live?.current ?? (r.lastPrice ? Number(r.lastPrice) : null); return value === null ? "ยังไม่มีข้อมูล" : `${numberText(value)} บาท`; }
function renderCards(sector="all"){
  const relevant = stocks.filter(s=>sector === "all" || s.sector === sector);
  $("#pricedCount").textContent = stocks.filter(s=>liveData[s.symbol]?.current || record(s.symbol).lastPrice).length;
  $("#stockCards").innerHTML = relevant.map(s=>{const r=record(s.symbol), live=liveData[s.symbol], hasPrice=live?.current || r.lastPrice; return `<article class="stock-card" style="--sector-color:${s.color}"><button class="stock-button" data-symbol="${s.symbol}" type="button"><div class="stock-top"><div><strong class="ticker">${s.symbol}</strong><span class="company">${s.name}</span></div><span class="status status-${r.status}">${statusText[r.status]}</span></div><div class="stock-meta"><span class="sector-dot"></span>${s.sectorName}<span>·</span>ลำดับศึกษา ${s.priority}</div><div class="stock-price"><strong class="${hasPrice?"":"empty"}">${priceText(r, live)}</strong><small>${live?.updatedAt ? `Yahoo · ${formatDateTime(live.updatedAt)}` : r.priceAsOf ? `บันทึก · ${formatDate(r.priceAsOf)}` : "ยังไม่มีข้อมูลราคา"}</small></div><div class="portfolio-strip"><span>${live?.pe ? `P/E ${numberText(live.pe, 1)}×` : s.role}</span>${live?.drawdown !== null && live?.drawdown !== undefined ? `<span>${live.drawdown < 0 ? "ต่ำกว่า High 52w " : "เทียบ High 52w +"}${pctText(Math.abs(live.drawdown))}</span>` : ""}</div><span class="arrow">→</span></button></article>`;}).join("");
  document.querySelectorAll(".stock-button").forEach(b=>b.addEventListener("click",()=>openStock(b.dataset.symbol)));
}
function formatDate(date){return new Intl.DateTimeFormat("th-TH",{dateStyle:"medium",timeZone:"Asia/Bangkok"}).format(new Date(`${date}T12:00:00+07:00`));}
function formatDateTime(timestamp){ return new Intl.DateTimeFormat("th-TH",{dateStyle:"short",timeStyle:"short",timeZone:"Asia/Bangkok"}).format(new Date(timestamp)); }
function renderResearch(){const entries=stocks.filter(s=>{const r=record(s.symbol);return r.notes||r.peTtm||r.normalEarnings||r.valuationMethod||r.source;});$("#researchList").innerHTML=entries.length?entries.map(s=>{const r=record(s.symbol);return `<article class="research-entry"><div class="research-entry-head"><h3>${s.symbol}</h3><button class="text-button" data-symbol="${s.symbol}" type="button">แก้ไข</button></div>${r.notes?`<p>${escapeHtml(r.notes)}</p>`:""}${r.peTtm||r.normalEarnings||r.valuationMethod?`<p class="mini-label">${[r.peTtm&&`P/E TTM ${r.peTtm}`,r.normalEarnings,r.valuationMethod].filter(Boolean).join(" · ")}</p>`:""}${r.source?`<a href="${escapeAttr(r.source)}" target="_blank" rel="noreferrer">เปิดแหล่งอ้างอิง ↗</a>`:""}</article>`;}).join(""):"<p class=\"empty-state\">ยังไม่มีบันทึกวิจัย เลือกหุ้นจากรายการติดตามเพื่อเริ่มบันทึก</p>";document.querySelectorAll("#researchList .text-button").forEach(b=>b.addEventListener("click",()=>openStock(b.dataset.symbol)));}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"})[c]);}function escapeAttr(value){return escapeHtml(value).replace(/`/g,"&#096;");}
function liveMetric(label, value, caption = "") { return `<div class="live-metric"><span>${label}</span><strong>${value}</strong><small>${caption}</small></div>`; }
function renderLivePanel(symbol) {
  const live = liveData[symbol];
  if (!live) {
    $("#liveAsOf").textContent = "ยังไม่มีข้อมูล — กดอัปเดต Yahoo Finance";
    $("#liveSource").textContent = "PENDING";
    $("#livePrice").textContent = "ยังไม่มีข้อมูล";
    $("#liveMetrics").innerHTML = "<span class=\"live-loading\">ไม่ใช้เลขศูนย์แทนข้อมูลที่ไม่มี</span>";
    $("#liveAnalysis").textContent = "ข้อมูลจะถูกคำนวณเมื่อ Yahoo Finance ตอบกลับครบ";
    return;
  }
  $("#liveAsOf").textContent = `ข้อมูลราคาล่าสุด ${formatDateTime(live.updatedAt)} · งบอาจรายงานคนละวัน`;
  $("#liveSource").textContent = "YAHOO";
  $("#livePrice").textContent = live.current === null ? "ยังไม่มีข้อมูลราคา" : `${numberText(live.current)} บาท`;
  $("#liveMetrics").innerHTML = [
    liveMetric("P/E", ratioText(live.pe), "ล่าสุด / Yahoo"),
    liveMetric("EPS", numberText(live.eps), "Trailing EPS"),
    liveMetric("ปันผล", pctText(live.yieldPct), "12 เดือนย้อนหลัง"),
    liveMetric("Operating income", moneyText(live.operating), "TTM / ล่าสุด"),
    liveMetric("P/BV", ratioText(live.pbv), "Market cap ÷ equity"),
    liveMetric("หนี้ / สินทรัพย์", pctText(live.debtAssets), "ล่าสุด"),
  ].join("");
  const analysis = [];
  if (number(live.peVsMedian) !== null) analysis.push(`P/E ${live.peVsMedian >= 0 ? "สูงกว่า" : "ต่ำกว่า"}มัธยฐานอดีตของตัวเอง ${pctText(Math.abs(live.peVsMedian))}`);
  if (number(live.drawdown) !== null) analysis.push(live.drawdown < 0 ? `ราคาต่ำกว่าจุดสูง 52 สัปดาห์ ${pctText(Math.abs(live.drawdown))}` : `ราคาอยู่ใกล้จุดสูง 52 สัปดาห์`);
  if (number(live.debtAssets) !== null) analysis.push(`หนี้คิดเป็น ${pctText(live.debtAssets)} ของสินทรัพย์ล่าสุด`);
  $("#liveAnalysis").innerHTML = analysis.length ? `<ul>${analysis.map(text => `<li>${text}</li>`).join("")}</ul>` : "ข้อมูลประวัติยังไม่พอสำหรับการเปรียบเทียบ";
}
function openStock(symbol){activeSymbol=symbol;const s=stocks.find(x=>x.symbol===symbol),r=record(symbol);$("#dialogSector").textContent=s.sectorName;$("#dialogTitle").textContent=s.symbol;$("#dialogName").textContent=s.name;$("#dialogRole").textContent=s.role;$("#dialogReason").textContent=s.reason;$("#dialogRisk").textContent=s.risk;$("#dialogMetrics").innerHTML=s.metrics.map(m=>`<span>${m}</span>`).join("");for(const field of Object.keys(initial)){$(`#${field === "status" ? "statusInput" : field === "lastPrice" ? "priceInput" : field === "priceAsOf" ? "priceDateInput" : field === "entryRange" ? "rangeInput" : field === "peTtm" ? "peInput" : field === "valuationAsOf" ? "valuationDateInput" : field === "normalEarnings" ? "earningsInput" : field === "valuationMethod" ? "methodInput" : field === "notes" ? "notesInput" : "sourceInput"}`).value=r[field]||"";}renderLivePanel(symbol);$("#stockDialog").showModal();}
function closeStock(){ $("#stockDialog").close(); activeSymbol=null; }
$("#stockForm").addEventListener("submit",event=>{event.preventDefault();if(!activeSymbol)return;const form=new FormData(event.currentTarget);data[activeSymbol]=Object.fromEntries(form.entries());save();renderCards(document.querySelector(".filter.is-selected").dataset.sector);renderResearch();closeStock();});
$("#cancelButton").addEventListener("click",closeStock);$("#stockDialog").addEventListener("click",e=>{if(e.target===$("#stockDialog"))closeStock();});
document.querySelectorAll(".filter").forEach(btn=>btn.addEventListener("click",()=>{document.querySelector(".filter.is-selected").classList.remove("is-selected");btn.classList.add("is-selected");renderCards(btn.dataset.sector);}));
document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{document.querySelector(".tab.is-active").classList.remove("is-active");document.querySelector(".view.is-active").classList.remove("is-active");btn.classList.add("is-active");$(`#${btn.dataset.view}`).classList.add("is-active");if(btn.dataset.view==="research")renderResearch();}));
$("#resetButton").addEventListener("click",()=>{if(confirm("ลบข้อมูลที่บันทึกไว้ทั้งหมดและคืนค่าเป็นรายการเริ่มต้นหรือไม่?")){data={};save();renderCards();renderResearch();}});
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredPrompt=event;$("#installButton").hidden=false;});$("#installButton").addEventListener("click",async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$("#installButton").hidden=true;});
$("#refreshButton").addEventListener("click",()=>updateLiveData(true));
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js"));renderCards();renderResearch();updateLiveData();
