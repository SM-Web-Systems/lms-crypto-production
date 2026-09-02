import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { tokenApi } from "../lib/api";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useTranslation } from "react-i18next";
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";

interface PriceChartProps {
  code: string;
  issuer: string;
}

const INTERVALS = [
  { label: "1W", resolution: "3600000", limit: 168 },
  { label: "1M", resolution: "86400000", limit: 30 },
  { label: "3M", resolution: "86400000", limit: 90 },
  { label: "1Y", resolution: "604800000", limit: 52 },
];

export default function PriceChart({ code, issuer }: PriceChartProps) {
  const { t } = useTranslation();
  const [intervalIdx, setIntervalIdx] = useState(1); // default 1M
  const interval = INTERVALS[intervalIdx];

  const { data, isLoading, isError } = useQuery({
    queryKey: ["price-history", code, issuer, interval.resolution, interval.limit],
    queryFn: () => tokenApi.priceHistory(code, issuer, interval.resolution, interval.limit),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const candles = data?.candles || [];

  const chartData = candles.map((c) => ({
    date: c.timestamp,
    price: parseFloat(c.close),
    volume: parseFloat(c.volume),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
  }));

  // Calculate price change
  const firstPrice = chartData.length > 0 ? chartData[0].price : 0;
  const lastPrice = chartData.length > 0 ? chartData[chartData.length - 1].price : 0;
  const priceChange = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const isPositive = priceChange >= 0;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    if (interval.resolution === "3600000") {
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const formatPrice = (p: number) => {
    if (p >= 1) return p.toFixed(4);
    if (p >= 0.01) return p.toFixed(6);
    return p.toFixed(8);
  };

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-stellar-muted">
            {t("tokens.priceChart", "Price Chart")} ({data?.counterAsset || "USDC"})
          </h3>
          {chartData.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-bold text-stellar-text">{formatPrice(lastPrice)}</span>
              <span className={`flex items-center text-sm font-medium ${isPositive ? "text-stellar-success" : "text-stellar-danger"}`}>
                {isPositive ? <TrendingUp size={14} /> : priceChange === 0 ? <Minus size={14} /> : <TrendingDown size={14} />}
                <span className="ml-1">{isPositive ? "+" : ""}{priceChange.toFixed(2)}%</span>
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {INTERVALS.map((iv, idx) => (
            <button
              key={iv.label}
              onClick={() => setIntervalIdx(idx)}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                idx === intervalIdx
                  ? "bg-stellar-blue text-white"
                  : "bg-stellar-dark text-stellar-muted hover:text-stellar-text"
              }`}
            >
              {iv.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="animate-spin text-stellar-muted" size={24} />
        </div>
      ) : isError || chartData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-stellar-muted text-sm">
          {t("tokens.noTradeData", "No trade data available for this pair")}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
                <stop offset="95%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d2640" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="#8b83a3"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={formatPrice}
              stroke="#8b83a3"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={70}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1a1425",
                border: "1px solid #2d2640",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(ts) => new Date(ts as number).toLocaleString()}
              formatter={(value: number | undefined) => [formatPrice(value ?? 0), "Price"]}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={isPositive ? "#22c55e" : "#ef4444"}
              strokeWidth={2}
              fill="url(#priceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
