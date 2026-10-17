/**
 * End-to-end compile tests. They run the real htmlove esbuild plugin —
 * with the native esbuild binary instead of the wasm build, same API —
 * against realistic components: external packages stay as imports,
 * missing files become stubs, real sibling files get bundled in.
 */
import { describe, expect, it } from "vitest";
import * as nativeEsbuild from "esbuild";
import {
  buildEntryModule,
  compileTsxComponent,
  compileTsxComponentCached,
  type CompileInput,
  type EsbuildLike,
} from "../src/core/compile";
import { buildTsxPreviewDoc, REVIVE_PROPS_SOURCE } from "../src/core/tsxPreviewHtml";

const getEsbuild = async () => nativeEsbuild as unknown as EsbuildLike;

function input(partial: Partial<CompileInput> & Pick<CompileInput, "source" | "path">): CompileInput {
  return {
    files: new Map(Object.entries(partial.files ? Object.fromEntries(partial.files) : {})),
    assets: new Set(),
    getEsbuild,
    absWorkingDir: process.cwd(),
    ...partial,
  } as CompileInput;
}

const CAR_SOURCE = `
"use client";
import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "./card";
import { cx } from "@/utils/cx";

export default function ThreeDCarousel() {
  const [active, setActive] = useState(0);
  return (
    <div className={cx("carousel", "active")}>
      <Card><CardContent>{active}</CardContent></Card>
      <button onClick={() => setActive(active + 1)}><ChevronRight size={16} /></button>
      <ChevronLeft size={16} />
    </div>
  );
}
`;

