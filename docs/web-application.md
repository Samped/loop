# Web application


### Tech stack

| Layer | Technologies |
|-------|----------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Wallet | wagmi 3, viem 2, TanStack Query |
| Database | Neon Postgres (optional) |
| Tooling | TypeScript, ESLint, tsx for scripts |

### Project structure

```
loop/
├── contracts/           # Solidity + Foundry
│   ├── src/
│   │   ├── StockVault.sol
│   │   └── PerpEngine.sol
│   └── script/
└── web/
    ├── public/          # Logo, favicon, static assets
    ├── scripts/         # sync-prices, sync-news, deploy helpers
    └── src/
        ├── app/         # Pages and API routes
        ├── components/  # UI components
        ├── hooks/       # Wallet, perp marks, balances
        └── lib/         # Core business logic
```

### Key libraries (`web/src/lib`)

| Module | Purpose |
|--------|---------|
| `sosovalue.ts` | SoSoValue API client and parallel snapshot fetch |
| `market-cold-start.ts` | Full catalog prefetch on server boot |
| `perp-mark-engine.ts` | Live mark computation |
| `perp-mark-history-store.ts` | Mark history (local JSON + Neon) |
| `news-syncer.ts` | Multi-source news ingestion |
| `neon-guard.ts` | Circuit breaker for database calls |
| `arc-public-client.ts` | RPC client with timeout |
