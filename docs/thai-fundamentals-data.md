# วิธีกรอกข้อมูล "กำไร ปันผล และการใช้ทุน" หุ้นไทย

ไฟล์ข้อมูล: [`src/data/thai-fundamentals.json`](../src/data/thai-fundamentals.json)
แสดงผลใน: หน้ารายละเอียดหุ้นไทย (แตะการ์ดหุ้น) · ตรรกะอยู่ที่ [`src/thai-fundamentals.js`](../src/thai-fundamentals.js)

## กติกา

1. **กรอกจาก IR ของบริษัท หรือ SET เท่านั้น** — ไม่ใช้ Yahoo (Yahoo ใช้เฉพาะราคาและข้อมูลตลาด)
2. **ทุกค่าต้องมีแหล่งและงวด** — `npm run build` จะไม่ผ่านถ้าค่าใดไม่มี `sourceName`, `sourceUrl` (https), `periodEnd`, `updatedAt`
3. **ไม่มีข้อมูล = `null`** — ห้ามใส่ `0`, ห้ามคำนวณ DPS ย้อนจาก dividend yield, ห้ามใช้ตัวเลขตัวอย่าง
4. **ปันผลผูกกับปีบัญชีของผลประกอบการ** — ปันผลงวดปี 2568 ที่จ่ายเดือน พ.ค. 2569 ใส่ใน `fy: 2025`
5. **ค่าที่คำนวณเอง** ให้ `"reported": false` และใส่ `"formula"` อธิบายสูตร
6. `fy` เป็นปี **ค.ศ.** ของวันปิดงบ (แอปแปลงเป็น พ.ศ. ตอนแสดงผล)

## โครงสร้าง

```text
stocks.<TICKER>
├─ fiscalYearEnd     "12-31"            วันปิดงบ (MM-DD)
├─ statementBasis    "consolidated" | "separate"   งบรวม / งบเฉพาะกิจการ
├─ annual[]          ข้อมูลรายปี (periodType ต้องเป็น "FY")
│   ├─ fy                  2025
│   ├─ eps                 กำไรต่อหุ้นทั้งปี (THB/share)
│   ├─ bvps                มูลค่าตามบัญชีต่อหุ้น (THB/share)
│   ├─ roe                 ROE ที่บริษัทรายงาน (%) — ถ้าไม่มี แอปคำนวณจาก 2 ช่องล่าง
│   ├─ netIncomeToOwners   กำไรสุทธิส่วนของผู้ถือหุ้นบริษัทใหญ่ (THB)
│   ├─ equityToOwners      ส่วนของผู้ถือหุ้นบริษัทใหญ่ ณ สิ้นปี (THB)
│   ├─ dpsRegular          ปันผลปกติต่อหุ้นของงวดปีนั้น (THB/share)
│   ├─ dpsSpecial          ปันผลพิเศษ (THB/share) · ยืนยันว่าไม่มี = value 0 · ไม่ทราบ = null
│   ├─ payoutRatio         สัดส่วนจ่ายปันผลที่บริษัทรายงาน (%) — ถ้าไม่มี แอปคำนวณ DPS ÷ EPS
│   └─ shareBaseNote       "แตกพาร์ 1 → 0.5 บาท" / "เพิ่มทุน RO" / "ซื้อหุ้นคืน" หรือ null
└─ bank              ใช้เมื่อหุ้นอยู่กลุ่ม Banking ในแอป
    ├─ nim, creditCost, nplRatio, cet1, car   (แต่ละค่าแยกกัน — CET1 กับ CAR ห้ามใช้แทนกัน)
```

แต่ละค่า (fact):

| ช่อง | ความหมาย |
|---|---|
| `value` | ตัวเลข หรือ `null` |
| `unit` | `THB/share`, `THB`, `%` |
| `periodType` | `FY` / `quarter` / `H1` / `YTD` / `TTM` |
| `periodEnd` | วันสิ้นงวด `YYYY-MM-DD` |
| `periodLabel` | (ธนาคาร) ชื่องวดที่แสดง เช่น `"ไตรมาส 2/2569"`, `"ครึ่งปีแรก 2569"` |
| `annualized` | (ธนาคาร) `true` ถ้าเป็นค่าที่ปรับเป็นรายปี |
| `basis` | (ธนาคาร) `consolidated` / `separate` |
| `shareBasis` | (EPS/DPS) ฐานจำนวนหุ้น เช่น `"par 1"` — ถ้า EPS กับ DPS ต่างกัน แอปจะไม่คำนวณ payout |
| `sourceName`, `sourceUrl` | ชื่อเอกสารและลิงก์ เช่น One Report 2568, MD&A ไตรมาส 2/2569 |
| `updatedAt` | วันที่กรอก/ตรวจ `YYYY-MM-DD` |
| `reported` | `true` = ตัวเลขที่บริษัทรายงาน · `false` = คำนวณ (ต้องมี `formula`) |

## ตัวอย่างรูปแบบ (ตัวเลขสมมติ — ห้ามคัดลอกไปใช้)

```json
{
  "fy": 2025,
  "eps": { "value": 0.00, "unit": "THB/share", "periodType": "FY", "periodEnd": "2025-12-31",
           "sourceName": "One Report 2568", "sourceUrl": "https://…", "updatedAt": "2026-03-15", "reported": true },
  "dpsRegular": { "value": 0.00, "unit": "THB/share", "periodType": "FY", "periodEnd": "2025-12-31",
                  "sourceName": "มติคณะกรรมการ (SET)", "sourceUrl": "https://…", "updatedAt": "2026-03-15", "reported": true },
  "dpsSpecial": null,
  "shareBaseNote": null
}
```

```json
"bank": {
  "car":  { "value": 0.00, "unit": "%", "periodType": "quarter", "periodEnd": "2026-06-30",
            "periodLabel": "ไตรมาส 2/2569", "basis": "consolidated",
            "sourceName": "Pillar 3 / MD&A Q2/2569", "sourceUrl": "https://…", "updatedAt": "2026-08-20", "reported": true },
  "cet1": null
}
```

หลังกรอก: `npm run build` (ตรวจไฟล์) → `npm test` → commit & push
