/**
 * Tests for the preview document builder: what ends up in the sandboxed
 * iframe, and what must never end up there.
 */
import { describe, expect, it } from "vitest";
import { buildPreviewDoc, PREVIEW_READY_CHANNEL, TAILWIND_CDN } from "../src/core/previewHtml";

describe("buildPreviewDoc", () => {
  it("embeds the markup and css", () => {
    const doc = buildPreviewDoc({
      html: '<div class="card">hi</div>',
      css: ".card { color: red; }",
    });
    expect(doc).toContain('<div class="card">hi</div>');
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain(".card { color: red; }");
    expect(doc).toContain('id="hv-user-css"');
  });

  it("only injects the tailwind runtime when asked", () => {
    const withTw = buildPreviewDoc({ html: "<div/>", usesTailwind: true });
    const withoutTw = buildPreviewDoc({ html: "<div/>" });
    expect(withTw).toContain(TAILWIND_CDN);
    expect(withoutTw).not.toContain(TAILWIND_CDN);
  });

  it("paints the canvas and freezes animations on request", () => {
    const dark = buildPreviewDoc({ html: "<div/>", canvas: "dark" });
    expect(dark).toContain("#18181b");

    const paused = buildPreviewDoc({ html: "<div/>", paused: true });
    expect(paused).toContain("animation-play-state:paused");

    const running = buildPreviewDoc({ html: "<div/>" });
    expect(running).not.toContain("animation-play-state");
  });

  it("always ships the error/ready reporter", () => {
    const doc = buildPreviewDoc({ html: "<div/>" });
    expect(doc).toContain(PREVIEW_READY_CHANNEL);
    expect(doc).toContain("addEventListener('error'");
    expect(doc).toContain("unhandledrejection");
  });

  it("injects extra css after the component css so tokens can win", () => {
    const doc = buildPreviewDoc({
      html: "<div/>",
      css: ".x{--primarylw: blue}",
      extraCss: ":root{--primarylw: cornflowerblue}",
    });
    expect(doc.indexOf("hv-user-css")).toBeLessThan(doc.indexOf("hv-extra-css"));
    expect(doc).toContain("cornflowerblue");
  });

  it("centers content on a scrollable stage", () => {
    const doc = buildPreviewDoc({ html: "<div/>" });
    expect(doc).toContain('class="hv-stage"');
    expect(doc).toContain("margin:auto");
  });
});
