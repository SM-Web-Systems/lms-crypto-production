import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tokenApi } from "../lib/api";
import { useWalletStore } from "../store/wallet";
import { buildTrustlineTx } from "../lib/stellar";
import TokenIcon from "../components/TokenIcon";
import OrderbookDepth from "../components/OrderbookDepth";
import PriceChart from "../components/PriceChart";
import LiquidityPools from "../components/LiquidityPools";
import PinModal from "../components/PinModal";
import { useState } from "react";
import { useBalances } from "../hooks/useBalances";
import { toast } from "sonner";
import { API_BASE } from "../lib/constants";
import {
  ArrowLeft, Star, ExternalLink, Shield, ShieldAlert, TrendingUp, X,
  Users, BarChart3, DollarSign, ArrowLeftRight, Send, Plus, Loader2,
  Globe, Copy, Check,
} from "lucide-react";

// Fetch token detail from StellarExpert as fallback
async function fetchFromStellarExpert(code: string, issuer: string) {
  if (code === "XLM" || issuer === "native") return null;

  // Go through our backend proxy to avoid CORS

  const res = await fetch(
    `${API_BASE}/api/v1/tokens/expert/${encodeURIComponent(code)}/${encodeURIComponent(issuer)}`
  );
  if (!res.ok) return null;
  const r = await res.json();

  return {
    assetCode: code,
    assetIssuer: issuer,
    assetType: code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12",
    tomlName: r.toml_info?.code || r.toml_info?.name || "",
    tomlImage: r.toml_info?.image || "",
    tomlDescription: r.toml_info?.desc || "",
    tomlOrg: r.toml_info?.orgName || "",
    tomlOrgUrl: r.toml_info?.orgUrl || "",
    domain: r.home_domain || "",
    isVerified: (r.rating?.average ?? 0) >= 6,
    isSpam: false,
    isFeatured: false,
    totalSupply: r.supply ? String(r.supply) : null,
    trustlinesFunded: r.trustlines?.funded ?? null,
    trustlinesTotal: r.trustlines?.total ?? null,
    tradesCount: r.trades ?? null,
    paymentsCount: r.payments ?? null,
    ratingAverage: r.rating?.average ?? null,
    ratingAge: r.rating?.age ?? null,
    ratingTrades: r.rating?.activity ?? null,
    ratingPayments: r.rating?.payments ?? null,
    ratingTrustlines: r.rating?.trustlines ?? null,
    ratingVolume7d: r.rating?.volume7d ?? null,
    ratingInterop: r.rating?.interop ?? null,
    ratingLiquidity: r.rating?.liquidity ?? null,
    createdAt: r.created ? new Date(r.created * 1000).toISOString() : null,
    contractToken: r.contract
      ? { contractId: r.contract, contractType: "SAC", name: null, symbol: null, decimals: r.decimals ?? null }
      : null,
    orderbook: null,
    liquidityPools: null,
    price: r.price ?? null,
  };
}

// Combined fetcher: try backend first, fallback to StellarExpert
async function fetchTokenDetail(code: string, issuer: string) {
  try {
    const backendResult = await tokenApi.detail(code, issuer);
    // Backend may return { error: "..." } or null
    if (backendResult && !backendResult.error && backendResult.assetCode) {
      return backendResult;
    }
  } catch {
    // Backend failed — fall through
  }

  // Fallback to StellarExpert
  const expertResult = await fetchFromStellarExpert(code, issuer);
  if (expertResult) return expertResult;

  throw new Error("Token not found");
}

