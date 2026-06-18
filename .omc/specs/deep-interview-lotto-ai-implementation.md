# Deep Interview Spec: Korean Lotto AI — Implementation Blueprint

## Metadata
- Interview ID: di-lotto-ai-20260617
- Rounds: 6
- Final Ambiguity Score: 12%
- Type: greenfield (built from `PRD-english-lotto-ai.md` v0.2; no prior source)
- Generated: 2026-06-17
- Threshold: 0.20 (20%)
- Threshold Source: default
- Initial Context Summarized: yes (PRD ~750 lines reduced to a prompt-safe decision summary)
- Status: PASSED
- Source PRD: `PRD-english-lotto-ai.md` (Korean mirror: `PRD-korean-lotto-ai.md`)

> This spec does **not** restate the PRD. The PRD already nails the *what* (FRs, data model, rank rules, API shapes). This interview resolved the six *how* forks the PRD left open, so the spec below is an **implementation overlay** on top of the PRD. Read both together.

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.92 | 0.40 | 0.368 |
| Constraint Clarity | 0.88 | 0.30 | 0.264 |
| Success Criteria | 0.82 | 0.30 | 0.246 |
| **Total Clarity** | | | **0.878** |
| **Ambiguity** | | | **0.122 (12%)** |

Context Clarity is N/A (greenfield: no existing system to understand).

## Topology
All 5 components confirmed **active** in Round 0 and reaffirmed under Contrarian pressure in Round 4. Observability (Langfuse) and Responsible-use/Safety UX remain **cross-cutting** concerns riding on the components below.

| Component | Status | Description | Coverage / Decision |
|-----------|--------|-------------|---------------------|
| Core Domain Engine (`packages/core`, TS) | active | Validation, strategy candidate generation, exact-jackpot exclusion, statistics, rank calculation | **Single source of truth** for all deterministic domain logic (R3). 100% rank-calc test coverage (PRD §22). |
| Draw Data Layer (`packages/data`, TS) | active | `LotteryResultProvider`, SQLite persistence (draws/recs/checks), seed + sync | **Hybrid**: committed seed backfill + live JSON endpoint for new draws (R2). TS owns the DB. |
| AI Agent Runtime (`apps/agent`, Python) | active | LangGraph workflow, `glm-5.1` via NIM, structured output, deterministic fallback | **Orchestration + LLM only** (R3). Tools are HTTP calls back to the TS API. Model-agnostic provider (R5). |
| API Server (`apps/api`, TS) | active | Public REST + internal endpoints consumed by the agent's tools | Bridges Web ↔ core/data ↔ agent. Hosts `/internal/*` for agent tool calls. |
| Web UI (`apps/web`, TS) | active | The 6 PRD screens; thin API client only | API-client-only per PRD §12.2 (Android-readiness). |

Deferrals: **none**.

## Goal
Build the PRD's Korean Lotto 6/45 service as a **polyglot monorepo** where deterministic TypeScript domain logic is authoritative and a Python LangGraph agent adds LLM "pattern analysis" flavor on top — never deciding numbers. v1 ships **all five components functional**, with the LLM as a core (not optional) feature that nonetheless **degrades gracefully** to deterministic templated explanations when NVIDIA NIM is unavailable. Users enter lucky numbers, receive 1–5 validated combinations that never exactly match a historical jackpot, can save picks, check results against synced draws by rank, and are guided (never automated) to the official purchase site — all locally runnable with one command and fully Langfuse-traceable.

