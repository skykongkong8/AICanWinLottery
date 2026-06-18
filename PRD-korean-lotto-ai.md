# PRD: 한국 로또 AI 번호 추천 & 당첨 추적 서비스

작성일: 2026-06-17
대상: from-scratch 구현을 맡을 코딩 에이전트
상태: Draft v0.2 (NVIDIA NIM / LangChain / LangGraph / Langfuse 반영)

---

## 1. 한 줄 요약

사용자가 행운의 번호를 넣으면, 과거 로또6/45 당첨 조합과 중복되지 않도록 검증하고, LangChain + LangGraph 기반 AI Agent가 NVIDIA NIM `z-ai/glm-5.1` 모델로 “재미용 패턴 분석” 설명과 함께 번호 조합을 추천하며, 동행복권 구매 직전까지 안전하게 안내하고, 추후 당첨 여부를 자동/수동으로 확인할 수 있는 로컬 웹 서비스.

---

## 2. 배경과 기회

로또 번호 추천 서비스는 많지만 대개 다음 중 하나가 부족하다.

- 과거 당첨 조합과의 정확한 중복 방지
- 사용자의 “행운의 번호”를 중심에 둔 맞춤 추천
- AI 추천 이유를 재미있고 투명하게 설명하는 UX
- 실제 구매 동선까지 이어지는 안내
- 구매한 번호를 저장하고 다음 회차 발표 후 당첨 여부를 확인하는 폐루프 경험
- AI Agent 호출/도구 사용/오류를 추적할 수 있는 개발자 관측성

이 프로젝트는 “과학적 예측”이 아니라 “재미있는 번호 생성 + 책임 있는 구매 안내 + 결과 추적” 제품으로 포지셔닝한다.

---

## 3. 제품 원칙

1. **오락성 우선**: 당첨 확률 향상 보장 금지. 모든 추천 화면에 “재미용/비보장” 문구를 노출한다.
2. **책임 있는 복권 사용**: 미성년자 구매 금지, 회차당 인터넷 구매 한도, 과몰입 예방 메시지를 UX에 포함한다.
3. **구매 자동화 금지**: 사용자를 공식 동행복권 사이트로 안내하되, 로그인/결제/구매 버튼 클릭을 자동화하지 않는다.
4. **앱 전환 가능 아키텍처**: UI는 우선 localhost Web, 도메인 로직과 API는 Android 앱에서 재사용 가능하게 분리한다.
5. **Agent 관측성**: Langfuse로 LangChain/LangGraph 실행, LLM 호출, tool call, 추천 사유, 오류를 trace한다.
6. **데이터 투명성**: “과거 당첨번호 기반 통계”와 “LLM의 해석”을 구분해서 보여준다.

---

## 4. 공식 제약 및 참고 사실

구현 시 다음 제약을 제품/UX/검증 로직에 반영한다.

- 로또6/45는 **1~45 숫자 중 6개**를 선택하는 게임이다.
- 동행복권 기준 로또6/45는 **1게임 1,000원**이다.
- 동행복권 인터넷 구매는 공식 홈페이지에서 가능하며, 이용 안내상 **회차당 1인 5,000원(PC+모바일 합산)** 제한이 있다.
- 동행복권 회원가입은 본인인증이 완료된 **19세 이상 성인**을 전제로 안내된다.
- 추첨은 동행복권 안내 기준 **매주 토요일 20:35경**이며 방송 사정에 따라 변동 가능하다.
- 공식 사이트는 “내 번호 당첨 확인” 기능과 “나의 복권 번호관리” 메뉴를 제공한다.

> 출처: 동행복권 로또6/45 소개, 이용안내, 추첨결과 페이지. 상세 URL은 문서 하단 References 참고.

---

## 5. 목표

### 5.1 MVP 목표

