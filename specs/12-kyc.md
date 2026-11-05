# 12 — KYC — Identity verification service

> สถานะ: **implemented** — KYC เป็น internal service แยก (`apps/kyc-api`, port `4005`) ที่มีข้อมูลของตัวเอง ไม่ใช้ MySQL ของ PokéMart. PokéMart API เรียกผ่าน HTTP นอก database transaction เหมือน shipping และ payment

## 1. Purpose

KYC API คืนระดับการยืนยันตัวตนของผู้ใช้ PokéMart API ใช้ระดับนี้ตัดสินว่าผู้ใช้ซื้อสินค้าบางรายการได้หรือไม่ KYC ไม่เกี่ยวกับการชำระเงินและไม่เก็บข้อมูลบัตรหรือเอกสารจริง

เหตุผลที่แยกเป็น service: ให้ฝึกทดสอบ dependency ภายในที่ล่ม/ช้า (resilience), mock service และ fail-closed behavior โดยไม่ต้องมี provider จริง

## 2. Levels

| Level | ค่า | ความหมาย (ในแล็บ) |
|---|---|---|
| `NONE` | 0 | ยังไม่ยืนยัน (ค่าเริ่มต้นของผู้ใช้ทุกคน) |
| `BASIC` | 1 | ยืนยันข้อมูลพื้นฐาน |
| `FULL` | 2 | ยืนยันตัวตนเต็มรูปแบบ |

Status ของระดับ: `ACTIVE`, `PENDING_REVIEW`, `REJECTED` — เฉพาะ `ACTIVE` เท่านั้นที่ให้สิทธิ์ซื้อ. การตรวจสิทธิ์: `status == ACTIVE && levelValue >= required_kyc_level`

## 3. Product gating

`shop_listing` และ `item_listing` มี `required_kyc_level` (0, 1, หรือ 2). Pokémon ทุกตัวเป็น `0`. KYC ใช้กับ items: ระดับ 1 เช่น Ultra/Great Ball, Hyper/Super Potion, Revive, Ether, Elixir; ระดับ 2 เช่น Master Ball, Full Restore, Max Potion, Max Revive, Revival Herb, Max Ether/Elixir, PP Max, Sacred Ash. ค่านี้เป็นข้อมูลของ PokéMart และแก้เป็นราย listing ได้

## 4. Service contract (KYC API)

Base path `/kyc/v1`. Contract เต็มอยู่ใน [`kyc-openapi.yaml`](kyc-openapi.yaml). ไม่เปิดผ่าน BFF

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/kyc/v1/users/{userId}` | คืน `{ userId, level, levelValue, status, updatedAt }`. ไม่รู้จักผู้ใช้ → `404` |
| `GET` | `/health` | Liveness |
| `PUT` | `/__test/users/{userId}` | Test-only: ตั้ง `{ level, status? }` |
| `PUT` | `/__test/faults` | Test-only: `{ mode: "http_500" \| "timeout", count? }` ทำให้การเรียก lookup ถัดไป (หรือจนกว่าจะล้าง) ล้มเหลว |
| `DELETE` | `/__test/faults` | Test-only: ล้าง fault และ reset ข้อมูลเป็นค่าตั้งต้น |

- Auth: `Authorization: Bearer <KYC_API_KEY>` (ค่า lab, ไม่ใช่ความลับจริง) ขาด/ผิด → `401`
- ข้อมูลเก็บใน memory และ seed ตอนเริ่ม: `lab-user-001` และ `lab-empty-user-001` เป็น `NONE/ACTIVE`. Restart service = reset. Test setup ควรตั้งระดับผ่าน `/__test/users/{userId}` ก่อนทุก test ที่ต้องใช้ และเรียก `DELETE /__test/faults` หลังจบ
- `timeout` fault หน่วงคำตอบ `KYC_TIMEOUT_HOLD_MS` (ค่าเริ่มต้น 6000 ms) ซึ่งนานกว่า timeout ของ PokéMart (2000 ms)

## 5. How PokéMart API uses it

| Setting | Default | Meaning |
|---|---|---|
| `KYC_BASE_URL` | `http://kyc-api:4005` (Compose) | |
| `KYC_API_KEY` | `local-only-kyc-key` | |
| `KYC_REQUEST_TIMEOUT_MS` | `2000` | ไม่ retry อัตโนมัติ |

