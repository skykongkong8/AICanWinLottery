import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");

describe("responsible purchase and tracking UI", () => {
  it("shows required safety, freshness, copy, save, and no-automation affordances", () => {
    expect(source).toContain("Data freshness");
    expect(source).toContain("Copy numbers");
    expect(source).toContain("Save this pick");
    expect(source).toContain("Official purchase guide (19+, no automation)");
    expect(source).toContain("This app never logs in, pays, deposits, or clicks purchase for you.");
    expect(source).toContain("DISCLAIMER");
  });
});
