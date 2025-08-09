<p align="center">
  <img src="https://cryptologos.cc/logos/solana-sol-logo.svg?v=023" alt="Solana Logo" width="120">
</p>

<h1 align="center">FlashSol</h1>
<p align="center">
  <b>Solana Arbitrage Opportunity Scanner</b><br>
  Monitors prices across multiple DEXes and identifies profitable spreads.<br>
  Read-only tool — no trading, no private keys required.
</p>

<p align="center">
  <a href="https://github.com/madcloud93/arb/stargazers">
    <img src="https://img.shields.io/github/stars/madcloud93/arb?style=for-the-badge" alt="Stars">
  </a>
  <a href="https://github.com/madcloud93/arb/network/members">
    <img src="https://img.shields.io/github/forks/madcloud93/arb?style=for-the-badge" alt="Forks">
  </a>
  <a href="https://github.com/madcloud93/arb/issues">
    <img src="https://img.shields.io/github/issues/madcloud93/arb?style=for-the-badge" alt="Issues">
  </a>
  <a href="https://github.com/madcloud93/arb/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/madcloud93/arb?style=for-the-badge" alt="License">
  </a>
</p>

---

## Overview
FlashSol connects to Solana DEXes — Raydium, Orca, and Serum — to scan for arbitrage opportunities in real time.  
It calculates potential profits between exchanges for popular pairs such as:

- SOL/USDC
- ETH/USDC
- BTC/USDC
- USDC/USDT

This tool is designed for research, education, and market analysis.  
It does not execute trades.

---

## Features
- Live price scanning using WebSockets for minimal latency.
- Profit calculations based on configurable trade sizes.
- CSV export for storing opportunities in the `opportunities/` folder.
- Logging of all events to `logs/arbitrage.log`.
- Automatic reconnection if a DEX API drops.

---

## Tech Stack
- Node.js ≥ 18
- Solana Web3.js
- DEX APIs: Raydium, Orca, Serum
- WebSockets
- CSV Writer

---

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/madcloud93/arb.git
cd arb

npm install

npm run build

Create a .env file in the root directory:
SOLANA_RPC_URL=https://your-solana-rpc-endpoint
PROFIT_THRESHOLD_PERCENT=0.2
TRADE_SIZE_USDC=100

Variables:

SOLANA_RPC_URL — Public or paid Solana RPC endpoint.
PROFIT_THRESHOLD_PERCENT — Minimum spread percentage to log (default: 0.2%).
TRADE_SIZE_USDC — Trade size in USDC for profit calculations (default: 100).

Running the Scanner
npm start

Future Updates
Planned features:
Solana flash loan integration.
Cross-chain bridge arbitrage detection.
Automatic trade execution with MEV protection.
Expanded token pair monitoring.
Integration with multiple flash loan providers.
For collaboration, feature requests, or development work related to flash loans or cross-chain arbitrage, please DM me.


