# Implementation Plan — Fix Issue #1 (CRITICAL + MAJOR)

**Status:** v3 — **PENDING APPROVAL** (not executed). Consensus: Architect pass-1 (4 must-fixes) + Critic pass-1 (1 CRITICAL + 4) — all incorporated & self-verified sound. Final independent Critic `APPROVE` pass deferred (Opus subagent session limit; re-runnable after reset). No source mutated; no executor delegated.
**Mode:** ralplan consensus, *deliberate* (data-integrity + production hot-path defect + public-contract change)
**Scope:** C1 (CRITICAL) + M1–M9 (MAJOR) from GitHub Issue #1. MINOR/NIT/SECURITY out of scope except where a MAJOR fix subsumes one.
**Baseline:** commit `afab567`; **verified green: 30 TS tests + 7 Py tests** (re-run locally this session, exit 0). Working tree has only a timestamp-only `schemas_generated.py` regeneration (codegen noise).

---

## 0. Validation results (first-hand, against real code)

Every CRITICAL/MAJOR finding was reproduced by reading the actual source. **All 10 are VALID.**

| ID | Verdict | Decisive evidence |
|----|---------|-------------------|
| **C1** | CONFIRMED | `provider.ts:27-32` `latestDrawNo()` is pure date-math, no probe. `server.ts:77-78` calls `createRecommendations` with **no** `skipLiveSync`. `sync.ts:31-39` loops one live fetch per draw; first `null` throws `DrawBackfillError`. `service.ts:34-40` catches → forces `last-good`. Date-math overshoots the latest *drawn* number → tail null → **`fresh` unreachable**; 3-draw seed → first call attempts **~1225 sequential fetches**. |
| **M1** | CONFIRMED | No `.github/`. Gates live only in `pnpm verify`/`lint`/`test:coverage`. Nothing runs on push/PR. |
| **M2** | CONFIRMED | `openapi.ts` hand-authored literal, independent of Zod `schemas.ts`. `generate_models.py:23-30` injects validator + import via exact-string `.replace()` — silent no-op on codegen drift. JSON Schema can't express ascending; only home is `openapi.ts:9` `x-ascending`. No parity test. |
| **M3** | CONFIRMED | `service.ts:54,80` mints + **passes** `traceId` to `/explain` (it's in `explainRequestSchema:67`). Agent ignores it: `tracing.py:18` `trace_id=None`; `graph_explain.py:65` builds `Trace` without it. **Fix is agent-side only.** |
| **M4** | CONFIRMED | `seed/draws.json` = draws 1–3, `seed-v1`. `scripts/build-seed.ts` exists/wired but reuses unbounded date-math and **throws on the not-yet-drawn week** → can't build a current seed as-is. |
| **M5** | CONFIRMED | `repository.ts:131-139` `saveResultCheck` = INSERT then UPDATE, **no** BEGIN/COMMIT (`serialize()` ≠ transaction). Correct pattern at `:108`. |
| **M6** | CONFIRMED | `service.ts:151` `target = drawNo ?? Math.min(saved.targetDrawNo, latestDrawNo)` → future-draw save ranks an earlier draw, persists a fake `result_check`. |
| **M7** | CONFIRMED | `main.tsx:17-36` no try/catch; `api-client.ts:5,10,15` throw on `!res.ok` → stuck "Generating…" + unhandled rejection. |
| **M8** | CONFIRMED | `llm.py:16-29` no `response_format`/`max_tokens`/fence-strip; `graph_explain.py:77,103` `model_validate_json` rejects fenced output → fallback. |
| **M9** | CONFIRMED | `core.test.ts:4-12` 2 hardcoded draws + `it.each`; `fast-check` absent from all manifests. |

**Cross-checked correct (issue §6 — must NOT regress):** §0 orchestration contract (`agentClient.ts:47-57`), rank truth table, WAL write-queue. Existing tests encoding these that must stay green: `data.test.ts:23-48` (WAL + concurrent sync/save), `data.test.ts:50-61` (interior-gap `DrawBackfillError`), `agentClient.test.ts` (4 fallback branches), `test_agent.py:54-60` (Pydantic nested-shape round-trip + non-ascending rejection).

> Dynamic-validation note: C1/M7 reproduce by inspection. I deliberately did **not** trigger a live hot-path run (~1,200+ requests to the unofficial dhlottery endpoint) — that is exactly the abusive backfill C1 describes. The offline test suite is used for the green baseline.

---

## 1. RALPLAN-DR Summary

### Principles
1. **Correctness on the running product first** — hot-path defect (C1) + silent data corruption (M5/M6) outrank conformance polish.
2. **Single source of truth for contracts** — drift structurally impossible or test-caught, verified down to the *consumed* shape.
3. **Degrade loudly to the user, fail loudly in CI** — no silent fallbacks/clamps/inert gates.
4. **Bounded, observable I/O; truthful freshness** — no unbounded fetch in a request budget; `fresh` means *we hold the latest draw that has actually occurred*, never under- or over-reported.
5. **Don't regress the verified-correct core** (§0 contract, rank, WAL, and the tests that encode them).

### Decision Drivers (top 3)
1. **Blast radius / user impact** (C1 hang + non-`fresh`; M5/M6 false results) — gates everything.
2. **Root-cause vs symptom** — draw-time-aware + probe-verified freshness; Zod-sourced contract guarded to the consumed shape.
3. **Cost-to-honor a guarantee** — make ACs real or down-scope honestly; never ship inert gates.

### Viable Options (the two genuinely contested fixes)

**C1 — truthful, bounded freshness** *(revised per Architect #1/#4 + Critic #1: draw-time-aware)*
- **Option C1-A (Draw-time-aware estimate + probe-in-provider + truthful `fresh` + preserved interior-gap throw + distinct cap path) — CHOSEN.** Precise contract in §3 Phase 1. *Pros:* `fresh` reachable **and truthful in both directions** (no false-fresh during publish lag; no false-stale during pre-draw Saturday); backfill bounded; `data.test.ts:50-61` stays green unchanged. *Cons:* a few extra probe fetches; ~3-file surface; one KST draw-time calc.
- **Option C1-B (Background sync, always serve last-good).** *Cons:* job/state machinery, loses "sync before serving," still needs a probe. Deferred — heavier than the defect warrants for a single-user app.
- *Invalidated:* "cap the loop only" (leaves `fresh` unreachable); "resolution-only probe" (false-`fresh` during publish lag); **"week-index estimate" (v2 — false-`last-good` for ~21h every Saturday; Critic CRITICAL)**.

**M2 — kill Zod↔OpenAPI drift** *(revised per Architect #2 + Critic #4)*
- **Option M2-A (Generate `openapi.json` from Zod + re-inject invariant markers + **fail-loud validator injection** + defense-in-depth shape assertion) — CHOSEN.** Use `zod-to-json-schema` for components; explicitly re-add `uniqueItems`/`x-ascending` on `LottoCombination` (the converter drops `.refine`); **replace the silent `.replace()` with a fail-loud anchor check** (this is the primary new value — today it silently no-ops on drift); plus a post-codegen round-trip assertion as cheap belt-and-suspenders (note: the validator-drop and consumed-shape drift modes are *already* caught by `test_agent.py:54-60`, since `verify` runs `agent:codegen` before `pytest`). *Pros:* removes dual hand-source (count/bound drift impossible); makes the invariant injection loud. *Cons:* one dev dep; explicit invariant re-injection step.
- **Option M2-B (Keep hand-mirror + parity test).** Fallback only if M2-A can't express a needed construct.

---

## 2. Pre-mortem (deliberate mode — 3 failure scenarios)

1. **"Freshness is mislabeled around draw day (both directions)."** The K: draws occur **Saturday ~20:45 KST**, but a naive week-index estimate increments at Saturday 00:00 → ~21h/week where the calendar "expects" a draw that hasn't occurred (false-`last-good`); and just after 20:45 the draw exists but the JSON endpoint hasn't published it (risk of false-`fresh`). *Mitigation — draw-time-aware estimate + truthful rule:*
   - `estimateLatestDrawNo(now)` counts draw K as "occurred" only once `now >= drawMomentKST(K)`, where `drawMomentKST(K)` = the Saturday 20:45 KST of draw K's week (anchor = `2002-12-07T20:45:00+09:00`; `estimate = floor((now − anchor)/1week) + 1`, clamp ≥ seed max). `now` is **injectable** for tests.
   - `probedLatest` = newest **resolvable** draw (provider probes down from estimate, bounded ≤K steps).
   - `fresh` **iff** `complete && latestSynced == probedLatest && probedLatest == estimate(now)`.
   - `probedLatest < estimate` (probe walks down, so always ≤): `diff==1` → `PENDING_OFFICIAL_PUBLISH` (drawn, not yet published — the genuine short window); `diff≥2` → `SOURCE_BEHIND_CALENDAR` (endpoint behind/outage). `!complete` (cap/interior) → `BACKFILL_CAPPED`/incomplete. All map to `last-good`.
   - *Tests (deterministic via injected clock):* **(a) mid-week, seed==N → `fresh`; (b) pre-draw Saturday 19:00, seed==N−1 → `fresh` (estimate==N−1); (c) post-draw pre-publish (probe N null, N−1 resolves) → `PENDING_OFFICIAL_PUBLISH`; (d) endpoint 2+ behind → `SOURCE_BEHIND_CALENDAR`.**
2. **"Real seed bloats repo / tests go non-deterministic or hit the network."** *Mitigation:* commit the generated seed as a **static fixture**; tests never call dhlottery (build-seed is a manual maintenance script, not a CI step). Cost budget: `repository.ts:6,49-53` eagerly replays every seed row on first construction, and M9 fast-check re-runs generation. So: M9 generation runs against a **bounded recent slice** (last ~100 draws); the **full** seed builds the jackpot-exclusion set; seed-backed `fast-check` `numRuns≈25` (reserve ~100 for synthetic-input invariants). Verify committed seed ~300–600 KB.
3. **"Contract regen breaks the agent while TS `verify` stays green."** `zod-to-json-schema` emits a different JSON shape (drops `uniqueItems`/`.refine`, may rewrap `$defs`), which can make `datamodel-codegen` emit a Pydantic `LottoCombination` lacking the nested `.root` shape `model_utils.py:6` consumes. *Mitigation:* land M2 + regenerate Pydantic in one change; **fail-loud anchor check** turns silent injection-drop into a build failure; the post-codegen round-trip assertion (`LottoCombination.model_validate([1,2,3,4,5,6])` → `numbers_from_combination == [1..6]`; `[1,2,3,4,6,5]` rejected) is belt-and-suspenders over the already-existing `test_agent.py:54-60`; **CI lands first** (Phase 0) so every change is gated.

---

## 3. Work breakdown (fix → files → tests → AC)

### Phase 0 — CI first  *(M1; Architect #3 — gate the riskiest changes from the start)*
- **M1.** Add `.github/workflows/ci.yml`: setup Node 22 + pnpm (pin to `packageManager`) + uv; run `pnpm install --frozen-lockfile`, `pnpm verify`, `uv run --project apps/agent pytest apps/agent/tests`. Land **against the current green baseline**; all later phases land behind it. Makes AC2/AC4/AC13/Step 7 enforced. (Note: `verify` runs `agent:codegen`, which rewrites only a codegen timestamp; CI has no `git diff` gate, so this is tolerated.)

### Phase 1 — Runtime correctness (C1 + M4)  *[highest impact; produces the seed M9 needs]*
- **C1.1 Draw-time-aware estimate + probe in the provider.** `packages/data/src/provider.ts`: add **`estimateLatestDrawNo(now = new Date())`** anchored at `2002-12-07T20:45:00+09:00` (draw moment), `floor((now−anchor)/week)+1`, clamp ≥ seed max; `now` injectable. `DhlotteryJsonProvider.latestDrawNo()` returns the newest **resolvable** draw: start at `estimateLatestDrawNo()`, probe **downward** via `getDraw` (bounded ≤K steps, K env-tunable e.g. 3) until one resolves. (Caching, if any, must be **bypassable/clock-injectable** so the freshness matrix is deterministic — tests inject provider+clock, no real TTL.) Behavior when `estimate − probedLatest > K`: probe returns the lowest it reached; service classifies as `SOURCE_BEHIND_CALENDAR` (do not loop unbounded).
- **C1.2 Sync: keep interior-gap throw, add distinct non-throwing cap.** `packages/data/src/sync.ts`: a `null` for any `drawNo ≤ providerLatest` remains an **interior gap → `DrawBackfillError`** (preserves `data.test.ts:50-61` unchanged). New: per-request backfill **cap** (env-tunable, default 30) — if the gap exceeds the cap, fetch only `cap` draws, **do not throw**, return `complete:false` + `syncErrorKind:"BACKFILL_CAPPED"` so subsequent requests converge. On a current seed the gap is 0–1, so the cap is dead-code defense-in-depth (documented; convergence proven by the multi-call test below, not relied on in normal operation).
- **C1.3 Truthful freshness in service.** `apps/api/src/service.ts:26-41`: expose the estimate (add `providerEstimate` to `SyncResult`, or call `provider.estimateLatestDrawNo(now)`); compute `fresh`/reasons per Pre-mortem §1. `skipLiveSync` path unchanged.
- **M4.1 Real seed.** Fix `scripts/build-seed.ts` to stop at the last resolvable draw (reuse the probe / draw-time estimate; don't throw on the not-yet-drawn week). Run `pnpm seed:build`; commit full `seed/draws.json` (1..N).
- **M4.2 Seed-gap test (AC5).** Mock provider with `latestDrawNo` = seed+G (multi-draw, G≥3, all resolvable) → backfill inserts the gap and reports `fresh`. Plus capped-tail and the freshness matrix cases (Pre-mortem §1).
- **Tests:** provider probe (overshoot → resolvable); **truthful-`fresh` matrix (a)-(d) via injected clock**; **interior-gap `DrawBackfillError` still throws** (`data.test.ts:50-61` unchanged); **multi-call cap-convergence** (gap > cap → first call advances `cap` + `BACKFILL_CAPPED`; second call advances another `cap`). **AC1/AC5.**

### Phase 2 — Data integrity (M5, M6)  *[parallel-safe with Phase 1]*
- **M5.** `repository.ts:saveResultCheck`: wrap INSERT + UPDATE in `BEGIN IMMEDIATE`/COMMIT/ROLLBACK (mirror `:108`). **Test:** force UPDATE to throw → no orphan `result_checks` row, status stays `pending`.
- **M6.** `service.ts:checkSavedRecommendation`: if `drawNo` omitted and `latestDrawNo < saved.targetDrawNo` → throw `{status:409}` "draw not yet available"; explicit `drawNo` override still allowed. **Test:** future-target → 409; drawn-target → ranks (AC10 preserved).

### Phase 3 — Resilience & LLM usability (M7, M8)  *[parallel-safe]*
- **M7.** `apps/web/src/main.tsx`: try/catch in `run/savePick/checkPick`; surface a distinct error state; clear "Generating…" on failure. **Test:** behavior test (mock `recommend` rejecting → error rendered) — replaces source-grep style (addresses m3 too).
- **M8.** `apps/agent/src/lotto_agent/llm.py`: add `response_format={"type":"json_object"}` (env-guarded; NIM model support varies) + `max_tokens`. Add a fence-stripping parse helper applied before `model_validate_json` in `graph_explain.py` (`llm_explain` + `structure_output`). **Test:** fenced ```json output parses without fallback; plain JSON still parses; junk → fallback (AC6/AC9 preserved).

### Phase 4 — Make remaining guarantees real (M2, M3, M9)
- **M2.** Generate `openapi.json` from Zod (`zod-to-json-schema`); re-inject `uniqueItems`/`x-ascending` on `LottoCombination`. **Primary fix:** replace silent `.replace()` in `generate_models.py` with a **fail-loud** anchor check (raise if the LottoCombination anchor is absent). **Defense-in-depth:** post-codegen round-trip assertion — `LottoCombination.model_validate([1,2,3,4,5,6])` then `numbers_from_combination(...) == [1,2,3,4,5,6]`, and `[1,2,3,4,6,5]` raises (note this overlaps existing `test_agent.py:54-60`). Regenerate Pydantic in the same change; keep `pnpm verify` green. **Test:** Zod⇄OpenAPI boundary parity (e.g., `count`); codegen raises on missing anchor. **AC13.**
- **M3.** Propagate `req.traceId` as the agent's Langfuse trace **identity** (not mere correlation): `graph_explain.py:receive_context` passes `req.traceId` to `Trace`; `tracing.py` adopts it via Langfuse v3 trace context (`trace_context={"trace_id": ...}` / `update_current_trace`, **not** the `Langfuse()` constructor) and sets `self.trace_id = req.traceId`. **Test:** stub tracer → `Trace.trace_id == req.traceId` (agent-local, deterministic). Confirm the contract is identity so the API-persisted `traceId` links to the agent trace. **AC8/FR-035.**
- **M9.** Add `fast-check` to `@lotto/core`; property tests over generated lucky sets/counts: invariants = all-lucky-included, 6-ascending, in-request-unique, never == historical jackpot. Generation over a **bounded recent slice** (~100 draws); exclusion set from full seed; seed-backed `numRuns≈25`. **AC3.**

> CI (Phase 0) gates Phases 1–4; M2's regeneration must keep CI green.

---

## 4. Expanded test plan (deliberate mode)

- **Unit:** provider probe (overshoot); **truthful-`fresh` matrix (a) mid-week→fresh, (b) pre-draw-Sat→fresh, (c) post-draw-pre-publish→PENDING_OFFICIAL_PUBLISH, (d) diff≥2→SOURCE_BEHIND_CALENDAR — all via injected clock**; sync interior-gap throw **preserved** vs cap non-throw; **multi-call cap-convergence**; `saveResultCheck` rollback; `checkSavedRecommendation` 409; fence-strip parser; codegen **anchor fail-loud** + round-trip (model_validate first); tracing id propagation (`Trace.trace_id == req.traceId`).
- **Integration:** `createRecommendations` mock-provider+clock → `fresh` reachable & truthful; seed→now multi-draw gap → bounded backfill; agent `/explain` fenced LLM stub → non-fallback; agentClient re-validation still forces fallback on bad IDs (no §0 regression).
- **Property (fast-check):** core invariants over generated inputs (bounded slice; `numRuns≈25`).
- **Behavior/E2E:** web handler rejection → visible error (M7).
- **Observability:** persisted `traceId` == agent trace id (M3); freshness reasons truthful.
- **Regression guard:** `data.test.ts` (WAL, interior-gap), `agentClient.test.ts` (4 fallback branches), `test_agent.py:54-60` (Pydantic shape), rank table — all stay green.
- **Gate:** `pnpm verify` + `pytest` green on clean checkout (Phase 0 CI runs these).

---

## 5. Sequencing & dependencies
1. **Phase 0 (CI)** — first, against current green baseline; gates everything after.
2. **Phase 1 (C1+M4)** — highest impact; produces the real seed M9 needs.
3. **Phase 2 (M5,M6)** and **Phase 3 (M7,M8)** — independent, parallel-safe with Phase 1.
4. **Phase 4** — M2 (→ regenerate Pydantic, keep CI green); M3; M9 (needs Phase 1 seed).

## 6. Acceptance criteria (plan-level)
- First real `POST /api/recommendations` completes within the UX budget; **`fresh` reachable AND truthful both directions** — `fresh` on mid-week and pre-draw Saturday; `PENDING_OFFICIAL_PUBLISH` only in the genuine post-draw/pre-publish window; no unbounded backfill. (C1)
- Result-check atomic; future-draw check → 409. (M5,M6)
- Web surfaces errors; LLM path succeeds on fenced output in a live-shaped test. (M7,M8)
- Contract drift structurally prevented; codegen injection **fails loud**. (M2)
- API-persisted `traceId` **is** the agent's Langfuse trace id (identity). (M3)
- Property tests over real seed; **CI runs `verify`+`pytest` on PR from the start**. (M9,M1)
- **No regression:** §0 contract, rank, WAL, and the tests encoding them stay green.

---

## 7. ADR
- **Decision:** Fix C1+M1–M9 in 5 phases — **CI first**, then runtime correctness → data integrity / resilience (parallel) → remaining guarantees — root-cause-first.
- **Drivers:** blast-radius; root-cause over symptom; honor-or-downscope guarantees.
- **Alternatives considered:** C1 background-sync (C1-B, deferred); resolution-only probe (false-fresh) and week-index estimate (false-stale) — both rejected for truthfulness; M2 parity-test-only (M2-B, fallback).
- **Why chosen:** removes defect classes (draw-time-truthful freshness; single-source contract guarded to the consumed shape) while preserving the verified-correct core; smallest surface that makes guarantees real; CI-first means nothing lands ungated.
- **Consequences:** a few extra probe fetches; dev deps `zod-to-json-schema` + `fast-check`; real seed enlarges repo (static fixture, offline tests; bounded fast-check cost); first-run construction replays full seed once; one KST draw-time constant to maintain.
- **Follow-ups (out of scope):** MINORs m1–m13, S1–S3 (fail-open internal token, drizzle advisory, agent bind) — separate hardening pass.

---

## Appendix — Review disposition
**Architect (v1→v2):** (1) date-aware truthful `fresh`; (2) post-codegen shape assertion; (3) CI-first; (4) explicit cap contract + preserve interior-gap throw — all adopted.
**Critic (v2→v3):** (1, CRITICAL) **draw-time-aware estimate** — adopted (anchor at Sat 20:45 KST; fixes the ~21h/week false-`last-good`); (2) **clock-injection contract** + pre-draw-fresh / post-draw-pending test rows — adopted (Pre-mortem §1, C1.1, §4); (3) `SOURCE_BEHIND_CALENDAR` (diff≥2) test + multi-call cap-convergence test + `>K` behavior — adopted (§3 C1.1/C1.2, §4); (4) reframe M2 — fail-loud anchor is the **primary** fix, round-trip is defense-in-depth over existing `test_agent.py:54-60`; §4 wording aligned to `model_validate` first — adopted; (5) name M3 mechanism (Langfuse v3 `trace_context`/`update_current_trace`, identity not correlation) — adopted (§3 M3).
