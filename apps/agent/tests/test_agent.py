import json
from pathlib import Path
import pytest
from pydantic import ValidationError
from lotto_agent.graph_explain import NODE_NAMES, explain
from lotto_agent.graph_run import run_dev_graph
from lotto_agent.model_utils import numbers_from_combination
from lotto_agent.schemas_generated import ExplainRequest, ExplainResponse

FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "shared" / "fixtures"

@pytest.mark.asyncio
async def test_explain_falls_back_without_nim(monkeypatch):
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    monkeypatch.delenv("NVIDIA_NIM_KEY", raising=False)
    monkeypatch.setenv("NVIDIA_NIM_KEY_FILE", "/tmp/nonexistent-nim-key")
    req = ExplainRequest(requestId="r", traceId=None, combinations=[{"id":"rec_1","numbers":[1,2,3,4,5,6],"tags":["balanced"],"stats":{"sum":21}}], stats={}, luckyNumbers=[1], targetDrawNo=10)
    res = await explain(req)
    assert res.fallbackUsed is True
    assert res.perCombination[0].id == "rec_1"
    assert "fallback" in NODE_NAMES

@pytest.mark.asyncio
async def test_malformed_llm_output_retries_then_falls_back(monkeypatch):
    calls = 0
    async def malformed(_prompt):
        nonlocal calls
        calls += 1
        return "not json", False
    monkeypatch.setattr("lotto_agent.graph_explain.call_nim_with_optional_fallback", malformed)
    req = ExplainRequest(**json.loads((FIXTURES / "explain-request.json").read_text()))
    res = await explain(req)
    assert calls == 2
    assert res.fallbackUsed is True

@pytest.mark.asyncio
async def test_dev_graph_calls_internal_tools(monkeypatch):
    async def fake_draws(limit=10):
        return {"draws": []}
    async def fake_stats():
        return {"latestDrawNo": 3, "historicalDraws": 3}
    async def fake_generate(payload):
        return {"recommendations": [{"numbers": [1,2,3,4,5,6]}], "payload": payload}
    async def fake_validate(combinations):
        return {"valid": True, "results": combinations}
    monkeypatch.setattr("lotto_agent.graph_run.latest_draws", fake_draws)
    monkeypatch.setattr("lotto_agent.graph_run.latest_statistics", fake_stats)
    monkeypatch.setattr("lotto_agent.graph_run.api_generate_candidates", fake_generate)
    monkeypatch.setattr("lotto_agent.graph_run.api_validate_candidates", fake_validate)
    res = await run_dev_graph({"luckyNumbers": [7, 11], "count": 1})
    assert res["spans"] == ["load_draw_data", "compute_statistics", "generate_candidates", "validate_candidates", "llm_explain", "return"]
    assert res["validation"]["valid"] is True

def test_generated_contract_model_accepts_shared_fixture():
    req = ExplainRequest(**json.loads((FIXTURES / "explain-request.json").read_text()))
    res = ExplainResponse(**json.loads((FIXTURES / "explain-response.json").read_text()))
    assert numbers_from_combination(req.combinations[0].numbers) == [1,2,3,4,5,6]
    assert res.perCombination[0].id == "rec_1"

def test_generated_contract_rejects_out_of_range_and_nonascending():
    bad = json.loads((FIXTURES / "explain-request.json").read_text())
    bad["combinations"][0]["numbers"] = [1,2,3,4,5,99]
    with pytest.raises(ValidationError):
        ExplainRequest(**bad)
    bad = json.loads((FIXTURES / "explain-request.json").read_text())
    bad["combinations"][0]["numbers"] = [1,2,3,4,6,5]
    with pytest.raises(ValidationError):
        ExplainRequest(**bad)

def _valid_llm_payload(req: ExplainRequest) -> dict:
    return {
        "perCombination": [
            {"id": c.id, "explanation": "Live-shaped explanation.", "tagNarration": "Live-shaped narration."}
            for c in req.combinations
        ],
        "analysisSummary": "Live-shaped summary.",
    }

@pytest.mark.asyncio
@pytest.mark.parametrize("wrap", [
    lambda body: "```json\n" + body + "\n```",   # fenced with language tag (M8 fence strip)
    lambda body: "```\n" + body + "\n```",         # bare fence
    lambda body: body,                              # plain JSON still parses
])
async def test_llm_json_variants_parse_without_fallback(monkeypatch, wrap):
    req = ExplainRequest(**json.loads((FIXTURES / "explain-request.json").read_text()))
    text = wrap(json.dumps(_valid_llm_payload(req)))
    async def stub(_prompt):
        return text, False
    monkeypatch.setattr("lotto_agent.graph_explain.call_nim_with_optional_fallback", stub)
    res = await explain(req)
    assert res.fallbackUsed is False
    assert [p.id for p in res.perCombination] == [c.id for c in req.combinations]
    assert res.perCombination[0].explanation == "Live-shaped explanation."

def test_lotto_combination_codegen_round_trip_and_rejects_nonascending():
    # Defense-in-depth over the codegen fail-loud anchor: the generated model must keep the nested
    # .root shape model_utils consumes AND enforce the injected ascending/unique invariant.
    from lotto_agent.schemas_generated import LottoCombination
    combo = LottoCombination.model_validate([1, 2, 3, 4, 5, 6])
    assert numbers_from_combination(combo) == [1, 2, 3, 4, 5, 6]
    with pytest.raises(ValidationError):
        LottoCombination.model_validate([1, 2, 3, 4, 6, 5])

def test_trace_adopts_request_trace_id_as_identity():
    from lotto_agent.tracing import Trace
    from lotto_agent.graph_explain import receive_context
    # Direct construction adopts the API-issued id as the trace's own identity.
    t = Trace("agent_explain", {}, trace_id="11111111-2222-3333-4444-555555555555")
    assert t.trace_id == "11111111-2222-3333-4444-555555555555"
    # And it is wired through the graph's first node from req.traceId.
    req = ExplainRequest(requestId="r", traceId="abcdef00-0000-4000-8000-000000000abc", combinations=[{"id": "rec_1", "numbers": [1, 2, 3, 4, 5, 6], "tags": ["balanced"], "stats": {}}], stats={}, luckyNumbers=[1], targetDrawNo=10)
    out = receive_context({"request": req, "spans": []})
    assert out["trace"].trace_id == req.traceId
