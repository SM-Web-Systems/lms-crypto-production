import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { portfolioApi } from "../lib/api";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, Minus, Loader2, Camera } from "lucide-react";
import { toast } from "sonner";

export default function PortfolioPage() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ["portfolio-summary"],
    queryFn: portfolioApi.summary,
    staleTime: 60 * 1000,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["portfolio-history", days],
    queryFn: () => portfolioApi.history(days),
    staleTime: 60 * 1000,
  });

  const snapshotMutation = useMutation({
    mutationFn: portfolioApi.snapshot,
    onSuccess: (data) => {
      toast.success("Snapshot saved: " + parseFloat(data.totalXlm).toFixed(2) + " XLM ($" + parseFloat(data.totalUsd).toFixed(2) + ")");
      refetchSummary();
    },
    onError: () => toast.error("Failed to take snapshot"),
  });

  // Auto-snapshot on first visit if no data
  useEffect(() => {
    if (summary && summary.totalXlm === "0" && summary.totalUsd === "0") {
      snapshotMutation.mutate();
    }
  }, [summary]);

  const snapshots = history?.snapshots || [];
  const chartData = snapshots.map((s: any) => ({
    date: new Date(s.createdAt).getTime(),
    value: parseFloat(s.totalUsd),
    xlm: parseFloat(s.totalXlm),
  }));

  const totalUsd = parseFloat(summary?.totalUsd || "0");
  const totalXlm = parseFloat(summary?.totalXlm || "0");
  const change24h = parseFloat(summary?.change24h?.percent || "0");
  const change7d = parseFloat(summary?.change7d?.percent || "0");
  const changeUsd24h = parseFloat(summary?.change24h?.usd || "0");

  const assets = summary?.assets || [];

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const periods = [
    { label: "7D", value: 7 },
    { label: "30D", value: 30 },
    { label: "90D", value: 90 },
    { label: "1Y", value: 365 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stellar-text">{t("portfolio.title", "Portfolio")}</h1>
        <button
          onClick={() => snapshotMutation.mutate()}
          disabled={snapshotMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-stellar-blue hover:bg-stellar-blue/80 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {snapshotMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {t("portfolio.snapshot", "Take Snapshot")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-stellar-card border border-stellar-border rounded-xl p-5">
          <p className="text-sm text-stellar-muted">{t("portfolio.totalValue", "Total Value")}</p>
          <p className="text-2xl font-bold text-stellar-text mt-1">${totalUsd.toFixed(2)}</p>
          <p className="text-sm text-stellar-muted mt-0.5">{totalXlm.toFixed(2)} XLM</p>
        </div>
        <div className="bg-stellar-card border border-stellar-border rounded-xl p-5">
          <p className="text-sm text-stellar-muted">{t("portfolio.change24h", "24h Change")}</p>
          <div className="flex items-center gap-2 mt-1">
            {change24h >= 0 ? <TrendingUp size={20} className="text-stellar-success" /> : <TrendingDown size={20} className="text-stellar-danger" />}
            <span className={"text-2xl font-bold " + (change24h >= 0 ? "text-stellar-success" : "text-stellar-danger")}>
              {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
            </span>
          </div>
          <p className={"text-sm mt-0.5 " + (changeUsd24h >= 0 ? "text-stellar-success" : "text-stellar-danger")}>
            {changeUsd24h >= 0 ? "+$" : "-$"}{Math.abs(changeUsd24h).toFixed(2)}
          </p>
        </div>
        <div className="bg-stellar-card border border-stellar-border rounded-xl p-5">
          <p className="text-sm text-stellar-muted">{t("portfolio.change7d", "7 Day Change")}</p>
          <div className="flex items-center gap-2 mt-1">
            {change7d >= 0 ? <TrendingUp size={20} className="text-stellar-success" /> : change7d === 0 ? <Minus size={20} className="text-stellar-muted" /> : <TrendingDown size={20} className="text-stellar-danger" />}
            <span className={"text-2xl font-bold " + (change7d >= 0 ? "text-stellar-success" : "text-stellar-danger")}>
              {change7d >= 0 ? "+" : ""}{change7d.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      <div className="bg-stellar-card border border-stellar-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-stellar-muted">{t("portfolio.valueHistory", "Portfolio Value")}</h2>
          <div className="flex gap-1">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setDays(p.value)}
                className={"px-3 py-1 text-xs rounded-lg font-medium transition-colors " + (days === p.value ? "bg-stellar-blue text-white" : "bg-stellar-dark text-stellar-muted hover:text-white")}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {historyLoading || summaryLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="animate-spin text-stellar-muted" size={24} />
          </div>
        ) : chartData.length < 2 ? (
          <div className="flex flex-col items-center justify-center h-48 text-stellar-muted text-sm gap-2">
            <p>{t("portfolio.noHistory", "Not enough data yet. Snapshots are recorded when you visit this page or click Take Snapshot.")}</p>
            <button
              onClick={() => snapshotMutation.mutate()}
              className="text-stellar-blue hover:underline text-sm"
            >
              {t("portfolio.takeFirst", "Take your first snapshot")}
            </button>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3e1bdb" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3e1bdb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2640" />
              <XAxis dataKey="date" tickFormatter={formatDate} stroke="#8b83a3" fontSize={11} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis domain={["auto", "auto"]} tickFormatter={(v: number) => "$" + v.toFixed(0)} stroke="#8b83a3" fontSize={11} tickLine={false} axisLine={false} width={60} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1a1425", border: "1px solid #2d2640", borderRadius: "8px", fontSize: "12px" }}
                labelFormatter={(ts) => new Date(ts as number).toLocaleDateString()}
                formatter={(value: number | undefined) => ["$" + (value ?? 0).toFixed(2), "Value"]}
              />
              <Area type="monotone" dataKey="value" stroke="#3e1bdb" strokeWidth={2} fill="url(#portfolioGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {assets.length > 0 && (
        <div className="bg-stellar-card border border-stellar-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-stellar-muted mb-3">{t("portfolio.holdings", "Holdings")}</h2>
          <div className="space-y-2">
            {assets.map((a: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-stellar-border/30 last:border-0">
                <div>
                  <span className="text-stellar-text font-medium text-sm">{a.code}</span>
                  {a.issuer && <span className="text-stellar-muted text-xs ml-2">{a.issuer.substring(0, 8)}...</span>}
                </div>
                <div className="text-right">
                  <p className="text-stellar-text text-sm">{parseFloat(a.balance).toFixed(4)}</p>
                  <p className="text-stellar-muted text-xs">${parseFloat(a.valueUsd || "0").toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
