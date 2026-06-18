import { describe, expect, it } from "vitest";
import { explainRequestGolden, explainResponseGolden } from "./golden.js";
import { explainRequestSchema, explainResponseSchema } from "./schemas.js";

describe("shared contract fixtures", () => {
  it("validates explain request and response golden fixtures", () => {
    expect(explainRequestSchema.parse(explainRequestGolden).combinations[0].numbers).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(explainResponseSchema.parse(explainResponseGolden).fallbackUsed).toBe(false);
  });

  it("rejects out-of-range and non-ascending combinations", () => {
    expect(
      explainRequestSchema.safeParse({
        ...explainRequestGolden,
        combinations: [{ ...explainRequestGolden.combinations[0], numbers: [1, 2, 3, 4, 5, 99] }],
      }).success,
    ).toBe(false);
    expect(
      explainRequestSchema.safeParse({
        ...explainRequestGolden,
        combinations: [{ ...explainRequestGolden.combinations[0], numbers: [1, 2, 3, 4, 6, 5] }],
      }).success,
    ).toBe(false);
  });
});
