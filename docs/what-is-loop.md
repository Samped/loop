# What is Loop?


**Loop** is a full-stack web application for trading **SoSoValue-indexed crypto stocks** on **Arc Testnet**. It combines live market data, news, and portfolio views with on-chain settlement in **USDC**.

Loop does **not** custody real-world equity tokens. Instead, it offers:

| Product | Description |
|---------|-------------|
| **Synthetic spot** | Buy and sell synthetic shares through a USDC-collateralized vault (`StockVault.sol`). Prices follow external oracles; settlement is in USDC. |
| **Perpetual futures** | Open leveraged long or short positions on selected tickers via `PerpEngine.sol`. Positions are cash-settled against mark prices. |
| **Market intelligence** | Sector views, live prices, charts, and aggregated news from multiple providers. |
| **Portfolio** | Unified view of wallet USDC, spot holdings, open perp positions, and closed trade history. |

The app is built for **testnet experimentation**. Contracts, keys, and operational flows should be audited before any mainnet use.
