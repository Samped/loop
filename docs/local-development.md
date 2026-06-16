# Local development


### Prerequisites

- Node.js 20+
- npm
- Foundry (for contracts)
- Wallet with Arc Testnet + testnet USDC

### Steps

```bash
git clone https://github.com/Samped/loop.git
cd loop/web
npm install
cp .env.example .env.local
# Edit .env.local with your keys and contract addresses
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run sync-prices` | Push spot prices to vault |
| `npm run sync-news` | Ingest news |
| `npm run warm-cache` | Prewarm snapshot cache |
| `npm run deploy:vault` | Deploy StockVault |

### Wallet setup

1. Add Arc Testnet: Chain ID `5042002`, RPC `https://rpc.testnet.arc.network`.
2. Get USDC from [faucet.circle.com](https://faucet.circle.com).
3. Connect in the app header.
