import { notifyClosedTradesUpdated } from "@/lib/closed-trades-events";

export type RecordClosedTradePayload = {
  address: string;
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

/** Fire-and-forget — stores up to 3 most recent closed trades per wallet in Neon. */
export function recordClosedTradeClient(payload: RecordClosedTradePayload) {
  if (!payload.address) return;
  void fetch(`/api/trades/closed/${payload.address}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (res.ok) notifyClosedTradesUpdated();
    })
    .catch(() => {});
}
