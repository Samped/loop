import "server-only";

export function getOraclePrivateKey(): `0x${string}` | null {
  const key = process.env.ORACLE_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
  if (!key) return null;
  return key.startsWith("0x") ? (key as `0x${string}`) : (`0x${key}` as `0x${string}`);
}
