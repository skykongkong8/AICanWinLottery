# PRD: Korean Lotto AI Number Recommendation & Result Tracking Service

Date: 2026-06-17
Audience: coding agent implementing the product from scratch
Status: Draft v0.2 (NVIDIA NIM / LangChain / LangGraph / Langfuse incorporated)

---

## 1. One-line Summary

A local web service where users enter lucky numbers, the system verifies that generated Lotto 6/45 combinations do not exactly duplicate historical jackpot combinations, and a LangChain + LangGraph AI Agent uses NVIDIA NIM `z-ai/glm-5.1` to produce fun “pattern analysis” explanations, guide users safely up to the official Donghaeng Lottery purchase flow, and later check purchased/saved numbers automatically or manually.

---

## 2. Background and Opportunity

Many lotto recommendation services exist, but most lack one or more of the following:

- Exact duplicate prevention against historical winning combinations
- Personalized recommendations centered on the user’s “lucky numbers”
- A fun and transparent AI explanation UX
- A safe bridge to the official purchase flow
- A closed-loop experience for saving numbers and checking results after the draw
- Developer observability for AI Agent calls, tool usage, and errors

This project is positioned as “fun number generation + responsible purchase guidance + result tracking,” not as scientific prediction.

---

## 3. Product Principles

1. **Entertainment first**: Never guarantee improved winning odds. Every recommendation screen must show a “for fun / no guarantee” disclaimer.
2. **Responsible lottery use**: Include underage purchase warnings, official online purchase limits, and anti-overuse messaging in the UX.
3. **No purchase automation**: Guide users to the official Donghaeng Lottery site, but do not automate login, payment, deposits, or purchase clicks.
4. **App-ready architecture**: Start with localhost Web, but keep domain logic and APIs reusable for a future Android app.
5. **Agent observability**: Trace LangChain/LangGraph execution, LLM calls, tool calls, recommendation reasoning, and errors with Langfuse.
6. **Data transparency**: Clearly separate “statistics from historical winning numbers” from “LLM interpretation.”

---

## 4. Official Constraints and Reference Facts

The implementation must reflect the following constraints in product behavior, UX, and validation logic:

- Lotto 6/45 requires selecting **6 numbers from 1 to 45**.
- The official Donghaeng Lottery price is **KRW 1,000 per game**.
- Official online purchase is available on the Donghaeng Lottery website and is limited to **KRW 5,000 per person per draw, combined across PC and mobile**, according to the user guide.
- Donghaeng Lottery membership/purchase guidance assumes identity-verified adults aged **19 or older**.
- Draws are scheduled around **20:35 every Saturday** according to Donghaeng Lottery guidance, subject to broadcast changes.
- The official site provides features for checking “my numbers” and managing saved lottery numbers.

> Sources: Donghaeng Lottery Lotto 6/45 introduction, user guide, and draw result pages. See References at the end of this document.

---

## 5. Goals

### 5.1 MVP Goals

- Synchronize and query historical winning numbers
- Generate 1 to 5 recommended combinations that include the user’s lucky numbers
- Exclude any combination that exactly matches a historical 1st-prize combination
- Use an LLM Agent to generate statistical summaries and recommendation explanations
- Model the recommendation workflow with LangGraph state/nodes/edges
- Configure NVIDIA NIM API key based LLM provider with `z-ai/glm-5.1`
- Save recommended combinations
- Compare saved combinations against the latest draw result
- Provide a “Go to official purchase site” CTA and purchase guidance
- Make Langfuse traces inspectable
- Provide `.env.example`

### 5.2 Non-goals

- Actual lottery purchase automation
- Official site login automation
- Payment or deposit automation
- Guaranteeing improved winning odds
- Storing resident registration numbers, Donghaeng Lottery credentials, or sensitive identity data
- Building a native Android app in the initial version

---

## 6. Target Users

### Persona A: Casual user choosing numbers for fun

- Wants a quick answer to “What numbers should I pick this week?”
- Wants to include birthdays, anniversaries, or other lucky numbers
- Wants the explanation to be fun rather than overly serious

### Persona B: User who wants records

- Wants to save weekly picks
- Wants to check whether saved numbers won after the draw
- Wants to review number selection history

### Persona C: Developer/operator

- Wants to inspect which data the Agent used and how it reasoned
- Wants to debug prompts, tool calls, provider errors, and fallback behavior

---

## 7. Core User Flows

### Flow 1: Number Recommendation

