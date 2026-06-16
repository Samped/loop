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