- 과거 당첨번호 동기화/조회
- 사용자가 입력한 행운의 번호를 포함한 1~5개 추천 조합 생성
- 과거 1등 당첨 조합과 동일한 6개 번호 조합 배제
- LLM Agent가 통계 요약과 추천 사유를 생성
- 추천 조합 저장
- 최신 회차 당첨 결과와 저장 조합 비교
- 동행복권 구매 페이지/구매 안내로 이동하는 “구매하러 가기” CTA
- LangGraph 기반 추천 workflow 상태/노드 구성
- NVIDIA NIM API Key 기반 `z-ai/glm-5.1` LLM provider 설정
- Langfuse trace 확인 가능
- `.env.example` 제공

### 5.2 비목표

- 실제 로또 구매 자동화
- 공식 사이트 로그인 자동화
- 결제/예치금 충전 자동화
- 당첨 확률 향상 보장
- 개인정보/주민등록번호/동행복권 계정 정보 저장
- 초기에 Android Native 앱 구현

---

## 6. 타깃 사용자

### Persona A: 재미로 번호를 고르는 일반 사용자

- “이번 주 번호 뭐 하지?”를 빠르게 해결하고 싶다.
- 생일, 기념일 같은 행운의 번호를 넣고 싶다.
- 추천 이유가 너무 진지하기보다 재미있길 원한다.

### Persona B: 기록을 남기고 싶은 사용자

- 매주 고른 번호를 저장하고 싶다.
- 발표 후 내가 산 번호가 몇 등인지 확인하고 싶다.
- 번호 선택 히스토리를 보고 싶다.

### Persona C: 개발자/운영자

- Agent가 어떤 데이터를 보고 어떤 판단을 했는지 trace하고 싶다.
- LLM prompt와 tool call 실패를 디버깅하고 싶다.

---

## 7. 핵심 사용자 플로우

### Flow 1: 번호 추천

1. 사용자가 추천 개수와 행운의 번호 0~6개를 입력한다.
2. 클라이언트가 숫자 범위, 중복, 개수 제한을 검증한다.
3. 서버가 최신 당첨번호 데이터 상태를 확인한다.
4. 데이터가 오래되었으면 동기화한다.
5. Recommendation Agent가 다음을 수행한다.
   - 과거 당첨 조합 중복 여부 검증
   - 통계 feature 계산
   - 후보 조합 생성
   - LLM으로 재미있는 추천 설명 생성
6. 사용자는 조합별 설명, 통계 태그, 책임 고지를 확인한다.
7. 사용자가 저장할 조합을 선택한다.

### Flow 2: 구매 안내

1. 사용자가 추천 조합 화면에서 “공식 사이트에서 구매하기”를 누른다.
2. 앱은 구매 자동화가 아니라 공식 사이트 안내임을 고지한다.
3. 동행복권 로또6/45 바로구매 또는 이용안내 URL을 새 탭으로 연다.
4. 앱은 선택 조합을 복사하기 쉬운 형식으로 제공한다.

### Flow 3: 당첨 확인

1. 사용자가 저장된 조합 목록을 연다.
2. 서버가 최신 회차 결과를 동기화한다.
3. 각 저장 조합을 최신/선택 회차 결과와 비교한다.
4. 앱은 등수, 일치 번호, 보너스 번호 일치 여부를 보여준다.
5. 사용자는 “공식 사이트에서 확인하기” CTA로 재확인할 수 있다.

---

## 8. 기능 요구사항

### 8.1 당첨번호 데이터 수집

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-001 | 과거 회차별 1등 당첨번호 6개와 보너스 번호를 저장한다. | P0 |
| FR-002 | 최신 회차를 감지하고 신규 결과를 동기화한다. | P0 |
| FR-003 | 데이터 소스는 `LotteryResultProvider` 인터페이스 뒤에 숨긴다. | P0 |
| FR-004 | 공식 페이지 구조 변경/네트워크 오류 시 마지막 성공 데이터로 degrade한다. | P1 |
| FR-005 | 데이터 동기화 시 source URL, fetchedAt, parser version을 저장한다. | P1 |

