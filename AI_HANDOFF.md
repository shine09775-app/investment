# AI Handoff — Investment Watchlists

เอกสารนี้สรุปบริบทของโฟลเดอร์ `investment` สำหรับ AI/นักพัฒนาที่จะทำงานต่อ

## เป้าหมาย

โปรเจกต์มีเว็บ Cloudflare Pages หลักชื่อ **Buffett Investment Check** สำหรับพอร์ตสหรัฐ และได้รวม **Thai Stock Watchlist** เข้าในหน้าเดียวกันแล้ว ผู้ใช้สลับตลาดด้วยปุ่ม SVG ธงสหรัฐ/ไทย โดยไม่มีฟังก์ชันส่งคำสั่งซื้อขายหรือคำแนะนำซื้อขายอัตโนมัติ

ข้อมูลราคากับตัวเลขพื้นฐานดึงผ่าน Yahoo Finance เพื่อการศึกษาเท่านั้น ข้อมูลอาจล่าช้า ขาด หรือมีการปรับปรุงย้อนหลังได้ จึงต้องแสดงค่าที่ไม่มีข้อมูลเป็น `—` / “ยังไม่มีข้อมูล” ไม่ใช่ `0`

## โครงสร้างสำคัญ

กติกาเดียวที่ต้องจำ: **แก้ใน `src/` เท่านั้น** — `deploy/` ถูกล้างและสร้างใหม่ทุกครั้งที่ `npm run build`

```text
investment/
├─ src/                      ✏️ ต้นฉบับเว็บทั้งหมด
│  ├─ index.html             เว็บหลัก: UI, tabs, ข้อมูล/logic หุ้นไทย, SVG ธง
│  ├─ _worker.js             Cloudflare Pages Worker: proxy Yahoo + Workers AI (/api/kirin)
│  ├─ ips-config.js          IPS, universe หุ้นสหรัฐ, tabs, storage config
│  ├─ portfolio-engine.js    pure calculation + UI-state migration
│  ├─ sw.js                  service worker (bump CACHE ทุกครั้งที่เปลี่ยน shell)
│  ├─ icons / manifest
│  └─ thai-stock-watchlist/  PWA หุ้นไทยแบบแยกเดี่ยว (wrangler.toml/_worker.js/README ใช้ตอน deploy เดี่ยวเท่านั้น)
├─ deploy/                   🤖 build output (ยัง commit ไว้เผื่อ Cloudflare ดึงจาก git) — ห้ามแก้ตรง
├─ docs/                     📄 เอกสารการลงทุน ไม่ใช่โค้ดเว็บ
│  ├─ my.investment.md       IPS หลักของครอบครัว
│  ├─ thai-stock-watchlist.md thesis, risks, seed data หุ้นไทย
│  └─ kids/                  IPS ลูก + สคริปต์ร่าง (ยังไม่ได้ต่อเข้าเว็บ)
├─ scripts/
│  ├─ build.js               src/ → deploy/ + ตรวจ syntax/asset/sw precache
│  └─ dev-server.mjs         รันเว็บในเครื่องโดยไม่ต้อง login Cloudflare (ไม่มี /api/kirin)
├─ tests/                    Node test suite (require จาก src/)
├─ wrangler.toml             Pages project `mega-trend-portfolio`, output = deploy/
└─ package.json
```

## UX ปัจจุบัน

### ตลาดสหรัฐ

- ปุ่ม SVG ธงสหรัฐ: `พอร์ตสหรัฐ`
- แท็บเดิม: ภาพรวมวันนี้, Mega Trend, Income
- ไม่เปลี่ยน logic, IPS, หรือรายการหุ้นสหรัฐเดิม

### ตลาดไทย

