import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const drawResults = sqliteTable("draw_results", {
  drawNo: integer("draw_no").primaryKey(),
  date: text("date").notNull(),
  numbersJson: text("numbers_json").notNull(),
  bonusNumber: integer("bonus_number").notNull(),
  sourceUrl: text("source_url"),
  fetchedAt: text("fetched_at"),
  parserVersion: text("parser_version").notNull(),
});

export const recommendations = sqliteTable("recommendations", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  traceId: text("trace_id"),
  targetDrawNo: integer("target_draw_no").notNull(),
  numbersJson: text("numbers_json").notNull(),
  status: text("status").notNull(),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull(),
});

export const resultChecks = sqliteTable("result_checks", {
  id: text("id").primaryKey(),
  recommendationId: text("recommendation_id").notNull(),
  drawNo: integer("draw_no").notNull(),
  matchedNumbersJson: text("matched_numbers_json").notNull(),
  bonusMatched: integer("bonus_matched", { mode: "boolean" }).notNull(),
  rank: text("rank").notNull(),
  checkedAt: text("checked_at").notNull(),
});

export const schemaSql = `
  CREATE TABLE IF NOT EXISTS draw_results (
    draw_no INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    numbers_json TEXT NOT NULL,
    bonus_number INTEGER NOT NULL,
    source_url TEXT,
    fetched_at TEXT,
    parser_version TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    trace_id TEXT,
    target_draw_no INTEGER NOT NULL,
    numbers_json TEXT NOT NULL,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS result_checks (
    id TEXT PRIMARY KEY,
    recommendation_id TEXT NOT NULL,
    draw_no INTEGER NOT NULL,
    matched_numbers_json TEXT NOT NULL,
    bonus_matched INTEGER NOT NULL,
    rank TEXT NOT NULL,
    checked_at TEXT NOT NULL
  );
`;
