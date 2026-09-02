import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useWalletStore } from "../../shared/store/wallet";
import { useAuthStore } from "../../shared/store/auth";
import { signingApi } from "../../shared/lib/api";
import { decryptSecret } from "../../shared/lib/crypto";
import LanguageSwitcher from "../../shared/components/LanguageSwitcher";
import NetworkSwitcher from "../../shared/components/NetworkSwitcher";
import PinModal from "../../shared/components/PinModal";
import { toast } from "sonner";
import {
  Copy,
  Check,
  LogOut,
  Eye,
  EyeOff,
  Shield,
  Globe,
  User,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const accounts = useWalletStore((s) => s.accounts);
  const activeAccountId = useWalletStore((s) => s.activeAccountId);
  const getSecretKey = useWalletStore((s) => s.getSecretKey);
  const unlock = useWalletStore((s) => s.unlock);
  const walletLogout = useWalletStore((s) => s.logout);
  const authLogout = useAuthStore((s) => s.logout);
  const signingMode = useAuthStore((s) => s.signingMode);

  const active = accounts.find((a) => a.id === activeAccountId);
  const publicKey = active?.publicKey || "";
  const isHDWallet = active?.isHD === true;

  const [copiedPk, setCopiedPk] = useState(false);
  const [copiedSk, setCopiedSk] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pinAction, setPinAction] = useState<"secret" | "mnemonic">("secret");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showLang, setShowLang] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Recovery phrase
  const [revealedMnemonic, setRevealedMnemonic] = useState<string | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [copiedMnemonic, setCopiedMnemonic] = useState(false);

  // Signing mode
  const [signingLoading, setSigningLoading] = useState(false);

  const copyPublicKey = () => {
    navigator.clipboard.writeText(publicKey);
    setCopiedPk(true);
    toast.success(t("common.copied"));
    setTimeout(() => setCopiedPk(false), 2000);
  };

  const copySecretKey = () => {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey);
    setCopiedSk(true);
    toast.success(t("common.copied"));
    setTimeout(() => setCopiedSk(false), 2000);
  };

  const copyMnemonic = () => {
    if (!revealedMnemonic) return;
    navigator.clipboard.writeText(revealedMnemonic);
    setCopiedMnemonic(true);
    toast.success(t("common.copied"));
    setTimeout(() => setCopiedMnemonic(false), 2000);
  };

  const handleRevealSecret = () => {
    setPinAction("secret");
    setShowPin(true);
  };

  const handleRevealMnemonic = () => {
    setPinAction("mnemonic");
    setShowPin(true);
  };

  const handleSigningModeToggle = async (mode: "self" | "delegated") => {
    if (mode === signingMode) return;

    if (mode === "delegated") {
      const confirmed = window.confirm(
        t(
          "settings.delegatedWarning",
          "Delegated signing signs transactions server-side. Convenient but less secure. Continue?"
        )
      );
      if (!confirmed) return;
    }

    setSigningLoading(true);
    try {
      await signingApi.setMode(mode);
      useAuthStore.setState({ signingMode: mode });
      toast.success(
        mode === "delegated"
          ? t("settings.delegatedEnabled", "Delegated signing enabled")
          : t("settings.selfCustodyEnabled", "Self-custody enabled")
      );
    } catch (err: any) {
      toast.error(err.message || t("settings.signingModeError", "Failed to update"));
    } finally {
      setSigningLoading(false);
    }
  };

  const confirmLogout = async () => {
    await authLogout();
    walletLogout();
    setShowLogoutConfirm(false);
    navigate("/login");
  };

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      {/* Account Info */}
      <div className="bg-stellar-card border border-stellar-border rounded-xl p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <User size={14} className="text-stellar-muted" />
          <h3 className="text-xs font-semibold text-stellar-muted uppercase tracking-wider">
            {t("settings.accountInfo")}
          </h3>
        </div>

        {active && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-stellar-muted">
              {t("settings.walletName")}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-white font-medium">{active.name}</span>
              {isHDWallet && (
                <span className="px-1 py-0.5 text-[8px] rounded bg-stellar-blue/20 text-stellar-blue font-medium">
                  HD
                </span>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="block text-[10px] text-stellar-muted mb-2">
            {t("settings.network")}
          </label>
          <NetworkSwitcher />
        </div>

        <div>
          <label className="block text-[10px] text-stellar-muted mb-1">
            {t("settings.publicKey")}
          </label>
          <div
            onClick={copyPublicKey}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-stellar-bg border border-stellar-border cursor-pointer hover:border-stellar-blue/50 transition-colors"
          >
            <code className="flex-1 text-[10px] text-white font-mono truncate">
              {publicKey}
            </code>
            {copiedPk ? (
              <Check size={12} className="text-green-400 shrink-0" />
            ) : (
              <Copy size={12} className="text-stellar-muted shrink-0" />
            )}
          </div>
        </div>
      </div>

      {/* Signing Mode */}
      <div className="bg-stellar-card border border-stellar-border rounded-xl p-3 space-y-2.5">
        <h3 className="text-xs font-semibold text-stellar-muted uppercase tracking-wider">
          {t("settings.signingMode", "Signing Mode")}
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleSigningModeToggle("self")}
            disabled={signingLoading}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors text-xs ${
              signingMode === "self"
                ? "border-stellar-blue bg-stellar-blue/10 text-white"
                : "border-stellar-border text-stellar-muted hover:text-white hover:bg-white/5"
            }`}
          >
            <Shield size={18} />
            <span className="font-medium">
              {t("settings.selfCustody", "Self-Custody")}
            </span>
          </button>
          <button
            onClick={() => handleSigningModeToggle("delegated")}
            disabled={signingLoading}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors text-xs ${
              signingMode === "delegated"
                ? "border-stellar-purple bg-stellar-purple/10 text-white"
                : "border-stellar-border text-stellar-muted hover:text-white hover:bg-white/5"
            }`}
          >
            <RefreshCw size={18} />
            <span className="font-medium">
              {t("settings.delegated", "Delegated")}
            </span>
          </button>
        </div>

        {signingLoading && (
          <div className="flex justify-center py-1">
            <Loader2 size={14} className="animate-spin text-stellar-muted" />
          </div>
        )}

        <p className="text-[10px] text-stellar-muted leading-relaxed">
          {signingMode === "delegated"
            ? t(
                "settings.delegatedDesc",
                "Transactions signed server-side. Convenient but requires trust."
              )
            : t(
                "settings.selfCustodyDesc",
                "Transactions signed locally. Most secure option."
              )}
        </p>
      </div>

      {/* Security */}
      <div className="bg-stellar-card border border-stellar-border rounded-xl p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-stellar-muted" />
          <h3 className="text-xs font-semibold text-stellar-muted uppercase tracking-wider">
            {t("settings.security")}
          </h3>
        </div>

        {/* Reveal Secret Key */}
        {!revealedKey ? (
          <button
            onClick={handleRevealSecret}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-stellar-border text-stellar-muted hover:text-white hover:bg-white/5 transition-colors text-xs"
          >
            <Eye size={14} />
            {t("settings.revealSecretKey")}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg space-y-2">
              <p className="text-[10px] text-red-400 font-semibold flex items-center gap-1">
                <Shield size={10} />
                {t("settings.secretKeyWarning")}
              </p>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 text-[10px] text-white break-all select-all font-mono leading-relaxed">
                  {revealedKey}
                </code>
                <button
                  onClick={copySecretKey}
                  className="p-1.5 rounded border border-red-500/30 hover:bg-red-500/20 transition-colors shrink-0"
                >
                  {copiedSk ? (
                    <Check size={12} className="text-green-400" />
                  ) : (
                    <Copy size={12} className="text-red-400" />
                  )}
                </button>
              </div>
            </div>
            <button
              onClick={() => {
                setRevealedKey(null);
                setCopiedSk(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-stellar-border text-stellar-muted hover:text-white hover:bg-white/5 transition-colors text-xs"
            >
              <EyeOff size={14} />
              {t("settings.hideSecretKey")}
            </button>
          </div>
        )}

        {/* Reveal Recovery Phrase (HD wallets only) */}
        {isHDWallet && (
          <>
            {!revealedMnemonic ? (
              <button
                onClick={handleRevealMnemonic}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-stellar-border text-stellar-muted hover:text-white hover:bg-white/5 transition-colors text-xs"
              >
                <ShieldCheck size={14} />
                {t("settings.revealMnemonic", "Reveal Recovery Phrase")}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="p-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-2">
                  <p className="text-[10px] text-yellow-400 font-semibold flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {t(
                      "settings.mnemonicWarning",
                      "Never share your recovery phrase!"
                    )}
                  </p>
                  <div className="relative">
                    <div
                      className={`grid grid-cols-3 gap-1 p-2 rounded-lg bg-stellar-bg ${
                        !showMnemonic ? "blur-sm select-none" : ""
                      }`}
                    >
                      {revealedMnemonic.split(" ").map((word, i) => (
                        <div key={i} className="flex items-center gap-0.5">
                          <span className="text-[8px] text-stellar-muted w-3 text-right">
                            {i + 1}.
                          </span>
                          <span className="text-[10px] text-white font-mono">
                            {word}
                          </span>
                        </div>
                      ))}
                    </div>
                    {!showMnemonic && (
                      <button
                        onClick={() => setShowMnemonic(true)}
                        className="absolute inset-0 flex items-center justify-center gap-1 text-white text-[10px] font-medium bg-black/40 rounded-lg"
                      >
                        <Eye size={12} />
                        {t("onboarding.tapToReveal", "Click to reveal")}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {showMnemonic && (
                      <button
                        onClick={() => setShowMnemonic(false)}
                        className="flex-1 py-1.5 rounded border border-yellow-500/30 text-[10px] text-yellow-300 hover:bg-yellow-500/10 flex items-center justify-center gap-1"
                      >
                        <EyeOff size={10} />
                        {t("common.hide", "Hide")}
                      </button>
                    )}
                    <button
                      onClick={copyMnemonic}
                      className="flex-1 py-1.5 rounded border border-yellow-500/30 text-[10px] text-yellow-300 hover:bg-yellow-500/10 flex items-center justify-center gap-1"
                    >
                      {copiedMnemonic ? (
                        <Check size={10} className="text-green-400" />
                      ) : (
                        <Copy size={10} />
                      )}
                      {copiedMnemonic
                        ? t("common.copied", "Copied")
                        : t("common.copy", "Copy")}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setRevealedMnemonic(null);
                    setShowMnemonic(false);
                    setCopiedMnemonic(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-stellar-border text-stellar-muted hover:text-white hover:bg-white/5 transition-colors text-xs"
                >
                  <EyeOff size={14} />
                  {t("settings.hideMnemonic", "Hide Recovery Phrase")}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Language */}
      <div className="bg-stellar-card border border-stellar-border rounded-xl p-3 space-y-2.5">
        <button
          onClick={() => setShowLang(!showLang)}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-stellar-muted" />
            <h3 className="text-xs font-semibold text-stellar-muted uppercase tracking-wider">
              {t("settings.language")}
            </h3>
          </div>
          <span className="text-[10px] text-stellar-blue">
            {showLang ? t("common.close") : t("common.save")}
          </span>
        </button>
        {showLang && <LanguageSwitcher />}
      </div>

      {/* Logout */}
      <button
        onClick={() => setShowLogoutConfirm(true)}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors text-xs font-medium"
      >
        <LogOut size={14} />
        {t("settings.logout")}
      </button>

      {/* PIN Modal */}
      {showPin && (
        <PinModal
          title={
            pinAction === "mnemonic"
              ? t(
                  "settings.enterPinToRevealMnemonic",
                  "Enter PIN to reveal recovery phrase"
                )
              : t("settings.revealSecretKey")
          }
          onSubmit={async (pin) => {
            await unlock(pin);
            if (pinAction === "mnemonic") {
              const encryptedMnemonic = localStorage.getItem(
                `mnemonic_${active?.id}`
              );
              if (encryptedMnemonic) {
                try {
                  const mnemonic = await decryptSecret(encryptedMnemonic, pin);
                  setRevealedMnemonic(mnemonic);
                } catch {
                  toast.error(
                    t("settings.mnemonicDecryptFailed", "Failed to decrypt recovery phrase")
                  );
                }
              } else {
                toast.error(
                  t("settings.noMnemonicFound", "No recovery phrase found for this wallet.")
                );
              }
            } else {
              const sk = getSecretKey();
              setRevealedKey(sk);
            }
            setShowPin(false);
          }}
          onCancel={() => setShowPin(false)}
        />
      )}

      {/* Logout Confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-stellar-card border border-stellar-border rounded-2xl p-5 max-w-[340px] w-full space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
                <LogOut size={24} className="text-red-400" />
              </div>
            </div>
            <h3 className="text-white text-base font-bold text-center">
              {t("settings.logout")}
            </h3>
            <p className="text-stellar-muted text-xs text-center leading-relaxed">
              {t("settings.logoutDescription")}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-stellar-border text-stellar-muted text-xs font-medium hover:text-white transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmLogout}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors"
              >
                {t("settings.logout")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
