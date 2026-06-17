export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { hydrateSnapshotStore } = await import("@/lib/snapshot-store");
    const { ensurePerpMarkHistoryReady } = await import("@/lib/perp-mark-history-store");
    const { hydrateClosedTradesStore } = await import("@/lib/closed-trades-store");
    const { startSnapshotWarmer } = await import("@/lib/snapshot-warmer");
    const { startOracleSyncer } = await import("@/lib/oracle-syncer");
    const { startNewsSyncer } = await import("@/lib/news-syncer");
    const { startPerpOracleSyncer } = await import("@/lib/perp-syncer");
    const { startPerpMarkEngine } = await import("@/lib/perp-mark-engine-runner");
    const { startPerpFundingSyncer } = await import("@/lib/perp-funding-syncer");
    hydrateSnapshotStore();
    await ensurePerpMarkHistoryReady();
    void hydrateClosedTradesStore();
    startSnapshotWarmer();
    startOracleSyncer();
    startNewsSyncer();
    startPerpMarkEngine();
    startPerpOracleSyncer();
    startPerpFundingSyncer();
  }
}
