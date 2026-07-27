import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWalletStore } from "../store/wallet";
import { useAuthStore } from "../store/auth";
import { useBalances } from "../hooks/useBalances";
import { buildPaymentTx, calculatePlatformFee, extractStellarError, StellarSdk } from "../lib/stellar";
import { getNetworkConfig } from "../lib/constants";
import { signingApi } from "../lib/api";
import PinModal from "../components/PinModal";
import { toast } from "sonner";

export default function SendPage() {
  const { t } = useTranslation();
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [assetCode, setAssetCode] = useState("XLM");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: balances } = useBalances();
  const isUnlocked = useWalletStore((s) => s.isUnlocked);
  const getSecretKey = useWalletStore((s) => s.getSecretKey);
  const unlock = useWalletStore((s) => s.unlock);
  const publicKey = useWalletStore((s) => s.getPublicKey());
  const signingMode = useAuthStore((s) => s.signingMode);

  const selectedBalance = balances?.find((b) => b.assetCode === assetCode);
  const assetIssuer = selectedBalance?.assetIssuer;

  const handleSend = async () => {
    if (!destination || !amount) return toast.error(t("common.fillAllFields"));
    if (parseFloat(amount) <= 0) return toast.error(t("common.invalidAmount"));
    if (!StellarSdk.StrKey.isValidEd25519PublicKey(destination))
      return toast.error(t("send.invalidAddress"));

    if (signingMode === "delegated") {
      // Delegated mode — ALWAYS need PIN for server-side decryption
      setShowPin(true);
      return;
    } else {
      // Self-signing mode — need PIN to unlock
      if (!isUnlocked) {
        setShowPin(true);
        return;
      }
      await executeSelfSend();
    }
  };

  // Self-signing: frontend builds, signs, and submits
  const executeSelfSend = async () => {
    setLoading(true);
    try {
      const secretKey = getSecretKey();
      await buildPaymentTx(
        secretKey,
        destination,
        amount,
        assetCode,
        assetIssuer === "native" ? undefined : assetIssuer
      );
      toast.success(t("send.successMessage", { amount, code: assetCode }));
      setDestination("");
      setAmount("");
    } catch (err: any) {
      toast.error(extractStellarError(err));
    } finally {
      setLoading(false);
    }
  };

  // Delegated: frontend builds unsigned XDR, backend signs + fee bumps + submits
  const executeDelegatedSend = async (pin?: string) => {
    setLoading(true);
    try {
      if (!publicKey) throw new Error("No active wallet");

      const network = useWalletStore.getState().network;
      const { horizonUrl, networkPassphrase: passphrase } = getNetworkConfig(network);
      const srv = new StellarSdk.Horizon.Server(horizonUrl);
      const account = await srv.loadAccount(publicKey);
      const asset =
        assetCode === "XLM"
          ? StellarSdk.Asset.native()
          : new StellarSdk.Asset(assetCode, assetIssuer === "native" ? undefined : assetIssuer);

      // Build unsigned transaction — backend will inject fee + fee bump
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: passphrase,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination,
            asset,
            amount,
          })
        )
        .setTimeout(300)
        .build();

      // Send unsigned XDR to backend — it signs, adds fee, fee bumps, and submits
      const xdrBase64 = tx.toEnvelope().toXDR('base64');
      console.log('[delegated-send] XDR type:', typeof xdrBase64);
      console.log('[delegated-send] XDR first 40:', String(xdrBase64).slice(0, 40));
      console.log('[delegated-send] XDR length:', String(xdrBase64).length);
      console.log('[delegated-send] passphrase:', passphrase);
      const result = await signingApi.signAndSubmit(xdrBase64, passphrase, pin);

      if (result.success) {
        const feeInfo = result.fee
          ? ` (${result.fee.feePercent}% fee: ${result.fee.feeOperations?.[0]?.amount || "0"} ${assetCode})`
          : "";
        toast.success(t("send.successMessage", { amount, code: assetCode }) + feeInfo);
        setDestination("");
        setAmount("");
      } else {
        throw new Error(result.error || "Transaction failed");
      }
    } catch (err: any) {
      toast.error(extractStellarError(err));
    } finally {
      setLoading(false);
    }
  };

  const feeAmount = amount ? calculatePlatformFee(amount) : "0";
  const netAmount = feeAmount !== "0" ? (parseFloat(amount) - parseFloat(feeAmount)).toFixed(7) : amount;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-stellar-text">{t("send.title")}</h1>

      <div className="bg-stellar-card border border-stellar-border rounded-2xl p-6 space-y-4 max-w-lg">
        {signingMode === "delegated" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stellar-blue/10 border border-stellar-blue/20">
            <span className="text-xs text-stellar-blue">Delegated mode — platform pays network fees</span>
          </div>
        )}

        <div>
          <label className="block text-sm text-stellar-muted mb-1">{t("send.asset")}</label>
          <select
            value={assetCode}
            onChange={(e) => setAssetCode(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text focus:outline-none focus:border-stellar-blue"
          >
            {balances?.map((b) => (
              <option key={`${b.assetCode}-${b.assetIssuer}`} value={b.assetCode}>
                {b.assetCode} — {parseFloat(b.balance).toFixed(4)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-stellar-muted mb-1">{t("send.destination")}</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder={t("send.destinationPlaceholder")}
            className="w-full px-4 py-3 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-sm text-stellar-muted mb-1">{t("send.amount")}</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="any"
            min="0"
            className="w-full px-4 py-3 rounded-lg bg-stellar-dark border border-stellar-border text-stellar-text placeholder:text-stellar-muted focus:outline-none focus:border-stellar-blue"
          />
        </div>

        {amount && parseFloat(amount) > 0 && feeAmount !== "0" && (
          <div className="text-xs text-stellar-muted space-y-1 px-1">
            <div className="flex justify-between">
              <span>Recipient receives:</span>
              <span className="text-stellar-text">{parseFloat(netAmount).toFixed(7)} {assetCode}</span>
            </div>
            <div className="flex justify-between">
              <span>Platform fee (0.1%):</span>
              <span className="text-amber-400">{feeAmount} {assetCode}</span>
            </div>
            {signingMode === "delegated" && (
              <div className="flex justify-between">
                <span>Network fee:</span>
                <span className="text-green-400">Paid by platform</span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-stellar-blue text-white font-medium hover:bg-stellar-purple transition-colors disabled:opacity-50"
        >
          {loading ? t("send.sending") : t("send.sendButton", { code: assetCode })}
        </button>
      </div>

      {showPin && (
        <PinModal
          title={t("send.unlockToSend")}
          onSubmit={async (pin) => {
            await unlock(pin);
            setShowPin(false);
            if (signingMode === "delegated") {
              await executeDelegatedSend(pin);
            } else {
              await executeSelfSend();
            }
          }}
          onCancel={() => setShowPin(false)}
        />
      )}
    </div>
  );
}
