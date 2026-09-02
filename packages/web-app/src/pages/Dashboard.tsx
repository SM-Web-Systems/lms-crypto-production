import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBalances } from "../hooks/useBalances";
import { useWalletStore } from "../store/wallet";
import { useAuthStore } from "../store/auth";
import TokenIcon from "../components/TokenIcon";
import { Loader2, X } from "lucide-react";
import { getAccessToken } from "../lib/api";

export default function DashboardPage() {
  const { t } = useTranslation();
  const publicKey = useWalletStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? null
  );
  const { data: balances, isLoading } = useBalances();
  const totalXlm = balances?.find((b) => b.assetCode === "XLM")?.balance || "0";

  const user = useAuthStore((s) => s.user);
  const [showFundingNotice, setShowFundingNotice] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const dismissKey = `amma_funding_notice_dismissed_${user.id}`;
    if (localStorage.getItem(dismissKey)) return;
    const token = getAccessToken();
    if (!token) return;
    fetch("/api/v1/wallet/funding-notice", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((body) => { if (body.hasFundingEvent) setShowFundingNotice(true); })
      .catch(() => {});
  }, [user?.id]);

  const handleDismissFunding = () => {
    if (user?.id) localStorage.setItem(`amma_funding_notice_dismissed_${user.id}`, "1");
    setShowFundingNotice(false);
  };

  return (
    <div className="space-y-8">
      {showFundingNotice && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <span className="text-base" role="img" aria-label="Wallet funded">💳</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stellar-text">Your wallet has been activated!</p>
            <p className="text-xs text-stellar-muted mt-0.5 leading-relaxed">
              SM Web Systems has activated and funded your Amma Wallet so you can receive
              NFT certificates for completed courses.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismissFunding}
            className="shrink-0 p-1 rounded text-stellar-muted hover:text-stellar-text transition-colors"
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-stellar-text">{t("dashboard.title")}</h1>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <p className="text-sm text-stellar-muted font-mono">{publicKey}</p>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-400 font-medium shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            Mainnet
          </span>
        </div>
      </div>

      <div className="bg-gradient-to-br from-stellar-blue/30 to-stellar-purple/20 border border-stellar-border rounded-2xl p-8">
        <p className="text-sm text-stellar-muted">{t("dashboard.totalBalance")}</p>
        <p className="mt-2 text-4xl font-bold text-stellar-text">
          {parseFloat(totalXlm).toLocaleString(undefined, { maximumFractionDigits: 4 })} XLM
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-stellar-text mb-4">{t("dashboard.yourAssets")}</h2>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-stellar-muted" size={32} />
          </div>
        ) : !balances || balances.length === 0 ? (
          <p className="text-stellar-muted text-center py-12">{t("dashboard.noAssets")}</p>
        ) : (
          <div className="space-y-2">
            {balances.map((b) => (
              <Link
                key={`${b.assetCode}-${b.assetIssuer}`}
                to={`/tokens/${encodeURIComponent(b.assetCode)}/${encodeURIComponent(b.assetIssuer || "native")}`}
                className="flex items-center justify-between bg-stellar-card border border-stellar-border rounded-xl px-5 py-4 hover:border-stellar-blue/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <TokenIcon code={b.assetCode} image={b.token?.tomlImage} size={36} />
                  <div>
                    <p className="font-medium text-stellar-text">{b.assetCode}</p>
                    <p className="text-xs text-stellar-muted">
                      {b.token?.tomlName || b.token?.domain || (b.assetType === "native" ? t("dashboard.stellarLumens") : b.assetIssuer?.slice(0, 12) + "...")}
                    </p>
                  </div>
                </div>
                <p className="font-mono text-stellar-text">
                  {parseFloat(b.balance).toLocaleString(undefined, { maximumFractionDigits: 7 })}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}