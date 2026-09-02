import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useWalletStore } from "../../shared/store/wallet";
import { nftApi } from "../../shared/lib/api";
import { Loader2, Image, ExternalLink, RefreshCw } from "lucide-react";

interface IndexedNft {
  token: {
    id: number;
    tokenIdentifier: string;
    name: string | null;
    imageUrl: string | null;
    description: string | null;
    ownerAddress: string;
  };
  collection: {
    id: number;
    name: string;
    symbol: string | null;
    standard: string;
    imageUrl: string | null;
  } | null;
}

interface ClassicNft {
  assetCode: string;
  assetIssuer: string;
  balance: string;
  totalSupply: number;
  homeDomain: string | null;
  isLocked: boolean;
}

export default function NftsPage() {
  const { t } = useTranslation();
  const activeAccount = useWalletStore((s) => {
    const id = s.activeAccountId;
    return s.accounts.find((a) => a.id === id);
  });

  const [indexedNfts, setIndexedNfts] = useState<IndexedNft[]>([]);
  const [classicNfts, setClassicNfts] = useState<ClassicNft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const publicKey = activeAccount?.publicKey;

  const fetchNfts = async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const data = await nftApi.tokensByOwner(publicKey, true);
      setIndexedNfts(data.indexed?.tokens || []);
      setClassicNfts(data.classicNfts || []);
    } catch (err: any) {
      setError(err.message || "Failed to load NFTs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNfts();
  }, [publicKey]);

  const hasNfts = indexedNfts.length > 0 || classicNfts.length > 0;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">
          {t("nfts.title", "NFT Gallery")}
        </h2>
        <button
          onClick={fetchNfts}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-white/5 text-stellar-muted hover:text-white transition-colors"
          title={t("nfts.refresh", "Refresh")}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-stellar-blue" />
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-8 text-red-400 text-sm">{error}</div>
      )}

      {!loading && !error && !hasNfts && (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 flex items-center justify-center">
            <Image size={28} className="text-stellar-muted" />
          </div>
          <p className="text-stellar-muted text-sm">
            {t("nfts.empty", "No NFTs found")}
          </p>
          <p className="text-stellar-muted/60 text-xs mt-1">
            {t("nfts.emptyHint", "Soroban (SEP-50) and Classic (SEP-39) NFTs will appear here")}
          </p>
        </div>
      )}

      {/* Soroban SEP-50 NFTs */}
      {indexedNfts.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-stellar-muted uppercase tracking-wider mb-2">
            {t("nfts.soroban", "Soroban NFTs")}
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            {indexedNfts.map((item) => (
              <div
                key={item.token.id}
                className="rounded-xl border border-stellar-border bg-stellar-card overflow-hidden hover:border-stellar-blue/40 transition-colors cursor-pointer"
              >
                {item.token.imageUrl ? (
                  <img
                    src={item.token.imageUrl}
                    alt={item.token.name || "NFT"}
                    className="w-full h-28 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-full h-28 bg-gradient-to-br from-purple-500/15 to-blue-500/15 flex items-center justify-center">
                    <Image size={24} className="text-stellar-muted/40" />
                  </div>
                )}
                <div className="p-2.5">
                  <p className="font-medium text-xs text-white truncate">
                    {item.token.name || `#${item.token.tokenIdentifier}`}
                  </p>
                  {item.collection && (
                    <p className="text-[10px] text-stellar-muted truncate mt-0.5">
                      {item.collection.name}
                      {item.collection.symbol ? ` · ${item.collection.symbol}` : ""}
                    </p>
                  )}
                  <span className="inline-block mt-1.5 text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                    SEP-50
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Classic SEP-39 NFT Candidates */}
      {classicNfts.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-stellar-muted uppercase tracking-wider mb-2">
            {t("nfts.classic", "Classic Assets (SEP-39)")}
          </h3>
          <div className="space-y-1.5">
            {classicNfts.map((nft, i) => (
              <div
                key={`${nft.assetCode}-${nft.assetIssuer}-${i}`}
                className="flex items-center gap-2.5 p-2.5 rounded-xl border border-stellar-border bg-stellar-card hover:border-stellar-blue/40 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/15 to-orange-500/15 flex items-center justify-center shrink-0">
                  <span className="text-sm">💎</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-xs text-white">{nft.assetCode}</p>
                  <p className="text-[10px] text-stellar-muted truncate">
                    Supply: {nft.totalSupply} · Bal: {nft.balance}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {nft.isLocked && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                      Locked
                    </span>
                  )}
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                    SEP-39
                  </span>
                  {nft.homeDomain && (
                    <a
                      href={`https://${nft.homeDomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stellar-muted hover:text-white"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
