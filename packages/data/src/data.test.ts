import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyFreshness, DhlotteryJsonProvider, DrawBackfillError, estimateLatestDrawNo, SQLiteLotteryStore, syncDrawsBeforeServing, type LotteryResultProvider, type SyncResult } from "./index.js";
import type { DrawResult } from "@lotto/shared";

function tempStore() {
  return new SQLiteLotteryStore(`file:${join(mkdtempSync(join(tmpdir(), "lotto-data-")), "test.sqlite")}`);
}

class OneNewDrawProvider implements LotteryResultProvider {
  constructor(private readonly draw: DrawResult) {}
  async latestDrawNo() { return this.draw.drawNo; }
  async getDraw(drawNo: number) { return drawNo === this.draw.drawNo ? this.draw : null; }
}

describe("SQLite data store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses WAL/busy_timeout, seeds draws, and persists saves", async () => {
    const store = tempStore();
    try {
      const pragmas = store.configureSqlitePragmas();
      expect(pragmas).toEqual({ journal_mode: "wal", busy_timeout: 5000 });
      expect(await store.latestDrawNo()).toBeGreaterThanOrEqual(3);
      const saved = await store.saveRecommendations({ requestId: "r", traceId: null, targetDrawNo: 4, combinations: [[1,2,3,4,5,6]], fallbackUsed: true });
      expect(saved).toHaveLength(1);
      expect((await store.listSaved())[0].source).toBe("api-fallback");
    } finally { store.close(); }
  });

  it("serializes concurrent sync and save writes when sync inserts a new draw", async () => {
    const store = tempStore();
    try {
      const latest = await store.latestDrawNo();
      const provider = new OneNewDrawProvider({ drawNo: latest + 1, date: "2026-06-18", numbers: [1,2,3,4,5,6], bonusNumber: 7, parserVersion: "test" });
      const [_, saved] = await Promise.all([
        syncDrawsBeforeServing(store, provider),
        store.saveRecommendations({ requestId: "r", traceId: "t", targetDrawNo: latest + 2, combinations: [[1,2,3,4,5,6]], fallbackUsed: false }),
      ]);
      expect(saved).toHaveLength(1);
      expect(await store.latestDrawNo()).toBe(latest + 1);
      expect((await store.listSaved())[0].traceId).toBe("t");
    } finally { store.close(); }
  });

  it("throws a typed incomplete-backfill error when provider returns null before latest", async () => {
    const store = tempStore();
    try {
      const latest = await store.latestDrawNo();
      const provider: LotteryResultProvider = {
        async latestDrawNo() { return latest + 1; },
        async getDraw() { return null; },
      };
      await expect(syncDrawsBeforeServing(store, provider)).rejects.toBeInstanceOf(DrawBackfillError);
      expect(await store.latestDrawNo()).toBe(latest);
    } finally { store.close(); }
  });

  it("normalizes dhlottery redirect or HTML responses to a missing draw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html/>", {
      status: 302,
      headers: {
        location: "https://www.dhlottery.co.kr/",
        "content-type": "text/html;charset=UTF-8",
      },
    })));

    await expect(new DhlotteryJsonProvider().getDraw(1)).resolves.toBeNull();
  });

  it("normalizes dhlottery non-JSON success responses to a missing draw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html/>", {
      status: 200,
      headers: { "content-type": "text/html;charset=UTF-8" },
    })));

    await expect(new DhlotteryJsonProvider().getDraw(1)).resolves.toBeNull();
  });
});

const DRAW_ANCHOR_MS = Date.UTC(2002, 11, 7, 11, 45, 0); // 2002-12-07T20:45:00+09:00
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const drawMoment = (drawNo: number, offsetMs = 0) => new Date(DRAW_ANCHOR_MS + (drawNo - 1) * ONE_WEEK_MS + offsetMs);

function fakeDraw(drawNo: number): DrawResult {
  return { drawNo, date: "2026-01-01", numbers: [1, 2, 3, 4, 5, 6], bonusNumber: 7, parserVersion: "test" };
}

describe("draw-time-aware estimate (injected clock)", () => {
  it("counts a draw as occurred only once its Saturday 20:45 KST moment passes", () => {
    expect(estimateLatestDrawNo(new Date(DRAW_ANCHOR_MS))).toBe(1); // exact draw-1 moment
    expect(estimateLatestDrawNo(drawMoment(100, 3 * 24 * 3600 * 1000))).toBe(100); // (a) mid-week
    expect(estimateLatestDrawNo(drawMoment(101, -2 * 3600 * 1000))).toBe(100); // (b) pre-draw Saturday → N-1
    expect(estimateLatestDrawNo(drawMoment(101, 60 * 1000))).toBe(101); // (c) just after draw moment → N
  });
});

describe("DhlotteryJsonProvider.latestDrawNo probe", () => {
  class ProbeProvider extends DhlotteryJsonProvider {
    constructor(private readonly newestResolvable: number, private readonly estimate: number) { super(); }
    override estimateLatestDrawNo() { return this.estimate; }
    override async getDraw(drawNo: number) { return drawNo <= this.newestResolvable ? fakeDraw(drawNo) : null; }
  }

  it("walks down from an overshooting estimate to the newest resolvable draw", async () => {
    const provider = new ProbeProvider(100, 102); // estimate overshoots published by 2 (within default step bound 3)
    expect(await provider.latestDrawNo()).toBe(100);
  });

  it("stays bounded (returns estimate-steps) when nothing resolves within the probe window", async () => {
    const prev = process.env.LOTTERY_PROBE_STEPS;
    process.env.LOTTERY_PROBE_STEPS = "3";
    try {
      const provider = new ProbeProvider(100, 110); // 10 behind, far beyond the step bound
      expect(await provider.latestDrawNo()).toBe(107); // 110 - 3, lowest probed; never loops to 100
    } finally {
      if (prev === undefined) delete process.env.LOTTERY_PROBE_STEPS; else process.env.LOTTERY_PROBE_STEPS = prev;
    }
  });
});