export default function TokenDetailPage() {
  const { t } = useTranslation();
  const { code, issuer } = useParams<{ code: string; issuer: string }>();
  const publicKey = useWalletStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? null
  )!;
  const isUnlocked = useWalletStore((s) => s.isUnlocked);
  const getSecretKey = useWalletStore((s) => s.getSecretKey);
  const unlock = useWalletStore((s) => s.unlock);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showPin, setShowPin] = useState(false);
  const [pinAction, setPinAction] = useState<"trustline" | "favorite">("trustline");
  const [copiedIssuer, setCopiedIssuer] = useState(false);

  // Trustline status
  const { data: balances } = useBalances();
  const existingTrustline = balances?.find(
    (b: any) => b.assetCode === code && (b.assetIssuer || "native") === issuer
  );
  const hasTrustline = !!existingTrustline;

  const {
    data: token,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["token-detail", code, issuer],
    queryFn: () => fetchTokenDetail(code!, issuer!),
    enabled: !!code && !!issuer,
  });

  const favMutation = useMutation({
    mutationFn: () => tokenApi.toggleFavorite(publicKey, code!, issuer!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["token-detail", code, issuer] });
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      toast.success(t("tokens.updatedFavorites"));
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleAddTrustline = async () => {
    if (code === "XLM") return toast.info(t("tokens.trustlineNative"));
    if (!isUnlocked) {
      setPinAction("trustline");
      setShowPin(true);
      return;
    }
    await executeTrustline();
  };

  const executeTrustline = async () => {
    try {
      const secret = getSecretKey();
      await buildTrustlineTx(secret, code!, issuer!);
      toast.success(t("tokens.trustlineAdded", { code }));
      queryClient.invalidateQueries({ queryKey: ["balances"] });
    } catch (err: any) {
      toast.error(err.message || t("tokens.trustlineFailed"));
    }
  };

  const handleCopyIssuer = () => {
    navigator.clipboard.writeText(issuer!);
    setCopiedIssuer(true);
    setTimeout(() => setCopiedIssuer(false), 2000);
  };

  if (isLoading)
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="animate-spin text-stellar-muted" size={40} />
      </div>
    );

  if (error || !token)
    return (
      <div className="space-y-4">
        <Link
          to="/tokens"
          className="flex items-center gap-2 text-sm text-stellar-muted hover:text-stellar-text"
        >
          <ArrowLeft size={16} /> {t("tokens.backToTokens")}
        </Link>
        <p className="text-stellar-danger">{t("tokens.notFound")}</p>
      </div>
    );

  // Determine the network for explorer links
  const explorerNetwork = "public"; // or use store network

  return (
    <div className="space-y-8">
      <Link
        to="/tokens"
        className="inline-flex items-center gap-2 text-sm text-stellar-muted hover:text-stellar-text transition-colors"
      >
        <ArrowLeft size={16} /> {t("tokens.backToTokens")}
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-6">
        <TokenIcon code={token.assetCode} image={token.tomlImage} size={64} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-stellar-text">{token.assetCode}</h1>
            {token.isVerified ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stellar-success/20 text-stellar-success text-xs font-medium">
                <Shield size={12} /> {t("tokens.verified")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-medium">
                <ShieldAlert size={12} /> {t("tokens.unverified")}
              </span>
            )}
            {token.isSpam && (
              <span className="px-2 py-0.5 rounded-full bg-stellar-danger/20 text-stellar-danger text-xs font-medium">
                {t("tokens.flagged")}
              </span>
            )}
          </div>
          {token.tomlName && (
            <p className="mt-1 text-lg text-stellar-muted">{token.tomlName}</p>
          )}
          {token.tomlDescription && (
            <p className="mt-2 text-sm text-stellar-muted leading-relaxed max-w-2xl">
              {token.tomlDescription}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => favMutation.mutate()}
            disabled={favMutation.isPending}
            className="p-2.5 rounded-lg border border-stellar-border hover:bg-white/5 transition-colors"
          >
            <Star
              size={18}
              className={
                token.isFavorite
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-stellar-muted"
              }
            />
          </button>
          {hasTrustline ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-stellar-success/40 text-sm text-stellar-success">
                <Shield size={16} />
                {t("tokens.trusted", "Trusted")}
                {existingTrustline && (
                  <span className="font-mono text-xs ml-1">
                    ({parseFloat(existingTrustline.balance).toLocaleString(undefined, { maximumFractionDigits: 7 })} {code})
                  </span>
                )}
              </div>
              {existingTrustline && parseFloat(existingTrustline.balance) === 0 && code !== "XLM" && (
                <button
                  onClick={async () => {
                    if (!window.confirm(t("tokens.removeTrustlineConfirm", `Remove trustline for ${code}? This will free up 0.5 XLM reserve.`))) return;
                    if (!isUnlocked) {
                      setPinAction("trustline");
                      setShowPin(true);
                      return;
                    }
                    try {
                      const secret = getSecretKey();
                      await buildTrustlineTx(secret, code!, issuer!);
                      toast.success(t("tokens.trustlineRemoved", "Trustline removed"));
                      queryClient.invalidateQueries({ queryKey: ["balances"] });
                    } catch (err: any) {
                      toast.error(err.message || t("tokens.removeFailed", "Failed to remove trustline"));
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-stellar-danger/30 text-sm text-stellar-danger hover:bg-stellar-danger/10 transition-colors"
                >
                  <X size={14} /> {t("tokens.removeTrustline", "Remove")}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleAddTrustline}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-stellar-border text-sm text-stellar-muted hover:text-stellar-text hover:bg-white/5 transition-colors"
            >
              <Plus size={16} /> {t("tokens.addTrustline")}
            </button>
          )}
          <button
            onClick={() => navigate(`/send?asset=${code}`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-stellar-blue text-white text-sm font-medium hover:bg-stellar-purple transition-colors"
          >
            <Send size={16} /> {t("nav.send")}
          </button>
          <button
            onClick={() => navigate(`/swap?to=${code}`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-stellar-purple/80 text-white text-sm font-medium hover:bg-stellar-purple transition-colors"
          >
            <ArrowLeftRight size={16} /> {t("nav.swap")}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Star size={18} className="text-yellow-400" />}
          label={t("tokens.rating")}
          value={
            token.ratingAverage != null
              ? Number(token.ratingAverage).toFixed(1) + " / 10"
              : "—"
          }
        />
        <StatCard
          icon={<Users size={18} className="text-stellar-blue" />}
          label={t("tokens.holders")}
          value={
            token.trustlinesFunded
              ? Number(token.trustlinesFunded).toLocaleString()
              : "—"
          }
          sub={
            token.trustlinesTotal
              ? t("tokens.totalTrustlines", {
                  count: Number(token.trustlinesTotal),
                })
              : undefined
          }
        />
        <StatCard
          icon={<BarChart3 size={18} className="text-stellar-purple" />}
          label={t("tokens.trades")}
          value={
            token.tradesCount
              ? Number(token.tradesCount).toLocaleString()
              : "—"
          }
        />
        <StatCard
          icon={<DollarSign size={18} className="text-stellar-success" />}
          label={t("tokens.payments")}
          value={
            token.paymentsCount
              ? Number(token.paymentsCount).toLocaleString()
              : "—"
          }
        />
      </div>

      {/* Metadata */}
      <div className="bg-stellar-card border border-stellar-border rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-stellar-text">
          {t("tokens.assetDetails")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <DetailRow label={t("tokens.assetCode")} value={token.assetCode} />
          <DetailRow label={t("tokens.assetType")} value={token.assetType} />
          <DetailRow
            label={t("tokens.issuer")}
            value={
              token.assetType === "native" ? (
                t("tokens.nativeXLM")
              ) : (
                <span className="flex items-center gap-2">
                  <span className="font-mono truncate max-w-[220px]">
                    {issuer}
                  </span>
                  <button onClick={handleCopyIssuer} className="shrink-0">
                    {copiedIssuer ? (
                      <Check size={14} className="text-stellar-success" />
                    ) : (
                      <Copy
                        size={14}
                        className="text-stellar-muted hover:text-stellar-text"
                      />
                    )}
                  </button>
                </span>
              )
            }
          />
          {token.domain && (
            <DetailRow
              label={t("tokens.domain")}
              value={
                <a
                  href={`https://${token.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-stellar-blue hover:underline"
                >
                  <Globe size={14} />
                  {token.domain}
                  <ExternalLink size={12} />
                </a>
              }
            />
          )}
          {token.tomlOrg && (
            <DetailRow label={t("tokens.organization", "Organization")} value={token.tomlOrg} />
          )}
          {token.totalSupply && (
            <DetailRow
              label={t("tokens.totalSupply")}
              value={formatLargeNumber(token.totalSupply)}
            />
          )}
          {token.createdAt && (
            <DetailRow
              label={t("tokens.created")}
              value={new Date(token.createdAt).toLocaleDateString()}
            />
          )}
        </div>

        {token.ratingAge != null && (
          <div className="pt-4 border-t border-stellar-border">
            <h3 className="text-sm font-semibold text-stellar-muted mb-3">
              {t("tokens.ratingBreakdown")}
            </h3>
            <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
              <RatingBadge label={t("tokens.age")} value={token.ratingAge} />
              <RatingBadge
                label={t("tokens.trades")}
                value={token.ratingTrades}
              />
              <RatingBadge
                label={t("tokens.payments")}
                value={token.ratingPayments}
              />
              <RatingBadge
                label={t("tokens.trustlines")}
                value={token.ratingTrustlines}
              />
              <RatingBadge
                label={t("tokens.volume7d")}
                value={token.ratingVolume7d}
              />
              <RatingBadge
                label={t("tokens.interop")}
                value={token.ratingInterop}
              />
              <RatingBadge
                label={t("tokens.liquidity")}
                value={token.ratingLiquidity}
              />
            </div>
          </div>
        )}

        {token.contractToken && (
          <div className="pt-4 border-t border-stellar-border">
            <h3 className="text-sm font-semibold text-stellar-muted mb-3">
              <TrendingUp size={14} className="inline mr-1" />
              {t("tokens.sorobanContract")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <DetailRow
                label={t("tokens.contractId")}
                value={
                  <span className="font-mono text-xs truncate max-w-[260px] inline-block">
                    {token.contractToken.contractId}
                  </span>
                }
              />
              <DetailRow
                label={t("tokens.type")}
                value={token.contractToken.contractType}
              />
              {token.contractToken.name && (
                <DetailRow
                  label={t("tokens.name")}
                  value={token.contractToken.name}
                />
              )}
              {token.contractToken.symbol && (
                <DetailRow
                  label={t("tokens.symbol")}
                  value={token.contractToken.symbol}
                />
              )}
              {token.contractToken.decimals != null && (
                <DetailRow
                  label={t("tokens.decimals")}
                  value={token.contractToken.decimals}
                />
              )}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-stellar-border flex flex-wrap gap-3">
          {token.assetType !== "native" && issuer && (
            <ExternalButton
              href={`https://stellar.expert/explorer/${explorerNetwork}/asset/${code}-${issuer}`}
              label={t("tokens.stellarExpert")}
            />
          )}
          {token.assetType === "native" && (
            <ExternalButton
              href={`https://stellar.expert/explorer/${explorerNetwork}/asset/XLM`}
              label={t("tokens.stellarExpert")}
            />
          )}
          {token.domain && (
            <ExternalButton
              href={`https://${token.domain}/.well-known/stellar.toml`}
              label="stellar.toml"
            />
          )}
          {token.tomlOrgUrl && (
            <ExternalButton
              href={token.tomlOrgUrl}
              label={t("tokens.website")}
            />
          )}
        </div>
      </div>

      {/* Orderbook & Pools — only if backend provided them */}
      {token.assetType !== "native" && (
        <>
          <PriceChart code={token.assetCode} issuer={token.assetIssuer || "native"} />
          {token.orderbook && (
            <OrderbookDepth orderbook={token.orderbook} assetCode={token.assetCode} />
          )}
        </>
      )}
      {token.liquidityPools && token.liquidityPools.length > 0 && (
        <LiquidityPools pools={token.liquidityPools} />
      )}

      {showPin && (
        <PinModal
          title={
            pinAction === "trustline"
              ? t("tokens.unlockTrustline")
              : t("tokens.unlockWallet")
          }
          onSubmit={async (pin) => {
            await unlock(pin);
            setShowPin(false);
            if (pinAction === "trustline") await executeTrustline();
          }}
          onCancel={() => setShowPin(false)}
        />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-stellar-card border border-stellar-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-stellar-muted uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-xl font-bold text-stellar-text">{value}</p>
      {sub && <p className="text-xs text-stellar-muted mt-1">{sub}</p>}
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-stellar-muted shrink-0">{label}</span>
      <span className="text-stellar-text text-right">{value}</span>
    </div>
  );
}

function RatingBadge({
  label,
  value,
}: {
  label: string;
  value?: number | string;
}) {
  const v = Number(value ?? 0);
  const color =
    v >= 8
      ? "text-stellar-success bg-stellar-success/15"
      : v >= 5
      ? "text-yellow-400 bg-yellow-400/15"
      : "text-stellar-muted bg-white/5";
  return (
    <div className={`rounded-lg px-3 py-2 text-center ${color}`}>
      <p className="text-lg font-bold">{v.toFixed(1)}</p>
      <p className="text-[10px] uppercase tracking-wider opacity-75">{label}</p>
    </div>
  );
}

function ExternalButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stellar-border text-xs text-stellar-muted hover:text-stellar-text hover:bg-white/5 transition-colors"
    >
      {label}
      <ExternalLink size={12} />
    </a>
  );
}

function formatLargeNumber(n: string | number): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  if (num >= 1e15) return (num / 1e15).toFixed(2) + " Q";
  if (num >= 1e12) return (num / 1e12).toFixed(2) + " T";
  if (num >= 1e9) return (num / 1e9).toFixed(2) + " B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + " M";
  if (num >= 1e3) return (num / 1e3).toFixed(2) + " K";
  return num.toLocaleString();
}
