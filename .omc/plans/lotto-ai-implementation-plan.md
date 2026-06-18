# Consensus Implementation Plan: Korean Lotto AI Service

- Status: **CONSENSUS-APPROVED v2.1 — PENDING APPROVAL** (Architect: SOUND-WITH-CHANGES, no blocking gaps · Critic: APPROVED · 3 non-blocking refinements merged)
- Source spec: `.omc/specs/deep-interview-lotto-ai-implementation.md`
- Source PRD: `PRD-english-lotto-ai.md` (v0.2)
- Mode: `--consensus --direct` (non-interactive), RALPLAN-DR short
- Date: 2026-06-17

> **Consensus result:** 2 iterations. v1 → Architect (SOUND-WITH-CHANGES) + Critic (REJECTED: 4 CRITICAL + 4 MAJOR) → v2 → Architect (SOUND-WITH-CHANGES, no blocking gaps) + Critic (APPROVED). The load-bearing fix is **§0 Orchestration Contract**, which pins a single runtime call direction (API owns the numbers; the agent is one explanation call). All CRITICAL/MAJOR findings are resolved and cross-referenced as `[fixes C1]` etc.; the 3 final non-blocking reviewer refinements are merged in v2.1 and tagged `[fixes NEW-*]`.

---

## §0. Orchestration Contract (the single source of truth for runtime call direction) `[fixes C1, C2, M1]`

This section is normative and overrides any looser phrasing elsewhere.

**There are exactly two paths, and only the hot path serves users:**

### Hot path — `POST /api/recommendations` (user-facing, latency-bound)
```
Web → API:  POST /api/recommendations { luckyNumbers, count, targetDrawNo? }
API:        1. validate input (range, dedup, 0–6 lucky, clamp count to 1..5)   [packages/core]
            2. resolve targetDrawNo (default = latestSyncedDrawNo + 1)
            3. ensure draw data freshness (may trigger a write-serialized sync)
            4. generate + validate + exclude + tag + compute stats             [packages/core]  ← API OWNS THE NUMBERS
            5. ONE call → Agent:  POST {AGENT_URL}/explain { combinations[], stats, luckyNumbers, targetDrawNo }
                                  (timeout = AGENT_EXPLAIN_TIMEOUT_MS, default 20000)
Agent:      compact LangGraph: receive_context → llm_explain → structure_output → [fallback]
            returns { perCombination: [{explanation, tagNarration}], analysisSummary, fallbackUsed }
            (agent NEVER generates/validates/persists; NEVER writes the DB)
API:        6. merge explanations onto deterministic combinations
            7. stamp fallbackUsed (API is the SOLE authority — see truth table below)
            8. attach disclaimers (§18); return response (NOT persisted yet)
```
The agent's `/explain` is **stateless** and receives candidates as input. It cannot alter numbers. If the agent is unreachable, times out, or returns schema-invalid output, the API substitutes deterministic templated explanations from `packages/core` and sets `fallbackUsed=true`.

### Dev/trace path — `POST /api/agent/run` (NON-hot-path, observability + FR-034 fidelity) `[Architect synthesis]`
The full six-node LangGraph `load_draw_data → compute_statistics → generate_candidates → validate_candidates → llm_explain → return` lives here, with tools that HTTP back to `/internal/{latest-draws,statistics,generate-candidates,validate}` (read-only; **no `/internal/save`**). This path powers the Developer/Traces screen and standalone agent demos, satisfies PRD §10.5/FR-034 node-as-span tracing, and is explicitly **not** on the user request path. It never persists.

### Persistence ownership `[fixes C2]`
- **`apps/api` is the only process that writes SQLite.** The agent has no DB access and no save tool.
- `POST /api/recommendations` **generates and returns** combinations; it does not mark them "saved".
- **Saving** selected combinations is a separate web→API write: `POST /api/recommendations` is generate-only; add **`POST /api/recommendations/save`** (web-initiated) to persist user-chosen combinations with `status=pending` and the fields in §14 (+ a `source` marker recording `fallbackUsed`). The save payload MUST echo the generate-time `requestId`/`traceId` so the persisted row's §14 `trace_id` links to its originating Langfuse trace (FR-035). `[fixes NEW-1]` This reconciles §13 (which lacked an explicit save route) with Flow 1 step 7 ("user chooses combinations to save").
- SQLite configured with `PRAGMA journal_mode=WAL` + `PRAGMA busy_timeout=5000`; all writers (sync, save, check) run in the single API process and are serialized through one write path.

