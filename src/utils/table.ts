import Table from 'cli-table3';
import chalk from 'chalk';
import { ArbitrageOpportunity } from '../types';

interface TableDisplayConfig {
  showHeader?: boolean;
  maxRows?: number;
  compact?: boolean;
}

export class TableFormatter {
  static displayOpportunities(
    opportunities: ArbitrageOpportunity[], 
    config: TableDisplayConfig = {}
  ): void {
    const { showHeader = true, maxRows = 10, compact = false } = config;

    if (opportunities.length === 0) {
      console.log(chalk.yellow('No opportunities found\n'));
      return;
    }

    const sortedOpportunities = opportunities
      .sort((a, b) => b.netProfitPercent - a.netProfitPercent)
      .slice(0, maxRows);

    const table = new Table({
      head: [
        chalk.bold.cyan('Pair'),
        chalk.bold.green('Buy DEX'),
        chalk.bold.red('Sell DEX'),
        chalk.bold.yellow('Buy Price'),
        chalk.bold.yellow('Sell Price'),
        chalk.bold.magenta('Spread %'),
        chalk.bold.white('Net Profit'),
        chalk.bold.blue('Confidence')
      ],
      style: {
        head: [],
        border: ['gray'],
        'padding-left': 1,
        'padding-right': 1
      },
      colWidths: compact ? [10, 8, 8, 12, 12, 10, 12, 10] : [12, 10, 10, 14, 14, 12, 14, 12]
    });

    if (showHeader) {
      console.log();
      console.log(chalk.bold.cyan('🚀 ═══════════════════════════════════════════════════════════════════════════════════════'));
      console.log(chalk.bold.cyan('   FLASHSOL ARBITRAGE OPPORTUNITIES'));
      console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════════════════════════════'));
    }

    // Add rows with color coding based on profit
    sortedOpportunities.forEach(opportunity => {
      const profitPercent = opportunity.netProfitPercent;
      const spread = opportunity.spreadPercent;
      
      // Color coding based on profit level
      const profitColor = this.getProfitColor(profitPercent);
      const spreadColor = this.getSpreadColor(spread);
      
      // Format values
      const pair = `${opportunity.pair.baseToken}/${opportunity.pair.quoteToken}`;
      const buyPrice = `$${opportunity.buyPrice.toFixed(6)}`;
      const sellPrice = `$${opportunity.sellPrice.toFixed(6)}`;
      const netProfit = `${profitPercent.toFixed(2)}%`;
      const spreadFormatted = `${spread.toFixed(2)}%`;
      const confidence = `${(opportunity.confidence * 100).toFixed(0)}%`;

      table.push([
        chalk.bold.white(pair),
        chalk.green(opportunity.buyDex),
        chalk.red(opportunity.sellDex),
        chalk.yellow(buyPrice),
        chalk.yellow(sellPrice),
        spreadColor(spreadFormatted),
        profitColor(netProfit),
        this.getConfidenceColor(opportunity.confidence)(confidence)
      ]);
    });

    console.log(table.toString());

    // Summary statistics
    if (showHeader) {
      this.displaySummary(sortedOpportunities);
    }
  }

  static displayOpportunityAlert(opportunity: ArbitrageOpportunity): void {
    const profitColor = this.getProfitColor(opportunity.netProfitPercent);
    const pair = `${opportunity.pair.baseToken}/${opportunity.pair.quoteToken}`;
    
    console.log();
    console.log(chalk.bold.yellow('🚀 ') + chalk.bold.cyan('NEW ARBITRAGE OPPORTUNITY DETECTED!'));
    console.log(chalk.gray('─'.repeat(60)));
    
    const alertTable = new Table({
      chars: {
        'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
        'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
        'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼',
        'right': '║', 'right-mid': '╢', 'middle': '│'
      },
      style: {
        head: [],
        border: ['cyan'],
        'padding-left': 1,
        'padding-right': 1
      }
    });

    alertTable.push(
      [chalk.bold.white('Pair:'), chalk.bold.cyan(pair)],
      [chalk.bold.white('Strategy:'), `Buy on ${chalk.green(opportunity.buyDex)} → Sell on ${chalk.red(opportunity.sellDex)}`],
      [chalk.bold.white('Buy Price:'), chalk.yellow(`$${opportunity.buyPrice.toFixed(6)}`)],
      [chalk.bold.white('Sell Price:'), chalk.yellow(`$${opportunity.sellPrice.toFixed(6)}`)],
      [chalk.bold.white('Spread:'), this.getSpreadColor(opportunity.spreadPercent)(`${opportunity.spreadPercent.toFixed(2)}%`)],
      [chalk.bold.white('Net Profit:'), profitColor(`$${opportunity.netProfit.toFixed(2)} (${opportunity.netProfitPercent.toFixed(2)}%)`)],
      [chalk.bold.white('Trade Size:'), chalk.blue(`$${opportunity.tradeSize.toLocaleString()}`)],
      [chalk.bold.white('Confidence:'), this.getConfidenceColor(opportunity.confidence)(`${(opportunity.confidence * 100).toFixed(0)}%`)]
    );

    console.log(alertTable.toString());
    console.log();
  }

