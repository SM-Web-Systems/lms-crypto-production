import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useWalletStore } from "../../shared/store/wallet";
import { txApi } from "../../shared/lib/api";
import { Loader2, ExternalLink, ArrowUpRight, ArrowDownLeft, RefreshCw, Settings2, Users, Shuffle } from "lucide-react";

function unwrap(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data?.data && Array.isArray(data.data)) return data.data;
  if (data?.operations && Array.isArray(data.operations)) return data.operations;
  return [];
}

function getOpIcon(type: string) {
  switch (type) {
    case "payment":
    case "path_payment_strict_receive":
    case "path_payment_strict_send":
      return ArrowUpRight;
    case "create_account":
      return Users;
    case "change_trust":
      return RefreshCw;
    case "manage_sell_offer":
    case "manage_buy_offer":
    case "create_passive_sell_offer":
      return Shuffle;
    default:
      return Settings2;
  }
}

function getOpLabel(type: string, t: any): string {
  const map: Record<string, string> = {
    payment: t("history.payment"),
    path_payment_strict_receive: t("history.pathPayment"),
    path_payment_strict_send: t("history.pathPayment"),
    create_account: t("history.createAccount"),
    change_trust: t("history.changeTrust"),
    manage_sell_offer: t("history.manageSellOffer"),
    manage_buy_offer: t("history.manageBuyOffer"),
    create_passive_sell_offer: t("history.createPassiveSellOffer"),
    set_options: t("history.setOptions"),
    account_merge: t("history.accountMerge"),
    manage_data: t("history.manageData"),
    bump_sequence: t("history.bumpSequence"),
    inflation: t("history.inflation"),
    allow_trust: t("history.allowTrust"),
    clawback: t("history.clawback"),
    invoke_host_function: t("history.invokeHostFunction"),
  };
  return map[type] || type.replace(/_/g, " ");
}

export default function HistoryPage() {
  const { t } = useTranslation();
  const publicKey = useWalletStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? null
  );
  const network = useWalletStore((s) => s.network);

  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ["history", publicKey],
    queryFn: () => txApi.history(publicKey!, 20),
    enabled: !!publicKey,
    refetchInterval: 30_000,
  });

  const operations = unwrap(rawData);
  const explorerBase =
    network === "testnet"
      ? "https://stellar.expert/explorer/testnet/op"
      : "https://stellar.expert/explorer/public/op";

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full py-12">
        <Loader2 className="animate-spin text-stellar-blue" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-400">
          {t("history.failedToLoad", { error: (error as Error).message })}
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      <h2 className="text-sm font-bold text-white">{t("history.title")}</h2>

      {operations.length === 0 ? (
        <p className="text-xs text-stellar-muted text-center py-8">
          {t("history.noTransactions")}
        </p>
      ) : (
        <div className="space-y-1">
          {operations.map((op: any, i: number) => {
            const type = op.type || op.type_i?.toString() || "unknown";
            const Icon = getOpIcon(type);
            const label = getOpLabel(type, t);
            const amount = op.amount || op.starting_balance;
            const code = op.asset_code || (op.asset_type === "native" ? "XLM" : "");
            const isIncoming =
              (type === "payment" || type.startsWith("path_payment")) &&
              op.to === publicKey;
            const counterparty = isIncoming ? op.from : op.to;
            const date = op.created_at
              ? new Date(op.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";

            return (
              <div
                key={op.id || i}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    isIncoming
                      ? "bg-green-500/15 text-green-400"
                      : "bg-stellar-blue/15 text-stellar-blue"
                  }`}
                >
                  {isIncoming ? (
                    <ArrowDownLeft size={14} />
                  ) : (
                    <Icon size={14} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white">{label}</p>
                  {counterparty && (
                    <p className="text-[10px] text-stellar-muted truncate">
                      {isIncoming
                        ? t("history.from", {
                            address:
                              counterparty.slice(0, 6) +
                              "…" +
                              counterparty.slice(-4),
                          })
                        : t("history.to", {
                            address:
                              counterparty.slice(0, 6) +
                              "…" +
                              counterparty.slice(-4),
                          })}
                    </p>
                  )}
                  <p className="text-[9px] text-stellar-muted">{date}</p>
                </div>
                <div className="text-right shrink-0">
                  {amount && (
                    <p
                      className={`text-xs font-mono font-medium ${
                        isIncoming ? "text-green-400" : "text-white"
                      }`}
                    >
                      {isIncoming ? "+" : "−"}
                      {parseFloat(amount).toFixed(4)} {code}
                    </p>
                  )}
                </div>
                {op.id && (
                  <a
                    href={`${explorerBase}/${op.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-stellar-muted hover:text-stellar-blue shrink-0"
                  >
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {operations.length > 0 && (
        <p className="text-[10px] text-stellar-muted text-center">
          {t("common.showing", {
            count: operations.length,
            item:
              operations.length === 1
                ? t("common.operation")
                : t("common.operations"),
          })}
        </p>
      )}
    </div>
  );
}