### `fallbackUsed` truth table (API is the sole authority) `[fixes M1, M2]`
| Condition observed by API | fallbackUsed |
|---|---|
| Agent returns 200 with schema-valid explanations and its own `fallbackUsed=false` | `false` |
| Agent returns 200 but it internally degraded (malformed LLM output → its own templated text), reporting `fallbackUsed=true` | `true` |
| Agent call fails / times out / connection refused (incl. cold-start not-ready) | `true` (API uses `packages/core` templated explanations) |
| Agent returns schema-invalid payload to the API | `true` (API re-validates and substitutes templated) |

The API never trusts agent numbers (there are none in the payload) — only its prose. Agent-not-ready at cold start is treated identically to NIM-unreachable.

---

## RALPLAN-DR Summary

### Principles
1. **Determinism owns the numbers; the LLM only narrates.** Generation/validation/exclusion/rank are pure functions in `packages/core`; the agent receives finished candidates and returns prose only (§0).
2. **One source of truth per concern.** Domain logic lives once in `packages/core`; SQLite is written only by `apps/api`; the cross-runtime contract is generated, not hand-mirrored (AC13).
3. **Graceful degradation on every optional dependency.** NIM down / agent down / data source down / Langfuse off each degrade to a defined, tested behavior — never a hard request failure.
4. **API-first / Android-ready.** Web is a thin client; web-side validation is advisory-only and the API is authoritative.
5. **Prove the math.** Rank and exact-jackpot exclusion carry 100% line+branch coverage with a CI fail-gate (v1, not a follow-up).

### Decision Drivers (top 3)
1. **PRD fidelity vs shippability** — keep the polyglot/NVIDIA/LangGraph/Langfuse stack while shipping a one-command v1.
2. **Correctness guarantees** — zero exact-jackpot duplicates and 100% rank coverage are hard gates.
3. **Dependency-risk management** — NIM availability and the unofficial dhlottery endpoint must degrade safely and testably.

### Viable Options (build sequencing & integration)
**Option A — API-first, dependency-ordered build (CHOSEN):** `shared → core → data → api (public + /internal + /agent/run + /explain client) → agent → web → observability/hardening`. The hot path (§0) needs only the API + core + data; the agent is built against the small, stable `/explain` contract. Pros: agent integrates against a real, minimal contract; no throwaway stubs; one orchestration model. Cons: reorders PRD Phase 3 after Phase 4.

**Option B — PRD literal phase order (Agent before API):** Pros: maximum doc fidelity. Cons: the agent's read-only `/internal/*` tools (dev path) would be stubbed and reworked; contradicts the §0 contract and R3 source-of-truth.

**Invalidation (A over B):** the agent's only runtime dependency on the hot path is the API calling *it* (`/explain`), and its dev-path tools are read-only against the API. Building the API first gives the agent a real contract on both paths with zero throwaway work. B is rejected.

---

## Requirements Summary
Polyglot pnpm/Turbo monorepo: `packages/{core,data,shared}` (TS) + `apps/{web,api}` (TS) + `apps/agent` (Python). `packages/core` is the authoritative domain layer; `apps/api` owns SQLite and orchestrates the hot path per §0; `apps/agent` is a stateless explanation service (hot path) plus a read-only dev/trace graph. One-command dev runtime (Turbo/pnpm + concurrent Python via uv), no Docker.

