import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWalletStore } from "@/store/wallet";

interface ApprovalData {
  method: string;
  params: any;
  origin: string;
}

export default function Approve() {
  const [searchParams] = useSearchParams();
  const [approval, setApproval] = useState<ApprovalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);

  const approvalId = searchParams.get("approvalId") || "";
  const walletStore = useWalletStore();

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "AMMA_GET_APPROVAL", approvalId },
      (response) => {
        if (response && !response.error) {
          setApproval(response);
        }
        setLoading(false);
      }
    );
  }, [approvalId]);

  const handleApprove = async () => {
    if (!approval) return;
    setSigning(true);

    try {
      let result: any;

      if (approval.method === "connect") {
        const publicKey = walletStore.activePublicKey;
        result = { address: publicKey };
      } else if (approval.method === "signTransaction") {
        const sk = walletStore._secretKey;
        if (!sk) throw new Error("Wallet is locked");

        const StellarSdk = await import("@stellar/stellar-sdk");
        const networkPassphrase =
          approval.params.networkPassphrase ||
          "Test SDF Network ; September 2015";
        const tx = StellarSdk.TransactionBuilder.fromXDR(
          approval.params.xdr,
          networkPassphrase
        );
        const keypair = StellarSdk.Keypair.fromSecret(sk);
        if (tx instanceof StellarSdk.Transaction) {
          tx.sign(keypair);
        }
        result = {
          signedTxXdr: tx.toXDR(),
          signerAddress: keypair.publicKey(),
        };
      } else if (approval.method === "signAuthEntry") {
        const sk = walletStore._secretKey;
        if (!sk) throw new Error("Wallet is locked");

        const StellarSdk = await import("@stellar/stellar-sdk");
        const keypair = StellarSdk.Keypair.fromSecret(sk);
        const signed = keypair.sign(Buffer.from(approval.params.authEntry, "base64"));
        result = {
          signedAuthEntry: signed.toString("base64"),
          signerAddress: keypair.publicKey(),
        };
      } else if (approval.method === "signMessage") {
        const sk = walletStore._secretKey;
        if (!sk) throw new Error("Wallet is locked");

        const StellarSdk = await import("@stellar/stellar-sdk");
        const keypair = StellarSdk.Keypair.fromSecret(sk);
        const msgBytes = new TextEncoder().encode(approval.params.message);
        const signed = keypair.sign(msgBytes);
        result = {
          signedMessage: Buffer.from(signed).toString("base64"),
          signerAddress: keypair.publicKey(),
        };
      }

      chrome.runtime.sendMessage({
        type: "AMMA_APPROVAL_RESPONSE",
        approvalId,
        approved: true,
        result,
      });

      window.close();
    } catch (err: any) {
      chrome.runtime.sendMessage({
        type: "AMMA_APPROVAL_RESPONSE",
        approvalId,
        approved: false,
        error: err.message,
      });
      window.close();
    }
  };

  const handleReject = () => {
    chrome.runtime.sendMessage({
      type: "AMMA_APPROVAL_RESPONSE",
      approvalId,
      approved: false,
      error: "User rejected the request",
    });
    window.close();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <p>Loading...</p>
      </div>
    );
  }

  if (!approval) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <p>Approval request not found.</p>
      </div>
    );
  }

  const methodLabels: Record<string, string> = {
    connect: "Connect Wallet",
    signTransaction: "Sign Transaction",
    signAuthEntry: "Sign Auth Entry",
    signMessage: "Sign Message",
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-xl font-bold">A</span>
        </div>
        <h1 className="text-lg font-bold">Amma Wallet</h1>
        <p className="text-gray-400 text-sm mt-1">
          {methodLabels[approval.method] || approval.method}
        </p>
      </div>

      {/* Origin */}
      <div className="bg-gray-800 rounded-lg p-3 mb-4">
        <p className="text-xs text-gray-400">Requesting site</p>
        <p className="text-sm font-mono text-indigo-400 truncate">
          {approval.origin}
        </p>
      </div>

      {/* Details */}
      {approval.method === "connect" && (
        <div className="bg-gray-800 rounded-lg p-3 mb-4 flex-1">
          <p className="text-sm text-gray-300">
            This site wants to <strong>view your public address</strong> and
            request transaction approvals.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            It will NOT have access to your private key.
          </p>
        </div>
      )}

      {approval.method === "signTransaction" && (
        <div className="bg-gray-800 rounded-lg p-3 mb-4 flex-1 overflow-auto">
          <p className="text-xs text-gray-400 mb-1">Transaction XDR</p>
          <pre className="text-xs text-gray-300 break-all whitespace-pre-wrap max-h-48 overflow-y-auto">
            {approval.params?.xdr?.slice(0, 200)}
            {approval.params?.xdr?.length > 200 ? "..." : ""}
          </pre>
        </div>
      )}

      {approval.method === "signMessage" && (
        <div className="bg-gray-800 rounded-lg p-3 mb-4 flex-1">
          <p className="text-xs text-gray-400 mb-1">Message</p>
          <p className="text-sm text-gray-300 break-all">
            {approval.params?.message}
          </p>
        </div>
      )}

      {approval.method === "signAuthEntry" && (
        <div className="bg-gray-800 rounded-lg p-3 mb-4 flex-1">
          <p className="text-xs text-gray-400 mb-1">Auth Entry</p>
          <pre className="text-xs text-gray-300 break-all whitespace-pre-wrap max-h-48 overflow-y-auto">
            {approval.params?.authEntry?.slice(0, 200)}...
          </pre>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 mt-auto">
        <button
          onClick={handleReject}
          className="flex-1 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium transition"
        >
          Reject
        </button>
        <button
          onClick={handleApprove}
          disabled={signing}
          className="flex-1 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50"
        >
          {signing ? "Signing..." : "Approve"}
        </button>
      </div>
    </div>
  );
}