- ปุ่ม SVG ธงไทย: `หุ้นไทย`
- หุ้น 12 ตัว (`THAI_STOCKS` ใน `src/index.html`): Energy `PTT` `PTTEP` `GULF` · Banking `KBANK` `SCB` · Food `TU` · Healthcare `BDMS` · Telecom `ADVANC` · Consumer `CPALL` · Property `CPN` · Materials `SCC` · Tourism `MINT`
- ฟิลเตอร์กลุ่มธุรกิจ (`THAI_SECTORS`) + ฟิลเตอร์สถานะ (มีคะแนน / DCA / น่าสนใจ / รอราคา) เหมือนแท็บ Mega Trend
- คะแนนรายตัวและ Watchlist Opportunity Index ใช้ตรรกะเดียวกับสหรัฐ: `EN.valuationFromHistory()` (P/E งบปีเทียบมัธยฐาน 5 ปี + `VALUATION_GUARDS`) → `EN.scoreStock()` (= `cardMode` + `buffettScore` 50/30/20) → `EN.watchlistIndex()`; ตัวที่ข้อมูลไม่ผ่านด่าน (เช่น GULF ประวัติสั้น, SCC กำไรผันผวน) เป็นโหมด DCA ไม่มีคะแนน
- เพิ่มหุ้น: ใส่ object ใน `THAI_STOCKS` (sector ต้องเป็น key ใน `THAI_SECTORS`) แล้ว bump `CACHE` ใน `src/sw.js`
- การ์ดแสดงราคา, P/E, EPS, เงินปันผล 12 เดือน, P/BV, หนี้/สินทรัพย์ และส่วนลดจาก High 52 สัปดาห์ เมื่อข้อมูลมี
- แตะการ์ดเพื่อเปิด detail drawer: % เปลี่ยนแปลงรายวัน, กราฟราคา 1M/3M/6M/1Y/2Y (ใช้ `chartBlock()`/`loadChart()` ร่วมกับฝั่งสหรัฐผ่าน `cmCtx`), ตัวชี้วัดครบ, Operating income, ความเสี่ยง, ตัวเลขธุรกิจที่ควรติดตาม, และลิงก์ Yahoo Finance
- ปุ่ม `รีเฟรช` ล่างหน้าจอเรียกตลาดที่กำลังเลือก (`refreshActiveMarket()`)

## Yahoo Finance flow

Browser เรียก same-origin API ก่อน เพื่อหลีกเลี่ยง CORS:

```text
src/index.html
  ├─ /api/chart?symbol=ADVANC.BK ...
  └─ /api/fundamentals?symbol=ADVANC.BK
          ↓
src/_worker.js
          ↓
Yahoo Finance query1/query2
```

Endpoints:

| Endpoint | ใช้สำหรับ |
|---|---|
| `/api/chart` | ราคา, High 52 สัปดาห์, price history และเงินปันผลย้อนหลัง |
| `/api/eps` | EPS รายไตรมาส/รายปีของเว็บสหรัฐเดิม |
| `/api/fundamentals` | `trailingPeRatio`, EPS, market cap, Operating income, total assets, total debt, stockholders’ equity ของหุ้นไทย |

การคำนวณหุ้นไทยใน `src/index.html`:

- P/BV = market cap ÷ equity
- หนี้/สินทรัพย์ = total debt ÷ total assets
- % ปันผล = เงินปันผลย้อนหลัง 12 เดือน ÷ ราคาล่าสุด
- Operating income = ผลรวม 4 ไตรมาสล่าสุด หากไม่ครบใช้ annual ล่าสุด
- P/E เทียบอดีต = P/E ล่าสุดเทียบมัธยฐาน P/E ที่คำนวณจาก monthly price history และ annual EPS โดยหน่วงงบ 45 วัน
- ราคาต่ำกว่า High 52 สัปดาห์ = ราคาล่าสุด ÷ High 52-week − 1

อย่าตีความค่าเหล่านี้เป็นสัญญาณซื้อหรือขาย และอย่าผสมวันที่ราคากับวันที่งบโดยไม่ระบุข้อจำกัด

## State และ data safety

- `mtp.ui` เก็บ state หน้าจอของเว็บหลัก: `market` เป็น `us` หรือ `thai`; ค่าเริ่มต้นต้องเป็น `us`
- `thai-stock-live-v2` เก็บ cache ราคาหุ้นไทยใน browser (TTL 15 นาที)
- ห้ามลบ legacy localStorage keys ของเว็บหลัก (`snap1`, `snap2`, `val2:*`, `dist2:*`, `kirin:*` ฯลฯ)
- การเปลี่ยนตลาดไทยต้องไม่ทำให้ policy/portfolio state ฝั่งสหรัฐเปลี่ยน

## คำสั่งที่ควรใช้

