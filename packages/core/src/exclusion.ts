import type { DrawResult } from "@lotto/shared";
import { combinationKey } from "./validation.js";
export function historicalJackpotKeys(draws: Pick<DrawResult, "numbers">[]): Set<string> { return new Set(draws.map((d) => combinationKey(d.numbers))); }
export function isHistoricalJackpot(numbers: number[], jackpotKeys: Set<string>): boolean { return jackpotKeys.has(combinationKey(numbers)); }
export function excludeHistoricalJackpots<T extends { numbers: number[] }>(candidates: T[], jackpotKeys: Set<string>): T[] { return candidates.filter((c) => !isHistoricalJackpot(c.numbers, jackpotKeys)); }
export function uniqueByCombination<T extends { numbers: number[] }>(candidates: T[]): T[] { const seen = new Set<string>(); return candidates.filter((c) => { const key = combinationKey(c.numbers); if (seen.has(key)) return false; seen.add(key); return true; }); }