- **404 จาก KYC** ถือเป็น `NONE/ACTIVE` (ผู้ใช้ที่ยังไม่เคยยืนยัน)
- **5xx, timeout, connection error, body ผิดรูป** ถือว่า KYC ใช้ไม่ได้ (ดู §7)
- ไม่ cache ผล แต่ละ request เรียกใหม่

## 6. Purchase rule

ลำดับการตรวจในการซื้อ (Pokémon และ item):

1. ตรวจรูปแบบ request
2. ตรวจ `purchaseId` ซ้ำ → `409 PURCHASE_DUPLICATE` / `ITEM_PURCHASE_DUPLICATE`
3. ตรวจว่ามีสินค้า → `404 POKEMON_NOT_FOUND` / `ITEM_NOT_FOUND`
4. ตรวจว่าขายได้ → `409 POKEMON_NOT_FOR_SALE` / `ITEM_NOT_FOR_SALE`
5. **ตรวจระดับ KYC** → `403 KYC_LEVEL_REQUIRED` หรือ `503 DEPENDENCY_UNAVAILABLE` หาก KYC ใช้ไม่ได้
6. ตรวจ stock → `409 INSUFFICIENT_STOCK`
7. ตรวจ wallet → `422 INSUFFICIENT_FUNDS`

การเรียก KYC เกิด **ก่อนเปิด transaction** (และก่อนรับ connection จาก pool) เฉพาะเมื่อ `required_kyc_level > 0`. ผลหรือความล้มเหลวถูกเก็บไว้แล้วนำไปใช้ที่ข้อ 5 ภายใน transaction จึงรักษาลำดับ error ตามข้างบน เช่น สินค้าไม่มีจริงยังได้ `404` แม้ KYC ล่ม

การปฏิเสธเพราะ KYC ต้องไม่เปลี่ยน wallet, stock, inventory, purchase history หรือ shipment

## 7. Failure behavior (fail closed above NONE)

| สถานการณ์ | สินค้า `required = 0` | สินค้า `required > 0` |
|---|---|---|
| KYC ปกติ | ซื้อได้ | ตามระดับ |
| KYC ล่ม / timeout | **ซื้อได้** (ไม่เรียก KYC) | `503 DEPENDENCY_UNAVAILABLE` ไม่มีการเปลี่ยนข้อมูล |

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

`GET /api/kyc/status` (bearer) คืน `{ level, levelValue, status, updatedAt }`. `GET /api/account-info` รวมค่าเดียวกันใน `kyc`

## 10. Upgrade flow (out of scope for v1)

v1 ไม่มี endpoint ให้ผู้ใช้ส่งเอกสารหรือยกระดับ KYC ผู้ทดสอบปรับระดับผ่าน `PUT /__test/users/{userId}` เท่านั้น. ถ้าเพิ่ม flow ในอนาคต: `NONE → BASIC` อนุมัติอัตโนมัติ, `BASIC → FULL` เป็น `PENDING_REVIEW` จนมี test-only approve/reject; ไม่ลดระดับอัตโนมัติ

## 11. Acceptance criteria

- ผู้ใช้ `NONE` ซื้อ Pokémon ทุกตัวและ item ระดับ 0 ได้ และได้ `403 KYC_LEVEL_REQUIRED` เมื่อซื้อ item ระดับ 1 หรือ 2
- ผู้ใช้ `BASIC` ซื้อ item ระดับ 1 ได้ แต่ไม่ได้ระดับ 2; ผู้ใช้ `FULL` ซื้อได้ทุกระดับ
- ระดับ `PENDING_REVIEW` / `REJECTED` ไม่ให้สิทธิ์ซื้อสินค้าที่ต้องใช้ KYC
- การปฏิเสธเพราะ KYC ไม่เปลี่ยน wallet, stock, inventory, purchase history
- KYC ล่ม (`http_500` หรือ `timeout`): สินค้า level 0 ยังซื้อได้; level > 0 ได้ `503 DEPENDENCY_UNAVAILABLE` พร้อม `retryable: true` และข้อมูลไม่เปลี่ยน
- KYC ล่ม: `GET /api/account-info` ได้ `200` และ `kyc: null`; `GET /api/kyc/status` ได้ `503`
- สินค้าไม่มีจริงหรือไม่ขายยังได้ `404`/`409` ตามลำดับ §6 แม้ KYC ล่ม
- การเรียก KYC ไม่อยู่ใน database transaction และ KYC ที่ช้าไม่ทำให้ connection pool ของ PokéMart เต็ม
- Test-only routes ไม่เปิดผ่าน BFF และไม่ปรากฏใน `specs/openapi.yaml`
