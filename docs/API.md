# API Reference

**Base URL:** https://ammawallet.com
**Interactive Docs:** [https://ammawallet.com/docs](https://ammawallet.com/docs)

The backend exposes 82 REST API endpoints organized into 14 categories. All endpoints return JSON. Protected endpoints require a JWT bearer token in the Authorization header.

## Authentication

Obtain tokens by posting credentials to the login endpoint. The response includes an access token (15-minute expiry) and a refresh token (7-day expiry). Include the access token in subsequent requests as Authorization: Bearer <token>. When the access token expires, use the refresh endpoint to obtain a new pair. API keys can also be used via the x-api-key header for programmatic access.

## Endpoints

### Auth

POST /api/v1/auth/register : creates a new account with email, password, first name, and last name. A verification email is sent automatically. 
POST /api/v1/auth/login : authenticates with email and password. If 2FA is enabled, the response includes requiresTwoFactor: true and a tempToken; resubmit with the twoFactorCode field to complete login. 
POST /api/v1/auth/refresh : exchanges a valid refresh token for a new access/refresh token pair. 
POST /api/v1/auth/logout : revokes the current refresh token. 
GET /api/v1/auth/me : returns the authenticated user's profile including wallets. 
PATCH /api/v1/auth/profile : updates profile fields such as name, avatar URL, preferred language, and preferred network. 
POST /api/v1/auth/forgot-password : sends a password reset email with an expiring token. 
POST /api/v1/auth/reset-password : resets the password using the token from the email. 
POST /api/v1/auth/change-password : changes the password for the authenticated user (requires current password). 
GET /api/v1/auth/verify-email : verifies the user's email address using the token from the verification email. 
POST /api/v1/auth/resend-verification : sends a new verification email to the authenticated user.

### Wallets

POST /api/v1/wallets : creates a new wallet (HD mnemonic or imported secret key). 
GET /api/v1/wallets : lists all wallets for the authenticated user. 
PATCH /api/v1/wallets/:id : updates a wallet's name or active status. 
GET /api/v1/wallet/:publicKey : returns account info from Horizon including balances, sequence number, and flags. 
POST /api/v1/wallet/fund : funds a testnet account via Friendbot.

### Tokens

GET /api/v1/tokens : lists tokens with pagination and sorting. Query parameters include query (search term), sortBy (rating, volume, trustlines, name, recent), limit (default 50), offset (default 0), and verified (boolean filter). The response includes a tokens array with resolved icon URLs and a pagination object with total, limit, offset, and hasMore. 
GET /api/v1/tokens/:code/:issuer : returns full detail for a single token including ratings, orderbook, liquidity pools, and resolved icon URL. Use "native" as the issuer for XLM. 
GET /api/v1/tokens/:code/:issuer/price-history : returns OHLCV candle data from Horizon trade aggregations. Query parameters include resolution (3600000 for 1h, 86400000 for 1d, 604800000 for 1w), limit (default 30, max 200), counterCode (default USDC), and counterIssuer. 
GET /api/v1/tokens/featured : returns featured tokens ordered by rating. 
GET /api/v1/tokens/curated : returns the curated, verified token list for the current network (24 mainnet, 7 testnet tokens with self-hosted icon URLs). Optional query parameters are network (mainnet or testnet) and category (stablecoin, defi, wrapped, etc). 
POST /api/v1/tokens/curated/seed : seeds or updates curated tokens into the database, setting localIcon for self-hosted icons and marking them as verified. 
GET /api/v1/tokens/user/:publicKey : returns token balances with metadata for a specific wallet. 
POST /api/v1/tokens/favorite : toggles a token as favorite for a wallet. 
GET /api/v1/tokens/search-assets : searches tokens across StellarExpert and the local database. 
GET /api/v1/tokens/directory : proxies the StellarExpert asset directory with pagination. 
GET /api/v1/tokens/expert/:code/:issuer : proxies StellarExpert asset data for a specific token.

### Trustlines

POST /api/v1/trustlines/add builds a transaction to add a trustline. POST /api/v1/trustlines/remove builds a transaction to remove a trustline. GET /api/v1/trustlines/check/:publicKey/:code/:issuer checks whether a trustline exists for a given account and asset. POST /api/v1/trustlines/update-limit updates the trust limit for an existing trustline. GET /api/v1/trustlines/:publicKey lists all trustlines for a given account.

### Swap

GET /api/v1/swap/quote returns swap quotes with path-finding, exchange rate, price impact, and estimated fees. POST /api/v1/swap/build builds an unsigned swap transaction XDR using strict send or strict receive path payment operations. Platform fee is injected automatically when configured.

### Transactions

POST /api/v1/transactions/sign signs a transaction XDR server-side using the PIN-decrypted wallet secret (delegated mode only). POST /api/v1/transactions/sign-and-submit signs and submits a transaction XDR to Horizon in a single call (delegated mode only). POST /api/v1/transactions/submit submits a pre-signed transaction XDR to Horizon (self-custody mode). GET /api/v1/transactions/:publicKey returns paginated transaction history from Horizon.

### Contacts

GET /api/v1/contacts lists all contacts in the authenticated user's address book. POST /api/v1/contacts adds a new contact with name, address, optional memo, memo type, and notes. PATCH /api/v1/contacts/:id updates an existing contact. DELETE /api/v1/contacts/:id removes a contact.

### Earn / Liquidity Pools

GET /api/v1/earn/pools lists available Stellar DEX liquidity pools with reserve details, fee rates (default 30bp / 0.30%), total shares, and provider counts. Optional query parameters are asset (filter by asset code like XLM or USDC) and limit (default 20, max 50). GET /api/v1/earn/positions/:publicKey returns the user's liquidity pool positions including share balance, share percentage of pool, estimated value of each reserve based on ownership ratio, fee rate, and total pool shares. POST /api/v1/earn/deposit builds an unsigned liquidity pool deposit transaction. Required fields are publicKey, poolId, maxAmountA, and maxAmountB. Optional fields are minPrice and maxPrice for slippage control. Returns XDR for client-side signing. POST /api/v1/earn/withdraw builds an unsigned liquidity pool withdraw transaction. Required fields are publicKey, poolId, and shares (amount of LP shares to withdraw). Optional fields are minAmountA and minAmountB. Returns XDR for client-side signing.

### Fiat Ramp

GET /api/v1/fiat/currencies lists supported fiat currencies (USD, EUR, GBP, ZAR, NGN, KES, BRL) with buy/sell limits, the platform fee percentage (0.3%), and the provider name. POST /api/v1/fiat/quote/buy returns a buy quote for purchasing XLM with fiat, including estimated XLM amount, exchange rate, fee breakdown, quote expiry, and a unique quote ID. POST /api/v1/fiat/quote/sell returns a sell quote for converting XLM to fiat. POST /api/v1/fiat/buy and POST /api/v1/fiat/sell are placeholder execution endpoints that return pending_provider status until a payment provider is fully integrated.

### MoneyGram (SEP-10/SEP-24)

GET /api/v1/moneygram/info returns MoneyGram Ramps configuration including the provider domain, signing key, supported assets (USDC), on-ramp limits ($5-$950), off-ramp limits ($5-$2,500), platform fee percentage, and integration status. POST /api/v1/moneygram/deposit initiates a MoneyGram cash-in flow. Accepts publicKey and optional amount. Performs SEP-10 authentication with the server signing key, then initiates a SEP-24 interactive deposit. Returns a transaction ID and an interactive URL to open in a browser for KYC and payment at a MoneyGram location. POST /api/v1/moneygram/withdraw initiates a MoneyGram cash-out flow. Same authentication process, returns an interactive URL where the user completes withdrawal and receives a reference number for cash pickup. GET /api/v1/moneygram/transaction/:id checks the status of a MoneyGram transaction. Requires publicKey as a query parameter for re-authentication. Returns status, amounts, fees, timestamps, and Stellar transaction ID when complete.

### Portfolio

POST /api/v1/portfolio/snapshot records a portfolio balance snapshot for the active wallet, storing total XLM value, estimated USD value, and a JSONB asset breakdown. GET /api/v1/portfolio/history returns portfolio value history for charting, ordered by timestamp. GET /api/v1/portfolio/summary returns a portfolio summary with current value, 24-hour change, and 7-day change with trend direction.

### Push Notifications

GET /api/v1/push/vapid-key returns the VAPID public key needed to subscribe to web push notifications on the client. POST /api/v1/push/subscribe registers a push notification subscription with endpoint, p256dh key, auth secret, and optional user agent. Subscriptions are stored in PostgreSQL and associated with the authenticated user. POST /api/v1/push/unsubscribe removes a push notification subscription by endpoint. POST /api/v1/push/test sends a test push notification to all registered devices for the authenticated user.

### Two-Factor Authentication

POST /api/v1/auth/2fa/setup initiates 2FA setup and returns a TOTP secret and QR code URI. POST /api/v1/auth/2fa/verify confirms 2FA setup with a valid code. POST /api/v1/auth/2fa/disable disables 2FA after code verification. POST /api/v1/auth/2fa/send-code sends a TOTP-based verification code. POST /api/v1/auth/2fa/send-email-code sends a 2FA code via email. GET /api/v1/auth/2fa/status returns the current 2FA configuration status.

### API Keys

POST /api/v1/api-keys creates a new API key with optional expiry. GET /api/v1/api-keys lists all API keys for the user. DELETE /api/v1/api-keys/:id revokes an API key.

### Keypair Utilities

GET /api/v1/keypair/generate generates a new random Stellar keypair (public key and secret key). POST /api/v1/keypair/from-mnemonic derives a keypair from a BIP-39 mnemonic phrase following SEP-0005. POST /api/v1/keypair/from-secret derives the public key from a secret key. POST /api/v1/keypair/validate-mnemonic validates whether a BIP-39 mnemonic phrase is correctly formed.

### Signing Mode

GET /api/v1/user/signing-mode returns the user's current signing mode preference (self-custody or delegated). PATCH /api/v1/user/signing-mode updates the signing mode preference.

### Admin

POST /api/v1/admin/liquify triggers manual conversion of non-XLM platform fees to XLM via DEX path payments. GET /api/v1/admin/platform-balance returns the platform wallet's current balances across all held assets.

### Other

GET /health returns server status, network (testnet or public), and timestamp. GET /docs serves the interactive Swagger UI. GET /docs/json returns the raw OpenAPI 3.0 specification as JSON.

## Rate Limits

All endpoints are subject to a global rate limit of 100 requests per minute per IP. Authentication endpoints (login, register, forgot-password, reset-password, change-password) have a stricter limit of 10 requests per 5 minutes. Rate limit headers are included in every response: x-ratelimit-limit, x-ratelimit-remaining, and x-ratelimit-reset.

## Error Format

All errors return a JSON object with an error field containing a human-readable message. HTTP status codes follow standard conventions: 400 for validation errors, 401 for missing or invalid authentication, 403 for forbidden actions or invalid PIN, 404 for not found, 409 for conflicts (e.g., duplicate email), 429 for rate limit exceeded, and 500 for internal server errors.

## Example: Login Flow

Send a POST request to /api/v1/auth/login with a JSON body containing email, password, and turnstileToken fields. On success without 2FA, the response includes accessToken, refreshToken, and user object. If 2FA is enabled, the first response returns requiresTwoFactor: true with tempToken and methods array. Send a second POST to the same endpoint with email, password, twoFactorCode, twoFactorMethod, and tempToken to complete authentication.

## Example: Token List with Pagination

Send a GET request to /api/v1/tokens?sortBy=rating&limit=10&offset=0. The response includes a tokens array of token objects (each with assetCode, assetIssuer, tomlName, ratingAverage, image, and other metadata) and a pagination object with total (e.g., 342), limit (10), offset (0), and hasMore (true). Verified tokens include a resolved image URL pointing to self-hosted icons at /assets/icons/.

## Example: MoneyGram Deposit

Send a POST request to /api/v1/moneygram/deposit with a JSON body containing publicKey (the user's Stellar public key) and optionally amount (USD value). The server performs SEP-10 authentication with MoneyGram using the server signing key, then initiates a SEP-24 interactive deposit. The response includes transactionId, interactiveUrl (open in browser for KYC and payment), and type. After the user completes the flow at a MoneyGram location, poll GET /api/v1/moneygram/transaction/:id to check for completion.

## Example: Liquidity Pool Deposit

Send a GET request to /api/v1/earn/pools to browse available pools. Select a pool and send a POST request to /api/v1/earn/deposit with publicKey, poolId, maxAmountA, and maxAmountB. The server returns unsigned XDR. Sign the XDR client-side (self-custody) or via POST /api/v1/transactions/sign (delegated mode), then submit via POST /api/v1/transactions/submit. Check your positions at GET /api/v1/earn/positions/:publicKey.