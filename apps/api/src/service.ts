import { randomUUID } from "node:crypto";
import {
  disclaimers,
  generateRecommendations,
  isAscendingSix,
  normalizeRequest,
  rankCombination,
} from "@lotto/core";
import {
  classifyFreshness,
  defaultStore,
  DhlotteryJsonProvider,
  DrawBackfillError,
  syncDrawsBeforeServing,
  type LotteryResultProvider,
} from "@lotto/data";
import {
  recommendationRequestSchema,
  saveRecommendationRequestSchema,
  type DataFreshness,
  type RecommendationResponse,
} from "@lotto/shared";
import { explainWithAgent } from "./agentClient.js";

export async function createRecommendations(
  body: unknown,
  opts: { agentUrl?: string; skipLiveSync?: boolean; provider?: LotteryResultProvider } = {},
): Promise<RecommendationResponse> {
  const req = recommendationRequestSchema.parse(body);
  const normalized = normalizeRequest(req);
  let freshness: DataFreshness = { latestSyncedDrawNo: 0, syncStatus: "skipped", syncErrorKind: null };

  if (!opts.skipLiveSync) {
    const provider = opts.provider ?? new DhlotteryJsonProvider();
    try {
      freshness = classifyFreshness(await syncDrawsBeforeServing(defaultStore, provider));
    } catch (err) {
      freshness = {
        latestSyncedDrawNo: await defaultStore.latestDrawNo(),
        syncStatus: "last-good",
        syncErrorKind: err instanceof DrawBackfillError ? err.code : err instanceof Error ? err.name : "UnknownError",
      };
    }
  }

  const draws = await defaultStore.listDraws();
  const latest = draws.at(-1)?.drawNo ?? 0;
  if (opts.skipLiveSync) freshness = { latestSyncedDrawNo: latest, syncStatus: "skipped", syncErrorKind: null };
  const targetDrawNo = normalized.targetDrawNo ?? latest + 1;
  if (targetDrawNo <= latest) {
    throw Object.assign(new Error("targetDrawNo must be later than the latest synced draw"), {
      status: 400,
    });
  }

  const requestId = randomUUID();
  const traceId = process.env.LANGFUSE_PUBLIC_KEY ? randomUUID() : null;
  const generated = generateRecommendations({
    luckyNumbers: normalized.luckyNumbers,
    count: normalized.count,
    historicalDraws: draws,
    targetDrawNo,
  });

  const base = {
    requestId,
    traceId,
    targetDrawNo,
    luckyNumbers: normalized.luckyNumbers,
    recommendations: generated.recommendations,
    fallbackUsed: true,
    freshness,
    feasibility: generated.feasibility,
    disclaimers: disclaimers(),
  } satisfies RecommendationResponse;

  if (generated.recommendations.length === 0) return base;

  const explanation = await explainWithAgent(
    {
      requestId,
      traceId,
      combinations: generated.recommendations.map(({ explanation: _e, tagNarration: _t, ...rest }) => rest),
      stats: { latestDrawNo: latest, historicalDraws: draws.length },
      luckyNumbers: normalized.luckyNumbers,
      targetDrawNo,
    },
    { agentUrl: opts.agentUrl },
  );

  const byId = new Map(explanation.perCombination.map((item) => [item.id, item]));
  return {
    ...base,
    fallbackUsed: explanation.fallbackUsed,
    recommendations: generated.recommendations.map((recommendation) => ({
      ...recommendation,
      ...(byId.get(recommendation.id) ?? {}),
    })),
  };
}

export async function saveRecommendations(body: unknown) {
  const payload = saveRecommendationRequestSchema.parse(body);
  return { saved: await defaultStore.saveRecommendations(payload) };
}

export async function getInternalStatistics() {
  const draws = await defaultStore.listDraws();
  return { latestDrawNo: draws.at(-1)?.drawNo ?? 0, historicalDraws: draws.length };
}

export async function getInternalLatestDraws(limit = 10) {
  const draws = await defaultStore.listDraws();
  return { draws: draws.slice(-limit) };
}

export async function generateInternalCandidates(body: unknown) {
  const req = recommendationRequestSchema.parse(body);
  const normalized = normalizeRequest(req);
  const draws = await defaultStore.listDraws();
  const latest = draws.at(-1)?.drawNo ?? 0;
  return generateRecommendations({
    luckyNumbers: normalized.luckyNumbers,
    count: normalized.count,
    historicalDraws: draws,
    targetDrawNo: normalized.targetDrawNo ?? latest + 1,
  });
}

export async function validateInternalCandidates(body: unknown) {
  const payload = body as { combinations?: number[][] };
  const combinations = payload.combinations ?? [];
  return {
    valid: combinations.every(isAscendingSix),
    results: combinations.map((numbers) => ({ numbers, valid: isAscendingSix(numbers) })),
  };
}

export async function runAgentDevPath(body: unknown) {
  const agentUrl = process.env.AGENT_URL ?? "http://localhost:8000";
  const res = await fetch(`${agentUrl}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw Object.assign(new Error(`agent run failed: ${res.status}`), { status: 502 });
  return res.json();
}

export async function checkSavedRecommendation(id: string, drawNo?: number) {
  const saved = await defaultStore.getSaved(id);
  if (!saved) throw Object.assign(new Error("saved recommendation not found"), { status: 404 });

  let target: number;
  if (drawNo !== undefined) {
    target = drawNo;
  } else {
    // Rank against the recommendation's actual target draw — never silently clamp to an earlier
    // drawn result. If that draw has not occurred yet, say so instead of persisting a fake check.
    const latest = await defaultStore.latestDrawNo();
    if (latest < saved.targetDrawNo) {
      throw Object.assign(new Error("target draw has not been drawn yet"), { status: 409 });
    }
    target = saved.targetDrawNo;
  }
  const draw = await defaultStore.getDraw(target);
  if (!draw) throw Object.assign(new Error("draw result not found"), { status: 404 });

  const ranked = rankCombination(saved.numbers, draw.numbers, draw.bonusNumber);
  const row = await defaultStore.saveResultCheck({
    recommendationId: saved.id,
    drawNo: draw.drawNo,
    matchedNumbers: ranked.matchedNumbers,
    bonusMatched: ranked.bonusMatched,
    rank: ranked.rank,
  });
  return { recommendationId: saved.id, drawNo: draw.drawNo, ...ranked, checkId: row.id };
}
