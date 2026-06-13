# Loop — Stock Trading on Arc Testnet

A Robinhood-style stock trading app built on [Arc Testnet](https://docs.arc.io) with a USDC-reserved on-chain vault:

```
Frontend (Next.js + wagmi)
    │
    ├── SoSoValue API  →  market data, sectors, prices, charts
    ├── StockVault.sol →  USDC-collateralized synthetic shares on Arc
    └── Wallet         →  MetaMask (Arc Testnet)
```

## Architecture

| Layer | Provider | Purpose |
|-------|----------|---------|
| **Information** | [SoSoValue API](https://sosovalue.gitbook.io/soso-value-api-doc) | Crypto stock sectors, prices, klines |
| **Settlement** | `StockVault.sol` on Arc | Buy/sell synthetic shares backed by on-chain USDC reserves |

Buys deposit USDC into the vault and mint synthetic shares at the oracle price. Sells burn shares and redeem USDC from the reserve.

## Quick Start

```bash
cd web && npm install
cp .env.example .env.local   # add your API keys and vault address
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SOSOVALUE_API_KEY` | Optional | Live market data (demo fallback) |
| `NEXT_PUBLIC_STOCK_VAULT_ADDRESS` | For trading | Deployed StockVault on Arc |
| `STOCK_VAULT_ADDRESS` | For oracle sync | Same vault address (server-side) |
| `PRIVATE_KEY` | For deploy/sync | Owner wallet (never commit) |

## Deploy & sync prices

```bash
# 1. Deploy StockVault to Arc Testnet
cd web && npm run deploy:vault

# 2. Add address to .env.local (printed by deploy script)

# 3. Sync SoSoValue prices to on-chain oracle
npm run sync-prices
# Or click "Sync prices" in the trade panel
# Or POST /api/oracle/sync-prices
```

## Trading flow

1. Connect wallet on **Arc Testnet** (chain `5042002`)
2. Fund wallet with testnet USDC via [Circle Faucet](https://faucet.circle.com)
3. Select a stock → Buy/Sell against the USDC vault
4. Buys require two wallet prompts: USDC approve, then buy

## Routes

| Route | Description |
|-------|-------------|
| `/` | Dashboard — sectors, stocks, trade |
| `/stock/[ticker]` | Detail page with price chart + trade |
| `POST /api/oracle/sync-prices` | Push SoSoValue prices to vault oracle |

## Wallet network

**Arc Testnet**: chain `5042002`, RPC `https://rpc.testnet.arc.network`, USDC gas — [Circle Faucet](https://faucet.circle.com)

## Project structure

```
loop/
├── contracts/     # StockVault.sol (Foundry)
└── web/
    ├── scripts/   # deploy-vault.sh, sync-prices.ts
    └── src/
        ├── app/api/       # SoSoValue, oracle routes
        └── components/    # Dashboard, charts, trade panel
```
