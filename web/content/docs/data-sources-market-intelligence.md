# Data sources

| Provider | Role |
|----------|------|
| SoSoValue | Stock catalog, snapshots, klines, primary news |
| Finnhub | Company news, perp index prices |
| CryptoPanic | Crypto headlines |
| RSS | Google News, CoinDesk when API keys are absent |

Market snapshots and bootstrap payloads are cached server-side. News ingests on `NEWS_SYNC_INTERVAL_MS` and on demand. Without `SOSOVALUE_API_KEY`, the app falls back to a limited demo ticker set.
