import { describe, expect, it } from "vitest";
import {
  checkSavedRecommendation,
  createRecommendations,
  generateInternalCandidates,
  saveRecommendations,
  validateInternalCandidates,
} from "./service.js";

describe("api service", () => {
  it("returns deterministic fallback when agent is down with freshness metadata", async () => {
    const res = await createRecommendations({ luckyNumbers: [7,11], count: 2 }, { skipLiveSync: true, agentUrl: "http://127.0.0.1:9" });
    expect(res.recommendations).toHaveLength(2);
    expect(res.fallbackUsed).toBe(true);
    expect(res.freshness.syncStatus).toBe("skipped");
    expect(res.disclaimers.join(" ")).toContain("entertainment");
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

  it("rejects targetDrawNo that is not later than latest synced draw", async () => {
    await expect(createRecommendations({ luckyNumbers: [], count: 1, targetDrawNo: 1 }, { skipLiveSync: true })).rejects.toThrow(/targetDrawNo/);
  });

  it("internal generate and validate endpoints use real core validation", async () => {
    const generated = await generateInternalCandidates({ luckyNumbers: [7, 11], count: 1 });
    expect(generated.recommendations).toHaveLength(1);
    await expect(validateInternalCandidates({ combinations: [generated.recommendations[0].numbers] })).resolves.toMatchObject({ valid: true });
    await expect(validateInternalCandidates({ combinations: [[1, 2, 3, 4, 6, 5]] })).resolves.toMatchObject({ valid: false });
  });
});
