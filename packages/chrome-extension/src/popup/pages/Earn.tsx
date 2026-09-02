import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { earnApi } from "../../shared/lib/api";
import { useWalletStore } from "../../shared/store/wallet";
import { Droplets, ChevronDown, ChevronUp, Search } from "lucide-react";

export default function Earn() {
  const { t } = useTranslation();
  const activeAccount = useWalletStore((s) => s.accounts.find((a) => a.id === s.activeAccountId));
  const publicKey = activeAccount?.publicKey || "";
  const [assetFilter, setAssetFilter] = useState("");
  const [expandedPool, setExpandedPool] = useState<string | null>(null);

  const { data: poolsData, isLoading: poolsLoading } = useQuery({
    queryKey: ["earn-pools", assetFilter],
    queryFn: () => earnApi.pools({ asset: assetFilter || undefined, limit: 20 }),
  });

  const { data: positionsData } = useQuery({
    queryKey: ["earn-positions", publicKey],
    queryFn: () => earnApi.positions(publicKey),
    enabled: !!publicKey,
  });

  const pools = poolsData?.pools || [];
  const positions = positionsData?.positions || [];

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Droplets size={20} className="text-stellar-blue" />
        <h1 className="text-lg font-bold text-white">{t("nav.earn", "Earn")}</h1>
      </div>

      {positions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-stellar-muted">{t("earn.yourPositions", "Your Positions")}</h2>
          {positions.map((p: any) => (
            <div key={p.poolId} className="bg-stellar-card rounded-xl p-3 border border-stellar-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">
                  {p.reserves?.map((r: any) => r.asset === "native" ? "XLM" : r.asset?.split(":")[0]).join(" / ")}
                </span>
                <span className="text-xs text-stellar-blue">{Number(p.sharePercent).toFixed(2)}%</span>
              </div>
              <p className="text-xs text-stellar-muted">
                {t("earn.shares", "Shares")}: {Number(p.balance).toFixed(4)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
        <input
          placeholder={t("earn.filterAsset", "Filter by asset code...")}
          value={assetFilter}
          onChange={(e) => setAssetFilter(e.target.value.toUpperCase())}
          className="w-full bg-stellar-card border border-stellar-border rounded-lg pl-8 pr-3 py-2 text-sm text-white"
        />
      </div>

      <h2 className="text-sm font-medium text-stellar-muted">
        {t("earn.availablePools", "Available Pools")} {poolsData?.total ? `(${poolsData.total})` : ""}
      </h2>

      {poolsLoading ? (
        <div className="text-center text-stellar-muted py-8">{t("common.loading", "Loading...")}</div>
      ) : pools.length === 0 ? (
        <div className="text-center text-stellar-muted py-8">{t("earn.noPools", "No pools found")}</div>
      ) : (
        <div className="space-y-2">
          {pools.map((pool: any) => {
            const isExpanded = expandedPool === pool.id;
            const reserveNames = pool.reserves?.map((r: any) =>
              r.asset === "native" ? "XLM" : r.asset?.split(":")[0]
            ) || [];

            return (
              <div key={pool.id} className="bg-stellar-card rounded-xl border border-stellar-border overflow-hidden">
                <button
                  onClick={() => setExpandedPool(isExpanded ? null : pool.id)}
                  className="w-full flex items-center justify-between p-3 text-left"
                >
                  <div>
                    <span className="text-sm font-medium text-white">{reserveNames.join(" / ")}</span>
                    <p className="text-xs text-stellar-muted mt-0.5">
                      {t("earn.fee", "Fee")}: {pool.fee || "0.30"}% &middot; {t("earn.shares", "Shares")}: {Number(pool.totalShares || 0).toFixed(2)}
                    </p>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-stellar-muted" /> : <ChevronDown size={16} className="text-stellar-muted" />}
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 border-t border-stellar-border space-y-2">
                    <p className="text-xs text-stellar-muted mt-2">{t("earn.reserves", "Reserves")}:</p>
                    {pool.reserves?.map((r: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-white">{r.asset === "native" ? "XLM" : r.asset?.split(":")[0]}</span>
                        <span className="text-stellar-muted">{Number(r.amount).toFixed(4)}</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-stellar-muted mt-2">
                      {t("earn.depositHint", "Deposit via the web app at ammawallet.com to provide liquidity and earn fees.")}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
