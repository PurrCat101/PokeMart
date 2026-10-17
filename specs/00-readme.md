# PokéMart API Automation Lab

โปรเจ็กต์ตัวอย่างสำหรับฝึก API testing ด้วย Playwright และ TypeScript มี BFF, PokéMart API, MySQL, WireMock และ OpenAPI/Swagger UI โดยใช้ข้อมูล Pokémon แบบ static เพื่อให้ทดสอบซ้ำได้โดยไม่ต้องเรียก PokéAPI ทุกครั้ง

## สถาปัตยกรรม

```text
Playwright ──> BFF (public API) ──> PokéMart API (internal service) ──> MySQL
     │
     └────────> WireMock (จำลอง BFF สำหรับ contract tests)
```

- **BFF** เป็นทางเข้าสำหรับ client ที่ `/api` ตรวจ request, ส่งต่อไปยัง service และดูแล contract ฝั่ง public
- **PokéMart API** อยู่ใต้ `/pokemart/v2` และเป็นเจ้าของ business rules, purchase, duplicate detection และการเข้าถึงฐานข้อมูล
- **MySQL** เก็บข้อมูลร้าน, wallet, inventory และประวัติการซื้อ
- **WireMock** ใช้จำลอง BFF สำหรับ contract tests เท่านั้น การทดสอบ integration จริงต้องเรียก BFF และ service จริง
- การทดสอบและการเริ่มระบบไม่ควรต้องเรียก PokéAPI แบบ live

## ความต้องการก่อนเริ่ม

- Node.js และ npm (ใช้เวอร์ชัน LTS ที่รองรับ)
- Docker Desktop พร้อม Docker Compose
- GNU Make เป็นตัวเลือก หากต้องการใช้คำสั่ง `make`

## เริ่มใช้งานบน Windows

เปิด PowerShell ที่โฟลเดอร์โปรเจ็กต์:

```powershell
Copy-Item .env.example .env
npm install
docker compose up -d --build
```

ตรวจสอบสถานะและ readiness:

```powershell
docker compose ps
Invoke-RestMethod http://localhost:3001/health
Invoke-RestMethod http://localhost:3001/ready
Invoke-RestMethod http://localhost:3000/ready
```

ค่าเริ่มต้นของ host ports คือ BFF `3001`, PokéMart API `3000`, WireMock `8080`, Swagger UI `8081` และ MySQL `3306` หาก port MySQL ในเครื่องถูกใช้อยู่ ให้กำหนด `MYSQL_HOST_PORT` ใน `.env` เป็น port ว่างก่อน start ระบบ

## API และ Swagger

| สิ่งที่เรียก | Base URL | Contract |
|---|---|---|
| Public BFF | `http://localhost:3001` | [`specs/openapi.yaml`](specs/openapi.yaml) |
| Internal PokéMart API | `http://localhost:3000` | [`specs/pokemart-openapi.yaml`](specs/pokemart-openapi.yaml) |
| Swagger UI | `http://localhost:8081` | เลือกดู BFF public API หรือ PokéMart internal API ได้ |
| WireMock | `http://localhost:8080` | Mappings ใน `wiremock/mappings/` |

**สถานะ Swagger:** มี OpenAPI แยกสำหรับ BFF และ internal API แล้ว Swagger UI แสดงทั้งสองสเปกผ่าน dropdown; contract ของ service ระบุ schemas และ error responses แยกจาก public contract

### Endpoints ที่มีใน contract

Public API:

- `GET /api/pokemon` และ `GET /api/pokemon/{id}`
- `GET /api/wallet`
- `GET /api/inventory`
- `GET /api/purchases` และ `GET /api/purchases/{id}`
- `POST /api/purchases` (ส่ง `purchaseId`, `pokemonId`, `quantity` ใน JSON body)
- `GET /health` และ `GET /ready`

Internal service ใช้ endpoints ที่สอดคล้องกันภายใต้ `/pokemart/v2` เช่น `/pokemart/v2/catalog/pokemon`, `/pokemart/v2/wallet` และ `/pokemart/v2/purchases` โดย business endpoints ต้องมี `X-User-Id` ตาม contract ปัจจุบัน

## คำสั่ง build และทดสอบ

```powershell
npm run build
npm test
npm run test:mocked
npm run test:api
npm run test:purchase-retry
npm run test:e2e
```

- Test cases แยกตามหน้าที่และ target: `tests/testCases/mocked-bff/`, `pokemon/`, `purchases/` และ `e2e/`; ไม่แชร์ไฟล์ scenario ระหว่าง WireMock กับระบบจริง
- `test:mocked` รันเฉพาะ WireMock scenarios และตรวจ mock mappings
- `test:api` รัน API validation กับ BFF จริง
- `test:purchase-retry` และ `test:e2e` รัน flow จริง รวมการตรวจผลกระทบต่อ state และต้อง start Compose
- เลือก URL และ test data ด้วย `TEST_ENV` (`test` เป็นค่าเริ่มต้น หรือ `sit`) ผ่าน `tests/configs/.env.test` และ `.env.sit` เช่น `$env:TEST_ENV='sit'; npm test` ใน PowerShell
- ผลจาก mock ไม่เท่ากับการยืนยันพฤติกรรมของระบบจริง ขอบเขตการทดสอบแยกไว้ใน [`04-testing.md`](04-testing.md)

