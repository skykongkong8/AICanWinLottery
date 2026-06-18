import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import type { DrawResult } from "@lotto/shared";

const LOTTERY_API_BASE = process.env.LOTTERY_API_BASE ?? "https://www.dhlottery.co.kr";
const OUT = new URL("../packages/data/src/seed/draws.json", import.meta.url);
const FIRST_DRAW_DATE = new Date("2002-12-07T00:00:00+09:00");
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function expectedLatestDrawNo(now = new Date()) {
  return Math.max(1, Math.floor((now.getTime() - FIRST_DRAW_DATE.getTime()) / ONE_WEEK_MS) + 1);
}

async function fetchDraw(drawNo: number): Promise<DrawResult> {
  const url = `${LOTTERY_API_BASE}/common.do?method=getLottoNumber&drwNo=${drawNo}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      referer: `${LOTTERY_API_BASE}/gameResult.do?method=byWin`,
      "user-agent": "Mozilla/5.0 AICanWinLottery seed builder",
      "x-requested-with": "XMLHttpRequest",
    },
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`draw ${drawNo} HTTP ${res.status} ${res.headers.get("location") ?? ""}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json") && !contentType.includes("javascript")) {
    throw new Error(`draw ${drawNo} non-json response: ${contentType}`);
  }
  const data = await res.json() as Record<string, unknown>;
  if (data.returnValue !== "success") throw new Error(`draw ${drawNo} returnValue=${String(data.returnValue)}`);
  return {
    drawNo: Number(data.drwNo),
    date: String(data.drwNoDate),
    numbers: [1, 2, 3, 4, 5, 6].map((i) => Number(data[`drwtNo${i}`])).sort((a, b) => a - b),
    bonusNumber: Number(data.bnusNo),
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    parserVersion: "dhlottery-json-v1",
  };
}

async function main() {
  const latest = Number(process.env.SEED_LATEST_DRAW_NO ?? expectedLatestDrawNo());
  const delayMs = Number(process.env.SEED_FETCH_DELAY_MS ?? 150);
  const draws: DrawResult[] = [];
  for (let drawNo = 1; drawNo <= latest; drawNo++) {
    draws.push(await fetchDraw(drawNo));
    if (drawNo < latest) await sleep(delayMs);
  }
  mkdirSync(new URL("../packages/data/src/seed/", import.meta.url), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(draws, null, 2)}\n`);
  console.log(`wrote ${draws.length} draws to ${OUT.pathname}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
