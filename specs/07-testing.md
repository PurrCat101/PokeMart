# API Test Case Design Skill

## 1. Purpose

Design API test cases that provide evidence that:
1. The API supports the intended business flow from start to finish.
2. The API follows its agreed API specification and contract.
3. Every documented error code and validation rule has appropriate test coverage.
4. Requests and responses are checked precisely, including data types, values, structure, and side effects.
5. Test cases are traceable to requirements, API specification, and business agreements, and can later be automated.

This skill covers **test design**. Do not assume undocumented behavior or invent error codes. If the specification is incomplete or conflicts with business agreement, record the gap and ask the responsible team to clarify it.

## 2. Two primary test categories

### A. Business E2E Flow

Verify meaningful business journeys across one or more APIs, in the order a consumer or user would perform them.

Examples:
- Create an entity → retrieve it → update it → verify the updated state.
- Submit an order → confirm its status → cancel it → verify it can no longer proceed.
- Create a resource → perform an operation → verify the resulting state through a read API or other approved observable outcome.

For each flow, define:
- Business objective and preconditions.
- Initial data and required state.
- Ordered API calls, including dependencies between calls.
- Expected status code and response for each step.
- Expected state transitions and persisted data.
- Final-state checks, including relevant related resources.
- Cleanup or reset strategy.
- Negative business paths that are meaningful to the flow.

E2E cases should verify the business outcome, not merely that each request returns `2xx`. Where possible, verify the final state through an independent read API or approved database/observable mechanism. Do not use a database check as a substitute for an externally observable contract check when the API contract itself is under test.

### B. API Specification & Validation

Validate each endpoint against the approved API specification and agreed business rules, independently of the full business journey where practical.

Cover:
- HTTP method, path, path parameters, query parameters.
- Required and optional headers.
- Authentication and authorization where applicable.
- Request body schema, required fields, types, formats, enums, constraints, and cross-field rules.
- Response status code, headers, schema, exact values, and error payload.
- Every documented error code and its triggering condition.
- Validation boundaries and representative equivalence partitions.
- State-dependent errors, missing/nonexistent resources, and invalid transitions.
- Side effects: invalid requests should not create, update, or delete data unless the contract explicitly says otherwise.

## 3. Source-of-truth order and ambiguity handling

Use the following sources and record which version was used:
1. Approved API specification / OpenAPI contract.
2. Explicit business rules and decisions agreed with the team.
3. Requirement, acceptance criteria, and documented E2E flow.
4. Existing implementation or observed behavior, only as supporting evidence—not as the definition of correct behavior.

When sources conflict:
- Do not silently choose one.
- Record the conflicting statements and affected endpoint/cases.
- Ask the API owner / BA / PO / relevant stakeholder to resolve the expected behavior.
- Mark impacted cases as blocked or pending clarification until resolved.
- Do not treat current implementation behavior as correct merely because it currently behaves that way.

## 4. Required workflow

### Step 1 — Inventory endpoints

For each endpoint, record:
- Endpoint ID and name.
- Method and path.
- Purpose and business capability.
- API specification/version.
- Authentication requirements.
- Parameters and headers.
- Request schema.
- Success response(s).
- Documented error responses and error codes.
- Side effects and state dependencies.
- Related endpoints and E2E flows.

### Step 2 — Build a requirement-to-test traceability matrix

Create a row for every endpoint contract rule, business rule, and documented error code.

Suggested columns:

| Requirement / Spec item | Endpoint | Expected behavior / error code | Test case IDs | Coverage status | Notes / clarification |
|---|---|---|---|---|---|

Every documented error code must map to at least one test case that triggers the corresponding condition and verifies the exact expected error response. If one error code can be triggered by materially different conditions, consider a separate case for each condition. Do not count an error code as covered just because its name appears in a test title.

### Step 3 — Design happy paths first

Establish valid baseline requests and expected responses before creating negative tests. Reuse a known-good request as the control case, then change one input or condition at a time for validation tests where practical.

