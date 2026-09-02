import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { portfolioApi } from "../../shared/lib/api";
import { useWalletStore } from "../../shared/store/wallet";
import { PieChart, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

export default function Portfolio() {
  const { t } = useTranslation();
  const activeAccount = useWalletStore((s) => s.accounts.find((a) => a.id === s.activeAccountId));
  const publicKey = activeAccount?.publicKey || "";

  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["portfolio-summary", publicKey],
    queryFn: () => portfolioApi.summary(),
    enabled: !!publicKey,
  });

  const { data: history, isLoading: historyLoading } = useQuery<any>({
    queryKey: ["portfolio-history", publicKey],
    queryFn: () => portfolioApi.history(30, publicKey),
    enabled: !!publicKey,
  });

  const snapshots = history?.snapshots || [];
  const totalValue = Number(summary?.totalUsd || 0);
  const change24h = Number(summary?.change24h?.percent || 0);
  const change7d = Number(summary?.change7d?.percent || 0);
  const assets = summary?.assets || [];

  const isUp24h = change24h >= 0;
  const isUp7d = change7d >= 0;

  if (!publicKey) {
    return (
      <div className="p-3 text-center text-stellar-muted py-8">
        {t("common.noWallet", "No active wallet")}
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <PieChart size={20} className="text-stellar-blue" />
        <h1 className="text-lg font-bold text-white">{t("nav.portfolio", "Portfolio")}</h1>
      </div>

      {summaryLoading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw size={20} className="animate-spin text-stellar-muted" />
        </div>
      ) : (
        <>
          <div className="bg-stellar-card rounded-xl p-4 border border-stellar-border">
            <p className="text-xs text-stellar-muted mb-1">{t("portfolio.totalValue", "Total Value")}</p>
            <p className="text-2xl font-bold text-white">${Number(totalValue).toFixed(2)}</p>
            <div className="flex gap-3 mt-2">
              <div className="flex items-center gap-1">
                {isUp24h ? <TrendingUp size={12} className="text-green-400" /> : <TrendingDown size={12} className="text-red-400" />}
                <span className={`text-xs font-medium ${isUp24h ? "text-green-400" : "text-red-400"}`}>
                  {isUp24h ? "+" : ""}{Number(change24h).toFixed(2)}%
                </span>
                <span className="text-[10px] text-stellar-muted">24h</span>
              </div>
              <div className="flex items-center gap-1">
                {isUp7d ? <TrendingUp size={12} className="text-green-400" /> : <TrendingDown size={12} className="text-red-400" />}
                <span className={`text-xs font-medium ${isUp7d ? "text-green-400" : "text-red-400"}`}>
                  {isUp7d ? "+" : ""}{Number(change7d).toFixed(2)}%
                </span>
                <span className="text-[10px] text-stellar-muted">7d</span>
              </div>
            </div>
          </div>

          {assets.length > 0 && (
            <div className="bg-stellar-card rounded-xl border border-stellar-border overflow-hidden">
              <p className="text-xs text-stellar-muted px-3 pt-3 pb-1">{t("portfolio.breakdown", "Asset Breakdown")}</p>
              {assets.map((asset: any, i: number) => {
                const pct = totalValue > 0 ? (Number(asset.valueUsd || 0) / totalValue) * 100 : 0;
                return (
                  <div key={i} className="flex items-center justify-between px-3 py-2 border-t border-stellar-border">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-stellar-blue/20 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-stellar-blue">
                          {(asset.code || "XLM").slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-white">{asset.code || "XLM"}</p>
                        <p className="text-[10px] text-stellar-muted">{Number(asset.balance).toFixed(4)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white">${Number(asset.valueUsd || 0).toFixed(2)}</p>
                      <p className="text-[10px] text-stellar-muted">{pct.toFixed(1)}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {snapshots.length > 1 && (
            <div className="bg-stellar-card rounded-xl p-3 border border-stellar-border">
              <p className="text-xs text-stellar-muted mb-2">{t("portfolio.history", "30-Day History")}</p>
              <div className="flex items-end gap-[2px] h-16">
                {snapshots.map((s: any, i: number) => {
                  const max = Math.max(...snapshots.map((x: any) => Number(x.totalUsd || 0)));
                  const height = max > 0 ? (Number(s.totalUsd || 0) / max) * 100 : 0;
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-stellar-blue/40 rounded-t-sm min-h-[2px]"
                      style={{ height: `${height}%` }}
                      title={`$${Number(s.totalUsd || 0).toFixed(2)}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-stellar-muted">30d ago</span>
                <span className="text-[9px] text-stellar-muted">{t("common.today", "Today")}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
