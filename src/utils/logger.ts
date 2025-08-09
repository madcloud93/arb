import winston from 'winston';
import { config } from '../config';
import * as fs from 'fs';
import * as path from 'path';

const logDir = path.dirname(config.logging.file);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'flashsol' },
  transports: [
    new winston.transports.File({
      filename: config.logging.file,
      level: config.logging.level,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    new winston.transports.Console({
      level: config.logging.level,
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      )
    })
  ]
});

// Rate limiter for opportunity logging
class OpportunityLogger {
  private opportunities: Map<string, number> = new Map();
  private lastCleanup = Date.now();

  logOpportunity(opportunity: any): void {
    const now = Date.now();
    const key = `${opportunity.pair.baseToken}-${opportunity.pair.quoteToken}-${opportunity.buyDex}-${opportunity.sellDex}`;
    
    // Clean up old entries every minute
    if (now - this.lastCleanup > 60000) {
      this.cleanup();
      this.lastCleanup = now;
    }

    const count = this.opportunities.get(key) || 0;
    if (count < config.arbitrage.maxOpportunitiesPerMinute) {
      this.opportunities.set(key, count + 1);
      
      logger.info('🚀 Arbitrage Opportunity Detected', {
        id: opportunity.id,
        pair: `${opportunity.pair.baseToken}/${opportunity.pair.quoteToken}`,
        buyDex: opportunity.buyDex,
        sellDex: opportunity.sellDex,
        buyPrice: opportunity.buyPrice.toFixed(6),
        sellPrice: opportunity.sellPrice.toFixed(6),
        spread: opportunity.spreadPercent.toFixed(3) + '%',
        grossProfit: '$' + opportunity.grossProfit.toFixed(2),
        netProfit: '$' + opportunity.netProfit.toFixed(2),
        netProfitPercent: opportunity.netProfitPercent.toFixed(3) + '%',
        tradeSize: '$' + opportunity.tradeSize.toLocaleString(),
        confidence: opportunity.confidence.toFixed(2),
        timestamp: new Date(opportunity.timestamp).toISOString()
      });
    }
  }

  private cleanup(): void {
    this.opportunities.clear();
  }
}

export const opportunityLogger = new OpportunityLogger();

// Utility functions for logging
export const logError = (message: string, error: Error, meta?: any): void => {
  logger.error(message, {
    error: error.message,
    stack: error.stack,
    ...meta
  });
};

export const logWarning = (message: string, meta?: any): void => {
  logger.warn(message, meta);
};

export const logInfo = (message: string, meta?: any): void => {
  logger.info(message, meta);
};

export const logDebug = (message: string, meta?: any): void => {
  logger.debug(message, meta);
};
