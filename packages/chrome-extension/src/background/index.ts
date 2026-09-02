/**
 * Amma Wallet — Background Service Worker
 * Handles popup messages + dApp signing requests
 */

// ── Keep-alive ──
chrome.alarms.create("keep-alive", { periodInMinutes: 4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keep-alive") {
    console.log("Amma Wallet: keep-alive ping");
  }
});

// ── Connected dApps state ──
interface ConnectedSite {
  origin: string;
  connectedAt: number;
}

let connectedSites: Map<string, ConnectedSite> = new Map();
let pendingApprovals: Map<
  string,
  {
    method: string;
    params: any;
    origin: string;
    resolve: (v: any) => void;
    reject: (e: any) => void;
  }
> = new Map();

// Load connected sites from storage
chrome.storage.local.get("amma_connected_sites", (data) => {
  if (data.amma_connected_sites) {
    const entries = JSON.parse(data.amma_connected_sites);
    connectedSites = new Map(entries);
  }
});

function saveConnectedSites() {
  chrome.storage.local.set({
    amma_connected_sites: JSON.stringify(Array.from(connectedSites.entries())),
  });
}

// ── Get wallet state from storage ──
async function getWalletState(): Promise<{
  publicKey: string | null;
  isUnlocked: boolean;
  network: string;
  networkPassphrase: string;
}> {
  return new Promise((resolve) => {
    chrome.storage.local.get("amma-wallet-store", (data) => {
      const state = data["amma-wallet-store"];
      if (!state) {
        resolve({
          publicKey: null,
          isUnlocked: false,
          network: "testnet",
          networkPassphrase: "Test SDF Network ; September 2015",
        });
        return;
      }

      const parsed = typeof state === "string" ? JSON.parse(state) : state;
      const wallets = parsed?.state?.wallets || [];
      const activeIndex = parsed?.state?.activeWalletIndex || 0;
      const activeWallet = wallets[activeIndex];
      const network = parsed?.state?.network || "testnet";

      resolve({
        publicKey: activeWallet?.publicKey || null,
        isUnlocked: parsed?.state?.isUnlocked || false,
        network,
        networkPassphrase:
          network === "mainnet" || network === "pubnet"
            ? "Public Global Stellar Network ; September 2015"
            : "Test SDF Network ; September 2015",
      });
    });
  });
}

// ── Open popup for user approval ──
function openApprovalPopup(approvalId: string, method: string, origin: string) {
  const params = new URLSearchParams({
    approvalId,
    method,
    origin,
  });

  chrome.windows.create({
    url: chrome.runtime.getURL(`popup.html#/approve?${params.toString()}`),
    type: "popup",
    width: 380,
    height: 620,
    focused: true,
  });
}

