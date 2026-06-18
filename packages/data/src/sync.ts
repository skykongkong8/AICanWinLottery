import type { LotteryResultProvider } from "./provider.js";
import type { SQLiteLotteryStore } from "./repository.js";

export type SyncResult = {
  latestKnownBefore: number;
  /** Newest draw the provider could actually resolve (probe result). */
  latestProvider: number;
  /** Calendar estimate of the latest drawn number (>= latestProvider). */
  providerEstimate: number;
  latestSynced: number;
  inserted: number;
  complete: boolean;
  /** Non-null when a request returns before catching up: only "BACKFILL_CAPPED" today. */
  syncErrorKind: string | null;
};

export class DrawBackfillError extends Error {
  readonly code = "DRAW_BACKFILL_INCOMPLETE";
  constructor(readonly result: SyncResult, readonly missingDrawNo: number) {
    super(`draw backfill incomplete at draw ${missingDrawNo}`);
    this.name = "DrawBackfillError";
  }
}

/** Per-request backfill ceiling. Bounds I/O so a large gap can't blow the request budget. */
function backfillCap(): number {
  return Math.max(1, Number(process.env.BACKFILL_CAP ?? 30));
}

let syncLock: Promise<SyncResult> | null = null;

export async function syncDrawsBeforeServing(
  store: SQLiteLotteryStore,
  provider: LotteryResultProvider,
): Promise<SyncResult> {
  if (syncLock) return syncLock;
  syncLock = (async () => {
    const latestKnownBefore = await store.latestDrawNo();
    const latestProvider = await provider.latestDrawNo();
    const providerEstimate = provider.estimateLatestDrawNo
      ? provider.estimateLatestDrawNo()
      : latestProvider;
    // Bound the per-request backfill. A `null` for any draw <= latestProvider is still an
    // interior gap and throws; the cap only limits how many *resolvable* draws we fetch now,
    // so subsequent requests converge instead of one request paying for the whole backlog.
    const target = Math.min(latestProvider, latestKnownBefore + backfillCap());
    const capped = target < latestProvider;
    let inserted = 0;
    for (let drawNo = latestKnownBefore + 1; drawNo <= target; drawNo++) {
      const draw = await provider.getDraw(drawNo);
      if (!draw) {
        const latestSynced = await store.latestDrawNo();
        throw new DrawBackfillError(
          {
            latestKnownBefore,
            latestProvider,
            providerEstimate,
            latestSynced,
            inserted,
            complete: false,
            syncErrorKind: "DRAW_BACKFILL_INCOMPLETE",
          },
          drawNo,
        );
      }
      await store.upsertDraw(draw);
      inserted += 1;
    }
    return {
      latestKnownBefore,
      latestProvider,
      providerEstimate,
      latestSynced: await store.latestDrawNo(),
      inserted,
      complete: !capped,
      syncErrorKind: capped ? "BACKFILL_CAPPED" : null,
    };
  })().finally(() => {
    syncLock = null;
  });
  return syncLock;
}