### Step 4 — Design business E2E flows

Map the business sequence, preconditions, state transitions, dependencies, and final-state assertions. Include relevant alternate paths such as cancellation, retry, duplicate submission, or invalid state transition when those behaviors are defined by requirements.

### Step 5 — Design validation cases per input location

Systematically review:
- Path parameters
- Query parameters
- Headers
- Request body
- Authentication / authorization
- Resource existence
- Current resource state
- Response body and headers
- Side effects and data persistence

### Step 6 — Apply EP and BVA

Use Equivalence Partitioning and Boundary Value Analysis for fields with validation rules. Select representative cases based on the contract, not arbitrary values. See Section 6.

### Step 7 — Verify exact response expectations

Define expected response status, headers when contractual, complete JSON structure, data types, values, and array cardinality/order where specified. Use exact equality rather than partial containment for contractual payloads. See Section 7.

### Step 8 — Review coverage and gaps

Before considering the design complete, run the completion checklist in Section 10. Report uncovered rules, undocumented behavior, blocked cases, and assumptions explicitly.

## 5. Validation test design matrix

For each endpoint, consider the following dimensions where applicable. Do not blindly generate irrelevant cases: first determine whether the dimension is supported by the contract.

### 5.1 Path parameters

- Valid existing identifier.
- Correctly formatted but nonexistent identifier.
- Invalid format (for example, letters where the contract requires a UUID or integer).
- Empty or missing path segment, if the route can represent it.
- Minimum/maximum length or numeric boundaries.
- Case sensitivity, whitespace, URL encoding, and reserved characters where relevant.
- Identifier belonging to another user/tenant, where authorization rules apply.

Distinguish **malformed identifier** from **well-formed but nonexistent identifier**; they may have different expected responses.

### 5.2 Query parameters

For every query parameter:
- Required parameter omitted.
- Optional parameter omitted; verify documented default behavior.
- Empty value (`?name=`).
- Whitespace-only value.
- Invalid type or format.
- Invalid enum value.
- Well-formed but nonexistent identifier/value.
- Minimum, maximum, just-below-minimum, and just-above-maximum.
- Repeated parameter, if clients can send it.
- Multiple parameters in invalid combinations.
- URL-encoded values and special characters where relevant.
- Pagination: page/offset/limit boundaries, zero, negative values, maximum allowed, beyond available records.
- Sorting/filtering: valid and invalid fields/directions, empty result, and combinations defined by the spec.

A missing parameter, an empty parameter, an invalidly formatted parameter, and a nonexistent value are distinct conditions. Do not combine them into one generic negative test when the API contract distinguishes them.

### 5.3 Headers

Check required and optional headers according to the contract:
- Required header omitted.
- Empty or whitespace-only value.
- Invalid format or unsupported value.
- Invalid content type.
- Unsupported `Accept` value, if negotiated by the API.
- Missing, malformed, expired, or invalid authentication credentials, where applicable.
- Correlation/request ID format if specified.
- Idempotency key missing, duplicated, reused with the same payload, and reused with a different payload, if supported.
- Conditional headers such as `If-Match` / `If-None-Match`, if supported.
- Case-insensitive header names and relevant value semantics.

Do not assume every header is mandatory. Expected behavior must come from the contract and agreed security rules.

### 5.4 Request body

For each property, inspect:
- Required vs optional.
- Missing property vs explicit `null`.
- Correct and incorrect data type.
- Empty string, whitespace-only string, and empty array/object.
- Valid and invalid format (date/time, email, UUID, etc.).
- Enum values: each important allowed value and representative disallowed value; exhaustively test all values when the set is small and behavior differs.
- Minimum/maximum length and values.
- Numeric precision, integer vs decimal, positive/zero/negative values as allowed by the contract.
- Array minimum/maximum item count, duplicate items, invalid item, and ordering where meaningful.
- Nested object validation and required nested fields.
- Unknown/additional properties according to the schema's policy.
- Cross-field constraints (for example, start date must precede end date).
- Business-rule conflicts, duplicates, and invalid state transitions.
- Payload that is syntactically invalid JSON, if the API contract defines how it is handled.
- Excessively large payload only when size limits and safe test boundaries are defined.

