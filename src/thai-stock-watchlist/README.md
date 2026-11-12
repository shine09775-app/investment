# Thai Stock Watchlist

เว็บ PWA สำหรับศึกษาหุ้นไทยระยะยาว ไม่ใช่ระบบส่งคำสั่งซื้อขาย

## ข้อมูลจาก Yahoo Finance

เมื่อ deploy บน Cloudflare Pages, `_worker.js` จะเรียก Yahoo Finance ผ่าน endpoint เดียวกันของเว็บ:

- `/api/chart` — ราคาย้อนหลัง, high 52 สัปดาห์ และเงินปันผลย้อนหลัง
- `/api/fundamentals` — P/E, EPS, Operating income, สินทรัพย์, หนี้ และส่วนของผู้ถือหุ้น

หน้าเว็บคำนวณ P/BV จาก market cap ÷ equity, หนี้/สินทรัพย์จากข้อมูลล่าสุด, อัตราปันผลจากเงินปันผล 12 เดือน ÷ ราคาล่าสุด และเปรียบ P/E กับมัธยฐานที่คำนวณจากประวัติราคาและ EPS รายปีเดียวกัน

Yahoo Finance อาจมีข้อมูลล่าช้า ไม่ครบ หรือปรับปรุงย้อนหลังได้ แอปจึงแสดง “ยังไม่มีข้อมูล” แทนศูนย์ และระบุว่าเป็นข้อมูลเพื่อการศึกษา

## ทดสอบและ deploy

จากโฟลเดอร์นี้:

```powershell
npx wrangler pages dev .
npx wrangler pages deploy . --project-name thai-stock-watchlist
```

หลัง deploy ให้กด `↻ อัปเดต` ในแอป เพื่อโหลดข้อมูลล่าสุด

หาก deploy ผ่าน project หลักใน repository นี้ (`npm run deploy`) แอปจะอยู่ที่
`https://mega-trend-portfolio.pages.dev/thai-stock-watchlist/` และใช้ proxy จาก
`deploy/_worker.js` ร่วมกับแอปหลัก ห้ามเปิด `index.html` ผ่าน `file://` เมื่อต้องการโหลด Yahoo Finance เพราะไม่มี Cloudflare Worker คอย proxy ให้
