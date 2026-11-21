# Pre-Submit Reservation Security Specification

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Author:** Claude Code
- **Related:** `enhancedStellarProvider.ts`, `001-add-mint-operation-key.sql`

## Problem

The pre-submit reservation mechanism introduces a new state (RESERVED) and new database operations. These must be analyzed for security implications including: denial-of-service via reservation flooding, information leakage through error messages, and privilege escalation through reservation manipulation.

## Goals

1. Enumerate security-relevant aspects of the reservation mechanism.
2. Define mitigations for each identified threat.
3. Confirm that the reservation mechanism does not weaken existing security controls.
4. Document the trust boundary between the API layer and the provider layer.

## Non-Goals

- General application security audit (covered by separate audit).
- Stellar SDK or Soroban contract security (out of scope).
- Network-level security (TLS, firewall rules).

## Scope

- Reservation lifecycle in `enhancedStellarProvider.ts`.
- Operation key derivation.
- Error handling and information leakage.
- Rate limiting interaction.

## Schema

Uses existing `mint_operation_key` column and UNIQUE partial index. No new schema.

## Reservation Lifecycle: Security View

### Trust Boundaries

```
[Client/Browser] --HTTPS--> [Express API] --authz--> [Provider.mint()] --SQL--> [SQLite]
                                |                           |
                            Rate limits              In-process mutex
                            RBAC checks              DB reservation
                            Input validation         UNIQUE index
```

The provider trusts that the API layer has:
1. Authenticated the user (JWT).
2. Authorized the operation (RBAC `certificate.approve` permission).
3. Validated inputs (userId, courseId exist and are related).
4. Applied rate limits.

### Threat Analysis

| # | Threat | Severity | Mitigation |
|---|--------|----------|-----------|
| T1 | Reservation flooding: attacker reserves many keys to exhaust resources | LOW | Rate limiting at API layer (existing). Each reservation is tied to a valid credential ID. Cannot reserve without a pending credential. |
| T2 | Operation key prediction: attacker derives another user's key | LOW | Key derivation uses userId which is server-assigned. The UPDATE requires matching credential ID (owned by the user). Even knowing the key, the attacker cannot reserve it without owning the credential. |
| T3 | Information leakage via UNIQUE constraint error | MEDIUM | Catch block returns generic "mint already in progress" message. Does not expose the existing credential ID or state to the caller. |
| T4 | Reservation squatting: reserve a key and never proceed | LOW | Recovery sweep clears stale reservations after 15 minutes. Requires a valid pending credential to reserve. |
| T5 | Race condition between clear and re-reserve | LOW | Database serializes writes. Clear operation uses `WHERE tx_hash IS NULL` guard. |
| T6 | Privilege escalation via direct DB manipulation | N/A | SQLite file is server-side only. No client access to database. |
| T7 | Replay attack: resubmit a previously successful mint | LOW | Pre-check reads `mint_status = 'minted'` and returns cached result. No re-submission. |

### Operation Key Derivation Security

```typescript
`mint:${userId}:${courseId}:${walletAddress}:${contractId}:${network}`
```

- **Not a secret:** The key is deterministic and derived from known business inputs. It does not contain secrets, passwords, or private keys.
- **Not user-controllable:** `userId` is from the JWT, `courseId` is validated against the database, `contractId` and `network` are from server environment variables. Only `walletAddress` comes from user input, and it is validated (starts with `G`, minimum length).
- **Collision-resistant:** The combination of 5 fields makes accidental collisions extremely unlikely. Intentional collisions require controlling all 5 inputs, which requires being the legitimate minter.

## Atomicity

- A process-local mutex is an optimization, not the source of truth. The database reservation is the source of truth.
- All security-relevant state transitions are single SQL statements, atomic in SQLite.

## Error Message Policy

| Scenario | Internal Log | Client Response |
|----------|-------------|-----------------|
| UNIQUE constraint on reserve | Log full error with credential ID and key | "Mint operation already in progress" |
| Simulation failure | Log simulation error details | "Simulation failed" (no internal details) |
| Submission failure | Log submission error with tx details | "Transaction submission failed" |
| Stale reservation cleared | Log credential ID and age | No client notification (background sweep) |

## Risks

| Risk | Mitigation |
|------|-----------|
| Error messages expose internal state | Generic error messages for all constraint violations |
| Recovery sweep timing creates a window | 15-minute window is configurable; can be tightened if needed |
| Operation key logged in plaintext | Key contains no secrets; logging is acceptable |

## Required Approvals

- [ ] Threat analysis reviewed by security-aware team member
- [ ] Error messages confirmed to not leak internal state
- [ ] Rate limiting confirmed to cover reservation endpoint
- [ ] Recovery sweep timing validated against operational requirements
