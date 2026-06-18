import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => { prepare(sql: string): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[]; run(...args: unknown[]): unknown }; exec(sql: string): void; close(): void } };
import seedDraws from "./seed/draws.json" with { type: "json" };
import type { DrawResult, SaveRecommendationRequest } from "@lotto/shared";
import { schemaSql } from "./schema.js";

export type SavedRecommendation = {
  id: string;
  requestId: string;
  traceId: string | null;
  targetDrawNo: number;
  numbers: number[];
  status: "pending" | "checked";
  source: string;
  createdAt: string;
};

function dbPathFromUrl(url = process.env.DATABASE_URL ?? "file:./lotto.sqlite") {
  return url.startsWith("file:") ? url.slice("file:".length) : url;
}

export class SQLiteLotteryStore {
  private readonly db: InstanceType<typeof DatabaseSync>;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(databaseUrl = process.env.DATABASE_URL ?? "file:./lotto.sqlite") {
    const raw = dbPathFromUrl(databaseUrl);
    const path = raw === ":memory:" ? raw : resolve(raw);
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.configureSqlitePragmas();
    this.migrate();
    this.seedInitialDraws();
  }

  configureSqlitePragmas() {
    const mode = this.db.prepare("PRAGMA journal_mode=WAL").get() as { journal_mode?: string } | undefined;
    this.db.exec("PRAGMA busy_timeout=5000");
    return { journal_mode: (mode?.journal_mode ?? "wal").toLowerCase(), busy_timeout: 5000 };
  }

  migrate() {
    this.db.exec(schemaSql);
  }

  private seedInitialDraws() {
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM draw_results").get() as { count: number };
    if (count.count > 0) return;
    for (const draw of seedDraws as DrawResult[]) this.upsertDrawSync(draw);
  }

  private serialize<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.writeQueue.then(fn, fn);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  async latestDrawNo() {
    const row = this.db.prepare("SELECT MAX(draw_no) AS drawNo FROM draw_results").get() as { drawNo: number | null };
    return row.drawNo ?? 0;
  }

  async listDraws() {
    const rows = this.db.prepare("SELECT * FROM draw_results ORDER BY draw_no").all() as Array<Record<string, unknown>>;
    return rows.map(rowToDraw);
  }

  async getDraw(drawNo: number) {
    const row = this.db.prepare("SELECT * FROM draw_results WHERE draw_no=?").get(drawNo) as Record<string, unknown> | undefined;
    return row ? rowToDraw(row) : null;
  }

  private upsertDrawSync(draw: DrawResult) {
    this.db.prepare(`INSERT INTO draw_results (draw_no,date,numbers_json,bonus_number,source_url,fetched_at,parser_version)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(draw_no) DO UPDATE SET date=excluded.date,numbers_json=excluded.numbers_json,bonus_number=excluded.bonus_number,source_url=excluded.source_url,fetched_at=excluded.fetched_at,parser_version=excluded.parser_version`).run(
      draw.drawNo,
      draw.date,
      JSON.stringify(draw.numbers),
      draw.bonusNumber,
      draw.sourceUrl ?? null,
      draw.fetchedAt ?? null,
      draw.parserVersion,
    );
  }

  async upsertDraw(draw: DrawResult) {
    await this.serialize(() => this.upsertDrawSync(draw));
  }

  async saveRecommendations(payload: SaveRecommendationRequest) {
    return this.serialize(() => {
      const now = new Date().toISOString();
      const rows = payload.combinations.map((numbers) => ({
        id: randomUUID(),
        requestId: payload.requestId,
        traceId: payload.traceId,
        targetDrawNo: payload.targetDrawNo,
        numbers,
        status: "pending" as const,
        source: payload.fallbackUsed ? "api-fallback" : "agent-explained",
        createdAt: now,
      }));
      const insert = this.db.prepare("INSERT INTO recommendations (id,request_id,trace_id,target_draw_no,numbers_json,status,source,created_at) VALUES (?,?,?,?,?,?,?,?)");
      this.db.exec("BEGIN IMMEDIATE");
      try {
        for (const row of rows) insert.run(row.id, row.requestId, row.traceId, row.targetDrawNo, JSON.stringify(row.numbers), row.status, row.source, row.createdAt);
        this.db.exec("COMMIT");
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
      return rows;
    });
  }

  async listSaved() {
    const rows = this.db.prepare("SELECT * FROM recommendations ORDER BY created_at").all() as Array<Record<string, unknown>>;
    return rows.map(rowToRecommendation);
  }


  async getSaved(id: string) {
    const row = this.db.prepare("SELECT * FROM recommendations WHERE id=?").get(id) as Record<string, unknown> | undefined;
    return row ? rowToRecommendation(row) : null;
  }

  async saveResultCheck(input: { recommendationId: string; drawNo: number; matchedNumbers: number[]; bonusMatched: boolean; rank: string }) {
    return this.serialize(() => {
      const row = { id: randomUUID(), checkedAt: new Date().toISOString(), ...input };
      this.db.prepare("INSERT INTO result_checks (id,recommendation_id,draw_no,matched_numbers_json,bonus_matched,rank,checked_at) VALUES (?,?,?,?,?,?,?)")
        .run(row.id, row.recommendationId, row.drawNo, JSON.stringify(row.matchedNumbers), row.bonusMatched ? 1 : 0, row.rank, row.checkedAt);
      this.db.prepare("UPDATE recommendations SET status='checked' WHERE id=?").run(row.recommendationId);
      return row;
    });
  }

  close() { this.db.close(); }
}

function rowToDraw(row: Record<string, unknown>): DrawResult {
  return {
    drawNo: Number(row.draw_no),
    date: String(row.date),
    numbers: JSON.parse(String(row.numbers_json)),
    bonusNumber: Number(row.bonus_number),
    sourceUrl: row.source_url == null ? undefined : String(row.source_url),
    fetchedAt: row.fetched_at == null ? undefined : String(row.fetched_at),
    parserVersion: String(row.parser_version),
  };
}

function rowToRecommendation(row: Record<string, unknown>): SavedRecommendation {
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    traceId: row.trace_id == null ? null : String(row.trace_id),
    targetDrawNo: Number(row.target_draw_no),
    numbers: JSON.parse(String(row.numbers_json)),
    status: row.status === "checked" ? "checked" : "pending",
    source: String(row.source),
    createdAt: String(row.created_at),
  };
}

export const defaultStore = new SQLiteLotteryStore();
