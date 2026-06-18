from typing import Any, TypedDict
from langgraph.graph import END, START, StateGraph
from .tools.http_tools import generate_candidates as api_generate_candidates
from .tools.http_tools import latest_draws, latest_statistics
from .tools.http_tools import validate_candidates as api_validate_candidates

class RunState(TypedDict, total=False):
    input: dict[str, Any]
    draws: dict[str, Any]
    statistics: dict[str, Any]
    generated: dict[str, Any]
    validation: dict[str, Any]
    explanation: str
    spans: list[str]
    fallbackUsed: bool

def _append(state: RunState, name: str) -> list[str]:
    return [*(state.get("spans") or []), name]

async def load_draw_data(state: RunState) -> RunState:
    return {"draws": await latest_draws(), "spans": _append(state, "load_draw_data")}

async def compute_statistics(state: RunState) -> RunState:
    return {"statistics": await latest_statistics(), "spans": _append(state, "compute_statistics")}

async def generate_candidates(state: RunState) -> RunState:
    return {"generated": await api_generate_candidates(state.get("input") or {}), "spans": _append(state, "generate_candidates")}

async def validate_candidates(state: RunState) -> RunState:
    combinations = [item["numbers"] for item in state.get("generated", {}).get("recommendations", [])]
    return {"validation": await api_validate_candidates(combinations), "spans": _append(state, "validate_candidates")}

def llm_explain(state: RunState) -> RunState:
    return {"explanation": "Dev-path graph delegates generation/validation to API internal tools.", "fallbackUsed": True, "spans": _append(state, "llm_explain")}

def return_node(state: RunState) -> RunState:
    return {"spans": _append(state, "return")}

def build_run_graph():
    workflow = StateGraph(RunState)
    for name, node in [("load_draw_data", load_draw_data), ("compute_statistics", compute_statistics), ("generate_candidates", generate_candidates), ("validate_candidates", validate_candidates), ("llm_explain", llm_explain), ("return", return_node)]:
        workflow.add_node(name, node)
    workflow.add_edge(START, "load_draw_data")
    workflow.add_edge("load_draw_data", "compute_statistics")
    workflow.add_edge("compute_statistics", "generate_candidates")
    workflow.add_edge("generate_candidates", "validate_candidates")
    workflow.add_edge("validate_candidates", "llm_explain")
    workflow.add_edge("llm_explain", "return")
    workflow.add_edge("return", END)
    return workflow.compile()

_RUN_GRAPH = build_run_graph()

async def run_dev_graph(payload: dict):
    return await _RUN_GRAPH.ainvoke({"input": payload, "spans": []})
