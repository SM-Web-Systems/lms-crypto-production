export const typeDefs = `
  type Query {
    # Balances
    balances(publicKey: String!): [Balance!]!

    # Tokens
    tokens(query: String, sortBy: TokenSort, verified: Boolean, limit: Int, cursor: Int): [Token!]!
    token(code: String!, issuer: String!): TokenDetail
    featuredTokens: [Token!]!
    userTokens(publicKey: String!): [UserToken!]!

    # Swap
    swapQuote(
      fromCode: String!, fromIssuer: String,
      toCode: String!, toIssuer: String,
      amount: String!, direction: SwapDirection
    ): [SwapQuote!]!

    # Transactions
    transactionHistory(publicKey: String!, limit: Int, cursor: String): TransactionPage!

    # Prices
    price(code: String!, issuer: String): PriceInfo
    priceHistory(code: String!, issuer: String, interval: PriceInterval): [PricePoint!]!

    # Liquidity
    liquidityPools(assetCode: String, assetIssuer: String, limit: Int): [LiquidityPool!]!
  }

  type Mutation {
    # Token Management
    addUserToken(publicKey: String!, code: String!, issuer: String!): UserToken!
    removeUserToken(publicKey: String!, code: String!, issuer: String!): Boolean!
    toggleFavoriteToken(publicKey: String!, code: String!, issuer: String!): UserToken!

    # Trustlines
    buildAddTrustlineTx(publicKey: String!, code: String!, issuer: String!): UnsignedTx!
    buildRemoveTrustlineTx(publicKey: String!, code: String!, issuer: String!): UnsignedTx!

    # Transactions
    buildPaymentTx(
      publicKey: String!, destAddress: String!,
      code: String!, issuer: String, amount: String!, memo: String
    ): UnsignedTx!
    submitSignedTx(signedXdr: String!): TxResult!

    # Swap
    buildSwapTx(publicKey: String!, quote: SwapQuoteInput!, slippageBps: Int): UnsignedTx!
  }

  # ─── Types ───

  type Balance {
    assetCode: String!
    assetIssuer: String
    assetType: String!
    balance: String!
    buyingLiabilities: String
    sellingLiabilities: String
    name: String
    symbol: String
    image: String
    domain: String
    priceUsd: String
    valueUsd: String
  }

  type Token {
    id: ID!
    assetCode: String!
    assetIssuer: String
    assetType: String!
    name: String
    domain: String
    image: String
    supply: String
    trustlines: Int
    ratingAverage: Float
    volume7d: String
    isVerified: Boolean
    anchorAsset: String
    anchorType: String
  }

  type TokenDetail {
    id: ID!
    assetCode: String!
    assetIssuer: String
    name: String
    description: String
    domain: String
    image: String
    organization: String
    supply: String
    trustlines: Int
    tradeCount: Int
    paymentCount: Int
    volume7d: String
    rating: TokenRating
    isVerified: Boolean
    contractToken: ContractToken
    orderbook: Orderbook
    liquidityPools: [LiquidityPool!]!
  }

  type TokenRating {
    age: Int
    trades: Int
    payments: Int
    trustlines: Int
    volume: Int
    liquidity: Int
    interop: Int
    average: Float
  }

  type ContractToken {
    contractId: String!
    contractType: String!
    decimals: Int!
  }

  type UserToken {
    token: Token!
    balance: String
    isFavorite: Boolean!
    isHidden: Boolean!
    addedAt: String!
  }

  type SwapQuote {
    source: String!
    sourceAmount: String!
    destAmount: String!
    path: [PathAsset!]!
    priceImpact: String!
    fee: String!
    rate: String!
  }

  type PathAsset {
    code: String!
    issuer: String
  }

  type Orderbook {
    bids: [OrderbookEntry!]!
    asks: [OrderbookEntry!]!
    spread: String
  }

  type OrderbookEntry {
    price: String!
    amount: String!
  }

  type LiquidityPool {
    poolId: String!
    reserves: [PoolReserve!]!
    totalShares: String!
    totalTrustlines: Int!
    spotPrice: String
    volume24h: String
  }

  type PoolReserve {
    asset: String!
    amount: String!
  }

  type PriceInfo {
    priceXlm: String!
    priceUsd: String!
    change24h: String
    volume24h: String
  }

  type PricePoint {
    timestamp: String!
    price: String!
    volume: String
  }

  type UnsignedTx {
    xdr: String!
    networkPassphrase: String!
    expiresAt: String!
  }

  type TxResult {
    hash: String!
    ledger: Int!
    successful: Boolean!
  }

  type TransactionPage {
    records: [Transaction!]!
    nextCursor: String
  }

  type Transaction {
    hash: String!
    type: String!
    assetCode: String
    assetIssuer: String
    amount: String
    from: String
    to: String
    memo: String
    fee: String
    successful: Boolean!
    createdAt: String!
  }

  # ─── Inputs & Enums ───

  enum TokenSort { RATING, VOLUME, TRUSTLINES, NAME }
  enum SwapDirection { SEND, RECEIVE }
  enum PriceInterval { HOUR, DAY, WEEK, MONTH }

  input SwapQuoteInput {
    source: String!
    fromCode: String!
    fromIssuer: String
    toCode: String!
    toIssuer: String
    sourceAmount: String!
    destAmount: String!
    path: [PathAssetInput!]!
  }

  input PathAssetInput {
    code: String!
    issuer: String
  }
`;
