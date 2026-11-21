# Amma Wallet — MoSCoW Feature Prioritisation

> Last updated: 2026-06-22 | API docs: https://ammawallet.com/docs
> **76 paths · ~95 operations · 18 tags** documented in OpenAPI 3.0

---

## M — Must Have (v1.0) — 20/20 COMPLETE ✅

| # | Feature | Status |
|---|---------|--------|
| 1 | User registration & login (email/password) | Done |
| 2 | Email verification (token-based) | Done |
| 3 | JWT authentication (15 min access, 7 day refresh, rotation) | Done |
| 4 | Multi-wallet management (add, rename, activate, delete) | Done |
| 5 | HD wallet creation (BIP-39 / SEP-0005) | Done |
| 6 | Import wallet via secret key | Done |
| 7 | Send XLM & any Stellar token (memo, QR) | Done |
| 8 | Receive with QR code generation | Done |
| 9 | Token discovery (340+ tokens, 50/page, sort, search, verified filter) | Done |
| 10 | Trustline management (add/remove, pre-flight check) | Done |
| 11 | Stellar DEX swap (best-route path payment, slippage control) | Done |
| 12 | Paginated transaction history (type labels, memos, cursors) | Done |
| 13 | Client-side self-custody signing | Done |
| 14 | PIN-encrypted delegated signing (server-side) | Done |
| 15 | Two-factor authentication (TOTP / email / static PIN, backup codes) | Done |
| 16 | Password reset (email, time-limited tokens) | Done |
| 17 | Swagger / OpenAPI documentation (76 paths, 18 tags) | Done |
| 18 | Rate limiting (100 req/min global, 10/5 min auth) | Done |
| 19 | Configurable platform swap fee (% to platform wallet) | Done |
| 20 | HTTPS & SSL (Let's Encrypt, auto-renew, redirect) | Done |

## S — Should Have (v1.1) — 14/14 COMPLETE ✅

| # | Feature | Status |
|---|---------|--------|
| 1 | Dark & light theme (system-preference aware, Tailwind) | Done |
| 2 | Mobile responsive design (bottom nav, collapsible sidebar) | Done |
| 3 | Multi-language UI (18 languages via i18next, lazy-loaded, RTL) | Done |
| 4 | Address book / contacts (CRUD, integrated in send flow) | Done |
| 5 | In-app notification centre (unread badge, mark-as-read) | Done |
| 6 | OHLCV price charts (candlestick/line, 1h/1d/1w intervals) | Done |
| 7 | Order book depth visualisation (bid/ask, spread) | Done |
| 8 | Token enrichment pipeline (StellarExpert proxy) | Done |
| 9 | Bundle optimisation (170 KB gzipped) | Done |
| 10 | npm audit remediation (4 moderate dev, 6 low frontend) | Done |
| 11 | Help / FAQ (19 items) | Done |
| 12 | Auto-liquifier (convert non-XLM fees every 6h) | Done |
| 13 | Admin endpoints (liquify, platform balance) | Done |
| 14 | Toast standardisation (Sonner) | Done |

## C — Could Have (v1.2) — 6/10 COMPLETE

| # | Feature | Status |
|---|---------|--------|
| 1 | Push notifications (VAPID, web-push, service worker) | Done |
| 2 | Fiat on/off ramp — MoneyGram SEP-10/24 (0.3% fee) | Done |
| 3 | Fiat quotes (buy/sell, 7 currencies, CoinGecko rates) | Done |
| 4 | Portfolio analytics (snapshots, 30-day history, summary) | Done |
| 5 | Curated token list (24 mainnet + 7 testnet) | Done |
| 6 | Earn / Liquidity pools (deposit, withdraw, positions, LP fee 0.30%) | Done |
| 7 | Export transaction history (CSV / PDF) | Planned |
| 8 | Custom token creation | Planned |
| 9 | Soroban smart contract interaction | Planned |
| 10 | Multi-signature support (Orion Safe) | Planned |

## W — Won't Have (out of scope)

- Full block explorer
- Custodial exchange
- Non-Stellar chains
- Native mobile apps (web-first approach — Expo prototype in repo)

## Future (v2.0) — Planned Roadmap

| Feature | Complexity | Notes |
|---------|-----------|-------|
| SEP-24 Anchor Platform (KYC/AML, local rails) | Very High | Requires MoneyGram staging access |
| Custom fiat corridors (ZAR, NGN, KES) | High | Depends on anchor platform |
| Multi-chain bridge (USDC via Wormhole/Allbridge) | High | Cross-chain USDC |
| Soroban contracts | High | Stellar smart contracts |
| Multi-signature wallets | Medium | Orion Safe pattern |
| Native mobile apps (React Native) | High | Expo prototype exists |
| Hardware wallet support (Ledger / Trezor) | Medium | WebUSB / WebHID |
| Recurring payments | Medium | Scheduled transactions |
| DAO governance | High | On-chain voting |

---

### Platform Coverage

| Platform | Pages | API Client | Build |
|----------|-------|-----------|-------|
| **Web app** (React 19 / Vite 6) | 16 pages | Full (14 API modules) | ✅ Production |
| **Chrome extension** (MV3 / Vite) | 16 pages | Full (14 API modules) | ✅ Builds |
| **Mobile** (Expo 54 / React Native) | 18 screens | Full (14 API modules) | ✅ Compiles |