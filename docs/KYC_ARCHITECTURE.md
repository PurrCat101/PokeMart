# KYC Tier System Architecture

## Overview

The PokéMart Lab implements a **three-tier Know-Your-Customer (KYC) verification system** to gate access to products based on verification level:

- **Level 0 (Unverified):** Cannot purchase any Pokémon or items requiring verification
- **Level 1 (Basic):** Can purchase ordinary Pokémon and standard items
- **Level 2 (Full):** Can purchase premium "Master" tier items

Additionally, accounts under review (**PENDING_REVIEW status**) cannot purchase anything, regardless of level.

---

## Architecture Components

### 1. KYC Service (Standalone)
**Location:** `apps/kyc-api/src/index.ts`

- **Responsibility:** Own data store for KYC status/records
- **Data:** `{ level: 0|1|2, status: ACTIVE|PENDING_REVIEW|REJECTED, submission: {...} }`
- **API Key:** Protected by Bearer token (`KYC_API_KEY`)
- **Port:** 4005 (default)

**Key Operations:**
- `GET /kyc/v1/users/{userId}` → Fetch KYC status
- `POST /kyc/v1/users/{userId}/submissions` → Submit verification
- `PUT /__test/users/{userId}` → Test-only: Set KYC level directly

**Never Shares:** KYC data is NOT stored in the PokéMart database

---

### 2. PokéMart API (Backend)
**Location:** `apps/pokemart-api/src/index.ts`

- **Responsibility:** Enforce KYC checks at transaction time
- **Entry Points:** `/pokemart/v1/purchases` and `/pokemart/v1/items/purchases`

#### Key Functions

##### `prefetchKyc(listingSql, listingId, userId)`
```typescript
async function prefetchKyc(
  listingSql: string,
  listingId: number,
  userId: string
): Promise<() => Kyc | null>
```

- **When:** Called **before** opening database transaction
- **Why:** Isolate KYC network call outside the transaction (prevents locks)
- **Returns:** A function that returns the cached KYC status
- **Fails:** Defers error for level 1+ items; returns `null` for level 0 items if service down

**Timeline:**
```
T0: prefetchKyc() called → HTTP to KYC service
T1: Connection acquired (createConnection)
T2: Transaction begins (beginTransaction)
T3: assertKyc() called with cached result ← INSIDE transaction
T4: Commit or rollback
```

##### `assertKyc(kyc, required, label)`
```typescript
function assertKyc(kyc: Kyc | null, required: number, label: string)
```

- **When:** Inside database transaction, after listing lookup
- **Checks:**
  1. If `status === PENDING_REVIEW` → **403 KYC_PENDING_REVIEW** (overrides all)
  2. If `required === 0` → **Allow** (no verification needed)
  3. If `kyc === null` AND `required > 0` → **503 DEPENDENCY_UNAVAILABLE** (fail closed)
  4. If `kyc.status !== ACTIVE` OR `kyc.level < required` → **403 KYC_LEVEL_REQUIRED**

**Example Flow for Level-1 Item:**
```
User Level 0 tries to buy level-1 item:
  ✗ kyc.status = ACTIVE (not pending)
  ✗ required = 1 (not 0)
  ✗ kyc.level (0) < required (1)
  → Throw KYC_LEVEL_REQUIRED
```

---

### 3. BFF (Frontend Backend for Frontend)
**Location:** `apps/bff/src/index.ts`

- **Responsibility:** Relay requests to PokéMart API (no additional KYC logic)
- **Port:** 4001 (default)

**Note:** BFF does **NOT** validate KYC. It only relays error codes from PokéMart.

---

### 4. Web Frontend (React)
**Location:** `apps/web/src/app/page.tsx`

- **Responsibility:** UI-level gating and user feedback
- **NOT for security**—backend is the security boundary

#### UI Checks

**A. Checkout Modal** (`CheckoutModal.tsx:37`)
```typescript
const cannotPay = 
  remainingBalance < 0 ||           // Insufficient funds
  blockedLines.length > 0 ||         // KYC requirement not met
  isPendingReview;                   // Status under review
// → Disable "Pay" button
```

**B. KYC Prompt** (`page.tsx:468-469`)
```typescript
const needsVerificationPrompt =
  !!user &&
  kyc?.status === 'ACTIVE' &&
  kyc.level === 0 &&
  kycPromptDismissedFor !== user.userId &&
  !isVerifying &&
  !isLoginOpen &&
  checkoutLines === null;
```

**C. KYC Banner** (`KycBanner.tsx`)
```
PENDING_REVIEW: "Verification under review"
REJECTED: "Verification was declined — Send again"
```

