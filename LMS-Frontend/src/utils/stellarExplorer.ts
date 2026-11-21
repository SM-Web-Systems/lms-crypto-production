/** Explorer link for a transaction on the network the record was issued on (public unless it says testnet). */
export function stellarTxUrl(txHash: string, network?: string | null): string {
  return `https://stellar.expert/explorer/${network === 'testnet' ? 'testnet' : 'public'}/tx/${txHash}`;
}