describe("compileTsxComponent", () => {
  it("bundles externals, stubs missing files and resolves real ones", async () => {
    const result = await compileTsxComponent(
      input({
        source: CAR_SOURCE,
        path: "carousel/car.tsx",
        files: new Map([
          ["carousel/car.tsx", CAR_SOURCE],
          ["utils/cx.ts", `export const cx = (...args: string[]) => args.join(" ");`],
        ]),
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    /* third-party stays external so the import map can serve it */
    expect(result.externals).toContain("react");
    expect(result.externals).toContain("react/jsx-runtime");
    expect(result.externals).toContain("lucide-react");
    expect(result.code).toContain('from "lucide-react"');

    /* the missing ./card became one visible stub */
    expect(result.stubs).toEqual(["./card"]);
    expect(result.code).toContain("data-htmlove-stub");
    expect(result.code).toContain('__hvComponent("Card")');
    expect(result.code).toContain('__hvComponent("CardContent")');

    /* the real sibling file was bundled in */
    expect(result.externals).not.toContain("@/utils/cx");
    expect(result.code).toContain('args.join(" ")');

    /* the mount wrapper is in place */
    expect(result.code).toContain("hv-root");
    expect(result.code).toContain("Render error");
  });

  it("picks named component exports when there is no default", async () => {
    const source = `export function FileTreeDemo() { return <div className="tree">demo</div>; }`;
    const result = await compileTsxComponent(
      input({
        source,
        path: "tree/tree.tsx",
        files: new Map([["tree/tree.tsx", source]]),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain("FileTreeDemo");
  });

  it("collects css imports into the stylesheet output", async () => {
    const source = `import "./styles.css";\nexport default function X() { return <div className="hello">hi</div>; }`;
    const result = await compileTsxComponent(
      input({
        source,
        path: "x/X.tsx",
        files: new Map([
          ["x/X.tsx", source],
          ["x/styles.css", ".hello { color: red; }"],
        ]),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.css).toContain(".hello");
    expect(result.css).toContain("color: red");
  });

  it("reports syntax errors instead of throwing", async () => {
    const result = await compileTsxComponent(
      input({
        source: "export default function ( {",
        path: "broken/broken.tsx",
        files: new Map([["broken/broken.tsx", "export default function ( {"]]),
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/broken\/broken\.tsx/);
  });

  it("reports missing named exports of real local files (honest failure)", async () => {
    const source = `import { NotThere } from "./util";\nexport default function X() { return <div>{NotThere}</div>; }`;
    const result = await compileTsxComponent(
      input({
        source,
        path: "x/X.tsx",
        files: new Map([
          ["x/X.tsx", source],
          ["x/util.ts", "export const There = 1;"],
        ]),
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("stubs specifiers forced by the manifest instead of fetching them", async () => {
    const source = `import { Ghost } from "ghost-pkg";\nexport default function X() { return <Ghost>hi</Ghost>; }`;
    const result = await compileTsxComponent(
      input({
        source,
        path: "x/X.tsx",
        files: new Map([["x/X.tsx", source]]),
        forceStub: new Set(["ghost-pkg"]),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stubs).toEqual(["ghost-pkg"]);
    expect(result.externals).not.toContain("ghost-pkg");
    expect(result.code).toContain("data-htmlove-stub");
  });

  it("never force-stubs react itself", async () => {
    const source = `import React from "react";\nexport default function X() { return <div>ok</div>; }`;
    const result = await compileTsxComponent(
      input({
        source,
        path: "x/X.tsx",
        files: new Map([["x/X.tsx", source]]),
        forceStub: new Set(["react"]),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.externals).toContain("react");
  });
});

describe("compileTsxComponentCached", () => {
  it("recompiles when a bundled local file changes", async () => {
    const source = `import { msg } from "./util";\nexport default function X() { return <div>{msg}</div>; }`;
    const first = await compileTsxComponentCached(
      input({
        source,
        path: "cache/X.tsx",
        files: new Map([
          ["cache/X.tsx", source],
          ["cache/util.ts", 'export const msg = "FIRST";'],
        ]),
      }),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.code).toContain("FIRST");

    /* a fresh Map means fresh contents — the cache must not serve stale code */
    const second = await compileTsxComponentCached(
      input({
        source,
        path: "cache/X.tsx",
        files: new Map([
          ["cache/X.tsx", source],
          ["cache/util.ts", 'export const msg = "SECOND";'],
        ]),
      }),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.code).toContain("SECOND");
  });

  it("survives file names with quotes and newlines", async () => {
    const path = 'we"ird\nname.tsx';
    const source = `export default function X() { return <div>ok</div>; }`;
    const result = await compileTsxComponent(
      input({ source, path, files: new Map([[path, source]]) }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("buildEntryModule", () => {
  it("imports the component by relative path from the entry", () => {
    const wrapper = buildEntryModule("carousel/car.tsx");
    expect(wrapper).toContain('from "./carousel/car.tsx"');
    expect(wrapper).toContain("createRoot");
    expect(wrapper).toContain("window.__hvProps");
  });

  it("escapes file names that would break the import statement", () => {
    const wrapper = buildEntryModule('we"ird.tsx');
    expect(wrapper).toContain('"./we\\"ird.tsx"');
  });
});

describe("buildTsxPreviewDoc", () => {
  it("puts the import map before the module script and mounts into hv-root", () => {
    const doc = buildTsxPreviewDoc({
      code: "console.log('component')",
      externals: ["react", "lucide-react"],
      canvas: "light",
    });
    expect(doc).toContain('id="hv-root"');
    expect(doc.indexOf("importmap")).toBeGreaterThan(-1);
    expect(doc.indexOf("importmap")).toBeLessThan(doc.indexOf('type="module"'));
    expect(doc).toContain(`https://esm.sh/react@`);
    expect(doc).toContain("lucide-react@0.469.0");
    expect(doc).toContain("htmlove-preview");
  });

  it("honours url overrides in the import map", () => {
    const doc = buildTsxPreviewDoc({
      code: "x",
      externals: ["@/registry/magicui/file-tree"],
      urlOverrides: { "@/registry/magicui/file-tree": "https://example.com/file-tree.js" },
    });
    expect(doc).toContain("https://example.com/file-tree.js");
  });

  it("injects design-token css into the preview document", () => {
    const doc = buildTsxPreviewDoc({
      code: "x",
      extraCss: ":root{--primarylw:#6366f1}",
    });
    expect(doc).toContain('id="hv-tokens"');
    expect(doc).toContain("--primarylw:#6366f1");
  });

  it("hands props to the component through window.__hvProps, safely escaped", () => {
    const doc = buildTsxPreviewDoc({
      code: "x",
      props: { slides: [{ id: 1 }], label: "</script><b>" },
    });
    expect(doc).toContain("window.__hvProps = ");
    expect(doc.indexOf("__hvProps")).toBeLessThan(doc.indexOf('type="module"'));
    expect(doc).toContain("\\u003c/script");
    expect(doc).not.toContain("</script><b>");
  });

  it("revives function-looking prop strings into live functions", () => {
    const revive = new Function(`return ${REVIVE_PROPS_SOURCE}`)() as (
      value: unknown,
    ) => Record<string, unknown>;
    const out = revive({
      renderItem: "(item, index) => item.title + index",
      plain: "(hello)",
      nested: { cb: "function (n) { return n * 2; }" },
      list: ["item => item.id", 3],
    });
    expect(typeof out.renderItem).toBe("function");
    const renderItem = out.renderItem as (item: { title: string }, index: number) => string;
    expect(renderItem({ title: "a" }, 2)).toBe("a2");
    /* prose that merely mentions => stays a string */
    expect(out.plain).toBe("(hello)");
    expect(typeof (out.nested as { cb: unknown }).cb).toBe("function");
    expect(typeof (out.list as unknown[])[0]).toBe("function");
    expect((out.list as unknown[])[1]).toBe(3);
  });
});
