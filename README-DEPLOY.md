# 🗓 Summit Calendar Tracking - คู่มือ Deploy
> อัพเดทล่าสุด: เพิ่ม Multi-User Calendar, Profile Picture, AI เลขาคุณต่าย

---

## ⚡ Quick Commands (ใช้บ่อย)

### 🟡 Update / แก้ไข Code → Deploy (ทำบ่อยที่สุด)
```bash
conda activate base
cd C:\Users\YourName\Documents\Calendar
npm run deploy
```

### 🟠 Update พร้อม Migration (เพิ่ม Feature ใหม่ที่เปลี่ยน DB)
```bash
conda activate base
cd C:\Users\YourName\Documents\Calendar
npx wrangler d1 execute summit-calendar-db --file=./migration_owner.sql
npm run deploy
```

### 🔵 Deploy ครั้งแรก (Fresh Install)
ดูขั้นตอนละเอียดด้านล่าง

---

## 📦 สิ่งที่ต้องมี (ครั้งแรกเท่านั้น)
- Anaconda / Miniconda
- Node.js 18+
- Cloudflare account (Free tier ใช้ได้)

---

## 🚀 ขั้นตอน Deploy ครั้งแรก (Fresh Install)

### 1. เปิด Terminal และ Activate Conda
```bash
conda activate base
```

### 2. เข้าโฟลเดอร์โปรเจค
```bash
cd C:\Users\YourName\Documents\Calendar
```
> แทน `YourName` ด้วยชื่อ User จริงของเครื่อง

### 3. ติดตั้ง Dependencies
```bash
npm install
```

### 4. Login เข้า Cloudflare
```bash
npx wrangler login
```
> เปิด browser ให้ขึ้นมา → กด Allow → กลับมาที่ Terminal เอง

### 5. สร้าง D1 Database
```bash
npx wrangler d1 create summit-calendar-db
```
⚠️ **คัดลอก `database_id`** จากผลลัพธ์ → เปิดไฟล์ `wrangler.toml` → แทนที่ค่าในบรรทัด `database_id = "..."`

### 6. สร้างตาราง Database (Schema เริ่มต้น)
```bash
npx wrangler d1 execute summit-calendar-db --file=./schema.sql
```

### 7. Deploy ขึ้น Cloudflare
```bash
npm run deploy
```
> ✅ จะได้ URL เช่น `https://summit-calendar.yourname.workers.dev`

---

## 🔄 Migration Commands (เมื่อมีการเพิ่ม Feature ที่เปลี่ยน DB)

| Migration File | ใช้เมื่อ |
|----------------|---------|
| `migration_owner.sql` | เพิ่ม Multi-User Calendar (owner_id) |
| `migration_audit_log.sql` | เพิ่ม Audit Log |
| `migration_holidays.sql` | เพิ่มตาราง Holidays |

รัน migration แล้ว deploy:
```bash
npx wrangler d1 execute summit-calendar-db --file=./migration_owner.sql
npm run deploy
```

---

## 👥 ข้อมูลการเข้าใช้งาน

### ผู้บริหาร (Viewer) — เข้าด้วย PIN
| ชื่อ | PIN |
|------|-----|
| คุณ Nopamas | `1234` |
| คุณ Jatuporn | `5678` |
| คุณ Warunee | `9012` |

### Admin (จัดการระบบ)
- Username: `admin`
- Password: `admin`
- ⚠️ ควรเปลี่ยนรหัสผ่านหลัง deploy

---

## 🌟 Features ทั้งหมด

### Calendar & View
- ✅ ปฏิทินรายเดือน / รายสัปดาห์ / Agenda (รายการ)
- ✅ Timeline รายวัน ดูงานแบบละเอียด
- ✅ Mobile Responsive + Swipe gesture
- ✅ Agenda View สำหรับมือถือ

### Multi-User Calendar (ใหม่!)
- ✅ แต่ละท่านมี Calendar ส่วนตัว
- ✅ ดูตารางของคนอื่นได้ (Read-only)
- ✅ Dropdown เลือกดูตารางของใครก็ได้
- ✅ 🔒 Badge แสดงเมื่อดูตารางคนอื่น
- ✅ Shared Events ที่ทุกคนเห็นพร้อมกัน

### AI เลขาส่วนตัว "คุณต่าย" (ใหม่!)
- ✅ AI Secretary powered by Claude API
- ✅ บุคลิกเด็ดขาด เจ้าระเบียบ มืออาชีพ
- ✅ ถามตารางวันนี้/พรุ่งนี้/สรุปสัปดาห์ได้
- ✅ Morning Briefing อัตโนมัติ
- ✅ เพิ่มนัดหมายผ่านการสนทนา

### Profile Picture (ใหม่!)
- ✅ แต่ละท่าน upload รูปตัวเองได้
- ✅ คลิกที่ Avatar มุมล่างซ้ายเพื่อเปลี่ยนรูป
- ✅ Resize อัตโนมัติ ไม่กิน storage

### System
- ✅ Login 2 ระดับ (Admin + PIN Viewer)
- ✅ ตรวจจับตารางทับซ้อน + แจ้งเตือน
- ✅ แจ้งเตือนผ่าน Telegram + Browser
- ✅ Audit Log บันทึกการเปลี่ยนแปลง
- ✅ วันหยุดนักขัตฤกษ์ไทย 2025-2026

---

## 🛠 Commands อื่นๆ ที่ใช้บ้าง

```bash
# ดู logs แบบ real-time
npm run tail

# ทดสอบ local (ไม่ต้อง deploy)
npm run dev

# ดู DB โดยตรง
npx wrangler d1 execute summit-calendar-db --command="SELECT * FROM events LIMIT 10"

# เพิ่ม PIN user ใหม่ → แก้ไฟล์ src/pins.js แล้ว deploy
npm run deploy
```

---

## ⚠️ ความปลอดภัย (สำหรับ Production)

เปลี่ยน secrets ผ่าน Cloudflare Dashboard หรือ:
```bash
npx wrangler secret put ADMIN_PASS
npx wrangler secret put JWT_SECRET
```

---

## 📁 โครงสร้างไฟล์สำคัญ

```
Calendar/
├── src/
│   ├── worker.js          ← Backend API (Cloudflare Worker)
│   └── pins.js            ← จัดการ PIN ผู้บริหาร
├── public/
│   └── index.html         ← Frontend ทั้งหมด
├── schema.sql             ← DB Schema (fresh install)
├── migration_owner.sql    ← Migration: Multi-User Calendar
├── migration_audit_log.sql
├── migration_holidays.sql
├── wrangler.toml          ← Config Cloudflare
└── README-DEPLOY.md       ← คู่มือนี้
```
