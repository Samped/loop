# Local development

### Prerequisites

Node.js 20+, npm, Foundry (contracts), wallet on Arc Testnet with testnet USDC.

### Setup

```bash
git clone https://github.com/Samped/loop.git
cd loop/web
npm install
cp .env.example .env.local
# Set API keys and contract addresses in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run sync-prices` | Push spot prices to vault |
| `npm run sync-news` | Ingest news |
| `npm run warm-cache` | Prewarm snapshots |
| `npm run deploy:vault` | Deploy StockVault |

### Wallet

1. Add Arc Testnet: chain ID `5042002`, RPC `https://rpc.testnet.arc.network`.
2. Fund from [faucet.circle.com](https://faucet.circle.com).
3. Connect via the app header.
