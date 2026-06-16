# Core concepts

### Crypto stocks

Loop lists instruments from the SoSoValue crypto stock index: companies commonly held in crypto treasury or mining portfolios (MSTR, COIN, MARA, and others). SoSoValue supplies the catalog, snapshots, klines, and reference prices. With `SOSOVALUE_API_KEY` configured, the app lists 100+ tickers.

### Synthetic settlement

Spot: the vault holds USDC reserves. A buy locks USDC and credits ledger shares at the oracle price. A sell burns shares and returns USDC.

Perps: the user posts USDC margin. P&L is calculated against mark prices. No share tokens move on-chain.

This is not tokenized equity or direct stock ownership.

### Arc Testnet

| Property | Value |
|----------|-------|
| Network | Arc Testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |
| Gas token | USDC |

### Oracle prices

Contracts read prices from a designated oracle address. The Loop server signs price updates with `PRIVATE_KEY`, pushing SoSoValue quotes for spot and computed marks for perps. Trades execute at the on-chain price at transaction time.
