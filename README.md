# PokéMart API Automation Lab

โปรเจ็กต์สำหรับฝึก API testing ด้วย Playwright และ TypeScript ประกอบด้วย public BFF, internal PokéMart API, MySQL, WireMock และ OpenAPI/Swagger UI ข้อมูล Pokémon แบบ static ช่วยให้เริ่มระบบและทดสอบซ้ำได้โดยไม่ต้องเรียก PokéAPI ทุกครั้ง

## สถาปัตยกรรม

```text
Playwright ──> BFF (public API) ──> PokéMart API (internal service) ──> MySQL
     └───────> WireMock (จำลอง BFF สำหรับ contract tests)
```

| Service | URL เมื่อรัน local | หน้าที่ |
|---|---|---|
| BFF | `http://localhost:3001` | Public API สำหรับ client และแปลง response เป็น DTO ฝั่ง public |
| PokéMart API | `http://localhost:3000` | Internal service สำหรับ business rules และการเข้าถึงข้อมูล |
| WireMock | `http://localhost:8080` | จำลอง public API สำหรับ contract tests |
| Swagger UI | `http://localhost:8081` | เลือกดู BFF OpenAPI หรือ internal API OpenAPI |
| MySQL | `localhost:3306` | เก็บ catalog, wallet, inventory และ purchase history |

## สิ่งที่ต้องติดตั้งก่อน

1. **Docker Desktop** พร้อม Docker Compose v2 ใช้รัน MySQL และ service containers
2. **Node.js 22 LTS และ npm** ใช้ติดตั้ง Playwright และรัน test scripts
3. **GNU Make** ใช้เรียกคำสั่งมาตรฐานของโปรเจ็กต์จาก Makefile
4. **Git** หากต้อง clone repository

ตรวจสอบว่าติดตั้งและเปิดใช้งานแล้ว:

```bash
node --version
npm --version
docker --version
docker compose version
make --version
```

บน Windows ให้เปิด Docker Desktop ก่อนใช้คำสั่ง Docker วิธีที่แนะนำสำหรับ Makefile นี้คือใช้ **MSYS2 UCRT64**:

1. ติดตั้ง MSYS2 จากเว็บไซต์ทางการ และเปิด terminal ชื่อ **MSYS2 UCRT64**
2. ติดตั้ง GNU Make ใน terminal:

   ```bash
   pacman -S --needed make
   ```

3. ติดตั้ง Node.js 22 LTS บน Windows และตรวจว่า `node`/`npm` ใช้ได้จาก MSYS2 UCRT64 ด้วย
4. ตรวจว่า `docker compose version` และ `make --version` ใช้ได้จาก terminal เดียวกัน
5. เปิด terminal ที่ root ของโปรเจ็กต์ ซึ่งเป็นโฟลเดอร์เดียวกับ `Makefile`

อีกทางเลือกคือใช้ WSL2 ติดตั้ง Make/Node ภายใน distro และเปิด Docker Desktop WSL integration ก่อนรันคำสั่ง การติดตั้ง Node บน Windows อย่างเดียวไม่ได้ทำให้ Node ใช้ได้จาก WSL โดยอัตโนมัติ

## ติดตั้งและเริ่มระบบครั้งแรก

ขั้นตอน copy `.env` ใช้ PowerShell ส่วนคำสั่ง `make` ให้รันจาก MSYS2 UCRT64 หรือ WSL terminal ที่เตรียมไว้:

### 1. ตั้งค่า environment สำหรับ Docker Compose

```powershell
Copy-Item .env.example .env
```

เปิด `.env` แล้วตรวจค่า ports และ credentials สำหรับ local development ค่าในไฟล์ตัวอย่างเป็นค่าท้องถิ่น ไม่ควรนำไปใช้กับ shared หรือ production environment ไฟล์ `tests/configs/.env.test` ตั้ง `MYSQL_PORT=3307` ไว้ หากต้องการรัน purchase/E2E tests ให้ตั้ง `MYSQL_HOST_PORT=3307` ใน `.env` ให้ตรงกัน หรือแก้ `MYSQL_PORT` ใน test config ให้ตรงกับ host port ที่เลือก

> อย่า commit `.env` หรือ credentials จริง

### 2. ติดตั้ง Node.js dependencies

```bash
make install
```

