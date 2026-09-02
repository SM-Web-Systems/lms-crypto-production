import { useAuthStore } from "../store/auth";

const API_BASE = "https://ammawallet.com";

async function request(path: string, options: RequestInit = {}) {
  const { accessToken, refreshSession } = useAuthStore.getState();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && accessToken) {
    const refreshed = await refreshSession();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${useAuthStore.getState().accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function horizonUrl(publicKey?: string) {
  const network = useAuthStore.getState().user?.preferredNetwork || "testnet";
  const base =
    network === "mainnet"
      ? "https://horizon.stellar.org"
      : "https://horizon-testnet.stellar.org";
  return publicKey ? `${base}/accounts/${publicKey}` : base;
}

// ─── Auth ──────────────────────────────────────────────────
export const authApi = {
  register: (data: {
    email?: string;
    password: string;
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
  }) =>
    request("/api/v1/auth/register", { method: "POST", body: JSON.stringify(data) }),

  login: (data: {
    email?: string;
    phoneNumber?: string;
    password: string;
    twoFaToken?: string;
  }) =>
    request("/api/v1/auth/login", { method: "POST", body: JSON.stringify(data) }),

  me: () => request("/api/v1/auth/me"),

  updateProfile: (data: Record<string, any>) =>
    request("/api/v1/auth/profile", { method: "PATCH", body: JSON.stringify(data) }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  forgotPassword: (email: string) =>
    request("/api/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    request("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }),

  logout: (refreshToken: string) =>
    request("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),

  resendVerification: () =>
    request("/api/v1/auth/resend-verification", { method: "POST" }),
};

// ─── Tokens ────────────────────────────────────────────────
export const tokenApi = {
  featured: () => request("/api/v1/tokens/featured"),
  search: (query: string, network: string = "pubnet") => request(`/api/v1/tokens?query=${encodeURIComponent(query)}&network=${network}`),
  userTokens: (pubKey: string) => request(`/api/v1/tokens/user/${pubKey}`),
  detail: (code: string, issuer: string) => request(`/api/v1/tokens/${code}/${issuer}`),
  toggleFavorite: (publicKey: string, tokenId: number) =>
    request("/api/v1/tokens/favorite", {
      method: "POST",
      body: JSON.stringify({ publicKey, tokenId }),
    }),
};

// ─── Swap ──────────────────────────────────────────────────
export const swapApi = {
  quote: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/v1/swap/quote?${qs}`);
  },
  build: (body: any) =>
    request("/api/v1/swap/build", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

// ─── Wallet ────────────────────────────────────────────────
export const walletApi = {
  accountInfo: (pubKey: string) => request(`/api/v1/wallet/${pubKey}`),
  fund: (publicKey: string) =>
    request("/api/v1/wallet/fund", {
      method: "POST",
      body: JSON.stringify({ publicKey }),
    }),
  list: () => request("/api/v1/wallets"),
  add: (body: { name: string; publicKey: string; encryptedSecret?: string; network?: string }) =>
    request("/api/v1/wallets", { method: "POST", body: JSON.stringify(body) }),
  activate: (id: number) =>
    request(`/api/v1/wallets/${id}/activate`, { method: "PATCH" }),
  rename: (id: number, name: string) =>
    request(`/api/v1/wallets/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  remove: (id: number) =>
    request(`/api/v1/wallets/${id}`, { method: "DELETE" }),
};

// ─── Transactions ──────────────────────────────────────────
export const txApi = {
  history: (pubKey: string, limit = 20, cursor?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return request(`/api/v1/transactions/${pubKey}?${params}`);
  },
  submit: (signedXdr: string) =>
    request("/api/v1/transactions/submit", {
      method: "POST",
      body: JSON.stringify({ signedXdr }),
    }),
};

// ─── Keypair ───────────────────────────────────────────────
export const keypairApi = {
  generate: () => request("/api/v1/keypair/generate"),
  fromSecret: (secret: string) =>
    request("/api/v1/keypair/from-secret", {
      method: "POST",
      body: JSON.stringify({ secret }),
    }),
};

export function buildPaymentTx(params: {
  source: string;
  destination: string;
  amount: string;
  assetCode: string;
  assetIssuer?: string;
  memo?: string;
  network?: string;
}) {
  return params;
}

// ─── Trustlines ────────────────────────────────────────────
export const trustlineApi = {
  list: (publicKey: string) =>
    fetch(`${API_BASE}/api/v1/trustlines/${publicKey}`).then((r) => r.json()),
  check: (publicKey: string, code: string, issuer: string) =>
    fetch(`${API_BASE}/api/v1/trustlines/check/${publicKey}/${code}/${issuer}`).then((r) => r.json()),
  buildAdd: (publicKey: string, assetCode: string, assetIssuer: string) =>
    fetch(`${API_BASE}/api/v1/trustlines/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey, assetCode, assetIssuer }),
    }).then((r) => r.json()),
  buildRemove: (publicKey: string, assetCode: string, assetIssuer: string) =>
    fetch(`${API_BASE}/api/v1/trustlines/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey, assetCode, assetIssuer }),
    }).then((r) => r.json()),
};

// ─── Signing ───────────────────────────────────────────────
export const signingApi = {
  getMode: () =>
    request("/api/v1/user/signing-mode").then((data: any) => data.signingMode as "self" | "delegated"),
  setMode: (mode: "self" | "delegated") =>
    request("/api/v1/user/signing-mode", {
      method: "PATCH",
      body: JSON.stringify({ mode }),
    }),
  sign: (xdr: string, networkPassphrase: string) =>
    request("/api/v1/transactions/sign", {
      method: "POST",
      body: JSON.stringify({ xdr, networkPassphrase }),
    }),
  signAndSubmit: (xdr: string, networkPassphrase: string) =>
    request("/api/v1/transactions/sign-and-submit", {
      method: "POST",
      body: JSON.stringify({ xdr, networkPassphrase }),
    }),
};

