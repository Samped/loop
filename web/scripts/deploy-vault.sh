#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTRACTS="$ROOT/../contracts"

if [ -f "$ROOT/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

if [ -z "${PRIVATE_KEY:-}" ]; then
  echo "PRIVATE_KEY missing in .env.local"
  exit 1
fi

echo "Deploying StockVault to Arc Testnet…"
cd "$CONTRACTS"
forge script script/DeployVault.s.sol:DeployVaultScript \
  --rpc-url https://rpc.testnet.arc.network \
  --broadcast \
  -vv

LATEST="$CONTRACTS/broadcast/DeployVault.s.sol/5042002/run-latest.json"
ADDRESS=$(node -e "
const j=require('$LATEST');
const tx=j.transactions.find(t=>t.contractName==='StockVault');
if(!tx) process.exit(1);
console.log(tx.contractAddress);
")

echo ""
echo "Deployed StockVault at: $ADDRESS"
echo "Add to web/.env.local:"
echo "NEXT_PUBLIC_STOCK_VAULT_ADDRESS=$ADDRESS"
echo "STOCK_VAULT_ADDRESS=$ADDRESS"
