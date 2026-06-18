import { z } from "zod";
import { LOTTO_MAX, LOTTO_MIN, LOTTO_PICK_COUNT, MAX_RECOMMENDATION_COUNT, MIN_RECOMMENDATION_COUNT } from "./constants.js";

export const lottoNumberSchema = z.number().int().min(LOTTO_MIN).max(LOTTO_MAX);
export const lottoCombinationSchema = z.array(lottoNumberSchema).length(LOTTO_PICK_COUNT).refine((numbers) => numbers.every((n, i) => i === 0 || numbers[i - 1] < n), "numbers must be unique and ascending");
export type LottoCombination = z.infer<typeof lottoCombinationSchema>;

export const recommendationRequestSchema = z.object({
  luckyNumbers: z.array(lottoNumberSchema).max(LOTTO_PICK_COUNT).default([]),
  count: z.number().int().min(MIN_RECOMMENDATION_COUNT).max(50).default(MAX_RECOMMENDATION_COUNT),
  targetDrawNo: z.number().int().positive().optional()
});
export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;

export const drawResultSchema = z.object({
  drawNo: z.number().int().positive(),
  date: z.string(),
  numbers: lottoCombinationSchema,
  bonusNumber: lottoNumberSchema,
  sourceUrl: z.string().optional(),
  fetchedAt: z.string().optional(),
  parserVersion: z.string().default("dhlottery-json-v1")
});
export type DrawResult = z.infer<typeof drawResultSchema>;

export const feasibilitySchema = z.object({
  status: z.enum(["OK", "PARTIAL", "INFEASIBLE_LUCKY_SET"]),
  requestedCount: z.number().int(),
  effectiveCount: z.number().int(),
  partial: z.boolean().default(false),
  message: z.string().optional()
});
export type Feasibility = z.infer<typeof feasibilitySchema>;

export const recommendationSchema = z.object({
  id: z.string(),
  numbers: lottoCombinationSchema,
  tags: z.array(z.string()),
  stats: z.record(z.union([z.number(), z.string(), z.boolean()])),
  explanation: z.string(),
  tagNarration: z.string()
});
export type Recommendation = z.infer<typeof recommendationSchema>;

export const dataFreshnessSchema = z.object({
  latestSyncedDrawNo: z.number().int().nonnegative(),
  syncStatus: z.enum(["fresh", "last-good", "skipped"]),
  syncErrorKind: z.string().nullable(),
});
export type DataFreshness = z.infer<typeof dataFreshnessSchema>;

export const recommendationResponseSchema = z.object({
  requestId: z.string(),
  traceId: z.string().nullable(),
  targetDrawNo: z.number().int().positive(),
  luckyNumbers: z.array(lottoNumberSchema),
  recommendations: z.array(recommendationSchema),
  fallbackUsed: z.boolean(),
  freshness: dataFreshnessSchema,
  feasibility: feasibilitySchema,
  disclaimers: z.array(z.string())
});
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;

export const explainRequestSchema = z.object({
  requestId: z.string(),
  traceId: z.string().nullable(),
  combinations: z.array(recommendationSchema.omit({ explanation: true, tagNarration: true })),
  stats: z.record(z.unknown()),
  luckyNumbers: z.array(lottoNumberSchema),
  targetDrawNo: z.number().int().positive()
});
export type ExplainRequest = z.infer<typeof explainRequestSchema>;

export const explainResponseSchema = z.object({
  perCombination: z.array(z.object({ id: z.string(), explanation: z.string().min(1), tagNarration: z.string().min(1) })),
  analysisSummary: z.string(),
  fallbackUsed: z.boolean()
});
export type ExplainResponse = z.infer<typeof explainResponseSchema>;

export const saveRecommendationRequestSchema = z.object({
  requestId: z.string(),
  traceId: z.string().nullable(),
  targetDrawNo: z.number().int().positive(),
  combinations: z.array(lottoCombinationSchema),
  fallbackUsed: z.boolean()
});
export type SaveRecommendationRequest = z.infer<typeof saveRecommendationRequestSchema>;

export const resultCheckSchema = z.object({
  recommendationId: z.string(),
  drawNo: z.number().int().positive(),
  matchedNumbers: z.array(lottoNumberSchema),
  bonusMatched: z.boolean(),
  rank: z.enum(["1st", "2nd", "3rd", "4th", "5th", "No Prize"])
});
export type ResultCheck = z.infer<typeof resultCheckSchema>;
