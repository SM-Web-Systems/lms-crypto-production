import { useQuery } from "@tanstack/react-query";
import { tokenApi } from "../lib/api";
import { useWalletStore } from "../store/wallet";
import { fetchBalancesFromHorizon } from "../lib/horizon";

export interface TokenBalance {
  assetCode: string;
  assetIssuer: string;
  balance: string;
  assetType: string;
  token?: {
    tomlName: string;
    tomlImage: string;
    domain: string;
    isVerified: boolean;
    ratingAverage: number;
  };
  isFavorite: boolean;
}

function normalizeBalance(b: any): TokenBalance {
  return {
    assetCode:
      b.assetCode ||
      b.asset_code ||
      (b.assetType === "native" || b.asset_type === "native" ? "XLM" : "Unknown"),
    assetIssuer: b.assetIssuer || b.asset_issuer || "native",
    balance: b.balance || "0",
    assetType: b.assetType || b.asset_type || "unknown",
    token: b.token
      ? {
          tomlName: b.token.tomlName || b.token.toml_name || "",
          tomlImage: b.token.tomlImage || b.token.toml_image || "",
          domain: b.token.domain || b.token.homeDomain || b.token.home_domain || "",
          isVerified: b.token.isVerified ?? b.token.is_verified ?? false,
          ratingAverage: Number(b.token.ratingAverage ?? b.token.rating_average ?? 0),
        }
      : undefined,
    isFavorite: b.isFavorite ?? b.is_favorite ?? false,
  };
}

function unwrap(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.balances)) return raw.balances;
  if (Array.isArray(raw.tokens)) return raw.tokens;
  return [];
}

export function useBalances() {
  const publicKey = useWalletStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? null
  );
  const network = useWalletStore((s) => s.network);

  return useQuery<TokenBalance[]>({
    queryKey: ["balances", publicKey, network],
    queryFn: async () => {
      if (!publicKey) return [];
      try {
        // Always try Horizon first (works for both testnet & public)
        const horizonBalances = await fetchBalancesFromHorizon(publicKey, network);
        if (horizonBalances.length > 0) {
          // Enrich with backend token metadata
          try {
            const backendRaw = await tokenApi.userTokens(publicKey);
            const backendBalances = unwrap(backendRaw);
            const metaMap = new Map<string, any>();
            for (const b of backendBalances) {
              const code = b.assetCode || b.asset_code || "";
              const issuer = b.assetIssuer || b.asset_issuer || "native";
              metaMap.set(`${code}-${issuer}`, b);
            }
            return horizonBalances.map((hb: any) => {
              const key = `${hb.assetCode}-${hb.assetIssuer}`;
              const meta = metaMap.get(key);
              return normalizeBalance({
                ...hb,
                token: meta?.token || hb.token,
                isFavorite: meta?.isFavorite ?? meta?.is_favorite ?? hb.isFavorite,
              });
            });
          } catch {
            return horizonBalances.map(normalizeBalance);
          }
        }
        return [];
      } catch {
        // Horizon failed — try backend as fallback
        try {
          const raw = await tokenApi.userTokens(publicKey);
          return unwrap(raw).map(normalizeBalance);
        } catch {
          return [];
        }
      }
    },
    enabled: !!publicKey,
    refetchInterval: 15_000,
  });
}
