# System architecture


```
┌─────────────────────────────────────────────────────────────────┐
│                     Loop Web Application                        │
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
| **Presentation** | React pages and components; wallet connection via wagmi. |
| **API routes** | Next.js Route Handlers for market data, perp quotes, oracle sync, news. |
| **Services (`src/lib`)** | Caching, SoSoValue client, perp mark engine, news syncer, portfolio aggregation. |
| **Persistence** | In-memory and file caches; optional Neon for durable perp history. |
| **Blockchain** | viem clients with timeouts; user txs via wallet; server txs via `PRIVATE_KEY`. |

### Performance patterns

- **Cache-first APIs** return warm data immediately; background jobs refresh caches.
- **Neon circuit breaker** prevents database timeouts from blocking the server.
- **Parallel market prefetch** loads the full stock catalog on cold start (~8–12s on Vercel).
- **RPC timeouts** on Arc public RPC avoid hanging requests.
