import { PriceQuote, ArbitrageOpportunity, TokenPair } from '../types';
import { config } from '../config';
import { logger, logDebug, logInfo } from '../utils/logger';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface PriceHistory {
  prices: PriceQuote[];
  maxSize: number;
}

interface OpportunityHistory {
  opportunities: ArbitrageOpportunity[];
  maxSize: number;
}

export class DataManager {
  private priceCache: Map<string, CacheEntry<PriceQuote>> = new Map();
  private priceHistory: Map<string, PriceHistory> = new Map();
  private opportunityHistory: OpportunityHistory;
  private readonly cacheTTL: number;
  private readonly maxHistorySize: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cacheTTL = config.cache.ttlSeconds * 1000; // Convert to milliseconds
    this.maxHistorySize = config.cache.priceHistorySize;
    
    this.opportunityHistory = {
      opportunities: [],
      maxSize: 1000 // Store last 1000 opportunities
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute

    logInfo('Data Manager initialized', {
      cacheTTL: this.cacheTTL,
      maxHistorySize: this.maxHistorySize
    });
  }

  storePriceQuote(quote: PriceQuote): void {
    const cacheKey = this.getPriceCacheKey(quote.dex, quote.pair);
    
    // Store in cache
    this.priceCache.set(cacheKey, {
      data: quote,
      timestamp: Date.now(),
      ttl: this.cacheTTL
    });

    // Store in history
    const historyKey = this.getPairKey(quote.pair);
    let history = this.priceHistory.get(historyKey);
    
    if (!history) {
      history = {
        prices: [],
        maxSize: this.maxHistorySize
      };
      this.priceHistory.set(historyKey, history);
    }

    history.prices.push(quote);

    // Maintain max size
    if (history.prices.length > history.maxSize) {
      history.prices = history.prices.slice(-history.maxSize);
    }

    logDebug('Price quote stored', {
      dex: quote.dex,
      pair: `${quote.pair.baseToken}/${quote.pair.quoteToken}`,
      price: quote.price.toFixed(6),
      cacheSize: this.priceCache.size,
      historySize: history.prices.length
    });
  }

  getLatestPrice(dex: string, pair: TokenPair): PriceQuote | null {
    const cacheKey = this.getPriceCacheKey(dex, pair);
    const entry = this.priceCache.get(cacheKey);

    if (!entry) {
      return null;
    }

    // Check if cache entry is still valid
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.priceCache.delete(cacheKey);
      return null;
    }

