import type { DrawResult } from "@lotto/shared";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Draw 1 was drawn Saturday 2002-12-07 ~20:45 KST. Anchoring on the draw *moment*
// (not midnight) is what keeps freshness truthful around draw day: 20:45 KST == 11:45 UTC.
// Korea has had no DST since 1988, so a fixed +09:00 offset is safe.
const FIRST_DRAW_MOMENT_MS = Date.UTC(2002, 11, 7, 11, 45, 0);

/**
 * Calendar estimate of the latest lotto draw number that has *actually occurred* by `now`.
 * A draw counts as occurred only once `now >= its Saturday 20:45 KST moment`, so this never
 * over-reports during the pre-draw window. `now` is injectable for deterministic tests.
 */
export function estimateLatestDrawNo(now: Date = new Date()): number {
  const elapsed = now.getTime() - FIRST_DRAW_MOMENT_MS;
  if (elapsed < 0) return 1;
  return Math.max(1, Math.floor(elapsed / ONE_WEEK_MS) + 1);
}

export interface LotteryResultProvider {
  latestDrawNo(): Promise<number>;
  getDraw(drawNo: number): Promise<DrawResult | null>;
  /**
   * Optional calendar estimate of the latest drawn number. Providers that expose it let the
   * sync layer distinguish "we hold the latest draw that occurred" (fresh) from "the source is
   * behind the calendar" (last-good). Optional so lightweight test doubles need not implement it.
   */
  estimateLatestDrawNo?(now?: Date): number;
}

export class SeedProvider implements LotteryResultProvider {
  constructor(private readonly draws: DrawResult[]) {}

  async latestDrawNo() {
    return Math.max(...this.draws.map((draw) => draw.drawNo));
  }

  async getDraw(drawNo: number) {
    return this.draws.find((draw) => draw.drawNo === drawNo) ?? null;
  }

  all() {
    return [...this.draws].sort((a, b) => a.drawNo - b.drawNo);
  }
}

export class DhlotteryJsonProvider implements LotteryResultProvider {
  constructor(private readonly baseUrl = process.env.LOTTERY_API_BASE ?? "https://www.dhlottery.co.kr") {}

  estimateLatestDrawNo(now: Date = new Date()): number {
    return estimateLatestDrawNo(now);
  }

  /**
   * Newest *resolvable* draw number: start at the calendar estimate and probe downward a
   * bounded number of steps until a draw resolves. This avoids the old defect where the
   * unverified estimate overshot the published draw, forcing an unbounded backfill that
   * always tail-failed and made `fresh` unreachable. The step bound (default 3) caps probe
   * I/O even when the source lags the calendar.
   */
  async latestDrawNo() {
    const estimate = this.estimateLatestDrawNo();
    const maxSteps = Math.max(0, Number(process.env.LOTTERY_PROBE_STEPS ?? 3));
    const floor = Math.max(1, estimate - maxSteps);
    for (let drawNo = estimate; drawNo >= floor; drawNo--) {
      const draw = await this.getDraw(drawNo);
      if (draw) return drawNo;
    }
    // Nothing resolved within the probe window; report the lowest probed draw. The service
    // classifies the estimate/probe gap as SOURCE_BEHIND_CALENDAR rather than looping forever.
    return floor;
  }

  async getDraw(drawNo: number): Promise<DrawResult | null> {
    const url = `${this.baseUrl}/common.do?method=getLottoNumber&drwNo=${drawNo}`;
    const res = await fetch(url, {
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        referer: `${this.baseUrl}/gameResult.do?method=byWin`,
        "user-agent": "Mozilla/5.0 AICanWinLottery",
        "x-requested-with": "XMLHttpRequest",
      },
      redirect: "manual",
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json") && !contentType.includes("javascript")) return null;

    let data: Record<string, unknown>;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
    if (data.returnValue !== "success") return null;

    return {
      drawNo: Number(data.drwNo),
      date: String(data.drwNoDate),
      numbers: [1, 2, 3, 4, 5, 6]
        .map((index) => Number(data[`drwtNo${index}`]))
        .sort((a, b) => a - b),
      bonusNumber: Number(data.bnusNo),
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      parserVersion: "dhlottery-json-v1",
    };
  }
}
