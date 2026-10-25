# Local LMS + AmmaWallet services on Windows

This runner starts actual LMS and Wallet applications with isolated local databases. The Android setup is in `LMS-Mobile/LOCAL_ANDROID.md`. The validated Wallet checkout includes [Wallet PR #4](https://github.com/SM-Web-Systems/amma-wallet-production/pull/4), head `2d63e98b707f029b066250bc16d40d969e3a6236`; plain PR #3 lacks the fresh email-verification schema and same-second refresh-token fixes.

## Layout and tools

Use sibling short checkouts outside OneDrive:

```text
C:/Users/<user>/dev/lms-mobile-local
C:/Users/<user>/dev/wallet-local
```

The runner derives the Wallet path from that layout and verifies ownership of its generated data. Install the locked dependencies with npm 10.9.9 in each of `LMS-Server`, `LMS-Frontend`, `wallet-local/packages/backend` and `wallet-local/packages/web-app`. Existing backend `.env` files are refused; the runner supplies fresh generated development configuration. It does not load server credentials.

Install these portable tools under `%LOCALAPPDATA%/LmsMobile/tools`:

| Tool | Expected executable |
| --- | --- |
| PostgreSQL 17.11, EDB binary archive revision 5 | `postgresql-17.11-5/pgsql/bin/pg_ctl.exe` |
| Mailpit 1.32.0 Windows AMD64 | `mailpit-1.32.0/mailpit.exe` |
| Git for Windows OpenSSL | `C:/Program Files/Git/usr/bin/openssl.exe` |

The official download links are [PostgreSQL Windows binaries](https://www.postgresql.org/download/windows/), [EDB binary archives](https://productsdl.enterprisedb.com/download-postgresql-binaries), and [Mailpit 1.32.0](https://github.com/axllent/mailpit/releases/tag/v1.32.0). This setup uses portable programs, with no Docker or Windows service installation. No system PATH, certificate store or global TLS setting is changed.

## Initialize and run

From the LMS checkout root:

```powershell
node scripts/local-services/stack.mjs init
node scripts/local-services/stack.mjs start
```

`init` creates a new owned PostgreSQL cluster, exports the Wallet schema into its empty database, and explicitly initializes a new LMS SQLite database. It creates no login accounts itself. Repeating `init` preserves data. For the already-owned initial bootstrap that lacked the verification table, it can add only that model-generated table/FK transaction. It never performs a broad schema push, production migration, database reset or automatic deletion. PostgreSQL remains running after `init`; `stop` also works when no supervisor has started.

Keep `start` running in its terminal. It reports `LOCAL_SERVICES_READY` when all services respond. In a second terminal:

```powershell
node scripts/local-services/stack.mjs check
node scripts/local-services/smoke.mjs
```

| Service | Local URL / port |
| --- | --- |
| LMS web | http://localhost:5173 |
| LMS API | http://localhost:3001/api/v1 |
| Wallet web | http://localhost:5174 |
| Wallet API | http://localhost:3002/api/v1 |
| Captured email inbox | http://localhost:8025 |
| SMTP STARTTLS capture | 127.0.0.1:1025 |
| Private PostgreSQL cluster | 127.0.0.1:55432 |
| Authenticated runner control | 127.0.0.1:28081 |

Every stack listener binds to loopback. Node application processes load a development-only networking preload that refuses remote HTTP, TLS, TCP, DNS and UDP operations. The web wrappers add a CSP limiting resource connections to local services. These are development safeguards, not an OS sandbox for untrusted code. The runner also strips inherited credentials, proxy settings and Node preloads from service environments.

The local Wallet web wrapper labels and simulates CAPTCHA; its development API uses no Cloudflare secret. This behavior exists only in ignored generated configuration. Payment providers, SMS and blockchain operations are not configured. Horizon/RPC point to an unused loopback endpoint; expected indexer connection failures do not prevent local account/SSO tests. The simulator does not establish provider acceptance.

Mailpit captures only `@example.test` recipients, has no relay/forward configuration, and disables reverse-DNS/update checks. SMTP uses STARTTLS with a generated local CA trusted only through the application processes' `NODE_EXTRA_CA_CERTS`. The existing SMTP hostname checks remain enabled.

## Synthetic accounts and learning data

The smoke command creates/reuses a local operator and learner through actual Wallet registration/login, captures verification mail and verifies the email address. It can recover a partially created unverified fixture through authenticated resend. The operator reserves Wallet's legacy ID 1 boundary; the learner remains a separate account and receives an LMS student profile through actual SSO.

Local-only credentials are in `.local-services/accounts.json`. Use the learner to sign in through the mobile app's **Sign in with AmmaWallet** button. A fresh login opens local Wallet and returns through the existing `lmsmobile://sso-callback` PKCE flow. No separate LMS password is created. Server secrets are in ignored `.local-services/settings.json`; database data/logs live in the owned `%LOCALAPPDATA%/LmsMobile/services/stack-<id>` directory. LMS file uploads use this isolated checkout's ignored `LMS-Server/uploads` directory.

The smoke command also creates a synthetic **Local Mobile Acceptance** course with an authored week and two text lessons. The readings are served by the local web runner at `http://localhost:5173/local-reading.html`. The first lesson has API-tested saved progress/completion; the second is left incomplete for interactive testing. The fixture writes only to this runner's identified local databases. It does not seed production data or create/fund a blockchain wallet.

## Connect the emulator

From `LMS-Mobile`, configure the same local URLs if not already set:

```powershell
npm run android:local -- configure --api http://localhost:3001/api/v1 --web http://localhost:5173 --wallet http://localhost:5174
npm run android:local -- emulator
npm run android:local -- start
```

Run Metro only once on 8081. Keep it in its own terminal alongside the service supervisor. The installed debug client already contains the native dependencies; backend-only changes do not require rebuilding it. If the APK is not installed, follow the Android guide and run `npm run android:local -- install`; it verifies the exact dedicated AVD and forwards the local service/Metro ports.

## Stop and validation

```powershell
node scripts/local-services/stack.mjs stop
node --test scripts/local-services/*.test.mjs
```

Stop waits for the owned cluster to shut down and preserves databases. It authenticates the supervisor identity and refuses an unrelated control listener. Without a supervisor it can stop only its marked PostgreSQL data directory. A failed startup rolls back a newly started cluster. It does not kill arbitrary node processes, other emulators or other databases.

The eight pure guard/settings tests run in mobile CI. The smoke script is an explicitly invoked integration tool and does not run in CI. Local configuration, credentials, mail, keys, browser traces and generated Vite wrappers remain ignored.

The local environment validates account/SSO and synthetic text learning. Physical Android/iOS acceptance, iOS builds, real CAPTCHA, SMS, payments, chain operations and the wider media/device checklist remain separate. Server evaluation, merges and deployment stay with the server operator.