## Acceptance Criteria (testable)
- [ ] **AC1** — `pnpm install && uv sync` then a single `pnpm dev` starts web + api + agent; the agent answers a readiness ping and the API reaches it on cold start (a request during agent warmup returns deterministic results with `fallbackUsed=true`, never a 500). `[fixes M2]` *(Verify: startup script + cold-start integration test.)*
- [ ] **AC2** — `packages/core` is the only domain-logic implementation. Enforced by an AST/lint check: every file in `apps/agent/src/tools` contains only `httpx` calls (dev path) and imports no math/generation modules; the hot-path agent has no generation code. `[fixes m1]` *(Verify: lint rule in CI, not free-text grep.)*
- [ ] **AC3** — Every recommendation includes all lucky numbers, is 6 ascending numbers, is unique within a request, and never exactly equals a historical 1st-prize combination — verified by property tests over the seeded jackpot set, **including** the infeasible cases in AC15. *(Verify: property tests.)*
- [ ] **AC4** — `packages/core/rank` and `packages/core/exclusion` have **100% line+branch coverage** (1st–5th, no-prize, 2nd-vs-3rd bonus edge), enforced by a Vitest coverage threshold that **fails CI** in v1. Unreachable defensive branches are explicitly `/* c8 ignore */`-annotated with justification. `[fixes M4]` *(Verify: `vitest --coverage` gate.)*
- [ ] **AC5** — `LotteryResultProvider` has (a) a seed/mock impl for offline tests and (b) a live JSON impl; forced network failure degrades to last-good data with a clear UI state; **first-run seed→now gap is backfilled** before serving. `[fixes M3]` *(Verify: provider mock success/failure + seed-gap integration test.)*
- [ ] **AC6** — With NIM disabled/unreachable OR the agent process down, `POST /api/recommendations` returns valid deterministic combinations + templated explanations and `fallbackUsed=true`. *(Verify: two integration tests — NIM-fail and agent-down.)* `[fixes M1/M2]`
- [ ] **AC7** — Agent reaches NIM via OpenAI-compatible `base_url`; changing `NVIDIA_MODEL` needs no code change; missing `NVIDIA_API_KEY` yields a clear config error. *(Verify: env-swap + missing-key tests.)*
- [ ] **AC8** — Hot-path agent emits Langfuse spans for `receive_context → llm_explain → structure_output → [fallback]` with §17 metadata; the dev path `/api/agent/run` emits the full six-node spans; service runs with Langfuse disabled (`traceId=null`, `requestId` always present). *(Verify: trace inspection + Langfuse-off test.)*
- [ ] **AC9** — LLM output is schema-validated (Pydantic in agent, Zod at API boundary); on validation failure → retry once → templated fallback. *(Verify: malformed-output unit test.)*
- [ ] **AC10** — Saved-combination checking reports rank + matched numbers + bonus match against synced draws. *(Verify: rank integration tests; PRD §20 E2E smoke.)*
- [ ] **AC11** — Purchase CTA opens the official URL in a new tab, shows §18 disclaimer + 19+ + anti-overuse wording, offers copyable numbers, never automates purchase. *(Verify: UI test + config-driven URL.)*
- [ ] **AC12** — `.env.example` includes model-agnostic NIM, Langfuse, SQLite, and Donghaeng URLs, with `LOTTERY_API_BASE` (JSON endpoint) distinct from `LOTTERY_RESULT_SOURCE_URL` (page) so it is internally consistent. `[fixes m2]` *(Verify: file presence + key checklist.)*
- [ ] **AC13** `[fixes C3]` — The agent's Pydantic request/response models for `/explain` (and the dev-path `/internal/*`) are **generated from the `packages/shared` OpenAPI artifact** (e.g., `datamodel-code-generator`); a **contract test fails CI on drift** by validating a shared golden fixture under both the Zod schema and the generated Pydantic model. *(Verify: contract test in CI; appears in Step 1 + Step 5 + Verification.)*
- [ ] **AC14** `[fixes C2]` — Concurrent `sync`-while-`save` does not error: an integration test issues a draw sync and a save against the WAL-mode DB simultaneously and asserts both succeed. *(Verify: concurrency integration test.)*
- [ ] **AC15** `[fixes C4]` — Infeasible/edge constraint sets have defined, tested behavior: (a) 6 lucky numbers ⇒ effective `count=1`; (b) the single forced combination equals a historical jackpot ⇒ typed `INFEASIBLE_LUCKY_SET` response carrying a `feasibility` field and user-facing message (HTTP **200**, an expected entertainment-app outcome — never 500); `[fixes NEW-4]` (c) `count` > available unique non-jackpot combinations ⇒ return the max available with a `partial=true` notice; (d) `count` outside 1..5 ⇒ clamped/validation error per FR-023. *(Verify: unit + API tests with explicit expected outcomes.)*

## Implementation Steps (dependency-ordered — Option A)
> Reorders PRD Phase 3 (Agent) after Phase 4 (API) per §0/Option A. All other PRD phase content preserved.

