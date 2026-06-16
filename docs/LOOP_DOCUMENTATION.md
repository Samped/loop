# Loop

Loop is a trading interface for SoSoValue indexed crypto stocks on Arc Testnet. Users hold synthetic spot positions and perpetual futures with USDC settlement.

**App:** [loopfiapp.xyz](https://loopfiapp.xyz)  
**Source:** [github.com/Samped/loop](https://github.com/Samped/loop)

Start with [What is Loop?](what-is-loop.md), [Local development](local-development.md), or the [API reference](api-reference.md).

Testnet only. Audit contracts before mainnet use.

---

# What is Loop?

Loop connects SoSoValue market data to on-chain settlement on Arc Testnet. Users trade synthetic exposure to crypto stocks; collateral and P&L settle in USDC.

Loop does not issue wrapped equity tokens or hold real-world shares. Products:

| Product | Description |
|---------|-------------|
| Spot | Synthetic shares via `StockVault.sol`, a USDC reserved ledger priced by the on-chain oracle |
| Perpetuals | Cash settled long/short positions on `PerpEngine.sol` against mark prices |
| Markets | Sector views, snapshots, klines, and live price streams |
| News | Headlines from SoSoValue, Finnhub, CryptoPanic, and RSS |
| Portfolio | Wallet USDC, spot holdings, perp positions, and closed trade history |

The current deployment targets Arc Testnet. Operational keys and contracts require a full audit before production use on mainnet.

---

# Who is it for?

Loop serves traders who want synthetic equity exposure on a USDC native chain, developers integrating oracle priced vaults and perp engines, and teams evaluating Arc Testnet for DeFi settlement.

Requirements: an EIP-1193 wallet (e.g. MetaMask), Arc Testnet configured, and testnet USDC from the [Circle Faucet](https://faucet.circle.com).

---

# Core concepts

### Crypto stocks

Loop lists instruments from the SoSoValue crypto stock index: companies commonly held in crypto treasury or mining portfolios (MSTR, COIN, MARA, and others). SoSoValue supplies the catalog, snapshots, klines, and reference prices. With `SOSOVALUE_API_KEY` configured, the app lists 100+ tickers.

### Synthetic settlement

Spot: the vault holds USDC reserves. A buy locks USDC and credits ledger shares at the oracle price. A sell burns shares and returns USDC.

Perps: the user posts USDC margin. P&L is calculated against mark prices. No share tokens move on-chain.

This is not tokenized equity or direct stock ownership.

### Arc Testnet

| Property | Value |
|----------|-------|
| Network | Arc Testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |
| Gas token | USDC |

### Oracle prices

Contracts read prices from a designated oracle address. The Loop server signs price updates with `PRIVATE_KEY`, pushing SoSoValue quotes for spot and computed marks for perps. Trades execute at the on-chain price at transaction time.

---

# Features

### Markets (`/`)

Browse crypto stocks by sector. Snapshots show price, change, and volume from cache or live feeds. The server prefetches the full catalog on cold start so production loads the complete list within seconds.

### Stock detail (`/stock/[ticker]`)

Kline charts, company overview, a trade panel for `StockVault` buy/sell, and ticker news.

### Perpetuals (`/perp`, `/perp/[ticker]`)

Deployed perp markets: **MSTR, COIN, HOOD, MARA, RIOT**.

Mark chart, long/short entry, margin add/remove, position close. Funding and liquidation follow `PerpEngine` rules.

### Portfolio (`/portfolio`)

Arc USDC balance, spot holdings, open perp positions with unrealized P&L, and closed trades (local store or Neon Postgres).

### News (`/news`, `/news/[id]`)

Aggregated headlines with background sync and client polling. Stored articles open in full view.

### Agent (`/agent`)

Reserved for a future trading agent.

---

# How trading works

### Spot buy

```
User wallet                    StockVault (on-chain)              Oracle / server
     |                                |                                  |
     |-- approve USDC ---------------->|                                  |
     |-- buy(ticker, usdc, minShares) ->|                                  |
     |                                |-- reads price[ticker]             |
     |                                |<---------------------------------|
     |                                |-- transfer USDC in               |
     |                                |-- credit holdings[user][ticker]  |
     |<-- synthetic shares credited ---|                                  |
```

1. User approves USDC spend.
2. User calls `buy` with amount and slippage bounds.
3. The contract mints ledger shares at the stored oracle price.
4. The vault must stay solvent: USDC balance ≥ Σ(circulating shares × price) per ticker.

### Spot sell

1. User calls `sell` with share amount and minimum USDC out.
2. The contract burns shares and transfers USDC from reserves.
3. Reverts if reserves are insufficient.

### Perp open

1. User selects side, size, and margin.
2. The contract enforces leverage limits, open interest caps, and oracle freshness.
3. Margin is locked; the position is recorded on-chain.

### Perp close and liquidation

Close: full or partial exit. Realized P&L and remaining margin settle in USDC.

Liquidation: under-margined positions can be closed by third parties for a bonus from the insurance fund.

### Mark engine

`PERP_MARK_MODE` controls mark computation:

| Mode | Behavior |
|------|----------|
| `live` | Index from Finnhub and SoSoValue median; basis model produces tradable marks |
| `gbm` | Stochastic simulator for testnet demos without live feeds |

Marks are read-only at `/api/perp/mark/[ticker]`. The server pushes to `PerpEngine` on `PERP_ORACLE_SYNC_INTERVAL_MS`.

---

# System architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Loop client                             │
│              Next.js 16 · React 19 · wagmi · viem               │
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

### Layers

| Layer | Role |
|-------|------|
| Client | React pages, wagmi wallet connection |
| API | Next.js route handlers for market data, perp quotes, oracle sync, news |
| Services | `src/lib`: caching, SoSoValue client, perp mark engine, news sync, portfolio |
| Persistence | In-memory and file caches; optional Neon for perp history |
| Chain | viem with RPC timeouts; user txs via wallet; server txs via `PRIVATE_KEY` |

### Stack

Next.js 16 (App Router), React 19, Tailwind CSS 4, wagmi 3, viem 2, TanStack Query. Contracts in `contracts/` (Solidity 0.8.24, Foundry). App code in `web/src/` (`app/`, `components/`, `hooks/`, `lib/`).

### Runtime behavior

Cache-first APIs return warm data and refresh in the background. A Neon circuit breaker prevents database timeouts from blocking requests. Market cold start prefetches the full catalog in parallel (~8–12s on Vercel). Arc RPC calls use explicit timeouts.

---

# Smart contracts

Source: `contracts/` (Foundry).

### StockVault.sol

USDC reserved synthetic stock ledger.

| Field | Detail |
|-------|--------|
| Collateral | USDC (6 decimals) |
| Shares | 18 decimal ledger units per ticker |
| Pricing | `prices[ticker]` in USDC per share (6 decimals) |
| Roles | `owner`, `oracle` |
| Operations | `buy`, `sell`, `setPrice`, `depositReserve` |

Solvency: vault USDC must cover all synthetic liability at oracle prices.

### PerpEngine.sol

Cash settled perpetual futures, separate from spot.

| Field | Detail |
|-------|--------|
| Margin | USDC |
| Markets | Per ticker leverage, maintenance margin, open interest caps |
| Funding | 8 hour intervals, cumulative funding index |
| Liquidation | Maintenance breach; liquidator bonus (250 bps) |
| Oracle staleness | 5 minutes max |

Deploy scripts: `contracts/script/`. Run tests with `forge test`.

### Deploy

Spot vault (from `web/`):

```bash
npm run deploy:vault
```

Perp engine (from `contracts/`):

```bash
forge script script/DeployPerp.s.sol --rpc-url https://rpc.testnet.arc.network --broadcast
```

Record addresses in [environment variables](environment-variables.md).

---

# Data sources

| Provider | Role |
|----------|------|
| SoSoValue | Stock catalog, snapshots, klines, primary news |
| Finnhub | Company news, perp index prices |
| CryptoPanic | Crypto headlines |
| RSS | Google News, CoinDesk when API keys are absent |

Market snapshots and bootstrap payloads are cached server-side. News ingests on `NEWS_SYNC_INTERVAL_MS` and on demand. Without `SOSOVALUE_API_KEY`, the app falls back to a limited demo ticker set.

---

# API reference

### Public (read)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/market/bootstrap` | GET | Sectors, stocks, snapshots |
| `/api/market/stocks` | GET | Stock list |
| `/api/market/snapshots` | GET | All snapshots |
| `/api/market/snapshot/[ticker]` | GET | Single snapshot |
| `/api/market/klines/[ticker]` | GET | Chart candles |
| `/api/market/prices/stream` | GET | SSE price stream |
| `/api/perp/mark/[ticker]` | GET | Perp mark (read only) |
| `/api/perp/quote/[ticker]` | GET | Open/close quotes |
| `/api/perp/positions/[address]` | GET | On-chain perp positions |
| `/api/portfolio/[address]` | GET | Portfolio aggregate |
| `/api/news` | GET | News list |
| `/api/news/article/[id]` | GET | Single article |

### Admin (rate limited)

Require header `x-admin-key` when `ADMIN_API_KEY` is set.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/oracle/sync-prices` | POST | Push spot oracle prices |
| `/api/perp/sync-prices` | POST | Push perp marks |
| `/api/perp/liquidate` | POST | Liquidation transactions |
| `/api/news/sync` | POST | News ingestion |

`/api/oracle/nudge` and `/api/perp/nudge` trigger sync from the UI without exposing admin keys. Both are rate limited.

---

# Environment variables

Copy `web/.env.example` to `web/.env.local`. Do not commit secrets.

### Market data

| Variable | Required | Description |
|----------|----------|-------------|
| `SOSOVALUE_API_KEY` | Recommended | Live catalog and prices |
| `FINNHUB_API_KEY` | Optional | News and perp index |
| `CRYPTOPANIC_API_KEY` | Optional | Crypto news |

### Contracts

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_STOCK_VAULT_ADDRESS` | Spot vault (client) |
| `STOCK_VAULT_ADDRESS` | Spot vault (server sync) |
| `NEXT_PUBLIC_PERP_ENGINE_ADDRESS` | Perp engine (client) |
| `PERP_ENGINE_ADDRESS` | Perp engine (server) |
| `PRIVATE_KEY` | Server wallet for deploy and oracle sync |

### Operations

| Variable | Description |
|----------|-------------|
| `ADMIN_API_KEY` | Protects admin POST routes |
| `ORACLE_SYNC_INTERVAL_MS` | Spot oracle sync (default 60000) |
| `NEWS_SYNC_INTERVAL_MS` | News sync (default 600000) |
| `NEON_DATABASE_URL` | Optional Postgres |
| `NEON_ENABLED` | Set `0` to disable Neon locally |
| `NEXT_PUBLIC_DOCS_URL` | GitBook URL for in-app docs link |

Perp mark parameters (`PERP_MARK_MODE`, `PERP_INDEX_POLL_MS`, `PERP_ORACLE_SYNC_INTERVAL_MS`, and others) are documented in `web/.env.example`.

---

# Local development

### Prerequisites

Node.js 20+, npm, Foundry (contracts), wallet on Arc Testnet with testnet USDC.

### Setup

```bash
git clone https://github.com/Samped/loop.git
cd loop/web
npm install
cp .env.example .env.local
# Set API keys and contract addresses in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run sync-prices` | Push spot prices to vault |
| `npm run sync-news` | Ingest news |
| `npm run warm-cache` | Prewarm snapshots |
| `npm run deploy:vault` | Deploy StockVault |

### Wallet

1. Add Arc Testnet: chain ID `5042002`, RPC `https://rpc.testnet.arc.network`.
2. Fund from [faucet.circle.com](https://faucet.circle.com).
3. Connect via the app header.

---

# Deployment

### Vercel

Deploy from the `web/` directory. `vercel.json` sets function timeouts.

1. Link the repo; set root directory to `web`.
2. Add production environment variables (see [environment variables](environment-variables.md)).
3. Deploy to preview and production.

Full market catalog on production requires `SOSOVALUE_API_KEY` and contract addresses. `NEON_DATABASE_URL` is optional.

### Custom domain

Point the apex A record to Vercel (`76.76.21.21`). Production URL: `https://loopfiapp.xyz`. Avoid apex to `www` redirects until `www` DNS is configured.

### Background jobs

Oracle sync, news sync, and mark engine ticks start in `instrumentation.ts` on server boot. For reliable schedules on serverless, use Vercel Cron against the nudge endpoints or an external worker.

### GitBook

Docs sync from the `docs/` folder via GitHub.

1. Create a space at [gitbook.com](https://www.gitbook.com).
2. Configure → GitHub Sync → install the GitBook app on `Samped/loop`.
3. Branch `main`, **project directory `docs`**.
4. Initial sync: GitHub → GitBook, then Publish.

Optional domain: `docs.loopfiapp.xyz` (CNAME from GitBook settings). Set `NEXT_PUBLIC_DOCS_URL` in Vercel for the in-app docs link.

---

# Security

| Topic | Practice |
|-------|----------|
| Secrets | `PRIVATE_KEY` and `ADMIN_API_KEY` server only; never in client bundles |
| Admin routes | `x-admin-key` header when `ADMIN_API_KEY` is set |
| Perp marks | Read only from the client; engine runs server side |
| Rate limits | Bootstrap, sync, and nudge endpoints |
| CSP | Configured in `next.config.ts` |
| User funds | Users sign their own transactions; Loop does not custody wallets |

`PRIVATE_KEY` signs oracle updates and operational transactions. It is not used for user authentication or delegated trading.

---

# Glossary

| Term | Definition |
|------|------------|
| Crypto stock | Instrument in the SoSoValue crypto stock index |
| Synthetic spot | Ledger shares in StockVault, backed by USDC reserves |
| Mark price | Perp reference for P&L and liquidation |
| Index price | External feed underlying the mark |
| Funding | Periodic payment between longs and shorts |
| Oracle | On-chain address authorized to set prices |
| Solvency | Vault USDC ≥ synthetic liabilities at oracle prices |

---

# FAQ

### Few stocks on production

Check `SOSOVALUE_API_KEY` in Vercel Production. `GET /api/market/bootstrap` should return `"source": "sosovalue"`, not `"demo"`. Cold start can take 8–12 seconds for the full catalog.

### Stale prices or failed trades

Run `npm run sync-prices` or `POST /api/oracle/sync-prices`. Confirm `STOCK_VAULT_ADDRESS`, `PERP_ENGINE_ADDRESS`, and `PRIVATE_KEY`. The on-chain oracle address must match the server wallet.

### Database timeouts

Set `NEON_ENABLED=0` locally when Neon is unreachable. Production falls back to local JSON via the circuit breaker.

### Fewer than five perp markets

Only MSTR, COIN, HOOD, MARA, and RIOT are configured on `PerpEngine`. Other tickers are spot only until new markets are deployed.

### News not updating

Wait for `NEWS_SYNC_INTERVAL_MS`, trigger admin sync, or use Refresh on the news page.

### References

[Arc docs](https://docs.arc.io) · [SoSoValue API](https://sosovalue.gitbook.io/soso-value-api-doc) · [Foundry](https://book.getfoundry.sh) · [Circle Faucet](https://faucet.circle.com)
