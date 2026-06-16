# System architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Loop client                             │
│              Next.js 16 · React 19 · wagmi · viem               │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
    ┌────────▼────────┐             ┌────────▼────────┐
    │  Market & news  │             │  Arc Testnet    │
    │  data providers │             │  (chain 5042002)│
    └────────┬────────┘             └────────┬────────┘
             │                               │
   SoSoValue · Finnhub              StockVault.sol
   CryptoPanic · RSS                 PerpEngine.sol
             │                               │
             └──────── optional ────────────┘
                        Neon Postgres
              (perp mark history · closed trades)
```

### Layers

| Layer | Role |
|-------|------|
| Client | React pages, wagmi wallet connection |
| API | Next.js route handlers for market data, perp quotes, oracle sync, news |
| Services | `src/lib`: caching, SoSoValue client, perp mark engine, news sync, portfolio |
| Persistence | In-memory and file caches; optional Neon for perp history |
| Chain | viem with RPC timeouts; user txs via wallet; server txs via `PRIVATE_KEY` |

### Stack

Next.js 16 (App Router), React 19, Tailwind CSS 4, wagmi 3, viem 2, TanStack Query. Contracts in `contracts/` (Solidity 0.8.24, Foundry). App code in `web/src/` (`app/`, `components/`, `hooks/`, `lib/`).

### Runtime behavior

Cache-first APIs return warm data and refresh in the background. A Neon circuit breaker prevents database timeouts from blocking requests. Market cold start prefetches the full catalog in parallel (~8–12s on Vercel). Arc RPC calls use explicit timeouts.
