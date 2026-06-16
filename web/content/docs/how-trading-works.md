# How trading works

### Spot buy

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

1. User approves USDC spend.
2. User calls `buy` with amount and slippage bounds.
3. The contract mints ledger shares at the stored oracle price.
4. The vault must stay solvent: USDC balance ≥ Σ(circulating shares × price) per ticker.

### Spot sell

1. User calls `sell` with share amount and minimum USDC out.
2. The contract burns shares and transfers USDC from reserves.
3. Reverts if reserves are insufficient.

### Perp open

1. User selects side, size, and margin.
2. The contract enforces leverage limits, open interest caps, and oracle freshness.
3. Margin is locked; the position is recorded on-chain.

### Perp close and liquidation

Close: full or partial exit. Realized P&L and remaining margin settle in USDC.

Liquidation: under-margined positions can be closed by third parties for a bonus from the insurance fund.

### Mark engine

`PERP_MARK_MODE` controls mark computation:

| Mode | Behavior |
|------|----------|
| `live` | Index from Finnhub and SoSoValue median; basis model produces tradable marks |
| `gbm` | Stochastic simulator for testnet demos without live feeds |

Marks are read-only at `/api/perp/mark/[ticker]`. The server pushes to `PerpEngine` on `PERP_ORACLE_SYNC_INTERVAL_MS`.
