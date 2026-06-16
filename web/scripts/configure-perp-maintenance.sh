#!/usr/bin/env bash
# Lower perp maintenance margin on the live testnet engine (owner only).
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ -f web/.env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source web/.env.local
  set +a
fi

ENGINE="${PERP_ENGINE_ADDRESS:-${NEXT_PUBLIC_PERP_ENGINE_ADDRESS:-}}"
RPC="${ARC_RPC_URL:-https://rpc.testnet.arc.network}"
PK="${PRIVATE_KEY:-}"

if [[ -z "$ENGINE" || -z "$PK" ]]; then
  echo "Set PERP_ENGINE_ADDRESS and PRIVATE_KEY in web/.env.local"
  exit 1
fi

# configureMarket(ticker, active, maxLeverage, maintenanceMarginBps, maxOpenInterestUsd, fundingRateBps)
# maintenanceMarginBps: 50 = 0.5% of notional (was 250–300 = 2.5–3%)
markets=(
  "MSTR|true|20|50|50000000000|10"
  "COIN|true|20|50|50000000000|10"
  "HOOD|true|15|50|30000000000|10"
  "MARA|true|15|50|30000000000|10"
  "RIOT|true|15|50|30000000000|10"
)

for row in "${markets[@]}"; do
  IFS='|' read -r ticker active maxLev mmBps oi funding <<< "$row"
  echo "Reconfiguring $ticker (maintenance ${mmBps}bps)..."
  cast send "$ENGINE" \
    "configureMarket(string,bool,uint16,uint16,uint64,int32)" \
    "$ticker" "$active" "$maxLev" "$mmBps" "$oi" "$funding" \
    --rpc-url "$RPC" --private-key "$PK"
done

echo "Done. Maintenance margin is now 0.5% on all perp markets."
