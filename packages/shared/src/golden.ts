export const explainRequestGolden = {
  requestId: "req_1",
  traceId: null,
  combinations: [
    { id: "rec_1", numbers: [1, 2, 3, 4, 5, 6], tags: ["balanced"], stats: { sum: 21 } },
  ],
  stats: { historicalDraws: 3 },
  luckyNumbers: [1, 2],
  targetDrawNo: 1200,
} as const;

export const explainResponseGolden = {
  perCombination: [
    { id: "rec_1", explanation: "Fun balanced pick.", tagNarration: "Balanced spread." },
  ],
  analysisSummary: "Entertainment-only summary.",
  fallbackUsed: false,
} as const;
