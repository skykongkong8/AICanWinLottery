# Code Review — AICanWinLottery (Korean Lotto AI Service)

**Date:** 2026-06-18
**Commit reviewed:** `afab567 feat: implement lotto AI recommendation app`
**Plan reviewed against:** `.omc/plans/lotto-ai-implementation-plan.md` (CONSENSUS-APPROVED v2.1)
**Scope:** full monorepo source (~2,000 LOC) — `packages/{shared,core,data}`, `apps/{api,web,agent}`, root config, scripts.

**Method:** first-hand read of every source file + a build/test run + four independent specialist reviewers
(software architect, senior engineer, adversarial critic, security) whose findings were cross-checked
against the actual code. False positives were filtered out and are listed explicitly in §6.

---

## 1. Verdict

**REQUEST CHANGES — functional v1 with green tests, but one CRITICAL runtime issue and several MAJOR
plan-conformance/quality gaps.**

The implementation is real, coherent, and **builds clean with all tests passing**:

```
Build:    5/5 TS projects compile; vite web bundle builds (256 kB)
TS tests: shared 2 · web 1 · core 11 · data 5 · api 11   = 30 passed
Py tests: 7 passed
Coverage: rank.ts + exclusion.ts = 100% stmts/branch/funcs/lines (AC4 gate GREEN, locally)
```

The §0 Orchestration Contract — the load-bearing consensus fix — is **correctly implemented**: the API
owns number generation, strips prose before the single `/explain` call, re-validates the agent reply, and
is the sole authority on `fallbackUsed`. The agent genuinely cannot mutate numbers. WAL single-writer
concurrency, feasibility/`INFEASIBLE_LUCKY_SET`, and the generate-vs-save split are all built and tested.

The problems are concentrated in (a) **one hot-path runtime defect**, (b) **plan-conformance gaps** where
acceptance criteria are over-claimed (no CI, hand-mirrored contract, example-based "property" tests, stub
seed), and (c) **I/O-boundary correctness/quality** issues.

---

## 2. Severity summary

| Sev | Count | IDs |
|-----|-------|-----|
| CRITICAL | 1 | C1 |
| MAJOR | 9 | M1–M9 |
| MINOR | 13 | m1–m13 |
| NIT | 3 | n1–n3 |
| SECURITY (calibrated) | 3 + positives | S1–S3 |

---

## 3. Findings

### CRITICAL

#### C1 — Hot-path live backfill blows up; data freshness can never report "fresh"
**Files:** `packages/data/src/provider.ts:27-32`, `packages/data/src/sync.ts:31-42`, `apps/api/src/service.ts:26-46`, `packages/data/src/seed/draws.json`
**Confidence:** High.

`DhlotteryJsonProvider.latestDrawNo()` is pure date math: `floor((now − 2002-12-07)/1week) + 1` (≈ **1228**
today) with **no endpoint verification**, despite the plan (Step 3) requiring "date anchor primary,
endpoint-probe as verification." The committed seed (`seed/draws.json`) holds only **3 draws** (see M4).

`apps/api/src/server.ts` calls `createRecommendations(body)` with **no `skipLiveSync`**, so the production
hot path runs `syncDrawsBeforeServing`, which loops `getDraw(4 … ~1228)` doing one **live sequential HTTP
fetch per draw**. Consequences on a real run:

- The **first** `POST /api/recommendations` issues ~1,200+ sequential live fetches to the unofficial
  dhlottery endpoint — a multi-minute hang inside a request with a 30 s UX budget. `syncLock` makes all
  concurrent requests await that one backfill.
- Because the date math overshoots the actual latest *available* draw (this week's draw isn't drawn until
  Saturday), the final `getDraw` returns null → `DrawBackfillError` → caught → `syncStatus` is reported as
  **`last-good` on essentially every request**; `fresh` is effectively unreachable.

It degrades rather than 500s (good), and the test suite never hits it (`skipLiveSync: true` everywhere),
which is exactly why it slipped through. **Fix:** make `latestDrawNo()` probe the endpoint (walk down to
the newest draw that actually resolves) or cap provider-latest to a verified value; treat trailing nulls as
"caught up," not fatal; and ship the real full seed (M4) so first-run backfill is bounded.

---

### MAJOR