### 8.2 번호 입력 및 검증

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-010 | 행운의 번호는 0~6개까지 허용한다. | P0 |
| FR-011 | 각 번호는 1~45 정수여야 한다. | P0 |
| FR-012 | 중복 입력은 클라이언트/서버 모두에서 거부한다. | P0 |
| FR-013 | 6개 초과 입력은 오류로 처리한다. | P0 |
| FR-014 | 추천 조합은 항상 오름차순 6개 숫자로 저장한다. | P0 |

### 8.3 추천 엔진

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-020 | 추천 조합은 행운의 번호를 모두 포함해야 한다. | P0 |
| FR-021 | 과거 1등 당첨 조합과 완전히 동일한 조합은 제외한다. | P0 |
| FR-022 | 한 요청에서 생성된 추천 조합끼리도 중복되면 안 된다. | P0 |
| FR-023 | 기본 추천 개수는 5개 이하로 제한한다. | P0 |
| FR-024 | 추천 사유에는 “재미용이며 당첨을 보장하지 않음” 문구를 포함한다. | P0 |
| FR-025 | LLM 실패 시 deterministic fallback 추천을 제공한다. | P0 |
| FR-026 | 추천 태그를 제공한다: `balanced`, `low-high-mix`, `odd-even-mix`, `hot-cold-mix`, `lucky-heavy` 등. | P1 |
| FR-027 | “AI가 패턴을 찾는 중” 같은 엔터테인먼트성 progress message를 제공한다. | P1 |

### 8.4 Agent 시스템

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-030 | LangChain + LangGraph 기반으로 `LottoRecommendationAgent` workflow를 구현한다. Python `langchain_nvidia_ai_endpoints.ChatNVIDIA` 사용을 기본으로 하며, TypeScript 구현은 동일 기능의 검증된 NVIDIA NIM LangChain integration이 있을 때만 허용한다. | P0 |
| FR-031 | Agent는 tool calling으로 통계/검증/후보 생성 함수를 호출한다. | P0 |
| FR-032 | LLM provider는 NVIDIA NIM을 기본값으로 사용하며 `NVIDIA_API_KEY`, `NVIDIA_MODEL=z-ai/glm-5.1`, temperature/top_p/max_tokens를 env/config로 주입한다. | P0 |
| FR-033 | LLM 출력은 structured output schema로 검증한다. Python은 Pydantic, TypeScript는 Zod를 사용한다. | P0 |
| FR-034 | LangGraph는 추천 요청을 상태(State), 노드(Nodes), 엣지(Edges)로 모델링하고 필요 시 checkpointing을 사용한다. | P0 |
| FR-035 | Langfuse callback 또는 metadata를 통해 요청 단위 trace를 남긴다. | P0 |
| FR-036 | trace에는 userId/sessionId가 없을 경우 anonymous sessionId를 사용한다. | P1 |

### 8.5 저장 및 당첨 확인

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-040 | 추천 조합을 저장할 수 있다. | P0 |
| FR-041 | 저장 조합에는 target draw number, createdAt, source, memo를 포함한다. | P0 |
| FR-042 | 최신 결과 발표 후 저장 조합의 당첨 여부를 계산한다. | P0 |
| FR-043 | 등수 계산 규칙을 서버 도메인 로직으로 구현하고 테스트한다. | P0 |
| FR-044 | 사용자가 직접 회차를 선택해서 과거 결과와 비교할 수 있다. | P1 |
| FR-045 | 추후 알림을 위해 “결과 확인 필요” 상태를 저장한다. | P2 |

### 8.6 구매 안내

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-050 | 공식 동행복권 URL로 이동하는 CTA를 제공한다. | P0 |
| FR-051 | CTA 전 “구매는 공식 사이트에서 직접 진행해야 함” 고지를 표시한다. | P0 |
| FR-052 | 선택 번호를 복사 가능한 텍스트로 제공한다. | P0 |
| FR-053 | 19세 미만 구매 금지 및 과몰입 방지 문구를 표시한다. | P0 |
| FR-054 | 공식 사이트 변경 가능성을 고려해 URL을 env/config로 관리한다. | P1 |

