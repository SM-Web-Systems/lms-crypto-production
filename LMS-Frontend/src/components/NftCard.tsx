interface NftToken {
  id: number;
  collectionId: number;
  tokenId: number;
  owner: string;
  metadataUri: string | null;
  name: string | null;
  description: string | null;
  image: string | null;
  attributes: { trait_type: string; value: string }[] | null;
  isBurned: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function NftCard({ token }: { token: NftToken }) {
  return (
    <div className="rounded-xl border border-stellar-border bg-stellar-card overflow-hidden">
      {token.image ? (
        <img
            src={token.image}
            alt={token.name || `Token #${token.tokenId}`}
            className="w-full h-40 object-contain bg-white"
        />
      ) : (
        <div className="w-full h-40 bg-gradient-to-br from-purple-500/10 to-blue-500/10 flex items-center justify-center">
          <span className="text-stellar-muted text-xs">No image</span>
        </div>
      )}
      <div className="p-3">
        <p className="font-medium text-sm">{token.name || `#${token.tokenId}`}</p>
        {token.description && (
          <p className="text-xs text-stellar-muted mt-1">{token.description}</p>
        )}
        {token.attributes && token.attributes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {token.attributes.map((attr, i) => (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400"
              >
                {attr.trait_type}: {attr.value}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}