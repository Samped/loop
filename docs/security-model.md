# Security model


| Topic | Practice |
|-------|----------|
| Secrets | `PRIVATE_KEY` and `ADMIN_API_KEY` only on server; never in client bundles |
| Admin routes | Require `x-admin-key` header when `ADMIN_API_KEY` is set |
| Perp marks | Read-only from browser; engine runs server-side |
| Rate limits | Bootstrap, oracle sync, news sync, and nudge endpoints are rate-limited |
| CSP | Content Security Policy in `next.config.ts` |
| User funds | Users sign all trades with their own wallet; app does not custody keys |

`PRIVATE_KEY` is used for **oracle price updates and operational txs**, not for user login or trading on behalf of users.
