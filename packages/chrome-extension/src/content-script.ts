/**
 * Amma Wallet — Content Script
 * Bridges messages between the injected inpage script and the background service worker
 */

// Inject the inpage script into the web page context
const script = document.createElement("script");
script.src = chrome.runtime.getURL("inpage.js");
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

// Relay messages from the web page to the background
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== "amma-wallet-inpage") return;

  const { id, method, params } = event.data;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "AMMA_DAPP_REQUEST",
      method,
      params,
      origin: window.location.origin,
    });

    window.postMessage(
      {
        source: "amma-wallet-content",
        id,
        result: response?.result,
        error: response?.error,
      },
      "*"
    );
  } catch (err: any) {
    window.postMessage(
      {
        source: "amma-wallet-content",
        id,
        error: err.message || "Extension communication failed",
      },
      "*"
    );
  }
});

console.log("Amma Wallet content script loaded");
