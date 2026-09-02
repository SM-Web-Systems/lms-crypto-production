import { Droplets, ExternalLink } from "lucide-react";

interface Pool {
  id: string;
  fee_bp?: number;
  total_trustlines?: number;
  total_shares?: string;
  reserves?: Array<{
    asset: string;
    amount: string;
  }>;
}

interface LiquidityPoolsProps {
  pools: Pool[];
}

export default function LiquidityPools({ pools }: LiquidityPoolsProps) {
  if (pools.length === 0) return null;

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Droplets size={20} className="text-stellar-blue" />
        <h2 className="text-lg font-semibold text-white">Liquidity Pools</h2>
        <span className="text-xs text-stellar-muted">({pools.length} found)</span>
      </div>

      <div className="space-y-3">
        {pools.map((pool) => {
          const reserve0 = pool.reserves?.[0];
          const reserve1 = pool.reserves?.[1];
          const asset0Label = parseAssetLabel(reserve0?.asset);
          const asset1Label = parseAssetLabel(reserve1?.asset);

          return (
            <div
              key={pool.id}
              className="bg-stellar-dark border border-stellar-border rounded-xl p-4 space-y-3"
            >
              {/* Pool pair header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold">
                    {asset0Label} / {asset1Label}
                  </span>
                  {pool.fee_bp != null && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stellar-blue/20 text-stellar-blue font-medium">
                      {(pool.fee_bp / 100).toFixed(2)}% fee
                    </span>
                  )}
                </div>
                <a
                  href={`https://stellar.expert/explorer/testnet/liquidity-pool/${pool.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-stellar-muted hover:text-white transition-colors"
                >
                  <ExternalLink size={14} />
                </a>
              </div>

              {/* Reserves */}
              <div className="grid grid-cols-2 gap-4">
                {pool.reserves?.map((r, i) => (
                  <div key={i} className="text-sm">
                    <span className="text-stellar-muted">{parseAssetLabel(r.asset)}: </span>
                    <span className="text-white font-mono">
                      {formatPoolAmount(r.amount)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pool stats */}
              <div className="flex gap-6 text-xs text-stellar-muted">
                {pool.total_trustlines != null && (
                  <span>Participants: {pool.total_trustlines.toLocaleString()}</span>
                )}
                {pool.total_shares && (
                  <span>Shares: {formatPoolAmount(pool.total_shares)}</span>
                )}
                <span className="font-mono truncate max-w-[180px]" title={pool.id}>
                  ID: {pool.id.slice(0, 8)}...{pool.id.slice(-8)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parseAssetLabel(asset?: string): string {
  if (!asset) return "?";
  if (asset === "native") return "XLM";
  // Format: CODE:ISSUER
  const parts = asset.split(":");
  return parts[0] || asset;
}

function formatPoolAmount(amount: string): string {
  const n = parseFloat(amount);
  if (isNaN(n)) return amount;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
