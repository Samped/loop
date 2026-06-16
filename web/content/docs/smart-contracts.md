# Smart contracts

Source: `contracts/` (Foundry).

### StockVault.sol

USDC reserved synthetic stock ledger.

| Field | Detail |
|-------|--------|
| Collateral | USDC (6 decimals) |
| Shares | 18 decimal ledger units per ticker |
| Pricing | `prices[ticker]` in USDC per share (6 decimals) |
| Roles | `owner`, `oracle` |
| Operations | `buy`, `sell`, `setPrice`, `depositReserve` |

Solvency: vault USDC must cover all synthetic liability at oracle prices.

### PerpEngine.sol

Cash settled perpetual futures, separate from spot.

| Field | Detail |
|-------|--------|
| Margin | USDC |
| Markets | Per ticker leverage, maintenance margin, open interest caps |
| Funding | 8 hour intervals, cumulative funding index |
| Liquidation | Maintenance breach; liquidator bonus (250 bps) |
| Oracle staleness | 5 minutes max |

Deploy scripts: `contracts/script/`. Run tests with `forge test`.

### Deploy

Spot vault (from `web/`):

```bash
npm run deploy:vault
```

Perp engine (from `contracts/`):

```bash
forge script script/DeployPerp.s.sol --rpc-url https://rpc.testnet.arc.network --broadcast
```

Record addresses in [environment variables](environment-variables.md).
