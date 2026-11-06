# 12 — KYC — Identity verification service

> สถานะ: **implemented** (รวม submission flow ใน §10) — KYC เป็น internal service แยก (`apps/kyc-api`, port `4005`) ที่มีข้อมูลของตัวเอง ไม่ใช้ MySQL ของ PokéMart. PokéMart API เรียกผ่าน HTTP นอก database transaction เหมือน shipping และ payment

## 1. Purpose

KYC API คืนระดับการยืนยันตัวตนของผู้ใช้ PokéMart API ใช้ระดับและสถานะนี้ตัดสินว่าผู้ใช้ซื้อสินค้าได้หรือไม่ และรับคำขอยืนยันตัวตนของผู้ใช้ (§10) KYC ไม่เกี่ยวกับการชำระเงินและไม่เก็บข้อมูลบัตรหรือเอกสารจริง

เหตุผลที่แยกเป็น service: ให้ฝึกทดสอบ dependency ภายในที่ล่ม/ช้า (resilience), mock service และ fail-closed behavior โดยไม่ต้องมี provider จริง

## 2. Levels

| `level` | ชื่อเรียก | ความหมาย (ในแล็บ) |
|---|---|---|
| `0` | not verified | ยังไม่ยืนยัน (ค่าเริ่มต้นของผู้ใช้ใหม่) — **ซื้อสินค้าไม่ได้เลย** |
| `1` | basic | ยืนยันข้อมูลพื้นฐาน — ซื้อสินค้าทั่วไปได้ (Pokémon ทุกตัว และ item ที่ไม่ใช่ระดับ Master) |
| `2` | full | ยืนยันตัวตนเต็มรูปแบบ — ซื้อได้ทุกอย่างรวมถึงระดับ Master |

ระดับเป็นตัวเลข `level` 0 / 1 / 2 ตัวเดียว (ไม่มีชื่อ enum และไม่มีฟิลด์ `levelValue` แยกอีกแล้ว); ชื่อเรียกในตารางใช้เพื่ออ่านง่ายเท่านั้น

Status ของระดับ: `ACTIVE`, `PENDING_REVIEW`, `REJECTED` — เฉพาะ `ACTIVE` เท่านั้นที่ให้สิทธิ์ซื้อสินค้าที่ต้อง KYC. การตรวจสิทธิ์: `status == ACTIVE && level >= required_kyc_level`

**`PENDING_REVIEW`:** บัญชีที่กำลังรอตรวจสอบ **ซื้อสินค้าไม่ได้เลย แม้ระดับปัจจุบันจะพอ** (`403 KYC_PENDING_REVIEW`, §6) เพราะไม่ควรให้บัญชีที่ยังไม่ผ่านการตรวจสอบทำธุรกรรมระหว่างรอ. `REJECTED` ที่ระดับ level 0 ซื้อไม่ได้เช่นเดียวกับระดับ 0 (ได้ `KYC_LEVEL_REQUIRED`) แต่ส่งข้อมูลใหม่ได้

## 3. Product gating

`shop_listing` และ `item_listing` มี `required_kyc_level` (0, 1, หรือ 2). **ระดับ 0 ไม่มีสิทธิ์ซื้ออะไรเลย** จึงไม่มี listing ใดในข้อมูลเริ่มต้นที่ต้องการระดับ 0:

| `required_kyc_level` | สินค้า | ผู้ซื้อที่ต้องมี |
|---|---|---|
| `1` | Pokémon ทุกตัว และ item ทั่วไปทั้งหมด (เช่น Poké Ball, Potion, Ultra/Great Ball, Hyper/Super Potion, Revive, Ether, Elixir) | level 1 ขึ้นไป |
| `2` | item ระดับ Master เช่น Master Ball, Full Restore, Max Potion, Max Revive, Revival Herb, Max Ether/Elixir, PP Max, Sacred Ash | level 2 |