  static displayStatus(status: any): void {
    console.log();
    console.log(chalk.bold.blue('📊 ═══════════════════════════════════════════════════════════════════════'));
    console.log(chalk.bold.blue('   FLASHSOL SYSTEM STATUS'));
    console.log(chalk.bold.blue('═══════════════════════════════════════════════════════════════════════'));

    const statusTable = new Table({
      head: [chalk.bold.cyan('Component'), chalk.bold.green('Status'), chalk.bold.yellow('Details')],
      style: {
        head: [],
        border: ['gray'],
        'padding-left': 1,
        'padding-right': 1
      },
      colWidths: [20, 15, 40]
    });

    // System status
    statusTable.push([
      chalk.white('Bot Status'),
      status.isRunning ? chalk.green('✅ Running') : chalk.red('❌ Stopped'),
      `Monitoring ${status.monitoredPairs} pairs`
    ]);

    // DEX status
    statusTable.push([
      chalk.white('DEX Integrations'),
      status.enabledDEXes.length > 0 ? chalk.green(`✅ ${status.enabledDEXes.length} Active`) : chalk.red('❌ None'),
      status.enabledDEXes.join(', ')
    ]);

    // Opportunities
    statusTable.push([
      chalk.white('Opportunities'),
      status.recentOpportunities > 0 ? chalk.green(`✅ ${status.recentOpportunities} Found`) : chalk.yellow('⏳ Waiting'),
      'In the last 24 hours'
    ]);

    // Cache status
    const cacheSize = status.cacheStats?.priceCacheSize || 0;
    statusTable.push([
      chalk.white('Price Cache'),
      cacheSize > 0 ? chalk.green(`✅ ${cacheSize} Quotes`) : chalk.yellow('⏳ Building'),
      status.cacheStats?.totalMemoryUsage || '0 MB'
    ]);

    console.log(statusTable.toString());
    console.log();
  }

  static displayBanner(): void {
    console.clear();
    console.log();
    console.log(chalk.bold.cyan('╔══════════════════════════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║') + chalk.bold.yellow('                               FLASHSOL ARBITRAGE BOT                                ') + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('║') + chalk.bold.white('                          Real-time Solana DEX Monitoring                         ') + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.gray('🚀 Starting arbitrage monitoring system...'));
    console.log();
  }

  private static displaySummary(opportunities: ArbitrageOpportunity[]): void {
    if (opportunities.length === 0) return;

    const avgProfit = opportunities.reduce((sum, opp) => sum + opp.netProfitPercent, 0) / opportunities.length;
    const maxProfit = Math.max(...opportunities.map(opp => opp.netProfitPercent));
    const totalPotential = opportunities.reduce((sum, opp) => sum + opp.netProfit, 0);

    console.log(chalk.bold.blue('📈 SUMMARY STATISTICS'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.white(`Total Opportunities: ${chalk.bold.green(opportunities.length)}`));
    console.log(chalk.white(`Average Profit: ${chalk.bold.yellow(avgProfit.toFixed(2) + '%')}`));
    console.log(chalk.white(`Best Opportunity: ${chalk.bold.green(maxProfit.toFixed(2) + '%')}`));
    console.log(chalk.white(`Total Potential: ${chalk.bold.cyan('$' + totalPotential.toLocaleString())}`));
    console.log();
  }

  private static getProfitColor(profit: number) {
    if (profit >= 50) return chalk.bold.magenta;
    if (profit >= 20) return chalk.bold.green;
    if (profit >= 10) return chalk.green;
    if (profit >= 5) return chalk.yellow;
    if (profit >= 1) return chalk.cyan;
    return chalk.gray;
  }

  private static getSpreadColor(spread: number) {
    if (spread >= 50) return chalk.bold.red;
    if (spread >= 20) return chalk.red;
    if (spread >= 10) return chalk.yellow;
    if (spread >= 5) return chalk.cyan;
    return chalk.gray;
  }

  private static getConfidenceColor(confidence: number) {
    if (confidence >= 0.9) return chalk.bold.green;
    if (confidence >= 0.8) return chalk.green;
    if (confidence >= 0.7) return chalk.yellow;
    if (confidence >= 0.6) return chalk.rgb(255, 165, 0); // Orange color
    return chalk.red;
  }
}

export default TableFormatter;
