/**
 * Tests for the import-resolution rules: the built-in presets (shadcn,
 * magicui, the `cn` helper) and the `resolve` map in playground.deps.json
 * that powers the doctor's Resolve action.
 */
import { describe, expect, it } from "vitest";
import { localBaseFor, matchRule, sourceForSpecifier } from "../src/core/resolve";

describe("localBaseFor", () => {
  it("maps alias and relative specifiers the way compilation does", () => {
    expect(localBaseFor("@/components/ui/button", "")).toBe("components/ui/button");
    expect(localBaseFor("@/components/ui/button", "date-picker")).toBe(
      "date-picker/components/ui/button",
    );
    /* nested files keep their top-level snippet folder as the alias base */
    expect(localBaseFor("@/utils/cx", "date-picker/components/base")).toBe("date-picker/utils/cx");
    expect(localBaseFor("./card", "components/x")).toBe("components/x/card");
    expect(localBaseFor("../shared/util", "a/b")).toBe("a/shared/util");
    expect(localBaseFor("/abs/thing", "")).toBe("abs/thing");
  });

  it("returns null for npm packages and urls", () => {
    expect(localBaseFor("react", "")).toBeNull();
    expect(localBaseFor("lucide-react", "")).toBeNull();
    expect(localBaseFor("https://esm.sh/react", "")).toBeNull();
  });
});

describe("built-in presets", () => {
  it("resolves the cn helper aliases", () => {
    for (const alias of ["@/lib/utils", "@/components/lib/utils", "@/utils/cn"]) {
      const source = sourceForSpecifier(alias, "");
      expect(source).toMatchObject({ kind: "builtin", localBase: alias.slice(2) });
      if (source && source.kind === "builtin") {
        expect(source.text).toContain("twMerge");
      } else {
        throw new Error(`${alias} should resolve to the built-in cn helper`);
      }
    }
  });

  it("resolves magicui registry items", () => {
    expect(sourceForSpecifier("@/registry/magicui/file-tree", "")).toMatchObject({
      kind: "registry",
      url: "https://magicui.design/r/file-tree.json",
      itemName: "file-tree",
      localBase: "registry/magicui/file-tree",
    });
  });

  it("resolves shadcn ui components and hooks", () => {
    expect(sourceForSpecifier("@/components/ui/scroll-area", "")).toMatchObject({
      kind: "registry",
      url: "https://ui.shadcn.com/r/styles/new-york/scroll-area.json",
      localBase: "components/ui/scroll-area",
    });
    expect(sourceForSpecifier("@/components/hooks/use-mobile", "")).toMatchObject({
      kind: "registry",
      url: "https://ui.shadcn.com/r/styles/new-york/use-mobile.json",
      localBase: "components/hooks/use-mobile",
    });
    expect(sourceForSpecifier("@/hooks/use-mobile", "")?.kind).toBe("registry");
  });

  it("keeps presets working inside snippet folders", () => {
    expect(sourceForSpecifier("@/lib/utils", "carousel")).toMatchObject({
      kind: "builtin",
      localBase: "carousel/lib/utils",
    });
    expect(sourceForSpecifier("@/registry/magicui/file-tree", "tree")).toMatchObject({
      kind: "registry",
      localBase: "tree/registry/magicui/file-tree",
    });
  });

  it("has no preset for project-specific paths or relatives", () => {
    expect(sourceForSpecifier("@/components/base/buttons/button", "")).toBeNull();
    expect(sourceForSpecifier("@/utils/cx", "")).toBeNull();
    expect(sourceForSpecifier("./card", "")).toBeNull();
  });
});

describe("matchRule", () => {
  it("prefers exact rules over wildcards", () => {
    const rules = { "./card": "url:https://x/card.tsx", "./*": "url:https://x/*" };
    expect(matchRule("./card", rules)).toEqual({ value: "url:https://x/card.tsx", star: "" });
    expect(matchRule("./other", rules)).toEqual({ value: "url:https://x/*", star: "other" });
  });

  it("prefers the longest matching prefix", () => {
    const rules = {
      "@/*": "gh:untitleduico/react/*",
      "@/components/base/*": "gh:untitleduico/react/components/base/*",
    };
    expect(matchRule("@/components/base/button", rules)).toMatchObject({
      value: "gh:untitleduico/react/components/base/*",
      star: "button",
    });
    expect(matchRule("@/utils/cx", rules)).toMatchObject({ star: "utils/cx" });
  });
});

describe("manifest resolve rules", () => {
  it("turns registry rules into item URLs at the right local path", () => {
    const source = sourceForSpecifier("./card", "", {
      "./card": "registry:https://ui.shadcn.com/r/styles/new-york/card.json",
    });
    expect(source).toMatchObject({
      kind: "registry",
      url: "https://ui.shadcn.com/r/styles/new-york/card.json",
      itemName: "card",
      localBase: "card",
    });
  });

  it("expands gh rules to raw.githubusercontent probing paths", () => {
    const source = sourceForSpecifier("@/utils/cx", "", {
      "@/utils/*": "gh:untitleduico/react/utils/*",
    });
    expect(source).toMatchObject({
      kind: "probe",
      probeBase: "https://raw.githubusercontent.com/untitleduico/react/HEAD/",
      remotePath: "utils/cx",
      localBase: "utils/cx",
      note: "github.com/untitleduico/react",
    });
  });

  it("keeps relative imports local while probing a custom base", () => {
    const source = sourceForSpecifier("./calendar", "", {
      "./*": "rawbase:http://127.0.0.1:9/repo/demos/*",
    });
    expect(source).toMatchObject({
      kind: "probe",
      probeBase: "http://127.0.0.1:9/repo/demos/",
      remotePath: "calendar",
      localBase: "calendar",
    });
  });

  it("supports url and builtin rules", () => {
    expect(
      sourceForSpecifier("@/utils/cx", "", { "@/utils/cx": "url:https://example.com/cx.ts" }),
    ).toMatchObject({ kind: "url", url: "https://example.com/cx.ts" });
    expect(sourceForSpecifier("@/lib/utils", "", { "@/lib/*": "builtin:cn" })?.kind).toBe(
      "builtin",
    );
  });

  it("reports bad rules instead of silently ignoring them", () => {
    expect(sourceForSpecifier("./card", "", { "./card": "ftp://nope" })).toMatchObject({
      kind: "invalid",
    });
    expect(sourceForSpecifier("@/x", "", { "@/x": "registry:not-a-url" })).toMatchObject({
      kind: "invalid",
    });
    expect(sourceForSpecifier("@/x", "", { "@/x": "gh:only-owner" })).toMatchObject({
      kind: "invalid",
    });
  });
});
