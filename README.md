<h1 align="center">⚡ FlashSol</h1>
<p align="center">
  <b>Real-time Solana Arbitrage Opportunity Scanner</b><br>
  Monitors prices across multiple DEXes and identifies profitable spreads.<br>
  <i>Research tool — no private keys, no trading, just data.</i>
</p>

<p align="center">
  <a href="https://github.com/madcloud93/arb/stargazers"><img src="https://img.shields.io/github/stars/madcloud93/arb?style=for-the-badge" alt="Stars"></a>
  <a href="https://github.com/madcloud93/arb/network/members"><img src="https://img.shields.io/github/forks/madcloud93/arb?style=for-the-badge" alt="Forks"></a>
  <a href="https://github.com/madcloud93/arb/issues"><img src="https://img.shields.io/github/issues/madcloud93/arb?style=for-the-badge" alt="Issues"></a>
  <a href="https://github.com/madcloud93/arb/blob/main/LICENSE"><img src="https://img.shields.io/github/license/madcloud93/arb?style=for-the-badge" alt="License"></a>
</p>

---

## 📌 Overview
**FlashSol** connects to Solana DEXes — **Raydium**, **Orca**, and **Serum** — to scan for arbitrage opportunities in real time.  
It calculates potential profits between exchanges for popular pairs like:

- `SOL/USDC`
- `ETH/USDC`
- `BTC/USDC`
- `USDC/USDT`

The tool **does not execute trades** — it’s for research, education, and strategy analysis.

---

## ✨ Features
- 🔍 **Live Price Scanning** — via WebSockets for minimal latency.
- 📊 **Profit Calculations** — based on configurable trade sizes.
- 📂 **CSV Export** — store opportunities in `opportunities/` for later analysis.
- 📜 **Logging** — all events saved to `logs/arbitrage.log`.
- ⚡ **Auto-Reconnect** — stays online even if a DEX API drops.

---

## 🛠️ Tech Stack
- **Node.js** ≥ 18
- **Solana Web3.js**
- **DEX APIs**: Raydium, Orca, Serum
- WebSockets
- CSV Writer

---

## 🚀 Getting Started

### 1️⃣ Clone the repo
```bash
git clone https://github.com/madcloud93/arb.git
cd arb
npm install
npm run build

SOLANA_RPC_URL=https://your-solana-rpc-endpoint
PROFIT_THRESHOLD_PERCENT=0.2
TRADE_SIZE_USDC=100

Variables:

SOLANA_RPC_URL — Public or paid Solana RPC endpoint.
PROFIT_THRESHOLD_PERCENT — Minimum spread percentage to log (default: 0.2%).
TRADE_SIZE_USDC — Trade size for profit calculations (default: $100).