คำสั่งนี้เรียก `npm ci` ที่ root เพื่อใช้ dependency versions จาก `package-lock.json` ซึ่งรวม Playwright Test สำหรับ API automation ไว้แล้ว เทสปัจจุบันใช้ `APIRequestContext` จึงไม่ต้องติดตั้ง browser binaries ด้วย `npx playwright install`

### 3. Build และ start services

```bash
make build
make up
```

- `make build` compile BFF และ PokéMart API ด้วย TypeScript
- `make up` build container images, start Docker Compose stack แบบ background และตรวจ readiness ของ BFF
- MySQL จะสร้าง schema และ seed data เมื่อเริ่มด้วย volume ใหม่

ตรวจสถานะและ readiness:

```bash
make ps
curl.exe -fsS http://localhost:3001/health
curl.exe -fsS http://localhost:3001/ready
curl.exe -fsS http://localhost:3000/ready
```

ถ้าคำสั่ง readiness ยังไม่ผ่าน ให้ตรวจ `make ps` และ `make logs` ก่อนรัน tests

### 4. เปิด Swagger UI

```bash
make swagger
```

เปิด URL ที่แสดง (`http://localhost:8081`) แล้วเลือก **BFF Public API** หรือ **PokéMart Internal API** จากรายการสเปก

## รันทดสอบด้วย Make

การทดสอบหลักให้เรียกผ่าน Makefile:

| คำสั่ง | ใช้ทำอะไร | ต้อง start Compose |
|---|---|---|
| `make test-mocked` | รัน WireMock scenarios และตรวจ mock error-code mappings | ใช่ (WireMock) |
| `make test-api` | รัน API validation กับ BFF จริง | ใช่ |
| `make test-pokeapi` | รัน API tests ตรงกับ internal PokéMart API แยกตาม endpoint | ใช่ |
| `make test-purchase-retry` | ตรวจ retry ด้วย `purchaseId` เดิมและ duplicate หลัง commit | ใช่; เชื่อม MySQL เพื่อ snapshot/restore test state |
| `make test-e2e` | รัน real-system journeys และตรวจ persistent state | ใช่ |
| `make test` | รันทุก Playwright project: WireMock, BFF API, internal PokéMart API และ E2E | ใช่ |

ตัวอย่างลำดับรันตามปกติ:

```bash
make test-mocked
make test-api
make test-pokeapi
make test-purchase-retry
make test-e2e
```

หรือรันทั้งหมดครั้งเดียว:

```bash
make test
```

Playwright สร้าง HTML report ไว้ที่ `tests/playwright-report` หลังรันทดสอบ เปิดดูได้ด้วย:

```bash
npm run test:report
```

ทุก suite แยก test files ตาม target และ endpoint: `tests/testCases/mocked-bff/` สำหรับ WireMock, `pokemon/` และ `purchases/` สำหรับ public BFF, `PokeAPI/<endpoint>/` สำหรับ internal PokéMart API โดยตรง และ `e2e/` สำหรับ journeys ผ่าน BFF ผลจาก WireMock ยืนยันเฉพาะ contract ของ mapping ไม่ได้ยืนยัน business logic หรือ persistence ของระบบจริง ส่วน `PokeAPI` ตรวจ internal DTO/error behavior โดยไม่ใช้ BFF.

ดู targets ทั้งหมดได้ด้วย:

```bash
make help
```

## เลือก environment ของ test

`TEST_ENV` ใช้เลือก URLs และ test data โดยไม่เปลี่ยน test case ค่าเริ่มต้นคือ `test` และโหลดจาก `tests/configs/.env.test`; ตัวเลือกอื่นที่เตรียมไว้คือ `sit` และ `stg`:

```bash
export TEST_ENV=test
make test
```

หรือเลือก SIT:

```bash
export TEST_ENV=sit
make test-api
```

ใน PowerShell ที่ติดตั้ง GNU Make และ shell ที่ Makefile ต้องใช้แล้ว สามารถเลือก environment ด้วย `$env:TEST_ENV='sit'; make test-api` ได้เช่นกัน

