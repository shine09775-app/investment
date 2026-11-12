# Investment — Buffett Investment Check

เว็บตรวจพอร์ตสหรัฐ + Thai Stock Watchlist (Cloudflare Pages) และเอกสาร IPS ของครอบครัว

| โฟลเดอร์ | คืออะไร |
|---|---|
| `src/` | ✏️ ต้นฉบับเว็บ — **แก้ที่นี่เท่านั้น** |
| `deploy/` | 🤖 ผลลัพธ์จาก `npm run build` — ห้ามแก้ตรง |
| `docs/` | 📄 เอกสารการลงทุน (IPS, thesis หุ้นไทย, แผนของลูก) |
| `scripts/` | build และ dev server |
| `tests/` | ชุดทดสอบ logic |

```powershell
npm run dev:local   # เปิดเว็บในเครื่อง http://localhost:8790
npm test            # ทดสอบ
npm run deploy      # build + deploy (ต้อง login Cloudflare บัญชีเจ้าของ project)
```

รายละเอียดทั้งหมดสำหรับ AI/นักพัฒนา: [AI_HANDOFF.md](AI_HANDOFF.md)

> ข้อมูลจาก Yahoo Finance เพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำซื้อขาย
