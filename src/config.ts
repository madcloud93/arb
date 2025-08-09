import * as dotenv from 'dotenv';
import { Config } from './types';

dotenv.config();

export const config: Config = {
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    wsUrl: process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com'
  },
  arbitrage: {
    profitThresholdPercent: parseFloat(process.env.PROFIT_THRESHOLD_PERCENT || '0.2'),
    tradeSizeUsdc: parseFloat(process.env.TRADE_SIZE_USDC || '100'),
    maxOpportunitiesPerMinute: parseInt(process.env.MAX_OPPORTUNITIES_PER_MINUTE || '10')
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/arbitrage.log'
  },
  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '30'),
    priceHistorySize: parseInt(process.env.PRICE_HISTORY_SIZE || '1000')
  },
  dex: {
    enableRaydium: process.env.RAYDIUM_ENABLED === 'true' || true,
    enableOrca: process.env.ORCA_ENABLED === 'true' || true,
    enableSerum: process.env.SERUM_ENABLED === 'true' || true,
    enableSaber: process.env.SABER_ENABLED === 'true'
  },
  monitoring: {
    healthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '30000'),
    wsReconnectDelayMs: parseInt(process.env.WS_RECONNECT_DELAY_MS || '5000')
  }
};

export const COMMON_PAIRS = [
  {
    baseToken: 'SOL',
    quoteToken: 'USDC',
    baseMint: 'So11111111111111111111111111111111111111112',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  },
  {
    baseToken: 'ETH',
    quoteToken: 'USDC',
    baseMint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  },
  {
    baseToken: 'BTC',
    quoteToken: 'USDC',
    baseMint: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E',
    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  },
  {
    baseToken: 'USDC',
    quoteToken: 'USDT',
    baseMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    quoteMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  }
];

export const SOLANA_FEE_LAMPORTS = 5000;
export const SOLANA_FEE_SOL = SOLANA_FEE_LAMPORTS / 1e9;
