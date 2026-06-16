# Loop

**Crypto stock trading on Arc Testnet: synthetic spot, perpetuals, and market intelligence in one interface.**

Loop is a full stack trading application for SoSoValue indexed crypto stocks. Users connect a wallet on [Arc Testnet](https://docs.arc.io), trade synthetic spot positions through a USDC collateralized vault, open cash settled perpetuals, and follow live market data and news. Prices come from external oracles and settlement is in USDC.

## Overview

Loop combines off chain market data with on chain settlement:

| Capability | Description |
|------------|-------------|
| **Spot trading** | Buy and sell synthetic shares via `StockVault.sol`, a USDC reserved ledger priced by the on chain oracle |
| **Perpetual futures** | Cash settled long/short exposure via `PerpEngine.sol` with margin, funding, and liquidation |
| **Market data** | Sectors, snapshots, klines, and live price streams from SoSoValue and supplemental feeds |
| **News** | Aggregated headlines from SoSoValue, Finnhub, CryptoPanic, and RSS fallbacks |
| **Portfolio** | Wallet balances, spot holdings, open perp positions, and recent trade history |

The web client is built with Next.js and wagmi. Smart contracts are written in Solidity and managed with Foundry.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Loop Web Application                        │
│              Next.js · React · wagmi · viem                     │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
    ┌────────▼────────┐             ┌────────▼────────┐
    │  Market & news  │             │  Arc Testnet    │
    │  data providers │             │  (chain 5042002)│
    └────────┬────────┘             └────────┬────────┘
             │                               │
   SoSoValue · Finnhub              StockVault.sol
   CryptoPanic · RSS                 PerpEngine.sol
             │                               │
             └──────── optional ────────────┘
                        Neon Postgres
              (perp mark history · closed trades)
```

**Information layer:** External APIs supply prices, charts, sectors, and news. Responses are cached locally and refreshed in the background so pages stay responsive.

**Settlement layer:** Spot and perp contracts on Arc hold USDC collateral and track synthetic positions at oracle prices. The app does not custody real world equity tokens; exposure is cash settled against SoSoValue derived marks. Users read chain state via RPC and submit transactions through their connected wallet.

**Persistence layer:** Optional Neon Postgres stores perp mark history and recent closed trades. Local JSON fallbacks keep the app usable when the database is unavailable.

## Tech stack

| Layer | Technologies |
|-------|----------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Wallet | wagmi 3, viem 2 |
| Contracts | Solidity 0.8.24, Foundry |
| Data | SoSoValue API, Finnhub, CryptoPanic, RSS |
| Database | Neon Postgres (optional) |
| Chain | Arc Testnet, USDC native gas |

## Prerequisites

* **Node.js** 20+
* **npm** (or compatible package manager)
* **Foundry** for contract build, test, and deploy ([install guide](https://book.getfoundry.sh/getting-started/installation))
* **Wallet:** MetaMask or any EIP-1193 wallet, configured for Arc Testnet
* **Testnet USDC:** [Circle Faucet](https://faucet.circle.com)

API keys improve data quality but are not required for a basic local run (demo fallbacks apply where configured).

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/Samped/loop.git
cd loop/web
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys and contract addresses. See [Environment variables](#environment-variables) below.

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Connect and fund

1. Add **Arc Testnet** to your wallet (chain ID `5042002`, RPC `https://rpc.testnet.arc.network`).
2. Obtain testnet USDC from the [Circle Faucet](https://faucet.circle.com).
3. Connect your wallet in the app header.

## Environment variables

Copy `web/.env.example` to `web/.env.local`. Never commit `.env.local` or private keys.

### Market data

| Variable | Required | Description |
|----------|----------|-------------|
| `SOSOVALUE_API_KEY` | Recommended | Live crypto stock catalog, prices, and klines |
| `FINNHUB_API_KEY` | Optional | Supplemental company news |
| `CRYPTOPANIC_API_KEY` | Optional | Crypto news feed |

### On chain contracts

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_STOCK_VAULT_ADDRESS` | For spot trading | Deployed `StockVault` address (client) |
| `STOCK_VAULT_ADDRESS` | For oracle sync | Same vault address (server) |
| `NEXT_PUBLIC_PERP_ENGINE_ADDRESS` | For perps | Deployed `PerpEngine` address (client) |
| `PERP_ENGINE_ADDRESS` | For perp sync | Same perp engine address (server) |
| `PRIVATE_KEY` | Deploy / sync only | Owner wallet. **Never commit** |

### Operations & security

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_API_KEY` | Production | Protects admin POST routes (`x-admin-key` header) |
| `ORACLE_SYNC_INTERVAL_MS` | Optional | Auto oracle sync interval (default `60000`) |
| `NEWS_SYNC_INTERVAL_MS` | Optional | Background news sync interval (default `600000`) |

### Perp mark engine

| Variable | Default | Description |
|----------|---------|-------------|
| `PERP_MARK_MODE` | `live` | `live` = index based marks; `gbm` = demo simulator |
| `PERP_INDEX_POLL_MS` | `400` | Index price poll interval |
| `PERP_ORACLE_SYNC_INTERVAL_MS` | `5000` | On chain perp oracle push interval |

### Database (optional)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEON_DATABASE_URL` | Optional | Neon Postgres connection string |
| `NEON_ENABLED` | `1` | Set to `0` to disable Neon locally |

## Smart contracts

Contracts live in `contracts/` and are built with Foundry.

```bash
cd contracts
forge build
forge test
```

### Deploy spot vault

```bash
cd web
npm run deploy:vault
```

Add the printed address to `.env.local` as `NEXT_PUBLIC_STOCK_VAULT_ADDRESS` and `STOCK_VAULT_ADDRESS`.

### Deploy perp engine

```bash
cd contracts
forge script script/DeployPerp.s.sol --rpc-url https://rpc.testnet.arc.network --broadcast
```

Add the deployed address to `.env.local` as `NEXT_PUBLIC_PERP_ENGINE_ADDRESS` and `PERP_ENGINE_ADDRESS`.

### Sync oracle prices

```bash
cd web
npm run sync-prices
```

Or trigger sync from the trade panel, or via `POST /api/oracle/sync-prices` with the admin key.

## Application routes

| Route | Description |
|-------|-------------|
| `/` | Markets dashboard: sectors, stock list, live prices |
| `/stock/[ticker]` | Spot detail: chart, overview, trade panel, ticker news |
| `/perp` | Perpetual markets list |
| `/perp/[ticker]` | Perp detail: live mark chart, open/close positions |
| `/portfolio` | Holdings, perp positions, P&L, closed trade history |
| `/news` | Aggregated market and crypto headlines |
| `/news/[id]` | Full article view |
| `/agent` | Trading agent (coming soon) |

## NPM scripts

Run from `web/`:

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run sync-prices` | Push SoSoValue prices to vault oracle |
| `npm run sync-news` | Ingest news into local store |
| `npm run warm-cache` | Prewarm market snapshot cache |
| `npm run deploy:vault` | Deploy StockVault to Arc Testnet |

## Project structure

```
loop/
├── contracts/
│   ├── src/
│   │   ├── StockVault.sol      # USDC reserved spot ledger
│   │   └── PerpEngine.sol      # Cash settled perpetual futures
│   ├── script/                 # Foundry deploy scripts
│   └── test/
│
└── web/
    ├── public/                 # Static assets (logo, etc.)
    ├── scripts/                # Deploy, sync, and cache utilities
    └── src/
        ├── app/                # Next.js App Router pages & API routes
        ├── components/         # UI components
        ├── hooks/              # React hooks (wallet, perp marks, balances)
        └── lib/                # Market data, perp engine, oracle, news, portfolio
```

## Network reference

| Property | Value |
|----------|-------|
| Network | Arc Testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |
| Gas token | USDC |
| Faucet | [faucet.circle.com](https://faucet.circle.com) |

## Security

* Keep `PRIVATE_KEY` and `ADMIN_API_KEY` out of version control.
* Admin routes (`oracle sync`, `perp liquidate`, `news sync`) require the `x-admin-key` header when `ADMIN_API_KEY` is set.
* The perp mark API is read only from the client; engine state is advanced server side.
* Content Security Policy and security headers are configured in `web/next.config.ts`.

This software is provided for **testnet use**. Audit contracts and operational keys before any mainnet deployment.

## License

See repository license files. Third party dependencies retain their respective licenses.

## Documentation

Full product and technical guide (architecture, trading flows, API, deployment, security):

* **GitBook** (recommended public docs) — connect the `docs/` folder via [GitHub Sync](https://gitbook.com/docs/getting-started/git-sync/enabling-github-sync); set Project directory to `docs`
* [docs/LOOP_DOCUMENTATION.md](docs/LOOP_DOCUMENTATION.md) — single-file Markdown export
* [docs/LOOP_Documentation.pdf](docs/LOOP_Documentation.pdf) — PDF

After publishing on GitBook, set `NEXT_PUBLIC_DOCS_URL` in Vercel to show a Documentation link in the app menu.

## Links

* [Arc documentation](https://docs.arc.io)
* [SoSoValue API](https://sosovalue.gitbook.io/soso-value-api-doc)
* [Foundry book](https://book.getfoundry.sh)