เดิม (ก่อนปรับ tier) Pokémon และ item ทั่วไปต้องการระดับ 0, item บางกลุ่มต้องการระดับ 1 และกลุ่ม Master ต้องการระดับ 2. การปรับคือ Liquibase changeset `006-kyc-catalog-levels` (`database/seed/013_kyc_catalog_levels.sql`): ทุก listing ที่ต้องการระดับ 0 หรือ 1 ถูกยกเป็น 1, ระดับ 2 คงเดิม. ค่านี้เป็นข้อมูลของ PokéMart และแก้เป็นราย listing ได้ (คอลัมน์ยังรับ 0–2)

## 4. Service contract (KYC API)

Base path `/kyc/v1`. Contract เต็มอยู่ใน [`kyc-openapi.yaml`](kyc-openapi.yaml). ไม่เปิดผ่าน BFF

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/kyc/v1/users/{userId}` | คืน `{ userId, level, status, updatedAt }`. ไม่รู้จักผู้ใช้ → `404` |
| `POST` | `/kyc/v1/users/{userId}/submissions` | ส่งข้อมูลยืนยันตัวตน → `202` สถานะ `PENDING_REVIEW`; `400` ข้อมูลไม่ถูกต้อง (มี `details`); `409` `already_pending` / `already_verified` (§10) |
| `GET` | `/health` | Liveness |
| `PUT` | `/__test/users/{userId}` | Test-only: ตั้ง `{ level, status? }` |
| `PUT` | `/__test/faults` | Test-only: `{ mode: "http_500" \| "timeout", count? }` ทำให้การเรียก lookup ถัดไป (หรือจนกว่าจะล้าง) ล้มเหลว |
| `DELETE` | `/__test/faults` | Test-only: ล้าง fault และ reset ข้อมูลเป็นค่าตั้งต้น |

- Auth: `Authorization: Bearer <KYC_API_KEY>` (ค่า lab, ไม่ใช่ความลับจริง) ขาด/ผิด → `401`
- ข้อมูลเก็บใน memory และ seed ตอนเริ่ม: `lab-user-001` เป็น level 1 / `ACTIVE` (บัญชีหลักที่ซื้อของได้) และ `lab-empty-user-001` เป็น level 0 / `ACTIVE`; บัญชี `lab-kyc-*` ไม่ถูก seed (อ่านเป็น level 0 / `ACTIVE` จนกว่า test จะตั้งค่า, §11). Restart service = reset. Test setup ควรตั้งระดับผ่าน `/__test/users/{userId}` ก่อนทุก test ที่ต้องใช้ และเรียก `DELETE /__test/faults` หลังจบ
- `timeout` fault หน่วงคำตอบ `KYC_TIMEOUT_HOLD_MS` (ค่าเริ่มต้น 6000 ms) ซึ่งนานกว่า timeout ของ PokéMart (2000 ms)

## 5. How PokéMart API uses it

| Setting | Default | Meaning |
|---|---|---|
| `KYC_BASE_URL` | `http://kyc-api:4005` (Compose) | |
| `KYC_API_KEY` | `local-only-kyc-key` | |
| `KYC_REQUEST_TIMEOUT_MS` | `2000` | ไม่ retry อัตโนมัติ |

- **404 จาก KYC** ถือเป็น level 0 / `ACTIVE` (ผู้ใช้ที่ยังไม่เคยยืนยัน)
- **5xx, timeout, connection error, body ผิดรูป** ถือว่า KYC ใช้ไม่ได้ (ดู §7)
- ไม่ cache ผล แต่ละ request เรียกใหม่

## 6. Purchase rule

ลำดับการตรวจในการซื้อ (Pokémon และ item):

1. ตรวจรูปแบบ request
2. ตรวจ `purchaseId` ซ้ำ → `409 PURCHASE_DUPLICATE` / `ITEM_PURCHASE_DUPLICATE`
3. ตรวจว่ามีสินค้า → `404 POKEMON_NOT_FOUND` / `ITEM_NOT_FOUND`
4. ตรวจว่าขายได้ → `409 POKEMON_NOT_FOR_SALE` / `ITEM_NOT_FOR_SALE`
5. **ตรวจ KYC** → `403 KYC_PENDING_REVIEW` เมื่อบัญชีอยู่ระหว่างตรวจสอบ (ทุกสินค้า), `403 KYC_LEVEL_REQUIRED` เมื่อระดับไม่พอ, หรือ `503 DEPENDENCY_UNAVAILABLE` หาก KYC ใช้ไม่ได้และสินค้าต้องการระดับ > 0
6. ตรวจ stock → `409 INSUFFICIENT_STOCK`
7. ตรวจ wallet → `422 INSUFFICIENT_FUNDS`

