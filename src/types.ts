export interface Config {
  solana: {
    rpcUrl: string;
    wsUrl: string;
  };
  arbitrage: {
    profitThresholdPercent: number;
    tradeSizeUsdc: number;
    maxOpportunitiesPerMinute: number;
  };
  logging: {
    level: string;
    file: string;
  };
  cache: {
    ttlSeconds: number;
    priceHistorySize: number;
  };
  dex: {
    enableRaydium: boolean;
    enableOrca: boolean;
    enableSerum: boolean;
    enableSaber: boolean;
  };
  monitoring: {
    healthCheckIntervalMs: number;
    wsReconnectDelayMs: number;
  };
}

export interface TokenPair {
  baseToken: string;
  quoteToken: string;
  baseMint: string;
  quoteMint: string;
}

export interface PriceQuote {
  dex: string;
  pair: TokenPair;
  price: number;
  liquidity: number;
  timestamp: number;
  bid?: number;
  ask?: number;
  midPrice?: number;
}

export interface ArbitrageOpportunity {
  id: string;
  pair: TokenPair;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercent: number;
  grossProfit: number;
  estimatedFees: number;
  netProfit: number;
  netProfitPercent: number;
  tradeSize: number;
  timestamp: number;
  confidence: number;
}

export interface DEXInterface {
  name: string;
  isEnabled: boolean;
  initialize(): Promise<void>;
  fetchPrice(pair: TokenPair): Promise<PriceQuote | null>;
  subscribeToUpdates(pair: TokenPair, callback: (quote: PriceQuote) => void): void;
  unsubscribe(pair: TokenPair): void;
  getOrderBook?(pair: TokenPair): Promise<{ bids: number[][]; asks: number[][] } | null>;
}
