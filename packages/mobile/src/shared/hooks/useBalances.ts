import { useQuery } from "@tanstack/react-query";
import { useWalletStore } from "../store/wallet";
import { tokenApi } from "../lib/api";

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

async function fetchBalancesFromHorizon(publicKey: string, network: "testnet" | "public"): Promise<TokenBalance[]> {
  const horizonUrl = network === "testnet"
    ? "https://horizon-testnet.stellar.org"
    : "https://horizon.stellar.org";
  const url = `${horizonUrl}/accounts/${publicKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Horizon error: ${res.status}`);
  }
  const data = await res.json();
  return data.balances.map((b: any) => ({
    assetCode: b.asset_type === "native" ? "XLM" : b.asset_code,
    assetIssuer: b.asset_type === "native" ? null : b.asset_issuer,
    assetType: b.asset_type,
    balance: b.balance,
    token: b.asset_type === "native"
      ? { tomlName: "Stellar Lumens", tomlImage: "https://cryptologos.cc/logos/stellar-xlm-logo.png", domain: "stellar.org", isVerified: true, ratingAverage: 5 }
      : null,
    isFavorite: false,
  }));
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
      if (network === "public") {
        return fetchBalancesFromHorizon(publicKey, network);
      }
      return tokenApi.userTokens(publicKey);
    },
    enabled: !!publicKey,
    refetchInterval: 15_000,
  });
}
