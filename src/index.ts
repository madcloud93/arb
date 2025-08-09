#!/usr/bin/env node

import { config } from './config';
import { RealTimeMonitor } from './monitoring/realtime';
import { TableFormatter } from './utils/table';
import { logInfo, logError } from './utils/logger';

class FlashSolBot {
  private monitor: RealTimeMonitor;
  private isShuttingDown = false;

  constructor() {
    this.monitor = new RealTimeMonitor();
    this.setupGracefulShutdown();
  }

  async start(): Promise<void> {
    try {
      TableFormatter.displayBanner();

      logInfo('Starting FlashSol bot', {
        version: '1.0.0',
        config: {
          rpcUrl: config.solana.rpcUrl,
          enabledDEXes: Object.entries(config.dex)
            .filter(([_, enabled]) => enabled)
            .map(([name, _]) => name),
          arbitrageThreshold: config.arbitrage.profitThresholdPercent,
          tradeSize: config.arbitrage.tradeSizeUsdc
        }
      });

      await this.monitor.start();

      const status = this.monitor.getStatus();
      TableFormatter.displayStatus(status);
      
      logInfo('Bot started successfully', status);

      this.keepAlive();

    } catch (error) {
      logError('Failed to start bot', error as Error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    logInfo('Shutting down...');

    try {
      await this.monitor.stop();
      logInfo('Bot stopped');
      process.exit(0);
    } catch (error) {
      logError('Error during shutdown', error as Error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    process.on('SIGINT', async () => {
      logInfo('Received SIGINT, shutting down...');
      await this.stop();
    });

    process.on('SIGTERM', async () => {
      logInfo('Received SIGTERM, shutting down...');
      await this.stop();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logError('🚨 Uncaught exception', error);
      setTimeout(() => process.exit(1), 1000);
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logError('🚨 Unhandled promise rejection', new Error(String(reason)), {
        promise: promise.toString()
      });
      setTimeout(() => process.exit(1), 1000);
    });
  }

  private keepAlive(): void {
    // Log periodic status updates with table display
    setInterval(() => {
      if (!this.isShuttingDown) {
        const status = this.monitor.getStatus();
        TableFormatter.displayStatus(status);
        
        logInfo('📊 FlashSol bot status update', {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          ...status
        });
      }
    }, 60000); // Every minute

    // Generate hourly reports
    setInterval(() => {
      if (!this.isShuttingDown) {
        logInfo('📈 Generating hourly summary report...');
        // The opportunity tracker will handle the actual report generation
      }
    }, 3600000); // Every hour
  }
}

// Start the bot if this file is run directly
if (require.main === module) {
  const bot = new FlashSolBot();
  bot.start().catch((error) => {
    logError('Fatal error starting FlashSol bot', error);
    process.exit(1);
  });
}

export { FlashSolBot };
