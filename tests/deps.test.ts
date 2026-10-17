/**
 * Tests for the static dependency report and the CDN mapping.
 */
import { describe, expect, it } from "vitest";
import { planImports } from "../src/core/deps";
import { buildImportMap, esmUrl, PREVIEW_REACT_VERSION } from "../src/core/packages";

describe("planImports", () => {
  const files = new Set(["carousel/car.tsx", "utils/cx.ts"]);
  const assets = new Set(["assets/logo.png"]);

  const source = `
    import React, { useState } from "react";
    import { ChevronLeft } from "lucide-react";
    import { Card } from "./card";
    import { cx } from "@/utils/cx";
    import logo from "./assets/logo.png";
    import "./carousel.css";
  `;

  it("classifies every import correctly", () => {
    const plan = planImports(source, "carousel/car.tsx", files, assets);
    const bySpec = new Map(plan.map((p) => [p.specifier, p]));

    expect(bySpec.get("react")).toMatchObject({ status: "react" });
    expect(bySpec.get("lucide-react")).toMatchObject({ status: "external" });
    expect(bySpec.get("./card")).toMatchObject({ status: "stub" });
    expect(bySpec.get("@/utils/cx")).toMatchObject({ status: "local", resolved: "utils/cx.ts" });
    /* relative asset imports resolve from the importer's folder */
    expect(bySpec.get("./assets/logo.png")).toMatchObject({ status: "stub" });
    expect(bySpec.get("./carousel.css")).toMatchObject({ status: "stub" });
  });

  it("reports the imported names for the dependencies panel", () => {
    const plan = planImports(source, "carousel/car.tsx", files, assets);
    expect(plan.find((p) => p.specifier === "react")!.names).toEqual(["React", "useState"]);
    expect(plan.find((p) => p.specifier === "lucide-react")!.names).toEqual(["ChevronLeft"]);
  });

  it("marks images from the folder as assets", () => {
    const plan = planImports(`import logo from "@/assets/logo.png";`, "x.tsx", files, assets);
    expect(plan[0]).toMatchObject({ status: "asset", resolved: "assets/logo.png" });
  });

  it("honours manifest stubs and custom urls", () => {
    const plan = planImports(source, "carousel/car.tsx", files, assets, {
      stubs: ["lucide-react"],
      urls: { "./card": "https://example.com/card.js" },
    });
    const bySpec = new Map(plan.map((p) => [p.specifier, p]));

    expect(bySpec.get("lucide-react")).toMatchObject({
      status: "stub",
      note: "stubbed via playground.deps.json",
    });
    expect(bySpec.get("./card")).toMatchObject({
      status: "external",
      note: "custom URL from playground.deps.json",
    });
  });

  it("notes version pins from the manifest", () => {
    const plan = planImports(source, "carousel/car.tsx", files, assets, {
      packages: { "lucide-react": "0.469.0" },
    });
    expect(plan.find((p) => p.specifier === "lucide-react")!.note).toBe(
      "pinned to 0.469.0 on esm.sh",
    );
  });
});

describe("esmUrl", () => {
  it("pins react and shares one instance across packages", () => {
    expect(esmUrl("react")).toBe(`https://esm.sh/react@${PREVIEW_REACT_VERSION}`);
    expect(esmUrl("react-dom/client")).toContain(`deps=react@${PREVIEW_REACT_VERSION}`);
    expect(esmUrl("lucide-react")).toContain(`deps=react@${PREVIEW_REACT_VERSION}`);
  });

  it("uses pinned versions where available and respects overrides", () => {
    expect(esmUrl("lucide-react")).toContain("lucide-react@0.469.0");
    expect(esmUrl("some-pkg")).toContain("esm.sh/some-pkg?");
    expect(esmUrl("some-pkg", { "some-pkg": "9.9.9" })).toContain("some-pkg@9.9.9");
  });
});

describe("buildImportMap", () => {
  it("maps every external specifier", () => {
    const map = buildImportMap(["react", "lucide-react", "framer-motion"]);
    expect(Object.keys(map.imports)).toEqual(["react", "lucide-react", "framer-motion"]);
    expect(map.imports["react"]).toBe(`https://esm.sh/react@${PREVIEW_REACT_VERSION}`);
  });

  it("lets url overrides win (manifest escape hatch)", () => {
    const map = buildImportMap(
      ["@/registry/magicui/file-tree"],
      undefined,
      { "@/registry/magicui/file-tree": "https://magicui.design/r/file-tree.js" },
    );
    expect(map.imports["@/registry/magicui/file-tree"]).toBe(
      "https://magicui.design/r/file-tree.js",
    );
  });
});
