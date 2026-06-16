# Data sources & market intelligence


| Provider | Used for |
|----------|----------|
| **SoSoValue** | Stock catalog, snapshots, klines, primary news |
| **Finnhub** | Supplemental company news and perp index prices |
| **CryptoPanic** | Crypto-related headlines |
| **RSS** | Google News, CoinDesk fallbacks when API keys are absent |

### Caching

- Market snapshots and bootstrap payloads are cached server-side.
- News is ingested on a schedule (`NEWS_SYNC_INTERVAL_MS`) and on demand.
- Demo fallbacks apply when `SOSOVALUE_API_KEY` is missing (limited ticker set).
