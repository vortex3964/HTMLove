/**
 * Tests for the catalog builder: pairing, .txt splitting, attribution
 * parsing, tailwind detection and the CSS-only flag.
 */
import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  detectTailwind,
  findAttribution,
  splitTxtSource,
  stemOf,
} from "../src/core/catalog";
import type { RawSnapshot } from "../src/core/types";

/* ------------------------------------------------------------------ */
/* splitTxtSource                                                      */
/* ------------------------------------------------------------------ */

describe("splitTxtSource", () => {
  it("splits css-first files at the first markup", () => {
    const source = [
      "/* From Uiverse.io by someone */",
      ".btn { color: red; }",
      "",
      "<!-- comment -->",
      '<button class="btn">Go</button>',
    ].join("\n");
    const { css, html } = splitTxtSource(source);
    expect(css).toContain(".btn { color: red; }");
    expect(css).not.toContain("<button");
    expect(html).toContain('<button class="btn">Go</button>');
    expect(html).not.toContain(".btn { color: red; }");
  });

  it("returns everything as css when there is no markup", () => {
    const { css, html } = splitTxtSource(".loading { display: flex; }");
    expect(css).toContain("display: flex");
    expect(html).toBe("");
  });

  it("returns everything as html for markup-only files", () => {
    const { css, html } = splitTxtSource('<div class="x">hi</div>');
    expect(css).toBe("");
    expect(html).toContain("hi");
  });

  it("keeps markup-first files whole instead of mis-splitting", () => {
    const source = '<div class="x">hi</div>\n<style>.x{}</style>';
    const { html } = splitTxtSource(source);
    expect(html).toBe(source);
  });
});

/* ------------------------------------------------------------------ */
/* findAttribution                                                     */
/* ------------------------------------------------------------------ */

describe("findAttribution", () => {
  it("reads uiverse-style html comments", () => {
    const found = findAttribution([
      '<div>\n<!-- From Uiverse.io by nazar-gavrylyk -->\n<ul></ul>\n</div>',
    ]);
    expect(found).toBe("Uiverse.io · nazar-gavrylyk");
  });

  it("reads css block comments", () => {
    const found = findAttribution(["/* From Uiverse.io by PriyanshuGupta28 */\n.spinner{}"]);
    expect(found).toBe("Uiverse.io · PriyanshuGupta28");
  });

  it("returns undefined when no credit exists", () => {
    expect(findAttribution(["<div>hello</div>"])).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* detectTailwind                                                      */
/* ------------------------------------------------------------------ */

describe("detectTailwind", () => {
  it("detects utility-heavy markup", () => {
    const html =
      '<div class="relative z-0 h-16 -mb-2 transition-all duration-200 group-hover/he:h-0">' +
      '<div class="absolute z-10 w-8 h-8 bg-white border-4 rounded-full shadow-sm"></div></div>';
    expect(detectTailwind(html)).toBe(true);
  });

  it("detects tsx sources with classNames", () => {
    const tsx = `export default () => <div className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-md">x</div>;`;
    expect(detectTailwind(tsx)).toBe(true);
  });

  it("stays quiet on plain class-name markup", () => {
    const html = '<div class="card"><ul class="list"><li class="element">Rename</li></ul></div>';
    expect(detectTailwind(html)).toBe(false);
  });

  it("stays quiet on inline-styled markup", () => {
    const html = '<div><span style="color: red; font-weight: bold">hi</span></div>';
    expect(detectTailwind(html)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* buildCatalog                                                        */
/* ------------------------------------------------------------------ */

function fixtureSnapshot(): RawSnapshot {
  return {
    root: "/fake/components",
    label: "components",
    files: {
      "ChoiceMenu/hi.html": '<div class="card"><ul class="list"></ul></div>',
      "ChoiceMenu/hi.css":
        ".card { width: 200px; }\n/* From Uiverse.io by nazar-gavrylyk */",
      "DiskRoll/hi.html":
        '<div class="flex flex-col items-center h-16 rounded-full shadow-md animate-[spin_3s_linear_infinite]"></div>',
      "carousel/car.tsx":
        'import React from "react";\nexport default function Car() { return <div className="flex items-center gap-4 rounded-2xl bg-white p-4">x</div>; }',
      "ui componensts/loading.txt":
        "/* From Uiverse.io by PriyanshuGupta28 */\n.spinner { width: 9px; }\n\n<div class=\"spinner\"><div></div></div>",
      "ui componensts/playing.txt": ".loading { display: flex; }",
      "playground.deps.json": '{ "packages": {} }',
      "utils/helper.ts": "export const x = 1;",
      "README.md": "# hello",
    },
    assets: {
      "DiskRoll/Screenshot from 2026-08-29 22-12-22.png": 1234,
      "tree/shot.jpg": 99,
    },
    skipped: [],
    manifestText: null,
  };
}

describe("buildCatalog", () => {
  const { components, configFiles, supportFiles } = buildCatalog(fixtureSnapshot());
  const byName = new Map(components.map((c) => [c.name, c]));

  it("pairs same-stem html + css and names it after the folder", () => {
    const choice = byName.get("ChoiceMenu");
    expect(choice).toBeDefined();
    expect(choice!.kind).toBe("html");
    expect(choice!.htmlPath).toBe("ChoiceMenu/hi.html");
    expect(choice!.cssPath).toBe("ChoiceMenu/hi.css");
    expect(choice!.usesTailwind).toBe(false);
  });

  it("keeps standalone html without a css file", () => {
    const disk = byName.get("DiskRoll");
    expect(disk).toBeDefined();
    expect(disk!.cssPath).toBeUndefined();
    expect(disk!.usesTailwind).toBe(true);
  });

  it("finds react sources", () => {
    const car = byName.get("carousel");
    expect(car).toBeDefined();
    expect(car!.kind).toBe("tsx");
    expect(car!.tsxPath).toBe("carousel/car.tsx");
    expect(car!.usesTailwind).toBe(true);
  });

  it("names multi-component folders by stem and flags css-only txt", () => {
    expect(byName.has("ui componensts")).toBe(false);
    const loading = byName.get("loading");
    const playing = byName.get("playing");
    expect(loading!.kind).toBe("txt");
    expect(loading!.cssOnly).toBe(false);
    expect(playing!.kind).toBe("txt");
    expect(playing!.cssOnly).toBe(true);
  });

  it("parses attributions from html and txt sources", () => {
    expect(byName.get("ChoiceMenu")!.attribution).toBe("Uiverse.io · nazar-gavrylyk");
    expect(byName.get("loading")!.attribution).toBe("Uiverse.io · PriyanshuGupta28");
    expect(byName.get("DiskRoll")!.attribution).toBeUndefined();
  });

  it("attaches same-folder screenshots to the component", () => {
    expect(byName.get("DiskRoll")!.screenshots).toEqual([
      "DiskRoll/Screenshot from 2026-08-29 22-12-22.png",
    ]);
    /* an asset on its own is not a component */
    expect(components.find((c) => c.dir === "tree")).toBeUndefined();
  });

  it("separates config and support files from components", () => {
    expect(configFiles).toContain("playground.deps.json");
    expect(supportFiles).toContain("utils/helper.ts");
    expect(supportFiles).toContain("README.md");
    expect(components.find((c) => c.id === "playground.deps.json")).toBeUndefined();
  });

  it("sorts components by name", () => {
    const names = components.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("stemOf survives missing extensions and nested paths", () => {
    expect(stemOf("a/b/c.tsx")).toBe("c");
    expect(stemOf("plain")).toBe("plain");
  });
});