1. The user enters a recommendation count and 0 to 6 lucky numbers.
2. The client validates number range, duplicate values, and count limits.
3. The server checks the freshness of winning-number data.
4. If the data is stale, the server synchronizes it.
5. `LottoRecommendationAgent` runs the workflow:
   - Check exact historical winning-combination duplicates
   - Compute statistical features
   - Generate candidate combinations
   - Validate candidates
   - Use the LLM to generate fun recommendation explanations
6. The user reviews combination explanations, statistical tags, and responsibility disclaimers.
7. The user chooses combinations to save.

### Flow 2: Purchase Guidance

1. The user clicks “Buy on official site” from the recommendation result screen.
2. The app states that it is only guidance, not purchase automation.
3. The app opens the official Lotto 6/45 purchase or user guide URL in a new tab.
4. The app provides the selected numbers in an easy-to-copy format.

### Flow 3: Result Checking

1. The user opens the saved combinations list.
2. The server synchronizes the latest draw result.
3. Each saved combination is compared with the latest or selected draw.
4. The app shows rank, matched numbers, and bonus-number match status.
5. The user can re-check on the official site via CTA.

---

## 8. Functional Requirements

### 8.1 Winning Number Data Collection

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | Store the 6 winning numbers and bonus number for each historical draw. | P0 |
| FR-002 | Detect the latest draw and synchronize new results. | P0 |
| FR-003 | Hide the data source behind a `LotteryResultProvider` interface. | P0 |
| FR-004 | Degrade to the last successful data when the official page structure changes or network errors occur. | P1 |
| FR-005 | Store source URL, fetchedAt, and parser version for each sync. | P1 |

### 8.2 Number Input and Validation

| ID | Requirement | Priority |
|---|---|---|
| FR-010 | Allow 0 to 6 lucky numbers. | P0 |
| FR-011 | Each number must be an integer from 1 to 45. | P0 |
| FR-012 | Reject duplicate inputs on both client and server. | P0 |
| FR-013 | Treat more than 6 lucky numbers as an error. | P0 |
| FR-014 | Always store recommended combinations as 6 numbers sorted ascending. | P0 |

### 8.3 Recommendation Engine

| ID | Requirement | Priority |
|---|---|---|
| FR-020 | Every recommended combination must include all lucky numbers. | P0 |
| FR-021 | Exclude combinations that exactly match historical 1st-prize combinations. | P0 |
| FR-022 | Recommended combinations within the same request must be unique. | P0 |
| FR-023 | Limit default recommendation count to 5 or fewer. | P0 |
| FR-024 | Recommendation reasons must include “for entertainment and does not guarantee winning.” | P0 |
| FR-025 | Provide deterministic fallback recommendations when the LLM fails. | P0 |
| FR-026 | Provide recommendation tags such as `balanced`, `low-high-mix`, `odd-even-mix`, `hot-cold-mix`, and `lucky-heavy`. | P1 |
| FR-027 | Provide entertainment-oriented progress messages such as “AI is looking for patterns.” | P1 |

### 8.4 Agent System

| ID | Requirement | Priority |
|---|---|---|
| FR-030 | Implement `LottoRecommendationAgent` with LangChain + LangGraph. Python `langchain_nvidia_ai_endpoints.ChatNVIDIA` is the default; TypeScript is allowed only if equivalent NVIDIA NIM LangChain integration is verified. | P0 |
| FR-031 | The Agent must call statistics, validation, and candidate-generation functions through tools. | P0 |
| FR-032 | NVIDIA NIM is the default LLM provider; inject `NVIDIA_API_KEY`, `NVIDIA_MODEL=z-ai/glm-5.1`, temperature, top_p, and max_tokens via environment/config. | P0 |
| FR-033 | Validate LLM output with structured output schemas. Use Pydantic in Python or Zod in TypeScript. | P0 |
| FR-034 | Model recommendation requests as LangGraph State, Nodes, and Edges, with checkpointing where useful. | P0 |
| FR-035 | Create request-level traces using Langfuse callback or metadata. | P0 |
| FR-036 | Use an anonymous session ID in traces when no userId/sessionId exists. | P1 |

### 8.5 Storage and Result Checking

| ID | Requirement | Priority |
|---|---|---|
| FR-040 | Allow saving recommended combinations. | P0 |
| FR-041 | Saved combinations must include target draw number, createdAt, source, and memo. | P0 |
| FR-042 | After the latest result is published, calculate whether saved combinations won. | P0 |
| FR-043 | Implement rank calculation as server-side domain logic and test it. | P0 |
| FR-044 | Allow users to select a past draw and compare saved numbers against it. | P1 |
| FR-045 | Store a “result check needed” state for future notifications. | P2 |