---

## 9. 추천 로직 설계

### 9.1 핵심 원칙

로또 추첨은 독립 사건이므로 과거 번호가 미래 확률을 높인다고 주장하면 안 된다. 추천 엔진은 다음처럼 표현한다.

- 금지: “이 번호가 당첨 확률이 높습니다.”
- 허용: “과거 패턴을 재미로 참고해 균형 잡힌 조합을 만들었어요.”

### 9.2 Candidate Generation

입력:

- `luckyNumbers: number[]`
- `count: 1..5`
- `excludeHistoricalWinners: true`
- `strategyMix`

출력:

- `combinations: LottoCombination[]`

기본 알고리즘:

1. `luckyNumbers` 검증
2. 후보 pool = 1..45에서 luckyNumbers 제외
3. 전략별 score function 생성
   - 홀짝 균형: 3:3 또는 2:4/4:2 선호
   - 저/중/고 구간: 1~15, 16~30, 31~45 분포 균형
   - 합계 범위: 과거 조합 합계의 10~90 percentile 안쪽 선호
   - 연속 번호 과다 회피
   - 동일 끝수 과다 회피
   - 과거 출현 빈도 기반 hot/cold 혼합
4. 후보 조합 생성
5. 과거 1등 조합 exact match 제거
6. 같은 요청 내 중복 제거
7. LLM이 조합별 “재미있는 설명”을 생성

### 9.3 LLM 역할 제한

LLM은 최종 숫자를 단독 결정하지 않는다.

- Deterministic service가 후보를 생성/검증한다.
- LLM은 후보 조합을 평가하고 설명을 작성한다.
- LLM 출력이 schema 검증에 실패하면 fallback 설명을 사용한다.

---

## 10. Agent 설계

### 10.1 Agent 이름

`LottoRecommendationAgent`

### 10.2 Tools

| Tool | 설명 |
|---|---|
| `get_latest_draw_results` | 최신 회차와 저장된 당첨번호 요약 반환 |
| `compute_lotto_statistics` | 빈도, 구간, 홀짝, 합계, 연속수 등 통계 feature 반환 |
| `generate_candidate_combinations` | 검증된 후보 조합 생성 |
| `validate_combination` | 범위/중복/과거 당첨 조합 exact match 검사 |
| `save_recommendation` | 사용자가 선택한 추천 조합 저장 |

### 10.3 Structured Output Schema

TypeScript/Zod 또는 Python/Pydantic으로 동일 계약을 강제한다. 개념 schema는 다음과 같다.

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

기본 LLM provider는 NVIDIA NIM API와 `z-ai/glm-5.1` 모델이다. API key는 절대 코드에 하드코딩하지 않고 `NVIDIA_API_KEY` 환경 변수에서 읽는다.

Python Agent runtime의 기준 초기화 예시는 다음과 같다.

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

구현 요구사항:

- `NVIDIA_API_KEY`가 없으면 Agent startup 또는 첫 호출에서 명확한 설정 오류를 반환한다.
- 기본 모델은 `z-ai/glm-5.1`이며 `.env`로만 override한다.
- temperature `1`, top_p `1`, max_tokens `16384`를 기본값으로 둔다.
- LLM 장애, timeout, rate limit 발생 시 deterministic fallback 추천을 사용하고 Langfuse에 `fallbackUsed=true`를 기록한다.
- LLM은 추천 숫자의 단독 결정권을 갖지 않는다. deterministic 후보 생성/검증 이후 설명과 ranking 보조에만 사용한다.

### 10.5 LangChain / LangGraph / Langfuse 사용 지침

현재 LangChain 문서 기준으로 이 PRD의 구현은 다음 원칙을 따른다.