การเรียก KYC เกิด **ก่อนเปิด transaction** (และก่อนรับ connection จาก pool) **ในทุกการซื้อ** เพื่อให้ตรวจ `PENDING_REVIEW` ได้ (เดิมเรียกเฉพาะ `required_kyc_level > 0`). สินค้าในข้อมูลเริ่มต้นต้องการระดับ ≥ 1 ทั้งหมด จึงเรียก KYC เสมอและ fail closed เมื่อ KYC ล่ม (§7). ผลหรือความล้มเหลวถูกเก็บไว้แล้วนำไปใช้ที่ข้อ 5 ภายใน transaction จึงรักษาลำดับ error ตามข้างบน เช่น สินค้าไม่มีจริงยังได้ `404` แม้ KYC ล่ม

การปฏิเสธเพราะ KYC ต้องไม่เปลี่ยน wallet, stock, inventory, purchase history หรือ shipment

## 7. Failure behavior (fail closed)

| สถานการณ์ | ผลการซื้อ |
|---|---|
| KYC ปกติ | ตามระดับ/สถานะ (§2, §6) |
| KYC ล่ม / timeout | `503 DEPENDENCY_UNAVAILABLE` (`retryable: true`) ไม่มีการเปลี่ยนข้อมูล — ทุก listing ในข้อมูลเริ่มต้นต้องการระดับ ≥ 1 จึงอนุญาตการซื้อโดยไม่รู้ระดับไม่ได้ |

หมายเหตุ: ถ้ามี listing ที่ตั้ง `required_kyc_level = 0` เอง โค้ดยังปล่อยผ่านเมื่อ KYC ล่ม (ไม่มีอะไรให้บังคับ) แต่บัญชี `PENDING_REVIEW` ยังถูกบล็อกเมื่อ KYC ตอบได้

ผลต่อ endpoint อื่น:

- `GET /api/kyc/status` → `503` เมื่อ KYC ล่ม
- `GET /api/account-info` → **ยังตอบ `200`** และ `kyc: null` เพื่อไม่ให้ bootstrap หลัง login ล้ม; frontend ต้องรองรับ `null` (ไม่ให้ซื้อ item ที่ต้อง KYC จนกว่าจะรู้ระดับ)

## 8. Error response

```json
{
  "error": {
    "code": "KYC_LEVEL_REQUIRED",
    "message": "This item requires a higher verification level",
    "requestId": "…",
    "retryable": false,
    "details": [{ "required": 2, "current": 0 }]
  }
}
```

HTTP `403`. `details` ระบุระดับที่ต้องการและระดับปัจจุบันเพื่อให้ frontend แสดงข้อความที่ถูกต้อง

## 9. Public API

`GET /api/kyc/status` (bearer) คืน `{ level, status, updatedAt }`. `GET /api/account-info` รวมค่าเดียวกันใน `kyc`

`POST /api/kyc/submissions` (bearer) ส่งข้อมูลยืนยันตัวตน → `202` พร้อม `KycStatus` ใหม่ (`status: PENDING_REVIEW`, level เดิม). รายละเอียดใน §10

## 10. Verification submission flow

ผู้ใช้ level 0 ส่งข้อมูลเพื่อขอยืนยันตัวตนได้ผ่านหน้าเว็บ. ไม่มีการอัปโหลดเอกสารหรือรูปถ่ายใน v1 (ไม่เก็บข้อมูลบัตรจริง)

**ฟิลด์ที่ส่ง** (ทุกฟิลด์บังคับ, ไม่รับฟิลด์อื่น):

