# W03-R5 — Full-statement validation: preserve table options and literal semantics

Date: 2026-10-30
Status: IMPLEMENTATION_READY
Supersedes: `docs/superpowers/specs/2026-10-30-W03-R4-authoritative-schema-validation.md` (extends; R4 receipts preserved)
Implements: W03-R5 prompt at `853ea671` on `codex/platform-wiring-audit`

---

## 1. Problem statement

Two residual defects in W03-R4 (`migrateRewardTxnCheck.ts`) reproduced after PR #121 merged at `2f1c951`.
87 tests executed; 85 passed, 2 failed.

### F1 — Unsupported table option silently removed

`detectSchemaVersion` calls `extractTableBody(canonicalizeDdl(row.sql))`. `extractTableBody`
uses `indexOf('(')` and `lastIndexOf(')')` to slice the body — it discards everything after the
last `)`. A STRICT table stored as:

```sql
CREATE TABLE reward_transactions (...) STRICT
```

has ` STRICT` as a suffix after the last `)`. `extractTableBody` discards this suffix. The
body is identical to the canonical source body → `detectSchemaVersion` returns `'source'`.
`applyUpgrade` proceeds and reconstructs the table **without STRICT** — the original
enforcement option is silently removed. `PRAGMA table_list` confirms `strict=0` after the
migration on a database that had `strict=1` before.

**Proof**: STRICT tables reject `amount_stroops = 'not a number'` (enforces type affinity).
After migration, the rebuilt table accepts the value. Behavioral change confirmed.

### F2 — Literal semantics changed by final normalization

`canonicalizeDdl` ends with a post-loop global regex:

```typescript
result = result.replace(/\bIF\s+NOT\s+EXISTS\s+/gi, '');
```

Although the character-by-character loop preserves single-quoted string literals verbatim,
the post-loop regex operates on the entire result string including preserved literal content.
A schema with `DEFAULT 'IF NOT EXISTS XLM' CHECK (currency_code IN ('IF NOT EXISTS XLM'))`
has its string literal contents rewritten to `DEFAULT 'XLM' CHECK (currency_code IN ('XLM'))`
after this regex — exactly matching the canonical target body. `detectSchemaVersion` returns
`'target'`; `planUpgrade` reports `alreadyAtTarget: true`. The actual database accepts only
`'IF NOT EXISTS XLM'` as currency — not `'XLM'` — but the migration considers it fully upgraded.

**Proof**: `INSERT INTO ... VALUES (..., 'XLM', ...)` fails with CHECK constraint on the
modified fixture; the canonical target accepts it. This is a behavioral difference hidden by
the normalization artifact.

---

## 2. Scope

- **In scope**: Fix F1 (suffix check for table options) and F2 (IF NOT EXISTS stripping limited
  to statement header). Preserve all W03-R2/R3/R4 safeguards. Regression tests for all prior
  defect probes.
- **Out of scope**: Supporting STRICT or WITHOUT ROWID tables (conservative refusal is
  sufficient). W04, deployment, live migration.

---

## 3. Canonical DDL normalization — corrected (W03-R5)

### 3.1 Pre-scan: IF NOT EXISTS stripping

**Change from W03-R4**: The post-loop `result.replace(/\bIF\s+NOT\s+EXISTS\s+/gi, '')` regex
is removed. Instead, `IF NOT EXISTS` is stripped from the **statement header** (text before the
first `(`) before the character-by-character loop begins. The header is processed with a
mini-scanner that handles double-quoted identifiers verbatim — so a table named
`"IF NOT EXISTS"` would not have its quoted name altered.

**Why this is correct**: `IF NOT EXISTS` is syntactically valid only in the CREATE TABLE/INDEX
header, before the body-opening `(`. It cannot appear in column names, constraint expressions,
or DEFAULT values outside a string literal. Stripping it only from the pre-`(` portion is safe
for all valid SQLite DDL.

### 3.2 Full-statement suffix check

**New in W03-R5**: After `canonicalizeDdl`, `detectSchemaVersion` checks whether any non-whitespace
content follows the last `)`. If so, the DDL has an unsupported table option suffix (e.g.,
`STRICT`, `WITHOUT ROWID`, or combinations) and is classified `'unknown'`.

The canonical source and target DDL (from `sourceCreateTable` / `targetCreateTable`) have no
suffix — their `extractTableBody` result is the entire content between the outermost `(` and `)`.

### 3.3 Supported header variations (explicit allowlist)

The only header variation accepted by the canonical comparison is:
- `CREATE TABLE reward_transactions (...)` — verbatim (no suffix, unquoted name)
- `CREATE TABLE "reward_transactions" (...)` — double-quoted name, no suffix
  (stored by SQLite after `ALTER TABLE reward_transactions_new RENAME TO reward_transactions`)

Both reduce to the same body after `canonicalizeDdl` + `extractTableBody`. A suffix on either
form → `'unknown'`.

### 3.4 What is NOT supported (W03-R5 additions)

| Variant | Defect | Classification |
|---------|--------|----------------|
| `CREATE TABLE reward_transactions (...) STRICT` | F1: suffix silently removed | `'unknown'` |
| `CREATE TABLE reward_transactions (...) WITHOUT ROWID` | F1: suffix | `'unknown'` |
| `CREATE TABLE reward_transactions (...) STRICT, WITHOUT ROWID` | F1: suffix | `'unknown'` |
| `DEFAULT 'IF NOT EXISTS XLM'` (changed literal) | F2: literal rewritten | `'unknown'` |
| `CHECK (currency_code IN ('IF NOT EXISTS XLM'))` (changed literal) | F2: literal rewritten | `'unknown'` |