### 8.6 Purchase Guidance

| ID | Requirement | Priority |
|---|---|---|
| FR-050 | Provide a CTA to the official Donghaeng Lottery URL. | P0 |
| FR-051 | Before the CTA, state that purchases must be completed directly on the official site. | P0 |
| FR-052 | Provide selected numbers as copyable text. | P0 |
| FR-053 | Display under-19 purchase prohibition and anti-overuse messaging. | P0 |
| FR-054 | Manage official URLs through env/config because the official site can change. | P1 |

---

## 9. Recommendation Logic Design

### 9.1 Core Principle

Lotto draws are independent random events, so the product must never claim that historical numbers increase future winning probability.

- Forbidden: “These numbers have a higher chance of winning.”
- Allowed: “For fun, we used historical patterns to create a balanced combination.”

### 9.2 Candidate Generation

Inputs:

- `luckyNumbers: number[]`
- `count: 1..5`
- `excludeHistoricalWinners: true`
- `strategyMix`

Output:

- `combinations: LottoCombination[]`

Default algorithm:

1. Validate `luckyNumbers`.
2. Candidate pool = 1..45 excluding luckyNumbers.
3. Create strategy-specific score functions:
   - Odd/even balance: prefer 3:3 or 2:4 / 4:2
   - Low/mid/high range balance: 1-15, 16-30, 31-45
   - Sum range: prefer the 10th to 90th percentile of historical combination sums
   - Avoid excessive consecutive numbers
   - Avoid excessive same-ending digits
   - Mix hot/cold numbers based on historical frequency
4. Generate candidate combinations.
5. Remove exact historical jackpot matches.
6. Remove duplicates within the same request.
7. Ask the LLM to produce fun explanations for each combination.

### 9.3 LLM Role Limits

The LLM must not decide the final numbers by itself.

- Deterministic services generate and validate candidates.
- The LLM evaluates candidates and writes explanations.
- If LLM output fails schema validation, use fallback explanations.

---

## 10. Agent Design

### 10.1 Agent Name

`LottoRecommendationAgent`

### 10.2 Tools

| Tool | Description |
|---|---|
| `get_latest_draw_results` | Return the latest draw and summary of stored winning numbers. |
| `compute_lotto_statistics` | Return frequency, range, odd/even, sum, consecutive-number, and related features. |
| `generate_candidate_combinations` | Generate validated candidate combinations. |
| `validate_combination` | Check range, duplicates, and exact historical winning-combination match. |
| `save_recommendation` | Save the recommendation selected by the user. |

### 10.3 Structured Output Schema

Enforce the same contract with TypeScript/Zod or Python/Pydantic. Conceptual schema:

```ts
RecommendationResponse = {
  combinations: Array<{
    numbers: [number, number, number, number, number, number],
    tags: string[],
    explanation: string,
    entertainmentDisclaimer: string
  }>,
  analysisSummary: {
    dataRange: string,
    observedPatterns: string[],
    caveat: string
  }
}
```

### 10.4 LLM Provider: NVIDIA NIM / GLM-5.1

The default LLM provider is NVIDIA NIM API with model `z-ai/glm-5.1`. Never hardcode the API key; read it from `NVIDIA_API_KEY`.

Reference initialization for the Python Agent runtime:

```python
import os
from langchain_nvidia_ai_endpoints import ChatNVIDIA

client = ChatNVIDIA(
    model=os.getenv("NVIDIA_MODEL", "z-ai/glm-5.1"),
    api_key=os.environ["NVIDIA_API_KEY"],
    temperature=float(os.getenv("NVIDIA_TEMPERATURE", "1")),
    top_p=float(os.getenv("NVIDIA_TOP_P", "1")),
    max_tokens=int(os.getenv("NVIDIA_MAX_TOKENS", "16384")),
)
```

Implementation requirements:

- If `NVIDIA_API_KEY` is missing, return a clear configuration error at Agent startup or first call.
- Default model is `z-ai/glm-5.1`; override only through `.env`.
- Defaults: temperature `1`, top_p `1`, max_tokens `16384`.
- On LLM failure, timeout, or rate limit, use deterministic fallback recommendation and record `fallbackUsed=true` in Langfuse.
- The LLM must never be the sole authority for selecting numbers; deterministic candidate generation and validation come first.

### 10.5 LangChain / LangGraph / Langfuse Usage Guidance

