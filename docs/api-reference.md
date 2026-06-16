# API reference


Public read endpoints (representative list):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/market/bootstrap` | GET | Initial market payload (sectors, stocks, snapshots) |
| `/api/market/stocks` | GET | Stock list |
| `/api/market/snapshots` | GET | All snapshots |
| `/api/market/snapshot/[ticker]` | GET | Single ticker snapshot |
| `/api/market/klines/[ticker]` | GET | Chart candles |
| `/api/market/prices/stream` | GET | SSE price stream |
| `/api/perp/mark/[ticker]` | GET | Current perp mark (read-only) |
| `/api/perp/quote/[ticker]` | GET | Open/close quote helpers |
| `/api/perp/positions/[address]` | GET | On-chain perp positions |
| `/api/portfolio/[address]` | GET | Aggregated portfolio |
| `/api/news` | GET | News list |
| `/api/news/article/[id]` | GET | Single article |

Admin or rate-limited endpoints (require `x-admin-key` when `ADMIN_API_KEY` is set):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/oracle/sync-prices` | POST | Push spot oracle prices |
| `/api/perp/sync-prices` | POST | Push perp mark prices |
| `/api/perp/liquidate` | POST | Trigger liquidation txs |
| `/api/news/sync` | POST | Run news ingestion |

**Nudge endpoints** (`/api/oracle/nudge`, `/api/perp/nudge`) let the UI request a sync without exposing admin keys client-side; they are rate-limited server-side.
