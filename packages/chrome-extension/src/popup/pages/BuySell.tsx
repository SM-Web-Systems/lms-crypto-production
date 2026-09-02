import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fiatApi, moneygramApi } from "../../shared/lib/api";
import { useWalletStore } from "../../shared/store/wallet";
import { DollarSign, ArrowDownUp, Banknote, ExternalLink, Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";

type Tab = "buy" | "sell";
type Method = "quote" | "moneygram" | "transak";

export default function BuySell() {
  const { t } = useTranslation();
  const activeAccount = useWalletStore((s) => s.accounts.find((a) => a.id === s.activeAccountId));
  const publicKey = activeAccount?.publicKey || "";
  const [tab, setTab] = useState<Tab>("buy");
  const [method, setMethod] = useState<Method>("transak");
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");

  const { data: mgInfo } = useQuery<{ limits?: { onRamp?: { min: string; max: string }; offRamp?: { min: string; max: string } }; feePercent?: number; status?: string; supportedAssets?: string[] }>({
    queryKey: ["moneygram-info"],
    queryFn: () => moneygramApi.info() as any,
  });

  const { data: currencies } = useQuery<{ currencies: { code: string; name: string; symbol: string }[]; feePercent: number; provider: string }>({
    queryKey: ["fiat-currencies"],
    queryFn: () => fiatApi.currencies() as any,
  });

  const quoteMutation = useMutation({
    mutationFn: () =>
      tab === "buy"
        ? fiatApi.quoteBuy({ fiatCurrency: currency, fiatAmount: Number(amount) })
        : fiatApi.quoteSell({ fiatCurrency: currency, cryptoAmount: Number(amount) }),
    onError: (e: Error) => toast.error(e.message),
  });

  const mgDepositMutation = useMutation({
    mutationFn: () => moneygramApi.deposit({ publicKey, amount }),
    onSuccess: (data: any) => {
      if (data.interactiveUrl) {
        window.open(data.interactiveUrl, "_blank");
        toast.success(t("buysell.redirecting", "Redirecting to MoneyGram..."));
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mgWithdrawMutation = useMutation({
    mutationFn: () => moneygramApi.withdraw({ publicKey, amount }),
    onSuccess: (data: any) => {
      if (data.interactiveUrl) {
        window.open(data.interactiveUrl, "_blank");
        toast.success(t("buysell.redirecting", "Redirecting to MoneyGram..."));
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleMoneyGram = () => {
    if (!publicKey) return toast.error(t("common.noWallet", "No active wallet"));
    if (tab === "buy") mgDepositMutation.mutate();
    else mgWithdrawMutation.mutate();
  };

  const mgLoading = mgDepositMutation.isPending || mgWithdrawMutation.isPending;
  const limits = mgInfo ? (tab === "buy" ? mgInfo.limits?.onRamp : mgInfo.limits?.offRamp) : null;

  const quoteResult = quoteMutation.data as any;
  const quoteYouGet = quoteResult
    ? tab === "buy"
      ? `${quoteResult.estimatedAmount || "—"} XLM`
      : `${quoteResult.estimatedFiat || "—"} ${currency}`
    : "";

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <DollarSign size={20} className="text-stellar-blue" />
        <h1 className="text-lg font-bold text-white">{t("nav.buysell", "Buy & Sell")}</h1>
      </div>

      <div className="flex bg-stellar-card rounded-lg border border-stellar-border p-0.5">
        <button
          onClick={() => setTab("buy")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${tab === "buy" ? "bg-green-600/20 text-green-400" : "text-stellar-muted hover:text-white"}`}
        >
          {t("buysell.buy", "Buy")}
        </button>
        <button
          onClick={() => setTab("sell")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${tab === "sell" ? "bg-red-600/20 text-red-400" : "text-stellar-muted hover:text-white"}`}
        >
          {t("buysell.sell", "Sell")}
        </button>
      </div>

      <div className="bg-stellar-card rounded-xl p-3 border border-stellar-border space-y-3">
        <div>
          <label className="text-xs text-stellar-muted mb-1 block">{t("buysell.amount", "Amount")}</label>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-stellar-bg border border-stellar-border rounded-lg px-3 py-2 text-sm text-white"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-stellar-bg border border-stellar-border rounded-lg px-2 py-2 text-sm text-white"
            >
              {(currencies?.currencies || [{ code: "USD" }, { code: "EUR" }, { code: "GBP" }, { code: "ZAR" }, { code: "NGN" }, { code: "KES" }, { code: "BRL" }]).map((c: any) => (
                <option key={c.code || c} value={c.code || c}>{c.code || c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setMethod("moneygram")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors ${method === "moneygram" ? "border-stellar-blue bg-stellar-blue/10 text-stellar-blue" : "border-stellar-border text-stellar-muted hover:text-white"}`}
          >
            <Banknote size={14} />
            MoneyGram
          </button>
          <button
            onClick={() => setMethod("quote")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors ${method === "quote" ? "border-stellar-blue bg-stellar-blue/10 text-stellar-blue" : "border-stellar-border text-stellar-muted hover:text-white"}`}
          >
            <ArrowDownUp size={14} />
            {t("buysell.quote", "Quote")}
          </button>
          <button
            onClick={() => setMethod("transak")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors ${method === "transak" ? "border-indigo-500 bg-indigo-500/10 text-indigo-400" : "border-stellar-border text-stellar-muted hover:text-white"}`}
          >
            <CreditCard size={14} />
            Transak
          </button>
        </div>

        {limits && (
          <p className="text-[10px] text-stellar-muted">
            {t("buysell.limits", "Limits")}: ${limits.min} – ${limits.max} USDC &middot; {t("buysell.fee", "Fee")}: {mgInfo?.feePercent}%
          </p>
        )}

        {method === "moneygram" ? (
          <button
            onClick={handleMoneyGram}
            disabled={!amount || mgLoading || !publicKey}
            className="w-full py-2.5 rounded-lg bg-stellar-blue text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {mgLoading ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
            {tab === "buy" ? t("buysell.depositMG", "Deposit via MoneyGram") : t("buysell.withdrawMG", "Withdraw via MoneyGram")}
          </button>
        ) : method === "transak" ? (
          <button
            onClick={() => {
              const params = new URLSearchParams({
                apiKey: "52a6703b-cb9b-4f77-83bc-3682394288fd",
                environment: "PRODUCTION",
                cryptoCurrencyCode: "XLM",
                network: "stellar",
                defaultCryptoCurrency: "XLM",
                walletAddress: publicKey,
                fiatCurrency: currency,
                fiatAmount: amount || "50",
                productsAvailed: tab === "buy" ? "BUY" : "SELL",
                themeColor: "6366f1",
              });
              window.open("https://global.transak.com/?" + params.toString(), "_blank", "noopener,noreferrer");
            }}
            disabled={!publicKey}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <ExternalLink size={16} />
            {tab === "buy" ? t("buysell.transakBuy", "Buy with Transak") : t("buysell.transakSell", "Sell with Transak")}
          </button>
        ) : (
          <button
            onClick={() => quoteMutation.mutate()}
            disabled={!amount || quoteMutation.isPending}
            className="w-full py-2.5 rounded-lg bg-stellar-blue text-white text-sm font-medium disabled:opacity-50"
          >
            {quoteMutation.isPending ? "..." : t("buysell.getQuote", "Get Quote")}
          </button>
        )}

        {quoteResult && (
          <div className="bg-stellar-bg rounded-lg p-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-stellar-muted">{t("buysell.rate", "Rate")}</span>
              <span className="text-white">{quoteResult.rate || "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-stellar-muted">{t("buysell.youGet", "You get")}</span>
              <span className="text-white">{quoteYouGet}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-stellar-muted">{t("buysell.fee", "Fee")}</span>
              <span className="text-white">{quoteResult.fee || "—"} ({quoteResult.feePercent || 0}%)</span>
            </div>
          </div>
        )}
      </div>

      {mgInfo?.status === "configured" && (
        <p className="text-[10px] text-center text-stellar-muted">
          {t("buysell.mgPowered", "Powered by MoneyGram — 174 countries supported")}
        </p>
      )}
    </div>
  );
}