Current LangChain documentation supports the following implementation approach:

- **LangChain**: Use it as the Agent layer connecting model, prompt, tools, and structured output. Tool schemas must be explicit, and recommendation responses must be schema-validated.
- **LangGraph**: Use State/Nodes/Edges for the multi-step workflow `load_draw_data -> compute_statistics -> generate_candidates -> validate_candidates -> llm_explain -> persist/return`. LangGraph owns long-running execution, retries, streaming, and checkpointing where needed.
- **Langfuse**: Use the LangChain callback handler or invoke metadata to create traces. Each request must include `runName`, `tags`, `langfuseSessionId` or anonymous session, `targetDrawNo`, and `fallbackUsed`.
- **Contract first**: If Agent output schema validation fails, retry once if safe, then use fallback explanations. UI/API layers receive only schema-valid results.

### 10.6 Example UX Messages

- “AI is looking through past lotto-number patterns... unscientific? Maybe. Fun? Definitely!”
- “Keeping your lucky numbers fixed while mixing the rest so they do not duplicate past jackpot combinations.”
- “This recommendation is for entertainment. Lotto is random and winning is not guaranteed.”

---

## 11. Information Architecture and Screens

### 11.1 Screen List

1. **Home / Generator**
   - Lucky number input
   - Recommendation count selector
   - Responsibility disclaimer
   - Generate button

2. **Recommendation Result**
   - Recommendation cards
   - Tags and explanations per combination
   - Save button
   - Copy button
   - Official purchase guidance CTA

3. **Saved Numbers**
   - Saved number list
   - Target draw
   - Status: pending / checked / won / lost

4. **Draw Results**
   - Latest draw numbers
   - Sync timestamp
   - Historical draw search

5. **Check Result**
   - Saved combination vs winning numbers
   - Highlight matched numbers
   - Rank and bonus-number match status

6. **Developer / Traces (local only)**
   - Langfuse trace link
   - Agent request ID
   - Fallback status

---

## 12. System Architecture

### 12.1 Recommended Structure

For the initial version, keep Web/API in TypeScript where convenient, but split the Agent runtime into a Python package to directly use the provided NVIDIA `ChatNVIDIA` example. A TypeScript-only implementation is acceptable only after NVIDIA NIM LangChain integration parity is verified.

```txt
lotto-ai/
  apps/
    web/                 # localhost Web UI (TypeScript)
    api/                 # HTTP API server / BFF (TypeScript or Python)
    agent/               # Python LangChain + LangGraph service using ChatNVIDIA
  packages/
    core/                # domain logic: combinations, rank calculation, statistics
    data/                # DB schema, repositories, result provider
    shared/              # DTO, Zod/Pydantic schemas, OpenAPI types
  docs/
    PRD.md
  .env.example
```

### 12.2 Android-readiness

- Web UI must only be an API client.
- Recommendation, storage, and result-checking logic must live in server APIs and `packages/core`.
- API contracts must be clearly defined with OpenAPI or typed RPC.
- A future Android app should call the same API.
- If the MVP is local-only, use SQLite behind repository interfaces.

### 12.3 Recommended Technology Stack

| Layer | MVP Recommendation |
|---|---|
| Language | TypeScript for Web/API + Python for Agent recommended |
| Web | Next.js or Vite React |
| API | Fastify/Hono or FastAPI |
| Agent Orchestration | LangChain + LangGraph |
| LLM Provider | NVIDIA NIM API / `z-ai/glm-5.1` |
| Validation | Zod (TypeScript) + Pydantic (Python Agent) |
| DB | SQLite |
| ORM | Drizzle, Prisma, SQLModel, or SQLAlchemy |
| Tracing | Langfuse |
| Tests | Vitest for TS and Pytest for Python where applicable |
| Scheduling | node-cron, APScheduler, or API-triggered sync |

---

## 13. API Draft

```http
GET /api/health
GET /api/draws/latest
GET /api/draws/:drawNo
POST /api/draws/sync

POST /api/recommendations
GET /api/recommendations
GET /api/recommendations/:id
POST /api/recommendations/:id/check
DELETE /api/recommendations/:id

GET /api/config/purchase-guide
```

### POST /api/recommendations

Request:

```json
{
  "luckyNumbers": [3, 7, 21],
  "count": 5,
  "targetDrawNo": 1229
}
```

Response:

