/**
 * Amma Wallet — Injected Provider API
 * Exposes window.ammaWallet for dApp integration
 * Compatible with SEP-43 wallet standard
 */
(function () {
  "use strict";

  let requestId = 0;
  const pendingRequests = new Map();

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "amma-wallet-content") return;

    const pending = pendingRequests.get(event.data.id);
    if (!pending) return;

    pendingRequests.delete(event.data.id);
    if (event.data.error) {
      pending.reject(new Error(event.data.error));
    } else {
      pending.resolve(event.data.result);
    }
  });

  function sendRequest(method, params) {
    return new Promise(function (resolve, reject) {
      var id = ++requestId;
      pendingRequests.set(id, { resolve: resolve, reject: reject });

      window.postMessage(
        { source: "amma-wallet-inpage", id: id, method: method, params: params },
        "*"
      );

      setTimeout(function () {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error("Amma Wallet: Request timed out"));
        }
      }, 300000);
    });
  }

  var ammaWallet = {
    isAmmaWallet: true,

    isConnected: function () {
      return sendRequest("isConnected").then(function (r) { return r.connected; }).catch(function () { return false; });
    },

    connect: function () {
      return sendRequest("connect");
    },

    disconnect: function () {
      return sendRequest("disconnect");
    },

    getAddress: function () {
      return sendRequest("getAddress");
    },

    getNetwork: function () {
      return sendRequest("getNetwork");
    },

    signTransaction: function (xdr, opts) {
      return sendRequest("signTransaction", Object.assign({ xdr: xdr }, opts || {}));
    },

    signAuthEntry: function (authEntry, opts) {
      return sendRequest("signAuthEntry", Object.assign({ authEntry: authEntry }, opts || {}));
    },

    signMessage: function (message, opts) {
      return sendRequest("signMessage", Object.assign({ message: message }, opts || {}));
    },
  };

  window.ammaWallet = ammaWallet;
  window.dispatchEvent(new CustomEvent("ammaWallet:ready"));
  console.log("Amma Wallet provider injected");
})();
