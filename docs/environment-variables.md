# Environment variables


Copy `web/.env.example` to `web/.env.local`. Never commit secrets.

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
| `STOCK_VAULT_ADDRESS` | Spot vault (server oracle sync) |
| `NEXT_PUBLIC_PERP_ENGINE_ADDRESS` | Perp engine (client) |
| `PERP_ENGINE_ADDRESS` | Perp engine (server) |
| `PRIVATE_KEY` | Server wallet for deploy/sync only |

### Operations

| Variable | Description |
|----------|-------------|
| `ADMIN_API_KEY` | Protects admin POST routes |
| `ORACLE_SYNC_INTERVAL_MS` | Spot oracle auto-sync (default 60000) |
| `NEWS_SYNC_INTERVAL_MS` | News background sync (default 600000) |
| `NEON_DATABASE_URL` | Optional Postgres |
| `NEON_ENABLED` | Set `0` to disable Neon locally |

### Perp mark tuning

See `web/.env.example` for `PERP_MARK_MODE`, `PERP_INDEX_POLL_MS`, `PERP_ORACLE_SYNC_INTERVAL_MS`, and related parameters.
