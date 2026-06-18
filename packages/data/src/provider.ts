import type { DrawResult } from "@lotto/shared";

export interface LotteryResultProvider {
  latestDrawNo(): Promise<number>;
  getDraw(drawNo: number): Promise<DrawResult | null>;
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

  async latestDrawNo() {
    const first = new Date("2002-12-07T00:00:00+09:00");
    const now = new Date();
    const weeks = Math.floor((now.getTime() - first.getTime()) / (7 * 24 * 3600 * 1000));
    return Math.max(1, weeks + 1);
  }

  async getDraw(drawNo: number) {
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