## Constraints (resolved this interview)
- **Runtime = polyglot, PRD-faithful** (R1): TS `apps/web` + TS `apps/api` + a **separate** Python `apps/agent` service communicating over **HTTP**. Two dependency stacks (pnpm + uv), two test stacks (Vitest + pytest), two validation libs (Zod + Pydantic). Accepted cost for using NVIDIA's first-class Python `ChatNVIDIA`/LangGraph path.
- **Domain ownership = TS core is authoritative** (R3): candidate generation, validation, statistics, and rank calculation live **once** in `packages/core`. The Python agent's LangChain tools (`compute_lotto_statistics`, `generate_candidate_combinations`, `validate_combination`, `get_latest_draw_results`, `save_recommendation`) are **thin HTTP wrappers** that call `apps/api` `/internal/*` endpoints. No domain logic is duplicated in Python. This honors PRD §9.3 ("LLM must not decide numbers"), §19 ("zero exact-jackpot duplicates"), and §12.2 (core reusable for Android).
- **Data acquisition = hybrid behind `LotteryResultProvider`** (R2): a committed **seed dataset** of all historical draws (offline, deterministic tests) + **incremental live sync** via the unofficial JSON endpoint `GET https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={N}` (fields: `drwNo`, `drwNoDate`, `drwtNo1..6`, `bnusNo`, `returnValue`). Last-good degradation per FR-004. "Latest draw" detected by date-anchored computation (draw #1 = 2002-12-07, +1/week) and/or probing until `returnValue != "success"`.
- **LLM provider = model-agnostic via OpenAI-compatible endpoint** (R5): the agent targets `https://integrate.api.nvidia.com/v1` (OpenAI-compatible) with `NVIDIA_MODEL=z-ai/glm-5.1` as default but swappable. On 404 / permission error / timeout / rate-limit → clear startup/first-call error **and** graceful degrade to a configurable secondary NIM model and/or the deterministic templated explanations, recording `fallbackUsed=true` in Langfuse. This absorbs the documented April-2026 NIM availability/permission gaps for `z-ai/glm-5.1`.
- **Dev runtime = one command, no Docker** (R6): Turbo/pnpm starts `web` + `api`; the same orchestration (e.g., a `dev` script using `concurrently`/`honcho`/Procfile) launches the Python agent via `uv`. Contributors need both Node and Python toolchains. `docker-compose` is an optional later add for prod-parity, not v1.
- **MVP cut = all 5 functional, LLM core, fallback is safety** (R4, Contrarian-tested): "Done for v1" = every PRD core flow (recommend → save → sync → check → purchase-guide) passes end-to-end, the agent produces schema-valid LLM explanations when NIM is reachable, and the product remains fully usable (deterministic explanations) when it is not.
- **Langfuse = optional/toggleable** (PRD §20): the service must run with Langfuse disabled; cloud (`cloud.langfuse.com`) is the default per `.env`, self-hosting is a config swap.

## Non-Goals (from PRD §5.2, reaffirmed)
- No lottery purchase / login / payment / deposit automation.
- No guarantee of improved winning odds; entertainment framing only.
- No storage of resident registration numbers, Donghaeng credentials, or sensitive identity data.
- No native Android app in v1 (architecture stays Android-ready).
- No duplication of domain logic into Python (explicitly rejected in R3).

## Acceptance Criteria
- [ ] Monorepo bootstraps with `pnpm install` + `uv sync` and starts **web + api + agent** via a single documented dev command (no Docker required).
- [ ] `packages/core` is the sole implementation of candidate generation, validation, statistics, and rank calculation; **no equivalent logic exists in `apps/agent`**.
- [ ] Recommendations always include all lucky numbers, are 6 numbers sorted ascending, are unique within a request, and **never exactly match a historical 1st-prize combination** (PRD FR-020/021/022, §19 = 0 duplicates).
- [ ] Rank calculation has **100% unit-test coverage** across 1st–5th, no-prize, and bonus-match cases (PRD §15/§20/§22).
- [ ] `LotteryResultProvider` has (a) a seed-backed offline implementation used in tests via mock, and (b) a live JSON-endpoint implementation; network failure degrades to last-good data (FR-004) and surfaces a clear UI state.
- [ ] The Python agent's tools call `apps/api` `/internal/*` endpoints over HTTP; with the agent's LLM disabled or NIM unreachable, `POST /api/recommendations` still returns valid deterministic combinations + templated explanations with `fallbackUsed=true`.
- [ ] Agent talks to NIM via the OpenAI-compatible `base_url`; swapping `NVIDIA_MODEL` requires no code change; a missing `NVIDIA_API_KEY` produces a clear configuration error.
- [ ] LangGraph workflow `load_draw_data → compute_statistics → generate_candidates → validate_candidates → llm_explain → persist/return` is observable in Langfuse with node names as span names and the PRD §17 metadata contract (`requestId`, `targetDrawNo`, `fallbackUsed`, `anonymousSessionId`, …); the service also runs with Langfuse disabled.
- [ ] LLM output is schema-validated (Pydantic in agent, Zod at the API boundary); on validation failure, retry once then use fallback explanations (PRD §10.5).
- [ ] Saved-combination result checking compares against synced draws and reports rank + matched numbers + bonus match (FR-042/043).
- [ ] Purchase CTA opens the official URL in a new tab, shows the §18 disclaimer + 19+ + anti-overuse wording, provides copyable numbers, and never automates purchase.
- [ ] API contracts are typed (OpenAPI or typed RPC) so a future Android client can reuse them; Web is an API client only.
- [ ] `.env.example` includes NIM (model-agnostic), Langfuse, SQLite, and Donghaeng URL settings per PRD §16.

## Assumptions Exposed & Resolved
| Assumption (PRD-implied) | Challenge | Resolution |
|--------------------------|-----------|------------|
| "TS web/api + Python agent recommended" is just one option | R1: is polyglot worth its two-runtime tax vs single Python/TS? | **Keep polyglot** for PRD fidelity + first-class NVIDIA Python path (user choice). |
| Get winning numbers by scraping `/lt645/result` | R2: scraping is brittle; an unofficial JSON endpoint exists | **Hybrid** seed + JSON endpoint behind `LotteryResultProvider`. |
| Domain logic in TS core *and* agent tools in Python (PRD §12.1 vs §10.2) | R3: who is the source of truth? Duplication risks the "0 duplicates" guarantee | **TS core authoritative**; Python agent = orchestration + LLM only; tools = HTTP back to API. |
| All components + LLM needed for first release | R4 (Contrarian): the mandated deterministic fallback means a no-LLM product already works | **LLM is core to v1**; fallback is safety net, not the main path — user reaffirmed all 5. |
| `z-ai/glm-5.1` is available and ready to call | R5: model exists but had documented NIM API availability/permission issues (Apr 2026) | **Model-agnostic** OpenAI-compatible provider + configurable fallback model + graceful degrade. |
| Local run is "just localhost Web" | R6 (Simplifier): a polyglot repo needs a concrete "start everything" story | **One command** via Turbo/pnpm + concurrent Python (`uv`), no Docker for v1. |

## Technical Context
**Resolved architecture (overlay on PRD §12.1):**
```txt
lotto-ai/
  apps/
    web/    # TS, thin API client (Next.js or Vite React) — PRD §11 screens
    api/    # TS (Fastify/Hono), public REST (PRD §13) + /internal/* for agent tools; owns SQLite
    agent/  # Python, LangGraph orchestrator; ChatNVIDIA/OpenAI-compatible glm-5.1; Langfuse; tools = HTTP -> api/internal
  packages/
    core/   # TS, AUTHORITATIVE domain: generation, validation, statistics, rank (100% rank tests)
    data/   # TS, SQLite + repositories + LotteryResultProvider (seed + JSON endpoint)
    shared/ # TS, DTOs + Zod schemas + OpenAPI types (mirrored by Pydantic in agent)
  docs/PRD.md
  .env.example
```
**Agent ↔ API contract:** agent tools issue HTTP to `apps/api` `/internal/{generate-candidates,validate,statistics,latest-draws,save}`; the agent contributes only LLM explanations + structured output + fallback decisions. The API composes deterministic results (always valid) with the agent's explanations (best-effort).

**External systems & evidence:**
- **NVIDIA NIM `z-ai/glm-5.1`** — verified real (754B MoE, 131K context, agentic-focused), live on build.nvidia.com since 2026-04-17, OpenAI-compatible at `integrate.api.nvidia.com/v1`. **Caveat:** documented April-2026 forum reports of API unavailability/hangs tied to "Missing Public API Endpoints permission" and model-ID ambiguity (`z-ai/glm-5.1` vs `z-ai/glm5` vs docs slug `z-ai-glm5.1`) — hence the model-agnostic policy. Verify org "Public API Endpoints" permission before first live call.
- **Donghaeng Lottery JSON endpoint** — `common.do?method=getLottoNumber&drwNo={N}`, long-stable, returns clean per-draw JSON. Draw #1 anchor = 2002-12-07, weekly cadence (~20:35 Sat).
- **Langfuse** — cloud default, optional/toggleable.

**Verify-before-build checklist:** confirm `NVIDIA_API_KEY` + org Public-API-Endpoints permission with one live `glm-5.1` call; confirm outbound network to `dhlottery.co.kr`; pick the exact working model-ID string and record it in `.env`.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| DrawResult | core domain | drawNo, drawDate, n1..n6, bonus, sourceUrl, fetchedAt, parserVersion | compared by ResultCheck; produced by LotteryResultProvider |
| Recommendation | core domain | id, targetDrawNo, numbers[6], luckyNumbers[], tags[], explanation, disclaimer, traceId, status, createdAt | targets a DrawResult; has many ResultChecks |
| ResultCheck | core domain | id, recommendationId, drawNo, matchedNumbers[], matchedCount, bonusMatched, rank, checkedAt | belongs to Recommendation; evaluates vs DrawResult |
| LuckyNumbers | supporting (value object) | numbers[0..6], each 1–45 unique | input that every Recommendation must include |
| LottoCombination | supporting (value object) | numbers[6] sorted ascending | composes a Recommendation |
| Statistics | supporting | frequency, rangeDist, oddEven, sumDist, consecutive, hotCold | derived from DrawResult set; consumed by generation + agent |
| LotteryResultProvider | external boundary (interface) | getLatest(), getByDrawNo(), syncNew() | feeds DrawResults into Data layer |
| LottoRecommendationAgent | external system (orchestrator) | tools[], stateGraph, llmClient | calls API /internal/*; calls NIM glm-5.1; emits Langfuse traces |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|-----------------|
| 1 | 8 | 8 | - | - | N/A (baseline) |
| 2 | 8 | 0 | 0 | 8 | 100% |
| 3 | 8 | 0 | 0 | 8 | 100% |
| 4 | 8 | 0 | 0 | 8 | 100% |
| 5 | 8 | 0 | 0 | 8 | 100% |
| 6 | 8 | 0 | 0 | 8 | 100% |

The domain model converged immediately because PRD §14 already specifies a clean data model; every interview round targeted *implementation approach* (constraints/criteria), not entity discovery.

## Interview Transcript
<details>
<summary>Full Q&A (6 rounds)</summary>

### Round 0 — Topology Enumeration
**Q:** Is this 5-component shape (Core Domain, Draw Data, AI Agent, API, Web UI) right?
**A:** Looks right — all 5 active. Observability + Safety UX remain cross-cutting.

### Round 1 — Runtime architecture (Constraint Clarity)
**Q:** Polyglot (TS web/api + Python agent) vs single Python vs single TypeScript?
**A:** Polyglot as written (TS web/api + separate Python agent over HTTP).
**Ambiguity:** 32% (Goal 0.87, Constraints 0.50, Criteria 0.62)

### Round 2 — Data acquisition (Constraint Clarity)
**Q:** How does `LotteryResultProvider` get winning numbers?
**A:** Hybrid — bundled seed backfill + unofficial JSON endpoint for new draws.
**Ambiguity:** 27% (Goal 0.88, Constraints 0.62, Criteria 0.65)

### Round 3 — Domain ownership boundary (Constraint Clarity)
**Q:** In the polyglot split, who owns generation/validation/statistics/rank, and what is the agent's role?
**A:** TS core = single source of truth; Python agent is LLM-only, tools = HTTP back to API.
**Ambiguity:** 21% (Goal 0.90, Constraints 0.74, Criteria 0.68)

### Round 4 — MVP cut (Success Criteria, **Contrarian mode**)
**Q:** Is the LLM agent v1-critical, or polish on a deterministic product that must already work without it?
**A:** LLM is core — v1 must include the working agent (fallback = safety only).
**Ambiguity:** 20% (Goal 0.91, Constraints 0.70, Criteria 0.76)

### Round 5 — NIM dependency policy (Constraint Clarity, evidence-gathered)
**Q:** Given documented NIM availability/permission issues, how to handle the NVIDIA dependency?
**A:** Model-agnostic via OpenAI-compatible base_url + configurable fallback model + graceful degrade.
**Ambiguity:** 14% (Goal 0.92, Constraints 0.84, Criteria 0.80)

### Round 6 — Dev orchestration (Constraint Clarity, **Simplifier mode**)
**Q:** Simplest reliable way to run web + api + agent locally?
**A:** One command via pnpm/Turbo + concurrent Python (uv), no Docker.
**Ambiguity:** 12% (Goal 0.92, Constraints 0.88, Criteria 0.82)

</details>

## Sources (model-reality verification, Round 5)
- NVIDIA NIM GLM-5.1 model page: https://build.nvidia.com/z-ai/glm-5.1
- NVIDIA NIM API reference (z-ai/glm5.1): https://docs.api.nvidia.com/nim/reference/z-ai-glm5.1
- NVIDIA Developer Forum — GLM-5 deprecation / glm-5.1 not available in NIM API: https://forums.developer.nvidia.com/t/urgent-glm-5-deprecation-april-20-2026-replacement-z-ai-glm-5-1-not-available-in-nim-api/366610
- NVIDIA Developer Forum — Missing Public API Endpoints permission / hang on z-ai/glm-5.1: https://forums.developer.nvidia.com/t/missing-public-api-endpoints-permission-in-personal-organization-hang-on-z-ai-glm-5-1-via-integrate-api-nvidia-com/367453
