# Features walkthrough


### Markets dashboard (`/`)

- Browse crypto stocks by sector.
- See live or cached snapshots (price, change, volume).
- Navigate to individual stock detail pages.
- On cold start, the server prefetches the full catalog in parallel so the list loads in seconds on production.

### Stock detail (`/stock/[ticker]`)

- Price chart (klines from SoSoValue).
- Company overview and key stats.
- **Trade panel:** connect wallet, buy/sell synthetic shares via `StockVault`.
- Ticker-specific news.

### Perpetual markets (`/perp`, `/perp/[ticker]`)

Supported perp tickers (configured at deploy time):

**MSTR, COIN, HOOD, MARA, RIOT**

- Live mark chart (server-side mark engine).
- Open long/short with leverage up to market limits.
- Add/remove margin, close positions.
- Funding and liquidation follow `PerpEngine` rules.

### Portfolio (`/portfolio`)

- USDC balance on Arc.
- Spot holdings per ticker.
- Open perp positions with unrealized P&L.
- Closed trade history (stored locally and optionally in Neon Postgres).

### News (`/news`, `/news/[id]`)

- Headlines from SoSoValue, Finnhub, CryptoPanic, and RSS fallbacks.
- Background sync and client polling keep the feed fresh.
- Full article view for stored items.

### Agent (`/agent`)

- Placeholder for a future trading agent experience.
