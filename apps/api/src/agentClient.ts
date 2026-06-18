import { fallbackExplanation } from "@lotto/core";
import {
  explainResponseSchema,
  type ExplainRequest,
  type ExplainResponse,
} from "@lotto/shared";

function fallbackResponse(request: ExplainRequest, summary: string): ExplainResponse {
  return {
    perCombination: request.combinations.map((combination) => ({
      id: combination.id,
      ...fallbackExplanation(combination.numbers, combination.tags, request.luckyNumbers),
    })),
    analysisSummary: summary,
    fallbackUsed: true,
  };
}

function hasExactExplanationCoverage(request: ExplainRequest, response: ExplainResponse) {
  if (response.perCombination.length !== request.combinations.length) return false;
  const expectedIds = request.combinations.map((combination) => combination.id);
  const actualIds = response.perCombination.map((item) => item.id);
  const expected = new Set(expectedIds);
  const actual = new Set(actualIds);
  if (expected.size !== expectedIds.length || actual.size !== actualIds.length) return false;
  return expected.size === actual.size && expectedIds.every((id) => actual.has(id));
}

export async function explainWithAgent(
  request: ExplainRequest,
  opts: { agentUrl?: string; timeoutMs?: number } = {},
): Promise<ExplainResponse> {
  const agentUrl = opts.agentUrl ?? process.env.AGENT_URL ?? "http://localhost:8000";
  const timeoutMs = opts.timeoutMs ?? Number(process.env.AGENT_EXPLAIN_TIMEOUT_MS ?? 20_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${agentUrl}/explain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`agent ${res.status}`);

    const parsed = explainResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("agent schema invalid");
    if (!hasExactExplanationCoverage(request, parsed.data)) {
      return fallbackResponse(
        request,
        "Agent response omitted or added recommendation IDs; deterministic fallback explanations used.",
      );
    }
    return parsed.data.fallbackUsed
      ? { ...fallbackResponse(request, parsed.data.analysisSummary), fallbackUsed: true }
      : parsed.data;
  } catch {
    return fallbackResponse(request, "Agent unavailable; deterministic fallback explanations used.");
  } finally {
    clearTimeout(timer);
  }
}
