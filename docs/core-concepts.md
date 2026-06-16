# Core concepts


### Crypto stocks (SoSoValue index)

Loop lists instruments that track companies commonly held in crypto treasury or mining portfolios (e.g. MSTR, COIN, MARA). **SoSoValue** provides the index catalog, snapshots, klines, and reference prices. The app can list **100+ tickers** when `SOSOVALUE_API_KEY` is configured.

### Synthetic vs tokenized equity

Loop uses **synthetic, cash-settled** exposure:

- **Spot:** The vault holds USDC reserves. When you buy, USDC is locked and you receive ledger shares at the oracle price. When you sell, shares are burned and USDC is returned.
- **Perps:** You post USDC margin. P&L is computed against mark prices; no shares change hands on-chain.

This is **not** wrapped stock tokens or direct equity ownership.

### Arc Testnet

| Property | Value |
|----------|-------|
| Network | Arc Testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | [testnet.arcscan.app](https://testnet.arcscan.app) |
| Gas token | USDC (native gas) |

### Oracle prices

On-chain contracts read prices from a designated **oracle address**. The Loop server (using `PRIVATE_KEY`) periodically pushes SoSoValue (spot) and computed mark (perp) prices to the contracts. Users’ trades execute at the prices stored on-chain at transaction time.
