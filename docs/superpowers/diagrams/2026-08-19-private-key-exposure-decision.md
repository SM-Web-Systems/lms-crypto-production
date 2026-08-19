# Private Key Exposure Decision

**Date:** 2026-08-19
**Purpose:** Document the rotate-vs-abandon decision logic for this incident
and as a reference for future incidents.

```mermaid
flowchart TD
    A{Was private key printed to stdout?} -->|No — piped to gpg| B[Private key NOT EXPOSED]
    A -->|Yes| C[ABANDON ACCOUNT]
    A -->|Unknown| D[DEFAULT: ABANDON]

    B --> E{Was passphrase exposed?}
    E -->|Yes| F[ROTATE PASSPHRASE]
    E -->|No| G[No action needed]

    F --> H{Rotation successful?}
    H -->|Yes| I[Account SAFE — proceed to funding gate]
    H -->|No| J[Investigate]

    C --> K[Generate replacement keypair]
    D --> K

    style B fill:#90EE90
    style F fill:#FFD700
    style I fill:#90EE90
    style C fill:#FFB6C1
    style D fill:#FFB6C1
```

## Decision for This Incident

| Question | Answer | Evidence |
|----------|--------|----------|
| Private key printed to stdout? | No | Key was piped via `stellar keys generate ... | gpg --symmetric` — never assigned to a variable or echoed |
| Private key in shell history? | No | Piped command; private key value was not part of the command string |
| Passphrase exposed? | Yes | Appeared in session output |
| Account funded? | No | Friendbot has not been called |
| Decision | ROTATE PASSPHRASE | Both conditions met: key safe, passphrase compromised |

## Default Posture

When in doubt, **ABANDON** is always the safer choice. Abandoning an unfunded,
unused account costs nothing. Retaining a compromised account costs trust.

The rotate path was chosen here only because there is clear evidence the private
key was never printed — it was piped directly to GPG stdin in a single pipeline
step with no intermediate storage.

## Funding Gate

Node **I** ("Account SAFE — proceed to funding gate") does NOT mean funding is
automatic. It means the rotation gate is cleared and the funding approval gate
(SIR-012) may now be requested. Explicit user approval is still required before
Friendbot is called.
