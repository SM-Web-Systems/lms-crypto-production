const API_BASE =
  import.meta.env.VITE_API_URL || "https://ammawallet.com";

// ─── Token storage ─────────────────────────────────────────
const ACCESS_KEY = "stellar_ext_access_token";
const REFRESH_KEY = "stellar_ext_refresh_token";

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

// ─── Core request wrapper ──────────────────────────────────
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${getAccessToken()}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
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
    request<{ user: any; accessToken: string; refreshToken: string }>(
      "/api/v1/auth/register",
      { method: "POST", body: JSON.stringify(data) }
    ),

  login: (identifier: string, password: string, twoFaToken?: string) => {
    const body: Record<string, string> = { password };
    if (identifier.startsWith("+")) {
      body.phoneNumber = identifier;
    } else {
      body.email = identifier;
    }
    if (twoFaToken) body.twoFaToken = twoFaToken;
    return request<{ user: any; accessToken: string; refreshToken: string; twoFaRequired?: boolean; twoFaMethod?: string; message?: string }>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify(body) }
    );
  },

  me: () => request<any>("/api/v1/auth/me"),

  updateProfile: (data: Record<string, any>) =>
    request<any>("/api/v1/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>("/api/v1/auth/change-password", {
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

  resendVerification: () =>
    request("/api/v1/auth/resend-verification", { method: "POST" }),

  logout: () => {
    const refreshToken = getRefreshToken();
    return request<{ message: string }>("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  },
};

// ─── Tokens ────────────────────────────────────────────────
export const tokenApi = {
  featured: () => request<any[]>("/api/v1/tokens/featured"),
  search: (query: string, sortBy = "rating", limit = 50, network = "pubnet") =>
    request<any[]>(
      `/api/v1/tokens?query=${encodeURIComponent(query)}&sortBy=${sortBy}&limit=${limit}&network=${network}`
    ),
  detail: (code: string, issuer: string) =>
    request<any>(
      `/api/v1/tokens/${encodeURIComponent(code)}/${encodeURIComponent(issuer)}`
    ),
  userTokens: (publicKey: string) =>
    request<any[]>(`/api/v1/tokens/user/${publicKey}`),
  toggleFavorite: (publicKey: string, code: string, issuer: string) =>
    request<any>("/api/v1/tokens/favorite", {
      method: "POST",
      body: JSON.stringify({
        publicKey,
        assetCode: code,
        assetIssuer: issuer,
      }),
    }),
};

// ─── Swap ──────────────────────────────────────────────────
export const swapApi = {
  quote: (params: {
    fromCode: string;
    fromIssuer: string;
    toCode: string;
    toIssuer: string;
    amount: string;
  }) =>
    request<any[]>(
      `/api/v1/swap/quote?fromCode=${params.fromCode}&fromIssuer=${params.fromIssuer}&toCode=${params.toCode}&toIssuer=${params.toIssuer}&amount=${params.amount}`
    ),
  build: (params: any) =>
    request<{ xdr: string; networkPassphrase: string }>("/api/v1/swap/build", {
      method: "POST",
      body: JSON.stringify(params),
    }),
};

// ─── Wallet ────────────────────────────────────────────────
export const walletApi = {
  account: (publicKey: string) =>
    request<any>(`/api/v1/wallet/${publicKey}`),
  fund: (publicKey: string) =>
    request<any>("/api/v1/wallet/fund", {
      method: "POST",
      body: JSON.stringify({ publicKey }),
    }),
};

// ─── Transactions ──────────────────────────────────────────
export const txApi = {
  submit: (xdr: string, network: string) =>
    request<any>("/api/v1/transactions/submit", {
      method: "POST",
      body: JSON.stringify({ xdr, networkPassphrase: network }),
    }),
  history: (publicKey: string, limit = 20, cursor?: string) =>
    request<any[]>(
      `/api/v1/transactions/${publicKey}?limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`
    ),
};

// ─── User Wallets ──────────────────────────────────────────
export const userWalletApi = {
  list: () => request<any[]>("/api/v1/wallets"),

  add: (data: {
    name: string;
    publicKey: string;
    encryptedSecret?: string;
    network?: string;
  }) =>
    request<any>("/api/v1/wallets", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  activate: (id: number) =>
    request<any>(`/api/v1/wallets/${id}/activate`, {
      method: "PATCH",
      body: JSON.stringify({}),
    }),

  rename: (id: number, name: string) =>
    request<any>(`/api/v1/wallets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  remove: (id: number) => request<any>(`/api/v1/wallets/${id}`, { method: "DELETE" }),
};

// ─── Signing ───────────────────────────────────────────────
export const signingApi = {
  getMode: () =>
    request<{ signingMode: "self" | "delegated" }>("/api/v1/user/signing-mode").then(
      (data) => data.signingMode
    ),

  setMode: (mode: "self" | "delegated") =>
    request<any>("/api/v1/user/signing-mode", {
      method: "PATCH",
      body: JSON.stringify({ mode }),
    }),

  sign: (xdr: string, networkPassphrase: string) =>
    request<{ signedXdr: string }>("/api/v1/transactions/sign", {
      method: "POST",
      body: JSON.stringify({ xdr, networkPassphrase }),
    }),

  signAndSubmit: (xdr: string, networkPassphrase: string) =>
    request<any>("/api/v1/transactions/sign-and-submit", {
      method: "POST",
      body: JSON.stringify({ xdr, networkPassphrase }),
    }),
};

// ─── Keypair ───────────────────────────────────────────────
export const keypairApi = {
  generate: () => request<{ publicKey: string; secretKey: string }>("/api/v1/keypair/generate"),
  fromSecret: (secret: string) =>
    request<{ publicKey: string }>("/api/v1/keypair/from-secret", {
      method: "POST",
      body: JSON.stringify({ secretKey: secret }),
    }),
  validateMnemonic: (mnemonic: string) =>
    request<{ valid: boolean }>("/api/v1/keypair/validate-mnemonic", {
      method: "POST",
      body: JSON.stringify({ mnemonic }),
    }),
  fromMnemonic: (mnemonic: string, accountIndex = 0) =>
    request<{ publicKey: string; secretKey: string }>("/api/v1/keypair/from-mnemonic", {
      method: "POST",
      body: JSON.stringify({ mnemonic, accountIndex }),
    }),
};

// ─── Contacts ──────────────────────────────────────────────
export const contactsApi = {
  list: () => request<any[]>("/api/v1/contacts"),
  add: (data: { name: string; address: string; memo?: string; notes?: string }) =>
    request<any>("/api/v1/contacts", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; address?: string; memo?: string; notes?: string }) =>
    request<any>(`/api/v1/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => request<any>(`/api/v1/contacts/${id}`, { method: "DELETE" }),
};

// ─── Earn / Liquidity Pools ────────────────────────────────
export const earnApi = {
  pools: (params?: { asset?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.asset) qs.set("asset", params.asset);
    if (params?.limit) qs.set("limit", String(params.limit));
    return request<any>(`/api/v1/earn/pools?${qs}`);
  },
  positions: (publicKey: string) =>
    request<any>(`/api/v1/earn/positions/${publicKey}`),
  deposit: (body: { publicKey: string; poolId: string; maxAmountA: string; maxAmountB: string }) =>
    request<any>("/api/v1/earn/deposit", { method: "POST", body: JSON.stringify(body) }),
  withdraw: (body: { publicKey: string; poolId: string; shares: string }) =>
    request<any>("/api/v1/earn/withdraw", { method: "POST", body: JSON.stringify(body) }),
};

// ─── Fiat Ramp ─────────────────────────────────────────────
export const fiatApi = {
  currencies: () => request("/api/v1/fiat/currencies"),
  quoteBuy: (b: { fiatCurrency: string; fiatAmount: number; targetAsset?: string }) =>
    request("/api/v1/fiat/quote/buy", { method: "POST", body: JSON.stringify(b) }),
  quoteSell: (b: { fiatCurrency: string; cryptoAmount: number; sourceAsset?: string }) =>
    request("/api/v1/fiat/quote/sell", { method: "POST", body: JSON.stringify(b) }),
  buy: (b: any) => request("/api/v1/fiat/buy", { method: "POST", body: JSON.stringify(b) }),
  sell: (b: any) => request("/api/v1/fiat/sell", { method: "POST", body: JSON.stringify(b) }),
};

// ─── MoneyGram (SEP-10/24) ─────────────────────────────────
export const moneygramApi = {
  info: () => request<any>("/api/v1/moneygram/info"),
  deposit: (body: { publicKey: string; amount?: string }) =>
    request<any>("/api/v1/moneygram/deposit", { method: "POST", body: JSON.stringify(body) }),
  withdraw: (body: { publicKey: string; amount: string }) =>
    request<any>("/api/v1/moneygram/withdraw", { method: "POST", body: JSON.stringify(body) }),
  transactionStatus: (id: string, publicKey: string) =>
    request<any>(`/api/v1/moneygram/transaction/${id}?publicKey=${publicKey}`),
};

// ─── Portfolio ─────────────────────────────────────────────
export const portfolioApi = {
  snapshot: () => request("/api/v1/portfolio/snapshot", { method: "POST" }),
  history: (days = 30, walletPublicKey?: string) => {
    const qs = new URLSearchParams({ days: String(days) });
    if (walletPublicKey) qs.set("walletPublicKey", walletPublicKey);
    return request(`/api/v1/portfolio/history?${qs}`);
  },
  summary: () => request("/api/v1/portfolio/summary"),
};

// ─── Price History ─────────────────────────────────────────
export const priceApi = {
  history: (code: string, issuer: string, resolution = 86400000, limit = 30) =>
    request<any>(
      `/api/v1/tokens/${encodeURIComponent(code)}/${encodeURIComponent(issuer)}/price-history?resolution=${resolution}&limit=${limit}`
    ),
};

// ─── Two-Factor Auth ───────────────────────────────────────
export const twoFactorApi = {
  setup: () => request<any>("/api/v1/2fa/setup", { method: "POST" }),
  verify: (code: string) =>
    request<any>("/api/v1/2fa/verify", { method: "POST", body: JSON.stringify({ code }) }),
  disable: (code: string) =>
    request<any>("/api/v1/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),
  backupCodes: () => request<any>("/api/v1/2fa/backup-codes"),
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
  tokensByCollection: (collectionId: number, limit = 50, offset = 0) =>
    request<{ tokens: any[]; total: number }>(
      `/api/v1/nfts/collections/${collectionId}/tokens?limit=${limit}&offset=${offset}`
    ),
  tokenDetail: (collectionId: number, tokenId: string) =>
    request<any>(`/api/v1/nfts/token/${collectionId}/${tokenId}`),
  sep50Metadata: (contractId: string) =>
    request<any>(`/api/v1/nfts/sep50/${contractId}/metadata`),
  sep50Token: (contractId: string, tokenId: number) =>
    request<any>(`/api/v1/nfts/sep50/${contractId}/token/${tokenId}`),
  classicScan: (publicKey: string) =>
    request<any[]>(`/api/v1/nfts/classic/${publicKey}`),
  transfer: (body: { contractId: string; fromAddress: string; toAddress: string; tokenId: number }) =>
    request<{ xdr: string; networkPassphrase: string }>(
      "/api/v1/nfts/transfer", { method: "POST", body: JSON.stringify(body) }
    ),
};
