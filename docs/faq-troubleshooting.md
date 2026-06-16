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
