import { DEXInterface, TokenPair, PriceQuote } from '../types';
import { ConnectionManager } from '../utils/connection';
import { RaydiumDEX } from './raydium';
import { OrcaDEX } from './orca';
import { SerumDEX } from './serum';
import { config } from '../config';
import { logger, logError, logInfo } from '../utils/logger';

export class DEXManager {
  private dexes: Map<string, DEXInterface> = new Map();
  private connectionManager: ConnectionManager;

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
    this.initializeDEXes();
  }

  private initializeDEXes(): void {
    // Initialize Raydium
    if (config.dex.enableRaydium) {
      const raydiumDEX = new RaydiumDEX(this.connectionManager);
      this.dexes.set('Raydium', raydiumDEX);
    }

    // Initialize Orca
    if (config.dex.enableOrca) {
      const orcaDEX = new OrcaDEX(this.connectionManager);
      this.dexes.set('Orca', orcaDEX);
    }

    // Initialize Serum
    if (config.dex.enableSerum) {
      const serumDEX = new SerumDEX(this.connectionManager);
      this.dexes.set('Serum', serumDEX);
    }

    logInfo('DEX Manager initialized', {
      enabledDEXes: Array.from(this.dexes.keys())
    });
  }

  async initializeAll(): Promise<void> {
    logInfo('Initializing all DEX integrations');

    const initPromises = Array.from(this.dexes.values()).map(async (dex) => {
      try {
        await dex.initialize();
        logInfo(`${dex.name} DEX initialized successfully`);
      } catch (error) {
        logError(`Failed to initialize ${dex.name} DEX`, error as Error);
        dex.isEnabled = false;
      }
    });

    await Promise.allSettled(initPromises);

    const enabledDEXes = Array.from(this.dexes.values())
      .filter(dex => dex.isEnabled)
      .map(dex => dex.name);

    logInfo('DEX initialization complete', {
      enabledDEXes,
      totalEnabled: enabledDEXes.length
    });
  }

  async fetchAllPrices(pair: TokenPair): Promise<Map<string, PriceQuote>> {
    const prices = new Map<string, PriceQuote>();

    const fetchPromises = Array.from(this.dexes.entries()).map(async ([name, dex]) => {
      if (!dex.isEnabled) {
        return;
      }

      try {
        const quote = await dex.fetchPrice(pair);
        if (quote) {
          prices.set(name, quote);
        }
      } catch (error) {
        logError(`Failed to fetch price from ${name}`, error as Error, {
          pair: `${pair.baseToken}/${pair.quoteToken}`
        });
      }
    });

    await Promise.allSettled(fetchPromises);
    return prices;
  }

  subscribeToAllUpdates(pair: TokenPair, callback: (dexName: string, quote: PriceQuote) => void): void {
    Array.from(this.dexes.entries()).forEach(([name, dex]) => {
      if (dex.isEnabled) {
        dex.subscribeToUpdates(pair, (quote) => {
          callback(name, quote);
        });
      }
    });

    logInfo('Subscribed to all DEX updates', {
      pair: `${pair.baseToken}/${pair.quoteToken}`,
      subscribedDEXes: Array.from(this.dexes.keys()).filter(name => this.dexes.get(name)?.isEnabled)
    });
  }

  unsubscribeFromAll(pair: TokenPair): void {
    Array.from(this.dexes.values()).forEach(dex => {
      if (dex.isEnabled) {
        dex.unsubscribe(pair);
      }
    });

    logInfo('Unsubscribed from all DEX updates', {
      pair: `${pair.baseToken}/${pair.quoteToken}`
    });
  }

  getDEX(name: string): DEXInterface | undefined {
    return this.dexes.get(name);
  }

  getEnabledDEXes(): string[] {
    return Array.from(this.dexes.entries())
      .filter(([_, dex]) => dex.isEnabled)
      .map(([name, _]) => name);
  }

  getHealthStatus(): { [dexName: string]: boolean } {
    const status: { [dexName: string]: boolean } = {};
    
    this.dexes.forEach((dex, name) => {
      status[name] = dex.isEnabled;
    });

    return status;
  }

  async getBestPrice(pair: TokenPair, side: 'buy' | 'sell'): Promise<{ dex: string; quote: PriceQuote } | null> {
    const allPrices = await this.fetchAllPrices(pair);
    
    if (allPrices.size === 0) {
      return null;
    }

    let bestDex = '';
    let bestQuote: PriceQuote | null = null;
    let bestPrice = side === 'buy' ? Infinity : -Infinity;

    allPrices.forEach((quote, dexName) => {
      const price = side === 'buy' ? (quote.ask || quote.price) : (quote.bid || quote.price);
      
      if (side === 'buy' && price < bestPrice) {
        bestPrice = price;
        bestDex = dexName;
        bestQuote = quote;
      } else if (side === 'sell' && price > bestPrice) {
        bestPrice = price;
        bestDex = dexName;
        bestQuote = quote;
      }
    });

    return bestQuote ? { dex: bestDex, quote: bestQuote } : null;
  }
}
