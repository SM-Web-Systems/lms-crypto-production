export const API_BASE = import.meta.env.VITE_API_URL || "";

// Network config — read from wallet store at runtime
export function getNetworkConfig(network: "testnet" | "public") {
  if (network === "public") {
    return {
      horizonUrl: "https://horizon.stellar.org",
      networkPassphrase: "Public Global Stellar Network ; September 2015",
      friendbotUrl: "", // no friendbot on mainnet
    };
  }
  return {
    horizonUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    friendbotUrl: "https://friendbot.stellar.org",
  };
}

// Defaults for backwards compat (used where store isn't available yet)
export const HORIZON_URL = "https://horizon.stellar.org";
export const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
export const FRIENDBOT_URL = "https://friendbot.stellar.org";