describe("syncDrawsBeforeServing cap + estimate passthrough", () => {
  it("backfills a multi-draw gap, surfaces the estimate, and reports complete", async () => {
    const store = tempStore();
    try {
      const latest = await store.latestDrawNo();
      const provider: LotteryResultProvider = {
        estimateLatestDrawNo: () => latest + 3,
        async latestDrawNo() { return latest + 3; },
        async getDraw(drawNo) { return drawNo <= latest + 3 ? fakeDraw(drawNo) : null; },
      };
      const result = await syncDrawsBeforeServing(store, provider);
      expect(result.complete).toBe(true);
      expect(result.providerEstimate).toBe(latest + 3);
      expect(result.latestProvider).toBe(latest + 3);
      expect(result.latestSynced).toBe(latest + 3);
      expect(classifyFreshness(result).syncStatus).toBe("fresh");
    } finally { store.close(); }
  });

  it("caps a large backlog without throwing and converges over successive requests", async () => {
    const prev = process.env.BACKFILL_CAP;
    process.env.BACKFILL_CAP = "2";
    const store = tempStore();
    try {
      const latest = await store.latestDrawNo();
      const provider: LotteryResultProvider = {
        estimateLatestDrawNo: () => latest + 5,
        async latestDrawNo() { return latest + 5; },
        async getDraw(drawNo) { return drawNo <= latest + 5 ? fakeDraw(drawNo) : null; },
      };
      const first = await syncDrawsBeforeServing(store, provider);
      expect(first.complete).toBe(false);
      expect(first.syncErrorKind).toBe("BACKFILL_CAPPED");
      expect(first.latestSynced).toBe(latest + 2);
      expect(classifyFreshness(first)).toMatchObject({ syncStatus: "last-good", syncErrorKind: "BACKFILL_CAPPED" });

      await syncDrawsBeforeServing(store, provider); // advances to latest + 4
      const third = await syncDrawsBeforeServing(store, provider); // reaches latest + 5
      expect(third.complete).toBe(true);
      expect(third.latestSynced).toBe(latest + 5);
    } finally {
      store.close();
      if (prev === undefined) delete process.env.BACKFILL_CAP; else process.env.BACKFILL_CAP = prev;
    }
  });
});

describe("saveResultCheck atomicity (M5)", () => {
  it("rolls back the result_check insert when the status update fails", async () => {
    const store = tempStore();
    try {
      const [rec] = await store.saveRecommendations({ requestId: "r", traceId: null, targetDrawNo: 4, combinations: [[1, 2, 3, 4, 5, 6]], fallbackUsed: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = (store as unknown as { db: any }).db;
      const realPrepare = db.prepare.bind(db);
      const spy = vi.spyOn(db, "prepare").mockImplementation((...args: unknown[]) => {
        const sql = args[0] as string;
        if (sql.startsWith("UPDATE recommendations SET status='checked'")) {
          return { run: () => { throw new Error("simulated UPDATE failure"); } };
        }
        return realPrepare(sql);
      });

      await expect(
        store.saveResultCheck({ recommendationId: rec.id, drawNo: 1, matchedNumbers: [1, 2, 3], bonusMatched: false, rank: "5th" }),
      ).rejects.toThrow(/simulated UPDATE failure/);

      spy.mockRestore();
      const count = (db.prepare("SELECT COUNT(*) AS c FROM result_checks WHERE recommendation_id=?").get(rec.id) as { c: number }).c;
      expect(count).toBe(0);
      expect((await store.getSaved(rec.id))?.status).toBe("pending");
    } finally { store.close(); }
  });
});

describe("classifyFreshness truthfulness matrix", () => {
  const base = (over: Partial<SyncResult>): SyncResult => ({
    latestKnownBefore: 0, latestProvider: 100, providerEstimate: 100, latestSynced: 100, inserted: 0, complete: true, syncErrorKind: null, ...over,
  });

  it("(a) holds the latest drawn number → fresh", () => {
    expect(classifyFreshness(base({}))).toEqual({ latestSyncedDrawNo: 100, syncStatus: "fresh", syncErrorKind: null });
  });
  it("(b) pre-draw Saturday (estimate == probed == synced == N-1) → fresh", () => {
    expect(classifyFreshness(base({ latestProvider: 99, providerEstimate: 99, latestSynced: 99 })).syncStatus).toBe("fresh");
  });
  it("(c) post-draw pre-publish (estimate one ahead of resolvable) → PENDING_OFFICIAL_PUBLISH", () => {
    expect(classifyFreshness(base({ latestProvider: 99, latestSynced: 99, providerEstimate: 100 }))).toEqual({ latestSyncedDrawNo: 99, syncStatus: "last-good", syncErrorKind: "PENDING_OFFICIAL_PUBLISH" });
  });
  it("(d) source 2+ behind the calendar → SOURCE_BEHIND_CALENDAR", () => {
    expect(classifyFreshness(base({ latestProvider: 98, latestSynced: 98, providerEstimate: 100 }))).toEqual({ latestSyncedDrawNo: 98, syncStatus: "last-good", syncErrorKind: "SOURCE_BEHIND_CALENDAR" });
  });
  it("(e) capped backfill → last-good BACKFILL_CAPPED", () => {
    expect(classifyFreshness(base({ complete: false, syncErrorKind: "BACKFILL_CAPPED", latestSynced: 50 }))).toEqual({ latestSyncedDrawNo: 50, syncStatus: "last-good", syncErrorKind: "BACKFILL_CAPPED" });
  });
});
