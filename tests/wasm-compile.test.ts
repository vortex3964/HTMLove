/**
 * The browser uses the wasm build of esbuild. This test pushes the real
 * htmlove plugin through that exact binary (in node) so the browser
 * compile path is covered without a browser.
 */
import { describe, expect, it } from "vitest";
import { compileTsxComponent, type EsbuildLike } from "../src/core/compile";

let esbuildPromise: Promise<EsbuildLike> | null = null;

const getWasmEsbuild = async (): Promise<EsbuildLike> => {
  if (!esbuildPromise) {
    esbuildPromise = import("esbuild-wasm").then(async (mod) => {
      await mod.initialize({});
      return mod as unknown as EsbuildLike;
    });
  }
  return esbuildPromise;
};

describe("compile via the esbuild wasm binary", () => {
  it(
    "bundles a component with stubs, externals and the mount wrapper",
    async () => {
      const source = `
        import { useState } from "react";
        import { Ghost } from "./missing";
        import { cx } from "@/lib/utils";
        export default function Demo() {
          const [n] = useState(1);
          return <div className={cx("demo")}><Ghost>{n}</Ghost></div>;
        }
      `;
      const result = await compileTsxComponent({
        source,
        path: "demo/demo.tsx",
        files: new Map([["demo/demo.tsx", source]]),
        assets: new Set(),
        getEsbuild: getWasmEsbuild,
        absWorkingDir: "/",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.errors.join("\n"));

      expect(result.stubs).toEqual(["./missing", "@/lib/utils"]);
      expect(result.externals).toContain("react");
      expect(result.externals).toContain("react/jsx-runtime");
      expect(result.code).toContain("hv-root");
      expect(result.code).toContain("__hvComponent");
    },
    60000,
  );
});