| Field | กติกา |
|---|---|
| `fullName` | 2–100 ตัวอักษร (หลัง trim) |
| `nationalId` | เลขบัตรประชาชน 13 หลัก และผ่านการตรวจ check digit แบบไทย: `(11 − (Σ dᵢ × (13 − i) mod 11)) mod 10 == d₁₃` เมื่อ i = 0..11 |
| `dateOfBirth` | `YYYY-MM-DD` วันที่จริง และอายุอย่างน้อย 18 ปี |
| `phone` | 10 หลัก ขึ้นต้นด้วย `0` |
| `address` | 10–300 ตัวอักษร (หลัง trim) |

ฟอร์มบนหน้าเว็บมี checkbox ยืนยันว่าข้อมูลเป็นของตนเอง (ตรวจฝั่ง FE เท่านั้น ไม่ส่งไป API). ตัวอย่างเลขบัตรที่ผ่าน check digit สำหรับทดสอบ: `1101700230708`

**Endpoint ตามชั้น**

| ชั้น | Endpoint | หมายเหตุ |
|---|---|---|
| BFF | `POST /api/kyc/submissions` | ตรวจว่า body เป็น object, ไม่มีฟิลด์เกิน, ทุกฟิลด์เป็น string (`400 VALIDATION_ERROR`), `Content-Type` ต้องเป็น JSON (`415`) แล้วส่งต่อ |
| PokéMart API | `POST /pokemart/v1/kyc/submissions` | ต้อง login, ส่งต่อไป KYC API และ map ข้อผิดพลาด |
| KYC API | `POST /kyc/v1/users/{userId}/submissions` | ตรวจกติกาฟิลด์ทั้งหมด (แหล่งความจริง), เก็บ `nationalId` แค่ 4 หลักท้าย |

**ผลลัพธ์**

| กรณี | Response |
|---|---|
| สำเร็จ | `202` `{ level, status: "PENDING_REVIEW", updatedAt }` (level เดิม) |
| ข้อมูลไม่ถูกต้อง | `400 VALIDATION_ERROR` พร้อม `details: [{ field, message }]` |
| มีคำขอที่รอตรวจสอบอยู่แล้ว | `409 KYC_ALREADY_PENDING` |
| level 1 หรือ 2 และ `ACTIVE` อยู่แล้ว | `409 KYC_ALREADY_VERIFIED` |
| `REJECTED` | ส่งใหม่ได้ (กลับเป็น `PENDING_REVIEW`) |
| KYC ล่ม / timeout | `503 DEPENDENCY_UNAVAILABLE` (ไม่เปลี่ยนสถานะ) |

**การตัดสินผล:** ไม่มีการอนุมัติอัตโนมัติ และไม่มี endpoint ให้ผู้ใช้เปลี่ยนสถานะเอง. ผู้ทดสอบจบ flow ผ่าน `PUT /__test/users/{userId}` เช่น `{ "level": 1, "status": "ACTIVE" }` (อนุมัติ) หรือ `{ "level": 0, "status": "REJECTED" }` (ปฏิเสธ). ไม่ลดระดับอัตโนมัติ

**พฤติกรรมของหน้าเว็บ** (รายละเอียดใน [`09-frontend.md`](09-frontend.md)): popup ชวนยืนยันตัวตนเมื่อ login แล้วระดับ level 0/`ACTIVE` (ปิดได้ด้วย "Maybe later" และจะไม่ขึ้นอีกใน session นั้น), ปุ่ม "Verify now" พาไปหน้าฟอร์ม, หลังส่งเห็น banner "under review" ทุกหน้า, ถ้า `REJECTED` เห็น banner พร้อมปุ่มส่งใหม่

## 11. Test accounts and data isolation

หนึ่ง test case ใช้หนึ่งบัญชี ไม่แชร์ข้อมูลกัน. บัญชีทดสอบ KYC ชื่อ `lab-kyc-<scenario>` (เช่น `lab-kyc-basic-item`, `lab-kyc-pending-pokemon`) มี email `lab-kyc-<scenario>@example.test`, รหัสผ่านเดียวกับ demo account และ wallet 100,000 ของตัวเอง. มีทั้งหมดตามรายการใน [`tests/support/data/kycUsers.ts`](../tests/support/data/kycUsers.ts) (แหล่งข้อมูลเดียวกับ [`database/seed/014_seed_kyc_test_users.sql`](../database/seed/014_seed_kyc_test_users.sql)).

