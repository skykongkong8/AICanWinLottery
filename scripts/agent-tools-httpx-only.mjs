import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "apps/agent/src/lotto_agent/tools";
const allowedImports = new Set(["httpx", "os"]);
function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
for (const file of files(root).filter((f) => f.endsWith(".py"))) {
  const src = readFileSync(file, "utf8");
  for (const line of src.split(/\r?\n/)) {
    const match = /^\s*(?:from|import)\s+([A-Za-z0-9_\.]+)/.exec(line);
    if (!match) continue;
    const module = match[1].split(".")[0];
    if (!allowedImports.has(module) && module !== "__future__") {
      throw new Error(`${file} contains non-httpx/env import in agent tool: ${line}`);
    }
  }
}
console.log("agent tools httpx/env-only lint passed");
