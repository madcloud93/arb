import * as fs from 'fs';
import * as path from 'path';
import { ArbitrageOpportunity } from '../types';
import { config } from '../config';
import { logger, logInfo, logError } from '../utils/logger';

interface OpportunityReport {
  timestamp: number;
  opportunity: ArbitrageOpportunity;
  metadata: {
    reported: boolean;
    reportingReason?: string;
    skipReason?: string;
  };
}

export class OpportunityTracker {
  private opportunities: OpportunityReport[] = [];
  private outputDir: string;
  private reportFile: string;
  private summaryFile: string;

  constructor() {
    this.outputDir = path.join(process.cwd(), 'opportunities');
    this.reportFile = path.join(this.outputDir, 'opportunities.json');
    this.summaryFile = path.join(this.outputDir, 'summary.json');
    
    this.ensureOutputDirectory();
    this.loadExistingData();

    logInfo('Opportunity Tracker initialized', {
      outputDir: this.outputDir,
      loadedOpportunities: this.opportunities.length
    });
  }

  trackOpportunity(
    opportunity: ArbitrageOpportunity, 
    reported: boolean = true, 
    reason?: string
  ): void {
    const report: OpportunityReport = {
      timestamp: Date.now(),
      opportunity,
      metadata: {
        reported,
        reportingReason: reported ? reason : undefined,
        skipReason: !reported ? reason : undefined
      }
    };

    this.opportunities.push(report);

    // Maintain reasonable file size (keep last 10000 opportunities)
    if (this.opportunities.length > 10000) {
      this.opportunities = this.opportunities.slice(-10000);
    }

    // Save to file periodically
    this.saveToFile();

    logInfo('Opportunity tracked', {
      id: opportunity.id,
      pair: `${opportunity.pair.baseToken}/${opportunity.pair.quoteToken}`,
      spread: opportunity.spreadPercent.toFixed(3) + '%',
      netProfit: opportunity.netProfitPercent.toFixed(3) + '%',
      reported,
      reason
    });
  }

  generateSummaryReport(): void {
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    const lastHour = now - (60 * 60 * 1000);

    const recent24h = this.opportunities.filter(report => report.timestamp >= last24h);
    const recentHour = this.opportunities.filter(report => report.timestamp >= lastHour);

    const summary = {
      generatedAt: new Date().toISOString(),
      timeFrames: {
        last24Hours: this.analyzeOpportunities(recent24h),
        lastHour: this.analyzeOpportunities(recentHour),
        allTime: this.analyzeOpportunities(this.opportunities)
      },
      topPerformers: this.getTopPerformers(recent24h),
      dexAnalysis: this.analyzeDEXPerformance(recent24h),
      pairAnalysis: this.analyzePairPerformance(recent24h)
    };

    try {
      fs.writeFileSync(this.summaryFile, JSON.stringify(summary, null, 2));
      logInfo('Summary report generated', {
        file: this.summaryFile,
        opportunities24h: recent24h.length,
        opportunitiesHour: recentHour.length
      });
    } catch (error) {
      logError('Failed to save summary report', error as Error);
    }
  }

  getOpportunitiesReport(hoursBack: number = 24): {
    opportunities: OpportunityReport[];
    summary: any;
  } {
    const cutoff = Date.now() - (hoursBack * 60 * 60 * 1000);
    const filtered = this.opportunities.filter(report => report.timestamp >= cutoff);

    return {
      opportunities: filtered,
      summary: this.analyzeOpportunities(filtered)
    };
  }

