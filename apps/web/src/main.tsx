import React, { type FormEvent, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DISCLAIMER,
  GAME_PRICE_KRW,
  OFFICIAL_ONLINE_LIMIT_KRW,
  RESPONSIBLE_USE_COPY,
  type Recommendation,
  type RecommendationResponse,
  type ResultCheck,
} from "@lotto/shared";
import { checkSaved, recommend, save } from "./api-client.js";
import "./style.css";

type SavedUi = { id: string; numbers: number[]; targetDrawNo: number; check?: ResultCheck };
type Tone = "gold" | "safety" | "success" | "neutral";

type StatusMessage = {
  tone: Tone;
  text: string;
};

const DEFAULT_OFFICIAL_PURCHASE_URL = "https://ol.dhlottery.co.kr/olotto/game/game645.do";

function parseLuckyNumbers(value: string) {
  return value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number)
    .filter((number) => Number.isFinite(number));
}

function formatNumbers(numbers: number[]) {
  return numbers.join(" · ");
}

function App() {
  const [lucky, setLucky] = useState("7,11");
  const [count, setCount] = useState(5);
  const [result, setResult] = useState<RecommendationResponse | null>(null);
  const [saved, setSaved] = useState<SavedUi[]>([]);
  const [message, setMessage] = useState<StatusMessage>({
    tone: "neutral",
    text: "Choose a few lucky anchors, then reveal entertainment-only recommendations.",
  });
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const luckyPreview = useMemo(() => parseLuckyNumbers(lucky), [lucky]);

  async function run(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const safeCount = Number.isFinite(count) ? Math.min(Math.max(Math.trunc(count), 1), 5) : 1;
    setCount(safeCount);
    setIsGenerating(true);
    setMessage({ tone: "gold", text: "Drawing the stage lights and generating entertainment-only picks..." });

    try {
      const recommendationResult = await recommend(luckyPreview, safeCount);
      setResult(recommendationResult);
      setMessage({
        tone: recommendationResult.fallbackUsed ? "safety" : "success",
        text: recommendationResult.fallbackUsed
          ? "Recommendations are ready with deterministic fallback explanations."
          : "Recommendations are ready with agent explanations.",
      });
    } catch (error) {
      setMessage({
        tone: "safety",
        text: error instanceof Error ? `Recommendation service unavailable: ${error.message}` : "Recommendation service unavailable. Please try again.",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyNumbers(numbers: number[]) {
    try {
      await navigator.clipboard.writeText(numbers.join(", "));
      setMessage({ tone: "success", text: `Copied ticket ${formatNumbers(numbers)} for manual use.` });
    } catch {
      setMessage({ tone: "safety", text: `Copy failed. Manually copy these numbers: ${numbers.join(", ")}.` });
    }
  }

  async function savePick(numbers: number[]) {
    if (!result) return;
    try {
      const response = await save({
        requestId: result.requestId,
        traceId: result.traceId,
        targetDrawNo: result.targetDrawNo,
        combinations: [numbers],
        fallbackUsed: result.fallbackUsed,
      });
      setSaved((prev) => [
        ...response.saved.map((row) => ({ id: row.id, numbers: row.numbers, targetDrawNo: row.targetDrawNo })),
        ...prev,
      ]);
      setMessage({ tone: "success", text: "Saved this pick for later result checking." });
    } catch (error) {
      setMessage({
        tone: "safety",
        text: error instanceof Error ? `Could not save this pick: ${error.message}` : "Could not save this pick. Please try again.",
      });
    }
  }

  async function checkPick(row: SavedUi) {
    try {
      const check = await checkSaved(row.id);
      setSaved((prev) => prev.map((item) => (item.id === row.id ? { ...item, check } : item)));
      setMessage({ tone: check.rank === "No Prize" ? "neutral" : "success", text: `Checked saved pick: ${check.rank}` });
    } catch (error) {
      setMessage({
        tone: "safety",
        text: error instanceof Error ? `Could not check this pick: ${error.message}` : "Could not check this pick. Please try again.",
      });
    }
  }

  return (
    <main className="app-shell">
      <Hero onOpenPurchaseGuide={() => setPurchaseOpen(true)} />

      <section className="experience-grid" aria-label="Lottery recommendation workspace">
        <GeneratorPanel
          count={count}
          isGenerating={isGenerating}
          lucky={lucky}
          luckyPreview={luckyPreview}
          message={message}
          onCountChange={setCount}
          onLuckyChange={setLucky}
          onSubmit={run}
        />

        <ResultsStage
          isGenerating={isGenerating}
          onCopy={copyNumbers}
          onOpenPurchaseGuide={() => setPurchaseOpen(true)}
          onSave={savePick}
          result={result}
        />
      </section>

      <SavedTickets onCheck={checkPick} saved={saved} />
      <IntegrityDetails result={result} />

      {purchaseOpen && <ResponsiblePurchaseDialog onClose={() => setPurchaseOpen(false)} />}

      <footer className="site-footer">
        <span>Responsible play reminder</span>
        <p>{RESPONSIBLE_USE_COPY}</p>
      </footer>
    </main>
  );
}

function Hero({ onOpenPurchaseGuide }: { onOpenPurchaseGuide: () => void }) {
  return (
    <header className="hero">
      <div className="hero__content">
        <p className="eyebrow">Golden Draw Night · Korean Lotto 6/45 assistant</p>
        <h1>Korean Lotto AI, redesigned as a responsible draw lounge.</h1>
        <p className="hero__lede">
          Generate readable, entertainment-only number tickets with transparent freshness, explanations, and manual-only purchase guidance.
        </p>
        <p className="warning">{DISCLAIMER}</p>
        <div className="trust-strip" aria-label="Responsible lottery safeguards">
          <TrustBadge tone="safety">No odds guarantee</TrustBadge>
          <TrustBadge tone="safety">No purchase automation</TrustBadge>
          <TrustBadge tone="gold">19+ official purchase only</TrustBadge>
          <TrustBadge tone="neutral">Manual copy flow</TrustBadge>
        </div>
        <button className="button button--ghost" type="button" onClick={onOpenPurchaseGuide}>
          Official purchase guide (19+, no automation)
        </button>
      </div>
      <div className="hero__ticket" aria-hidden="true">
        <div className="ticket-orbit">
          {[7, 11, 18, 29, 34, 42].map((number) => (
            <NumberBall key={number} number={number} />
          ))}
        </div>
        <p>Draw Night</p>
      </div>
    </header>
  );
}

function GeneratorPanel({
  count,
  isGenerating,
  lucky,
  luckyPreview,
  message,
  onCountChange,
  onLuckyChange,
  onSubmit,
}: {
  count: number;
  isGenerating: boolean;
  lucky: string;
  luckyPreview: number[];
  message: StatusMessage;
  onCountChange: (value: number) => void;
  onLuckyChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="panel generator-panel" aria-labelledby="generator-title">
      <div className="section-kicker">Ticket atelier</div>
      <h2 id="generator-title">Shape your draw ticket</h2>
      <p className="section-copy">
        Lucky-number input affordance: add optional 1–45 anchors separated by commas or spaces. The assistant fills the rest without claiming better odds.
      </p>

      <form className="ticket-form" onSubmit={onSubmit}>
        <label className="field" htmlFor="lucky-numbers">
          <span>Lucky numbers</span>
          <input
            id="lucky-numbers"
            inputMode="numeric"
            onChange={(event) => onLuckyChange(event.target.value)}
            placeholder="7, 11"
            value={lucky}
          />
          <small>Optional anchors between 1 and 45. Current anchors: {luckyPreview.length ? luckyPreview.join(", ") : "none"}.</small>
        </label>

        <label className="field" htmlFor="recommendation-count">
          <span>Count</span>
          <input
            id="recommendation-count"
            max={5}
            min={1}
            onChange={(event) => onCountChange(Number(event.target.value))}
            type="number"
            value={count}
          />
          <small>Count input affordance: reveal 1–5 tickets for this draw session.</small>
        </label>

        <button className="button button--primary" disabled={isGenerating} type="submit">
          {isGenerating ? "Revealing recommendations..." : "Reveal recommendations"}
        </button>
      </form>

      <div className={`status-card status-card--${message.tone}`} aria-live="polite">
        <span className="status-card__dot" />
        <p>{message.text}</p>
      </div>
    </section>
  );
}

function ResultsStage({
  isGenerating,
  onCopy,
  onOpenPurchaseGuide,
  onSave,
  result,
}: {
  isGenerating: boolean;
  onCopy: (numbers: number[]) => Promise<void>;
  onOpenPurchaseGuide: () => void;
  onSave: (numbers: number[]) => Promise<void>;
  result: RecommendationResponse | null;
}) {
  if (!result) {
    return (
      <section className="panel results-stage results-stage--empty" aria-labelledby="results-title">
        <div className="section-kicker">Draw stage</div>
        <h2 id="results-title">Recommendations wait behind the curtain</h2>
        <p>
          Your generated tickets will appear here with number balls, explanations, tag narration, Data freshness, and save/copy actions.
        </p>
        <div className={isGenerating ? "draw-line draw-line--active" : "draw-line"} aria-hidden="true" />
      </section>
    );
  }

  return (
    <section className="panel results-stage" aria-labelledby="results-title">
      <div className="results-stage__header">
        <div>
          <div className="section-kicker">Draw stage</div>
          <h2 id="results-title">Result for draw {result.targetDrawNo}</h2>
          <p>{result.feasibility.message ?? "All requested combinations were generated."}</p>
        </div>
        <TrustBadge tone={result.fallbackUsed ? "safety" : "success"}>
          {result.fallbackUsed ? "Fallback explanations" : "Agent explanations"}
        </TrustBadge>
      </div>

      <div className="freshness-card">
        <strong>Data freshness:</strong> {result.freshness.syncStatus} · latest synced draw {result.freshness.latestSyncedDrawNo}
        {result.freshness.syncErrorKind ? ` · ${result.freshness.syncErrorKind}` : ""}
      </div>

      {result.disclaimers.length > 0 && (
        <div className="disclaimer-stack" aria-label="Recommendation disclaimers">
          {result.disclaimers.map((disclaimer) => (
            <p key={disclaimer}>{disclaimer}</p>
          ))}
        </div>
      )}

      <div className="recommendation-grid">
        {result.recommendations.map((recommendation, index) => (
          <RecommendationTicket
            index={index}
            key={recommendation.id}
            onCopy={onCopy}
            onSave={onSave}
            recommendation={recommendation}
          />
        ))}
      </div>

      <button className="button button--secondary" onClick={onOpenPurchaseGuide} type="button">
        Official purchase guide (19+, no automation)
      </button>
    </section>
  );
}

function RecommendationTicket({
  index,
  onCopy,
  onSave,
  recommendation,
}: {
  index: number;
  onCopy: (numbers: number[]) => Promise<void>;
  onSave: (numbers: number[]) => Promise<void>;
  recommendation: Recommendation;
}) {
  return (
    <article className="ticket-card">
      <div className="ticket-card__topline">
        <span>Ticket {index + 1}</span>
        <span>{recommendation.tags.slice(0, 2).join(" · ") || "Balanced pick"}</span>
      </div>
      <h3 className="sr-only">Recommendation {index + 1}: {formatNumbers(recommendation.numbers)}</h3>
      <div className="number-row" aria-label={`Recommended numbers ${recommendation.numbers.join(", ")}`}>
        {recommendation.numbers.map((number) => (
          <NumberBall key={number} number={number} />
        ))}
      </div>
      <p>{recommendation.explanation}</p>
      <p className="tag-narration">{recommendation.tagNarration}</p>
      <div className="ticket-card__actions">
        <button className="button button--secondary" onClick={() => onCopy(recommendation.numbers)} type="button">
          Copy numbers
        </button>
        <button className="button button--primary" onClick={() => onSave(recommendation.numbers)} type="button">
          Save this pick
        </button>
      </div>
    </article>
  );
}

function SavedTickets({ onCheck, saved }: { onCheck: (row: SavedUi) => Promise<void>; saved: SavedUi[] }) {
  return (
    <section className="panel saved-panel" aria-labelledby="saved-title">
      <div className="section-kicker">After the draw</div>
      <h2 id="saved-title">Saved / Result tracking</h2>
      <p className="section-copy">Saved/result tracking affordance: keep manual picks here and check them against the synced draw result.</p>

      {saved.length === 0 ? (
        <div className="empty-state">
          <strong>No saved picks yet.</strong>
          <p>Save a generated combination to check it after sync.</p>
        </div>
      ) : (
        <div className="saved-grid">
          {saved.map((row) => (
            <article className="saved-card" key={row.id}>
              <div className="number-row number-row--compact" aria-label={`Saved numbers ${row.numbers.join(", ")}`}>
                {row.numbers.map((number) => (
                  <NumberBall key={number} number={number} />
                ))}
              </div>
              <p>Target draw {row.targetDrawNo}</p>
              <button className="button button--secondary" onClick={() => onCheck(row)} type="button">
                Check against synced draw
              </button>
              {row.check && (
                <p className="check-result">
                  <strong>{row.check.rank}</strong> — matched {row.check.matchedNumbers.join(", ") || "none"}; bonus{" "}
                  {row.check.bonusMatched ? "matched" : "not matched"}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function IntegrityDetails({ result }: { result: RecommendationResponse | null }) {
  const payload = result
    ? {
        requestId: result.requestId,
        traceId: result.traceId,
        fallbackUsed: result.fallbackUsed,
        freshness: result.freshness,
        feasibility: result.feasibility,
      }
    : "No request yet";

  return (
    <section className="panel integrity-panel" aria-labelledby="integrity-title">
      <div className="section-kicker">Trust console</div>
      <h2 id="integrity-title">Integrity details</h2>
      <p>
        Trace/integrity details affordance: API owns numbers and calls the agent once for prose. Agent/LLM failures return deterministic explanations with <code>fallbackUsed=true</code>.
      </p>
      <details>
        <summary>Show request, trace, fallback, and freshness details</summary>
        <p>
          <strong>Trace:</strong> {result ? `${result.requestId} / ${result.traceId ?? "Langfuse disabled"}` : "No request yet"}
        </p>
        <code>{JSON.stringify(payload, null, 2)}</code>
      </details>
    </section>
  );
}

function ResponsiblePurchaseDialog({ onClose }: { onClose: () => void }) {
  function openOfficialSite() {
    window.open(import.meta.env.VITE_OFFICIAL_PURCHASE_URL ?? DEFAULT_OFFICIAL_PURCHASE_URL, "_blank", "noopener");
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <dialog aria-labelledby="purchase-title" className="purchase-dialog" open>
        <div className="dialog-header">
          <div>
            <div className="section-kicker">Responsible purchase guide</div>
            <h2 id="purchase-title">Manual purchase boundaries</h2>
          </div>
          <button aria-label="Close responsible purchase guide" className="button button--icon" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <p>{RESPONSIBLE_USE_COPY}</p>
        <ul className="guide-list">
          <li>Adults 19+ only.</li>
          <li>Official price: KRW {GAME_PRICE_KRW.toLocaleString()} per game.</li>
          <li>Official online purchase limit: KRW {OFFICIAL_ONLINE_LIMIT_KRW.toLocaleString()} per draw.</li>
          <li>This app never logs in, pays, deposits, or clicks purchase for you.</li>
        </ul>
        <div className="dialog-actions">
          <button className="button button--primary" onClick={openOfficialSite} type="button">
            Open official site
          </button>
          <button className="button button--secondary" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}

function TrustBadge({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  return <span className={`trust-badge trust-badge--${tone}`}>{children}</span>;
}

function NumberBall({ number }: { number: number }) {
  return <span className="number-ball">{number}</span>;
}

createRoot(document.getElementById("root")!).render(<App />);
