/**
 * Tests for the design-token detective: which custom properties are
 * used, which are defined, and what we inject for the gaps.
 */
import { describe, expect, it } from "vitest";
import {
  buildTokenCss,
  definedTokenNames,
  missingTokens,
  suggestTokenValue,
  usedTokenNames,
} from "../src/core/tokens";

describe("usedTokenNames / definedTokenNames", () => {
  it("finds var() usage with fallbacks and spacing", () => {
    const used = usedTokenNames([
      "color: var(--primarylw);",
      "border: var( --sec-border );",
      "background: var(--x, var(--fallback));",
    ]);
    expect(used).toEqual(["fallback", "primarylw", "sec-border", "x"]);
  });

  it("finds definitions in :root and inline styles", () => {
    const defined = definedTokenNames([
      ":root{--primarylw:#6366f1;--radius:14px}",
      "div{--line-active:1}",
      `.x{background:var(--primarylw)}`,
    ]);
    expect(defined).toEqual(["line-active", "primarylw", "radius"]);
  });

  it("ignores tailwind's runtime variables", () => {
    expect(usedTokenNames(["var(--tw-shadow)", "var(--tw-ring-color)"])).toEqual([]);
    expect(definedTokenNames(["*{--tw-shadow: 0 0 #0000}"])).toEqual([]);
  });
});

describe("missingTokens", () => {
  it("is the difference between used and defined", () => {
    const sources = [
      ":root{--defined-token:10px}",
      ".g{background:var(--primarylw);gap:var(--defined-token);color:var(--missing-token)}",
    ];
    expect(missingTokens(sources)).toEqual(["missing-token", "primarylw"]);
  });
});

describe("buildTokenCss", () => {
  it("emits a :root block and normalises names", () => {
    const css = buildTokenCss({ primarylw: "#6366f1", "--other": "4px" });
    expect(css).toBe(":root{--primarylw:#6366f1;--other:4px;}");
  });

  it("skips blank values and returns nothing when empty", () => {
    expect(buildTokenCss({ "--x": "  " })).toBe("");
    expect(buildTokenCss({})).toBe("");
  });
});

describe("suggestTokenValue", () => {
  it("guesses from the token name", () => {
    expect(suggestTokenValue("--primarylw")).toMatch(/^#/);
    expect(suggestTokenValue("--danger")).toBe("#ef4444");
    expect(suggestTokenValue("--radius-lg")).toBe("12px");
    expect(suggestTokenValue("--totally-unknown")).toBe("#6366f1");
  });
});
