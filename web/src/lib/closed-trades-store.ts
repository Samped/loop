import "server-only";
import { getNeonSql } from "@/lib/neon";
import { isNeonCircuitOpen, withNeonGuard } from "@/lib/neon-guard";

export type ClosedTradeRecord = {
  id: number;
  tradeType: "spot" | "perp";
  ticker: string;
  side: string | null;
  size: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  pnlUsd: number | null;
  txHash: string | null;
  closedAt: number;
};

export type ClosedTradeInput = {
  userAddress: string;
  tradeType: "spot" | "perp";
  ticker: string;
  side?: string | null;
  size?: number | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  pnlUsd?: number | null;
  txHash?: string | null;
  closedAt?: number;
};

const MAX_PER_USER = 3;
let schemaReady = false;

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

async function ensureSchema(): Promise<boolean> {
  if (schemaReady || isNeonCircuitOpen()) return schemaReady;
  const sql = getNeonSql();
  if (!sql) return false;
  const ok = await withNeonGuard(async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS user_closed_trades (
        id BIGSERIAL PRIMARY KEY,
        user_address TEXT NOT NULL,
        trade_type TEXT NOT NULL,
        ticker TEXT NOT NULL,
        side TEXT,
        size DOUBLE PRECISION,
        entry_price DOUBLE PRECISION,
        exit_price DOUBLE PRECISION,
        pnl_usd DOUBLE PRECISION,
        tx_hash TEXT,
        closed_at BIGINT NOT NULL
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_closed_trades_user_closed
      ON user_closed_trades (user_address, closed_at DESC)
    `;
    return true;
  }, 2_000);
  if (ok) schemaReady = true;
  return schemaReady;
}

function rowToRecord(row: {
  id: string | number;
  trade_type: string;
  ticker: string;
  side: string | null;
  size: string | number | null;
  entry_price: string | number | null;
  exit_price: string | number | null;
  pnl_usd: string | number | null;
  tx_hash: string | null;
  closed_at: string | number;
}): ClosedTradeRecord {
  return {
    id: Number(row.id),
    tradeType: row.trade_type === "perp" ? "perp" : "spot",
    ticker: row.ticker,
    side: row.side,
    size: row.size == null ? null : Number(row.size),
    entryPrice: row.entry_price == null ? null : Number(row.entry_price),
    exitPrice: row.exit_price == null ? null : Number(row.exit_price),
    pnlUsd: row.pnl_usd == null ? null : Number(row.pnl_usd),
    txHash: row.tx_hash,
    closedAt: Number(row.closed_at),
  };
}

export function hydrateClosedTradesStore() {
  void ensureSchema();
}

export async function recordClosedTrade(input: ClosedTradeInput): Promise<ClosedTradeRecord | null> {
  const sql = getNeonSql();
  if (!sql) return null;

  const user = normalizeAddress(input.userAddress);
  const ticker = input.ticker.trim().toUpperCase();
  const closedAt = input.closedAt ?? Date.now();

  return withNeonGuard(async () => {
    if (!(await ensureSchema())) return null;

    const inserted = (await sql`
      INSERT INTO user_closed_trades (
        user_address, trade_type, ticker, side, size, entry_price, exit_price, pnl_usd, tx_hash, closed_at
      )
      VALUES (
        ${user},
        ${input.tradeType},
        ${ticker},
        ${input.side ?? null},
        ${input.size ?? null},
        ${input.entryPrice ?? null},
        ${input.exitPrice ?? null},
        ${input.pnlUsd ?? null},
        ${input.txHash ?? null},
        ${closedAt}
      )
      RETURNING id, trade_type, ticker, side, size, entry_price, exit_price, pnl_usd, tx_hash, closed_at
    `) as Array<{
      id: string | number;
      trade_type: string;
      ticker: string;
      side: string | null;
      size: string | number | null;
      entry_price: string | number | null;
      exit_price: string | number | null;
      pnl_usd: string | number | null;
      tx_hash: string | null;
      closed_at: string | number;
    }>;

    await sql`
      DELETE FROM user_closed_trades
      WHERE user_address = ${user}
        AND id NOT IN (
          SELECT id FROM user_closed_trades
          WHERE user_address = ${user}
          ORDER BY closed_at DESC
          LIMIT ${MAX_PER_USER}
        )
    `;

    const row = inserted[0];
    return row ? rowToRecord(row) : null;
  }, 2_500);
}

export async function getClosedTradesForUser(userAddress: string): Promise<ClosedTradeRecord[]> {
  const sql = getNeonSql();
  if (!sql) return [];

  const user = normalizeAddress(userAddress);

  const rows = await withNeonGuard(async () => {
    if (!(await ensureSchema())) return null;

    const result = (await sql`
      SELECT id, trade_type, ticker, side, size, entry_price, exit_price, pnl_usd, tx_hash, closed_at
      FROM user_closed_trades
      WHERE user_address = ${user}
      ORDER BY closed_at DESC
      LIMIT ${MAX_PER_USER}
    `) as Array<{
      id: string | number;
      trade_type: string;
      ticker: string;
      side: string | null;
      size: string | number | null;
      entry_price: string | number | null;
      exit_price: string | number | null;
      pnl_usd: string | number | null;
      tx_hash: string | null;
      closed_at: string | number;
    }>;
    return result;
  }, 2_000);

  if (!rows) return [];
  return rows.map(rowToRecord);
}
