import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWalletStore } from "../store/wallet";
import { useQueryClient } from "@tanstack/react-query";

export default function NetworkSwitcher() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const network = useWalletStore((s) => s.network);
  const setNetwork = useWalletStore((s) => s.setNetwork);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingNetwork, setPendingNetwork] = useState<"testnet" | "public">("testnet");

  const handleSwitch = (next: "testnet" | "public") => {
    if (next === network) return;
    setPendingNetwork(next);
    setShowConfirm(true);
  };

  const confirmSwitch = () => {
    setNetwork(pendingNetwork);
    setShowConfirm(false);
    queryClient.invalidateQueries();
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={() => handleSwitch("testnet")}
          className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
            network === "testnet"
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              : "bg-stellar-dark border border-stellar-border text-stellar-muted hover:text-stellar-text"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <div className={`w-2 h-2 rounded-full ${network === "testnet" ? "bg-amber-400" : "bg-stellar-muted"}`} />
            Testnet
          </div>
        </button>
        <button
          onClick={() => handleSwitch("public")}
          className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
            network === "public"
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-stellar-dark border border-stellar-border text-stellar-muted hover:text-stellar-text"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <div className={`w-2 h-2 rounded-full ${network === "public" ? "bg-emerald-400" : "bg-stellar-muted"}`} />
            Mainnet
          </div>
        </button>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-stellar-card border border-stellar-border rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-stellar-text text-lg font-bold mb-2">
              {t("settings.switchNetwork", "Switch Network")}
            </h3>
            <p className="text-stellar-muted text-sm mb-6">
              {pendingNetwork === "public"
                ? t("settings.mainnetWarning", "Switching to PUBLIC mainnet. Real XLM will be used. Make sure you understand the risks.")
                : t("settings.testnetInfo", "Switching to testnet. Only test XLM, no real value.")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-stellar-border text-stellar-muted text-sm font-medium hover:text-stellar-text transition-colors"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                onClick={confirmSwitch}
                className={`flex-1 py-3 rounded-xl text-sm font-medium text-stellar-text transition-colors ${
                  pendingNetwork === "public" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-amber-600 hover:bg-amber-500"
                }`}
              >
                {t("common.confirm", "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
