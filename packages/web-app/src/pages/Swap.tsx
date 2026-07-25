import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownUp, Loader2, Search, X, ChevronDown, AlertCircle } from "lucide-react";
import { useWalletStore } from "../store/wallet";
import { useBalances } from "../hooks/useBalances";
import { useQuery } from "@tanstack/react-query";
import { tokenApi, swapApi } from "../lib/api";
import TokenIcon from "../components/TokenIcon";
import PinModal from "../components/PinModal";
import { toast } from "sonner";
import * as StellarSdk from "@stellar/stellar-sdk";
import { calculatePlatformFee, extractStellarError } from "../lib/stellar";

interface TokenOption {
  code: string;
  issuer: string | null;
  name: string;
  image: string | null;
  isNative: boolean;
  balance?: string;
}

interface SwapQuote {
  estimatedReceive?: string;
  rate?: string;
  path?: { asset_code?: string }[];
}

export default function SwapPage() {
  const { t } = useTranslation();
  const publicKey = useWalletStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? null
  );
  const network = useWalletStore((s) => s.network);

  const { data: balances } = useBalances();
  const { data: featuredRaw } = useQuery({
    queryKey: ["featured"],
    queryFn: () => tokenApi.featured(),
  });

  const [fromToken, setFromToken] = useState<TokenOption | null>(null);
  const [toToken, setToToken] = useState<TokenOption | null>(null);
  const [amount, setAmount] = useState("");
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const tokenOptions = useMemo<TokenOption[]>(() => {
    const options: TokenOption[] = [];
    const seen = new Set<string>();
    if (balances) {
      for (const b of balances) {
        const key = `${b.assetCode}-${b.assetIssuer || "native"}`;
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({ code: b.assetCode, issuer: b.assetIssuer || null, name: b.token?.tomlName || (b.assetType === "native" ? t("dashboard.stellarLumens") : b.assetCode), image: b.token?.tomlImage || null, isNative: b.assetType === "native", balance: b.balance });
      }
    }
    const featured = Array.isArray(featuredRaw) ? featuredRaw : Array.isArray((featuredRaw as any)?.data) ? (featuredRaw as any).data : [];
    for (const tk of featured) {
      const code = tk.assetCode || tk.asset_code || "";
      const issuer = tk.assetIssuer || tk.asset_issuer || null;
      const key = `${code}-${issuer || "native"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ code, issuer, name: tk.tomlName || tk.toml_name || code, image: tk.tomlImage || tk.toml_image || null, isNative: (tk.assetType || tk.asset_type) === "native", balance: undefined });
    }
    return options;
  }, [balances, featuredRaw, t]);

  const fromOptions = useMemo(() => tokenOptions.filter((tk) => tk.balance != null && parseFloat(tk.balance) > 0), [tokenOptions]);
  const toOptions = useMemo(() => tokenOptions.filter((tk) => !(tk.code === fromToken?.code && tk.issuer === fromToken?.issuer)), [tokenOptions, fromToken]);

  useMemo(() => {
    if (!fromToken && fromOptions.length > 0) {
      const xlm = fromOptions.find((tk) => tk.isNative);
      setFromToken(xlm || fromOptions[0]);
    }
  }, [fromOptions, fromToken]);

  const { data: quote, isLoading: quoteLoading, error: quoteError } = useQuery<SwapQuote>({
    queryKey: ["swap-quote", fromToken?.code, fromToken?.issuer, toToken?.code, toToken?.issuer, amount],
    queryFn: async () => {
      const result = await swapApi.quote({ fromCode: fromToken!.code, fromIssuer: fromToken!.issuer || "", toCode: toToken!.code, toIssuer: toToken!.issuer || "", amount });
      return result as SwapQuote;
    },
    enabled: !!fromToken && !!toToken && !!amount && parseFloat(amount) > 0,
    refetchInterval: 15_000,
  });

  const flipTokens = () => { const prev = fromToken; setFromToken(toToken); setToToken(prev); setAmount(""); };

  const handleSwap = () => {
    if (!fromToken || !toToken || !amount || parseFloat(amount) <= 0) { toast.error(t("swap.selectAndEnter")); return; }
    setShowPin(true);
  };

  const executeSwap = async (pin: string) => {
    setShowPin(false);
    setSubmitting(true);
    try {
      await useWalletStore.getState().unlock(pin);
      const secret = useWalletStore.getState().getSecretKey();
      if (!secret) { toast.error(t("swap.invalidPin")); setSubmitting(false); return; }
      const keypair = StellarSdk.Keypair.fromSecret(secret);
      const horizonUrl = network === "testnet" ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org";
      const server = new StellarSdk.Horizon.Server(horizonUrl);
      const account = await server.loadAccount(publicKey!);
      const networkPassphrase = network === "testnet" ? StellarSdk.Networks.TESTNET : StellarSdk.Networks.PUBLIC;
      const fromAsset = fromToken!.isNative ? StellarSdk.Asset.native() : new StellarSdk.Asset(fromToken!.code, fromToken!.issuer!);
      const toAsset = toToken!.isNative ? StellarSdk.Asset.native() : new StellarSdk.Asset(toToken!.code, toToken!.issuer!);
      const destMin = quote?.estimatedReceive ? (parseFloat(quote.estimatedReceive) * 0.99).toFixed(7) : "0.0000001";
      // Calculate fee WITHIN the send amount
      const totalSend = parseFloat(amount).toFixed(7);
      const swapFeeAmount = calculatePlatformFee(totalSend);
      const netSendAmount = swapFeeAmount !== "0"
        ? (parseFloat(totalSend) - parseFloat(swapFeeAmount)).toFixed(7)
        : totalSend;

      const txBuilder = new StellarSdk.TransactionBuilder(account, { fee: "100000", networkPassphrase })
        .addOperation(StellarSdk.Operation.pathPaymentStrictSend({ sendAsset: fromAsset, sendAmount: netSendAmount, destination: publicKey!, destAsset: toAsset, destMin }));

      // Platform fee from the same total
      const platformWallet: string = import.meta.env.VITE_PLATFORM_WALLET || "";
      if (swapFeeAmount !== "0" && platformWallet) {
        txBuilder.addOperation(
          StellarSdk.Operation.payment({
            destination: platformWallet,
            asset: fromAsset,
            amount: swapFeeAmount,
          })
        );
      }

      const tx = txBuilder.setTimeout(60).build();
      tx.sign(keypair);
      await server.submitTransaction(tx);
      toast.success(t("swap.successMessage", { amount, from: fromToken!.code, to: toToken!.code }));
      setAmount("");
    } catch (err: any) {
      console.error("Swap error:", err);
      toast.error(extractStellarError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const filterTokens = (list: TokenOption[], query: string) =>
    list.filter((tk) => tk.code.toLowerCase().includes(query.toLowerCase()) || tk.name.toLowerCase().includes(query.toLowerCase()));

  const fromBalance = fromToken?.balance ? parseFloat(fromToken.balance) : 0;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stellar-text">{t("swap.title")}</h1>
        <p className="mt-1 text-sm text-stellar-muted">{t("swap.subtitle")}</p>
      </div>

      {/* From */}
      <div className="bg-stellar-card border border-stellar-border rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-stellar-muted">{t("swap.youSend")}</span>
          {fromToken?.balance != null && (
            <button onClick={() => setAmount(fromToken.balance!)} className="text-xs text-stellar-blue hover:text-stellar-blue/80 transition-colors">
              {t("common.max")}: {parseFloat(fromToken.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input type="number" min="0" step="any" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="flex-1 bg-transparent text-2xl text-stellar-text font-medium placeholder:text-stellar-muted/40 focus:outline-none" />
          <TokenPickerButton selected={fromToken} placeholder={t("swap.selectToken")} onClick={() => { setShowFromPicker(!showFromPicker); setShowToPicker(false); }} />
        </div>
        {showFromPicker && (
          <TokenPickerDropdown tokens={filterTokens(fromOptions, searchFrom)} selected={fromToken} search={searchFrom} onSearch={setSearchFrom} onSelect={(tk) => { setFromToken(tk); setShowFromPicker(false); setSearchFrom(""); if (toToken?.code === tk.code && toToken?.issuer === tk.issuer) setToToken(null); }} onClose={() => { setShowFromPicker(false); setSearchFrom(""); }} showBalances searchPlaceholder={t("swap.searchTokens")} noResultsText={t("swap.noTokens")} />
        )}
        {parseFloat(amount) > fromBalance && fromBalance > 0 && (
          <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} /> {t("swap.exceedsBalance")}</p>
        )}
      </div>

      {/* Flip */}
      <div className="flex justify-center -my-3 relative z-10">
        <button onClick={flipTokens} className="bg-stellar-card border border-stellar-border rounded-xl p-3 hover:bg-white/5 transition-colors">
          <ArrowDownUp size={20} className="text-stellar-blue" />
        </button>
      </div>

      {/* To */}
      <div className="bg-stellar-card border border-stellar-border rounded-2xl p-5 space-y-3">
        <span className="text-sm text-stellar-muted">{t("swap.youReceive")}</span>
        <div className="flex items-center gap-3">
          <div className="flex-1 text-2xl font-medium">
            {quoteLoading ? (<Loader2 size={24} className="animate-spin text-stellar-muted" />) : quote?.estimatedReceive ? (<span className="text-stellar-text">{parseFloat(quote.estimatedReceive).toLocaleString(undefined, { maximumFractionDigits: 7 })}</span>) : (<span className="text-stellar-muted/40">0.00</span>)}
          </div>
          <TokenPickerButton selected={toToken} placeholder={t("swap.selectToken")} onClick={() => { setShowToPicker(!showToPicker); setShowFromPicker(false); }} />
        </div>
        {showToPicker && (
          <TokenPickerDropdown tokens={filterTokens(toOptions, searchTo)} selected={toToken} search={searchTo} onSearch={setSearchTo} onSelect={(tk) => { setToToken(tk); setShowToPicker(false); setSearchTo(""); }} onClose={() => { setShowToPicker(false); setSearchTo(""); }} showBalances={false} searchPlaceholder={t("swap.searchTokens")} noResultsText={t("swap.noTokens")} />
        )}
      </div>

      {/* Quote details */}
      {quote && !quoteLoading && fromToken && toToken && (
        <div className="bg-stellar-card border border-stellar-border rounded-xl p-4 space-y-2 text-sm">
          {quote.rate && (
            <div className="flex justify-between text-stellar-muted">
              <span>{t("swap.rate")}</span>
              <span className="text-stellar-text">1 {fromToken.code} ≈ {parseFloat(quote.rate).toLocaleString(undefined, { maximumFractionDigits: 7 })} {toToken.code}</span>
            </div>
          )}
          {quote.path && quote.path.length > 0 && (
            <div className="flex justify-between text-stellar-muted">
              <span>{t("swap.route")}</span>
              <span className="text-stellar-text">{fromToken.code} → {quote.path.map((p) => p.asset_code || "XLM").join(" → ")} → {toToken.code}</span>
            </div>
          )}
          <div className="flex justify-between text-stellar-muted">
            <span>{t("swap.slippage")}</span>
            <span className="text-stellar-text">1%</span>
          </div>
        </div>
      )}

      {quoteError && toToken && amount && parseFloat(amount) > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          {t("swap.noPath", { from: fromToken?.code, to: toToken.code })}
        </div>
      )}

      {/* Swap button */}
      <button onClick={handleSwap} disabled={!fromToken || !toToken || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > fromBalance || !quote?.estimatedReceive || submitting} className="w-full py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-stellar-blue to-stellar-purple hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
        {submitting ? (<span className="flex items-center justify-center gap-2"><Loader2 size={20} className="animate-spin" />{t("swap.swapping")}</span>)
          : !fromToken || !toToken ? t("swap.selectTokens")
          : !amount || parseFloat(amount) <= 0 ? t("swap.enterAmount")
          : parseFloat(amount) > fromBalance ? t("swap.insufficientBalance")
          : !quote?.estimatedReceive ? t("swap.fetchingQuote")
          : t("swap.swapButton", { from: fromToken.code, to: toToken.code })}
      </button>

      {showPin && (<PinModal title={t("swap.confirmSwap")} onSubmit={executeSwap} onCancel={() => setShowPin(false)} />)}
    </div>
  );
}

/* ─── Sub-components ─── */

function TokenPickerButton({ selected, placeholder = "Select", onClick }: { selected: TokenOption | null; placeholder?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 bg-stellar-bg border border-stellar-border rounded-xl px-3 py-2 hover:border-stellar-blue/50 transition-colors shrink-0">
      {selected ? (<><TokenIcon code={selected.code} image={selected.image} size={24} /><span className="text-stellar-text font-medium text-sm">{selected.code}</span></>) : (<span className="text-stellar-muted text-sm">{placeholder}</span>)}
      <ChevronDown size={14} className="text-stellar-muted" />
    </button>
  );
}

function TokenPickerDropdown({ tokens, selected, search, onSearch, onSelect, onClose: _onClose, showBalances, searchPlaceholder, noResultsText }: { tokens: TokenOption[]; selected: TokenOption | null; search: string; onSearch: (q: string) => void; onSelect: (t: TokenOption) => void; onClose: () => void; showBalances: boolean; searchPlaceholder?: string; noResultsText?: string }) {
  return (
    <div className="bg-stellar-bg border border-stellar-border rounded-xl shadow-2xl overflow-hidden">
      <div className="p-3 border-b border-stellar-border">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
          <input type="text" placeholder={searchPlaceholder || "Search..."} value={search} onChange={(e) => onSearch(e.target.value)} className="w-full bg-stellar-card border border-stellar-border rounded-lg pl-9 pr-8 py-2 text-sm text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue/50" autoFocus />
          {search && (<button onClick={() => onSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-stellar-muted hover:text-stellar-text"><X size={14} /></button>)}
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {tokens.map((tk) => {
          const isSelected = selected?.code === tk.code && selected?.issuer === tk.issuer;
          return (
            <button key={`${tk.code}-${tk.issuer || "native"}`} onClick={() => onSelect(tk)} className={`w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors ${isSelected ? "bg-stellar-blue/10" : ""}`}>
              <div className="flex items-center gap-3">
                <TokenIcon code={tk.code} image={tk.image} size={28} />
                <div className="text-left">
                  <p className="text-stellar-text text-sm font-medium">{tk.code}</p>
                  <p className="text-xs text-stellar-muted">{tk.name}</p>
                </div>
              </div>
              {showBalances && tk.balance != null && (<span className="text-xs text-stellar-muted font-mono">{parseFloat(tk.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>)}
            </button>
          );
        })}
        {tokens.length === 0 && (<p className="text-center text-stellar-muted text-sm py-6">{noResultsText || "No results"}</p>)}
      </div>
    </div>
  );
}