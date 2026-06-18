import { writeFileSync } from "node:fs";
import { openApiDocument } from "../src/openapi.js";
writeFileSync(new URL("../openapi.json", import.meta.url), `${JSON.stringify(openApiDocument, null, 2)}\n`);
console.log("wrote packages/shared/openapi.json");
