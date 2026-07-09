const AMMA_WALLET_URL = import.meta.env.VITE_AMMA_WALLET_URL || "http://localhost:3001/";

import type { NFTResponse } from "../types/api.js";

// export interface GetNFTResponse {
//   indexed: {
//     tokens: [
//       {
//         token: {
//           id: number;
//           collectionId: number;
//           tokenId: number;
//           owner: string;
//           metadataUri: string;
//           name: string;
//           description: string;
//           image: string;
//           attributes: [
//             {
//               value: string;
//               trait_type: string;
//             },
//             {
//               value: string;
//               trait_type: string;
//             }
//           ],
//           isBurned: boolean;
//           lastSyncedAt: null;
//           createdAt: string;
//           updatedAt: string;
//         },
//         collection: {
//           id: number;
//           type: string;
//           contractId: string;
//           assetCode: null;
//           assetIssuer: null;
//           name: string;
//           symbol: string;
//           baseUri: string;
//           description: string;
//           image: null;
//           creator: null;
//           totalSupply: number;
//           isVerified: boolean;
//           network: string;
//           createdAt: string;
//           updatedAt: string;
//         }
//       }
//     ];
//   }
// }


export async function getUserNfts(walletAddress: string): Promise<NFTResponse> {
  const res = await fetch(`${AMMA_WALLET_URL}api/v1/nfts/owner/${walletAddress}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Amma get NFTs failed (${res.status})`);
  }

  const result = (await res.json()) as NFTResponse;
  console.log("NFT result:", result);
  return result;
}

