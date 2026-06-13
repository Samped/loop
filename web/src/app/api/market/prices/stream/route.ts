import { getStoredSnapshots, getStoredStocks, hydrateSnapshotStore } from "@/lib/snapshot-store";
import { onStockListed, onStockReady, startSnapshotWarmer } from "@/lib/snapshot-warmer";
import { getCachedCryptoStocks } from "@/lib/market-data";
import { filterListedSnapshots, isStockListed, isStockReady } from "@/lib/stock-ready";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  hydrateSnapshotStore();
  startSnapshotWarmer();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      void (async () => {
        try {
          let allStocks = getStoredStocks() ?? [];
          try {
            const { stocks } = await getCachedCryptoStocks();
            allStocks = stocks;
          } catch {
            // use stored catalog
          }

          const listedSnapshots = filterListedSnapshots(getStoredSnapshots());
          const listedTickers = allStocks.filter((s) => isStockListed(s.ticker)).map((s) => s.ticker);
          const chartTickers = allStocks.filter((s) => isStockReady(s.ticker)).map((s) => s.ticker);

          if (listedTickers.length > 0) {
            send({
              type: "listed_batch",
              tickers: listedTickers,
              snapshots: listedSnapshots,
              count: listedTickers.length,
              total: allStocks.length,
            });
          }

          if (chartTickers.length > 0) {
            send({ type: "chart_batch", tickers: chartTickers });
          }

          const unsubListed = onStockListed((payload) => {
            send({
              type: "listed",
              ticker: payload.ticker,
              snapshot: payload.snapshot,
              count: allStocks.filter((s) => isStockListed(s.ticker)).length,
              total: allStocks.length,
            });
          });

          const unsubChart = onStockReady((payload) => {
            send({
              type: "chart",
              ticker: payload.ticker,
              snapshot: payload.snapshot,
            });
          });

          const keepAlive = setInterval(() => send({ type: "ping" }), 20_000);

          req.signal.addEventListener("abort", () => {
            clearInterval(keepAlive);
            unsubListed();
            unsubChart();
            controller.close();
          });
        } catch {
          send({ type: "error", message: "Failed to start price stream" });
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
