/**
 * Tests for import parsing and classification — the foundation of the
 * stub/CDN resolution the compile milestone relies on.
 */
import { describe, expect, it } from "vitest";
import {
  dirnameOf,
  extractImportedNames,
  isNpmSpecifier,
  joinPaths,
  parseImports,
  resolveLocalCandidate,
} from "../src/core/imports";

describe("joinPaths / dirnameOf", () => {
  it("normalises relative segments", () => {
    expect(joinPaths("carousel", "./card")).toBe("carousel/card");
    expect(joinPaths("carousel", "../lib/x")).toBe("lib/x");
    expect(joinPaths("", "./x")).toBe("x");
    expect(dirnameOf("a/b/c.tsx")).toBe("a/b");
    expect(dirnameOf("c.tsx")).toBe("");
  });
});

describe("parseImports", () => {
  it("reads defaults, named and type imports", () => {
    const refs = parseImports(
      `import React, { useState } from "react";
       import type { DateValue } from "@internationalized/date";
       import { type Key, Button as Btn } from "react-aria-components";`,
    );
    expect(refs.map((r) => r.specifier)).toEqual([
      "react",
      "@internationalized/date",
      "react-aria-components",
    ]);
    expect(refs[0].names).toEqual([
      { kind: "default", imported: "React" },
      { kind: "named", imported: "useState" },
    ]);
    expect(refs[1].names).toEqual([{ kind: "named", imported: "DateValue" }]);
    /* the local alias is irrelevant — the imported name matters */
    expect(refs[2].names).toEqual([
      { kind: "named", imported: "Key" },
      { kind: "named", imported: "Button" },
    ]);
  });

  it("reads namespace and side-effect imports", () => {
    const refs = parseImports(
      `import * as posix from "./posix";
       import "./styles.css";`,
    );
    expect(refs[0]).toMatchObject({
      specifier: "./posix",
      names: [{ kind: "namespace", imported: "*" }],
    });
    expect(refs[1]).toMatchObject({ specifier: "./styles.css", sideEffectOnly: true });
  });

  it("reads re-exports", () => {
    const refs = parseImports(`export { Thing } from "./thing";\nexport * from "./all";`);
    expect(refs.map((r) => r.specifier)).toEqual(["./thing", "./all"]);
    expect(refs[0].names).toEqual([{ kind: "named", imported: "Thing" }]);
    expect(refs[1].names).toEqual([]);
  });

  it("survives multiline import clauses", () => {
    const refs = parseImports(`import {
       a,
       b as c,
     } from "./multi";`);
    expect(refs[0].specifier).toBe("./multi");
    expect(refs[0].names.map((n) => n.imported)).toEqual(["a", "b"]);
  });

  it("ignores dynamic imports and stray words", () => {
    const refs = parseImports(`const x = await import("./lazy");\n// import from "fake"`);
    expect(refs).toEqual([]);
  });

  it("ignores imports inside comments but keeps real ones", () => {
    const source = [
      "/* import Old from \"./old\"; */",
      'const url = "https://example.com/import from nowhere";',
      'import { Real } from "./real"; // import { AlsoFake } from "./also-fake";',
    ].join("\n");
    const refs = parseImports(source);
    expect(refs.map((r) => r.specifier)).toEqual(["./real"]);
  });
});

describe("extractImportedNames", () => {
  it("collects names for one specifier only", () => {
    const source = `import { A, B } from "./x";\nimport { C } from "./y";`;
    expect(extractImportedNames(source, "./x").map((n) => n.imported)).toEqual(["A", "B"]);
    expect(extractImportedNames(source, "./z")).toEqual([]);
  });
});

describe("isNpmSpecifier", () => {
  it("classifies package names vs local paths", () => {
    expect(isNpmSpecifier("react")).toBe(true);
    expect(isNpmSpecifier("lucide-react")).toBe(true);
    expect(isNpmSpecifier("@internationalized/date")).toBe(true);
    expect(isNpmSpecifier("./card")).toBe(false);
    expect(isNpmSpecifier("../up")).toBe(false);
    expect(isNpmSpecifier("@/components/ui")).toBe(false);
    expect(isNpmSpecifier("https://esm.sh/react")).toBe(false);
    expect(isNpmSpecifier("data:image/png;base64,x")).toBe(false);
  });
});

describe("resolveLocalCandidate", () => {
  const known = new Set([
    "carousel/car.tsx",
    "utils/cx.ts",
    "components/ui/button/index.tsx",
    "styles/global.css",
    "assets/logo.png",
  ]);

  it("resolves sibling files and probes extensions", () => {
    expect(resolveLocalCandidate("./card", "carousel/car.tsx", known)).toBeNull();
    expect(resolveLocalCandidate("./car", "carousel/other.tsx", known)).toBe("carousel/car.tsx");
    expect(resolveLocalCandidate("./cx", "utils/other.ts", known)).toBe("utils/cx.ts");
    expect(resolveLocalCandidate("@/utils/cx", "carousel/car.tsx", known)).toBe("utils/cx.ts");
  });

  it("resolves index files", () => {
    expect(resolveLocalCandidate("@/components/ui/button", "x.tsx", known)).toBe(
      "components/ui/button/index.tsx",
    );
  });

  it("stays inside the folder", () => {
    expect(resolveLocalCandidate("../../etc/passwd", "a/b.tsx", known)).toBeNull();
    expect(resolveLocalCandidate("../outside", "", known)).toBeNull();
  });

  it("returns null for anything not in the folder", () => {
    expect(resolveLocalCandidate("./missing", "carousel/car.tsx", known)).toBeNull();
  });
});
