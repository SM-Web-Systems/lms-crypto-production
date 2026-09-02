import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fiatApi, moneygramApi } from "../lib/api";
import { useWalletStore } from "../store/wallet";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, RefreshCw, CreditCard, Building2, Smartphone, Banknote, ExternalLink } from "lucide-react";

type Tab = "buy" | "sell";

interface Currency {
  code: string;
  name: string;
  symbol: string;
  minBuy: number;
  maxBuy: number;
  minSell: number;
  maxSell: number;
}

export default function BuySellPage() {
  const { t } = useTranslation();
  const activeAccount = useWalletStore((s) => s.activeAccount());
  const [tab, setTab] = useState<Tab>("buy");
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("card");

  const { data: currencyData } = useQuery({
    queryKey: ["fiat-currencies"],
    queryFn: fiatApi.currencies,
    staleTime: 60 * 1000,
  });

  const currencies: Currency[] = currencyData?.currencies || [];
  const feePercent = currencyData?.feePercent || 0.3;
  const selectedCurrency = currencies.find((c: Currency) => c.code === currency);

  const buyQuote = useMutation({
    mutationFn: () => fiatApi.buyQuote(currency, parseFloat(amount)),
  });

  const sellQuote = useMutation({
    mutationFn: () => fiatApi.sellQuote(currency, parseFloat(amount)),
  });

  const getQuote = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (tab === "buy") {
      buyQuote.mutate();
    } else {
      sellQuote.mutate();
    }
  };

  const [mgLoading, setMgLoading] = useState(false);

  const handleMoneyGram = async () => {
    if (!activeAccount) {
      toast.error("No wallet selected");
      return;
    }
    setMgLoading(true);
    try {
      const fn = tab === "buy" ? moneygramApi.deposit : moneygramApi.withdraw;
      const result = await fn(activeAccount.publicKey, amount || undefined);
      if (result.error) {
        toast.error(result.error);
      } else if (result.interactiveUrl) {
        toast.success("Redirecting to MoneyGram...");
        window.open(result.interactiveUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err: any) {
      toast.error(err.message || "MoneyGram unavailable");
    } finally {
      setMgLoading(false);
    }
  };

  const quote = tab === "buy" ? buyQuote.data : sellQuote.data;
  const quoteLoading = tab === "buy" ? buyQuote.isPending : sellQuote.isPending;

  const paymentMethods = [
    { id: "card", label: "Card", icon: CreditCard },
    { id: "bank_transfer", label: "Bank Transfer", icon: Building2 },
    { id: "mobile_money", label: "Mobile Money", icon: Smartphone },
    { id: "moneygram", label: "MoneyGram Cash", icon: Banknote },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-stellar-text">{t("fiat.title", "Buy & Sell")}</h1>

      <div className="flex gap-2 bg-stellar-card rounded-xl p-1">
        <button
          onClick={() => { setTab("buy"); buyQuote.reset(); sellQuote.reset(); }}
          className={"flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors " + (tab === "buy" ? "bg-stellar-success text-white" : "text-stellar-muted hover:text-white")}
        >
          <ArrowDown size={16} />
          {t("fiat.buy", "Buy Crypto")}
        </button>
        <button
          onClick={() => { setTab("sell"); buyQuote.reset(); sellQuote.reset(); }}
          className={"flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors " + (tab === "sell" ? "bg-stellar-danger text-white" : "text-stellar-muted hover:text-white")}
        >
          <ArrowUp size={16} />
          {t("fiat.sell", "Sell Crypto")}
        </button>
      </div>

      <div className="bg-stellar-card border border-stellar-border rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm text-stellar-muted mb-1.5">
            {tab === "buy" ? t("fiat.youPay", "You pay") : t("fiat.youSell", "You sell (XLM)")}
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-stellar-dark border border-stellar-border rounded-lg px-4 py-3 text-stellar-text placeholder-stellar-muted/50 focus:outline-none focus:border-stellar-blue"
            />
            {tab === "buy" && (
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="bg-stellar-dark border border-stellar-border rounded-lg px-3 py-3 text-stellar-text focus:outline-none focus:border-stellar-blue"
              >
                {currencies.map((c: Currency) => (
                  <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                ))}
              </select>
            )}
          </div>
          {selectedCurrency && tab === "buy" && (
            <p className="text-xs text-stellar-muted mt-1">
              Min: {selectedCurrency.symbol}{selectedCurrency.minBuy} / Max: {selectedCurrency.symbol}{selectedCurrency.maxBuy}
            </p>
          )}
        </div>

        {tab === "sell" && (
          <div>
            <label className="block text-sm text-stellar-muted mb-1.5">{t("fiat.receiveCurrency", "Receive currency")}</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full bg-stellar-dark border border-stellar-border rounded-lg px-4 py-3 text-stellar-text focus:outline-none focus:border-stellar-blue"
            >
              {currencies.map((c: Currency) => (
                <option key={c.code} value={c.code}>{c.symbol} {c.code} - {c.name}</option>
              ))}
            </select>
          </div>
        )}

        {tab === "buy" && (
          <div>
            <label className="block text-sm text-stellar-muted mb-1.5">{t("fiat.paymentMethod", "Payment method")}</label>
            <div className="flex gap-2">
              {paymentMethods.map((pm) => {
                const Icon = pm.icon;
                return (
                  <button
                    key={pm.id}
                    onClick={() => setPaymentMethod(pm.id)}
                    className={"flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors " + (paymentMethod === pm.id ? "border-stellar-blue bg-stellar-blue/10 text-white" : "border-stellar-border text-stellar-muted hover:text-white")}
                  >
                    <Icon size={18} />
                    {pm.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={getQuote}
          disabled={quoteLoading}
          className="w-full flex items-center justify-center gap-2 bg-stellar-blue hover:bg-stellar-blue/80 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {quoteLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {t("fiat.getQuote", "Get Quote")}
        </button>

        {quote && (
          <div className="bg-stellar-dark rounded-lg p-4 space-y-2 border border-stellar-border">
            <div className="flex justify-between text-sm">
              <span className="text-stellar-muted">{t("fiat.rate", "Rate")}</span>
              <span className="text-stellar-text">1 XLM = {selectedCurrency?.symbol}{parseFloat(quote.rate).toFixed(4)} {currency}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stellar-muted">{t("fiat.fee", "Fee")} ({feePercent}%)</span>
              <span className="text-stellar-danger">{selectedCurrency?.symbol}{quote.fee}</span>
            </div>
            <div className="border-t border-stellar-border my-2" />
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-stellar-muted">
                {tab === "buy" ? t("fiat.youReceive", "You receive") : t("fiat.youGet", "You get")}
              </span>
              <span className="text-stellar-success">
                {tab === "buy"
                  ? parseFloat(quote.estimatedAmount).toFixed(2) + " XLM"
                  : selectedCurrency?.symbol + quote.netFiat + " " + currency
                }
              </span>
            </div>

            {paymentMethod === "moneygram" ? (
              <button
                onClick={handleMoneyGram}
                disabled={mgLoading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white py-3 rounded-lg font-medium transition-all disabled:opacity-50"
              >
                {mgLoading ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                {tab === "buy"
                  ? t("fiat.mgDeposit", "Cash In at MoneyGram")
                  : t("fiat.mgWithdraw", "Cash Out via MoneyGram")
                }
              </button>
            ) : (
              <button
                onClick={() => {
                  const walletAddress = activeAccount?.publicKey || "";
                  const params = new URLSearchParams({
                    apiKey: "52a6703b-cb9b-4f77-83bc-3682394288fd",
                    environment: "PRODUCTION",
                    cryptoCurrencyCode: "XLM",
                    network: "stellar",
                    defaultCryptoCurrency: "XLM",
                    walletAddress,
                    fiatCurrency: currency,
                    fiatAmount: amount,
                    productsAvailed: tab === "buy" ? "BUY" : "SELL",
                    paymentMethod: paymentMethod === "card" ? "credit_debit_card" : paymentMethod === "bank_transfer" ? "sepa_bank_transfer" : "mobile_money",
                    themeColor: "6366f1",
                  });
                  window.open("https://global.transak.com/?" + params.toString(), "_blank", "noopener,noreferrer");
                }}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white py-3 rounded-lg font-medium transition-all"
              >
                <ExternalLink size={16} />
                {tab === "buy"
                  ? t("fiat.transakBuy", "Buy with Transak")
                  : t("fiat.transakSell", "Sell with Transak")
                }
              </button>
            )}
          </div>
        )}

        {activeAccount && tab === "buy" && (
          <p className="text-xs text-stellar-muted text-center">
            {t("fiat.destination", "Tokens will be sent to")} {activeAccount.publicKey.substring(0, 8)}...{activeAccount.publicKey.substring(48)}
          </p>
        )}
      </div>
    </div>
  );
}