  exportToCSV(filename?: string): string {
    const csvPath = filename || path.join(this.outputDir, `opportunities_${Date.now()}.csv`);
    
    const headers = [
      'Timestamp',
      'ID',
      'Base Token',
      'Quote Token',
      'Buy DEX',
      'Sell DEX',
      'Buy Price',
      'Sell Price',
      'Spread %',
      'Net Profit %',
      'Net Profit USD',
      'Trade Size USD',
      'Confidence',
      'Reported',
      'Reason'
    ];

    const rows = this.opportunities.map(report => {
      const opp = report.opportunity;
      return [
        new Date(report.timestamp).toISOString(),
        opp.id,
        opp.pair.baseToken,
        opp.pair.quoteToken,
        opp.buyDex,
        opp.sellDex,
        opp.buyPrice.toFixed(8),
        opp.sellPrice.toFixed(8),
        opp.spreadPercent.toFixed(4),
        opp.netProfitPercent.toFixed(4),
        opp.netProfit.toFixed(2),
        opp.tradeSize.toFixed(2),
        opp.confidence.toFixed(3),
        report.metadata.reported.toString(),
        report.metadata.reportingReason || report.metadata.skipReason || ''
      ];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    try {
      fs.writeFileSync(csvPath, csvContent);
      logInfo('Opportunities exported to CSV', {
        file: csvPath,
        recordCount: rows.length
      });
      return csvPath;
    } catch (error) {
      logError('Failed to export CSV', error as Error);
      throw error;
    }
  }

  getRealtimeStats(): {
    totalOpportunities: number;
    reportedOpportunities: number;
    skippedOpportunities: number;
    averageSpread: number;
    averageProfit: number;
    lastOpportunity?: Date;
    topPair: string;
    topDEXPair: string;
  } {
    const reported = this.opportunities.filter(r => r.metadata.reported);
    const skipped = this.opportunities.filter(r => !r.metadata.reported);

    const allOpps = this.opportunities.map(r => r.opportunity);
    const avgSpread = allOpps.length > 0 
      ? allOpps.reduce((sum, opp) => sum + opp.spreadPercent, 0) / allOpps.length 
      : 0;
    const avgProfit = allOpps.length > 0 
      ? allOpps.reduce((sum, opp) => sum + opp.netProfitPercent, 0) / allOpps.length 
      : 0;

    // Find top pair and DEX pair
    const pairCounts = new Map<string, number>();
    const dexPairCounts = new Map<string, number>();

    allOpps.forEach(opp => {
      const pair = `${opp.pair.baseToken}/${opp.pair.quoteToken}`;
      const dexPair = `${opp.buyDex} -> ${opp.sellDex}`;
      
      pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
      dexPairCounts.set(dexPair, (dexPairCounts.get(dexPair) || 0) + 1);
    });

    const topPair = this.getTopEntry(pairCounts);
    const topDEXPair = this.getTopEntry(dexPairCounts);

    return {
      totalOpportunities: this.opportunities.length,
      reportedOpportunities: reported.length,
      skippedOpportunities: skipped.length,
      averageSpread: avgSpread,
      averageProfit: avgProfit,
      lastOpportunity: this.opportunities.length > 0 
        ? new Date(this.opportunities[this.opportunities.length - 1].timestamp)
        : undefined,
      topPair,
      topDEXPair
    };
  }

  getRecentOpportunities(limit: number = 10): ArbitrageOpportunity[] {
    return this.opportunities
      .filter(r => r.metadata.reported) // Only reported opportunities
      .sort((a, b) => b.timestamp - a.timestamp) // Most recent first
      .slice(0, limit)
      .map(r => r.opportunity);
  }

  private ensureOutputDirectory(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private loadExistingData(): void {
    try {
      if (fs.existsSync(this.reportFile)) {
        const data = fs.readFileSync(this.reportFile, 'utf8');
        this.opportunities = JSON.parse(data);
      }
    } catch (error) {
      logError('Failed to load existing opportunity data', error as Error);
      this.opportunities = [];
    }
  }

  private saveToFile(): void {
    try {
      // Save asynchronously to avoid blocking
      setImmediate(() => {
        fs.writeFileSync(this.reportFile, JSON.stringify(this.opportunities, null, 2));
      });
    } catch (error) {
      logError('Failed to save opportunities to file', error as Error);
    }
  }

  private analyzeOpportunities(reports: OpportunityReport[]): any {
    if (reports.length === 0) {
      return {
        count: 0,
        reported: 0,
        skipped: 0,
        averageSpread: 0,
        averageProfit: 0,
        maxSpread: 0,
        maxProfit: 0,
        totalPotentialProfit: 0
      };
    }

    const opportunities = reports.map(r => r.opportunity);
    const reported = reports.filter(r => r.metadata.reported).length;
    const skipped = reports.length - reported;

    const spreads = opportunities.map(opp => opp.spreadPercent);
    const profits = opportunities.map(opp => opp.netProfitPercent);
    const profitAmounts = opportunities.map(opp => opp.netProfit);

    return {
      count: reports.length,
      reported,
      skipped,
      averageSpread: spreads.reduce((sum, val) => sum + val, 0) / spreads.length,
      averageProfit: profits.reduce((sum, val) => sum + val, 0) / profits.length,
      maxSpread: Math.max(...spreads),
      maxProfit: Math.max(...profits),
      totalPotentialProfit: profitAmounts.reduce((sum, val) => sum + val, 0)
    };
  }

  private getTopPerformers(reports: OpportunityReport[]): any {
    const opportunities = reports.map(r => r.opportunity);
    
    // Sort by net profit percentage
    const topByProfit = [...opportunities]
      .sort((a, b) => b.netProfitPercent - a.netProfitPercent)
      .slice(0, 10)
      .map(opp => ({
        id: opp.id,
        pair: `${opp.pair.baseToken}/${opp.pair.quoteToken}`,
        buyDex: opp.buyDex,
        sellDex: opp.sellDex,
        spreadPercent: opp.spreadPercent,
        netProfitPercent: opp.netProfitPercent,
        netProfit: opp.netProfit,
        confidence: opp.confidence
      }));

    // Sort by spread percentage
    const topBySpread = [...opportunities]
      .sort((a, b) => b.spreadPercent - a.spreadPercent)
      .slice(0, 10)
      .map(opp => ({
        id: opp.id,
        pair: `${opp.pair.baseToken}/${opp.pair.quoteToken}`,
        buyDex: opp.buyDex,
        sellDex: opp.sellDex,
        spreadPercent: opp.spreadPercent,
        netProfitPercent: opp.netProfitPercent,
        confidence: opp.confidence
      }));

    return {
      topByProfit,
      topBySpread
    };
  }

  private analyzeDEXPerformance(reports: OpportunityReport[]): any {
    const dexStats = new Map<string, { buy: number; sell: number; totalProfit: number }>();
    
    reports.forEach(report => {
      const opp = report.opportunity;
      
      // Buy DEX stats
      if (!dexStats.has(opp.buyDex)) {
        dexStats.set(opp.buyDex, { buy: 0, sell: 0, totalProfit: 0 });
      }
      const buyStats = dexStats.get(opp.buyDex)!;
      buyStats.buy += 1;
      buyStats.totalProfit += opp.netProfit;

      // Sell DEX stats
      if (!dexStats.has(opp.sellDex)) {
        dexStats.set(opp.sellDex, { buy: 0, sell: 0, totalProfit: 0 });
      }
      const sellStats = dexStats.get(opp.sellDex)!;
      sellStats.sell += 1;
      sellStats.totalProfit += opp.netProfit;
    });

    return Array.from(dexStats.entries()).map(([dex, stats]) => ({
      dex,
      buyOpportunities: stats.buy,
      sellOpportunities: stats.sell,
      totalOpportunities: stats.buy + stats.sell,
      totalPotentialProfit: stats.totalProfit
    }));
  }

  private analyzePairPerformance(reports: OpportunityReport[]): any {
    const pairStats = new Map<string, { count: number; totalProfit: number; maxSpread: number }>();
    
    reports.forEach(report => {
      const opp = report.opportunity;
      const pairKey = `${opp.pair.baseToken}/${opp.pair.quoteToken}`;
      
      if (!pairStats.has(pairKey)) {
        pairStats.set(pairKey, { count: 0, totalProfit: 0, maxSpread: 0 });
      }
      
      const stats = pairStats.get(pairKey)!;
      stats.count += 1;
      stats.totalProfit += opp.netProfit;
      stats.maxSpread = Math.max(stats.maxSpread, opp.spreadPercent);
    });

    return Array.from(pairStats.entries()).map(([pair, stats]) => ({
      pair,
      opportunityCount: stats.count,
      totalPotentialProfit: stats.totalProfit,
      averageProfit: stats.totalProfit / stats.count,
      maxSpread: stats.maxSpread
    }));
  }

  private getTopEntry(map: Map<string, number>): string {
    let topEntry = '';
    let maxCount = 0;
    
    map.forEach((count, key) => {
      if (count > maxCount) {
        maxCount = count;
        topEntry = key;
      }
    });
    
    return topEntry || 'None';
  }
}
