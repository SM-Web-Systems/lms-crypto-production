import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { tokenApi } from "../../shared/lib/api";
import { useTranslation } from "react-i18next";
import TokenIcon from "../../shared/components/TokenIcon";
import {
  ArrowLeft, Shield, ShieldAlert, Star, Users, BarChart3,
  Copy, Check, Send, ArrowLeftRight, Loader2, Globe,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const API_BASE = "https://ammawallet.com";

async function fetchFromProxy(code: string, issuer: string) {
  if (code === "XLM" || issuer === "native") return null;
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
    domain: r.home_domain || "",
    isVerified: (r.rating?.average ?? 0) >= 6,
    isSpam: false,
    ratingAverage: r.rating?.average ?? null,
    trustlinesFunded: r.trustlines?.funded ?? null,
    trustlinesTotal: r.trustlines?.total ?? null,
    tradesCount: r.trades ?? null,
    paymentsCount: r.payments ?? null,
    totalSupply: r.supply ? String(r.supply) : null,
    ratingAge: r.rating?.age ?? null,
    ratingTrades: r.rating?.activity ?? null,
    ratingTrustlines: r.rating?.trustlines ?? null,
    ratingLiquidity: r.rating?.liquidity ?? null,
    ratingVolume7d: r.rating?.volume7d ?? null,
    ratingInterop: r.rating?.interop ?? null,
    price: r.price ?? null,
  };
}

async function fetchTokenDetail(code: string, issuer: string) {
  try {
    const result = await tokenApi.detail(code, issuer);
    if (result && !result.error && result.assetCode) return result;
  } catch {}
  const expert = await fetchFromProxy(code, issuer);
  if (expert) return expert;
  throw new Error("Token not found");
}

export default function TokenDetailPage() {
  const { t } = useTranslation();
  const { code, issuer } = useParams<{ code: string; issuer: string }>();
  const navigate = useNavigate();
  const [copiedIssuer, setCopiedIssuer] = useState(false);

  const { data: token, isLoading, error } = useQuery({
    queryKey: ["token-detail", code, issuer],
    queryFn: () => fetchTokenDetail(code!, issuer!),
    enabled: !!code && !!issuer,
  });

  const copyIssuer = () => {
    navigator.clipboard.writeText(issuer || "");
    setCopiedIssuer(true);
    toast.success(t("common.copied"));
    setTimeout(() => setCopiedIssuer(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="animate-spin text-stellar-blue" size={24} />
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="p-3 space-y-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-xs text-stellar-muted hover:text-white">
          <ArrowLeft size={14} /> {t("common.back")}
        </button>
        <p className="text-sm text-red-400">{t("tokens.noTokens")}</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-xs text-stellar-muted hover:text-white">
        <ArrowLeft size={14} /> {t("common.back")}
      </button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <TokenIcon code={token.assetCode} image={token.tomlImage} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">{token.assetCode}</h2>
            {token.isVerified ? (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 text-[9px]">
                <Shield size={8} /> {t("tokens.verified")}
              </span>
            ) : (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[9px]">
                <ShieldAlert size={8} /> {t("tokens.unverified")}
              </span>
            )}
          </div>
          {token.tomlName && <p className="text-xs text-stellar-muted">{token.tomlName}</p>}
          {token.domain && (
            <p className="text-xs text-stellar-blue flex items-center gap-1">
              <Globe size={10} /> {token.domain}
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <button onClick={() => navigate(`/send?asset=${code}`)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-stellar-blue text-white text-xs font-medium">
          <Send size={12} /> {t("nav.send")}
        </button>
        <button onClick={() => navigate(`/swap?to=${code}`)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-stellar-purple text-white text-xs font-medium">
          <ArrowLeftRight size={12} /> {t("nav.swap")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-stellar-card border border-stellar-border rounded-lg p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <Star size={10} className="text-yellow-400" />
            <span className="text-[9px] text-stellar-muted uppercase">{t("tokens.rating")}</span>
          </div>
          <p className="text-sm font-bold text-white">
            {token.ratingAverage != null ? Number(token.ratingAverage).toFixed(1) + "/10" : "—"}
          </p>
        </div>
        <div className="bg-stellar-card border border-stellar-border rounded-lg p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <Users size={10} className="text-stellar-blue" />
            <span className="text-[9px] text-stellar-muted uppercase">{t("tokens.holders")}</span>
          </div>
          <p className="text-sm font-bold text-white">
            {token.trustlinesFunded ? Number(token.trustlinesFunded).toLocaleString() : "—"}
          </p>
        </div>
        <div className="bg-stellar-card border border-stellar-border rounded-lg p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <BarChart3 size={10} className="text-stellar-purple" />
            <span className="text-[9px] text-stellar-muted uppercase">{t("tokens.trades")}</span>
          </div>
          <p className="text-sm font-bold text-white">
            {token.tradesCount ? Number(token.tradesCount).toLocaleString() : "—"}
          </p>
        </div>
        <div className="bg-stellar-card border border-stellar-border rounded-lg p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <BarChart3 size={10} className="text-green-400" />
            <span className="text-[9px] text-stellar-muted uppercase">{t("tokens.payments")}</span>
          </div>
          <p className="text-sm font-bold text-white">
            {token.paymentsCount ? Number(token.paymentsCount).toLocaleString() : "—"}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-3 space-y-2 text-[11px]">
        <div className="flex justify-between">
          <span className="text-stellar-muted">{t("tokens.assetType")}</span>
          <span className="text-white">{token.assetType}</span>
        </div>
        {token.domain && (
          <div className="flex justify-between">
            <span className="text-stellar-muted">{t("tokens.domain")}</span>
            <span className="text-stellar-blue">{token.domain}</span>
          </div>
        )}
        {token.totalSupply && (
          <div className="flex justify-between">
            <span className="text-stellar-muted">{t("tokens.totalSupply", "Supply")}</span>
            <span className="text-white">{formatLargeNumber(token.totalSupply)}</span>
          </div>
        )}
        {token.price != null && (
          <div className="flex justify-between">
            <span className="text-stellar-muted">{t("tokens.price", "Price")}</span>
            <span className="text-white">${Number(token.price).toFixed(4)}</span>
          </div>
        )}
        {issuer && issuer !== "native" && (
          <div className="flex justify-between items-center">
            <span className="text-stellar-muted">{t("tokens.assetIssuer", "Issuer")}</span>
            <button onClick={copyIssuer} className="flex items-center gap-1 text-stellar-muted hover:text-white">
              <span className="font-mono text-[9px]">{issuer!.slice(0, 8)}…{issuer!.slice(-6)}</span>
              {copiedIssuer ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
            </button>
          </div>
        )}
      </div>

      {/* Description */}
      {token.tomlDescription && (
        <div className="bg-stellar-card border border-stellar-border rounded-lg p-3">
          <p className="text-[11px] text-stellar-muted leading-relaxed">{token.tomlDescription}</p>
        </div>
      )}
    </div>
  );
}

function formatLargeNumber(n: string | number): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  if (num >= 1e15) return (num / 1e15).toFixed(2) + "Q";
  if (num >= 1e12) return (num / 1e12).toFixed(2) + "T";
  if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return num.toLocaleString();
}
