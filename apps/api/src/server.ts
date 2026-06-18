import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  checkSavedRecommendation,
  createRecommendations,
  generateInternalCandidates,
  getInternalLatestDraws,
  getInternalStatistics,
  runAgentDevPath,
  saveRecommendations,
  validateInternalCandidates,
} from "./service.js";

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return true;
  const allowlist = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return allowlist.includes(origin);
}

function isInternalAllowed(req: IncomingMessage) {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) return true;
  return req.headers["x-internal-token"] === token;
}

async function readJson(req: IncomingMessage) {
  const maxBodyBytes = Number(process.env.API_MAX_BODY_BYTES ?? 64 * 1024);
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > maxBodyBytes) {
    throw Object.assign(new Error("request body too large"), { status: 413 });
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBodyBytes) {
      throw Object.assign(new Error("request body too large"), { status: 413 });
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid JSON body"), { status: 400 });
  }
}

function send(req: IncomingMessage, res: ServerResponse, status: number, body: unknown) {
  const origin = req.headers.origin;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "access-control-allow-headers": "content-type,x-internal-token",
  };
  if (typeof origin === "string" && isAllowedOrigin(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

export function makeServer() {
  return createServer(async (req, res) => {
    try {
      if (typeof req.headers.origin === "string" && !isAllowedOrigin(req.headers.origin)) {
        return send(req, res, 403, { error: "origin not allowed" });
      }
      if (req.method === "OPTIONS") return send(req, res, 204, {});
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/api/health") {
        return send(req, res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/recommendations") {
        return send(req, res, 200, await createRecommendations(await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/api/recommendations/save") {
        return send(req, res, 200, await saveRecommendations(await readJson(req)));
      }

      const checkMatch = url.pathname.match(/^\/api\/recommendations\/([^/]+)\/check$/);
      if (req.method === "POST" && checkMatch) {
        const body = await readJson(req);
        return send(req, res, 200, await checkSavedRecommendation(checkMatch[1], body.drawNo));
      }

      if (url.pathname.startsWith("/internal/") && !isInternalAllowed(req)) {
        return send(req, res, 403, { error: "internal token required" });
      }
      if (req.method === "GET" && url.pathname === "/internal/statistics") {
        return send(req, res, 200, await getInternalStatistics());
      }
      if (req.method === "GET" && url.pathname === "/internal/latest-draws") {
        return send(req, res, 200, await getInternalLatestDraws(Number(url.searchParams.get("limit") ?? 10)));
      }
      if (req.method === "POST" && url.pathname === "/internal/generate-candidates") {
        return send(req, res, 200, await generateInternalCandidates(await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/internal/validate") {
        return send(req, res, 200, await validateInternalCandidates(await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/api/agent/run") {
        if (!isInternalAllowed(req)) return send(req, res, 403, { error: "internal token required" });
        return send(req, res, 200, await runAgentDevPath(await readJson(req)));
      }

      return send(req, res, 404, { error: "not found" });
    } catch (err: unknown) {
      const error = err as { status?: number; issues?: unknown; message?: string };
      const status = error.status ?? (error.issues ? 400 : 500);
      return send(req, res, status, { error: error.message ?? "internal error", issues: error.issues });
    }
  });
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const port = Number(process.env.API_PORT ?? 3001);
  makeServer().listen(port, () => console.log(`api listening on ${port}`));
}
