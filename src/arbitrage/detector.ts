import { ArbitrageOpportunity, TokenPair, PriceQuote } from '../types';
import { config, SOLANA_FEE_SOL } from '../config';
import { logger, logDebug, opportunityLogger } from '../utils/logger';
import { TableFormatter } from '../utils/table';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';

export class ArbitrageDetector {
  private profitThreshold: number;
  private tradeSize: number;
  private recentOpportunities: Map<string, number> = new Map();

  constructor() {
    this.profitThreshold = config.arbitrage.profitThresholdPercent;
    this.tradeSize = config.arbitrage.tradeSizeUsdc;
  }

  detectOpportunities(
    pair: TokenPair, 
    priceQuotes: Map<string, PriceQuote>
  ): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];
    const dexNames = Array.from(priceQuotes.keys());

    for (let i = 0; i < dexNames.length; i++) {
      for (let j = i + 1; j < dexNames.length; j++) {
        const buyDex = dexNames[i];
        const sellDex = dexNames[j];
        
        const buyQuote = priceQuotes.get(buyDex);
        const sellQuote = priceQuotes.get(sellDex);

        if (!buyQuote || !sellQuote) {
          continue;
        }

        const opportunity1 = this.calculateArbitrage(pair, buyDex, sellDex, buyQuote, sellQuote);
        const opportunity2 = this.calculateArbitrage(pair, sellDex, buyDex, sellQuote, buyQuote);

        if (opportunity1) {
          opportunities.push(opportunity1);
        }
        if (opportunity2) {
          opportunities.push(opportunity2);
        }
      }
    }

    // Filter opportunities by profitability and rate limiting
    return opportunities.filter(opp => this.shouldReportOpportunity(opp));
  }

  private calculateArbitrage(
    pair: TokenPair,
    buyDex: string,
    sellDex: string,
    buyQuote: PriceQuote,
    sellQuote: PriceQuote
  ): ArbitrageOpportunity | null {
    try {
      const buyPrice = this.getEffectiveBuyPrice(buyQuote);
      const sellPrice = this.getEffectiveSellPrice(sellQuote);

      if (sellPrice <= buyPrice) {
        return null;
      }

      const spread = sellPrice - buyPrice;
      const spreadPercent = (spread / buyPrice) * 100;

      const tradeSize = this.tradeSize;
      const baseTokenAmount = tradeSize / buyPrice;
      const grossProfit = baseTokenAmount * spread;

      const estimatedFees = this.estimateTransactionFees(pair, tradeSize);
      const netProfit = grossProfit - estimatedFees;
      const netProfitPercent = (netProfit / tradeSize) * 100;

      const confidence = this.calculateConfidence(buyQuote, sellQuote, tradeSize);

      const opportunity: ArbitrageOpportunity = {
        id: uuidv4(),
        pair,
        buyDex,
        sellDex,
        buyPrice,
        sellPrice,
        spread,
        spreadPercent,
        grossProfit,
        estimatedFees,
        netProfit,
        netProfitPercent,
        tradeSize,
        timestamp: Date.now(),
        confidence
      };

      logDebug('Arbitrage opportunity calculated', {
        buyDex,
        sellDex,
        spreadPercent: spreadPercent.toFixed(3) + '%',
        netProfitPercent: netProfitPercent.toFixed(3) + '%',
        confidence: confidence.toFixed(2)
      });

      return opportunity;

    } catch (error) {
      logger.error('Error calculating arbitrage opportunity', {
        error: error instanceof Error ? error.message : 'Unknown error',
        buyDex,
        sellDex,
        pair: `${pair.baseToken}/${pair.quoteToken}`
      });
      return null;
    }
  }

  private getEffectiveBuyPrice(quote: PriceQuote): number {
    const basePrice = quote.ask || quote.price;
    // Apply slippage impact based on trade size vs liquidity
    const slippagePercent = this.calculateSlippage(quote, 'buy');
    return basePrice * (1 + slippagePercent / 100);
  }

  private getEffectiveSellPrice(quote: PriceQuote): number {
    const basePrice = quote.bid || quote.price;
    // Apply slippage impact based on trade size vs liquidity
    const slippagePercent = this.calculateSlippage(quote, 'sell');
    return basePrice * (1 - slippagePercent / 100);
  }

  private calculateSlippage(quote: PriceQuote, side: 'buy' | 'sell'): number {
    const tradeSizeRatio = this.tradeSize / quote.liquidity;
    
    // Base slippage model - increases with trade size relative to liquidity
    let baseSlippage = 0;
    
    if (tradeSizeRatio <= 0.001) {       // < 0.1% of liquidity
      baseSlippage = 0.01;               // 0.01% slippage
    } else if (tradeSizeRatio <= 0.005) { // < 0.5% of liquidity
      baseSlippage = 0.05;               // 0.05% slippage
    } else if (tradeSizeRatio <= 0.01) {  // < 1% of liquidity
      baseSlippage = 0.1;                // 0.1% slippage
    } else if (tradeSizeRatio <= 0.05) {  // < 5% of liquidity
      baseSlippage = 0.3;                // 0.3% slippage
    } else {
      baseSlippage = Math.min(2.0, tradeSizeRatio * 10); // Exponential increase, max 2%
    }

    // Add volatility adjustment (simplified)
    const volatilityMultiplier = 1.2; // 20% increase for market volatility
    
    return baseSlippage * volatilityMultiplier;
  }

  private estimateTransactionFees(pair: TokenPair, tradeSize: number): number {
    // 1. Solana network fees (multiple transactions needed)
    const solanaFees = this.calculateSolanaFees();

    // 2. DEX-specific trading fees
    const dexFees = this.calculateDexFees(tradeSize);

    // 3. Priority fees (for faster execution)
    const priorityFees = this.calculatePriorityFees();

    // 4. Account rent fees (for temporary accounts)
    const rentFees = this.calculateRentFees();

    // 5. Bridge/wrapper fees (if using wrapped tokens)
    const wrapperFees = this.calculateWrapperFees(pair, tradeSize);

    // 6. Failed transaction costs (realistic expectation)
    const failedTxCosts = this.calculateFailedTransactionCosts();

    // 7. Execution timing buffer (price movement risk)
    const timingBuffer = this.calculateExecutionTimingBuffer(tradeSize);

    const totalFees = solanaFees + dexFees + priorityFees + rentFees + wrapperFees + failedTxCosts + timingBuffer;

    logDebug('Comprehensive transaction fees estimated', {
      solanaFees: solanaFees.toFixed(4),
      dexFees: dexFees.toFixed(4),
      priorityFees: priorityFees.toFixed(4),
      rentFees: rentFees.toFixed(4),
      wrapperFees: wrapperFees.toFixed(4),
      failedTxCosts: failedTxCosts.toFixed(4),
      timingBuffer: timingBuffer.toFixed(4),
      totalFeesUsd: totalFees.toFixed(4),
      tradeSizeUsd: tradeSize,
      feePercentage: ((totalFees / tradeSize) * 100).toFixed(3) + '%'
    });

    return totalFees;
  }

  private calculateFailedTransactionCosts(): number {
    // In arbitrage, some transactions fail due to:
    // - Price movements before execution
    // - Insufficient liquidity when executed
    // - Network congestion causing timeouts
    // - MEV frontrunning
    
    const failureRate = 0.15; // 15% of arbitrage attempts fail
    const avgFailedTxCost = 0.002; // SOL per failed transaction
    const avgFailedTxCount = 2; // Average failed txs per attempt
    const solPriceUsd = 150;
    
    return failureRate * avgFailedTxCount * avgFailedTxCost * solPriceUsd;
  }

  private calculateExecutionTimingBuffer(tradeSize: number): number {
    // Buffer for potential price movements during execution
    // Arbitrage execution typically takes 10-30 seconds
    
    // Base timing risk (price can move 0.1% in 30 seconds)
    const timingRiskPercent = 0.001; // 0.1%
    
    // Volatility multiplier based on market conditions
    const volatilityMultiplier = this.getMarketVolatilityMultiplier();
    
    return tradeSize * timingRiskPercent * volatilityMultiplier;
  }

  private getMarketVolatilityMultiplier(): number {
    // In production, this would analyze recent price volatility
    // For now, we use time-based estimation
    const hour = new Date().getHours();
    
    // Higher volatility during market open/close times
    if ((hour >= 13 && hour <= 15) || (hour >= 20 && hour <= 22)) { // Market events
      return 3.0; // 3x during high volatility
    } else if (hour >= 8 && hour <= 20) { // Trading hours
      return 2.0; // 2x during active trading
    } else {
      return 1.0; // Normal volatility
    }
  }

  private calculateSolanaFees(): number {
    // Arbitrage typically requires 4-6 transactions:
    // 1. Setup accounts (if needed)
    // 2. Buy transaction on DEX 1
    // 3. Transfer tokens (if needed)
    // 4. Sell transaction on DEX 2
    // 5. Cleanup accounts (if needed)
    // 6. Close temporary accounts (if needed)
    
    const transactionCount = 4; // Conservative estimate
    const solanaFees = SOLANA_FEE_SOL * transactionCount;
    
    // Convert SOL fees to USD (should fetch real price)
    const solPriceUsd = 150; // Conservative SOL price estimate
    return solanaFees * solPriceUsd;
  }

  private calculateDexFees(tradeSize: number): number {
    // Different DEXes have different fee structures
    const dexFeeStructure = {
      'Raydium': 0.0025,    // 0.25%
      'Orca': 0.003,        // 0.30%
      'Serum': 0.0022,      // 0.22%
    };

    // Use average fee rate for estimation
    const avgFeePercent = 0.0026; // 0.26% average
    return tradeSize * avgFeePercent * 2; // Buy + Sell
  }

  private calculatePriorityFees(): number {
    // Priority fees to ensure transactions are processed quickly
    // Critical for arbitrage to avoid price movements
    
    // Base priority fee
    const basePriorityFeePerTx = 0.001; // SOL per transaction
    
    // MEV protection premium - higher fees to compete with MEV bots
    const mevProtectionMultiplier = 2.5; // 2.5x to outbid MEV
    
    // Network congestion factor (simplified)
    const congestionMultiplier = this.getNetworkCongestionMultiplier();
    
    const priorityFeePerTx = basePriorityFeePerTx * mevProtectionMultiplier * congestionMultiplier;
    const transactionCount = 4;
    const solPriceUsd = 150;
    
    return priorityFeePerTx * transactionCount * solPriceUsd;
  }

  private getNetworkCongestionMultiplier(): number {
    // In production, this would check real-time network metrics
    // For now, we simulate typical congestion patterns
    const hour = new Date().getHours();
    
    // Higher congestion during US/EU trading hours
    if ((hour >= 13 && hour <= 21)) { // UTC 13-21 = peak trading
      return 2.0; // 2x during peak hours
    } else if ((hour >= 8 && hour <= 13) || (hour >= 21 && hour <= 24)) {
      return 1.5; // 1.5x during moderate hours
    } else {
      return 1.0; // Normal fees during off-peak
    }
  }

  private calculateRentFees(): number {
    // Rent for temporary accounts (e.g., token accounts, program accounts)
    // Most will be closed and rent recovered, but some may be needed temporarily
    const tempAccountCount = 2;
    const rentPerAccount = 0.002; // SOL per account
    const solPriceUsd = 150;
    
    return tempAccountCount * rentPerAccount * solPriceUsd;
  }

  private calculateWrapperFees(pair: TokenPair, tradeSize: number): number {
    // Some tokens require wrapping/unwrapping (e.g., SOL <-> wSOL)
    // or bridging between different token standards
    const requiresWrapping = pair.baseToken === 'SOL' || pair.quoteToken === 'SOL';
    
    if (requiresWrapping) {
      return tradeSize * 0.0001; // 0.01% for wrapping operations
    }
    
    return 0;
  }

  private calculateConfidence(
    buyQuote: PriceQuote,
    sellQuote: PriceQuote,
    tradeSize: number
  ): number {
    let confidence = 1.0;

    // 1. Quote freshness - critical for arbitrage execution
    const now = Date.now();
    const buyAge = now - buyQuote.timestamp;
    const sellAge = now - sellQuote.timestamp;
    const maxAge = 15000; // 15 seconds - stricter for arbitrage
    const warningAge = 5000; // 5 seconds

    if (buyAge > maxAge || sellAge > maxAge) {
      confidence *= 0.5; // Significantly reduce for stale data
    } else if (buyAge > warningAge || sellAge > warningAge) {
      confidence *= 0.8; // Moderate reduction for older data
    }

    // 2. Liquidity adequacy - ensure we can execute the trade
    const safetyMultiplier = 3; // Need 3x trade size for safe execution
    const minLiquidity = tradeSize * safetyMultiplier;
    
    if (buyQuote.liquidity < minLiquidity || sellQuote.liquidity < minLiquidity) {
      const buyRatio = buyQuote.liquidity / minLiquidity;
      const sellRatio = sellQuote.liquidity / minLiquidity;
      const worstRatio = Math.min(buyRatio, sellRatio);
      confidence *= Math.max(0.3, worstRatio); // Scale confidence with liquidity
    }

    // 3. Slippage impact - higher slippage reduces confidence
    const buySlippage = this.calculateSlippage(buyQuote, 'buy');
    const sellSlippage = this.calculateSlippage(sellQuote, 'sell');
    const totalSlippage = buySlippage + sellSlippage;
    
    if (totalSlippage > 1.0) { // > 1% total slippage
      confidence *= 0.6;
    } else if (totalSlippage > 0.5) { // > 0.5% total slippage
      confidence *= 0.8;
    }

    // 4. Orderbook depth (if available) - better for execution
    if (buyQuote.ask && buyQuote.bid && sellQuote.ask && sellQuote.bid) {
      const buySpread = ((buyQuote.ask - buyQuote.bid) / buyQuote.price) * 100;
      const sellSpread = ((sellQuote.ask - sellQuote.bid) / sellQuote.price) * 100;
      
      if (buySpread < 0.1 && sellSpread < 0.1) { // Tight spreads
        confidence *= 1.15; // Bonus for tight spreads
      } else if (buySpread > 0.5 || sellSpread > 0.5) { // Wide spreads
        confidence *= 0.85; // Penalty for wide spreads
      }
    } else {
      confidence *= 0.9; // Slight penalty for lacking orderbook data
    }

    // 5. DEX reliability factor
    const dexReliability = this.getDexReliabilityScore(buyQuote.dex, sellQuote.dex);
    confidence *= dexReliability;

    // 6. Market volatility consideration
    const volatilityPenalty = this.getVolatilityPenalty();
    confidence *= volatilityPenalty;

    // 7. MEV resistance assessment
    const mevResistance = this.calculateMevResistance(tradeSize, totalSlippage);
    confidence *= mevResistance;

    // 8. Execution success probability
    const executionProbability = this.calculateExecutionProbability(buyQuote, sellQuote);
    confidence *= executionProbability;

    // Ensure confidence stays within bounds
    confidence = Math.max(0.1, Math.min(1.0, confidence));

    logDebug('Confidence calculation details', {
      initialConfidence: 1.0,
      quoteAgeReduction: (buyAge > warningAge || sellAge > warningAge) ? 'applied' : 'none',
      liquidityAdequate: (buyQuote.liquidity >= minLiquidity && sellQuote.liquidity >= minLiquidity),
      totalSlippage: totalSlippage.toFixed(3) + '%',
      hasOrderbookData: !!(buyQuote.ask && sellQuote.ask),
      dexReliability: dexReliability.toFixed(2),
      mevResistance: mevResistance.toFixed(2),
      executionProbability: executionProbability.toFixed(2),
      finalConfidence: confidence.toFixed(3)
    });

    return confidence;
  }

  private calculateMevResistance(tradeSize: number, totalSlippage: number): number {
    let mevResistance = 1.0;

    // Large trades are more likely to be frontrun
    if (tradeSize > 10000) { // > $10K
      mevResistance *= 0.7; // 30% penalty for large trades
    } else if (tradeSize > 1000) { // > $1K
      mevResistance *= 0.85; // 15% penalty for medium trades
    }

    // High slippage trades are more attractive to MEV bots
    if (totalSlippage > 1.0) { // > 1% slippage
      mevResistance *= 0.6; // 40% penalty for high slippage
    } else if (totalSlippage > 0.5) { // > 0.5% slippage
      mevResistance *= 0.8; // 20% penalty for medium slippage
    }

    // Time-based MEV risk (higher during active trading)
    const hour = new Date().getHours();
    if (hour >= 13 && hour <= 21) { // Peak MEV activity
      mevResistance *= 0.85; // 15% penalty during peak hours
    }

    return Math.max(0.3, mevResistance); // Minimum 30% MEV resistance
  }

  private calculateExecutionProbability(buyQuote: PriceQuote, sellQuote: PriceQuote): number {
    let probability = 1.0;

    // Network congestion affects execution success
    const congestionMultiplier = this.getNetworkCongestionMultiplier();
    if (congestionMultiplier > 1.5) {
      probability *= 0.8; // 20% penalty for high congestion
    }

    // Quote freshness affects execution probability
    const now = Date.now();
    const avgAge = ((now - buyQuote.timestamp) + (now - sellQuote.timestamp)) / 2;
    if (avgAge > 10000) { // > 10 seconds old
      probability *= 0.7; // 30% penalty for stale quotes
    } else if (avgAge > 5000) { // > 5 seconds old
      probability *= 0.9; // 10% penalty for old quotes
    }

    // Market volatility affects execution success
    const volatilityMultiplier = this.getMarketVolatilityMultiplier();
    if (volatilityMultiplier > 2.0) {
      probability *= 0.75; // 25% penalty for high volatility
    }

    return Math.max(0.4, probability); // Minimum 40% execution probability
  }

  private getDexReliabilityScore(buyDex: string, sellDex: string): number {
    const dexScores = {
      'Raydium': 0.95,  // High reliability
      'Orca': 0.93,     // High reliability  
      'Serum': 0.90,    // Good reliability
    };

    const buyScore = dexScores[buyDex as keyof typeof dexScores] || 0.80;
    const sellScore = dexScores[sellDex as keyof typeof dexScores] || 0.80;
    
    return (buyScore + sellScore) / 2;
  }

  private getVolatilityPenalty(): number {
    // In a production system, this would analyze recent price movements
    // For now, we apply a conservative penalty for market volatility
    return 0.95; // 5% penalty for general market volatility
  }

  private shouldReportOpportunity(opportunity: ArbitrageOpportunity): boolean {
    // Check profit threshold
    if (opportunity.netProfitPercent < this.profitThreshold) {
      return false;
    }

    // Check confidence threshold
    if (opportunity.confidence < 0.6) {
      return false;
    }

    // Rate limiting - don't report the same opportunity type too frequently
    const opportunityKey = `${opportunity.pair.baseToken}-${opportunity.pair.quoteToken}-${opportunity.buyDex}-${opportunity.sellDex}`;
    const lastReported = this.recentOpportunities.get(opportunityKey) || 0;
    const now = Date.now();
    
    if (now - lastReported < 30000) { // 30 seconds cooldown
      return false;
    }

    this.recentOpportunities.set(opportunityKey, now);
    
    // Clean up old entries
    this.cleanupRecentOpportunities();

    return true;
  }

  private cleanupRecentOpportunities(): void {
    const now = Date.now();
    const cutoff = now - 300000; // 5 minutes

    for (const [key, timestamp] of this.recentOpportunities.entries()) {
      if (timestamp < cutoff) {
        this.recentOpportunities.delete(key);
      }
    }
  }

  processOpportunities(opportunities: ArbitrageOpportunity[]): void {
    opportunities.forEach(opportunity => {
      // Display beautiful table alert for each opportunity
      TableFormatter.displayOpportunityAlert(opportunity);

      // Log the opportunity
      opportunityLogger.logOpportunity(opportunity);

      // Here you could add additional processing:
      // - Send alerts
      // - Execute trades (in a real trading bot)
      // - Store in database
      // - Send webhook notifications
    });
  }

  updateConfig(newConfig: { profitThreshold?: number; tradeSize?: number }): void {
    if (newConfig.profitThreshold !== undefined) {
      this.profitThreshold = newConfig.profitThreshold;
    }
    if (newConfig.tradeSize !== undefined) {
      this.tradeSize = newConfig.tradeSize;
    }

    logger.info('Arbitrage detector configuration updated', {
      profitThreshold: this.profitThreshold,
      tradeSize: this.tradeSize
    });
  }

  getStats(): {
    profitThreshold: number;
    tradeSize: number;
    recentOpportunitiesCount: number;
  } {
    return {
      profitThreshold: this.profitThreshold,
      tradeSize: this.tradeSize,
      recentOpportunitiesCount: this.recentOpportunities.size
    };
  }
}
