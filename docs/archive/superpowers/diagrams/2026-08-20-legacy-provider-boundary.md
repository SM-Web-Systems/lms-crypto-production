# Legacy Provider Boundary Diagram
**Date:** 2026-08-20
**Document:** Architecture diagram showing provider selection and boundaries

---

## Provider Selection & Boundaries

```mermaid
graph TD
    A["Application Startup"] --> B["Check NFT_PROVIDER<br/>Environment Variable"]
    B --> C{NFT_PROVIDER<br/>Value?}
    C -->|Unset| D["Default: legacy"]
    C -->|enhanced| E["❌ NOT AUTHORIZED<br/>Production blocked"]
    C -->|legacy| F["Use LegacyStellarProvider"]
    D --> F
    F --> G["✅ Legacy Provider Active"]
    E --> H["CRITICAL ALERT<br/>Unauthorized provider activation"]
    H --> I["Escalate to security"]

    style D fill:#c8e6c9
    style F fill:#c8e6c9
    style G fill:#c8e6c9
    style E fill:#ffcdd2
    style H fill:#ffcdd2
    style I fill:#ffcdd2
```

---

## Schema vs. Provider Lifecycle

```mermaid
graph LR
    A["Schema Migration<br/>001-add-mint-operation-key.sql"] --> B["Add Column<br/>mint_operation_key TEXT"]
    A --> C["Create Indexes"]
    B --> D["Column Added<br/>But NULL for all rows"]
    C --> D
    D --> E["Schema Ready for<br/>Enhanced Provider"]
    E --> F{Provider<br/>Activated?}
    F -->|NO| G["✅ Current State<br/>Legacy Provider Active<br/>Column unused"]
    F -->|YES| H["❌ Future State<br/>NOT AUTHORIZED<br/>in this migration"]
    H --> I["Requires separate approval<br/>Requires TransactionClient<br/>Requires testnet validation"]

    style A fill:#fff9c4
    style D fill:#c8e6c9
    style E fill:#c8e6c9
    style G fill:#c8e6c9
    style H fill:#ffcdd2
    style I fill:#ffcdd2
```

---

## Provider Factory & Configuration

```mermaid
graph TD
    A["nftProvider.ts<br/>Factory Function"] --> B["Read Config"]
    B --> C["Check NFT_PROVIDER<br/>environment variable"]
    C --> D{Value}
    D -->|"legacy" or<br/>unset| E["Return LegacyStellarProvider<br/>✅ ACTIVE"]
    D -->|"enhanced"| F["Return EnhancedStellarProvider<br/>❌ BLOCKED"]
    E --> G["Uses MintService<br/>existing flow"]
    F --> H["CRITICAL: Unauthorized<br/>provider in production"]

    style E fill:#c8e6c9
    style G fill:#c8e6c9
    style F fill:#ffcdd2
    style H fill:#ffcdd2
```

---

## Migration Impact on Provider

```mermaid
graph TD
    A["Before Migration"] --> B["Schema: 14 columns"]
    B --> C["Provider: LegacyStellarProvider<br/>NFT_PROVIDER: unset"]
    C --> D["✅ Current state"]

    E["After Migration"] --> F["Schema: 15 columns<br/>+ mint_operation_key"]
    F --> G["Provider: LegacyStellarProvider<br/>NFT_PROVIDER: unset"]
    G --> H["✅ Expected state<br/>Schema prepared<br/>Provider unchanged"]

    I["BLOCKED State"] --> J["Schema: 15 columns"]
    J --> K["Provider: EnhancedStellarProvider<br/>NFT_PROVIDER: enhanced"]
    K --> L["❌ NOT AUTHORIZED<br/>Requires separate approval"]

    style D fill:#c8e6c9
    style H fill:#c8e6c9
    style L fill:#ffcdd2
```

---

## Configuration Verification Matrix

