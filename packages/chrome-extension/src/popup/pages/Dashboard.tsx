import { useTranslation } from "react-i18next";
import { useWalletStore } from "../../shared/store/wallet";
import { useBalances } from "../../shared/hooks/useBalances";
import TokenIcon from "../../shared/components/TokenIcon";
import { Copy, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function Dashboard() {
  const { t } = useTranslation();
  const publicKey = useWalletStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? ""
  );
  const { data: balances, isLoading } = useBalances();

  const xlmBalance = balances?.find(
    (b) => b.assetCode === "XLM" && (b.assetType === "native" || !b.assetIssuer)
  );

  const copyAddress = () => {
    navigator.clipboard.writeText(publicKey);
    toast.success(t("common.copied"));
  };

  return (
    <div className="p-4 space-y-4">
      {/* Address */}
      <div
        onClick={copyAddress}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stellar-card border border-stellar-border cursor-pointer hover:border-stellar-blue transition-colors"
      >
        <span className="text-xs text-stellar-muted truncate flex-1 font-mono">
          {publicKey}
        </span>
        <Copy size={14} className="text-stellar-muted shrink-0" />
      </div>

      {/* XLM Balance */}
      <div className="text-center py-4">
        <p className="text-3xl font-bold text-white">
          {xlmBalance ? parseFloat(xlmBalance.balance).toFixed(2) : "0.00"}
        </p>
        <p className="text-sm text-stellar-muted">XLM</p>
      </div>

      {/* Assets */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-2">
          {t("dashboard.yourAssets")}
        </h3>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-stellar-blue" size={24} />
          </div>
        ) : !balances?.length ? (
          <p className="text-sm text-stellar-muted text-center py-8">
            {t("dashboard.noAssets")}
          </p>
        ) : (
          <div className="space-y-1">
            {balances.map((b) => {
              const code = b.assetCode || "XLM";
              const issuer = b.assetIssuer || "native";
              return (
                <Link
                  key={`${code}-${issuer}`}
                  to={`/tokens/${encodeURIComponent(code)}/${encodeURIComponent(issuer)}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <TokenIcon
                    code={code}
                    image={b.token?.tomlImage}
                    size={32}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{code}</p>
                    <p className="text-xs text-stellar-muted truncate">
                      {b.token?.tomlName ||
                        b.token?.domain ||
                        (issuer === "native"
                          ? t("dashboard.stellarLumens")
                          : issuer.slice(0, 8) + "…")}
                    </p>
                  </div>
                  <p className="text-sm text-white font-medium">
                    {parseFloat(b.balance).toFixed(
                      parseFloat(b.balance) > 1000 ? 0 : 2
                    )}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}