import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DhlotteryJsonProvider, DrawBackfillError, SQLiteLotteryStore, syncDrawsBeforeServing, type LotteryResultProvider } from "./index.js";
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
