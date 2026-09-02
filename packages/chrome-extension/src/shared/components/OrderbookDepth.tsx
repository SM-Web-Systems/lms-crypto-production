import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface OrderbookProps {
  orderbook: {
    bids: Array<{ price: string; amount: string }>;
    asks: Array<{ price: string; amount: string }>;
  };
  assetCode: string;
}

interface DepthPoint {
  price: number;
  bidDepth: number | null;
  askDepth: number | null;
}

export default function OrderbookDepth({ orderbook, assetCode }: OrderbookProps) {
  const { depthData, spread, midPrice, bestBid, bestAsk } = useMemo(() => {
    const bids = orderbook.bids
      .map((b) => ({ price: parseFloat(b.price), amount: parseFloat(b.amount) }))
      .sort((a, b) => b.price - a.price); // highest first

    const asks = orderbook.asks
      .map((a) => ({ price: parseFloat(a.price), amount: parseFloat(a.amount) }))
      .sort((a, b) => a.price - b.price); // lowest first

    // Cumulative depth
    const bidDepth: DepthPoint[] = [];
    let cumBid = 0;
    for (let i = 0; i < bids.length; i++) {
      cumBid += bids[i].amount;
      bidDepth.push({ price: bids[i].price, bidDepth: cumBid, askDepth: null });
    }
    bidDepth.reverse(); // low to high price

    const askDepth: DepthPoint[] = [];
    let cumAsk = 0;
    for (let i = 0; i < asks.length; i++) {
      cumAsk += asks[i].amount;
      askDepth.push({ price: asks[i].price, bidDepth: null, askDepth: cumAsk });
    }

    const depthData = [...bidDepth, ...askDepth];

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 0;
    const midPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0;
    const spread = bestAsk && bestBid ? ((bestAsk - bestBid) / midPrice) * 100 : 0;

    return { depthData, spread, midPrice, bestBid, bestAsk };
  }, [orderbook]);

  if (depthData.length === 0) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Order Book</h2>
        <p className="text-stellar-muted text-sm">No orderbook data available for {assetCode}/XLM.</p>
      </div>
    );
  }

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Order Book Depth</h2>
        <span className="text-xs text-stellar-muted">{assetCode} / XLM</span>
      </div>

      {/* Spread stats */}
      <div className="flex gap-6 text-sm">
        <div>
          <span className="text-stellar-muted">Best Bid: </span>
          <span className="text-stellar-success font-mono">{bestBid.toFixed(7)}</span>
        </div>
        <div>
          <span className="text-stellar-muted">Best Ask: </span>
          <span className="text-stellar-danger font-mono">{bestAsk.toFixed(7)}</span>
        </div>
        <div>
          <span className="text-stellar-muted">Spread: </span>
          <span className="text-white font-mono">{spread.toFixed(3)}%</span>
        </div>
        <div>
          <span className="text-stellar-muted">Mid: </span>
          <span className="text-white font-mono">{midPrice.toFixed(7)}</span>
        </div>
      </div>

      {/* Depth chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={depthData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d2640" />
            <XAxis
              dataKey="price"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => v.toFixed(4)}
              tick={{ fill: "#8b83a3", fontSize: 11 }}
              stroke="#2d2640"
            />
            <YAxis
              tick={{ fill: "#8b83a3", fontSize: 11 }}
              stroke="#2d2640"
              tickFormatter={(v: number) => formatCompact(v)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1a1425",
                border: "1px solid #2d2640",
                borderRadius: "8px",
                color: "#e2dff0",
                fontSize: 12,
              }}
              formatter={(value: any, name: any) => [
                formatCompact(Number(value)),
                name === "bidDepth" ? "Bid Depth" : "Ask Depth",
              ]}
              labelFormatter={(label: any) => `Price: ${Number(label).toFixed(7)}`}
            />
            <Area
              type="stepAfter"
              dataKey="bidDepth"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.15}
              strokeWidth={2}
              connectNulls={false}
              dot={false}
            />
            <Area
              type="stepBefore"
              dataKey="askDepth"
              stroke="#ef4444"
              fill="#ef4444"
              fillOpacity={0.15}
              strokeWidth={2}
              connectNulls={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bid/Ask table preview */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-stellar-success mb-2">Bids (top 10)</h3>
          <div className="space-y-1">
            {orderbook.bids.slice(0, 10).map((b, i) => (
              <div key={i} className="flex justify-between text-xs font-mono">
                <span className="text-stellar-success">{parseFloat(b.price).toFixed(7)}</span>
                <span className="text-stellar-muted">{formatCompact(parseFloat(b.amount))}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-stellar-danger mb-2">Asks (top 10)</h3>
          <div className="space-y-1">
            {orderbook.asks.slice(0, 10).map((a, i) => (
              <div key={i} className="flex justify-between text-xs font-mono">
                <span className="text-stellar-danger">{parseFloat(a.price).toFixed(7)}</span>
                <span className="text-stellar-muted">{formatCompact(parseFloat(a.amount))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
}
