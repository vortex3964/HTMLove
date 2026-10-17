/**
 * Tests for stub generation: what a missing import turns into.
 */
import { describe, expect, it } from "vitest";
import { extractImportedNames } from "../src/core/imports";
import { generateAssetStub, generateStubModule, STUB_MARKER } from "../src/core/stubs";

describe("generateStubModule", () => {
  it("exports every imported name as something safe to use", () => {
    const names = extractImportedNames(
      `import { Card, CardContent, useIsMobile, formatPrice } from "./card";`,
      "./card",
    );
    const source = generateStubModule("./card", names);

    expect(source).toContain(`export const ${STUB_MARKER} = "./card"`);
    /* components render as visible placeholders */
    expect(source).toContain(`export const Card = __hvComponent("Card")`);
    expect(source).toContain(`export const CardContent = __hvComponent("CardContent")`);
    /* hooks are callable and return undefined */
    expect(source).toContain(`export const useIsMobile = __hvHook("useIsMobile")`);
    /* plain functions are callable too */
    expect(source).toContain(`export const formatPrice = __hvFn("formatPrice")`);
    expect(source).toContain("export default __hvComponent");
    expect(source).toContain("import React from \"react\"");
  });

  it("gives class-joining helpers a real implementation", () => {
    const names = extractImportedNames(`import { cn } from "@/components/lib/utils";`, "@/components/lib/utils");
    const source = generateStubModule("@/components/lib/utils", names);
    expect(source).toContain("export const cn = __hvJoinClasses");
    expect(source).toContain("flat(Infinity)");
  });

  it("emits only a default export when nothing specific is imported", () => {
    const source = generateStubModule("./thing", []);
    expect(source).toContain("export default __hvComponent");
    expect(source).not.toContain("export const Card");
  });

  it("never emits named exports for namespace or default bindings", () => {
    const names = [
      { kind: "namespace" as const, imported: "*" },
      { kind: "default" as const, imported: "Thing" },
    ];
    const source = generateStubModule("./thing", names);
    expect(source).not.toContain("export const Thing");
    expect(source).not.toContain("export * from");
  });

  it("marks placeholders so they are visible in the preview", () => {
    const source = generateStubModule("./x", []);
    expect(source).toContain("data-htmlove-stub");
    expect(source).toContain("dashed");
  });

  it("skips malformed and duplicate names instead of emitting broken source", () => {
    const source = generateStubModule("./x", [
      { kind: "named", imported: "a; process.exitCode = 1; export const b" },
      { kind: "named", imported: "Card" },
      { kind: "named", imported: "Card" },
    ]);
    expect(source).not.toContain("process.exitCode");
    expect(source.match(/export const Card = __hvComponent/g)?.length).toBe(1);
  });
});

describe("generateAssetStub", () => {
  it("produces a data-url placeholder carrying the file name", () => {
    const source = generateAssetStub("assets/logo.png");
    expect(source).toContain("export default");
    expect(source).toContain("data:image/svg+xml");
    expect(source).toContain("logo.png");
  });
});
