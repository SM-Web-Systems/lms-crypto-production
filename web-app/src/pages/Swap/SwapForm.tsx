import { useState } from "react";
import { useWalletStore } from "../../hooks/useWallet";
import { gql, useQuery, useMutation } from "../../api/client";

const SWAP_QUOTE = gql`
  query SwapQuote(
    $fromCode: String!, $fromIssuer: String,
    $toCode: String!, $toIssuer: String,
    $amount: String!, $direction: SwapDirection
  ) {
    swapQuote(
      fromCode: $fromCode, fromIssuer: $fromIssuer,
      toCode: $toCode, toIssuer: $toIssuer,
      amount: $amount, direction: $direction
    ) {
      source destAmount sourceAmount
      priceImpact fee rate
      path { code issuer }
    }
  }
`;

const BUILD_SWAP = gql`
  mutation BuildSwap($publicKey: String!, $quote: SwapQuoteInput!, $slippage: Int) {
    buildSwapTx(publicKey: $publicKey, quote: $quote, slippageBps: $slippage) {
      xdr networkPassphrase expiresAt
    }
  }
`;

export function SwapForm() {
  const { publicKey, signTransaction } = useWalletStore();
  const [fromAsset, setFromAsset] = useState({ code: "XLM", issuer: null });
  const [toAsset, setToAsset] = useState({ code: "USDC", issuer: "GBBD47..." });
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [selectedQuote, setSelectedQuote] = useState(null);

  const { data: quotes, loading } = useQuery(SWAP_QUOTE, {
    variables: {
      fromCode: fromAsset.code, fromIssuer: fromAsset.issuer,
      toCode: toAsset.code, toIssuer: toAsset.issuer,
      amount, direction: "SEND",
    },
    skip: !amount || parseFloat(amount) <= 0,
    debounce: 500,
  });

  const handleSwap = async () => {
    if (!selectedQuote || !publicKey) return;

    // 1. Build unsigned tx on backend
    const { data } = await buildSwap({
      variables: { publicKey, quote: selectedQuote, slippage: 100 },
    });

    // 2. Sign client-side (key never leaves browser)
    const signedXdr = await signTransaction(data.buildSwapTx.xdr, pin);

    // 3. Submit via backend
    await submitTx({ variables: { signedXdr } });
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow-lg">
      <h2 className="text-xl font-bold mb-6">Swap</h2>

      {/* From Asset */}
      <div className="bg-gray-50 rounded-xl p-4 mb-2">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-gray-500">You pay</span>
          <button className="text-sm text-blue-600">Max</button>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="text-2xl font-mono bg-transparent flex-1 outline-none"
          />
          <AssetSelector value={fromAsset} onChange={setFromAsset} />
        </div>
      </div>

      {/* Swap direction button */}
      <div className="flex justify-center -my-2 relative z-10">
        <button
          onClick={() => {
            setFromAsset(toAsset);
            setToAsset(fromAsset);
          }}
          className="bg-white border-4 border-gray-50 rounded-full p-2"
        >
          ↕
        </button>
      </div>

      {/* To Asset */}
      <div className="bg-gray-50 rounded-xl p-4 mb-4">
        <span className="text-sm text-gray-500">You receive</span>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-2xl font-mono flex-1">
            {selectedQuote?.destAmount || "0.00"}
          </span>
          <AssetSelector value={toAsset} onChange={setToAsset} />
        </div>
      </div>

      {/* Quotes comparison */}
      {quotes?.swapQuote?.length > 0 && (
        <div className="mb-4 space-y-2">
          {quotes.swapQuote.map((q, i) => (
            <div
              key={i}
              onClick={() => setSelectedQuote(q)}
              className={`p-3 rounded-lg border cursor-pointer ${
                selectedQuote === q ? "border-blue-500 bg-blue-50" : "border-gray-200"
              }`}
            >
              <div className="flex justify-between">
                <span className="text-sm font-medium">
                  {q.source} {i === 0 && "— Best"}
                </span>
                <span className="font-mono">{q.destAmount}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Impact: {q.priceImpact}%</span>
                <span>Fee: {q.fee}</span>
                <span>Rate: {q.rate}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleSwap}
        disabled={!selectedQuote}
        className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium
                   disabled:bg-gray-300 hover:bg-blue-700 transition"
      >
        {loading ? "Finding routes..." : "Swap"}
      </button>
    </div>
  );
}
