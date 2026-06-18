import type { RecommendationResponse, ResultCheck, SaveRecommendationRequest } from "@lotto/shared";
const API = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
export async function recommend(luckyNumbers: number[], count: number): Promise<RecommendationResponse> {
  const res = await fetch(`${API}/api/recommendations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ luckyNumbers, count }) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function save(payload: SaveRecommendationRequest): Promise<{ saved: Array<{ id: string; numbers: number[]; targetDrawNo: number }> }> {
  const res = await fetch(`${API}/api/recommendations/save`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function checkSaved(id: string, drawNo?: number): Promise<ResultCheck & { checkId: string }> {
  const res = await fetch(`${API}/api/recommendations/${id}/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ drawNo }) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