```json
{
  "requestId": "rec_...",
  "traceId": "langfuse_trace_id",
  "combinations": [
    {
      "numbers": [3, 7, 14, 21, 32, 44],
      "tags": ["lucky-heavy", "odd-even-mix", "low-high-mix"],
      "explanation": "Keeping lucky numbers 3, 7, and 21 fixed...",
      "disclaimer": "For entertainment only; winning is not guaranteed."
    }
  ]
}
```

---

## 14. Data Model Draft

### `draw_results`

| Field | Type |
|---|---|
| draw_no | integer PK |
| draw_date | date nullable |
| n1..n6 | integer |
| bonus | integer |
| source_url | text |
| fetched_at | datetime |
| parser_version | text |

### `recommendations`

| Field | Type |
|---|---|
| id | text PK |
| target_draw_no | integer |
| numbers_json | text |
| lucky_numbers_json | text |
| tags_json | text |
| explanation | text |
| disclaimer | text |
| trace_id | text nullable |
| status | enum: pending, checked |
| created_at | datetime |

### `result_checks`

| Field | Type |
|---|---|
| id | text PK |
| recommendation_id | text FK |
| draw_no | integer |
| matched_numbers_json | text |
| matched_count | integer |
| bonus_matched | boolean |
| rank | integer nullable |
| checked_at | datetime |

---

## 15. Rank Calculation Rules

| Rank | Condition |
|---|---|
| 1st | 6 numbers match |
| 2nd | 5 numbers match + bonus number matches |
| 3rd | 5 numbers match |
| 4th | 4 numbers match |
| 5th | 3 numbers match |
| No prize | Anything else |

---

## 16. Environment Variables

Include these in `.env.example`.

```bash
# Runtime
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000

# LLM provider - NVIDIA NIM
LLM_PROVIDER=nvidia_nim
NVIDIA_API_KEY=
NVIDIA_MODEL=z-ai/glm-5.1
NVIDIA_TEMPERATURE=1
NVIDIA_TOP_P=1
NVIDIA_MAX_TOKENS=16384
LLM_TIMEOUT_MS=60000

# Langfuse
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASEURL=https://cloud.langfuse.com
LANGFUSE_TRACING_ENVIRONMENT=local

# Data
DATABASE_URL=file:./dev.db
LOTTERY_RESULT_SOURCE_URL=https://www.dhlottery.co.kr/lt645/result
LOTTERY_PURCHASE_GUIDE_URL=https://www.dhlottery.co.kr/userGuide
LOTTERY_PURCHASE_URL=https://www.dhlottery.co.kr/

# Safety
MAX_RECOMMENDATION_COUNT=5
ENABLE_PURCHASE_AUTOMATION=false
```

---

## 17. Observability Requirements

Record the following metadata in Langfuse traces:

- `requestId`
- `targetDrawNo`
- `luckyNumbersCount`
- `recommendationCount`
- `dataLatestDrawNo`
- `candidateGenerationStrategy`
- `fallbackUsed`
- `validationFailures`
- `anonymousSessionId`

For JS/TS, use the `@langfuse/langchain` CallbackHandler or LangChain invoke metadata. For a Python Agent, use the corresponding Langfuse Python/LangChain integration while preserving the same trace contract. Each Agent execution must set `runName`, `tags`, `langfuseSessionId`, and `langfuseUserId` only when available. LangGraph node names should appear in trace span names.

---

## 18. Safety, Policy, and Legal UX

Display the following near every recommendation result and purchase CTA:

> This service is an entertainment-only number recommendation tool. Lotto draws are random, and AI analysis does not predict or guarantee winning. Lottery tickets may be purchased only by adults aged 19 or older. Please avoid excessive purchases.

Purchase CTA modal:

- “You are moving to the official Donghaeng Lottery site.”
- “Login, deposit, and final purchase confirmation must be performed directly by the user.”
- “This app does not perform purchase automation.”

---

## 19. Success Metrics

### MVP Functional Metrics

- Recommendation generation success rate ≥ 95%
- Fallback success rate after LLM failure = 100%
- Exact duplicates with historical jackpot combinations = 0
- Unit test coverage for core rank-calculation logic = 100%
- Clear user-visible state when latest result sync fails

### UX Metrics

- First recommendation generated within 30 seconds
- Saved combination result check within 3 clicks
- Responsible-use disclaimer exposure before purchase guidance CTA = 100%

---

## 20. Test Requirements

### Unit Tests

- Number range validation
- Lucky-number cases: 0, 1, 6, and 7 numbers
- Historical jackpot exact-match exclusion
- Duplicate recommendation exclusion
- Rank calculation: 1st through 5th, no prize, bonus match
- LLM schema parse failure fallback

