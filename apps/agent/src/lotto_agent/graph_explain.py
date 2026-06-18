import json
import re
from typing import Any, TypedDict
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ValidationError
from .fallback import fallback_for
from .llm import call_nim_with_optional_fallback
from .model_utils import numbers_from_combination
from .schemas_generated import ExplainRequest, ExplainResponse, PerCombinationItem
from .tracing import Trace

NODE_NAMES = ["receive_context", "llm_explain", "structure_output", "fallback"]

class LlmCombination(BaseModel):
    id: str
    explanation: str
    tagNarration: str

class LlmExplainPayload(BaseModel):
    perCombination: list[LlmCombination]
    analysisSummary: str

class ExplainState(TypedDict, total=False):
    request: ExplainRequest
    prompt: str
    llm_text: str
    response: ExplainResponse
    error: str
    spans: list[str]
    secondary_model_used: bool
    trace: Trace

def _append(state: ExplainState, name: str) -> list[str]:
    return [*(state.get("spans") or []), name]

def _strip_code_fences(text: str) -> str:
    """Unwrap a ```json ... ``` (or bare ```) markdown fence so model_validate_json succeeds.

    Models often return fenced JSON even when asked for raw JSON; stripping the fence before
    validation avoids a spurious fallback. Plain JSON passes through unchanged.
    """
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```[A-Za-z0-9_-]*\s*\n?", "", stripped)
        stripped = re.sub(r"\n?\s*```\s*$", "", stripped)
    return stripped.strip()

def _fallback_response(req: ExplainRequest, summary: str = "Deterministic fallback explanations used.") -> ExplainResponse:
    return ExplainResponse(
        perCombination=[
            PerCombinationItem(
                id=c.id,
                explanation=fallback_for(numbers_from_combination(c.numbers), c.tags, req.luckyNumbers)[0],
                tagNarration=fallback_for(numbers_from_combination(c.numbers), c.tags, req.luckyNumbers)[1],
            )
            for c in req.combinations
        ],
        analysisSummary=summary,
        fallbackUsed=True,
    )

def _json_prompt(req: ExplainRequest) -> str:
    return json.dumps(
        {
            "instruction": "Return ONLY JSON with perCombination[{id,explanation,tagNarration}] and analysisSummary. Do not change numbers or ids.",
            "targetDrawNo": req.targetDrawNo,
            "luckyNumbers": req.luckyNumbers,
            "combinations": [
                {"id": c.id, "numbers": numbers_from_combination(c.numbers), "tags": c.tags, "stats": c.stats}
                for c in req.combinations
            ],
        },
        ensure_ascii=False,
    )

def receive_context(state: ExplainState) -> ExplainState:
    req = state["request"]
    trace = Trace("agent_explain", {"targetDrawNo": req.targetDrawNo, "requestId": req.requestId}, trace_id=req.traceId)
    with trace.span("receive_context"):
        prompt = _json_prompt(req)
    return {"prompt": prompt, "spans": _append(state, "receive_context"), "trace": trace}

async def llm_explain(state: ExplainState) -> ExplainState:
    trace = state["trace"]
    with trace.span("llm_explain"):
        last_error = "unknown"
        for _attempt in range(2):
            try:
                text, secondary = await call_nim_with_optional_fallback(state["prompt"])
                payload = LlmExplainPayload.model_validate_json(_strip_code_fences(text))
                if not _payload_has_exact_ids(state["request"], payload):
                    raise ValueError("LLM output id mismatch")
                return {"llm_text": text, "secondary_model_used": secondary, "spans": _append(state, "llm_explain")}
            except (ValidationError, ValueError, json.JSONDecodeError) as exc:
                last_error = type(exc).__name__
            except Exception as exc:
                return {"error": type(exc).__name__, "spans": _append(state, "llm_explain")}
        return {"error": last_error, "spans": _append(state, "llm_explain")}

def route_after_llm(state: ExplainState) -> str:
    return "fallback" if state.get("error") else "structure_output"

def _payload_has_exact_ids(req: ExplainRequest, payload: LlmExplainPayload) -> bool:
    expected_ids = [c.id for c in req.combinations]
    actual_ids = [item.id for item in payload.perCombination]
    if len(actual_ids) != len(expected_ids):
        return False
    if len(set(actual_ids)) != len(actual_ids) or len(set(expected_ids)) != len(expected_ids):
        return False
    return set(expected_ids) == set(actual_ids)

def structure_output(state: ExplainState) -> ExplainState:
    req = state["request"]
    trace = state["trace"]
    with trace.span("structure_output", {"fallbackUsed": False, "secondaryModelUsed": bool(state.get("secondary_model_used"))}):
        payload = LlmExplainPayload.model_validate_json(_strip_code_fences(state["llm_text"]))
        if not _payload_has_exact_ids(req, payload):
            raise ValueError("LLM output id mismatch")
        response = ExplainResponse(
            perCombination=[PerCombinationItem(**item.model_dump()) for item in payload.perCombination],
            analysisSummary=payload.analysisSummary,
            fallbackUsed=False,
        )
    trace.flush()
    return {"response": response, "spans": _append(state, "structure_output")}

def fallback_node(state: ExplainState) -> ExplainState:
    req = state["request"]
    trace = state["trace"]
    with trace.span("fallback", {"fallbackUsed": True, "error": state.get("error")}):
        response = _fallback_response(req, f"LLM unavailable or invalid; fallback used ({state.get('error', 'unknown')}).")
    trace.flush()
    return {"response": response, "spans": _append(state, "fallback")}

def build_explain_graph():
    workflow = StateGraph(ExplainState)
    workflow.add_node("receive_context", receive_context)
    workflow.add_node("llm_explain", llm_explain)
    workflow.add_node("structure_output", structure_output)
    workflow.add_node("fallback", fallback_node)
    workflow.add_edge(START, "receive_context")
    workflow.add_edge("receive_context", "llm_explain")
    workflow.add_conditional_edges("llm_explain", route_after_llm, {"structure_output": "structure_output", "fallback": "fallback"})
    workflow.add_edge("structure_output", END)
    workflow.add_edge("fallback", END)
    return workflow.compile()

_EXPLAIN_GRAPH = build_explain_graph()

async def explain(req: ExplainRequest) -> ExplainResponse:
    for combination in req.combinations:
        numbers_from_combination(combination.numbers)
    if not req.combinations:
        return ExplainResponse(perCombination=[], analysisSummary="No combinations to explain.", fallbackUsed=False)
    state: dict[str, Any] = await _EXPLAIN_GRAPH.ainvoke({"request": req, "spans": []})
    return state["response"]
