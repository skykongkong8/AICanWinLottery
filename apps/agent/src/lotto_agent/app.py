import os
import uvicorn
from fastapi import FastAPI
from .graph_explain import explain
from .graph_run import run_dev_graph
from .schemas_generated import ExplainRequest, ExplainResponse
app = FastAPI(title="AICanWinLottery Agent")
@app.get("/health")
def health():
    return {"ok": True, "service": "agent"}
@app.post("/explain", response_model=ExplainResponse)
async def explain_route(req: ExplainRequest):
    return await explain(req)
@app.post("/run")
async def run_route(payload: dict):
    return await run_dev_graph(payload)
if __name__ == "__main__":
    uvicorn.run("lotto_agent.app:app", host="0.0.0.0", port=int(os.getenv("AGENT_PORT", "8000")), reload=False)
