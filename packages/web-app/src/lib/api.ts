import { API_BASE } from "./constants";

// ——— Token store for auth (memory-only, never persisted) ———
// Tokens are NOT persisted to browser storage to prevent XSS exfiltration.
// Trade-off: page refresh = logout (user must re-authenticate).
let _accessToken: string | null = null;
let _refreshToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  _accessToken = access;
  _refreshToken = refresh;
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
}

export function getAccessToken() {
  return _accessToken;
}

// ——— Base request with auto-refresh ———
async function request<T>(path: string, options?: RequestInit & { auth?: boolean }): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  if (options?.auth !== false && _accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && _refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${_accessToken}`;
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
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: _refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

// ——— Auth ———
export const authApi = {
  register: (data: { email: string; password: string; firstName?: string; lastName?: string; turnstileToken?: string }) =>
    request<any>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
      auth: false,
    } as any),

  login: (data: { email: string; password: string; turnstileToken?: string; twoFaToken?: string }) =>
    request<any>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
      auth: false,
    } as any),

  me: () => request<any>("/api/v1/auth/me"),

  updateProfile: (data: { firstName?: string; lastName?: string; preferredLanguage?: string; preferredNetwork?: string }) =>
    request<any>("/api/v1/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    request<any>("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  logout: () =>
    request<any>("/api/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: _refreshToken }),
    }).finally(() => clearTokens()),
};

// ——— User Wallets (server-side) ———
export const userWalletApi = {
  list: () => request<any[]>("/api/v1/wallets"),

  add: (data: { name: string; publicKey: string; encryptedSecret?: string; network?: string }) =>
    request<any>("/api/v1/wallets", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  activate: (id: number) => request<any>(`/api/v1/wallets/${id}/activate`, { method: "PATCH", body: JSON.stringify({}) }),
  rename: (id: number, name: string) => request<any>(`/api/v1/wallets/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  remove: (id: number) => request<any>(`/api/v1/wallets/${id}`, { method: "DELETE" }),
};

