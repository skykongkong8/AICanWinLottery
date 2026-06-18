import { mkdirSync, writeFileSync } from "node:fs";
import { explainRequestGolden, explainResponseGolden } from "../src/golden.js";

const outDir = new URL("../fixtures/", import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("explain-request.json", outDir), `${JSON.stringify(explainRequestGolden, null, 2)}\n`);
writeFileSync(new URL("explain-response.json", outDir), `${JSON.stringify(explainResponseGolden, null, 2)}\n`);
console.log("wrote packages/shared/fixtures/*.json");
