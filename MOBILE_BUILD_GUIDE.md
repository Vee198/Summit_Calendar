# คู่มือสร้างแอปมือถือ — Summit Calendar (Capacitor)

คู่มือนี้อธิบายวิธีแปลง webapp เดิม (ที่รันบน Cloudflare Workers) ให้เป็น
**แอป Android และ iOS แบบ native** ด้วย [Capacitor](https://capacitorjs.com/)

> **แนวคิดหลัก:** Backend (Cloudflare Workers + D1) **ไม่เปลี่ยนเลย** —
> Capacitor แค่ห่อหน้าเว็บ (`public/`) ให้กลายเป็นแอป native ที่เรียก API
> ไปยัง Cloudflare ตามปกติ เวลาแก้หน้าเว็บก็ deploy เว็บเหมือนเดิม
> แล้ว sync เข้าแอปอีกที

---

## ⚙️ สิ่งที่ตั้งค่าไว้ให้แล้ว

| ไฟล์ | การเปลี่ยนแปลง |
|------|----------------|
| `capacitor.config.json` | config หลักของแอป (appId, appName, webDir=`public`) |
| `package.json` | เพิ่ม dependency ของ Capacitor + script `cap:*` |
| `public/index.html` | ตรวจจับว่ารันใน native หรือไม่ แล้วชี้ API ไป production อัตโนมัติ |
| `.gitignore` | กันไฟล์ build (apk/aab/ipa/Pods) ไม่ให้ push |

**App ID:** `com.summitautobody.calendar`
**App Name:** `Summit Calendar`

---

## 🔴 สิ่งสำคัญที่ต้องเช็คก่อน — URL ของ API

แอป native จะเรียก API ไปที่ค่าใน `public/index.html` บรรทัด:

```js
const PROD_API_BASE = 'https://summit-calendar.workers.dev';
```

**ต้องเป็น URL จริงที่คุณเปิดแอปบน browser** (ตัวที่มี subdomain ของบัญชีคุณ
เช่น `https://summit-calendar.veexxxx.workers.dev` หรือโดเมนของบริษัทเอง)

วิธีหา URL ที่ถูกต้อง: เปิดแอปบน browser แล้วก็อปจาก address bar
หรือรัน `npm run deploy` แล้วดู URL ที่ wrangler พิมพ์ออกมา
ถ้าค่าไม่ตรง แก้บรรทัดเดียวนี้แล้วรัน `npx cap sync` ใหม่

---

## 📋 สิ่งที่ต้องติดตั้งบนเครื่อง

**ทั้งสองแพลตฟอร์ม:**
- Node.js 20 ขึ้นไป (ของคุณมี v22 แล้ว ✅)

**Android (ทำบน Windows ได้):**
- [Android Studio](https://developer.android.com/studio) (มาพร้อม Android SDK)
- JDK 17 (Android Studio ลงให้อัตโนมัติ)
- บัญชี Google Play Developer ($25 จ่ายครั้งเดียว) — เฉพาะตอนจะขึ้น store

**iOS (ต้องใช้ Mac เท่านั้น):**
- macOS + [Xcode](https://apps.apple.com/app/xcode/id497799835) (จาก App Store)
- CocoaPods → ติดตั้งด้วย `sudo gem install cocoapods`
- บัญชี Apple Developer ($99/ปี) — เฉพาะตอนจะขึ้น store

---

## 🚀 ขั้นตอนตั้งค่าครั้งแรก (One-time setup)

รันในโฟลเดอร์โปรเจกต์:

```bash
# 1) ติดตั้ง dependency ทั้งหมด (รวม Capacitor)
npm install

# 2) เพิ่มแพลตฟอร์ม Android (ทำได้บน Windows)
npx cap add android

# 3) เพิ่มแพลตฟอร์ม iOS (ทำบน Mac เท่านั้น)
npx cap add ios

# 4) คัดลอกหน้าเว็บเข้าแอป + ติดตั้ง plugin
npx cap sync
```

คำสั่งข้างบนจะสร้างโฟลเดอร์ `android/` และ `ios/` (โปรเจกต์ native จริง)

---

## 🎨 ใส่ไอคอนแอป + หน้า Splash (แนะนำ)

1. เตรียมไฟล์ไอคอน `1024x1024 px` (PNG) ใส่ไว้ที่ `assets/icon.png`
   และภาพ splash `2732x2732 px` ที่ `assets/splash.png`
2. รัน:

```bash
npx capacitor-assets generate
npx cap sync
```

ระบบจะสร้างไอคอนทุกขนาดให้ทั้ง Android และ iOS อัตโนมัติ

---

## 🤖 Build แอป Android

```bash
npx cap open android      # เปิดโปรเจกต์ใน Android Studio
```

ใน Android Studio:
- **ทดสอบบนมือถือ/emulator:** กดปุ่ม ▶ Run
- **สร้างไฟล์ติดตั้ง (APK):** เมนู `Build → Build Bundle(s) / APK(s) → Build APK(s)`
  ได้ไฟล์ `.apk` ส่งให้คนติดตั้งทดสอบได้เลย
- **สร้างไฟล์ขึ้น Play Store (AAB):** `Build → Generate Signed Bundle / APK → Android App Bundle`
  (ต้องสร้าง keystore สำหรับเซ็นแอปครั้งแรก — **เก็บ keystore ไว้ให้ดี ห้ามหาย**)

---

## 🍎 Build แอป iOS (บน Mac)

```bash
npx cap open ios          # เปิดโปรเจกต์ใน Xcode
```

ใน Xcode:
- เลือก Team (Apple Developer account) ใน `Signing & Capabilities`
- **ทดสอบ:** เลือก simulator หรือเครื่องจริง แล้วกด ▶ Run
- **ขึ้น App Store:** `Product → Archive → Distribute App`

---

## 🔄 ขั้นตอนเวลาแก้โค้ดทีหลัง (สำคัญ!)

ทุกครั้งที่แก้หน้าเว็บ (`public/`) แล้วอยากให้แอปอัปเดต:

```bash
# 1) deploy เว็บขึ้น Cloudflare (สำหรับฝั่ง web + เป็น API ให้แอป)
npm run deploy

# 2) sync โค้ดเว็บเข้าแอป native
npx cap sync

# 3) เปิด Android Studio / Xcode แล้ว build ใหม่
```

> 💡 ถ้าแก้แค่ฝั่ง backend (`worker.js`) ไม่ได้แตะหน้าเว็บ → `npm run deploy` อย่างเดียวพอ แอปไม่ต้อง build ใหม่

---

## ⚠️ ข้อควรระวัง / Gotchas

- **iOS ต้องใช้ Mac** ไม่มีทางลัด — Apple บังคับ build ผ่าน Xcode บน macOS
- **เก็บ Android keystore + รหัสให้ดี** ถ้าหายจะอัปเดตแอปเดิมบน Play Store ไม่ได้ ต้องสร้างแอปใหม่
- **CORS:** worker เปิด `Access-Control-Allow-Origin: *` อยู่แล้ว แอปจึงเรียก API ได้ ไม่ต้องแก้
- **Push Notification:** ตอนนี้ใช้ Telegram อยู่แล้ว (ทำงานได้ทั้งบนแอปและเว็บ) ถ้าอยากได้ native push
  ในอนาคต ค่อยเพิ่ม `@capacitor/push-notifications` + Firebase ทีหลังได้
- **Service Worker (`sw.js`):** อาจไม่ทำงานเต็มที่ใน context ของ Capacitor แต่ไม่กระทบการใช้งานหลัก

---

## 📦 สรุป flow แบบเร็ว

```
แก้โค้ดเว็บ → npm run deploy → npx cap sync → build ใน Android Studio/Xcode → ติดตั้ง/ขึ้น store
```
