import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import type { DrawResult } from "@lotto/shared";

const LOTTERY_API_BASE = process.env.LOTTERY_API_BASE ?? "https://www.dhlottery.co.kr";
const OUT = new URL("../packages/data/src/seed/draws.json", import.meta.url);

// Mirrors packages/data/src/provider.ts: draw 1 occurred Saturday 2002-12-07 ~20:45 KST
// (== 11:45 UTC). Anchoring on the draw moment avoids treating the not-yet-drawn week as
// available, so the seed builder stops at the last draw that has actually occurred.
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_DRAW_MOMENT_MS = Date.UTC(2002, 11, 7, 11, 45, 0);

function estimateLatestDrawNo(now = new Date()) {
  const elapsed = now.getTime() - FIRST_DRAW_MOMENT_MS;
  if (elapsed < 0) return 1;
  return Math.max(1, Math.floor(elapsed / ONE_WEEK_MS) + 1);
}

/** Returns the parsed draw, or null for redirects / non-JSON / unsuccessful responses. */
async function fetchDraw(drawNo: number): Promise<DrawResult | null> {
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
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json") && !contentType.includes("javascript")) return null;
  const data = (await res.json()) as Record<string, unknown>;
  if (data.returnValue !== "success") return null;
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

/** Probe downward from the calendar estimate to the newest draw the endpoint actually serves. */
async function findLatestResolvable(estimate: number, maxSteps: number, delayMs: number): Promise<number> {
  const floor = Math.max(1, estimate - maxSteps);
  for (let drawNo = estimate; drawNo >= floor; drawNo--) {
    const draw = await fetchDraw(drawNo);
    if (draw) return drawNo;
    if (drawNo > floor) await sleep(delayMs);
  }
  throw new Error(
    `no resolvable draw in [${floor}, ${estimate}] — endpoint unreachable (this environment may be redirected/geo-blocked) or far behind`,
  );
}

async function main() {
  const delayMs = Number(process.env.SEED_FETCH_DELAY_MS ?? 150);
  const probeSteps = Number(process.env.SEED_PROBE_STEPS ?? 4);
  const override = process.env.SEED_LATEST_DRAW_NO ? Number(process.env.SEED_LATEST_DRAW_NO) : null;
  const latest = override ?? (await findLatestResolvable(estimateLatestDrawNo(), probeSteps, delayMs));

  const draws: DrawResult[] = [];
  for (let drawNo = 1; drawNo <= latest; drawNo++) {
    const draw = await fetchDraw(drawNo);
    if (!draw) {
      throw new Error(`draw ${drawNo} did not resolve (interior gap) — aborting to avoid committing a holey seed`);
    }
    draws.push(draw);
    if (drawNo < latest) await sleep(delayMs);
  }

  mkdirSync(new URL("../packages/data/src/seed/", import.meta.url), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(draws, null, 2)}\n`);
  console.log(`wrote ${draws.length} draws (1..${latest}) to ${OUT.pathname}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
