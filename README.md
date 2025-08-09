# FlashSol

Solana arbitrage opportunity scanner. Watches prices across different DEXes and finds profitable spreads.

Built this to monitor SOL/USDC, ETH/USDC and other pairs on Raydium, Orca and Serum. Doesn't actually trade anything, just shows you where the money is.

## What it does

Connects to Solana DEXes and compares prices in real-time. When there's a decent spread between exchanges, it logs the opportunity with profit calculations. Pretty useful for spotting trends and understanding market inefficiencies.

Uses WebSockets for live data, caches everything in memory, and exports to CSV if you want to analyze later.

## Setup

You'll need Node.js 18 or higher. I use the free Solana RPC but you might want a paid one if you're hitting rate limits.

```bash
git clone <repo-url>
cd flashsol
npm install
cp .env.example .env
# edit .env with your RPC endpoint
npm run build
npm start
```

## Configuration

Main settings are in `.env`:

- `SOLANA_RPC_URL` - your solana endpoint
- `PROFIT_THRESHOLD_PERCENT` - minimum spread to log (default 0.2%)
- `TRADE_SIZE_USDC` - calculation amount (default $100)

Currently watches SOL/USDC, ETH/USDC, BTC/USDC and USDC/USDT pairs.

## Output

Creates CSV files in `opportunities/` folder with timestamp, pair, buy/sell DEX, prices, and calculated profits.

Also logs everything to `logs/arbitrage.log` if you want to grep through it later.

## Running it

Just `npm start` and let it run. It'll reconnect automatically if the WebSocket drops.

For Docker:
```bash
docker-compose up -d
```

## Notes

This is read-only - no private keys needed, no actual trading. Just price monitoring.

Sometimes DEX APIs go down or return stale data. The bot handles most of this but don't expect perfect uptime.

If you're getting rate limited, get a better RPC endpoint or reduce the monitoring frequency in the config.