### Step 0 — Bootstrap (PRD Phase 0)
- pnpm workspace + Turbo: `apps/{web,api,agent}`, `packages/{core,data,shared}`, `docs/`, root `.env.example`, `turbo.json`, `pnpm-workspace.yaml`.
- Python `apps/agent`: `uv` (`pyproject.toml`), pinned Python, `langchain`, `langgraph`, `langchain-openai` (OpenAI-compatible NIM) and/or `langchain-nvidia-ai-endpoints`, `langfuse`, `pydantic`, `httpx`, `pytest`, `datamodel-code-generator`.
- Root `dev`: Turbo runs web + api; `concurrently`/Procfile launches `uv run` agent **after** the API (documented ordering) with the agent retrying `/api/health` before serving. `[fixes M2]`
- Lint/typecheck/test: ESLint + tsc + Vitest (TS), ruff + pytest (Python); CI wires the AC4 coverage gate and AC13 contract test. Turbo task graph pins `shared#emit-openapi → agent#codegen → agent#test`, with `agent#codegen` a `dependsOn` of the agent dev/build task, so generated Pydantic is never stale locally or in CI. `[fixes NEW-3]`
- Files: `/package.json`, `/pnpm-workspace.yaml`, `/turbo.json`, `/.env.example`, `/apps/agent/pyproject.toml`.

### Step 1 — Shared contracts (`packages/shared`) `[fixes C3]`
- Zod schemas + inferred types for `LottoCombination`, `Recommendation`, `RecommendationRequest/Response`, `DrawResult`, `ResultCheck`, the §10.3 agent `RecommendationResponse`, and the **`/explain` request/response** contract.
- Emit a single **OpenAPI artifact** as the canonical cross-runtime contract; the agent build runs `datamodel-code-generator` to produce Pydantic models from it. Add the **contract test** (golden fixture validated under Zod + generated Pydantic).
- Files: `/packages/shared/src/schemas/*.ts`, `/packages/shared/openapi.json`, `/packages/shared/src/contract.test.ts`.

### Step 2 — Core domain (`packages/core`, PRD Phase 1) `[fixes C4, M4]`
- `validation`: range 1–45, dedupe, 0–6 lucky, **clamp `count` to 1..5** (FR-023), >6 lucky = error (FR-010–014).
- `generation`: pool = 1..45 minus lucky; strategy scores (odd/even, low/mid/high, sum percentile, consecutive penalty, same-ending penalty, hot/cold) (§9.2); always include lucky; sort ascending.
- **`feasibility`**: when lucky-count==6 force `count=1`; detect `INFEASIBLE_LUCKY_SET` (forced combo is a jackpot); detect `count > availableUnique` → return max with `partial=true`. `[fixes C4]`
- `exclusion`: exact historical-jackpot removal (FR-021) + in-request uniqueness (FR-022).
- `statistics`, `rank` (§15, 100% line+branch + CI gate), `tags` (FR-026), `fallback` templated explanations (the single template source consumed by both API and agent fallback).
- Unit tests for PRD §20 cases + AC15 edge outcomes.
- Files: `/packages/core/src/{validation,generation,feasibility,exclusion,statistics,rank,tags,fallback}.ts` + `__tests__`.

