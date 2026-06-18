import { once } from "node:events";
import { createServer, type IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { defaultStore, type LotteryResultProvider } from "@lotto/data";
import {
  checkSavedRecommendation,
  createRecommendations,
  generateInternalCandidates,
  saveRecommendations,
  validateInternalCandidates,
} from "./service.js";


async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function withAgentServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/explain") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const body = await readBody(req);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      fallbackUsed: false,
      analysisSummary: "Agent boundary summary.",
      perCombination: body.combinations.map((item: { id: string }) => ({
        id: item.id,
        explanation: `Agent explanation for ${item.id}`,
        tagNarration: `Agent tag narration for ${item.id}`,
      })),
    }));
  }).listen(0);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function mockProvider(over: { estimate: number; resolvableUpTo: number }): LotteryResultProvider {
  return {
    estimateLatestDrawNo: () => over.estimate,
    async latestDrawNo() { return over.resolvableUpTo; },
    async getDraw(drawNo) {
      return drawNo <= over.resolvableUpTo
        ? { drawNo, date: "2026-01-01", numbers: [1, 2, 3, 4, 5, 6], bonusNumber: 7, parserVersion: "test" }
        : null;
    },
  };
}

describe("api service", () => {
  it("returns deterministic fallback when agent is down with freshness metadata", async () => {
    const res = await createRecommendations({ luckyNumbers: [7,11], count: 2 }, { skipLiveSync: true, agentUrl: "http://127.0.0.1:9" });
    expect(res.recommendations).toHaveLength(2);
    expect(res.fallbackUsed).toBe(true);
    expect(res.freshness.syncStatus).toBe("skipped");
    expect(res.disclaimers.join(" ")).toContain("entertainment");
  });


  it("merges successful agent explanations by exact recommendation IDs", async () => {
    await withAgentServer(async (agentUrl) => {
      const res = await createRecommendations(
        { luckyNumbers: [7, 11], count: 2 },
        { skipLiveSync: true, agentUrl },
      );
      expect(res.fallbackUsed).toBe(false);
      expect(res.recommendations).toHaveLength(2);
      expect(res.recommendations.map((item) => item.id)).toEqual(["rec_1", "rec_2"]);
      expect(res.recommendations.every((item) => item.explanation === `Agent explanation for ${item.id}`)).toBe(true);
      expect(res.recommendations.every((item) => item.tagNarration === `Agent tag narration for ${item.id}`)).toBe(true);
    });
  });

  it("returns HTTP-200-friendly infeasible response", async () => {
    const res = await createRecommendations({ luckyNumbers: [10,23,29,33,37,40], count: 5 }, { skipLiveSync: true, agentUrl: "http://127.0.0.1:9" });
    expect(res.feasibility.status).toBe("INFEASIBLE_LUCKY_SET");
    expect(res.recommendations).toHaveLength(0);
  });

  it("saves selected combinations and checks result rank", async () => {
    const saved = await saveRecommendations({ requestId: "req", traceId: "trace", targetDrawNo: 4, combinations: [[10,23,29,33,37,40]], fallbackUsed: true });
    const checked = await checkSavedRecommendation(saved.saved[0].id, 1);
    expect(checked.rank).toBe("1st");
    expect(checked.matchedNumbers).toEqual([10,23,29,33,37,40]);
  });

  it("returns 409 when checking a saved pick whose target draw has not occurred yet (M6)", async () => {
    const latest = await defaultStore.latestDrawNo();
    const saved = await saveRecommendations({ requestId: "req", traceId: null, targetDrawNo: latest + 5, combinations: [[1, 2, 3, 4, 5, 6]], fallbackUsed: true });
    await expect(checkSavedRecommendation(saved.saved[0].id)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects targetDrawNo that is not later than latest synced draw", async () => {
    await expect(createRecommendations({ luckyNumbers: [], count: 1, targetDrawNo: 1 }, { skipLiveSync: true })).rejects.toThrow(/targetDrawNo/);
  });

  it("reaches a truthful fresh state when the source holds the latest drawn number", async () => {
    const latest = await defaultStore.latestDrawNo();
    const res = await createRecommendations(
      { luckyNumbers: [7, 11], count: 1 },
      { provider: mockProvider({ estimate: latest, resolvableUpTo: latest }), agentUrl: "http://127.0.0.1:9" },
    );
    expect(res.freshness.syncStatus).toBe("fresh");
    expect(res.freshness.latestSyncedDrawNo).toBe(latest);
    expect(res.freshness.syncErrorKind).toBeNull();
  });

  it("degrades to last-good PENDING_OFFICIAL_PUBLISH in the post-draw pre-publish window", async () => {
    const latest = await defaultStore.latestDrawNo();
    const res = await createRecommendations(
      { luckyNumbers: [7, 11], count: 1 },
      { provider: mockProvider({ estimate: latest + 1, resolvableUpTo: latest }), agentUrl: "http://127.0.0.1:9" },
    );
    expect(res.freshness.syncStatus).toBe("last-good");
    expect(res.freshness.syncErrorKind).toBe("PENDING_OFFICIAL_PUBLISH");
  });

  it("internal generate and validate endpoints use real core validation", async () => {
    const generated = await generateInternalCandidates({ luckyNumbers: [7, 11], count: 1 });
    expect(generated.recommendations).toHaveLength(1);
    await expect(validateInternalCandidates({ combinations: [generated.recommendations[0].numbers] })).resolves.toMatchObject({ valid: true });
    await expect(validateInternalCandidates({ combinations: [[1, 2, 3, 4, 6, 5]] })).resolves.toMatchObject({ valid: false });
  });
});
