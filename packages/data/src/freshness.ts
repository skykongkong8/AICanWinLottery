import type { DataFreshness } from "@lotto/shared";
import type { SyncResult } from "./sync.js";

/**
 * Map a completed sync into a truthful freshness label.
 *
 * `fresh` means exactly: the backfill completed AND we now hold the newest draw the source
 * resolves AND that draw equals the calendar estimate (so nothing the calendar says exists is
 * missing). Any shortfall degrades loudly to `last-good` with a reason:
 *   - BACKFILL_CAPPED          — gap exceeded the per-request cap; converges on later requests
 *   - PENDING_OFFICIAL_PUBLISH — the latest draw occurred but the source hasn't published it yet
 *                                (the genuine, short post-draw window)
 *   - SOURCE_BEHIND_CALENDAR   — the source trails the calendar by 2+ draws (outage/lag)
 *
 * Interior gaps throw `DrawBackfillError` and are handled by the caller's catch, not here.
 */
export function classifyFreshness(sync: SyncResult): DataFreshness {
  if (!sync.complete) {
    return {
      latestSyncedDrawNo: sync.latestSynced,
      syncStatus: "last-good",
      syncErrorKind: sync.syncErrorKind ?? "BACKFILL_CAPPED",
    };
  }

  const { latestSynced, latestProvider, providerEstimate } = sync;
  if (latestSynced === latestProvider && latestProvider === providerEstimate) {
    return { latestSyncedDrawNo: latestSynced, syncStatus: "fresh", syncErrorKind: null };
  }

  const diff = providerEstimate - latestProvider;
  return {
    latestSyncedDrawNo: latestSynced,
    syncStatus: "last-good",
    syncErrorKind: diff <= 1 ? "PENDING_OFFICIAL_PUBLISH" : "SOURCE_BEHIND_CALENDAR",
  };
}