Test one invalid dimension at a time for clear diagnosis, then add selected combined-invalid cases to verify error precedence or aggregation when the contract defines it.

### 5.5 Resource existence and state

- Valid resource exists and is accessible.
- Well-formed ID does not exist.
- Resource exists but belongs to another tenant/user.
- Resource is deleted, inactive, expired, or otherwise unavailable.
- Operation attempted in an invalid state.
- Duplicate create or repeated operation.
- Concurrent or repeated requests when idempotency/state consistency is part of the requirement.

### 5.6 Response validation

For every documented success and error response, verify:
- Exact HTTP status code.
- Contractual response headers and content type.
- Full response body structure.
- Required and forbidden/absent properties.
- Exact values and JSON data types.
- `null` vs omitted property.
- Array size and ordering where specified.
- Error code and message fields as defined by the contract.
- No unexpected data leakage or sensitive fields.
- No unintended side effects for rejected requests.
- Data returned by subsequent read calls when persistence or state change is expected.

## 6. Equivalence Partitioning (EP) and Boundary Value Analysis (BVA)

### 6.1 Equivalence Partitioning

Divide input values into classes expected to behave similarly. Choose representative values from each relevant class.

Example: `limit` must be an integer from 1 to 100 inclusive.

| Partition | Representative value | Expected result |
|---|---:|---|
| Below minimum | 0 | Documented validation error |
| Valid range | 25 | Accepted |
| Above maximum | 101 | Documented validation error |
| Wrong type / format | `abc` | Documented validation error |
| Missing | omitted | Required/default behavior per spec |
| Decimal | 1.5 | Contract-defined behavior |

Do not assume invalid partitions all return the same error. Map each partition to the specific documented error response.

### 6.2 Boundary Value Analysis

For a numeric inclusive range `[min, max]`, consider:
- `min - 1`
- `min`
- `min + 1`
- A representative interior value
- `max - 1`
- `max`
- `max + 1`

For string length `[minLength, maxLength]`, test lengths around both boundaries. For arrays, test item counts around minimum and maximum. For dates, test just before, exactly at, and just after the allowed boundary using a fixed timezone and deterministic test clock where possible.

For a rule allowing 1–100:
- 0: below boundary
- 1: lower boundary
- 2: just inside lower boundary
- 99: just inside upper boundary
- 100: upper boundary
- 101: above boundary

Use applicable boundaries only. Do not create numeric BVA cases for a free-form field without defined limits. If the specification does not define a boundary but business behavior depends on one, raise a specification gap.

### 6.3 Combining EP and BVA

EP gives broad class coverage; BVA focuses on likely edge defects. Use both where the field has meaningful ranges. Add other techniques where useful:
- Decision tables for combinations of conditions.
- State transition testing for stateful APIs.
- Pairwise/combinatorial testing for many interacting inputs.
- Negative testing for malformed requests and forbidden operations.
- Idempotency and repeat-request tests where required.

Avoid a huge Cartesian product unless combinations themselves are part of the risk. Use risk-based selection and record the rationale.

## 7. Exact response matching policy

### 7.1 Default rule: exact contract matching

For contractual JSON payloads, **do not use partial `contain` assertions as the sole verification**. A test that only checks that expected fields exist can pass while the API returns incorrect extra fields, wrong values, wrong types, or unexpected array items.

