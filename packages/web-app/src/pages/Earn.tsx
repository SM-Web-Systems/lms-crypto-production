import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { earnApi } from "../lib/api";
import { useWalletStore } from "../store/wallet";
import { Droplets, TrendingUp, Loader2, Search, Percent, Users, ChevronDown, ChevronUp, Wallet } from "lucide-react";

interface Reserve {
  asset: string;
  issuer: string | null;
  amount: string;
}

interface Pool {
  id: string;
  feeBp: number;
  feePercent: string;
  totalShares: string;
  totalTrustlines: string;
  reserves: Reserve[];
  lastModified: string;
}

interface Position {
  poolId: string;
  shares: string;
  sharePercent: string;
  reserves: Array<Reserve & { userAmount: string; totalAmount: string }>;
  feeBp: number;
  totalShares: string;
}

export default function EarnPage() {
  const { t } = useTranslation();
  const activeAccount = useWalletStore((s) => s.activeAccount());
  const [assetFilter, setAssetFilter] = useState("");
  const [expandedPool, setExpandedPool] = useState<string | null>(null);

  const { data: poolsData, isLoading: poolsLoading } = useQuery({
    queryKey: ["earn-pools", assetFilter],
    queryFn: () => earnApi.pools(assetFilter || undefined, 50),
  });

  const { data: positionsData, isLoading: positionsLoading } = useQuery({
    queryKey: ["earn-positions", activeAccount?.publicKey],
    queryFn: () => earnApi.positions(activeAccount!.publicKey),
    enabled: !!activeAccount,
  });

  const pools: Pool[] = poolsData?.pools || [];
  const positions: Position[] = positionsData?.positions || [];

  const formatAmount = (amount: string) => {
    const n = parseFloat(amount);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
    return n.toFixed(2);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stellar-text flex items-center gap-2">
          <Droplets size={28} className="text-stellar-blue" />
          {t("earn.title", "Earn")}
        </h1>
      </div>

      <p className="text-stellar-muted text-sm">
        {t("earn.description", "Provide liquidity to Stellar DEX pools and earn a share of trading fees. Each pool charges 0.30% per trade, distributed proportionally to liquidity providers.")}
      </p>

      {positions.length > 0 && (
        <div className="bg-stellar-card rounded-xl border border-stellar-border p-5 space-y-4">
          <h2 className="text-lg font-semibold text-stellar-text flex items-center gap-2">
            <Wallet size={20} className="text-stellar-success" />
            {t("earn.yourPositions", "Your Positions")}
          </h2>
          {positions.map((pos) => (
            <div key={pos.poolId} className="bg-stellar-dark rounded-lg p-4 border border-stellar-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-stellar-text">
                  {pos.reserves.map((r) => r.asset).join(" / ")}
                </span>
                <span className="text-xs bg-stellar-success/20 text-stellar-success px-2 py-0.5 rounded-full">
                  {pos.sharePercent}% of pool
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {pos.reserves.map((r) => (
                  <div key={r.asset} className="flex justify-between">
                    <span className="text-stellar-muted">{r.asset}</span>
                    <span className="text-stellar-text">{formatAmount(r.userAmount)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-xs text-stellar-muted">
                <span>Shares: {formatAmount(pos.shares)}</span>
                <span>Fee: {(pos.feeBp / 100).toFixed(2)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-stellar-card rounded-xl border border-stellar-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stellar-text flex items-center gap-2">
            <TrendingUp size={20} className="text-stellar-blue" />
            {t("earn.availablePools", "Available Pools")}
          </h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
            <input
              type="text"
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value.toUpperCase())}
              placeholder="Filter by asset..."
              className="pl-8 pr-3 py-1.5 text-xs bg-stellar-dark border border-stellar-border rounded-lg text-stellar-text placeholder-stellar-muted/50 focus:outline-none focus:border-stellar-blue w-40"
            />
          </div>
        </div>

        {poolsLoading || positionsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-stellar-blue" />
          </div>
        ) : pools.length === 0 ? (
          <p className="text-stellar-muted text-sm text-center py-8">
            {t("earn.noPools", "No liquidity pools found")}
          </p>
        ) : (
          <div className="space-y-2">
            {pools.map((pool) => {
              const isExpanded = expandedPool === pool.id;
              const pairName = pool.reserves.map((r) => r.asset).join(" / ");
              return (
                <div key={pool.id} className="bg-stellar-dark rounded-lg border border-stellar-border overflow-hidden">
                  <button
                    onClick={() => setExpandedPool(isExpanded ? null : pool.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-stellar-border/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-stellar-blue/20 flex items-center justify-center">
                        <Droplets size={18} className="text-stellar-blue" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stellar-text">{pairName}</p>
                        <p className="text-xs text-stellar-muted">
                          {pool.reserves.map((r) => formatAmount(r.amount) + " " + r.asset).join(" + ")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <div className="flex items-center gap-1 text-xs text-stellar-success">
                          <Percent size={12} />
                          <span>{pool.feePercent}% fee</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-stellar-muted">
                          <Users size={12} />
                          <span>{pool.totalTrustlines} providers</span>
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp size={16} className="text-stellar-muted" /> : <ChevronDown size={16} className="text-stellar-muted" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-stellar-border pt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-stellar-muted">Total Shares</span>
                          <p className="text-stellar-text font-medium">{formatAmount(pool.totalShares)}</p>
                        </div>
                        <div>
                          <span className="text-stellar-muted">Providers</span>
                          <p className="text-stellar-text font-medium">{pool.totalTrustlines}</p>
                        </div>
                        <div>
                          <span className="text-stellar-muted">Fee per Trade</span>
                          <p className="text-stellar-text font-medium">{pool.feePercent}%</p>
                        </div>
                        <div>
                          <span className="text-stellar-muted">Pool ID</span>
                          <p className="text-stellar-text font-mono text-[10px] truncate">{pool.id}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {pool.reserves.map((r) => (
                          <div key={r.asset} className="bg-stellar-card rounded-lg p-3 text-center">
                            <p className="text-xs text-stellar-muted">{r.asset}</p>
                            <p className="text-sm font-semibold text-stellar-text">{formatAmount(r.amount)}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-stellar-muted text-center">
                        {t("earn.depositHint", "To deposit, you need trustlines for both assets and sufficient balance. Earnings are automatically compounded into your pool share.")}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
