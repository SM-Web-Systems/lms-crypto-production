import { useState, useMemo } from "react";
import {
  ArrowDownUp,
  Loader2,
  Search,
  X,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWalletStore } from "../../shared/store/wallet";
import { useBalances } from "../../shared/hooks/useBalances";
import { useQuery } from "@tanstack/react-query";
import { tokenApi, swapApi } from "../../shared/lib/api";
import TokenIcon from "../../shared/components/TokenIcon";
import PinModal from "../../shared/components/PinModal";
import { toast } from "sonner";
import * as StellarSdk from "@stellar/stellar-sdk";

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
        options.push({
          code: b.assetCode,
          issuer: b.assetIssuer || null,
          name:
            b.token?.tomlName ||
            (b.assetType === "native" ? t("dashboard.stellarLumens") : b.assetCode),
          image: b.token?.tomlImage || null,
          isNative: b.assetType === "native",
          balance: b.balance,
        });
      }
    }

    const featured = Array.isArray(featuredRaw)
      ? featuredRaw
      : Array.isArray((featuredRaw as any)?.data)
        ? (featuredRaw as any).data
        : [];

    for (const ft of featured) {
      const code = ft.assetCode || ft.asset_code || "";
      const issuer = ft.assetIssuer || ft.asset_issuer || null;
      const key = `${code}-${issuer || "native"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        code,
        issuer,
        name: ft.tomlName || ft.toml_name || code,
        image: ft.tomlImage || ft.toml_image || null,
        isNative: (ft.assetType || ft.asset_type) === "native",
      });
    }

    return options;
  }, [balances, featuredRaw, t]);

  const fromOptions = useMemo(
    () =>
      tokenOptions.filter(
        (tk) => tk.balance != null && parseFloat(tk.balance) > 0
      ),
    [tokenOptions]
  );

  const toOptions = useMemo(
    () =>
      tokenOptions.filter(
        (tk) =>
          !(
            tk.code === fromToken?.code && tk.issuer === fromToken?.issuer
          )
      ),
    [tokenOptions, fromToken]
  );

  useMemo(() => {
    if (!fromToken && fromOptions.length > 0) {
      const xlm = fromOptions.find((tk) => tk.isNative);
      setFromToken(xlm || fromOptions[0]);
    }
  }, [fromOptions, fromToken]);

  const {
    data: quote,
    isLoading: quoteLoading,
    error: quoteError,
  } = useQuery<SwapQuote>({
    queryKey: [
      "swap-quote",
      fromToken?.code,
      fromToken?.issuer,
      toToken?.code,
      toToken?.issuer,
      amount,
    ],
    queryFn: async () => {
      const result = await swapApi.quote({
        fromCode: fromToken!.code,
        fromIssuer: fromToken!.issuer || "",
        toCode: toToken!.code,
        toIssuer: toToken!.issuer || "",
        amount,
      });
      return result as SwapQuote;
    },
    enabled:
      !!fromToken && !!toToken && !!amount && parseFloat(amount) > 0,
    refetchInterval: 15_000,
  });

  const flipTokens = () => {
    const prev = fromToken;
    setFromToken(toToken);
    setToToken(prev);
    setAmount("");
  };

  const handleSwap = () => {
    if (!fromToken || !toToken || !amount || parseFloat(amount) <= 0) {
      toast.error(t("swap.selectBothTokens"));
      return;
    }
    setShowPin(true);
  };

  const executeSwap = async (pin: string) => {
    setShowPin(false);
    setSubmitting(true);
    try {
      await useWalletStore.getState().unlock(pin);
      const secret = useWalletStore.getState().getSecretKey();
      if (!secret) {
        toast.error(t("pin.incorrect"));
        setSubmitting(false);
        return;
      }

      const keypair = StellarSdk.Keypair.fromSecret(secret);
      const horizonUrl =
        network === "testnet"
          ? "https://horizon-testnet.stellar.org"
          : "https://horizon.stellar.org";
      const server = new StellarSdk.Horizon.Server(horizonUrl);
      const account = await server.loadAccount(publicKey!);
      const networkPassphrase =
        network === "testnet"
          ? StellarSdk.Networks.TESTNET
          : StellarSdk.Networks.PUBLIC;

      const fromAsset = fromToken!.isNative
        ? StellarSdk.Asset.native()
        : new StellarSdk.Asset(fromToken!.code, fromToken!.issuer!);
      const toAsset = toToken!.isNative
        ? StellarSdk.Asset.native()
        : new StellarSdk.Asset(toToken!.code, toToken!.issuer!);

      const destMin = quote?.estimatedReceive
        ? (parseFloat(quote.estimatedReceive) * 0.99).toFixed(7)
        : "0.0000001";

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.pathPaymentStrictSend({
            sendAsset: fromAsset,
            sendAmount: parseFloat(amount).toFixed(7),
            destination: publicKey!,
            destAsset: toAsset,
            destMin,
          })
        )
        .setTimeout(60)
        .build();

      tx.sign(keypair);
      await server.submitTransaction(tx);
      toast.success(
        t("swap.swapSuccess", {
          fromAmount: amount,
          fromCode: fromToken!.code,
          toAmount: quote?.estimatedReceive || "?",
          toCode: toToken!.code,
        })
      );
      setAmount("");
    } catch (err: any) {
      console.error("Swap error:", err);
      toast.error(err?.message || t("swap.swapFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const filterTokens = (list: TokenOption[], query: string) =>
    list.filter(
      (tk) =>
        tk.code.toLowerCase().includes(query.toLowerCase()) ||
        tk.name.toLowerCase().includes(query.toLowerCase())
    );

  const fromBalance = fromToken?.balance
    ? parseFloat(fromToken.balance)
    : 0;

  return (
    <div className="p-3 space-y-2 overflow-y-auto h-full">
      {/* From */}
      <div className="bg-stellar-card border border-stellar-border rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-stellar-muted">
            {t("swap.from")}
          </span>
          {fromToken?.balance != null && (
            <button
              onClick={() => setAmount(fromToken.balance!)}
              className="text-[10px] text-stellar-blue"
            >
              {t("common.max")}: {parseFloat(fromToken.balance).toFixed(2)}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="any"
            placeholder={t("swap.enterAmount")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-transparent text-lg text-white font-medium placeholder:text-stellar-muted/40 focus:outline-none min-w-0"
          />
          <PickerButton
            selected={fromToken}
            placeholder={t("swap.selectToken")}
            onClick={() => {
              setShowFromPicker(!showFromPicker);
              setShowToPicker(false);
            }}
          />
        </div>
        {showFromPicker && (
          <PickerDropdown
            tokens={filterTokens(fromOptions, searchFrom)}
            selected={fromToken}
            search={searchFrom}
            onSearch={setSearchFrom}
            onSelect={(tk) => {
              setFromToken(tk);
              setShowFromPicker(false);
              setSearchFrom("");
              if (
                toToken?.code === tk.code &&
                toToken?.issuer === tk.issuer
              )
                setToToken(null);
            }}
            showBalances
            t={t}
          />
        )}
        {parseFloat(amount) > fromBalance && fromBalance > 0 && (
          <p className="text-[10px] text-red-400 flex items-center gap-1">
            <AlertCircle size={10} /> {t("swap.balance", { balance: fromBalance.toFixed(2) })}
          </p>
        )}
      </div>

      {/* Flip */}
      <div className="flex justify-center -my-1 relative z-10">
        <button
          onClick={flipTokens}
          className="bg-stellar-card border border-stellar-border rounded-lg p-2 hover:bg-white/5 transition-colors"
        >
          <ArrowDownUp size={16} className="text-stellar-blue" />
        </button>
      </div>

      {/* To */}
      <div className="bg-stellar-card border border-stellar-border rounded-xl p-3 space-y-2">
        <span className="text-[10px] text-stellar-muted">
          {t("swap.to")}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex-1 text-lg font-medium min-w-0">
            {quoteLoading ? (
              <Loader2
                size={18}
                className="animate-spin text-stellar-muted"
              />
            ) : quote?.estimatedReceive ? (
              <span className="text-white">
                {parseFloat(quote.estimatedReceive).toFixed(4)}
              </span>
            ) : (
              <span className="text-stellar-muted/40">0.00</span>
            )}
          </div>
          <PickerButton
            selected={toToken}
            placeholder={t("swap.selectToken")}
            onClick={() => {
              setShowToPicker(!showToPicker);
              setShowFromPicker(false);
            }}
          />
        </div>
        {showToPicker && (
          <PickerDropdown
            tokens={filterTokens(toOptions, searchTo)}
            selected={toToken}
            search={searchTo}
            onSearch={setSearchTo}
            onSelect={(tk) => {
              setToToken(tk);
              setShowToPicker(false);
              setSearchTo("");
            }}
            showBalances={false}
            t={t}
          />
        )}
      </div>

      {/* Quote info */}
      {quote && !quoteLoading && fromToken && toToken && (
        <div className="bg-stellar-card border border-stellar-border rounded-lg px-3 py-2 space-y-1 text-[11px]">
          {quote.rate && (
            <div className="flex justify-between text-stellar-muted">
              <span>{t("swap.rate")}</span>
              <span className="text-white">
                1 {fromToken.code} ≈{" "}
                {parseFloat(quote.rate).toFixed(4)} {toToken.code}
              </span>
            </div>
          )}
          {quote.path && quote.path.length > 0 && (
            <div className="flex justify-between text-stellar-muted">
              <span>{t("swap.path")}</span>
              <span className="text-white truncate ml-2">
                {fromToken.code} →{" "}
                {quote.path
                  .map((p) => p.asset_code || "XLM")
                  .join(" → ")}{" "}
                → {toToken.code}
              </span>
            </div>
          )}
        </div>
      )}

      {quoteError &&
        toToken &&
        amount &&
        parseFloat(amount) > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-[11px] text-red-400">
            {t("swap.noRouteFound")}
          </div>
        )}

      {/* Swap button */}
      <button
        onClick={handleSwap}
        disabled={
          !fromToken ||
          !toToken ||
          !amount ||
          parseFloat(amount) <= 0 ||
          parseFloat(amount) > fromBalance ||
          !quote?.estimatedReceive ||
          submitting
        }
        className="w-full py-3 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-stellar-blue to-stellar-purple hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" />{" "}
            {t("swap.swapping")}
          </span>
        ) : !fromToken || !toToken ? (
          t("swap.selectBothTokens")
        ) : !amount || parseFloat(amount) <= 0 ? (
          t("swap.enterAmount")
        ) : parseFloat(amount) > fromBalance ? (
          t("send.insufficientBalance")
        ) : !quote?.estimatedReceive ? (
          t("swap.gettingQuote")
        ) : (
          t("swap.executeSwap", {
            from: fromToken.code,
            to: toToken.code,
          })
        )}
      </button>

      {showPin && (
        <PinModal
          title={t("pin.title")}
          onSubmit={executeSwap}
          onCancel={() => setShowPin(false)}
        />
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function PickerButton({
  selected,
  placeholder,
  onClick,
}: {
  selected: TokenOption | null;
  placeholder?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 bg-stellar-bg border border-stellar-border rounded-lg px-2 py-1.5 hover:border-stellar-blue/50 transition-colors shrink-0"
    >
      {selected ? (
        <>
          <TokenIcon
            code={selected.code}
            image={selected.image}
            size={20}
          />
          <span className="text-white font-medium text-xs">
            {selected.code}
          </span>
        </>
      ) : (
        <span className="text-stellar-muted text-xs">{placeholder}</span>
      )}
      <ChevronDown size={12} className="text-stellar-muted" />
    </button>
  );
}

function PickerDropdown({
  tokens,
  selected,
  search,
  onSearch,
  onSelect,
  showBalances,
  t,
}: {
  tokens: TokenOption[];
  selected: TokenOption | null;
  search: string;
  onSearch: (q: string) => void;
  onSelect: (t: TokenOption) => void;
  showBalances: boolean;
  t: any;
}) {
  return (
    <div className="bg-stellar-bg border border-stellar-border rounded-lg shadow-2xl overflow-hidden">
      <div className="p-2 border-b border-stellar-border">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-stellar-muted"
          />
          <input
            type="text"
            placeholder={t("swap.searchTokens")}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full bg-stellar-card border border-stellar-border rounded pl-6 pr-6 py-1.5 text-xs text-white placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue/50"
            autoFocus
          />
          {search && (
            <button
              onClick={() => onSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stellar-muted"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>
      <div className="max-h-32 overflow-y-auto">
        {tokens.map((tk) => (
          <button
            key={`${tk.code}-${tk.issuer || "native"}`}
            onClick={() => onSelect(tk)}
            className={`w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 ${
              selected?.code === tk.code &&
              selected?.issuer === tk.issuer
                ? "bg-stellar-blue/10"
                : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <TokenIcon code={tk.code} image={tk.image} size={20} />
              <div className="text-left">
                <p className="text-white text-xs font-medium">{tk.code}</p>
                <p className="text-[9px] text-stellar-muted">{tk.name}</p>
              </div>
            </div>
            {showBalances && tk.balance != null && (
              <span className="text-[10px] text-stellar-muted font-mono">
                {parseFloat(tk.balance).toFixed(2)}
              </span>
            )}
          </button>
        ))}
        {tokens.length === 0 && (
          <p className="text-center text-stellar-muted text-[10px] py-4">
            {t("common.noResults")}
          </p>
        )}
      </div>
    </div>
  );
}