export function getStockVaultAddress(): `0x${string}` | null {
  const addr = process.env.STOCK_VAULT_ADDRESS ?? process.env.NEXT_PUBLIC_STOCK_VAULT_ADDRESS;
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
  return addr as `0x${string}`;
}

export function getPerpEngineAddress(): `0x${string}` | null {
  const addr = process.env.PERP_ENGINE_ADDRESS ?? process.env.NEXT_PUBLIC_PERP_ENGINE_ADDRESS;
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
  return addr as `0x${string}`;
}