คำสั่ง `make` ที่มีให้ใช้ ได้แก่ `make up`, `make down`, `make ps`, `make logs`, `make swagger`, `make test-*`, `make db-seed` และ `make db-reset` (ขึ้นกับ GNU Make ในเครื่อง) โดย `make down` ไม่ลบข้อมูล ส่วน `make db-reset` ลบ Compose volumes และข้อมูลฐานข้อมูลในเครื่อง

## ฐานข้อมูลและข้อมูล Pokémon

ฐานข้อมูลเริ่มต้นจาก SQL ใน `database/schema/` และ `database/seed/` เมื่อสร้าง MySQL volume ใหม่เท่านั้น seed ปัจจุบันมี Pokémon Gen I 151 ตัวจาก PokeAPI v2 พร้อมราคา/stock จำลองของ PokéMart

ราคาใช้ base experience คำนวณแล้วปัดทีละ 50 และจำกัดช่วง 200–1500 ส่วน stock ลดลงตาม experience tier พร้อม deterministic variation จาก Pokémon ID จึงมีความหลากหลายแต่สร้าง seed ซ้ำได้ผลเดิม ข้อมูลอยู่ใน [001_seed_shop_data.sql](database/seed/001_seed_shop_data.sql) และ runtime/test ไม่เรียก PokéAPI

ที่มาข้อมูล: [PokeAPI REST API](https://pokeapi.co/). ตรวจสอบ license/attribution ก่อนนำ snapshot ไปแจกจ่ายต่อ

## สิ่งที่ปรับปรุงทางเทคนิค

### WireMock

- มี success mappings สำหรับ public endpoints รวม health/readiness และ error scenario mappings สำหรับ error codes ใน contract
- `contract.spec.ts` ตรวจ shape/status/error envelope และ reset request journal ก่อนแต่ละ test
- Error mappings ใช้ `X-WireMock-Scenario` เป็น selector สำหรับ mocked tests เท่านั้น ไม่ใช่ header ของ public API

### Identity

- ใช้ `LAB_USER_ID`, `X-User-Id`, `userId`, `user_id`, `user_wallet` และ `user_inventory` ให้สอดคล้องกัน
- Fixed user ปัจจุบันคือ `lab-user-001`; ยังเป็นค่า development ไม่ใช่ authentication จริง
- Database volume เดิมต้อง migrate หนึ่งครั้งด้วย `database/migrations/001_rename_player_identity.sql`; volume ใหม่ได้ schema ใหม่ทันที
- Volume เดิมที่มีตาราง `idempotency_keys` ให้รัน `database/migrations/002_drop_idempotency_keys.sql` หลัง migration 001

### Pokémon seed

- มีข้อมูล Generation I 151 ตัวจาก PokeAPI v2 พร้อม source ID, name, types และ sprite URL
- ราคา/stock เป็นข้อมูลจำลองของร้านและสร้างซ้ำได้ตามกติกาใน [database/README.md](database/README.md)

### BFF DTO

- BFF แปลงข้อมูลจาก service เป็น public response DTO: catalog ใช้ `totalCount/page/items`, wallet อยู่ใต้ `wallet`, inventory มี nested Pokémon และ purchase ใช้ `purchaseId` กับกลุ่ม `pricing`
- Internal API ยังคง contract ของ service แยกต่างหาก ไม่ serialize body ตรงกลับ client

### Purchase retry behavior

- Client สร้าง UUID `purchaseId` ก่อนส่งคำขอ และใส่ลง JSON body; ไม่ใช้ `Idempotency-Key` header
- หาก request ล้มเหลวก่อน transaction commit จะ retry ด้วย `purchaseId` เดิมได้
- หาก transaction commit แล้ว การส่ง ID เดิมอีกครั้งจะได้ `409 PURCHASE_DUPLICATE`; ตรวจรายการเดิมได้ด้วย `GET /api/purchases/{purchaseId}`

## เอกสารโครงการ

| ไฟล์ | เนื้อหา |
|---|---|
| [`01-scope-and-architecture.md`](01-scope-and-architecture.md) | เป้าหมายและสถาปัตยกรรม |
| [`02-data.md`](02-data.md) | ข้อมูลและ schema |
| [`03-api-contract.md`](03-api-contract.md) | Public API contract |
| [`03b-bff.md`](03b-bff.md) | หน้าที่และพฤติกรรม BFF |
| [`03c-pokemart-api.md`](03c-pokemart-api.md) | Internal service contract |
| [`04-testing.md`](04-testing.md) | แนวทางและ coverage tests |
| [`05-operations.md`](05-operations.md) | Compose และ operations |
| [`06-acceptance-and-decisions.md`](06-acceptance-and-decisions.md) | Acceptance criteria และ decisions |
| [`PROGRESS.md`](PROGRESS.md) | สถานะงานและ validation ที่ทำแล้ว |

## คำเตือน

- `.env` ใช้สำหรับ local development เท่านั้น ห้ามใส่ credentials จริงหรือ commit secret
- `docker compose down -v` และ `make db-reset` เป็นคำสั่งทำลายข้อมูลใน local database volume ใช้เฉพาะเมื่อต้องการลบข้อมูลทดสอบทั้งหมด ห้ามใช้กับ shared/production environment
- Authentication ปัจจุบันเป็น fixed development identity ไม่เหมาะกับ production
