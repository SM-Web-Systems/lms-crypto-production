import { useState, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, ChevronDown, Search, X } from "lucide-react";
import { useWalletStore } from "../../shared/store/wallet";
import { useBalances } from "../../shared/hooks/useBalances";
import { useQuery } from "@tanstack/react-query";
import { tokenApi } from "../../shared/lib/api";
import TokenIcon from "../../shared/components/TokenIcon";
import { useTranslation } from "react-i18next";

interface TokenOption {
  code: string;
  issuer: string | null;
  name: string;
  image: string | null;
  isNative: boolean;
  balance?: string;
}

export default function ReceivePage() {
  const { t } = useTranslation();
  const publicKey = useWalletStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? null
  );

  const { data: balances } = useBalances();
  const { data: featuredRaw } = useQuery({
    queryKey: ["featured"],
    queryFn: () => tokenApi.featured(),
  });

  const [selectedToken, setSelectedToken] = useState<TokenOption | null>(null);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [copied, setCopied] = useState<"address" | "uri" | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");

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

  const sep7Uri = useMemo(() => {
    if (!publicKey) return "";
    let uri = `web+stellar:pay?destination=${publicKey}`;
    if (amount) uri += `&amount=${amount}`;
    if (selectedToken && !selectedToken.isNative) {
      uri += `&asset_code=${selectedToken.code}`;
      if (selectedToken.issuer) uri += `&asset_issuer=${selectedToken.issuer}`;
    }
    if (memo) uri += `&memo=${encodeURIComponent(memo)}&memo_type=MEMO_TEXT`;
    return uri;
  }, [publicKey, amount, selectedToken, memo]);

  const qrValue = sep7Uri || publicKey || "";

  const copyToClipboard = async (text: string, type: "address" | "uri") => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const filteredTokens = tokenOptions.filter(
    (tk) =>
      tk.code.toLowerCase().includes(search.toLowerCase()) ||
      tk.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!publicKey) return null;

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      {/* Token Picker */}
      <div className="relative">
        <label className="block text-xs text-stellar-muted mb-1">
          {t("receive.selectToken")}
        </label>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="w-full flex items-center justify-between bg-stellar-card border border-stellar-border rounded-lg px-3 py-2 hover:border-stellar-blue/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <TokenIcon
              code={selectedToken?.code || "XLM"}
              image={selectedToken?.image}
              size={24}
            />
            <span className="text-sm text-white font-medium">
              {selectedToken?.code || t("receive.anyToken")}
            </span>
          </div>
          <ChevronDown
            size={14}
            className={`text-stellar-muted transition-transform ${showPicker ? "rotate-180" : ""}`}
          />
        </button>

        {showPicker && (
          <div className="absolute z-50 mt-1 w-full bg-stellar-card border border-stellar-border rounded-lg shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-stellar-border">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-stellar-muted"
                />
                <input
                  type="text"
                  placeholder={t("receive.searchTokens")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-stellar-bg border border-stellar-border rounded pl-7 pr-7 py-1.5 text-xs text-white placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue/50"
                  autoFocus
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-stellar-muted"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto">
              <button
                onClick={() => {
                  setSelectedToken(null);
                  setShowPicker(false);
                  setSearch("");
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-xs ${!selectedToken ? "bg-stellar-blue/10" : ""}`}
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple flex items-center justify-center text-white text-[9px] font-bold">
                  *
                </div>
                <span className="text-white">{t("receive.anyToken")}</span>
              </button>
              {filteredTokens.map((tk) => (
                <button
                  key={`${tk.code}-${tk.issuer || "native"}`}
                  onClick={() => {
                    setSelectedToken(tk);
                    setShowPicker(false);
                    setSearch("");
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 ${
                    selectedToken?.code === tk.code &&
                    selectedToken?.issuer === tk.issuer
                      ? "bg-stellar-blue/10"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <TokenIcon code={tk.code} image={tk.image} size={24} />
                    <span className="text-xs text-white">{tk.code}</span>
                  </div>
                  {tk.balance != null && (
                    <span className="text-[10px] text-stellar-muted font-mono">
                      {parseFloat(tk.balance).toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Amount + Memo row */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-stellar-muted mb-1">
            {t("receive.amount")}
          </label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder={t("receive.amountPlaceholder")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-stellar-card border border-stellar-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue/50"
          />
        </div>
        <div>
          <label className="block text-xs text-stellar-muted mb-1">
            {t("receive.memo")}
          </label>
          <input
            type="text"
            maxLength={28}
            placeholder={t("receive.memoPlaceholder")}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="w-full bg-stellar-card border border-stellar-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue/50"
          />
        </div>
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center bg-stellar-card border border-stellar-border rounded-xl p-4">
        <div className="bg-white rounded-lg p-2">
          <QRCodeSVG
            id="receive-qr"
            value={qrValue}
            size={160}
            level="M"
            imageSettings={
              selectedToken?.image
                ? {
                    src: selectedToken.image,
                    width: 28,
                    height: 28,
                    excavate: true,
                  }
                : undefined
            }
          />
        </div>
        {selectedToken && (
          <div className="mt-2 flex items-center gap-1.5">
            <TokenIcon
              code={selectedToken.code}
              image={selectedToken.image}
              size={16}
            />
            <span className="text-xs text-white font-medium">
              {selectedToken.code}
              {amount && ` — ${amount}`}
            </span>
          </div>
        )}
      </div>

      {/* Address */}
      <div
        onClick={() => copyToClipboard(publicKey, "address")}
        className="flex items-center gap-2 bg-stellar-card border border-stellar-border rounded-lg px-3 py-2 cursor-pointer hover:border-stellar-blue/50 transition-colors"
      >
        <code className="flex-1 text-[10px] text-stellar-muted font-mono truncate">
          {publicKey}
        </code>
        {copied === "address" ? (
          <Check size={14} className="text-green-400 shrink-0" />
        ) : (
          <Copy size={14} className="text-stellar-muted shrink-0" />
        )}
      </div>

      {/* SEP-7 URI */}
      {sep7Uri && sep7Uri !== publicKey && (
        <div
          onClick={() => copyToClipboard(sep7Uri, "uri")}
          className="flex items-center gap-2 bg-stellar-card border border-stellar-border rounded-lg px-3 py-2 cursor-pointer hover:border-stellar-blue/50 transition-colors"
        >
          <code className="flex-1 text-[10px] text-stellar-muted font-mono truncate">
            {sep7Uri}
          </code>
          {copied === "uri" ? (
            <Check size={14} className="text-green-400 shrink-0" />
          ) : (
            <Copy size={14} className="text-stellar-muted shrink-0" />
          )}
        </div>
      )}
    </div>
  );
}