The expected response should be compared against the actual response using deep equality for the scope defined by the contract. Verify:
- All expected keys and no unexpected keys when the schema/contract is closed.
- Exact values and data types.
- `null` vs absent properties.
- Complete arrays and exact item count.
- Array order when order is contractual; if order is explicitly unspecified, compare using a deliberate order-independent strategy while still checking exact membership and cardinality.
- Exact error code and contractual error body.
- No partial match in place of a full response assertion.

### 7.2 Be explicit about the comparison scope

- If the API contract defines the entire JSON body, compare the entire body exactly.
- If some fields are intentionally dynamic (for example, generated ID, timestamp, trace ID), use a narrowly defined expected-value strategy: validate the field's type/format/range and compare all stable fields exactly. Do not broadly ignore dynamic fields.
- If the spec allows additional properties, do not incorrectly reject permitted properties; validate according to the schema's explicit `additionalProperties` policy. Still assert all required fields and all values the test can determine.
- For nondeterministic fields, define a documented normalization or matcher for only those fields. Do not normalize away meaningful differences.
- For unordered collections, use a deterministic canonicalization or set/multiset comparison that still catches missing, extra, and duplicate items.

### 7.3 Exact match vs substring checks

Avoid patterns equivalent to:
- “Response contains `status: success`” as the only assertion.
- Checking only one expected property while ignoring the rest of the body.
- Checking only that an error message includes a phrase when the error code and full contractual payload are specified.

Prefer:
- Exact status code assertion.
- Deep equality for the complete deterministic body.
- Explicit assertions for dynamic fields plus exact equality for the remaining stable structure.
- Exact array count and contents according to the contract.

Exactness is about the API contract, not blindly comparing volatile metadata or fields the spec explicitly leaves open. Document every exception.

## 8. Error-code completeness

Create an **Error Code Coverage Matrix** from the API spec. Include every documented error response, including common HTTP errors and endpoint-specific business errors.

| Endpoint | Triggering condition | HTTP status | Error code | Expected error body | Test case ID | Status |
|---|---|---:|---|---|---|---|
| `METHOD /path` | Missing required query | From spec | Exact code from spec | Exact contractual payload | `API-VAL-001` | Covered / Gap |
| `METHOD /path` | Invalid format | From spec | Exact code from spec | Exact contractual payload | `API-VAL-002` | Covered / Gap |
| `METHOD /path` | Resource does not exist | From spec | Exact code from spec | Exact contractual payload | `API-VAL-003` | Covered / Gap |

Rules:
1. Extract codes from the actual spec; never invent example codes as real requirements.
2. Test the triggering condition, status code, exact error code, and full contractual response body.
3. If multiple conditions map to one code, cover each materially distinct condition or document why one test is sufficient.
4. If a code is documented but no input/state can be identified to trigger it, flag it as a spec/testability gap.
5. If observed behavior returns an undocumented code, record a contract discrepancy rather than silently updating expected results.
6. Check that invalid requests do not cause unintended state changes.
7. Review the matrix endpoint by endpoint; a global list of error codes alone is not sufficient.

## 9. Test case format

Use a consistent, automation-ready structure.

| Field | Description |
|---|---|
| Test Case ID | Unique stable identifier |
| Category | Business E2E / API Validation / Contract / Security / State |
| Requirement / Spec reference | Exact requirement, endpoint, schema rule, or error code |
| Title | Clear condition and expected behavior |
| Priority / Risk | Based on business impact and likelihood |
| Preconditions | Required data, state, auth, configuration |
| Request | Method, URL/path, headers, query, body |
| Test data | Exact values and why they represent the partition/boundary |
| Steps | Ordered actions; for E2E include each API call |
| Expected status | Exact HTTP status |
| Expected headers | Contractual values |
| Expected response body | Full expected body or precisely defined dynamic-field strategy |
| Side-effect assertion | Expected persisted state / no mutation |
| Cleanup | Reset/delete strategy |
| Traceability | Spec rule, error code, business requirement |
| Automation notes | Data setup, dynamic values, dependencies |
| Result | Pass / Fail / Blocked / Not Run |