---

## Enforcement Chain

```
┌─────────────────────────────────────────────────────────┐
│ User clicks "Pay" in CheckoutModal                      │
└────────────────┬────────────────────────────────────────┘
                 │
         ┌───────▼─────────┐
         │ Frontend Checks │ ← Can be bypassed
         │ (UI-only)       │
         └───────┬─────────┘
                 │ (HTTP POST)
         ┌───────▼──────────────┐
         │ BFF Relays Request   │ ← Passes through unchanged
         │ /api/purchases       │
         └───────┬──────────────┘
                 │ (HTTP POST)
         ┌───────▼────────────────────┐
         │ PokéMart API               │
         │ POST /purchases            │
         └───────┬────────────────────┘
                 │
         ┌───────▼─────────────┐
         │ prefetchKyc()       │ ← Network call to KYC service
         │ (OUTSIDE txn)       │   Caches result
         └───────┬─────────────┘
                 │
         ┌───────▼──────────────────┐
         │ BEGIN TRANSACTION         │ ← Database lock acquired
         │ - Get listing (FOR UPDATE)│
         │ - Check PURCHASE_DUPLICATE│
         │ - Check POKEMON_NOT_FOUND │
         │ - Check POKEMON_NOT_FOR_SALE
         └───────┬──────────────────┘
                 │
         ┌───────▼──────────────────┐
         │ ★ assertKyc() ★          │ ← SECURITY CHECK
         │ (INSIDE txn, critical!)  │   Last line of defense
         └───────┬──────────────────┘
                 │ Success: stock + funds ok?
         ┌───────▼──────────────────┐
         │ INSERT purchases         │
         │ UPDATE user_wallet       │
         │ UPDATE user_inventory    │
         │ COMMIT                   │
         └───────────────────────────┘
                 │
         ┌───────▼──────────────────┐
         │ HTTP 201 Created         │ ← Success or
         │ or HTTP 403 Forbidden    │   403/422/409 error
         └───────────────────────────┘
```

---

## Security Guarantee

**Frontend checks are cosmetic.** A user can bypass the UI by:

```bash
# Direct API call (no frontend validation)
curl -X POST https://bff.api/api/purchases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purchaseId": "'$(uuidgen)'",
    "pokemonId": 1,
    "quantity": 1
  }'
```

**But the backend will reject it** because `assertKyc()` runs inside the transaction:

```
Response: 403 Forbidden
{
  "error": {
    "code": "KYC_LEVEL_REQUIRED",
    "message": "This Pokémon requires a higher verification level",
    "details": [{ "required": 1, "current": 0 }]
  }
}
```

---

## Purchase Gating Matrix

| User Level | Status | Can Buy Level-0 Item? | Can Buy Level-1 Item? | Can Buy Level-2 Item? |
|---|---|---|---|---|
| 0 | ACTIVE | ❌ No | ❌ No | ❌ No |
| 1 | ACTIVE | ❌ No | ✅ Yes | ❌ No |
| 2 | ACTIVE | ❌ No | ✅ Yes | ✅ Yes |
| 0 | PENDING_REVIEW | ❌ No | ❌ No | ❌ No |
| 1 | PENDING_REVIEW | ❌ No | ❌ No | ❌ No |
| 2 | PENDING_REVIEW | ❌ No | ❌ No | ❌ No |
| 0 | REJECTED | ❌ No | ❌ No | ❌ No |

**Note:** PENDING_REVIEW **overrides** all levels. No purchases allowed until approved or rejected.

---

## Test Coverage Map

### ✅ Fully Covered

| Scenario | Test(s) | Location |
|----------|---------|----------|
| Level 0 cannot buy level-1 item | KYC-BUY-001 | `kyc/purchase-gating.spec.ts` |
| Level 1 can buy level-1 item | KYC-BUY-003 | `kyc/purchase-gating.spec.ts` |
| Level 1 cannot buy level-2 item | KYC-BUY-005 | `kyc/purchase-gating.spec.ts` |
| Level 2 can buy level-2 item | KYC-BUY-006 | `kyc/purchase-gating.spec.ts` |
| PENDING_REVIEW blocks level-1 user | KYC-BUY-009 | `kyc/purchase-gating.spec.ts` |
| REJECTED reads as level-0 | KYC-BUY-010 | `kyc/purchase-gating.spec.ts` |
| KYC service timeout (level 0) | Various | `kyc/outage.spec.ts` |
| KYC service timeout (level 1+) | Various | `kyc/outage.spec.ts` |
| UI prompt shown for unverified | KYC-UI-001 | `ui-kyc/verification.spec.ts` |
| UI form validation | KYC-UI-003 | `ui-kyc/verification.spec.ts` |
| Cannot buy while under review | KYC-UI-004 | `ui-kyc/verification.spec.ts` |