// ── Handle dApp requests ──
async function handleDappRequest(
  method: string,
  params: any,
  origin: string
): Promise<{ result?: any; error?: string }> {
  const walletState = await getWalletState();

  switch (method) {
    case "isConnected": {
      return {
        result: {
          connected:
            connectedSites.has(origin) &&
            walletState.isUnlocked &&
            !!walletState.publicKey,
        },
      };
    }

    case "connect": {
      if (!walletState.publicKey) {
        return { error: "No wallet configured. Please set up Amma Wallet first." };
      }

      if (!walletState.isUnlocked) {
        // Open popup to unlock
        return new Promise((resolve) => {
          const approvalId = `${Date.now()}-${Math.random()}`;
          pendingApprovals.set(approvalId, {
            method: "connect",
            params: { origin },
            origin,
            resolve: (v) => resolve({ result: v }),
            reject: (e) => resolve({ error: e.message || String(e) }),
          });
          openApprovalPopup(approvalId, "connect", origin);
        });
      }

      // Already unlocked — ask user to approve connection
      if (connectedSites.has(origin)) {
        return { result: { address: walletState.publicKey } };
      }

      return new Promise((resolve) => {
        const approvalId = `${Date.now()}-${Math.random()}`;
        pendingApprovals.set(approvalId, {
          method: "connect",
          params: { origin },
          origin,
          resolve: (v) => resolve({ result: v }),
          reject: (e) => resolve({ error: e.message || String(e) }),
        });
        openApprovalPopup(approvalId, "connect", origin);
      });
    }

    case "disconnect": {
      connectedSites.delete(origin);
      saveConnectedSites();
      return { result: { disconnected: true } };
    }

    case "getAddress": {
      if (!connectedSites.has(origin)) {
        return { error: "Not connected. Call connect() first." };
      }
      if (!walletState.publicKey) {
        return { error: "No active wallet." };
      }
      return { result: { address: walletState.publicKey } };
    }

    case "getNetwork": {
      return {
        result: {
          network: walletState.network,
          networkPassphrase: walletState.networkPassphrase,
        },
      };
    }

    case "signTransaction": {
      if (!connectedSites.has(origin)) {
        return { error: "Not connected. Call connect() first." };
      }
      if (!walletState.isUnlocked) {
        return { error: "Wallet is locked. Please unlock Amma Wallet." };
      }

      return new Promise((resolve) => {
        const approvalId = `${Date.now()}-${Math.random()}`;
        pendingApprovals.set(approvalId, {
          method: "signTransaction",
          params,
          origin,
          resolve: (v) => resolve({ result: v }),
          reject: (e) => resolve({ error: e.message || String(e) }),
        });
        openApprovalPopup(approvalId, "signTransaction", origin);
      });
    }

    case "signAuthEntry": {
      if (!connectedSites.has(origin)) {
        return { error: "Not connected. Call connect() first." };
      }
      if (!walletState.isUnlocked) {
        return { error: "Wallet is locked. Please unlock Amma Wallet." };
      }

      return new Promise((resolve) => {
        const approvalId = `${Date.now()}-${Math.random()}`;
        pendingApprovals.set(approvalId, {
          method: "signAuthEntry",
          params,
          origin,
          resolve: (v) => resolve({ result: v }),
          reject: (e) => resolve({ error: e.message || String(e) }),
        });
        openApprovalPopup(approvalId, "signAuthEntry", origin);
      });
    }

    case "signMessage": {
      if (!connectedSites.has(origin)) {
        return { error: "Not connected. Call connect() first." };
      }
      if (!walletState.isUnlocked) {
        return { error: "Wallet is locked. Please unlock Amma Wallet." };
      }

      return new Promise((resolve) => {
        const approvalId = `${Date.now()}-${Math.random()}`;
        pendingApprovals.set(approvalId, {
          method: "signMessage",
          params,
          origin,
          resolve: (v) => resolve({ result: v }),
          reject: (e) => resolve({ error: e.message || String(e) }),
        });
        openApprovalPopup(approvalId, "signMessage", origin);
      });
    }

    default:
      return { error: `Unknown method: ${method}` };
  }
}

// ── Message listener ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Popup keep-alive
  if (message.type === "KEEP_ALIVE") {
    sendResponse({ ok: true });
    return;
  }

  // Popup state request
  if (message.type === "GET_STATE") {
    chrome.storage.local.get("Amma-wallet", (data) => {
      sendResponse(data["Amma-wallet"] || null);
    });
    return true;
  }

  // Popup notification
  if (message.type === "NOTIFICATION") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: message.title || "Amma Wallet",
      message: message.message || "",
    });
    sendResponse({ ok: true });
    return;
  }

  // ── dApp requests from content script ──
  if (message.type === "AMMA_DAPP_REQUEST") {
    handleDappRequest(message.method, message.params, message.origin).then(
      (response) => sendResponse(response)
    );
    return true; // async
  }

  // ── Approval responses from popup ──
  if (message.type === "AMMA_APPROVAL_RESPONSE") {
    const { approvalId, approved, result, error } = message;
    const pending = pendingApprovals.get(approvalId);
    if (pending) {
      pendingApprovals.delete(approvalId);
      if (approved) {
        // If connect, save the site
        if (pending.method === "connect") {
          connectedSites.set(pending.origin, {
            origin: pending.origin,
            connectedAt: Date.now(),
          });
          saveConnectedSites();
        }
        pending.resolve(result);
      } else {
        pending.reject(new Error(error || "User rejected the request"));
      }
    }
    sendResponse({ ok: true });
    return;
  }

  // ── Get pending approval details (for approval popup) ──
  if (message.type === "AMMA_GET_APPROVAL") {
    const pending = pendingApprovals.get(message.approvalId);
    if (pending) {
      sendResponse({
        method: pending.method,
        params: pending.params,
        origin: pending.origin,
      });
    } else {
      sendResponse({ error: "Approval not found" });
    }
    return;
  }

  // ── Get connected sites list ──
  if (message.type === "AMMA_GET_CONNECTED_SITES") {
    sendResponse({
      sites: Array.from(connectedSites.values()),
    });
    return;
  }

  // ── Disconnect a site ──
  if (message.type === "AMMA_DISCONNECT_SITE") {
    connectedSites.delete(message.origin);
    saveConnectedSites();
    sendResponse({ ok: true });
    return;
  }
});

console.log("Amma Wallet background service worker started (v2 — dApp integration)");