```powershell
# รันเว็บในเครื่อง (ไม่ต้อง login Cloudflare) → http://localhost:8790
npm run dev:local

# สร้าง deploy output
npm run build

# ตรวจ test suite
npm test

# ตรวจ JavaScript ของ deploy files
npm run check
```

ทั้งหมดควรผ่านก่อน deploy

## Deploy

การ deploy ปัจจุบันไป Cloudflare Pages project `mega-trend-portfolio`, branch `main`:

```powershell
npx --yes wrangler@4.160.1 pages deploy deploy --project-name mega-trend-portfolio --branch main
```

### สถานะ deployment ล่าสุด

ณ ตอนเขียนเอกสารนี้ build และ tests ผ่านแล้ว แต่ deployment ถูกปฏิเสธด้วย Cloudflare API authentication error `10000`: token ที่ล็อกอินอยู่ไม่มีสิทธิ์เข้าถึง account เจ้าของ Pages project นี้

ก่อน deploy ต่อ ผู้ใช้ต้อง login ผ่านบัญชี Cloudflare ที่มีสิทธิ์เข้าถึง Pages project ดังกล่าว:

```powershell
npx wrangler login
```

หลัง login ให้ตรวจ account/project ก่อน แล้วจึง deploy อย่าสร้าง Pages project ใหม่โดยไม่ถามผู้ใช้

## แนวทางการแก้ไขในอนาคต

1. แก้เว็บหลักที่ `src/index.html` ไม่ใช่ `deploy/index.html`
2. ถ้าเพิ่ม Yahoo metric ให้เพิ่ม endpoint/field ที่ `src/_worker.js` และให้ UI รับค่า `null` ได้
3. รัน `npm run build` ทุกครั้งเพื่อ regenerate `deploy/`
   ถ้าแก้ไฟล์ใน shell (html/js/icons) ให้ bump `CACHE` ใน `src/sw.js` ด้วย
4. รัน `npm test` และ `npm run check`
5. หลีกเลี่ยงการแก้ IPS, reference allocation หรือ risk limits หากผู้ใช้ไม่ได้สั่งชัดเจน
6. ห้าม deploy, reset, ลบ cache หรือเปลี่ยน Cloudflare bindings โดยไม่มีขอบเขตที่ผู้ใช้อนุญาต

## Known limitations

- Yahoo Finance อาจไม่มี fundamental field ครบสำหรับหุ้นไทยบางตัว; UI ต้องแสดง `—`
- Yahoo Finance ไม่ใช่แหล่งงบทางการ ผู้ใช้ควรยืนยันกับ SET หรือ Investor Relations เมื่อใช้ตัดสินใจจริง
- Thai standalone PWA เปิดผ่าน `file://` ไม่สามารถเรียก `/api/*` ได้ ต้องเปิดผ่าน Cloudflare Pages/worker
- `npm run dev` (wrangler pages dev) ต้อง login Cloudflare เพราะ binding `AI` เป็น remote — ถ้ายังไม่ login ใช้ `npm run dev:local`

## บันทึกการตรวจ 2026-11-12

- build / 71 tests / check ผ่าน; เปิดเว็บจริงทั้งสหรัฐ, ไทย, detail drawer, มือถือ 375px, standalone PWA — ไม่มี console error
- แก้: แท็บสหรัฐ (ภาพรวม/Mega Trend/Income) ยังโผล่และกดได้ตอนอยู่ตลาดไทย เพราะ `nav.tabs{display:grid}` ชนะ attribute `hidden` → เพิ่ม `[hidden]{display:none !important}`
- แก้: `sw.js` ไม่ได้ทำ network-first ให้ `/api/fundamentals` (ตัวเลขหุ้นไทยค้าง cache) และหน้า HTML เป็น stale-while-revalidate (deploy ใหม่ต้อง reload 2 ครั้ง) → v7: `/api/*` และ navigation เป็น network-first
- ข้อสังเกตข้อมูล: ADVANC ปันผล 12M ≈10.6% และ P/BV ≈26× มาจาก Yahoo จริง (ปันผล 27.41 + 8.69 ฿, equity ลด 120B→52B) น่าจะมีปันผลพิเศษ — UI ยังไม่แยกปันผลพิเศษ