- ระดับ/สถานะ KYC ของแต่ละบัญชีเป็นข้อมูลของ test: ก่อนทุก test จะตั้งผ่าน `PUT /__test/users/{userId}` ของ KYC service (บัญชีที่ไม่รู้จักอ่านเป็น level 0 / `ACTIVE`) จึงไม่ต้อง seed ระดับไว้ที่ใด และตั้งค่าซ้ำได้เสมอ
- ก่อนทุก test จะรีเซ็ต wallet, inventory ของบัญชีนั้น และ stock/ราคาของ listing ที่ใช้ (potion `17`, Master Ball `1`)
- `lab-user-001` (บัญชีหลักของ test ชุดเดิม) ถูก seed เป็น level 1 / `ACTIVE` เพื่อให้ test ซื้อ Pokémon ชุดเดิมผ่านโดยไม่แก้
- ต้องการลองหน้าเว็บ: login ด้วยบัญชี `lab-kyc-*` ใดก็ได้ (ระดับเริ่มต้น level 0) หรือสั่ง `PUT /__test/users/lab-user-001` ให้เป็นระดับที่ต้องการ
- รัน: `make test-kyc` (projects `kyc` และ `kyc-ui`)

## 12. Acceptance criteria

- ผู้ใช้ level 0 (level 0) ซื้ออะไรไม่ได้เลย: Pokémon และ item ทั่วไปได้ `403 KYC_LEVEL_REQUIRED` พร้อม `details: [{ required: 1, current: 0 }]`
- ผู้ใช้ level 1 (level 1) ซื้อ Pokémon และ item ทั่วไปได้ แต่ซื้อ item ระดับ Master ไม่ได้ (`403 KYC_LEVEL_REQUIRED`, `details: [{ required: 2, current: 1 }]`); ผู้ใช้ level 2 (level 2) ซื้อได้ทุกอย่าง
- ระดับ `PENDING_REVIEW` / `REJECTED` ไม่ให้สิทธิ์ซื้อสินค้าที่ต้องใช้ KYC
- บัญชี `PENDING_REVIEW` ซื้อสินค้าใด ๆ ไม่ได้แม้ระดับจะพอ (เช่น level 1 + `PENDING_REVIEW`): `403 KYC_PENDING_REVIEW` และไม่เปลี่ยน wallet, stock, inventory, purchase history; ลำดับตรวจตาม §6 (สินค้าไม่มีจริงยังได้ `404`)
- บัญชี `REJECTED` ที่ level 0 ซื้ออะไรไม่ได้: `403 KYC_LEVEL_REQUIRED`
- `POST /api/kyc/submissions`: ข้อมูลถูกต้อง → `202` และ `status = PENDING_REVIEW`; ข้อมูลผิด → `400` พร้อม `details` รายฟิลด์; ส่งซ้ำระหว่างรอ → `409 KYC_ALREADY_PENDING`; ผู้ใช้ที่ยืนยันแล้ว → `409 KYC_ALREADY_VERIFIED`; ไม่มี token → `401`; KYC ล่ม → `503`; หลังอนุมัติผ่าน test route ผู้ใช้ซื้อสินค้าตามระดับใหม่ได้
- การปฏิเสธเพราะ KYC ไม่เปลี่ยน wallet, stock, inventory, purchase history
- KYC ล่ม (`http_500` หรือ `timeout`): ทุกการซื้อได้ `503 DEPENDENCY_UNAVAILABLE` พร้อม `retryable: true` และข้อมูลไม่เปลี่ยน
- KYC ล่ม: `GET /api/account-info` ได้ `200` และ `kyc: null`; `GET /api/kyc/status` ได้ `503`
- สินค้าไม่มีจริงหรือไม่ขายยังได้ `404`/`409` ตามลำดับ §6 แม้ KYC ล่ม
- การเรียก KYC ไม่อยู่ใน database transaction และ KYC ที่ช้าไม่ทำให้ connection pool ของ PokéMart เต็ม
- Test-only routes ไม่เปิดผ่าน BFF และไม่ปรากฏใน `specs/openapi.yaml`