    return entry.data;
  }

  getAllLatestPrices(pair: TokenPair): Map<string, PriceQuote> {
    const prices = new Map<string, PriceQuote>();
    const pairKey = this.getPairKey(pair);

    this.priceCache.forEach((entry, cacheKey) => {
      if (cacheKey.includes(pairKey)) {
        const now = Date.now();
        if (now - entry.timestamp <= entry.ttl) {
          prices.set(entry.data.dex, entry.data);
        }
      }
    });

    return prices;
  }

  getPriceHistory(pair: TokenPair, limit?: number): PriceQuote[] {
    const historyKey = this.getPairKey(pair);
    const history = this.priceHistory.get(historyKey);

    if (!history) {
      return [];
    }

    const prices = history.prices;
    return limit ? prices.slice(-limit) : prices;
  }

  getPriceStatistics(dex: string, pair: TokenPair, timeWindow: number = 300000): {
    min: number;
    max: number;
    avg: number;
    volatility: number;
    count: number;
  } | null {
    const history = this.getPriceHistory(pair);
    const now = Date.now();
    const cutoff = now - timeWindow;

    const relevantPrices = history
      .filter(quote => quote.dex === dex && quote.timestamp >= cutoff)
      .map(quote => quote.price);

    if (relevantPrices.length === 0) {
      return null;
    }

    const min = Math.min(...relevantPrices);
    const max = Math.max(...relevantPrices);
    const avg = relevantPrices.reduce((sum, price) => sum + price, 0) / relevantPrices.length;
    
    // Calculate volatility (standard deviation)
    const variance = relevantPrices.reduce((sum, price) => sum + Math.pow(price - avg, 2), 0) / relevantPrices.length;
    const volatility = Math.sqrt(variance);

    return {
      min,
      max,
      avg,
      volatility,
      count: relevantPrices.length
    };
  }

  storeOpportunity(opportunity: ArbitrageOpportunity): void {
    this.opportunityHistory.opportunities.push(opportunity);

    // Maintain max size
    if (this.opportunityHistory.opportunities.length > this.opportunityHistory.maxSize) {
      this.opportunityHistory.opportunities = this.opportunityHistory.opportunities.slice(-this.opportunityHistory.maxSize);
    }

    logDebug('Arbitrage opportunity stored', {
      id: opportunity.id,
      pair: `${opportunity.pair.baseToken}/${opportunity.pair.quoteToken}`,
      spread: opportunity.spreadPercent.toFixed(3) + '%',
      netProfit: opportunity.netProfitPercent.toFixed(3) + '%',
      totalOpportunities: this.opportunityHistory.opportunities.length
    });
  }

  getRecentOpportunities(limit: number = 50): ArbitrageOpportunity[] {
    return this.opportunityHistory.opportunities.slice(-limit);
  }

  getOpportunitiesForPair(pair: TokenPair, limit: number = 20): ArbitrageOpportunity[] {
    const pairKey = this.getPairKey(pair);
    
    return this.opportunityHistory.opportunities
      .filter(opp => this.getPairKey(opp.pair) === pairKey)
      .slice(-limit);
  }

  getOpportunityStatistics(timeWindow: number = 3600000): {
    totalOpportunities: number;
    averageSpread: number;
    averageProfit: number;
    topPairs: Array<{ pair: string; count: number }>;
    topDEXPairs: Array<{ dexPair: string; count: number }>;
  } {
    const now = Date.now();
    const cutoff = now - timeWindow;

    const recentOpportunities = this.opportunityHistory.opportunities
      .filter(opp => opp.timestamp >= cutoff);

    if (recentOpportunities.length === 0) {
      return {
        totalOpportunities: 0,
        averageSpread: 0,
        averageProfit: 0,
        topPairs: [],
        topDEXPairs: []
      };
    }

    const averageSpread = recentOpportunities.reduce((sum, opp) => sum + opp.spreadPercent, 0) / recentOpportunities.length;
    const averageProfit = recentOpportunities.reduce((sum, opp) => sum + opp.netProfitPercent, 0) / recentOpportunities.length;

    // Count by pairs
    const pairCounts = new Map<string, number>();
    const dexPairCounts = new Map<string, number>();

    recentOpportunities.forEach(opp => {
      const pairKey = `${opp.pair.baseToken}/${opp.pair.quoteToken}`;
      const dexPairKey = `${opp.buyDex} -> ${opp.sellDex}`;

      pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
      dexPairCounts.set(dexPairKey, (dexPairCounts.get(dexPairKey) || 0) + 1);
    });

    const topPairs = Array.from(pairCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pair, count]) => ({ pair, count }));

    const topDEXPairs = Array.from(dexPairCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([dexPair, count]) => ({ dexPair, count }));

    return {
      totalOpportunities: recentOpportunities.length,
      averageSpread,
      averageProfit,
      topPairs,
      topDEXPairs
    };
  }

  exportData(): {
    timestamp: number;
    priceHistory: { [pair: string]: PriceQuote[] };
    recentOpportunities: ArbitrageOpportunity[];
    statistics: any;
  } {
    const timestamp = Date.now();
    const priceHistory: { [pair: string]: PriceQuote[] } = {};

    this.priceHistory.forEach((history, pairKey) => {
      priceHistory[pairKey] = history.prices.slice(-100); // Last 100 prices per pair
    });

    const recentOpportunities = this.getRecentOpportunities(100);
    const statistics = this.getOpportunityStatistics();

    return {
      timestamp,
      priceHistory,
      recentOpportunities,
      statistics
    };
  }

  getCacheStats(): {
    priceCacheSize: number;
    priceHistorySize: number;
    opportunityHistorySize: number;
    totalMemoryUsage: string;
  } {
    let priceHistorySize = 0;
    this.priceHistory.forEach(history => {
      priceHistorySize += history.prices.length;
    });

    // Estimate memory usage (rough calculation)
    const avgPriceSize = 200; // bytes per price quote
    const avgOpportunitySize = 500; // bytes per opportunity
    const estimatedBytes = (this.priceCache.size * avgPriceSize) + 
                          (priceHistorySize * avgPriceSize) + 
                          (this.opportunityHistory.opportunities.length * avgOpportunitySize);

    return {
      priceCacheSize: this.priceCache.size,
      priceHistorySize,
      opportunityHistorySize: this.opportunityHistory.opportunities.length,
      totalMemoryUsage: `${(estimatedBytes / 1024 / 1024).toFixed(2)} MB`
    };
  }

  private getPriceCacheKey(dex: string, pair: TokenPair): string {
    return `${dex}:${pair.baseMint}:${pair.quoteMint}`;
  }

  private getPairKey(pair: TokenPair): string {
    return `${pair.baseMint}:${pair.quoteMint}`;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanedCache = 0;

    // Clean expired cache entries
    this.priceCache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        this.priceCache.delete(key);
        cleanedCache++;
      }
    });

    // Clean old price history (keep only recent data)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    this.priceHistory.forEach(history => {
      const cutoff = now - maxAge;
      history.prices = history.prices.filter(quote => quote.timestamp >= cutoff);
    });

    // Clean old opportunities
    const opportunityCutoff = now - (24 * 60 * 60 * 1000); // 24 hours
    this.opportunityHistory.opportunities = this.opportunityHistory.opportunities
      .filter(opp => opp.timestamp >= opportunityCutoff);

    if (cleanedCache > 0) {
      logDebug('Cache cleanup completed', {
        cleanedCacheEntries: cleanedCache,
        remainingCacheSize: this.priceCache.size
      });
    }
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    logInfo('Data Manager shutdown', {
      finalCacheSize: this.priceCache.size,
      finalOpportunityCount: this.opportunityHistory.opportunities.length
    });
  }
}
