# Smart contracts


Location: `contracts/` (Foundry)

### StockVault.sol

USDC-reserved synthetic stock ledger.

| Concept | Detail |
|---------|--------|
| Collateral | USDC (6 decimals) |
| Shares | 18-decimal ledger units per ticker |
| Pricing | `prices[ticker]` in USDC per share (6 decimals) |
| Roles | `owner`, `oracle` |
| Key ops | `buy`, `sell`, `setPrice`, `depositReserve` |

Solvency invariant: vault USDC must cover all outstanding synthetic liability at oracle prices.

### PerpEngine.sol

Independent cash-settled perpetual futures.

| Concept | Detail |
|---------|--------|
| Margin | USDC |
| Markets | Per-ticker config: leverage, maintenance margin, OI caps |
| Funding | 8-hour intervals; cumulative funding index |
| Liquidation | Maintenance margin breach; liquidator bonus (2.5% bps config) |
| Oracle staleness | Max 5 minutes |

Deploy scripts: `contracts/script/`  
Tests: `forge test`

### Deploy commands

**Spot vault** (from `web/`):

```bash
npm run deploy:vault
```

**Perp engine** (from `contracts/`):

```bash
forge script script/DeployPerp.s.sol --rpc-url https://rpc.testnet.arc.network --broadcast
```

Add deployed addresses to environment variables (see Section 11).
