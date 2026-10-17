/**
 * Tests for remote-asset extraction and dead-link rewriting.
 */
import { describe, expect, it } from "vitest";
import {
  CSS_ASSET_PLACEHOLDER,
  extractRemoteAssets,
  IMAGE_ASSET_PLACEHOLDER,
  rewriteDeadAssets,
} from "../src/core/assets";

describe("extractRemoteAssets", () => {
  it("finds url() references in css and src= in html", () => {
    const assets = extractRemoteAssets({
      css: `.hero{background:url('https://cdn.example.com/a.png')}@import url(https://fonts.example.com/x.css);`,
      html: `<img src="https://cdn.example.com/b.jpg" alt=""><video poster="https://cdn.example.com/p.jpg"></video>`,
    });
    expect(assets).toEqual([
      "https://cdn.example.com/a.png",
      "https://fonts.example.com/x.css",
      "https://cdn.example.com/b.jpg",
      "https://cdn.example.com/p.jpg",
    ]);
    /* dedupes while keeping first-seen order */
    const again = extractRemoteAssets({
      css: "url(https://x.example.com/a.png) url(https://x.example.com/a.png)",
    });
    expect(again).toEqual(["https://x.example.com/a.png"]);
  });

  it("scans tsx loosely for image urls in string literals", () => {
    const assets = extractRemoteAssets({
      tsx: `const pics = ["https://images.unsplash.com/photo-1?w=600", "https://example.com/dead-link.jpg."];`,
    });
    expect(assets).toEqual([
      "https://images.unsplash.com/photo-1?w=600",
      "https://example.com/dead-link.jpg",
    ]);
  });

  it("skips code urls and esm.sh", () => {
    const assets = extractRemoteAssets({
      tsx: `import x from "https://esm.sh/react"; const y = "https://cdn.jsdelivr.net/npm/x.js";`,
    });
    expect(assets).toEqual([]);
  });
});

describe("rewriteDeadAssets", () => {
  const dead = new Set(["https://dead.example.com/bg.png", "https://dead.example.com/photo.jpg"]);

  it("turns dead css backgrounds into a quiet gradient", () => {
    const source = `.a{background-image:url("https://dead.example.com/bg.png")}`;
    expect(rewriteDeadAssets(source, dead)).toBe(
      `.a{background-image:${CSS_ASSET_PLACEHOLDER}}`,
    );
  });

  it("replaces dead img src with a labelled placeholder", () => {
    const source = `<img src="https://dead.example.com/photo.jpg" alt="x">`;
    const out = rewriteDeadAssets(source, dead);
    expect(out).toContain(IMAGE_ASSET_PLACEHOLDER);
    expect(out).not.toContain("dead.example.com/photo.jpg");
    expect(out).toContain('alt="x"');
  });

  it("leaves live urls and existing placeholders alone", () => {
    const source = `<img src="https://alive.example.com/a.png"><div style="background:url(https://alive.example.com/b.png)"></div>`;
    expect(rewriteDeadAssets(source, dead)).toBe(source);
    const withPlaceholder = `<div style="background:url(data:image/svg+xml;base64,abc)"></div>`;
    expect(rewriteDeadAssets(withPlaceholder, dead)).toBe(withPlaceholder);
  });

  it("is a no-op with an empty dead set", () => {
    const source = `<img src="https://dead.example.com/photo.jpg">`;
    expect(rewriteDeadAssets(source, new Set())).toBe(source);
  });
});
