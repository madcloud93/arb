import { Connection } from '@solana/web3.js';
import WebSocket from 'ws';
import { config } from '../config';
import { logger, logError, logInfo, logWarning } from './logger';

export class ConnectionManager {
  private connection: Connection | null = null;
  private websocket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = config.monitoring.wsReconnectDelayMs;
  private isReconnecting = false;
  private subscriptions: Map<string, (data: any) => void> = new Map();

  constructor() {
    this.setupConnection();
    this.setupWebSocket();
  }

  private setupConnection(): void {
    try {
      this.connection = new Connection(config.solana.rpcUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
      });
      
      logInfo('Solana RPC connection established', {
        endpoint: config.solana.rpcUrl
      });
    } catch (error) {
      logError('Failed to establish Solana RPC connection', error as Error);
      throw error;
    }
  }

  private setupWebSocket(): void {
    try {
      this.websocket = new WebSocket(config.solana.wsUrl);

      this.websocket.on('open', () => {
        logInfo('WebSocket connection established', {
          endpoint: config.solana.wsUrl
        });
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        
        // Resubscribe to all previous subscriptions
        this.resubscribeAll();
      });

      this.websocket.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          logError('Failed to parse WebSocket message', error as Error, { data: data.toString() });
        }
      });

      this.websocket.on('error', (error: Error) => {
        logError('WebSocket error', error);
        this.handleWebSocketError();
      });

      this.websocket.on('close', (code: number, reason: Buffer) => {
        logWarning('WebSocket connection closed', {
          code,
          reason: reason.toString()
        });
        this.handleWebSocketClose();
      });

    } catch (error) {
      logError('Failed to establish WebSocket connection', error as Error);
      this.handleWebSocketError();
    }
  }

  private handleWebSocketMessage(message: any): void {
    try {
      if (message.method && this.subscriptions.has(message.method)) {
        const callback = this.subscriptions.get(message.method);
        if (callback) {
          callback(message);
        }
      }

      // Handle slot notifications
      if (message.method === 'slotNotification') {
        logger.debug('Slot notification received', {
          slot: message.params?.result?.slot
        });
      }

      // Handle account updates
      if (message.method === 'accountNotification') {
        logger.debug('Account notification received', {
          account: message.params?.result?.value?.pubkey
        });
      }

    } catch (error) {
      logError('Error handling WebSocket message', error as Error, { message });
    }
  }

  private handleWebSocketError(): void {
    if (!this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.isReconnecting = true;
      this.reconnectAttempts++;
      
      logWarning(`Attempting WebSocket reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, {
        delay: this.reconnectDelay
      });

      setTimeout(() => {
        this.setupWebSocket();
      }, this.reconnectDelay);

      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logError('Max WebSocket reconnection attempts reached', new Error('WebSocket reconnection failed'));
    }
  }

  private handleWebSocketClose(): void {
    if (!this.isReconnecting) {
      this.handleWebSocketError();
    }
  }

  private resubscribeAll(): void {
    // Implementation would resubscribe to all active subscriptions
    // This is called after WebSocket reconnection
    logInfo('Resubscribing to WebSocket notifications');
  }

  public subscribeToSlots(callback: (slot: number) => void): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      logWarning('WebSocket not ready for slot subscription');
      return;
    }

    const subscription = {
      jsonrpc: '2.0',
      id: 1,
      method: 'slotSubscribe',
      params: []
    };

    this.subscriptions.set('slotNotification', (message: any) => {
      if (message.params?.result?.slot) {
        callback(message.params.result.slot);
      }
    });

    this.websocket.send(JSON.stringify(subscription));
    logInfo('Subscribed to slot notifications');
  }

  public subscribeToAccount(accountPubkey: string, callback: (accountInfo: any) => void): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      logWarning('WebSocket not ready for account subscription', { account: accountPubkey });
      return;
    }

    const subscription = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'accountSubscribe',
      params: [accountPubkey, { commitment: 'confirmed' }]
    };

    this.subscriptions.set(`account_${accountPubkey}`, callback);
    this.websocket.send(JSON.stringify(subscription));
    
    logInfo('Subscribed to account updates', { account: accountPubkey });
  }

  public getConnection(): Connection {
    if (!this.connection) {
      throw new Error('Solana connection not established');
    }
    return this.connection;
  }

  public getWebSocket(): WebSocket | null {
    return this.websocket;
  }

  public async checkHealth(): Promise<{ rpc: boolean; websocket: boolean }> {
    const health = {
      rpc: false,
      websocket: false
    };

    try {
      if (this.connection) {
        await this.connection.getSlot();
        health.rpc = true;
      }
    } catch (error) {
      logError('RPC health check failed', error as Error);
    }

    try {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        health.websocket = true;
      }
    } catch (error) {
      logError('WebSocket health check failed', error as Error);
    }

    return health;
  }

  public close(): void {
    if (this.websocket) {
      this.websocket.close();
    }
    
    this.subscriptions.clear();
    logInfo('Connection manager closed');
  }
}