// ——— Tokens ———
export const tokenApi = {
  featured: () => request<any[]>("/api/v1/tokens/featured"),
  search: (query: string, sortBy = "rating", limit = 50) =>
    request<any[]>(`/api/v1/tokens?query=${encodeURIComponent(query)}&sortBy=${sortBy}&limit=${limit}`),
  list: (params: { sortBy?: string; limit?: number; offset?: number; query?: string; verified?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (params.query) p.set("query", params.query);
    if (params.sortBy) p.set("sortBy", params.sortBy);
    if (params.limit) p.set("limit", String(params.limit));
    if (params.offset) p.set("offset", String(params.offset));
    if (params.verified) p.set("verified", "true");
    return request<{ tokens: any[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }>(`/api/v1/tokens?${p.toString()}`);
  },
  priceHistory: (code: string, issuer: string, resolution = "86400000", limit = 30) =>
    request<{ candles: Array<{ timestamp: number; open: string; high: string; low: string; close: string; volume: string; tradeCount: number }>; resolution: string; baseAsset: string; counterAsset: string }>(
      `/api/v1/tokens/${encodeURIComponent(code)}/${encodeURIComponent(issuer)}/price-history?resolution=${resolution}&limit=${limit}`
    ),
  detail: (code: string, issuer: string) =>
    request<any>(`/api/v1/tokens/${encodeURIComponent(code)}/${encodeURIComponent(issuer)}`),
  userTokens: (publicKey: string) =>
    request<any[]>(`/api/v1/tokens/user/${publicKey}`),
  toggleFavorite: (publicKey: string, code: string, issuer: string) =>
    request<any>("/api/v1/tokens/favorite", {
      method: "POST",
      body: JSON.stringify({ publicKey, assetCode: code, assetIssuer: issuer }),
    }),
  searchAssets: (query: string, limit = 20) =>
    request<any>(`/api/v1/tokens/search-assets?query=${encodeURIComponent(query)}&limit=${limit}`),
};

// ——— Swap ———
export const swapApi = {
  quote: (params: { fromCode: string; fromIssuer: string; toCode: string; toIssuer: string; amount: string }) =>
    request<any[]>(`/api/v1/swap/quote?fromCode=${params.fromCode}&fromIssuer=${params.fromIssuer}&toCode=${params.toCode}&toIssuer=${params.toIssuer}&amount=${params.amount}`),
  build: (params: any) =>
    request<{ xdr: string; networkPassphrase: string }>("/api/v1/swap/build", {
      method: "POST",
      body: JSON.stringify(params),
    }),
};

// ——— Wallet (legacy Horizon helpers) ———
export const walletApi = {
  account: (publicKey: string) => request<any>(`/api/v1/wallet/${publicKey}`),
  fund: (publicKey: string) =>
    request<any>("/api/v1/wallet/fund", { method: "POST", body: JSON.stringify({ publicKey }) }),
};

// ——— Transactions ———
export const txApi = {
  submit: (signedXdr: string) =>
    request<any>("/api/v1/transactions/submit", {
      method: "POST",
      body: JSON.stringify({ signedXdr }),
    }),
  history: (publicKey: string, limit = 20, cursor?: string) =>
    request<any[]>(
      `/api/v1/transactions/${publicKey}?limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`
    ),
};

// ——— Signing Mode (Delegated) ———
export const signingApi = {
  getMode: () =>
    request<{ signingMode: string }>("/api/v1/user/signing-mode").then(
      (data) => data.signingMode as "self" | "delegated"
    ),

  setMode: (mode: "self" | "delegated") =>
    request<any>("/api/v1/user/signing-mode", {
      method: "PATCH",
      body: JSON.stringify({ mode }),
    }),

  sign: (xdr: string, networkPassphrase: string) =>
    request<{ signedXdr: string; networkPassphrase: string }>("/api/v1/transactions/sign", {
      method: "POST",
      body: JSON.stringify({ xdr, networkPassphrase }),
    }),

  signAndSubmit: (xdr: string, networkPassphrase: string, pin?: string) =>
    request<any>("/api/v1/transactions/sign-and-submit", {
      method: "POST",
      body: JSON.stringify({ xdr, networkPassphrase, pin }),
    }),
};

// ——— API Keys ———
export const apiKeyApi = {
  create: (name: string) =>
    request<{ id: number; name: string; key: string; createdAt: string; message: string }>(
      "/api/v1/api-keys",
      {
        method: "POST",
        body: JSON.stringify({ name }),
      }
    ),

  list: () =>
    request<
      {
        id: number;
        name: string;
        keyPreview: string;
        isActive: boolean;
        lastUsedAt: string | null;
        createdAt: string;
      }[]
    >("/api/v1/api-keys"),

  revoke: (id: number) =>
    request<{ success: boolean; message: string }>(`/api/v1/api-keys/${id}`, {
      method: "DELETE",
    }),
};

// ——— Keypair ———
export const keypairApi = {
  generate: () => request<{ publicKey: string; secretKey: string }>("/api/v1/keypair/generate"),
  fromSecret: (secret: string) =>
    request<{ publicKey: string }>("/api/v1/keypair/from-secret", {
      method: "POST",
      body: JSON.stringify({ secret }),
    }),
  validateMnemonic: (mnemonic: string) =>
    request<{ valid: boolean }>("/api/v1/keypair/validate-mnemonic", {
      method: "POST",
      body: JSON.stringify({ mnemonic }),
    }),
  fromMnemonic: (mnemonic: string, accountIndex = 0) =>
    request<{ publicKey: string; secretKey: string; accountIndex: number }>(
      "/api/v1/keypair/from-mnemonic",
      {
        method: "POST",
        body: JSON.stringify({ mnemonic, accountIndex }),
      }
    ),
};

// ——— Trustlines ———
export const trustlineApi = {
  list: (publicKey: string) =>
    request<any>(`/api/v1/trustlines/${publicKey}`),
  check: (publicKey: string, code: string, issuer: string) =>
    request<any>(`/api/v1/trustlines/check/${publicKey}/${code}/${issuer}`),
  add: (publicKey: string, code: string, issuer: string) =>
    request<any>("/api/v1/trustlines/add", {
      method: "POST",
      body: JSON.stringify({ publicKey, assetCode: code, assetIssuer: issuer }),
    }),
  remove: (publicKey: string, code: string, issuer: string) =>
    request<any>("/api/v1/trustlines/remove", {
      method: "POST",
      body: JSON.stringify({ publicKey, assetCode: code, assetIssuer: issuer }),
    }),
};

// ——— 2FA ———
export const twoFaApi = {
  status: () =>
    request<{ enabled: boolean; method: string }>("/api/v1/auth/2fa/status"),

  setup: (method: "totp" | "email" | "static" = "totp", staticCode?: string) =>
    request<any>("/api/v1/auth/2fa/setup", {
      method: "POST",
      body: JSON.stringify({ method, staticCode }),
    }),

  verify: (token: string) =>
    request<{ success: boolean; backupCodes: string[]; message: string }>("/api/v1/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  disable: (token: string, password: string) =>
    request<{ success: boolean; message: string }>("/api/v1/auth/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  sendEmailCode: (email?: string) =>
    email
      ? request<{ success: boolean }>("/api/v1/auth/2fa/send-email-code", {
          method: "POST",
          body: JSON.stringify({ email }),
        })
      : request<{ success: boolean }>("/api/v1/auth/2fa/send-code", {
          method: "POST",
          body: JSON.stringify({}),
        }),
};

export const contactsApi = {
  list: () => request<any[]>("/api/v1/contacts"),
  add: (data: { name: string; address: string; memo?: string; memoType?: string; notes?: string }) =>
    request<any>("/api/v1/contacts", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; memo?: string; memoType?: string; notes?: string }) =>
    request<any>("/api/v1/contacts/" + id, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) =>
    request<any>("/api/v1/contacts/" + id, { method: "DELETE" }),
};

export const fiatApi = {
  currencies: () => request<any>("/api/v1/fiat/currencies"),
  buyQuote: (fiatCurrency: string, fiatAmount: number, targetAsset = "XLM") =>
    request<any>("/api/v1/fiat/quote/buy", {
      method: "POST",
      body: JSON.stringify({ fiatCurrency, fiatAmount, targetAsset }),
    }),
  sellQuote: (fiatCurrency: string, cryptoAmount: number, sourceAsset = "XLM") =>
    request<any>("/api/v1/fiat/quote/sell", {
      method: "POST",
      body: JSON.stringify({ fiatCurrency, cryptoAmount, sourceAsset }),
    }),
  buy: (quoteId: string, paymentMethod: string, destinationAddress: string) =>
    request<any>("/api/v1/fiat/buy", {
      method: "POST",
      body: JSON.stringify({ quoteId, paymentMethod, destinationAddress }),
    }),
  sell: (quoteId: string, bankDetails?: any) =>
    request<any>("/api/v1/fiat/sell", {
      method: "POST",
      body: JSON.stringify({ quoteId, bankDetails }),
    }),
};

export const portfolioApi = {
  snapshot: () => request<any>("/api/v1/portfolio/snapshot", { method: "POST" }),
  history: (days = 30) => request<any>("/api/v1/portfolio/history?days=" + days),
  summary: () => request<any>("/api/v1/portfolio/summary"),
};

export const moneygramApi = {
  info: () => request<any>("/api/v1/moneygram/info"),
  deposit: (publicKey: string, amount?: string) =>
    request<any>("/api/v1/moneygram/deposit", {
      method: "POST",
      body: JSON.stringify({ publicKey, amount }),
    }),
  withdraw: (publicKey: string, amount?: string) =>
    request<any>("/api/v1/moneygram/withdraw", {
      method: "POST",
      body: JSON.stringify({ publicKey, amount }),
    }),
  transactionStatus: (id: string, publicKey: string) =>
    request<any>(`/api/v1/moneygram/transaction/${id}?publicKey=${publicKey}`),
};

export const earnApi = {
  pools: (asset?: string, limit = 20) =>
    request<any>(`/api/v1/earn/pools?${asset ? "asset=" + asset + "&" : ""}limit=${limit}`),
  positions: (publicKey: string) =>
    request<any>(`/api/v1/earn/positions/${publicKey}`),
  deposit: (publicKey: string, poolId: string, maxAmountA: string, maxAmountB: string) =>
    request<any>("/api/v1/earn/deposit", {
      method: "POST",
      body: JSON.stringify({ publicKey, poolId, maxAmountA, maxAmountB }),
    }),
  withdraw: (publicKey: string, poolId: string, shares: string) =>
    request<any>("/api/v1/earn/withdraw", {
      method: "POST",
      body: JSON.stringify({ publicKey, poolId, shares }),
    }),
};


// ─── NFTs (SEP-50 Soroban + SEP-39 Classic) ───────────────
export const nftApi = {
  collections: (limit = 50, offset = 0, network?: string) => {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (network) qs.set("network", network);
    return request<{ collections: any[]; total: number }>(`/api/v1/nfts/collections?${qs}`);
  },
  collection: (id: number) => request<any>(`/api/v1/nfts/collections/${id}`),
  tokensByOwner: (publicKey: string, includeClassicScan = false, limit = 50, offset = 0) => {
    const qs = new URLSearchParams({
      limit: String(limit), offset: String(offset),
      includeClassicScan: String(includeClassicScan),
    });
    return request<{ indexed: { tokens: any[]; total: number }; classicNfts: any[] }>(
      `/api/v1/nfts/owner/${publicKey}?${qs}`
    );
  },
  classicScan: (publicKey: string) => request<any[]>(`/api/v1/nfts/classic/${publicKey}`),
  transfer: (body: { contractId: string; fromAddress: string; toAddress: string; tokenId: number }) =>
    request<{ xdr: string; networkPassphrase: string }>(
      "/api/v1/nfts/transfer", { method: "POST", body: JSON.stringify(body) }
    ),
};