```mermaid
graph TD
    A["Post-Migration Configuration Check"] --> B["Check 1: NFT_PROVIDER"]
    B --> C{Value}
    C -->|unset| D["✅ PASS<br/>Defaults to legacy"]
    C -->|legacy| E["✅ PASS<br/>Legacy selected"]
    C -->|enhanced| F["❌ FAIL<br/>Enhanced not authorized"]

    A --> G["Check 2: NFT_AUTO_MINT_ENABLED"]
    G --> H{Value}
    H -->|false| I["✅ PASS<br/>Auto-mint disabled"]
    H -->|true| J["❌ FAIL<br/>Auto-mint not authorized"]

    A --> K["Check 3: TransactionClient"]
    K --> L{Instantiated?}
    L -->|NO| M["✅ PASS<br/>Not loaded"]
    L -->|YES| N["❌ FAIL<br/>Unauthorized client"]

    A --> O["Check 4: API Logs"]
    O --> P{Enhanced<br/>Provider messages?}
    P -->|NO| Q["✅ PASS<br/>Legacy provider active"]
    P -->|YES| R["❌ FAIL<br/>Unauthorized provider active"]

    style D fill:#c8e6c9
    style E fill:#c8e6c9
    style I fill:#c8e6c9
    style M fill:#c8e6c9
    style Q fill:#c8e6c9
    style F fill:#ffcdd2
    style J fill:#ffcdd2
    style N fill:#ffcdd2
    style R fill:#ffcdd2
```

---

## Enhanced Provider Activation Requirements (FUTURE)

```mermaid
graph TD
    A["Current State:<br/>Schema Ready"] --> B["Future: Enhanced Activation"]
    B --> C["Requirement 1:<br/>Separate Approval Vote"]
    C --> D["Requirement 2:<br/>TransactionClient Implementation"]
    D --> E["Requirement 3:<br/>Testnet E2E Validation"]
    E --> F["Requirement 4:<br/>Blockchain Operation Authorization"]
    F --> G["Only THEN:<br/>Set NFT_PROVIDER=enhanced"]
    G --> H["Deploy with env changes"]
    H --> I["✅ Enhanced Provider Activated<br/>(future initiative)"]

    style A fill:#c8e6c9
    style C fill:#fff9c4
    style D fill:#fff9c4
    style E fill:#fff9c4
    style F fill:#fff9c4
    style I fill:#fff9c4
```

---

## STOP Conditions: Enhanced Activation Boundary

```mermaid
graph TD
    A["Monitoring: Enhanced Activation Attempts"] --> B{Check:<br/>NFT_PROVIDER env}
    B -->|enhanced| C["STOP IMMEDIATELY ❌"]
    B -->|legacy/unset| D["✅ PASS"]

    A --> E{Check:<br/>TransactionClient code}
    E -->|Instantiated| F["STOP IMMEDIATELY ❌"]
    E -->|Not used| G["✅ PASS"]

    A --> H{Check:<br/>Soroban calls}
    H -->|Found| I["STOP IMMEDIATELY ❌"]
    H -->|None| J["✅ PASS"]

    A --> K{Check:<br/>mint_operation_key populated}
    K -->|Non-NULL values| L["STOP IMMEDIATELY ❌"]
    K -->|All NULL| M["✅ PASS"]

    C --> N["Investigate unauthorized<br/>provider activation<br/>Escalate to security team"]
    F --> N
    I --> N
    L --> N

    style C fill:#ffcdd2
    style F fill:#ffcdd2
    style I fill:#ffcdd2
    style L fill:#ffcdd2
    style N fill:#ffcdd2
    style D fill:#c8e6c9
    style G fill:#c8e6c9
    style J fill:#c8e6c9
    style M fill:#c8e6c9
```

---

## References

- Enhanced Boundary Spec: `2026-08-20-enhanced-provider-activation-boundary-spec.md`
- Migration Plan: `2026-08-20-production-migration-plan.md`