---

## 4. Implementation details

### 4.1 `canonicalizeDdl` (updated)

```
1. Find firstParen = index of first '(' in ddl.
2. If firstParen >= 0:
     header = ddl.slice(0, firstParen)
     Strip IF NOT EXISTS from header using a mini-scanner:
       - Scan character by character
       - Skip double-quoted identifiers ("..." with "" escaping)
       - When encountering /^IF\s+NOT\s+EXISTS\s+/i in non-quoted text, skip it
     input = strippedHeader + ddl.slice(firstParen)
   Else:
     input = ddl with IF NOT EXISTS stripped globally (fallback for no-paren DDL)
3. Run existing character-by-character loop on `input` (unchanged).
4. Remove the post-loop result.replace(/\bIF\s+NOT\s+EXISTS\s+/gi, '').
5. Return result (already trimmed by pendingSpace logic).
```

### 4.2 `detectSchemaVersion` (updated)

```
1. Query sqlite_master for reward_transactions DDL.
2. If absent: return 'absent'.
3. canonical = canonicalizeDdl(row.sql).
4. lastParen = canonical.lastIndexOf(')').
5. If lastParen === -1: return 'unknown'.
6. suffix = canonical.slice(lastParen + 1).trim().
7. If suffix.length > 0: return 'unknown'.  ← F1 fix
8. body = canonical.slice(canonical.indexOf('(') + 1, lastParen).trim().
9. If body === CANONICAL_TARGET_BODY: return 'target'.
10. If body === CANONICAL_SOURCE_BODY: return 'source'.
11. return 'unknown'.
```

### 4.3 `extractTableBody` (unchanged)

Used only for pre-computing `CANONICAL_SOURCE_BODY` and `CANONICAL_TARGET_BODY` at module load.
These inputs (`sourceCreateTable`/`targetCreateTable`) have no suffix and no `IF NOT EXISTS`.

---

## 5. Mermaid diagrams

### 5a — detectSchemaVersion updated flow (W03-R5)

```mermaid
flowchart TD
    A[detectSchemaVersion] --> B[Query sqlite_master]
    B --> C{row found?}
    C -- No --> D[return 'absent']
    C -- Yes --> E[canonicalizeDdl\nstrip IF NOT EXISTS from header\nstrip comments, collapse whitespace\nsuppress space before ')']
    E --> F{lastParen found?}
    F -- No --> G[return 'unknown']
    F -- Yes --> H{suffix after lastParen?}
    H -- Yes --> I[return 'unknown'\nSTRICT/WITHOUT ROWID/etc.]
    H -- No --> J[extract body between first() and last()]
    J --> K{body === CANONICAL_TARGET_BODY?}
    K -- Yes --> L[return 'target']
    K -- No --> M{body === CANONICAL_SOURCE_BODY?}
    M -- Yes --> N[return 'source']
    M -- No --> O[return 'unknown']

    style L fill:#c8e6c9
    style N fill:#fff9c4
    style I fill:#ffcdd2
    style O fill:#ffcdd2
    style G fill:#ffcdd2
    style D fill:#e1f5fe
```

### 5b — canonicalizeDdl pre-scan flow (W03-R5)

```mermaid
flowchart TD
    A[canonicalizeDdl input] --> B{first '(' found?}
    B -- No --> C[strip IF NOT EXISTS globally]
    B -- Yes --> D[header = ddl before first '(']
    D --> E[scan header: skip double-quoted identifiers\nstrip IF NOT EXISTS from non-quoted text]
    E --> F[input = stripped header + ddl from first '(' onward]
    C --> G[character-by-character loop\nstring literals preserved\ncomments → pending space\nspace before ')' suppressed]
    F --> G
    G --> H[return result]
```

---

## 6. Requirement-to-test mapping

| # | Requirement | New tests | Test group |
|---|-------------|-----------|------------|
| 1 | F1: STRICT source — refuse plan/apply/preflight; PRAGMA strict=1 preserved | 4 | `COMPAT-F5-STRICT` |
| 2 | F1: STRICT target — refuse detection; F1: WITHOUT ROWID variants classified unknown | 3 | `COMPAT-F5-STRICT` |
| 3 | F2: changed currency literal — refuse detect/plan/apply/preflight; SQLite behavior proof | 5 | `COMPAT-F5-LITERAL` |
| 4 | IF NOT EXISTS inside string literals/defaults/CHECK preserved verbatim through canonicalizeDdl | 3 | `COMPAT-F5-IFLITERAL` |
| 5 | Parentheses inside quoted text: structural boundaries correct | 2 | `COMPAT-F5-IFLITERAL` |
| 6 | All 80 W03-R4 tests unchanged | 80 (regression) | existing groups |

**Total new tests**: ~17

---

## 7. Production apply prerequisites (no action in this unit)

Same as W03-R4 spec §9. This unit corrects detection logic only.

## 8. Recovery guidance

Same as W03-R4 spec §10. Databases with `unknown` classification (including STRICT tables)
require manual investigation. No automatic STRICT-to-non-STRICT downgrade is supported.