### 🟡 Partially Covered

| Scenario | Notes | Location |
|----------|-------|----------|
| JWT signature validation | Implicit only | Should add explicit test |
| Expired token rejection | Implicit only | TOKEN-002 test added |
| Concurrent purchases | No tests | RACE-001 to RACE-005 added |
| Stock underflow | No tests | RACE-003 test added |
| Wallet double-spend | No tests | RACE-002 test added |

### ❌ Not Covered (Recommendations)

| Scenario | Reason | Importance |
|----------|--------|-----------|
| Token tampering | Edge case | Medium |
| Token reuse post-logout | JWT limitation | High |
| KYC cache invalidation | Race condition | Low |

---

## Fail-Safe Behavior

### When KYC Service is Down

**For Level-0 Items (No Verification Required):**
```typescript
// prefetchKyc returns () => null on error
assertKyc(null, 0, 'item');  // Passes (because required === 0)
// → Purchase allowed, service down doesn't block
```

**Rationale:** Level-0 items have no KYC requirement, so downtime shouldn't block them.

**For Level-1+ Items (Verification Required):**
```typescript
// prefetchKyc throws on error for required > 0
throw new AppError(503, 'DEPENDENCY_UNAVAILABLE', 'KYC service is temporarily unavailable');
// → Purchase rejected, fails closed
```

**Rationale:** Can't verify level, so assume unverified (fail closed).

---

## Configuration

### Environment Variables

| Variable | Default | Used By | Purpose |
|----------|---------|---------|---------|
| `KYC_BASE_URL` | `http://localhost:4005` | pokemart-api | KYC service location |
| `KYC_API_KEY` | `local-only-kyc-key` | kyc-api, pokemart-api | Bearer token for KYC service |
| `KYC_REQUEST_TIMEOUT_MS` | `2000` | pokemart-api | Max wait for KYC response |
| `KYC_TIMEOUT_HOLD_MS` | `6000` | kyc-api | Test fault injection delay |

### Database Schema

**listings** (Pokémon and item rows)
```sql
required_kyc_level INT (0, 1, or 2)
```

---

## Adding a New KYC Tier

To add a level 3 (Premium):

1. **KYC API:** Update `Type Level = 0 | 1 | 2 | 3` (line 6)
2. **PokéMart API:** Same update to type
3. **Database:** Add items with `required_kyc_level = 3`
4. **Tests:** Add KYC-BUY-* test for level-3 purchase
5. **Frontend:** Add tier name to `VERIFICATION_NAMES` (cart.ts:75)

No other changes needed—logic is generic on the `required` integer.

---

## Common Patterns

### Pattern A: Level-Based Gating (Current)

```typescript
const required = listing.required_kyc_level;
assertKyc(kyc, required, 'item');
// User must be >= required level
```

### Pattern B: Feature Flags (Alternative)

```typescript
if (feature.isEnabled('premium-items-v2') && !kyc?.isPremium) {
  throw new Error('Feature not enabled for your account');
}
```

**Why we don't use this:** Adds conditional logic per feature. Level-based is cleaner.

---

## Incidents & Mitigations

### Incident 1: Listing Misconfiguration

**Scenario:** A level-2 item is saved with `required_kyc_level = 0` by mistake.

**Impact:** Anyone can buy it, including level-0 users.

**Mitigation:** 
- Schema validation at API layer
- Integration tests verify listing requirements match intended tier

### Incident 2: KYC Service Split-Brain

**Scenario:** Two KYC service instances with different user records.

**Impact:** User level differs per request.

**Mitigation:**
- KYC service is stateless query, not write-through cache
- External reviewer tool (not shown) owns the truth
- Single instance or database-backed cache

### Incident 3: Token Tampering

**Scenario:** Attacker modifies JWT payload to change `sub` (user ID).

**Impact:** Would allow impersonation if signature validation fails.

**Mitigation:**
- HMAC signature validation (line 124, pokemart-api)
- JWT must be signed with server secret, cannot be forged client-side

---

## Related Docs

- [Security Assessment](../KYC_PRIVILEGE_ESCALATION_QA_ASSESSMENT.md)
- [API Specification](../../specs/openapi.yaml)
- [Test Cases](../../tests/testCases/kyc/)

