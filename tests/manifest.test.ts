/**
 * Tests for playground.deps.json: parsing (always forgiving), tailwind
 * overrides and per-component token collection.
 */
import { describe, expect, it } from "vitest";
import {
  applyManifestToCatalog,
  componentTokens,
  parseManifest,
  serializeManifest,
} from "../src/core/manifest";
import type { Component } from "../src/core/types";

function makeComponent(overrides?: Partial<Component>): Component {
  return {
    id: "glass-folder/glass.tsx",
    name: "glass-folder",
    dir: "glass-folder",
    kind: "tsx",
    tsxPath: "glass-folder/glass.tsx",
    usesTailwind: false,
    cssOnly: false,
    screenshots: [],
    imports: [],
    remoteAssets: [],
    ...overrides,
  };
}

describe("parseManifest", () => {
  it("returns an empty manifest for nothing", () => {
    expect(parseManifest(null)).toEqual({ manifest: {} });
    expect(parseManifest("  ")).toEqual({ manifest: {} });
  });

  it("reports invalid JSON instead of throwing", () => {
    const result = parseManifest("{ nope");
    expect(result.manifest).toEqual({});
    expect(result.error).toMatch(/not valid JSON/);
  });

  it("rejects non-object roots", () => {
    expect(parseManifest("[1,2,3]").error).toMatch(/JSON object/);
  });

  it("reads every known field and drops unknown junk", () => {
    const { manifest, error } = parseManifest(
      JSON.stringify({
        packages: { "lucide-react": "0.469.0", bad: 42 },
        urls: { "@/registry/x": "https://example.com/x.js" },
        stubs: ["@untitledui/icons", 7],
        tailwind: true,
        tokens: { "--primarylw": "#6366f1" },
        components: {
          "glass-folder/glass.tsx": { tailwind: false, tokens: { "--primarylw": "tomato" } },
        },
        nonsense: "ignored",
      }),
    );
    expect(error).toBeUndefined();
    expect(manifest.packages).toEqual({ "lucide-react": "0.469.0" });
    expect(manifest.urls).toEqual({ "@/registry/x": "https://example.com/x.js" });
    expect(manifest.stubs).toEqual(["@untitledui/icons"]);
    expect(manifest.tailwind).toBe(true);
    expect(manifest.tokens).toEqual({ "--primarylw": "#6366f1" });
    expect(manifest.components?.["glass-folder/glass.tsx"]).toEqual({
      tailwind: false,
      tokens: { "--primarylw": "tomato" },
    });
  });

  it("round-trips through serialize", () => {
    const manifest = { stubs: ["react-aria"], tailwind: false };
    expect(parseManifest(serializeManifest(manifest)).manifest).toEqual(manifest);
  });
});

describe("applyManifestToCatalog", () => {
  it("leaves detection alone without overrides", () => {
    const component = makeComponent({ usesTailwind: true });
    expect(applyManifestToCatalog([component], {}).at(0)?.usesTailwind).toBe(true);
  });

  it("applies a global tailwind override", () => {
    const component = makeComponent({ usesTailwind: true });
    expect(applyManifestToCatalog([component], { tailwind: false }).at(0)?.usesTailwind).toBe(
      false,
    );
  });

  it("lets per-component overrides win, keyed by id or name", () => {
    const component = makeComponent();
    const byId = applyManifestToCatalog([component], {
      tailwind: true,
      components: { "glass-folder/glass.tsx": { tailwind: false } },
    });
    expect(byId.at(0)?.usesTailwind).toBe(false);

    const byName = applyManifestToCatalog([component], {
      components: { "glass-folder": { tailwind: true } },
    });
    expect(byName.at(0)?.usesTailwind).toBe(true);
  });
});

describe("componentTokens", () => {
  it("merges globals with per-component values (component wins)", () => {
    const component = makeComponent();
    const tokens = componentTokens(
      {
        tokens: { "--primarylw": "#111111", "--secondarylw": "#222222" },
        components: { "glass-folder": { tokens: { "--primarylw": "tomato" } } },
      },
      component,
    );
    expect(tokens).toEqual({ "--primarylw": "tomato", "--secondarylw": "#222222" });
  });
});
