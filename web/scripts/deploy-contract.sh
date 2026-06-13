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
  echo "Error: PRIVATE_KEY is not set in web/.env.local"
  exit 1
fi

export PATH="${HOME}/.foundry/bin:${PATH}"

echo "Deploying StockExchange to Arc Testnet…"
cd "$CONTRACTS"
DEPLOY_OUTPUT=$(forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast 2>&1)
echo "$DEPLOY_OUTPUT"

ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE '0x[a-fA-F0-9]{40}' | tail -1)

if [ -z "$ADDRESS" ]; then
  echo "Could not parse deployed address from output"
  exit 1
fi

echo ""
echo "Deployed StockExchange at: $ADDRESS"
echo ""
echo "Add to web/.env.local:"
echo "NEXT_PUBLIC_STOCK_EXCHANGE_ADDRESS=$ADDRESS"
echo "STOCK_EXCHANGE_ADDRESS=$ADDRESS"
