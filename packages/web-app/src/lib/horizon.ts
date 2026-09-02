export function getHorizonUrl(network: "testnet" | "public") {
  return network === "testnet"
    ? "https://horizon-testnet.stellar.org"
    : "https://horizon.stellar.org";
}

export function getNetworkPassphrase(network: "testnet" | "public") {
  return network === "testnet"
    ? "Test SDF Network ; September 2015"
    : "Public Global Stellar Network ; September 2015";
}

export async function fetchBalancesFromHorizon(publicKey: string, network: "testnet" | "public") {
  const url = `${getHorizonUrl(network)}/accounts/${publicKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Horizon error: ${res.status}`);
  }
  const data = await res.json();
  return data.balances.map((b: any) => ({
    assetCode: b.asset_type === "native" ? "XLM" : b.asset_code,
    assetIssuer: b.asset_type === "native" ? "native" : b.asset_issuer,
    balance: b.balance,
    assetType: b.asset_type,
    token:
      b.asset_type === "native"
        ? {
            tomlName: "Stellar Lumens",
            tomlImage: "https://cryptologos.cc/logos/stellar-xlm-logo.png",
            domain: "stellar.org",
            isVerified: true,
            ratingAverage: 5,
          }
        : undefined,
    isFavorite: false,
  }));
}

export async function fetchHistoryFromHorizon(publicKey: string, network: "testnet" | "public", limit = 50) {
  const url = `${getHorizonUrl(network)}/accounts/${publicKey}/operations?order=desc&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Horizon error: ${res.status}`);
  }
  const data = await res.json();
  return data._embedded?.records || [];
}
