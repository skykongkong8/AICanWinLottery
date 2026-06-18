import { describe, expect, it } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { explainRequestGolden, explainResponseGolden } from "./golden.js";
import { explainRequestSchema, explainResponseSchema, lottoCombinationSchema, recommendationRequestSchema } from "./schemas.js";
import { openApiDocument } from "./openapi.js";

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

// M2: the OpenAPI document is the codegen source but is hand-authored, so it could silently drift
// from the Zod schemas (the runtime source of truth). Derive JSON Schema from Zod here and assert
// the constrained, drift-prone fields agree. Bounds that diverge fail the build.
describe("Zod ↔ OpenAPI contract parity (M2)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqJson = zodToJsonSchema(recommendationRequestSchema) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comboJson = zodToJsonSchema(lottoCombinationSchema) as any;
  const schemas = openApiDocument.components.schemas;

  it("RecommendationRequest.count bounds match the Zod source", () => {
    expect(schemas.RecommendationRequest.properties.count.minimum).toBe(reqJson.properties.count.minimum);
    expect(schemas.RecommendationRequest.properties.count.maximum).toBe(reqJson.properties.count.maximum);
  });

  it("luckyNumbers item range and maxItems match the Zod source", () => {
    const oaLucky = schemas.RecommendationRequest.properties.luckyNumbers;
    const zLucky = reqJson.properties.luckyNumbers;
    expect(oaLucky.maxItems).toBe(zLucky.maxItems);
    expect(oaLucky.items).toMatchObject({ minimum: zLucky.items.minimum, maximum: zLucky.items.maximum });
  });

  it("LottoCombination length and item range match the Zod source", () => {
    expect(schemas.LottoCombination.minItems).toBe(comboJson.minItems);
    expect(schemas.LottoCombination.maxItems).toBe(comboJson.maxItems);
    expect(schemas.LottoCombination.items).toMatchObject({ minimum: comboJson.items.minimum, maximum: comboJson.items.maximum });
    // Ascending/unique cannot be expressed in JSON Schema; OpenAPI carries them as invariant
    // markers (enforced at runtime by the Zod .refine and the generated Pydantic validator).
    expect(schemas.LottoCombination.uniqueItems).toBe(true);
    expect(schemas.LottoCombination["x-ascending"]).toBe(true);
  });
});
