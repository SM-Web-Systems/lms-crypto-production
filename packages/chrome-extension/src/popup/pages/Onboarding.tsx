import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useWalletStore } from "../../shared/store/wallet";
import { toast } from "sonner";
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

export default function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    createWallet,
    importWallet,
    generateMnemonic,
    createWalletFromMnemonic,
    importFromMnemonic,
    accounts,
  } = useWalletStore();

  const action = searchParams.get("action");
  const hasExistingAccounts = accounts.length > 0;

  const [mode, setMode] = useState<
    "choose" | "create" | "create-mnemonic" | "import" | "import-mnemonic"
  >("choose");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [secret, setSecret] = useState("");
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [generatedMnemonic, setGeneratedMnemonic] = useState("");
  const [mnemonicConfirmed, setMnemonicConfirmed] = useState(false);
  const [mnemonicConfirmInput, setMnemonicConfirmInput] = useState("");
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"form" | "backup" | "confirm">("form");

  useEffect(() => {
    if (action === "create") setMode("create");
    else if (action === "import") setMode("import");
    else if (action === "create-mnemonic") setMode("create-mnemonic");
    else if (action === "import-mnemonic") setMode("import-mnemonic");
  }, [action]);

  const resetForm = () => {
    setName("");
    setPin("");
    setConfirmPin("");
    setSecret("");
    setMnemonicInput("");
    setGeneratedMnemonic("");
    setMnemonicConfirmed(false);
    setMnemonicConfirmInput("");
    setShowMnemonic(false);
    setCopied(false);
    setError("");
    setStep("form");
  };

  const goBack = () => {
    if (step === "confirm") {
      setStep("backup");
      setMnemonicConfirmInput("");
      return;
    }
    if (step === "backup") {
      setStep("form");
      return;
    }
    if (hasExistingAccounts) {
      navigate("/dashboard");
    } else {
      setMode("choose");
    }
    resetForm();
  };

  const handleCopyMnemonic = async () => {
    await navigator.clipboard.writeText(generatedMnemonic);
    setCopied(true);
    toast.success(t("onboarding.mnemonicCopied", "Recovery phrase copied!"));
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Create (random keypair) ──
  const handleCreate = async () => {
    if (!name.trim()) return setError(t("common.fillAllFields"));
    if (pin.length < 6) return setError(t("onboarding.pinMinLength"));
    if (pin !== confirmPin) return setError(t("onboarding.pinMismatch"));
    setLoading(true);
    setError("");
    try {
      await createWallet(name, pin);
      navigate("/dashboard");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Import (secret key) ──
  const handleImport = async () => {
    if (!name.trim() || !secret.trim()) return setError(t("common.fillAllFields"));
    if (pin.length < 6) return setError(t("onboarding.pinMinLength"));
    if (pin !== confirmPin) return setError(t("onboarding.pinMismatch"));
    if (!secret.startsWith("S") || secret.length !== 56)
      return setError(t("onboarding.secretKeyInvalid"));
    setLoading(true);
    setError("");
    try {
      await importWallet(name, secret.trim(), pin);
      navigate("/dashboard");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Generate mnemonic (step 1 of create-mnemonic) ──
  const handleGenerateMnemonic = async () => {
    if (!name.trim()) return setError(t("common.fillAllFields"));
    if (pin.length < 6) return setError(t("onboarding.pinMinLength"));
    if (pin !== confirmPin) return setError(t("onboarding.pinMismatch"));
    setError("");
    const mnemonic = await generateMnemonic();
    setGeneratedMnemonic(mnemonic);
    setStep("backup");
  };

  // ── Confirm mnemonic (step 2) ──
  const handleConfirmMnemonic = () => {
    const normalized = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    if (normalized(mnemonicConfirmInput) !== normalized(generatedMnemonic)) {
      return setError(
        t("onboarding.mnemonicMismatch", "Recovery phrase does not match.")
      );
    }
    setError("");
    setMnemonicConfirmed(true);
    setStep("confirm");
  };

  // ── Create wallet from mnemonic (step 3) ──
  const handleCreateFromMnemonic = async () => {
    setLoading(true);
    setError("");
    try {
      const walletName = name.trim() || `HD Wallet ${accounts.length + 1}`;
      await createWalletFromMnemonic(walletName, generatedMnemonic, pin);
      resetForm();
      navigate("/dashboard");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Import from mnemonic ──
  const handleImportFromMnemonic = async () => {
    if (!name.trim()) return setError(t("common.fillAllFields"));
    if (pin.length < 6) return setError(t("onboarding.pinMinLength"));
    if (pin !== confirmPin) return setError(t("onboarding.pinMismatch"));
    const words = mnemonicInput.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24)
      return setError(
        t("onboarding.mnemonicInvalid", "Enter a valid 12 or 24-word recovery phrase.")
      );
    setLoading(true);
    setError("");
    try {
      await importFromMnemonic(name.trim(), mnemonicInput.trim(), pin);
      resetForm();
      navigate("/dashboard");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 rounded-lg bg-stellar-card border border-stellar-border text-white placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue text-sm";

  // ── Choice screen ──
  if (mode === "choose") {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] w-[380px] bg-stellar-bg p-6 gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple flex items-center justify-center">
          <ShieldCheck size={24} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-white">{t("onboarding.title")}</h1>
        <p className="text-xs text-stellar-muted text-center">
          {hasExistingAccounts
            ? t("onboarding.subtitleAdd")
            : t("onboarding.subtitle")}
        </p>
        {hasExistingAccounts && (
          <p className="text-[10px] text-stellar-blue">
            {t("onboarding.youHaveWallets", { count: accounts.length })}
          </p>
        )}

        <div className="w-full space-y-2 mt-2">
          <p className="text-[10px] font-medium text-stellar-muted uppercase tracking-wide">
            {t("onboarding.newWallet", "New Wallet")}
          </p>
          <button
            onClick={() => setMode("create-mnemonic")}
            className="w-full py-3 rounded-xl bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors text-sm flex items-center justify-center gap-2"
          >
            <ShieldCheck size={16} />
            {t("onboarding.createWithSeed", "Create with Recovery Phrase")}
          </button>
          <button
            onClick={() => setMode("create")}
            className="w-full py-2.5 rounded-xl border border-stellar-border text-white hover:bg-white/5 transition-colors text-xs"
          >
            {t("onboarding.createQuick", "Quick Create (keypair only)")}
          </button>
        </div>

        <div className="w-full space-y-2">
          <p className="text-[10px] font-medium text-stellar-muted uppercase tracking-wide">
            {t("onboarding.existingWallet", "Existing Wallet")}
          </p>
          <button
            onClick={() => setMode("import-mnemonic")}
            className="w-full py-2.5 rounded-xl border border-stellar-border text-white hover:bg-white/5 transition-colors text-xs"
          >
            {t("onboarding.importFromSeed", "Import from Recovery Phrase")}
          </button>
          <button
            onClick={() => setMode("import")}
            className="w-full py-2.5 rounded-xl border border-stellar-border text-white hover:bg-white/5 transition-colors text-xs"
          >
            {t("onboarding.importFromSecret", "Import from Secret Key")}
          </button>
        </div>

        {hasExistingAccounts && (
          <button
            onClick={() => navigate("/dashboard")}
            className="text-[10px] text-stellar-muted hover:text-white"
          >
            {t("onboarding.cancelBack")}
          </button>
        )}
      </div>
    );
  }

  // ── Create (random keypair) ──
  if (mode === "create" || mode === "import") {
    return (
      <div className="flex flex-col h-[600px] w-[380px] bg-stellar-bg p-6">
        <button
          onClick={goBack}
          className="text-stellar-muted text-sm mb-3 hover:text-white self-start"
        >
          ← {t("common.back")}
        </button>

        <h2 className="text-lg font-bold text-white mb-1">
          {mode === "create"
            ? t("onboarding.createWallet")
            : t("onboarding.importWallet")}
        </h2>
        <p className="text-[10px] text-stellar-muted mb-3">
          {mode === "create"
            ? t(
                "onboarding.createQuickDesc",
                "Creates a random Stellar keypair."
              )
            : t("onboarding.createDescription")}
        </p>

        <div className="space-y-3 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              mode === "create"
                ? t("onboarding.walletNamePlaceholder")
                : t("onboarding.walletNameImportPlaceholder")
            }
            className={inputClass}
          />
          {mode === "import" && (
            <textarea
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={t("onboarding.secretKey")}
              rows={3}
              className={`${inputClass} resize-none font-mono`}
            />
          )}
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={t("onboarding.enterPin")}
            className={inputClass}
          />
          <input
            type="password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            placeholder={t("onboarding.confirmPin")}
            className={inputClass}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <p className="text-[10px] text-stellar-muted leading-relaxed">
            {t("onboarding.keysDisclaimer")}
          </p>
        </div>

        <button
          onClick={mode === "create" ? handleCreate : handleImport}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50 mt-3 text-sm"
        >
          {loading
            ? mode === "create"
              ? t("onboarding.creating")
              : t("onboarding.importing")
            : mode === "create"
              ? t("onboarding.createWallet")
              : t("onboarding.importWallet")}
        </button>
      </div>
    );
  }

  // ── Create from mnemonic: form step ──
  if (mode === "create-mnemonic" && step === "form") {
    return (
      <div className="flex flex-col h-[600px] w-[380px] bg-stellar-bg p-6">
        <button
          onClick={goBack}
          className="text-stellar-muted text-sm mb-3 hover:text-white self-start"
        >
          ← {t("common.back")}
        </button>

        <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
          <ShieldCheck size={18} className="text-stellar-blue" />
          {t("onboarding.createWithSeedTitle", "Create HD Wallet")}
        </h2>
        <p className="text-[10px] text-stellar-muted mb-3">
          {t(
            "onboarding.createWithSeedDesc",
            "Generates a 24-word recovery phrase. Back it up safely."
          )}
        </p>

        <div className="space-y-3 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("onboarding.walletNamePlaceholder")}
            className={inputClass}
          />
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={t("onboarding.enterPin")}
            className={inputClass}
          />
          <input
            type="password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            placeholder={t("onboarding.confirmPin")}
            className={inputClass}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <button
          onClick={handleGenerateMnemonic}
          className="w-full py-3 rounded-xl bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors mt-3 text-sm"
        >
          {t("onboarding.generatePhrase", "Generate Recovery Phrase")}
        </button>
      </div>
    );
  }

  // ── Create from mnemonic: backup step ──
  if (mode === "create-mnemonic" && step === "backup") {
    return (
      <div className="flex flex-col h-[600px] w-[380px] bg-stellar-bg p-5 overflow-y-auto">
        <button
          onClick={goBack}
          className="text-stellar-muted text-sm mb-3 hover:text-white self-start"
        >
          ← {t("common.back")}
        </button>

        <h2 className="text-base font-bold text-white mb-2">
          {t("onboarding.backupTitle", "Back Up Your Recovery Phrase")}
        </h2>

        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 mb-3">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-yellow-300 leading-relaxed">
            {t(
              "onboarding.backupWarning",
              "Write down these 24 words in order. Never share them."
            )}
          </p>
        </div>

        <div className="relative mb-3">
          <div
            className={`grid grid-cols-3 gap-1.5 p-3 rounded-lg bg-stellar-card border border-stellar-border ${
              !showMnemonic ? "blur-sm select-none" : ""
            }`}
          >
            {generatedMnemonic.split(" ").map((word, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="text-[9px] text-stellar-muted w-4 text-right">
                  {i + 1}.
                </span>
                <span className="text-[11px] text-white font-mono">{word}</span>
              </div>
            ))}
          </div>
          {!showMnemonic && (
            <button
              onClick={() => setShowMnemonic(true)}
              className="absolute inset-0 flex items-center justify-center gap-1.5 text-white text-xs font-medium bg-black/40 rounded-lg"
            >
              <Eye size={14} />
              {t("onboarding.tapToReveal", "Click to reveal")}
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-3">
          {showMnemonic && (
            <button
              onClick={() => setShowMnemonic(false)}
              className="flex-1 py-2 rounded-lg border border-stellar-border text-[10px] text-white hover:bg-white/5 flex items-center justify-center gap-1"
            >
              <EyeOff size={12} />
              {t("common.hide", "Hide")}
            </button>
          )}
          <button
            onClick={handleCopyMnemonic}
            className="flex-1 py-2 rounded-lg border border-stellar-border text-[10px] text-white hover:bg-white/5 flex items-center justify-center gap-1"
          >
            {copied ? (
              <Check size={12} className="text-green-400" />
            ) : (
              <Copy size={12} />
            )}
            {copied ? t("common.copied", "Copied") : t("common.copy", "Copy")}
          </button>
        </div>

        <button
          onClick={() => {
            setStep("confirm");
            setMnemonicConfirmInput("");
            setError("");
          }}
          className="w-full py-3 rounded-xl bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors text-sm"
        >
          {t("onboarding.iSavedIt", "I've saved my recovery phrase")}
        </button>
      </div>
    );
  }

  // ── Create from mnemonic: confirm step ──
  if (mode === "create-mnemonic" && step === "confirm" && !mnemonicConfirmed) {
    return (
      <div className="flex flex-col h-[600px] w-[380px] bg-stellar-bg p-6">
        <button
          onClick={goBack}
          className="text-stellar-muted text-sm mb-3 hover:text-white self-start"
        >
          ← {t("common.back")}
        </button>

        <h2 className="text-base font-bold text-white mb-1">
          {t("onboarding.confirmPhraseTitle", "Confirm Your Recovery Phrase")}
        </h2>
        <p className="text-[10px] text-stellar-muted mb-3">
          {t(
            "onboarding.confirmPhraseDesc",
            "Type your 24-word recovery phrase below to confirm you've saved it."
          )}
        </p>

        <div className="space-y-3 flex-1">
          <textarea
            rows={4}
            placeholder={t(
              "onboarding.confirmPhrasePlaceholder",
              "Type your 24 words separated by spaces..."
            )}
            value={mnemonicConfirmInput}
            onChange={(e) => setMnemonicConfirmInput(e.target.value)}
            className={`${inputClass} font-mono resize-none`}
            autoFocus
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <button
          onClick={handleConfirmMnemonic}
          className="w-full py-3 rounded-xl bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors mt-3 text-sm"
        >
          {t("onboarding.verifyPhrase", "Verify & Create Wallet")}
        </button>
      </div>
    );
  }

  // ── Create from mnemonic: success / create step ──
  if (mode === "create-mnemonic" && step === "confirm" && mnemonicConfirmed) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] w-[380px] bg-stellar-bg p-6 gap-4">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
          <ShieldCheck size={28} className="text-green-400" />
        </div>
        <h2 className="text-lg font-bold text-white text-center">
          {t("onboarding.phraseVerified", "Recovery Phrase Verified!")}
        </h2>
        <p className="text-xs text-stellar-muted text-center">
          {t(
            "onboarding.phraseVerifiedDesc",
            "Your recovery phrase has been verified. Click below to create your HD wallet."
          )}
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={handleCreateFromMnemonic}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50 text-sm"
        >
          {loading
            ? t("onboarding.creating")
            : t("onboarding.createWalletNow", "Create Wallet Now")}
        </button>
      </div>
    );
  }

  // ── Import from mnemonic ──
  if (mode === "import-mnemonic") {
    return (
      <div className="flex flex-col h-[600px] w-[380px] bg-stellar-bg p-6">
        <button
          onClick={goBack}
          className="text-stellar-muted text-sm mb-3 hover:text-white self-start"
        >
          ← {t("common.back")}
        </button>

        <h2 className="text-base font-bold text-white mb-1">
          {t("onboarding.importFromSeedTitle", "Recover from Phrase")}
        </h2>
        <p className="text-[10px] text-stellar-muted mb-3">
          {t(
            "onboarding.importFromSeedDesc",
            "Enter your 12 or 24-word recovery phrase to restore your wallet."
          )}
        </p>

        <div className="space-y-3 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("onboarding.walletNameImportPlaceholder")}
            className={inputClass}
          />
          <textarea
            rows={3}
            placeholder={t(
              "onboarding.enterMnemonic",
              "Enter your recovery phrase..."
            )}
            value={mnemonicInput}
            onChange={(e) => setMnemonicInput(e.target.value)}
            className={`${inputClass} font-mono resize-none`}
          />
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={t("onboarding.enterPin")}
            className={inputClass}
          />
          <input
            type="password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            placeholder={t("onboarding.confirmPin")}
            className={inputClass}
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <p className="text-[10px] text-stellar-muted leading-relaxed">
            {t("onboarding.keysDisclaimer")}
          </p>
        </div>

        <button
          onClick={handleImportFromMnemonic}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50 mt-3 text-sm"
        >
          {loading
            ? t("onboarding.importing")
            : t("onboarding.recoverWallet", "Recover Wallet")}
        </button>
      </div>
    );
  }

  return null;
}
