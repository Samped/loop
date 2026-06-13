export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { hydrateSnapshotStore } = await import("@/lib/snapshot-store");
    const { startSnapshotWarmer } = await import("@/lib/snapshot-warmer");
    const { startOracleSyncer } = await import("@/lib/oracle-syncer");
    const { startNewsSyncer } = await import("@/lib/news-syncer");
    hydrateSnapshotStore();
    startSnapshotWarmer();
    startOracleSyncer();
    startNewsSyncer();
  }
}
