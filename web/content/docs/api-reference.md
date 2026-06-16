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
