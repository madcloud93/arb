import { TokenPair, PriceQuote } from '../types';
import { ConnectionManager } from '../utils/connection';
import { DEXManager } from '../dex/manager';
import { ArbitrageDetector } from '../arbitrage/detector';
import { DataManager } from '../data/manager';
import { OpportunityTracker } from '../data/tracker';
import { TableFormatter } from '../utils/table';
import { config, COMMON_PAIRS } from '../config';
import { logger, logInfo, logError, logWarning } from '../utils/logger';

export class RealTimeMonitor {
  private connectionManager: ConnectionManager;
  private dexManager: DEXManager;
  private arbitrageDetector: ArbitrageDetector;
  private dataManager: DataManager;
  private opportunityTracker: OpportunityTracker;
  
  private isRunning = false;
  private monitoredPairs: TokenPair[] = [];
  private slotSubscription: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private priceUpdateInterval: NodeJS.Timeout | null = null;
  private summaryDisplayInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.connectionManager = new ConnectionManager();
    this.dexManager = new DEXManager(this.connectionManager);
    this.arbitrageDetector = new ArbitrageDetector();
    this.dataManager = new DataManager();
    this.opportunityTracker = new OpportunityTracker();
  }

  async start(): Promise<void> {
    try {
      logInfo('Starting FlashSol arbitrage monitoring system...');

      // Initialize all components
      await this.initializeComponents();

      // Set up monitoring for common pairs
      this.setupMonitoring();

      // Start real-time subscriptions
      this.startRealTimeUpdates();

      // Start health monitoring
      this.startHealthMonitoring();

      // Start periodic summary display
      this.startSummaryDisplay();

      this.isRunning = true;
      logInfo('FlashSol arbitrage monitoring system started successfully', {
        monitoredPairs: this.monitoredPairs.length,
        enabledDEXes: this.dexManager.getEnabledDEXes()
      });

    } catch (error) {
      logError('Failed to start monitoring system', error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logInfo('Stopping FlashSol arbitrage monitoring system...');
    
    this.isRunning = false;

    // Stop summary display
    if (this.summaryDisplayInterval) {
      clearInterval(this.summaryDisplayInterval);
      this.summaryDisplayInterval = null;
    }

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Stop price update interval
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }

    // Unsubscribe from all pairs
    this.monitoredPairs.forEach(pair => {
      this.dexManager.unsubscribeFromAll(pair);
    });

    // Close connections
    this.connectionManager.close();
    this.dataManager.shutdown();

    // Generate final report
    this.opportunityTracker.generateSummaryReport();

    logInfo('FlashSol arbitrage monitoring system stopped');
  }

  addPairToMonitor(pair: TokenPair): void {
    if (this.isPairMonitored(pair)) {
      logWarning('Pair already being monitored', {
        pair: `${pair.baseToken}/${pair.quoteToken}`
      });
      return;
    }

    this.monitoredPairs.push(pair);

    if (this.isRunning) {
      this.setupPairMonitoring(pair);
    }

    logInfo('Added pair to monitoring', {
      pair: `${pair.baseToken}/${pair.quoteToken}`,
      totalPairs: this.monitoredPairs.length
    });
  }

  removePairFromMonitor(pair: TokenPair): void {
    const index = this.monitoredPairs.findIndex(p => 
      p.baseMint === pair.baseMint && p.quoteMint === pair.quoteMint
    );

    if (index === -1) {
      logWarning('Pair not found in monitoring list', {
        pair: `${pair.baseToken}/${pair.quoteToken}`
      });
      return;
    }

    this.monitoredPairs.splice(index, 1);
    this.dexManager.unsubscribeFromAll(pair);

    logInfo('Removed pair from monitoring', {
      pair: `${pair.baseToken}/${pair.quoteToken}`,
      totalPairs: this.monitoredPairs.length
    });
  }

  getStatus(): {
    isRunning: boolean;
    monitoredPairs: number;
    enabledDEXes: string[];
    connectionHealth: any;
    recentOpportunities: number;
    cacheStats: any;
  } {
    return {
      isRunning: this.isRunning,
      monitoredPairs: this.monitoredPairs.length,
      enabledDEXes: this.dexManager.getEnabledDEXes(),
      connectionHealth: {},
      recentOpportunities: this.opportunityTracker.getRealtimeStats().totalOpportunities,
      cacheStats: this.dataManager.getCacheStats()
    };
  }

  private async initializeComponents(): Promise<void> {
    logInfo('Initializing system components...');

    // Initialize DEX integrations
    await this.dexManager.initializeAll();

    logInfo('System components initialized successfully');
  }

  private setupMonitoring(): void {
    // Add common pairs to monitoring
    COMMON_PAIRS.forEach(pair => {
      this.monitoredPairs.push(pair);
    });

    // Set up monitoring for each pair
    this.monitoredPairs.forEach(pair => {
      this.setupPairMonitoring(pair);
    });

    logInfo('Set up monitoring for token pairs', {
      pairCount: this.monitoredPairs.length,
      pairs: this.monitoredPairs.map(p => `${p.baseToken}/${p.quoteToken}`)
    });
  }

  private setupPairMonitoring(pair: TokenPair): void {
    // Subscribe to price updates from all DEXes
    this.dexManager.subscribeToAllUpdates(pair, (dexName: string, quote: PriceQuote) => {
      this.handlePriceUpdate(dexName, quote);
    });
  }

  private startRealTimeUpdates(): void {
    // Subscribe to Solana slot updates for synchronization
    this.connectionManager.subscribeToSlots((slot: number) => {
      this.handleSlotUpdate(slot);
    });

    this.slotSubscription = true;

    // Set up periodic price refresh (fallback mechanism)
    this.priceUpdateInterval = setInterval(() => {
      this.refreshAllPrices();
    }, 10000); // Every 10 seconds

    logInfo('Real-time updates started');
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, config.monitoring.healthCheckIntervalMs);

    logInfo('Health monitoring started');
  }

  private handlePriceUpdate(dexName: string, quote: PriceQuote): void {
    // Store the price update
    this.dataManager.storePriceQuote(quote);

    // Get all current prices for this pair
    const allPrices = this.dataManager.getAllLatestPrices(quote.pair);

    // Skip arbitrage detection if we don't have enough price data
    if (allPrices.size < 2) {
      return;
    }

    // Detect arbitrage opportunities
    const opportunities = this.arbitrageDetector.detectOpportunities(quote.pair, allPrices);

    // Process and track opportunities
    opportunities.forEach(opportunity => {
      this.dataManager.storeOpportunity(opportunity);
      this.opportunityTracker.trackOpportunity(opportunity, true, 'Real-time detection');
    });

    // Process opportunities (logging, etc.)
    this.arbitrageDetector.processOpportunities(opportunities);
  }

  private handleSlotUpdate(slot: number): void {
    // Use slot updates to trigger periodic data refresh
    // This ensures we stay synchronized with the blockchain
    
    // Every 10 slots (~4 seconds), refresh prices for active monitoring
    if (slot % 10 === 0) {
      // Trigger a price refresh for all monitored pairs
      setImmediate(() => {
        this.refreshSelectedPrices();
      });
    }

    // Every 100 slots (~40 seconds), generate summary report
    if (slot % 100 === 0) {
      setImmediate(() => {
        this.opportunityTracker.generateSummaryReport();
      });
    }
  }

  private async refreshAllPrices(): Promise<void> {
    for (const pair of this.monitoredPairs) {
      try {
        const prices = await this.dexManager.fetchAllPrices(pair);
        
        // Store all fetched prices
        prices.forEach((quote, dexName) => {
          this.dataManager.storePriceQuote(quote);
        });

        // Detect arbitrage opportunities
        if (prices.size >= 2) {
          const opportunities = this.arbitrageDetector.detectOpportunities(pair, prices);
          opportunities.forEach(opportunity => {
            this.dataManager.storeOpportunity(opportunity);
            this.opportunityTracker.trackOpportunity(opportunity, true, 'Periodic refresh');
          });
        }

      } catch (error) {
        logError('Failed to refresh prices for pair', error as Error, {
          pair: `${pair.baseToken}/${pair.quoteToken}`
        });
      }
    }
  }

  private async refreshSelectedPrices(): Promise<void> {
    // Only refresh prices for pairs that haven't been updated recently
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds

    for (const pair of this.monitoredPairs) {
      const latestPrices = this.dataManager.getAllLatestPrices(pair);
      
      // Check if any prices are stale
      let hasStaleData = false;
      latestPrices.forEach(quote => {
        if (now - quote.timestamp > staleThreshold) {
          hasStaleData = true;
        }
      });

      if (hasStaleData || latestPrices.size < 2) {
        try {
          const prices = await this.dexManager.fetchAllPrices(pair);
          prices.forEach(quote => {
            this.dataManager.storePriceQuote(quote);
          });
        } catch (error) {
          logError('Failed to refresh stale prices', error as Error, {
            pair: `${pair.baseToken}/${pair.quoteToken}`
          });
        }
      }
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Check connection health
      const connectionHealth = await this.connectionManager.checkHealth();
      
      // Check DEX health
      const dexHealth = this.dexManager.getHealthStatus();
      
      // Get system stats
      const cacheStats = this.dataManager.getCacheStats();
      const realtimeStats = this.opportunityTracker.getRealtimeStats();

      const healthReport = {
        timestamp: new Date().toISOString(),
        connections: connectionHealth,
        dexes: dexHealth,
        cache: cacheStats,
        opportunities: realtimeStats,
        monitoredPairs: this.monitoredPairs.length
      };

      logger.debug('Health check completed', healthReport);

      // Log warnings if there are issues
      if (!connectionHealth.rpc) {
        logWarning('RPC connection unhealthy');
      }
      if (!connectionHealth.websocket) {
        logWarning('WebSocket connection unhealthy');
      }

      const unhealthyDEXes = Object.entries(dexHealth)
        .filter(([_, isHealthy]) => !isHealthy)
        .map(([name, _]) => name);

      if (unhealthyDEXes.length > 0) {
        logWarning('Some DEXes are unhealthy', { unhealthyDEXes });
      }

    } catch (error) {
      logError('Health check failed', error as Error);
    }
  }

  private startSummaryDisplay(): void {
    // Display recent opportunities summary every 2 minutes
    this.summaryDisplayInterval = setInterval(() => {
      this.displayRecentOpportunitiesSummary();
    }, 120000); // Every 2 minutes

    logInfo('Summary display started');
  }

  private displayRecentOpportunitiesSummary(): void {
    try {
      // Get recent opportunities from tracker
      const recentOpportunities = this.opportunityTracker.getRecentOpportunities(10);
      
      if (recentOpportunities.length > 0) {
        console.log('\n'); // Add spacing
        TableFormatter.displayOpportunities(recentOpportunities, { 
          showHeader: true, 
          maxRows: 10,
          compact: false 
        });
      }
    } catch (error) {
      logError('Failed to display opportunities summary', error as Error);
    }
  }

  private isPairMonitored(pair: TokenPair): boolean {
    return this.monitoredPairs.some(p => 
      p.baseMint === pair.baseMint && p.quoteMint === pair.quoteMint
    );
  }
}
