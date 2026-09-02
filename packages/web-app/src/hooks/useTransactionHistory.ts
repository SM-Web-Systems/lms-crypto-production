import { useQuery } from "@tanstack/react-query";
import { txApi } from "../lib/api";
import { useWalletStore } from "../store/wallet";

export function useTransactionHistory(limit = 20) {
  const publicKey = useWalletStore(
  (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? null
);

  return useQuery({
    queryKey: ["tx-history", publicKey, limit],
    queryFn: () => txApi.history(publicKey!, limit),
    enabled: !!publicKey,
    refetchInterval: 30_000,
  });
}