### Integration Tests

- `POST /api/recommendations`
- `POST /api/recommendations/:id/check`
- Draw result provider mock success/failure
- Service works when Langfuse is disabled
- Agent fallback works when NVIDIA NIM call fails or times out

### E2E Smoke

1. Enter lucky numbers `[7, 11]`.
2. Generate 5 combinations.
3. Save 1 combination.
4. Synchronize latest result.
5. Check result.
6. Verify purchase guidance CTA modal.

---

## 21. Implementation Phases

### Phase 0: Bootstrap

- Create monorepo
- Configure web/api/core/agent/data/shared packages or apps
- Configure lint/typecheck/test
- Create `.env.example`

### Phase 1: Core Domain

- Lotto number validation
- Combination generation
- Historical duplicate check
- Rank calculation
- Unit tests

### Phase 2: Data Layer

- SQLite schema
- Draw result repository
- Result provider interface
- Manual seed/import path

### Phase 3: Agent

- Configure NVIDIA NIM `ChatNVIDIA` provider (`z-ai/glm-5.1`)
- Implement LangChain tools
- Build LangGraph State/Nodes/Edges workflow
- Define structured output schema with Pydantic/Zod
- Implement fallback path
- Add Langfuse tracing

### Phase 4: API

- Recommendation endpoints
- Draw endpoints
- Result check endpoints
- Config/purchase-guide endpoint

### Phase 5: Web UI

- Generator page
- Result cards
- Saved numbers
- Check result
- Purchase guide modal

### Phase 6: Hardening

- Error states
- Data sync resilience
- Trace dashboard link
- Documentation

---

## 22. Definition of Done for Coding Agent

- [ ] `.env.example` exists and includes NVIDIA NIM LLM, Langfuse, DB, and Donghaeng Lottery URL settings.
- [ ] Agent execution path for `NVIDIA_API_KEY` and `NVIDIA_MODEL=z-ai/glm-5.1` is documented.
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass for TypeScript packages where applicable.
- [ ] Python Agent tests pass where applicable.
- [ ] Recommendations including lucky numbers work.
- [ ] Recommended combinations never exactly match historical 1st-prize combinations.
- [ ] Fallback recommendations work when the LLM is disabled or fails.
- [ ] LangGraph workflow node execution and Langfuse traces are visible in local/dev.
- [ ] Saved-combination result checking is verified with rank-specific tests.
- [ ] Purchase CTA only guides to the official site and never automates purchase.
- [ ] UI displays entertainment-only, no-guarantee, and 19+ responsibility wording.
- [ ] Domain logic is not coupled to web-only implementation details that would block Android migration.

---

## 23. Additional Backlog Ideas

| Idea | Description | Priority |
|---|---|---|
| QR/image export | Save/share recommendation combinations as image cards | P2 |
| Themed recommendations | Birthday party, balanced, twist, fully random | P2 |
| Family number profiles | Save reusable lucky-number sets | P2 |
| Draw notifications | Saturday night / Sunday morning result-check reminder | P2 |
| Statistics playground | Visualize frequency, missing duration, and range distribution | P2 |
| Responsible purchase mode | Weekly purchase budget reminder | P1 |
| Official result deep link | Navigate to draw-specific official result pages | P1 |
| Android preparation | OpenAPI client generation and push notification design | P2 |
| Prompt playground | Compare prompts and traces in local dev | P2 |

---

## 24. References

- Donghaeng Lottery main site / official menus: https://www.dhlottery.co.kr/
- Donghaeng Lottery Lotto 6/45 introduction: https://www.dhlottery.co.kr/lt645/intro
- Donghaeng Lottery Lotto 6/45 draw results: https://www.dhlottery.co.kr/lt645/result
- Donghaeng Lottery user guide: https://www.dhlottery.co.kr/userGuide
- LangChain docs: https://docs.langchain.com/
- LangChain JS docs: https://docs.langchain.com/oss/javascript/
- LangChain structured output: https://docs.langchain.com/oss/javascript/langchain/structured-output
- LangGraph JS docs: https://docs.langchain.com/oss/javascript/langgraph/overview
- LangGraph workflows/agents: https://docs.langchain.com/oss/javascript/langgraph/workflows-agents
- Langfuse LangChain integration: https://langfuse.com/docs/integrations/frameworks/langchain
- Langfuse environments: https://langfuse.com/docs/observability/features/environments
- NVIDIA NIM APIs: https://build.nvidia.com/
