# How trading works


### Spot buy flow

```
User wallet                    StockVault (on-chain)              Oracle / server
     |                                |                                  |
     |-- approve USDC ---------------->|                                  |
     |-- buy(ticker, usdc, minShares) ->|                                  |
     |                                |-- reads price[ticker]             |
     |                                |<---------------------------------|
     |                                |-- transfer USDC in               |
     |                                |-- credit holdings[user][ticker]  |
     |<-- synthetic shares credited ---|                                  |
```

1. User connects wallet and approves USDC spend.
2. User submits `buy` with USDC amount and slippage protection.
3. Contract uses the current oracle price to mint ledger shares.
4. Vault must remain **solvent**: USDC balance ≥ sum of (circulating shares × price) for all tickers.

### Spot sell flow

1. User submits `sell` with share amount and minimum USDC out.
2. Contract burns shares and transfers USDC from vault reserves.
3. Transaction reverts if reserves are insufficient.

### Perp open flow

1. User selects side (long/short), size, and margin.
2. Contract checks leverage, open interest caps, and oracle freshness.
3. Position is stored; margin is locked in the engine.

### Perp close / liquidation

- **Close:** User closes fully or partially; realized P&L and remaining margin are settled in USDC.
- **Liquidation:** Third parties can liquidate under-margined positions and receive a bonus from the insurance fund.

### Mark price engine (perps)

The server runs a **mark engine** (`PERP_MARK_MODE`):

| Mode | Behavior |
|------|----------|
| `live` (default) | Index from Finnhub + SoSoValue median; basis and microstructure model produce tradable marks. |
| `gbm` | Demo stochastic simulator for testnet demos without live feeds. |

Marks are exposed read-only via `/api/perp/mark/[ticker]` and pushed to `PerpEngine` on an interval (`PERP_ORACLE_SYNC_INTERVAL_MS`).
