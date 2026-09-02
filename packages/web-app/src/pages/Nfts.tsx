import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useWalletStore } from "../store/wallet";
import { nftApi } from "../lib/api";
import { Loader2, Image, ExternalLink, RefreshCw } from "lucide-react";

const LMS_API_BASE = "https://lms.smwebsystems.com";
const LMS_CONTRACT_ID = "CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524";

interface LmsCredential {
  credentialId: string;
  walletAddress: string;
  txHash: string | null;
  courseId: string | null;
  courseTitle: string | null;
  courseCode: string | null;
  quizId: string | null;
  quizTitle: string | null;
  network: string | null;
  mintedAt: string;
  sorobanTokenId: number | null;  // on-chain Soroban u32 token ID for deterministic matching
}

export default function NftsPage() {
  const { t } = useTranslation();
  const activeAccount = useWalletStore((s) => {
    const id = s.activeAccountId;
    return s.accounts.find((a: any) => a.id === id);
  });

  const [indexedNfts, setIndexedNfts] = useState<any[]>([]);
  const [classicNfts, setClassicNfts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lmsCredentials, setLmsCredentials] = useState<LmsCredential[]>([]);

  const publicKey = (activeAccount as any)?.publicKey;

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
    // Secondary: fetch LMS course context (non-blocking, non-fatal)
    if (publicKey) {
      fetch(`${LMS_API_BASE}/api/v1/credentials/public?wallet=${encodeURIComponent(publicKey)}`)
        .then((r) => r.json())
        .then((body) => { if (body.success) setLmsCredentials(body.data?.credentials ?? []); })
        .catch(() => {});
    }
  };

  useEffect(() => { fetchNfts(); }, [publicKey]);

  // Build Map<sorobanTokenId → LmsCredential> for deterministic matching.
  // Legacy credentials (sorobanTokenId=null) fall back to positional matching by tokenId order.
  const lmsCredMap = new Map<number, LmsCredential>();
  const legacyCredList: LmsCredential[] = [];
  for (const cred of lmsCredentials) {
    if (cred.sorobanTokenId !== null) {
      lmsCredMap.set(cred.sorobanTokenId, cred);
    } else {
      legacyCredList.push(cred);
    }
  }

  // For legacy fallback: LMS-contract tokens sorted by tokenId ascending
  const lmsIndexedTokens = [...indexedNfts]
    .filter((item: any) => item.collection?.contractId === LMS_CONTRACT_ID)
    .sort((a: any, b: any) => (a.token.tokenId ?? 0) - (b.token.tokenId ?? 0));

  function getLmsCred(item: any): LmsCredential | null {
    // Primary: deterministic match by on-chain token ID
    const tokenId: number | undefined = item.token?.tokenId;
    if (tokenId !== undefined && lmsCredMap.has(tokenId)) {
      return lmsCredMap.get(tokenId)!;
    }
    // Legacy fallback: positional match for credentials without sorobanTokenId
    if (legacyCredList.length > 0) {
      const pos = lmsIndexedTokens.indexOf(item);
      if (pos >= 0 && pos < legacyCredList.length) return legacyCredList[pos];
    }
    return null;
  }

  const hasNfts = indexedNfts.length > 0 || classicNfts.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stellar-text">{t("nfts.title", "NFT Gallery")}</h1>
          <p className="text-sm text-stellar-muted mt-1">Soroban (SEP-50) and Classic (SEP-39) collectibles</p>
        </div>
        <button
          onClick={fetchNfts}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stellar-card border border-stellar-border text-sm text-stellar-muted hover:text-stellar-text transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-stellar-blue" />
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-12 text-red-400">{error}</div>
      )}

      {!loading && !error && !hasNfts && (
        <div className="text-center py-20">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 flex items-center justify-center">
            <Image size={36} className="text-stellar-muted" />
          </div>
          <p className="text-stellar-muted text-base">{t("nfts.empty", "No NFTs found")}</p>
          <p className="text-stellar-muted/50 text-sm mt-2">
            {t("nfts.emptyHint", "Soroban (SEP-50) and Classic (SEP-39) NFTs will appear here")}
          </p>
        </div>
      )}

      {indexedNfts.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stellar-muted mb-3">Soroban NFTs</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {indexedNfts.map((item: any) => (
              <div key={item.token.id} className="rounded-xl border border-stellar-border bg-stellar-card overflow-hidden hover:border-stellar-blue/40 transition-colors cursor-pointer group">
                {item.token.imageUrl ? (
                  <img src={item.token.imageUrl} alt={item.token.name || "NFT"} className="w-full h-40 object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-full h-40 bg-gradient-to-br from-purple-500/10 to-blue-500/10 flex items-center justify-center">
                    <Image size={32} className="text-stellar-muted/30" />
                  </div>
                )}
                <div className="p-3">
                  <p className="font-medium text-sm text-stellar-text truncate">{item.token.name || `#${item.token.tokenIdentifier}`}</p>
                  {item.collection && (
                    <p className="text-xs text-stellar-muted truncate mt-0.5">{item.collection.name}{item.collection.symbol ? ` · ${item.collection.symbol}` : ""}</p>
                  )}
                  <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">SEP-50</span>
                  {(() => {
                    const cred = getLmsCred(item);
                    if (!cred) return null;
                    const issuedDate = cred.mintedAt
                      ? new Date(cred.mintedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                      : null;
                    return (
                      <div className="mt-2 pt-2 border-t border-stellar-border/50 space-y-0.5">
                        <p className="text-[10px] text-stellar-muted font-semibold uppercase tracking-wide">LMS Certificate</p>
                        <p className="text-xs text-stellar-text font-medium truncate leading-tight">
                          {cred.courseTitle ?? cred.quizTitle ?? "SM Web Systems Certificate"}
                        </p>
                        {cred.courseCode && (
                          <p className="text-[10px] text-purple-400 font-medium">{cred.courseCode}</p>
                        )}
                        {issuedDate && (
                          <p className="text-[10px] text-stellar-muted">Issued {issuedDate}</p>
                        )}
                        {cred.txHash && (
                          <a
                            href={`https://stellar.expert/explorer/public/tx/${cred.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-purple-400 hover:underline inline-flex items-center gap-0.5 mt-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {cred.txHash.slice(0, 8)}… <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {classicNfts.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stellar-muted mb-3">Classic Assets (SEP-39)</h2>
          <div className="space-y-2">
            {classicNfts.map((nft: any, i: number) => (
              <div key={`${nft.assetCode}-${i}`} className="flex items-center gap-4 p-4 rounded-xl border border-stellar-border bg-stellar-card hover:border-stellar-blue/40 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 flex items-center justify-center shrink-0">
                  <span className="text-xl">💎</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-stellar-text">{nft.assetCode}</p>
                  <p className="text-xs text-stellar-muted">Supply: {nft.totalSupply} · Balance: {nft.balance}</p>
                  {nft.homeDomain && (
                    <a href={`https://${nft.homeDomain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-stellar-blue hover:underline inline-flex items-center gap-1 mt-0.5">
                      {nft.homeDomain} <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {nft.isLocked && <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 font-medium">Locked</span>}
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">SEP-39</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
