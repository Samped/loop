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
