# PokéMart API Automation Lab

โปรเจ็กต์ตัวอย่างสำหรับฝึก API testing ด้วย Playwright และ TypeScript ประกอบด้วย public BFF, internal PokéMart API, MySQL, WireMock และ OpenAPI/Swagger UI ใช้ข้อมูล Pokémon แบบ static 151 ตัวจาก PokeAPI เพื่อให้เริ่มระบบและทดสอบซ้ำได้โดยไม่ต้องเรียก API ภายนอก

## สถาปัตยกรรม

```text
Playwright ──> BFF (public API) ──> PokéMart API (internal service) ──> MySQL
     └───────> WireMock (จำลอง BFF สำหรับ contract tests)
```

- BFF เปิด public API ที่ `http://localhost:3001` และเป็นผู้แปลง response เป็น DTO สำหรับ client
- PokéMart API เปิด internal API ที่ `http://localhost:3000`; business routes อยู่ใต้ `/pokemart/v2`
- Swagger UI อยู่ที่ `http://localhost:8081` และเลือกดู BFF หรือ internal API ได้
- WireMock อยู่ที่ `http://localhost:8080` สำหรับ contract tests เท่านั้น

## เริ่มใช้งาน (Windows PowerShell)

```powershell
Copy-Item .env.example .env
npm install
docker compose up -d --build
docker compose ps
Invoke-RestMethod http://localhost:3001/ready
```

ใช้ `docker compose down` เพื่อหยุดระบบโดยเก็บข้อมูลไว้ การลบฐานข้อมูล local ทั้งหมดทำได้ด้วย `docker compose down -v` หรือ `make db-reset` ซึ่งเป็นคำสั่ง destructive และห้ามใช้กับข้อมูล shared/production

MySQL volume รุ่นเก่าต้องทำ migration ตามลำดับที่ระบุไว้ใน [database/README.md](database/README.md); volume ใหม่สร้าง schema ปัจจุบันให้อัตโนมัติ

## Purchase request และ retry

Client สร้าง UUID สำหรับ `purchaseId` ก่อนเริ่มซื้อ และส่ง ID นี้ใน JSON body โดยไม่ใช้ `Idempotency-Key` header:

```json
{
  "purchaseId": "00000000-0000-4000-8000-000000000001",
  "pokemonId": 1,
  "quantity": 1
}
```

- ใช้ `purchaseId` เดิมเมื่อ retry รายการซื้อเดิมเท่านั้น
- ถ้าคำขอล้มเหลวก่อน transaction commit จะไม่มีการจอง ID และ retry ด้วย ID เดิมได้
- ถ้ารายการซื้อถูก commit แล้ว การส่ง ID เดิมอีกครั้งจะได้ `409 PURCHASE_DUPLICATE` และไม่มีการหัก wallet/stock ซ้ำ
- เมื่อไม่แน่ใจว่าคำขอ commit แล้วหรือไม่ ให้ตรวจ `GET /api/purchases/{purchaseId}` ก่อน retry

## Build และทดสอบ

```powershell
npm run build
npm test
npm run test:mocked
npm run test:api
npm run test:purchase-retry
npm run test:e2e
```

`test:purchase-retry` และ `test:e2e` ใช้ BFF, PokéMart API และ MySQL จริง จึงต้อง start Compose ก่อน ส่วน `test:mocked` ใช้ WireMock ตรวจ public contract

## Swagger และเอกสาร

- BFF OpenAPI: [specs/openapi.yaml](specs/openapi.yaml)
- Internal API OpenAPI: [specs/pokemart-openapi.yaml](specs/pokemart-openapi.yaml)
- วิธีใช้และภาพรวม technical: [specs/00-readme.md](specs/00-readme.md)
- API behavior: [specs/03-api-contract.md](specs/03-api-contract.md)
- Database/seed: [database/README.md](database/README.md)
- Test approach: [specs/04-testing.md](specs/04-testing.md)

รายละเอียดการเริ่มระบบ, Swagger, identity `userId`, Pokémon seed policy, WireMock และ migration อยู่ในเอกสารข้างต้น
