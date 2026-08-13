# Health Check Monitor Flow

```mermaid
flowchart TD
    CRON["Cron (every 5 min)"] --> MONITOR["amma-monitor.sh"]

    MONITOR --> C1["Check 1: AmmaWallet Health"]
    MONITOR --> C2["Check 2: Container Health"]
    MONITOR --> C3["Check 3: 500 Errors"]
    MONITOR --> C4["Check 4: SSO Failures"]
    MONITOR --> C5["Check 5: Token Indexer"]
    MONITOR --> C6["Check 6: LMS ammaWallet.network"]

    C1 -->|"curl ammawallet.com/api/v1/health"| AW_API["amma-api container"]
    C2 -->|"docker inspect"| DOCKER["Docker daemon"]
    C3 -->|"docker logs --since 5m"| AW_API
    C4 -->|"docker logs --since 5m"| AW_API
    C5 -->|"docker exec psql"| AW_DB["amma-db container"]

    C6 -->|"curl lms.smwebsystems.com/api/v1/health"| LMS_API["lms-api container"]
    LMS_API -->|"JSON response"| EXTRACT["Python: checks.ammaWallet.network"]

    EXTRACT -->|"== 'public'"| OK["INFO: OK"]
    EXTRACT -->|"!= 'public'"| ALERT["ALERT email → mukhtar.meer@smwebsystems.com"]

    style EXTRACT fill:#ff6,stroke:#333
    style ALERT fill:#f66,stroke:#333
    style OK fill:#6f6,stroke:#333
```

## Failure Point (2026-08-11 Incident)

The failure occurred at the **EXTRACT** node. The Python extraction used the old JSON path
(`d.ammaWallet.network`) instead of the new path (`d.checks.ammaWallet.network`),
returning `MISSING` instead of `public`.

The LMS API and all services were healthy throughout — this was a **monitor bug**, not a service outage.