กำหนดค่า SIT/STG จริงใน `tests/configs/.env.sit` หรือ `.env.stg` ก่อนใช้งาน ไฟล์ตัวอย่างมี URL placeholder และห้ามใส่ credentials จริงลงใน Git การทดสอบ `test-pokeapi`, `purchase-retry` และ `e2e` เปลี่ยนข้อมูล wallet, stock, inventory และสร้าง/ลบ purchase เพื่อยืนยันพฤติกรรม ดังนั้นต้องใช้ user และ MySQL database ที่แยกไว้สำหรับ test โดยเฉพาะ ห้ามชี้ไปยัง production หรือข้อมูล shared ที่ไม่อนุญาตให้แก้ไข ใน environment ที่ไม่ใช่ `test` การเชื่อมต่อฐานข้อมูลจะ fail หากไม่ได้กำหนด `MYSQL_HOST`, `MYSQL_DATABASE`, `MYSQL_USER` และ `MYSQL_PASSWORD` ไว้ชัดเจน

`MYSQL_HOST_PORT` ใน `.env` คือ port ที่ Docker เปิดบน host ส่วน `MYSQL_PORT` ในไฟล์ `tests/configs/.env.*` คือ port ที่ test runner ใช้เชื่อมต่อจาก host ทั้งสองค่าต้องตรงกัน เช่น `MYSQL_HOST_PORT=3307` ต้องคู่กับ `MYSQL_PORT=3307`

## Build, stop และจัดการฐานข้อมูล

```bash
make build
make ps
make logs
make down
```

- `make logs` แสดง logs ต่อเนื่อง กด `Ctrl+C` เพื่อหยุดการติดตาม logs (ไม่ได้หยุด containers)
- `make down` หยุด containers โดยไม่ลบ database volume
- `make db-seed` ตรวจจำนวน catalog records ใน local database
- `make db-reset` **ลบ Compose volumes และข้อมูล local ทั้งหมด** แล้วเริ่ม MySQL ใหม่ให้สร้าง schema/seed ตั้งต้น ห้ามใช้กับ SIT, shared หรือ production data

## Purchase request และ retry

Client สร้าง UUID `purchaseId` ก่อนเริ่มซื้อ และส่ง ID นี้ใน JSON body ไม่ใช้ `Idempotency-Key` header:

```json
{
  "purchaseId": "00000000-0000-4000-8000-000000000001",
  "pokemonId": 1,
  "quantity": 1
}
```

- ใช้ `purchaseId` เดิมเมื่อต้อง retry purchase รายการเดิม
- หาก request ล้มเหลวก่อน transaction commit จะไม่มีการจอง ID และ retry ด้วย ID เดิมได้
- หาก purchase commit แล้ว การส่ง ID เดิมอีกครั้งจะได้ `409 PURCHASE_DUPLICATE` โดยไม่หัก wallet หรือ stock ซ้ำ
- หากไม่แน่ใจว่าคำขอ commit แล้วหรือไม่ ให้ตรวจ `GET /api/purchases/{purchaseId}` ก่อน retry

## ฐานข้อมูลและ Pokémon seed

ฐานข้อมูลใช้ SQL ใน `database/schema/` และ `database/seed/`; การ initialize อัตโนมัติทำงานเมื่อสร้าง MySQL volume ใหม่เท่านั้น Seed ปัจจุบันมี Pokémon Generation I 151 ตัวจาก PokeAPI v2 พร้อมราคาและ stock จำลองของ PokéMart

ราคา derive จาก base experience ปัดทีละ 50 และจำกัดช่วง 200–1500 ส่วน stock ลดลงตาม experience tier และมี variation แบบ deterministic จาก Pokémon ID ทำให้ seed ซ้ำได้ผลเดิม Runtime และ tests ไม่เรียก PokéAPI ดูรายละเอียดที่ [database/README.md](database/README.md) และข้อมูลใน [database/seed/001_seed_shop_data.sql](database/seed/001_seed_shop_data.sql)

ที่มาข้อมูล: [PokeAPI REST API](https://pokeapi.co/) โปรดตรวจสอบ license/attribution ก่อนนำ snapshot ไปเผยแพร่ต่อ

## API specifications และเอกสาร

- Public BFF OpenAPI: [specs/openapi.yaml](specs/openapi.yaml)
- Internal PokéMart API OpenAPI: [specs/pokemart-openapi.yaml](specs/pokemart-openapi.yaml)
- API behavior และ error contracts: [specs/03-api-contract.md](specs/03-api-contract.md)
- Testing approach: [specs/04-testing.md](specs/04-testing.md)
- Public/internal API test design, traceability และ coverage gaps: [specs/08-test-design.md](specs/08-test-design.md)
- Database, seed และ migration: [database/README.md](database/README.md)
- โครงสร้าง Playwright: [Playwright structure.md](Playwright%20structure.md)
