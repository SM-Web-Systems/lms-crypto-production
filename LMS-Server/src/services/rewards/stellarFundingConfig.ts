import { StrKey } from '@stellar/stellar-sdk';

// Reward funding has its own explicit configuration. NFT and course-tuition
// defaults must never select a treasury account or network for reward deposits.
export function stellarFundingConfiguration(): {network: 'testnet' | 'public'; destination: string} | null {
  const network = process.env.REWARD_STELLAR_NETWORK;
  const destination = process.env.REWARD_STELLAR_DESTINATION;
  if ((network !== 'testnet' && network !== 'public') || !destination || !StrKey.isValidEd25519PublicKey(destination)) return null;
  return {network, destination};
}
