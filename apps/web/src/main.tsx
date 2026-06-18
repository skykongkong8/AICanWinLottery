import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DISCLAIMER, GAME_PRICE_KRW, OFFICIAL_ONLINE_LIMIT_KRW, RESPONSIBLE_USE_COPY, type RecommendationResponse, type ResultCheck } from "@lotto/shared";
import { checkSaved, recommend, save } from "./api-client.js";
import "./style.css";

type SavedUi = { id: string; numbers: number[]; targetDrawNo: number; check?: ResultCheck };

function App() {
  const [lucky, setLucky] = useState("7,11");
  const [count, setCount] = useState(5);
  const [result, setResult] = useState<RecommendationResponse | null>(null);
  const [saved, setSaved] = useState<SavedUi[]>([]);
  const [message, setMessage] = useState("");
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  async function run() {
    setMessage("Generating entertainment-only picks...");
    const nums = lucky.split(/[,\s]+/).filter(Boolean).map(Number);
    const r = await recommend(nums, count);
    setResult(r);
    setMessage(r.fallbackUsed ? "Generated with deterministic fallback explanations." : "Generated with agent explanations.");
  }

  async function savePick(numbers: number[]) {
    if (!result) return;
    const response = await save({ requestId: result.requestId, traceId: result.traceId, targetDrawNo: result.targetDrawNo, combinations: [numbers], fallbackUsed: result.fallbackUsed });
    setSaved((prev) => [...response.saved.map((row) => ({ id: row.id, numbers: row.numbers, targetDrawNo: row.targetDrawNo })), ...prev]);
    setMessage("Saved selected combination for result checking.");
  }

  async function checkPick(row: SavedUi) {
    const check = await checkSaved(row.id);
    setSaved((prev) => prev.map((item) => item.id === row.id ? { ...item, check } : item));
    setMessage(`Checked saved pick: ${check.rank}`);
  }

  return <main>
    <header>
      <p className="eyebrow">Entertainment-only Korean Lotto 6/45 assistant</p>
      <h1>Korean Lotto AI</h1>
      <p className="warning">{DISCLAIMER}</p>
    </header>

    <section aria-labelledby="generator-title">
      <h2 id="generator-title">Generator</h2>
      <label>Lucky numbers <input value={lucky} onChange={e=>setLucky(e.target.value)} placeholder="7, 11" /></label>
      <label>Count <input type="number" min={1} max={5} value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
      <button onClick={run}>Recommend</button>
      <p>{message}</p>
    </section>

    {result && <section aria-labelledby="results-title">
      <h2 id="results-title">Result for draw {result.targetDrawNo}</h2>
      <p>{result.feasibility.message ?? "All requested combinations were generated."}</p>
      <p><strong>Trace:</strong> {result.requestId} / {result.traceId ?? "Langfuse disabled"}</p>
      <p><strong>Data freshness:</strong> {result.freshness.syncStatus} (latest synced draw {result.freshness.latestSyncedDrawNo}){result.freshness.syncErrorKind ? ` — ${result.freshness.syncErrorKind}` : ""}</p>
      {result.recommendations.map(r=><article key={r.id}>
        <h3>{r.numbers.join(" · ")}</h3>
        <p>{r.explanation}</p>
        <p>{r.tagNarration}</p>
        <button onClick={()=>navigator.clipboard.writeText(r.numbers.join(", "))}>Copy numbers</button>
        <button onClick={()=>savePick(r.numbers)}>Save this pick</button>
      </article>)}
      <button className="secondary" onClick={()=>setPurchaseOpen(true)}>Official purchase guide (19+, no automation)</button>
    </section>}

    <section aria-labelledby="saved-title">
      <h2 id="saved-title">Saved / Result tracking</h2>
      {saved.length === 0 ? <p>No saved picks yet. Save a generated combination to check it after sync.</p> : saved.map(row => <article key={row.id}>
        <h3>{row.numbers.join(" · ")}</h3>
        <p>Target draw {row.targetDrawNo}</p>
        <button onClick={()=>checkPick(row)}>Check against synced draw</button>
        {row.check && <p><strong>{row.check.rank}</strong> — matched {row.check.matchedNumbers.join(", ") || "none"}; bonus {row.check.bonusMatched ? "matched" : "not matched"}</p>}
      </article>)}
    </section>

    <section aria-labelledby="developer-title">
      <h2 id="developer-title">Developer / Traces</h2>
      <p>Hot path: API owns numbers and calls the agent once for prose. Agent/LLM failures return deterministic explanations with <code>fallbackUsed=true</code>.</p>
      <code>{result ? JSON.stringify({ requestId: result.requestId, traceId: result.traceId, fallbackUsed: result.fallbackUsed }, null, 2) : "No request yet"}</code>
    </section>

    {purchaseOpen && <dialog open>
      <h2>Responsible purchase guide</h2>
      <p>{RESPONSIBLE_USE_COPY}</p>
      <ul>
        <li>Adults 19+ only.</li>
        <li>Official price: KRW {GAME_PRICE_KRW.toLocaleString()} per game.</li>
        <li>Official online purchase limit: KRW {OFFICIAL_ONLINE_LIMIT_KRW.toLocaleString()} per draw.</li>
        <li>This app never logs in, pays, deposits, or clicks purchase for you.</li>
      </ul>
      <button onClick={()=>window.open(import.meta.env.VITE_OFFICIAL_PURCHASE_URL ?? "https://ol.dhlottery.co.kr/olotto/game/game645.do", "_blank", "noopener")}>Open official site</button>
      <button className="secondary" onClick={()=>setPurchaseOpen(false)}>Close</button>
    </dialog>}

    <footer>{RESPONSIBLE_USE_COPY}</footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App/>);
