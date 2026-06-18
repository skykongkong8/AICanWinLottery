import type { LotteryResultProvider } from "./provider.js";
import type { SQLiteLotteryStore } from "./repository.js";

export type SyncResult = {
  latestKnownBefore: number;
  latestProvider: number;
  latestSynced: number;
  inserted: number;
  complete: boolean;
};

export class DrawBackfillError extends Error {
  readonly code = "DRAW_BACKFILL_INCOMPLETE";
  constructor(readonly result: SyncResult, readonly missingDrawNo: number) {
    super(`draw backfill incomplete at draw ${missingDrawNo}`);
    this.name = "DrawBackfillError";
  }
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
    let inserted = 0;
    for (let drawNo = latestKnownBefore + 1; drawNo <= latestProvider; drawNo++) {
      const draw = await provider.getDraw(drawNo);
      if (!draw) {
        const latestSynced = await store.latestDrawNo();
        throw new DrawBackfillError(
          { latestKnownBefore, latestProvider, latestSynced, inserted, complete: false },
          drawNo,
        );
      }
      await store.upsertDraw(draw);
      inserted += 1;
    }
    return {
      latestKnownBefore,
      latestProvider,
      latestSynced: await store.latestDrawNo(),
      inserted,
      complete: true,
    };
  })().finally(() => {
    syncLock = null;
  });
  return syncLock;
}