// ─── Contacts ──────────────────────────────────────────────
export const contactsApi = {
  list: () => request("/api/v1/contacts"),
  add: (data: { name: string; address: string; memo?: string; notes?: string }) =>
    request("/api/v1/contacts", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; address?: string; memo?: string; notes?: string }) =>
    request(`/api/v1/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => request(`/api/v1/contacts/${id}`, { method: "DELETE" }),
};

// ─── Earn / Liquidity Pools ────────────────────────────────
export const earnApi = {
  pools: (params?: { asset?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.asset) qs.set("asset", params.asset);
    if (params?.limit) qs.set("limit", String(params.limit));
    return request(`/api/v1/earn/pools?${qs}`);
  },
  positions: (publicKey: string) =>
    request(`/api/v1/earn/positions/${publicKey}`),
  deposit: (body: { publicKey: string; poolId: string; maxAmountA: string; maxAmountB: string }) =>
    request("/api/v1/earn/deposit", { method: "POST", body: JSON.stringify(body) }),
  withdraw: (body: { publicKey: string; poolId: string; shares: string }) =>
    request("/api/v1/earn/withdraw", { method: "POST", body: JSON.stringify(body) }),
};

// ─── Fiat Ramp ─────────────────────────────────────────────
export const fiatApi = {
  currencies: () => request("/api/v1/fiat/currencies"),
  quoteBuy: (b: { fiatCurrency: string; fiatAmount: number; targetAsset?: string }) =>
    request("/api/v1/fiat/quote/buy", { method: "POST", body: JSON.stringify(b) }),
  quoteSell: (b: { fiatCurrency: string; cryptoAmount: number; sourceAsset?: string }) =>
    request("/api/v1/fiat/quote/sell", { method: "POST", body: JSON.stringify(b) }),
  buy: (b: { quoteId: string; paymentMethod: string; destinationAddress?: string }) =>
    request("/api/v1/fiat/buy", { method: "POST", body: JSON.stringify(b) }),
  sell: (b: { quoteId: string; bankDetails?: Record<string, string> }) =>
    request("/api/v1/fiat/sell", { method: "POST", body: JSON.stringify(b) }),
};

// ─── MoneyGram (SEP-10/24) ─────────────────────────────────
export const moneygramApi = {
  info: () => request("/api/v1/moneygram/info"),
  deposit: (body: { publicKey: string; amount?: string }) =>
    request("/api/v1/moneygram/deposit", { method: "POST", body: JSON.stringify(body) }),
  withdraw: (body: { publicKey: string; amount: string }) =>
    request("/api/v1/moneygram/withdraw", { method: "POST", body: JSON.stringify(body) }),
  transactionStatus: (id: string, publicKey: string) =>
    request(`/api/v1/moneygram/transaction/${id}?publicKey=${publicKey}`),
};

// ─── Portfolio ─────────────────────────────────────────────
export const portfolioApi = {
  snapshot: () => request("/api/v1/portfolio/snapshot", { method: "POST" }),
  history: (days: number = 30, walletPublicKey?: string) => {
    const qs = new URLSearchParams({ days: String(days) });
    if (walletPublicKey) qs.set("walletPublicKey", walletPublicKey);
    return request(`/api/v1/portfolio/history?${qs}`);
  },
  summary: () => request("/api/v1/portfolio/summary"),
};

// ─── Price History ─────────────────────────────────────────
export const priceApi = {
  history: (code: string, issuer: string, resolution = 86400000, limit = 30) =>
    request(
      `/api/v1/tokens/${encodeURIComponent(code)}/${encodeURIComponent(issuer)}/price-history?resolution=${resolution}&limit=${limit}`
    ),
};

// ─── Two-Factor Auth ───────────────────────────────────────
export const twoFactorApi = {
  setup: () => request("/api/v1/2fa/setup", { method: "POST" }),
  verify: (code: string) =>
    request("/api/v1/2fa/verify", { method: "POST", body: JSON.stringify({ code }) }),
  disable: (code: string) =>
    request("/api/v1/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),
  backupCodes: () => request("/api/v1/2fa/backup-codes"),
};

// ─── NFTs (SEP-50 Soroban + SEP-39 Classic) ───────────────
export const nftApi = {
  collections: (limit = 50, offset = 0, network?: string) => {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (network) qs.set("network", network);
    return request<{ collections: any[]; total: number }>(`/api/v1/nfts/collections?${qs}`);
  },
  collection: (id: number) =>
    request<any>(`/api/v1/nfts/collections/${id}`),
  createCollection: (body: {
    name: string; standard: "sep50" | "sep39";
    contractId?: string; issuerAddress?: string;
    symbol?: string; description?: string; imageUrl?: string;
  }) => request<any>("/api/v1/nfts/collections", { method: "POST", body: JSON.stringify(body) }),
  tokensByOwner: (publicKey: string, includeClassicScan = false, limit = 50, offset = 0) => {
    const qs = new URLSearchParams({
      limit: String(limit), offset: String(offset),
      includeClassicScan: String(includeClassicScan),
    });
    return request<{ indexed: { tokens: any[]; total: number }; classicNfts: any[] }>(
      `/api/v1/nfts/owner/${publicKey}?${qs}`
    );
  },
  classicScan: (publicKey: string) =>
    request<any[]>(`/api/v1/nfts/classic/${publicKey}`),
  transfer: (body: { contractId: string; fromAddress: string; toAddress: string; tokenId: number }) =>
    request<{ xdr: string; networkPassphrase: string }>(
      "/api/v1/nfts/transfer", { method: "POST", body: JSON.stringify(body) }
    ),
};
