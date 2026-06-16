export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { hydrateSnapshotStore } = await import("@/lib/snapshot-store");
    const { hydratePerpMarkHistoryStore } = await import("@/lib/perp-mark-history-store");
    const { startSnapshotWarmer } = await import("@/lib/snapshot-warmer");
    const { startOracleSyncer } = await import("@/lib/oracle-syncer");
    const { startNewsSyncer } = await import("@/lib/news-syncer");
    const { startPerpOracleSyncer } = await import("@/lib/perp-syncer");
    const { startPerpMarkEngine } = await import("@/lib/perp-mark-engine-runner");
    const { startPerpFundingSyncer } = await import("@/lib/perp-funding-syncer");
    hydrateSnapshotStore();
    await hydratePerpMarkHistoryStore();
    startSnapshotWarmer();
    startOracleSyncer();
    startNewsSyncer();
    startPerpMarkEngine();
    startPerpOracleSyncer();
    startPerpFundingSyncer();
  }
}
