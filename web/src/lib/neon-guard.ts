import "server-only";

const COOLDOWN_MS = 30 * 60_000;
let disabledUntil = 0;

export function isNeonCircuitOpen(): boolean {
  return Date.now() < disabledUntil;
}

export function tripNeonCircuit(): void {
  disabledUntil = Date.now() + COOLDOWN_MS;
}

export function isNeonEnabled(): boolean {
  if (process.env.NEON_ENABLED === "0") return false;
  return Boolean(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
}

/** Race a Neon call; trips circuit on timeout or error. */
export async function withNeonGuard<T>(
  fn: () => Promise<T>,
  timeoutMs = 2_000,
): Promise<T | null> {
  if (!isNeonEnabled() || isNeonCircuitOpen()) return null;

  try {
    const result = await Promise.race([
      fn(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (result === null) tripNeonCircuit();
    return result;
  } catch {
    tripNeonCircuit();
    return null;
  }
}
