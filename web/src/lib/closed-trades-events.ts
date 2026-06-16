export const CLOSED_TRADES_REFRESH_EVENT = "loop:closed-trades-refresh";

export function notifyClosedTradesUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CLOSED_TRADES_REFRESH_EVENT));
  }
}
