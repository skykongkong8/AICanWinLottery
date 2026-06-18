import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { DrawResult } from "@lotto/shared";
import { generateRecommendations, historicalJackpotKeys, isHistoricalJackpot } from "./index.js";

// A representative historical-jackpot exclusion set. With a real committed seed this slice is the
// full draw history; the invariants below hold identically and the run cost stays bounded (numRuns).
const historicalDraws: DrawResult[] = [
  { drawNo: 1, date: "2002-12-07", numbers: [10, 23, 29, 33, 37, 40], bonusNumber: 16, parserVersion: "seed" },
  { drawNo: 2, date: "2002-12-14", numbers: [9, 13, 21, 25, 32, 42], bonusNumber: 2, parserVersion: "seed" },
  { drawNo: 3, date: "2002-12-21", numbers: [11, 16, 19, 21, 27, 31], bonusNumber: 30, parserVersion: "seed" },
];
const jackpotKeys = historicalJackpotKeys(historicalDraws);

describe("core generation invariants (property-based, M9)", () => {
  it("recommendations are always 6 ascending-unique numbers, include every lucky anchor, exclude jackpots, and are in-request unique", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 45 }), { minLength: 0, maxLength: 5 }),
        fc.integer({ min: 1, max: 5 }),
        (luckyNumbers, count) => {
          const out = generateRecommendations({ luckyNumbers, count, historicalDraws, targetDrawNo: 4 });
          const keys = new Set<string>();
          for (const rec of out.recommendations) {
            expect(rec.numbers).toHaveLength(6);
            for (let i = 1; i < rec.numbers.length; i++) {
              expect(rec.numbers[i]).toBeGreaterThan(rec.numbers[i - 1]); // strictly ascending ⇒ unique
            }
            for (const lucky of luckyNumbers) expect(rec.numbers).toContain(lucky);
            expect(isHistoricalJackpot(rec.numbers, jackpotKeys)).toBe(false);
            keys.add(rec.numbers.join("-"));
          }
          expect(keys.size).toBe(out.recommendations.length);
        },
      ),
      { numRuns: 25 },
    );
  });
});
