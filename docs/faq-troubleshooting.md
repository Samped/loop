# FAQ & troubleshooting


### Only a few stocks show on production

- Confirm `SOSOVALUE_API_KEY` is set in Vercel Production.
- Check `/api/market/bootstrap` response: `source` should be `sosovalue`, not `demo`.
- Cold start may take ~8–12 seconds for the full catalog.

### Trades fail or prices look stale

- Run oracle sync: `npm run sync-prices` or POST `/api/oracle/sync-prices`.
- Verify `STOCK_VAULT_ADDRESS` / `PERP_ENGINE_ADDRESS` and `PRIVATE_KEY` on the server.
- Ensure oracle address on-chain matches the server wallet.

### Database timeouts

- Set `NEON_ENABLED=0` locally if Neon is unreachable.
- Production uses a circuit breaker; mark history falls back to local JSON.

### Perp page shows fewer than 5 markets

- Only **MSTR, COIN, HOOD, MARA, RIOT** are deployed on `PerpEngine`.
- Other tickers are spot-only unless new markets are configured on-chain.

### News not updating

- Trigger sync via admin or wait for `NEWS_SYNC_INTERVAL_MS`.
- News page polls automatically; use Refresh if needed.


## Document information

This document describes the Loop application as of June 2026. For the latest code-level details, see the repository README and inline source comments.

**Support links**

- [Arc documentation](https://docs.arc.io)
- [SoSoValue API](https://sosovalue.gitbook.io/soso-value-api-doc)
- [Foundry book](https://book.getfoundry.sh)
- [Circle Faucet](https://faucet.circle.com)


*Loop — Crypto stock trading on Arc Testnet.*