- **LangChain**: model, prompt, tools, structured output을 연결하는 Agent layer로 사용한다. Tool schema는 명시적으로 정의하고, 추천 응답은 structured output으로 검증한다.
- **LangGraph**: 단순 1회 LLM 호출이 아니라 `load_draw_data -> compute_statistics -> generate_candidates -> validate_candidates -> llm_explain -> persist/return`처럼 상태가 있는 다단계 workflow를 State/Nodes/Edges로 모델링한다. 장기 실행, retry, streaming, checkpointing이 필요한 부분은 LangGraph 책임으로 둔다.
- **Langfuse**: LangChain callback handler 또는 invoke metadata로 trace를 남긴다. 요청마다 `runName`, `tags`, `langfuseSessionId`/anonymous session, `targetDrawNo`, `fallbackUsed` 등을 기록한다.
- **계약 우선**: Agent output schema가 깨지면 retry 후 fallback 설명을 사용한다. UI/API는 schema 검증을 통과한 결과만 받는다.

### 10.6 UX 메시지 예시

- “기존 로또번호들의 패턴을 AI가 분석해서 찾아보고 있어요... 비과학이라고요? 하지만 재밌잖아요!”
- “행운의 번호는 고정하고, 나머지는 과거 조합과 겹치지 않게 섞는 중이에요.”
- “이 추천은 오락용이에요. 로또는 무작위 추첨이며 당첨을 보장하지 않습니다.”

---

## 11. 정보 구조 및 화면

### 11.1 화면 목록

1. **Home / Generator**
   - 행운의 번호 입력
   - 추천 개수 선택
   - 책임 고지
   - 추천 생성 버튼

2. **Recommendation Result**
   - 추천 조합 카드
   - 조합별 태그/설명
   - 저장 버튼
   - 복사 버튼
   - 공식 사이트 구매 안내 CTA

3. **Saved Numbers**
   - 저장한 번호 목록
   - target 회차
   - 결과 상태: pending / checked / won / lost

4. **Draw Results**
   - 최신 회차 당첨번호
   - 동기화 시각
   - 과거 회차 검색

5. **Check Result**
   - 저장 조합과 당첨번호 비교
   - 일치 번호 highlight
   - 등수/보너스 번호 여부

6. **Developer / Traces (local only)**
   - Langfuse trace link
   - Agent request id
   - fallback 발생 여부

---

## 12. 시스템 아키텍처

### 12.1 권장 구조

초기에는 Web/API는 TypeScript를 유지하되, NVIDIA `ChatNVIDIA` 예시를 그대로 활용하기 위해 Agent runtime은 Python 패키지로 분리하는 hybrid monorepo를 권장한다. TypeScript-only 구현을 선택할 경우 NVIDIA NIM LangChain integration parity를 먼저 검증해야 한다.

```txt
lotto-ai/
  apps/
    web/                 # localhost Web UI (TypeScript)
    api/                 # HTTP API server / BFF (TypeScript or Python)
    agent/               # Python LangChain + LangGraph service using ChatNVIDIA
  packages/
    core/                # 도메인 로직: 조합, 등수 계산, 통계
    data/                # DB schema, repositories, result provider
    shared/              # DTO, Zod/Pydantic schemas, OpenAPI types
  docs/
    PRD.md
  .env.example
```

### 12.2 Android 전환 대비

- Web UI는 API client일 뿐이어야 한다.
- 추천 생성/저장/당첨 확인 로직은 서버 API와 `packages/core`에 둔다.
- API contract는 OpenAPI 또는 typed RPC로 명확히 정의한다.
- Android 앱은 나중에 같은 API를 호출한다.
- local-only MVP라면 SQLite를 사용하되 repository interface로 감싼다.

### 12.3 권장 기술 스택

| Layer | MVP 제안 |
|---|---|
| Language | TypeScript(Web/API) + Python(Agent 권장) |
| Web | Next.js 또는 Vite React |
| API | Fastify/Hono 또는 FastAPI |
| Agent Orchestration | LangChain + LangGraph |
| LLM Provider | NVIDIA NIM API / `z-ai/glm-5.1` |
| Validation | Zod(TypeScript) + Pydantic(Python Agent) |
| DB | SQLite |
| ORM | Drizzle 또는 Prisma |
| Tracing | Langfuse |
| Tests | Vitest |
| Scheduling | node-cron 또는 API-triggered sync |

