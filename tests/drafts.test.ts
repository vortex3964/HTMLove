// @vitest-environment jsdom
/**
 * Tests for the draft store: persistence, clearing and the debounced
 * writer that runs while you type.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelScheduledDrafts,
  clearDraft,
  getDraft,
  saveDraft,
  scheduleDraftSave,
  sweepDrafts,
} from "../src/core/drafts";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cancelScheduledDrafts();
  vi.useRealTimers();
});

describe("draft persistence", () => {
  it("round-trips a draft", () => {
    saveDraft("/root", "a/hi.html", "<div>draft</div>");
    expect(getDraft("/root", "a/hi.html")).toBe("<div>draft</div>");
  });

  it("clears a draft", () => {
    saveDraft("/root", "a/hi.html", "x");
    clearDraft("/root", "a/hi.html");
    expect(getDraft("/root", "a/hi.html")).toBeNull();
  });

  it("keeps folders apart", () => {
    saveDraft("/root-a", "hi.html", "A");
    saveDraft("/root-b", "hi.html", "B");
    expect(getDraft("/root-a", "hi.html")).toBe("A");
    expect(getDraft("/root-b", "hi.html")).toBe("B");
  });

  it("still reads drafts written before timestamps existed", () => {
    localStorage.setItem("htmlove:draft:/root::legacy.html", "<div>legacy</div>");
    expect(getDraft("/root", "legacy.html")).toBe("<div>legacy</div>");
  });

  it("sweeps only drafts older than the cutoff", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    saveDraft("/root", "old.css", ".old{}");
    vi.setSystemTime(new Date("2026-03-15T00:00:00Z"));
    saveDraft("/root", "new.css", ".new{}");

    sweepDrafts();

    expect(getDraft("/root", "old.css")).toBeNull();
    expect(getDraft("/root", "new.css")).toBe(".new{}");
  });
});

describe("scheduleDraftSave", () => {
  it("writes once after the debounce window", () => {
    scheduleDraftSave("/root", "a.css", ".a{}", false, 400);
    scheduleDraftSave("/root", "a.css", ".ab{}", false, 400);
    scheduleDraftSave("/root", "a.css", ".abc{}", false, 400);

    expect(getDraft("/root", "a.css")).toBeNull();
    vi.advanceTimersByTime(500);
    expect(getDraft("/root", "a.css")).toBe(".abc{}");
  });

  it("removes the draft when content is back at the baseline", () => {
    saveDraft("/root", "a.css", "old draft");
    scheduleDraftSave("/root", "a.css", ".baseline{}", true, 400);
    vi.advanceTimersByTime(500);
    expect(getDraft("/root", "a.css")).toBeNull();
  });

  it("survives storage being unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    expect(() => saveDraft("/root", "x", "y")).not.toThrow();
    expect(getDraft("/root", "x")).toBeNull();
    expect(() => clearDraft("/root", "x")).not.toThrow();
    Object.defineProperty(window, "localStorage", original!);
  });
});
