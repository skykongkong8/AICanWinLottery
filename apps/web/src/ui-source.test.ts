import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");

describe("premium lottery UI source contract", () => {
  it("shows required safety, freshness, copy, save, and no-automation affordances", () => {
    expect(source).toContain("Data freshness");
    expect(source).toContain("Copy numbers");
    expect(source).toContain("Save this pick");
    expect(source).toContain("Official purchase guide (19+, no automation)");
    expect(source).toContain("This app never logs in, pays, deposits, or clicks purchase for you.");
    expect(source).toContain("DISCLAIMER");
    expect(source).toContain("RESPONSIBLE_USE_COPY");
  });

  it("keeps generator, saved tracking, and integrity affordances discoverable", () => {
    expect(source).toContain("Lucky-number input affordance");
    expect(source).toContain("Count input affordance");
    expect(source).toContain("Saved / Result tracking");
    expect(source).toContain("Saved/result tracking affordance");
    expect(source).toContain("Integrity details");
    expect(source).toContain("Trace/integrity details affordance");
  });

  it("encodes the Golden Draw Night theme, accessibility hooks, and responsive behavior", () => {
    expect(source).toContain("Golden Draw Night");
    expect(source).toContain("aria-live");
    expect(css).toContain("--gold");
    expect(css).toContain("number-ball");
    expect(css).toContain("@media (max-width: 620px)");
    expect(css).toContain("prefers-reduced-motion");
  });
});