---

## 13. API 초안

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
      "explanation": "행운의 번호 3, 7, 21을 고정하고...",
      "disclaimer": "오락용 추천이며 당첨을 보장하지 않습니다."
    }
  ]
}
```

---

## 14. 데이터 모델 초안

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

## 15. 등수 계산 규칙

| Rank | 조건 |
|---|---|
| 1등 | 6개 번호 일치 |
| 2등 | 5개 번호 일치 + 보너스 번호 일치 |
| 3등 | 5개 번호 일치 |
| 4등 | 4개 번호 일치 |
| 5등 | 3개 번호 일치 |
| 낙첨 | 그 외 |

---

## 16. 환경 변수

`.env.example`에 포함한다.

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

## 17. 관측성 요구사항

Langfuse trace에 다음 metadata를 남긴다.

- `requestId`
- `targetDrawNo`
- `luckyNumbersCount`
- `recommendationCount`
- `dataLatestDrawNo`
- `candidateGenerationStrategy`
- `fallbackUsed`
- `validationFailures`
- `anonymousSessionId`

LangChain/Langfuse 통합은 JS/TS의 경우 `@langfuse/langchain` CallbackHandler 또는 LangChain invoke metadata를 사용하고, Python Agent 구현은 Langfuse의 Python/LangChain integration에 맞춰 동일한 trace contract를 유지한다. Agent 실행 단위에는 `runName`, `tags`, `langfuseSessionId`, `langfuseUserId`(있을 때만)를 설정한다. LangGraph node 이름은 trace span 이름에 반영한다.

---

## 18. 안전/정책/법적 UX

모든 추천 결과와 구매 CTA 근처에 다음 문구를 표시한다.

> 이 서비스는 오락용 번호 추천 도구입니다. 로또 추첨은 무작위이며, AI 분석은 당첨을 예측하거나 보장하지 않습니다. 복권은 만 19세 이상만 구매할 수 있으며, 과도한 구매를 지양해 주세요.

구매 CTA 클릭 전 modal:

- “공식 동행복권 사이트로 이동합니다.”
- “로그인, 예치금 충전, 구매 확정은 사용자가 직접 진행해야 합니다.”
- “이 앱은 구매를 자동으로 수행하지 않습니다.”

---

## 19. 성공 지표

### MVP 기능 지표

- 추천 생성 성공률 ≥ 95%
- LLM 실패 시 fallback 성공률 100%
- 과거 당첨 조합 exact duplicate 0건
- 등수 계산 unit test coverage: 핵심 로직 100%
- 최신 결과 동기화 실패 시 사용자에게 명확한 상태 표시

### UX 지표

- 첫 추천 생성까지 30초 이내
- 저장 조합 당첨 확인까지 3 클릭 이내
- 구매 안내 CTA 전 책임 고지 노출률 100%

---

## 20. 테스트 요구사항

### Unit Tests

- 번호 범위 검증
- 행운의 번호 0개/1개/6개/7개 케이스
- 과거 당첨 조합 exact match 배제
- 추천 조합 중복 배제
- 등수 계산: 1등~5등/낙첨/보너스 일치
- LLM schema parse 실패 fallback

### Integration Tests

- `POST /api/recommendations`
- `POST /api/recommendations/:id/check`
- draw result provider mock 성공/실패
- Langfuse disabled 상태에서도 서비스 정상 동작

### E2E Smoke

1. 행운의 번호 `[7, 11]` 입력
2. 5개 조합 추천
3. 1개 저장
4. 최신 결과 동기화
5. 당첨 확인
6. 구매 안내 CTA modal 확인

---

## 21. 구현 단계

### Phase 0: Bootstrap

- TS monorepo 생성
- web/api/core/agent/data/shared 패키지 구성
- lint/typecheck/test 설정
- `.env.example` 작성

### Phase 1: Core Domain

- Lotto number validation
- Combination generation
- Historical duplicate check
- Rank calculation
- Vitest unit tests

### Phase 2: Data Layer

- SQLite schema
- Draw result repository
- Result provider interface
- Manual seed/import path

### Phase 3: Agent

- NVIDIA NIM `ChatNVIDIA` provider 구성 (`z-ai/glm-5.1`)
- LangChain tools 구현
- LangGraph State/Nodes/Edges workflow 구성
- structured output schema(Pydantic/Zod)
- fallback path
- Langfuse tracing

### Phase 4: API

- recommendation endpoints
- draw endpoints
- result check endpoints
- config/purchase-guide endpoint

### Phase 5: Web UI

- Generator page
- Result cards
- Saved numbers
- Check result
- Purchase guide modal

### Phase 6: Hardening

- error states
- data sync resilience
- trace dashboard link
- documentation

---

## 22. 코딩 에이전트용 Definition of Done

- [ ] `.env.example`가 존재하고 NVIDIA NIM LLM/Langfuse/DB/동행복권 URL 설정을 포함한다.
- [ ] `NVIDIA_API_KEY`와 `NVIDIA_MODEL=z-ai/glm-5.1` 기준 Agent 실행 경로가 문서화되어 있다.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`가 통과한다.
- [ ] 행운의 번호 포함 추천이 동작한다.
- [ ] 추천 조합은 과거 1등 당첨 조합과 exact match 되지 않는다.
- [ ] LLM disabled/failure 상태에서도 fallback 추천이 동작한다.
- [ ] LangGraph workflow node별 실행과 Langfuse trace가 local/dev 환경에서 확인 가능하다.
- [ ] 저장 조합의 당첨 여부 계산이 등수별 테스트로 검증된다.
- [ ] 구매 CTA는 자동 구매 없이 공식 사이트 안내만 수행한다.
- [ ] UI에 오락용/비보장/19세 이상 책임 문구가 노출된다.
- [ ] Android 전환을 방해하는 Web-only 도메인 결합이 없다.

