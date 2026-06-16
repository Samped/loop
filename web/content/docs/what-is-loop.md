# What is Loop?

Loop connects SoSoValue market data to on-chain settlement on Arc Testnet. Users trade synthetic exposure to crypto stocks; collateral and P&L settle in USDC.

Loop does not issue wrapped equity tokens or hold real-world shares. Products:

| Product | Description |
|---------|-------------|
| Spot | Synthetic shares via `StockVault.sol`, a USDC reserved ledger priced by the on-chain oracle |
| Perpetuals | Cash settled long/short positions on `PerpEngine.sol` against mark prices |
| Markets | Sector views, snapshots, klines, and live price streams |
| News | Headlines from SoSoValue, Finnhub, CryptoPanic, and RSS |
| Portfolio | Wallet USDC, spot holdings, perp positions, and closed trade history |

The current deployment targets Arc Testnet. Operational keys and contracts require a full audit before production use on mainnet.