### Test case title pattern

Prefer condition + action + expected behavior.

Examples:
- `GET /items — omit required query parameter — returns the documented missing-parameter error`
- `GET /items/{id} — use a well-formed nonexistent ID — returns the documented not-found response`
- `POST /orders — send quantity at the minimum boundary — accepts the request and returns the exact expected response`
- `Order flow — create then cancel an eligible order — final state is cancelled and cannot be processed further`

These are illustrative titles only. Actual expected statuses and error codes must come from the real API specification.

## 10. Completion checklist

### Business E2E
- [ ] Every agreed critical business flow is represented.
- [ ] Preconditions and test data are explicit and reproducible.
- [ ] Each step's request and response expectations are defined.
- [ ] State transitions and final business outcomes are verified.
- [ ] Relevant alternate and negative flows are covered.
- [ ] Side effects and cleanup are considered.

### API specification and validation
- [ ] Every endpoint, method, and parameter has been reviewed.
- [ ] Required/optional query and path parameters are covered.
- [ ] Required/optional headers are covered.
- [ ] Request-body properties, types, formats, constraints, and cross-field rules are covered.
- [ ] EP partitions are defined for applicable fields.
- [ ] BVA cases cover applicable lower and upper boundaries.
- [ ] Missing, empty, malformed, and nonexistent values are distinguished where relevant.
- [ ] Authentication, authorization, resource existence, and state rules are covered where applicable.
- [ ] Every documented error code maps to at least one meaningful triggering test.
- [ ] Error-code coverage has been reviewed for every endpoint.
- [ ] Success and error response status codes, headers, and bodies are checked.
- [ ] Exact equality is used for deterministic contractual response bodies; partial containment is not the only assertion.
- [ ] Dynamic fields and permitted additional properties have narrowly documented handling.
- [ ] Rejected requests are checked for unintended side effects.
- [ ] Undocumented behavior and specification gaps are logged rather than guessed.

### Quality and maintainability
- [ ] Test data is deterministic and resettable.
- [ ] Real-system suites establish the configured baseline for mutable test resources before running; reset only dedicated test data, not shared or production data.
- [ ] Cases are independent where possible and do not rely on execution order unless they are explicitly E2E.
- [ ] Each failure identifies the endpoint, input, expected behavior, and actual behavior.
- [ ] Cases are traceable to requirements and spec versions.
- [ ] Risk-based exclusions are documented.
- [ ] Test design has been reviewed with relevant API/business stakeholders.

## 11. Output expected when using this skill

When asked to design API test cases from an API spec, produce:
1. **Endpoint inventory** with methods, parameters, request/response schemas, and error responses.
2. **Business E2E flow list** with ordered API calls and final-state assertions.
3. **Validation matrix** grouped by path parameters, query parameters, headers, request body, resource/state rules, and response.
4. **EP/BVA table** for each applicable constrained field.
5. **Error Code Coverage Matrix** containing every documented error code and the test case that triggers it.
6. **Detailed test cases** using the structure in Section 9.
7. **Traceability and coverage summary**, including uncovered items, assumptions, blockers, and spec gaps.

Do not claim 100% coverage unless the inventory and traceability matrix demonstrate that every in-scope endpoint rule and documented error code has been accounted for. Distinguish design coverage from executed test coverage.

## 12. Final principles

- Test expected behavior from the contract, not assumptions or current implementation quirks.
- Separate business E2E flows from endpoint-level validation, then connect them through traceability.
- Treat every documented error code as an explicit coverage obligation.
- Use EP to represent input classes and BVA to probe boundaries.
- Distinguish missing, empty, malformed, invalid, and nonexistent inputs.
- Assert complete responses exactly within the contract's defined scope; never rely only on `contain`.
- Verify state changes and absence of unintended side effects.
- Make uncertainty visible and resolve it with the responsible team.
- Prefer clear, reproducible, maintainable test cases over large numbers of redundant cases.