#### M1 — No CI exists; every "fails CI" gate is inert
**Files:** repo has **no `.github/`**; `package.json:15,18`. **Confidence:** High.
AC2 (httpx-only lint), AC4 (coverage), AC13 (contract drift) and Step 7 all promise gates that "fail CI."
The gates are real and pass locally, but they live only inside `pnpm verify`/`pnpm lint`/`test:coverage`
with **nothing running them on push/PR**. Principle 5 and Decision-Driver 2 ("hard gates") are unenforced;
a contributor who skips `pnpm verify` ships regressions silently.
*Severity note:* the critic rated this CRITICAL (a falsified plan guarantee); I rate it MAJOR because the
checks exist and are green locally and the fix is one workflow file. **Fix:** add
`.github/workflows/ci.yml` running `pnpm verify` + `uv run pytest`, **or** reword AC2/AC4/AC13/Step 7 to say
"enforced by the local `verify` gate; CI deferred."

#### M2 — Cross-runtime contract is hand-mirrored at the Zod↔OpenAPI seam; drift not caught
**Files:** `packages/shared/src/openapi.ts:1-19` vs `packages/shared/src/schemas.ts`; `packages/shared/src/contract.test.ts`; `apps/agent/scripts/generate_models.py`. **Confidence:** High.
Pydantic *is* generated from `openapi.json` (✓ AC13 second hop). But `openapi.ts` is **hand-authored,
independent of the Zod schemas** — two parallel hand-maintained sources. The contract test validates one
minimal golden object under Zod (`contract.test.ts`) and the same object under Pydantic
(`test_agent.py:54`); **neither asserts Zod≡OpenAPI constraint equivalence.** Change a Zod bound and forget
`openapi.ts`, and it sails through green (e.g., `count` bounds aren't even in the explain golden). This is
exactly the "Cross-runtime contract drift (High)" risk the plan calls out (Principle 2: "generated, not
hand-mirrored"). Aggravator: the ascending/unique invariant is injected into the generated model by a
brittle string `.replace()` (`generate_models.py:27-30`) that silently no-ops if codegen formatting
changes. **Fix:** generate `openapi.json` *from* Zod (e.g. `@asteasolutions/zod-to-openapi` /
`zod-to-json-schema`), or add a structural Zod⇄OpenAPI parity test with boundary fixtures.

#### M3 — traceId ↔ Langfuse provenance is cosmetic (FR-035 / NEW-1 unmet)
**Files:** `apps/api/src/service.ts:54`, `apps/agent/src/lotto_agent/tracing.py:18`, `apps/agent/src/lotto_agent/graph_explain.py:65`. **Confidence:** High.
The API mints `traceId = randomUUID()` (only when `LANGFUSE_PUBLIC_KEY` is set) and persists/returns it. The
agent **never reads `req.traceId`**: `Trace.trace_id` is hardcoded `None` and the agent opens its **own
independent** Langfuse trace. So the persisted `trace_id` links to nothing — FR-035's "the row's `trace_id`
links to its originating Langfuse trace" is false. **Fix:** propagate the API `traceId` into the agent and
use it as the Langfuse trace id (or read the agent's real trace id back and persist that).

#### M4 — Committed seed is a 3-draw stub, not the full history
**File:** `packages/data/src/seed/draws.json` (draws 1–3, `parserVersion:"seed-v1"`). **Confidence:** High.
Step 3 promises "a committed `seed/draws.json` (array of **all draws 1..N**)." Reality is 3 rows. Impact:
(1) historical-jackpot **exclusion screens only 3 combinations** (FR-021 largely toothless offline);
(2) it is the root cause of C1's enormous first-run backfill; (3) it weakens AC3/AC5. Note draw #1
`[10,23,29,33,37,40]` is the same jackpot reused by the tests. **Fix:** run `scripts/build-seed.ts`
(already written) to generate the real seed and commit it; add a seed→now multi-draw gap test (AC5).

#### M5 — `saveResultCheck` is not transactional
**File:** `packages/data/src/repository.ts:131-139`. **Confidence:** High.
It runs `INSERT result_checks` then `UPDATE recommendations SET status='checked'` with **no
BEGIN/COMMIT**. If the UPDATE throws, the check row persists while status stays `pending` → inconsistent
state. The correct pattern already exists in `saveRecommendations` (`:108` `BEGIN IMMEDIATE`/COMMIT/ROLLBACK).
**Fix:** wrap both statements in one transaction.

#### M6 — `checkSavedRecommendation` ranks against the wrong draw when the target hasn't been drawn
**File:** `apps/api/src/service.ts:151`. **Confidence:** High.
`target = drawNo ?? Math.min(saved.targetDrawNo, latestDrawNo)`. If the user saved for a future draw that
hasn't occurred, this **silently ranks against an earlier draw** and persists a real-looking
`result_check` (e.g. "5th place") for a draw that never happened. **Fix:** if
`latestDrawNo < saved.targetDrawNo`, return a "draw not yet available" (409/404) instead of checking an
earlier draw.

#### M7 — Web primary actions have no error handling (silent infinite "Generating…")
**File:** `apps/web/src/main.tsx:17-36`. **Confidence:** High.
`run()`, `savePick()`, `checkPick()` have no try/catch, and `api-client.ts` throws on `!res.ok`. Any
failed/timeout request leaves the UI stuck on "Generating entertainment-only picks…" with an unhandled
promise rejection — no error shown. **Fix:** wrap each handler in try/catch and surface an error message.

#### M8 — LLM path almost always falls back (no JSON mode / fence stripping)
**Files:** `apps/agent/src/lotto_agent/llm.py:16-29`, `graph_explain.py:77-85`. **Confidence:** High (empirically verified by reviewer).
`call_nim` sets no `response_format={"type":"json_object"}`, no `max_tokens`, and does no markdown-fence
stripping. Pydantic's `model_validate_json` **rejects** ```json-fenced output, which most chat models emit
→ `llm_explain` catches → fallback. The LLM value-prop is effectively defeated in practice (degrades safely
to templated prose, but rarely uses the model). **Fix:** request JSON mode, set `max_tokens`, strip code
fences before parsing.

#### M9 — AC3 "property tests" are example-based, not property tests
**File:** `packages/core/src/core.test.ts`. **Confidence:** High.
AC3 demands "property tests over the seeded jackpot set." The suite is example-based `it`/`it.each` over
**2 hand-written draws** (`core.test.ts:4`) with **no property-testing library** (no `fast-check`). The
invariants (all-lucky-included, 6-ascending, in-request-unique, never == historical jackpot) are asserted
on a handful of cases, not generated. **Fix:** add `fast-check` and assert invariants over generated lucky
sets/counts against the real seed.

---

### MINOR

| ID | Finding | File:line |
|----|---------|-----------|
| m1 | **Drizzle ORM is dead code.** `schema.ts` declares Drizzle tables that are never queried; runtime uses raw `node:sqlite` + a hand-written `schemaSql` DDL string; no Drizzle Kit migrations. Plan/ADR (Step 3, ADR line 126) say "SQLite via Drizzle." It also drags in the advisory-flagged dep (S2). Honor it or delete it. | `packages/data/src/schema.ts:1-32`, `repository.ts:5` |
| m2 | **"Draws" screen missing.** §11/Step 6 list six screens (Generator, Result, Saved, **Draws**, Check, Developer/Traces). `main.tsx` has four sections; there is no historical-draw browse screen. | `apps/web/src/main.tsx:38-98` |
| m3 | **`ui-source.test.ts` is a source-grep, not a behavior test.** It reads `main.tsx` as a string and asserts `.toContain("Copy numbers")` etc. — a renamed-but-broken button would still pass. False-coverage signal for AC11's "UI test." | `apps/web/src/ui-source.test.ts:4` |
| m4 | **ESLint absent; ruff never run.** Every package `lint` = `tsc --noEmit`. `ruff` is a declared dev-dep but no `ruff check` is invoked by `lint`/`verify`. Plan Step 0 says "ESLint + tsc + Vitest, ruff + pytest." | `package.json:15,18`, `apps/agent/pyproject.toml:18` |
| m5 | **Silent count clamp.** Zod accepts `count` up to `.max(50)` but `clampCount` clamps to 5, and `feasibility.requestedCount` reports the **clamped** value — a user asking for 50 gets 5 with `status:"OK", partial:false` and no signal. Contract (`.max(50)`) also contradicts plan's 1..5. | `schemas.ts:10`, `validation.ts:4`, `service.ts:57` |
| m6 | **`getDraw` lacks NaN/shape validation.** A 200-OK JSON page missing `drwtNo*` yields `numbers:[NaN,…]`/`bonusNumber:NaN`, which `upsertDraw` persists → silently corrupt draw row that later mis-ranks. Only `returnValue==="success"` guards it. Validate with `drawResultSchema.safeParse` before returning. | `packages/data/src/provider.ts:59-64` |
| m7 | **AC1 cold-start under-tested + no startup ordering.** Only an agent-*down* (connection-refused) test exists; no agent-*warmup* (up-but-not-ready) test, and `dev` launches api/agent/web with no `/api/health` retry gate as Step 0 promises. (User-facing degrade still works via the agentClient timeout.) | `apps/api/src/api.test.ts:12`, `package.json:9` |
| m8 | **AC15(c) `partial=true` path is unreachable & untested.** For non-6 lucky sets, `availableCombinationCount` is always ≥40 ≥ max count 5, so the non-6 `PARTIAL` branch can never fire; no test exercises `partial=true`. | `packages/core/src/feasibility.ts:5` |
| m9 | **`node:sqlite` is experimental.** Emits `ExperimentalWarning: SQLite is an experimental feature` at runtime (seen in the test log); API not stable across Node minors. Pin Node; consider `better-sqlite3` as a follow-up. | `packages/data/src/repository.ts:5` |
| m10 | **`defaultStore` is a side-effecting import.** `export const defaultStore = new SQLiteLotteryStore()` opens/mkdirs/migrates/seeds the DB merely on importing `@lotto/data`. Hurts testability and import determinism; prefer a lazy `getDefaultStore()`. | `packages/data/src/repository.ts:169` |
| m11 | **Brittle codegen post-processing.** `generate_models.py` injects the ascending/unique validator via exact-string `.replace()`; a datamodel-codegen formatting change silently drops the invariant. | `apps/agent/scripts/generate_models.py:27-30` |
| m12 | **`.env.example` omits used vars.** `INTERNAL_API_TOKEN`, `CORS_ORIGINS`, `API_MAX_BODY_BYTES`, `NVIDIA_NIM_KEY_FILE`, and the web `VITE_*` vars are read in code but undocumented. (AC12's core keys are present and `LOTTERY_API_BASE` ≠ `LOTTERY_RESULT_SOURCE_URL` ✓.) | `.env.example` |
| m13 | **Dev-path `llm_explain` is a stub.** The 6-node dev graph's `llm_explain` returns a hardcoded string + `fallbackUsed=True` and never calls NIM. Span names satisfy FR-034 fidelity, but the node does no real work. | `apps/agent/src/lotto_agent/graph_run.py:33-34` |

### NIT
- **n1** — `graph_explain._fallback_response` calls `fallback_for()` twice per combination; `structure_output` re-parses `llm_text` already parsed in `llm_explain`. Redundant compute. (`graph_explain.py:40-41,99-103`)
- **n2** *(low confidence)* — `server.ts:87` reads `body.drawNo` on untyped parsed JSON; a client posting a non-object JSON (`"x"`) makes property access throw → 500 instead of 400. Guard `typeof body === "object"`.
- **n3** *(low confidence)* — module-level `syncLock` in `sync.ts:20` is process-global; multiple store instances would share one lock (fine today with a single `defaultStore`).

---

## 4. Security (calibrated for a single-user, unauthenticated, local entertainment app — **Risk: LOW**)

| ID | Finding | Severity | File:line |
|----|---------|----------|-----------|
| S1 | `/internal/*` and `/api/agent/run` **fail open** when `INTERNAL_API_TOKEN` is unset (`isInternalAllowed` returns `true`). Read-only/compute endpoints over public lotto data, so low blast radius — but exposed on any non-loopback deploy. | LOW local / **MEDIUM on deploy** | `apps/api/src/server.ts:22-26` |
| S2 | `drizzle-orm@0.38.4` is flagged by a HIGH advisory (SQLi via unescaped identifiers, per the security reviewer; fixed ≥0.45.2). **Not exploitable here** — only static `sqliteTable/integer/text` declarations are used (all hardcoded identifiers); every runtime query uses `node:sqlite` prepared statements (verified). Bump or remove (m1) to clear the audit. | LOW (informational) | `packages/data/package.json` |
| S3 | FastAPI agent binds `0.0.0.0` with no body-size limit on `/explain`/`/run`. Resource-exhaustion only if the agent port is publicly exposed; intended topology keeps it behind the token-gated API. | LOW | `apps/agent/src/lotto_agent/app.py:18` |

**Verified-correct (positives):** secret hygiene is **correct** — the NVIDIA key is read from env/file, placed
only in an `Authorization` header, **never logged or returned**, and `.gitignore` covers `NVIDIA_NIM_KEY` /
`.env` / `*.sqlite` (all untracked; clean 2-commit history). SQL is **fully parameterized**; React renders
`explanation`/`tagNarration` as escaped text (no `dangerouslySetInnerHTML`/`eval`); `window.open` uses
`noopener`; the API has a body-size cap and a reflected-origin CORS allowlist; the agent-tools import
allowlist (`scripts/agent-tools-httpx-only.mjs`) is a genuine supply-chain guardrail.

---

## 5. Plan-conformance matrix (AC1–AC15)

| AC | Status | Note |
|----|--------|------|
| AC1 cold-start degrade | **PARTIAL** | Agent-down works; no warmup-state test, no startup health-gate (m7). |
| AC2 httpx-only lint in CI | **PARTIAL** | Real regex lint script exists; **not AST, not in CI** (M1). |
| AC3 property tests | **NOT MET** | Example-based, no fast-check, 2 draws (M9). |
| AC4 100% rank+exclusion coverage, fails CI | **PARTIAL** | 100% achieved locally ✓; "fails CI" untrue — no CI (M1). |
| AC5 provider mock+live, last-good, seed-gap backfill | **PARTIAL** | Providers + last-good ✓; seed is a 3-draw stub; no multi-draw seed-gap test (M4). |
| AC6 NIM-down / agent-down → fallback | **MET** | Both degrade paths exist and tested. |
| AC7 model-agnostic NIM, missing-key error | **MET** (light) | Missing-key→fallback tested; no explicit env-swap test. |
| AC8 Langfuse spans + traceId=null off | **PARTIAL** | Spans + `traceId=null` ✓; persisted traceId doesn't link to Langfuse (M3). |
| AC9 schema-validate, retry-once, fallback | **MET** | `calls==2` then fallback; Zod re-validation at boundary. |
| AC10 saved-check rank+matched+bonus | **MET** | Tested (1st-prize path). |
| AC11 purchase CTA, disclaimer/19+, copy, no-automation | **MET** (weak test) | Feature present; only a source-grep test (m3). |
| AC12 `.env.example` keys, URL split | **MET** (light) | Core keys + URL split ✓; some used vars undocumented (m12). |
| AC13 generated contract, drift fails CI | **PARTIAL** | OpenAPI→Pydantic generated ✓; Zod↔OpenAPI hand-mirrored, drift uncaught, no CI (M2). |
| AC14 concurrent sync+save | **MET** | `Promise.all([sync, save])` test passes; WAL + serialize. |
| AC15 infeasible/edge sets | **MET (a,b,d) / PARTIAL (c)** | `partial=true` path unreachable & untested (m8). |

---

## 6. False positives explicitly cleared (no true negatives, no phantom bugs)

These were considered and **refuted** against the actual code — they are **not** defects:

- **§0 hot-path contract** — correctly implemented: API owns numbers, strips `explanation`/`tagNarration`
  before `/explain` (`service.ts:80`), `fallbackUsed` is API-authoritative (defaults `true`, overwritten
  only by the API; agent reply re-validated in `agentClient.ts`). **Sound.**
- **`generation.ts` homogeneity / under-fill** — for realistic inputs (`lucky=[7,11], count=5`) the pool
  fills to 40 candidates and the top-5 are **distinct**; `effectiveCount` is honored. **No bug.**
- **`rank.ts`** — 6→1st, 5+bonus→2nd, 5→3rd, 4→4th, 3→5th, else No Prize; `matchedNumbers` excludes the
  bonus; 2nd-vs-3rd edge handled. **Correct.**
- **`fallbackUsed` truth table** — all four agentClient branches (omit/dup/add/extra IDs, schema-invalid,
  timeout) force deterministic fallback; tested. **Correct.**
- **WAL single-writer concurrency** — `serialize()` write-queue chains via `.then(fn,fn)` and swallows
  rejections so the chain isn't poisoned; `saveRecommendations` uses `BEGIN IMMEDIATE`. **Solid.**
- **Secret leakage** — none; hygiene verified correct (see §4).

---

## 7. Recommended priority order

1. **C1** — fix `latestDrawNo()` to probe the endpoint + bound the backfill; ship the real seed (**M4**).
   This is the only issue that degrades the running product today.
2. **M5, M6** — data-integrity correctness (transaction; don't rank against the wrong draw).
3. **M7, M8** — user-visible resilience (web error handling; make the LLM path actually usable).
4. **M1, M2, M3, M9** — make the plan's guarantees real (CI workflow; Zod-sourced contract; trace linkage;
   property tests) **or** down-scope the corresponding ACs honestly.
5. **m1–m13 / n1–n3 / S1–S3** — quality, conformance, and deploy-hardening cleanups.

---

*Reviewers: software-architect · senior-engineer · adversarial-critic · security — synthesized and
cross-verified against source and a green build/test run. Where reviewers split on severity (e.g. M1
CRITICAL-vs-MAJOR), the more conservative, evidence-supported rating was taken and the disagreement noted.*