### Step 3 — Data layer (`packages/data`, PRD Phase 2) `[fixes C2, M3]`
- SQLite (§14) via **Drizzle** (chosen; `m3` resolved); `journal_mode=WAL`, `busy_timeout=5000`; Drizzle Kit migrations.
- `LotteryResultProvider` (FR-003): `SeedProvider`/mock (offline) + `DhlotteryJsonProvider` (`GET ${LOTTERY_API_BASE}/common.do?method=getLottoNumber&drwNo={N}`, mapping `drwtNo1..6`,`bnusNo`,`drwNoDate`; stores `source_url`,`fetched_at`,`parser_version`).
- **Seed artifact (specified):** a committed `seed/draws.json` (array of all draws 1..N) generated by a one-time, idempotent, rate-limited script `scripts/build-seed.ts` (documents `lastDrawNo`). First run: detect latest via the **date anchor (#1 = 2002-12-07, weekly) as primary** (endpoint-probe as verification), then **backfill seed.lastDrawNo+1 … latest before serving** (last-good on failure). `[fixes M3, ambiguity on latest-draw detection]`
- Repositories; all writes go through the single API process.
- Files: `/packages/data/src/{schema,provider/*,repositories/*,seed/*}.ts`, `/scripts/build-seed.ts` + tests.

### Step 4 — API + `/internal/*` + agent client (`apps/api`, PRD Phase 4) `[fixes C1, C2, M1]`
- Public REST (§13) + **`POST /api/recommendations/save`** (persist selected, echoing generate-time `requestId`/`traceId`) + `POST /api/agent/run` (dev path proxy).
- `/internal/*` (read-only, dev-path tools): `latest-draws`, `statistics`, `generate-candidates`, `validate` — **no `/internal/save`**.
- Hot-path orchestration per §0: validate → resolve `targetDrawNo` (default latest+1; reject ≤ latest synced) → freshness sync (serialized) → core generates/validates → single `/explain` call (timeout `AGENT_EXPLAIN_TIMEOUT_MS=20000`, below the 30s UX budget) → merge → stamp `fallbackUsed` (truth table) → disclaimers → return. `[fixes timeout-budget]`
- Single write path; Zod validation at boundaries; typed errors incl. `INFEASIBLE_LUCKY_SET`.
- Integration tests: `POST /api/recommendations` (incl. agent-down + NIM-fail), `/:id/check`, save, concurrency (AC14), feasibility (AC15).
- Files: `/apps/api/src/{routes,internal,agentClient,services,db,server}.ts` + tests.

### Step 5 — Agent (`apps/agent`, PRD Phase 3 — after API) `[fixes C1, C3, M1]`
- **Hot path `/explain`:** compact LangGraph `receive_context → llm_explain → structure_output → [fallback]`; input = precomputed candidates+stats; output = prose only + own `fallbackUsed`. Satisfies FR-034 (State/Nodes/Edges) minimally; no generation/validation/persistence.
- **Dev path `/run`:** full six-node graph with read-only `/internal/*` `httpx` tools.
- LLM client: OpenAI-compatible NIM (`base_url`, `NVIDIA_MODEL` default `z-ai/glm-5.1`, swappable). Degrade order: primary model → optional secondary model **only if `NVIDIA_FALLBACK_MODEL` is set** (off by default) → templated. Retry-once-then-fallback; clear missing-key error. Per-call NIM timeout budgeted so call + one retry + structuring fit within `AGENT_EXPLAIN_TIMEOUT_MS` (e.g., ≤8s/attempt for the 20s outer budget); the API's outer `/explain` timeout is the hard backstop. `[fixes NEW-2]`
- Pydantic models **generated from `packages/shared` OpenAPI** (AC13); schema-validate; fallback on parse failure.
- Langfuse handler: `runName`, `tags`, anon session, `targetDrawNo`, `fallbackUsed`; node names as spans; Langfuse-off path.
- pytest: NIM fail/timeout fallback, schema-parse-failure fallback, secondary-model hop (when configured), Langfuse-off, contract conformance.
- Files: `/apps/agent/src/{app,graph_explain,graph_run,tools,llm,schemas_generated,tracing,fallback}.py` + `tests/`.

### Step 6 — Web UI (`apps/web`, PRD Phase 5) `[fixes m4]`
- Screens (§11): Generator, Result, Saved, Draws, Check, Developer/Traces.
- Advisory-only client validation mirroring core (API authoritative); progress messages (FR-027); copy button; save action (calls `/api/recommendations/save` with the generate-time `requestId`); purchase-guide modal (§18) with disclaimer/19+/anti-overuse + "no automation".
- Thin API client only. Files: `/apps/web/src/{pages,components,api-client}/*`.

### Step 7 — Observability + Hardening (PRD Phase 6)
- Langfuse §17 contract end-to-end; Developer/Traces screen links trace + requestId + fallback status; `traceId=null` when disabled.
- Error states, sync resilience, README (run instructions + **NIM verify-before-build checklist**: confirm key + org "Public API Endpoints" permission + one live `glm-5.1` call), `.env.example` finalization, CI gates (coverage AC4, contract AC13) confirmed active.
- E2E smoke (§20): `[7,11]` → 5 combos → save 1 → sync → check → purchase modal.

## Risks and Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| NIM `glm-5.1` unavailable/permission (Apr-2026) | Med | High | Model-agnostic client; optional secondary model; templated fallback; verify-before-build checklist (Step 7). |
| dhlottery endpoint changes/blocks | Low-Med | Med | Provider abstraction + last-good + committed seed (offline-usable); `parser_version` change detection. |
| Cross-runtime contract drift (Zod↔Pydantic) | Med | High | **Generated** Pydantic from shared OpenAPI + CI contract test (AC13) — no hand-mirroring. |
| SQLite multi-writer contention | Med | Med | Single API writer + WAL + busy_timeout; AC14 concurrency test. |
| 6-lucky / count infeasibility dead-end | Med | High | `feasibility` module + typed `INFEASIBLE_LUCKY_SET` + AC15 tests. |
| LLM call blows 30s UX budget | Med | Med | `AGENT_EXPLAIN_TIMEOUT_MS=20000` < 30s + inner per-attempt split; API returns deterministic results on timeout with `fallbackUsed=true`. |
| 100% branch coverage unreachable on defensive code | Low | Low | Explicit `c8 ignore` with justification; gate scoped to `rank`+`exclusion`. |

## Verification Steps
1. `pnpm install && uv sync && pnpm dev` → three processes; cold-start request returns deterministic + `fallbackUsed=true` (AC1).
2. `pnpm test --coverage` → `rank`/`exclusion` 100% line+branch, CI gate red on regression (AC4); property + AC15 edge tests green (AC3/AC15).
3. `uv run pytest` → NIM-fail/agent-down/parse-failure/secondary-model/Langfuse-off pass (AC6/AC8/AC9).
4. Contract test under Zod + generated Pydantic; break a field → CI fails (AC13).
5. Concurrent sync+save integration test passes (AC14).
6. Provider mock success/failure + seed-gap backfill (AC5).
7. Manual §20 E2E; inspect hot-path vs dev-path Langfuse spans + §17 metadata (AC8); purchase modal copy (AC11).
8. CI lint rule: agent tool files are httpx-only, no math imports (AC2).

## ADR
- **Decision:** Polyglot monorepo; `packages/core` (TS) is the authoritative domain owner; `apps/api` owns SQLite and orchestrates the hot path, calling the Python agent **once** for explanations (`/explain`); the full LangGraph lives on a separate non-hot-path dev/trace route; dependency-ordered build (Option A).
- **Drivers:** PRD fidelity vs shippability; correctness guarantees (0 duplicates, 100% rank); dependency-risk management.
- **Alternatives considered:** single-runtime (rejected interview R1); Python-owned/duplicated domain (rejected R3); PRD-literal build order Option B (rejected — throwaway stubs); agent-owned hot-path graph (rejected consensus iteration 1 — cycle/double-compute/double-write).
- **Why chosen:** keeps the NVIDIA/LangGraph anchor and FR-034 fidelity (via the dev path) while guaranteeing one owner of the numbers, one DB writer, one generated contract, and a latency-bounded hot path.
- **Consequences:** two toolchains/test stacks; generated-contract discipline; the hot-path agent graph is intentionally minimal while the rich graph is dev-only; one extra save endpoint beyond §13.
- **Follow-ups (non-blocking backlog):** optional docker-compose for prod parity; Langfuse self-host decision; batching/streaming explanations; anti-tamper/auth on `/save` if multi-user; automated span-name assertion for the dev path; push-notification result reminders (PRD §23).

## Changelog
- v1 (Planner draft): initial plan from deep-interview spec.
- v2 (Planner revision): added §0 Orchestration Contract pinning one call direction `[C1]`; single SQLite writer + WAL + AC14 `[C2]`; generated contract + AC13 `[C3]`; feasibility module + AC15 `[C4]`; fallbackUsed truth table `[M1]`; agent readiness/cold-start `[M2]`; seed artifact + gap backfill `[M3]`; coverage CI gate in v1 `[M4]`; `AGENT_EXPLAIN_TIMEOUT_MS` budget; ORM=Drizzle, `.env` URL split, AST lint for AC2, advisory web validation (minors); latest-draw detection primary chosen; secondary fallback model off-by-default.
- v2.1 (consensus finalize — Critic APPROVED, Architect SOUND-WITH-CHANGES, no blocking gaps): merged the 3 reviewer refinements — inner NIM call+retry timeout split under the 20s budget `[NEW-2]`; generate→save `traceId`/`requestId` provenance echo `[NEW-1]`; explicit Turbo codegen task-ordering `[NEW-3]`; pinned `INFEASIBLE_LUCKY_SET` to HTTP 200 with a `feasibility` field `[NEW-4]`. **Marked pending approval — no auto-execution.**
