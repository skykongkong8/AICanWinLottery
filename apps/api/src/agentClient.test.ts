import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExplainRequest } from "@lotto/shared";
import { explainWithAgent } from "./agentClient.js";

const request: ExplainRequest = {
  requestId: "req",
  traceId: null,
  combinations: [
    { id: "a", numbers: [1, 2, 3, 4, 5, 6], tags: ["balanced"], stats: { sum: 21 } },
    { id: "b", numbers: [7, 8, 9, 10, 11, 12], tags: ["wide"], stats: { sum: 57 } },
  ],
  stats: {},
  luckyNumbers: [1],
  targetDrawNo: 10,
};

describe("agent client fallback truth table", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["omits IDs", []],
    ["duplicates an ID", [
      { id: "a", explanation: "x", tagNarration: "x" },
      { id: "a", explanation: "y", tagNarration: "y" },
    ]],
    ["adds an unknown ID", [
      { id: "a", explanation: "x", tagNarration: "x" },
      { id: "c", explanation: "y", tagNarration: "y" },
    ]],
    ["returns extra cardinality", [
      { id: "a", explanation: "x", tagNarration: "x" },
      { id: "b", explanation: "y", tagNarration: "y" },
      { id: "b", explanation: "z", tagNarration: "z" },
    ]],
  ])("forces deterministic fallback when schema-valid agent response %s", async (_case, perCombination) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ perCombination, analysisSummary: "ok", fallbackUsed: false }), { status: 200 })),
    );
    const res = await explainWithAgent(request, { agentUrl: "http://agent" });
    expect(res.fallbackUsed).toBe(true);
    expect(res.perCombination.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