---

## 23. 추가 아이디어 Backlog

| Idea | 설명 | 우선순위 |
|---|---|---|
| QR/이미지 저장 | 추천 조합을 이미지 카드로 저장/공유 | P2 |
| 테마 추천 | 생일파티형, 균형형, 반전형, 완전랜덤형 | P2 |
| 가족 번호 프로필 | 자주 쓰는 행운의 번호 세트 저장 | P2 |
| 회차 알림 | 토요일 밤/일요일 오전 결과 확인 알림 | P2 |
| 통계 놀이터 | 번호별 빈도, 미출현 기간, 구간 분포 시각화 | P2 |
| 책임 구매 모드 | 주간 구매 예산 reminder | P1 |
| 공식 확인 deep link | 회차별 결과 페이지로 이동 | P1 |
| Android 준비 | OpenAPI client generation, push notification 설계 | P2 |
| Prompt playground | local dev에서 prompt/trace 비교 | P2 |

---

## 24. References

- 동행복권 메인/공식 메뉴: https://www.dhlottery.co.kr/
- 동행복권 로또6/45 소개: https://www.dhlottery.co.kr/lt645/intro
- 동행복권 로또6/45 추첨결과: https://www.dhlottery.co.kr/lt645/result
- 동행복권 이용안내: https://www.dhlottery.co.kr/userGuide
- LangChain docs: https://docs.langchain.com/
- LangChain JS docs: https://docs.langchain.com/oss/javascript/
- LangChain structured output: https://docs.langchain.com/oss/javascript/langchain/structured-output
- LangGraph JS docs: https://docs.langchain.com/oss/javascript/langgraph/overview
- LangGraph workflows/agents: https://docs.langchain.com/oss/javascript/langgraph/workflows-agents
- Langfuse LangChain integration: https://langfuse.com/docs/integrations/frameworks/langchain
- Langfuse environments: https://langfuse.com/docs/observability/features/environments
- NVIDIA NIM APIs: https://build.nvidia.com/
