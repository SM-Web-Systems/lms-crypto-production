import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Download, ChevronDown, Search, X } from "lucide-react";
import { useWalletStore } from "../store/wallet";
import { useBalances } from "../hooks/useBalances";
import { useQuery } from "@tanstack/react-query";
import { tokenApi } from "../lib/api";
import TokenIcon from "../components/TokenIcon";

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
          name: b.token?.tomlName || (b.assetType === "native" ? t("dashboard.stellarLumens") : b.assetCode),
          image: b.token?.tomlImage || null,
          isNative: b.assetType === "native",
          balance: b.balance,
        });
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

  const downloadQR = () => {
    const svg = document.getElementById("receive-qr");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.download = `stellar-receive-${selectedToken?.code || "XLM"}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const filteredTokens = tokenOptions.filter(
    (tk) => tk.code.toLowerCase().includes(search.toLowerCase()) || tk.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!publicKey) return null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stellar-text">{t("receive.title")}</h1>
        <p className="mt-1 text-sm text-stellar-muted">{t("receive.subtitle")}</p>
      </div>

      {/* Token Picker */}
      <div className="relative">
        <label className="block text-sm font-medium text-stellar-muted mb-2">{t("receive.tokenToReceive")}</label>
        <button onClick={() => setShowPicker(!showPicker)} className="w-full flex items-center justify-between bg-stellar-card border border-stellar-border rounded-xl px-4 py-3 hover:border-stellar-blue/50 transition-colors">
          <div className="flex items-center gap-3">
            <TokenIcon code={selectedToken?.code || "XLM"} image={selectedToken?.image} size={32} />
            <div className="text-left">
              <p className="text-stellar-text font-medium">{selectedToken?.code || "XLM"}</p>
              <p className="text-xs text-stellar-muted">
                {selectedToken?.name || t("dashboard.stellarLumens")}
                {selectedToken?.balance != null && (
                  <span className="ml-2 text-stellar-blue">
                    {t("common.balance")}: {parseFloat(selectedToken.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                )}
              </p>
            </div>
          </div>
          <ChevronDown size={18} className={`text-stellar-muted transition-transform ${showPicker ? "rotate-180" : ""}`} />
        </button>

        {showPicker && (
          <div className="absolute z-50 mt-2 w-full bg-stellar-card border border-stellar-border rounded-xl shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-stellar-border">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stellar-muted" />
                <input type="text" placeholder={t("receive.searchTokens")} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-stellar-bg border border-stellar-border rounded-lg pl-9 pr-8 py-2 text-sm text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue/50" autoFocus />
                {search && (<button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-stellar-muted hover:text-stellar-text"><X size={14} /></button>)}
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <button onClick={() => { setSelectedToken(null); setShowPicker(false); setSearch(""); }} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors ${!selectedToken ? "bg-stellar-blue/10" : ""}`}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple flex items-center justify-center text-white text-xs font-bold">*</div>
                <div className="text-left">
                  <p className="text-stellar-text text-sm font-medium">{t("receive.anyToken")}</p>
                  <p className="text-xs text-stellar-muted">{t("receive.anyTokenDesc")}</p>
                </div>
              </button>
              {filteredTokens.map((tk) => {
                const isSelected = selectedToken?.code === tk.code && selectedToken?.issuer === tk.issuer;
                return (
                  <button key={`${tk.code}-${tk.issuer || "native"}`} onClick={() => { setSelectedToken(tk); setShowPicker(false); setSearch(""); }} className={`w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors ${isSelected ? "bg-stellar-blue/10" : ""}`}>
                    <div className="flex items-center gap-3">
                      <TokenIcon code={tk.code} image={tk.image} size={32} />
                      <div className="text-left">
                        <p className="text-stellar-text text-sm font-medium">{tk.code}</p>
                        <p className="text-xs text-stellar-muted">{tk.name}</p>
                      </div>
                    </div>
                    {tk.balance != null && (<span className="text-xs text-stellar-muted font-mono">{parseFloat(tk.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>)}
                  </button>
                );
              })}
              {filteredTokens.length === 0 && (<p className="text-center text-stellar-muted text-sm py-6">{t("receive.noTokens")}</p>)}
            </div>
          </div>
        )}
      </div>

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-stellar-muted mb-2">{t("receive.amount")}</label>
        <div className="relative">
          <input type="number" min="0" step="any" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-stellar-card border border-stellar-border rounded-xl px-4 py-3 text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue/50" />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-stellar-muted">{selectedToken?.code || "XLM"}</span>
        </div>
      </div>

      {/* Memo */}
      <div>
        <label className="block text-sm font-medium text-stellar-muted mb-2">{t("receive.memo")}</label>
        <input type="text" maxLength={28} placeholder={t("receive.memoPlaceholder")} value={memo} onChange={(e) => setMemo(e.target.value)} className="w-full bg-stellar-card border border-stellar-border rounded-xl px-4 py-3 text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue/50" />
      </div>

      {/* QR Code */}
      <div className="bg-stellar-card border border-stellar-border rounded-2xl p-8 flex flex-col items-center">
        <div className="bg-white rounded-xl p-4">
          <QRCodeSVG id="receive-qr" value={qrValue} size={220} level="M" imageSettings={selectedToken?.image ? { src: selectedToken.image, width: 40, height: 40, excavate: true } : undefined} />
        </div>
        {selectedToken && (
          <div className="mt-4 flex items-center gap-2">
            <TokenIcon code={selectedToken.code} image={selectedToken.image} size={20} />
            <span className="text-sm text-stellar-text font-medium">{selectedToken.code}{amount && ` — ${amount}`}</span>
          </div>
        )}
        <button onClick={downloadQR} className="mt-4 flex items-center gap-2 text-sm text-stellar-muted hover:text-stellar-text transition-colors">
          <Download size={16} />{t("receive.downloadQr")}
        </button>
      </div>

      {/* Address */}
      <div className="bg-stellar-card border border-stellar-border rounded-xl p-4">
        <label className="block text-xs text-stellar-muted mb-2">{t("receive.yourAddress")}</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm text-stellar-text font-mono break-all">{publicKey}</code>
          <button onClick={() => copyToClipboard(publicKey, "address")} className="shrink-0 p-2 rounded-lg hover:bg-white/5 transition-colors">
            {copied === "address" ? <Check size={18} className="text-stellar-success" /> : <Copy size={18} className="text-stellar-muted" />}
          </button>
        </div>
      </div>

      {/* SEP-7 URI */}
      {sep7Uri && sep7Uri !== publicKey && (
        <div className="bg-stellar-card border border-stellar-border rounded-xl p-4">
          <label className="block text-xs text-stellar-muted mb-2">{t("receive.paymentUri")}</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-stellar-muted font-mono break-all">{sep7Uri}</code>
            <button onClick={() => copyToClipboard(sep7Uri, "uri")} className="shrink-0 p-2 rounded-lg hover:bg-white/5 transition-colors">
              {copied === "uri" ? <Check size={18} className="text-stellar-success" /> : <Copy size={18} className="text-stellar-muted" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}