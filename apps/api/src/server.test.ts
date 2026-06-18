import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeServer } from "./server.js";

async function withServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const server = makeServer().listen(0);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

describe("api server hardening", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.INTERNAL_API_TOKEN;
    delete process.env.API_MAX_BODY_BYTES;
  });

  it("requires the internal token for /api/agent/run when configured", async () => {
    process.env.INTERNAL_API_TOKEN = "tok";
    await withServer(async (baseUrl) => {
      const denied = await fetch(`${baseUrl}/api/agent/run`, { method: "POST", body: "{}" });
      expect(denied.status).toBe(403);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ spans: [] }), { status: 200 })),
      );
      const allowed = await fetch(`${baseUrl}/api/agent/run`, {
        method: "POST",
        headers: { "x-internal-token": "tok", "content-type": "application/json" },
        body: "{}",
      });
      expect(allowed.status).toBe(200);
    });
  });

  it("rejects oversized JSON bodies", async () => {
    process.env.API_MAX_BODY_BYTES = "4";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/recommendations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: 1 }),
      });
      expect(res.status).toBe(413);
    });
  });
});
