/**
 * tokens — CSS custom properties that snippets use but never define.
 * (The glass-folder snippet leans on `--primarylw`; without it the
 * component renders flat.) htmlove finds the gap and injects values.
 */

const VAR_USE_RE = /var\(\s*--([\w-]+)/g;
const VAR_DEF_RE = /(?:^|[;{\s])--([\w-]+)\s*:/g;

/** Tailwind's own runtime variables are none of our business. */
const IGNORED_PREFIXES = ["tw-", "hv-"];

function isInteresting(name: string): boolean {
  return !IGNORED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function usedTokenNames(sources: string[]): string[] {
  const names = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(VAR_USE_RE)) {
      if (isInteresting(match[1])) names.add(match[1]);
    }
  }
  return [...names].sort();
}

export function definedTokenNames(sources: string[]): string[] {
  const names = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(VAR_DEF_RE)) {
      if (isInteresting(match[1])) names.add(match[1]);
    }
  }
  return [...names].sort();
}

/** Used but never defined anywhere in the component's own sources. */
export function missingTokens(sources: string[]): string[] {
  const defined = new Set(definedTokenNames(sources));
  return usedTokenNames(sources).filter((name) => !defined.has(name));
}

export function buildTokenCss(tokens: Record<string, string>): string {
  const entries = Object.entries(tokens).filter(([, value]) => value.trim() !== "");
  if (entries.length === 0) return "";
  const body = entries
    .map(([name, value]) => `${name.startsWith("--") ? name : `--${name}`}:${value};`)
    .join("");
  return `:root{${body}}`;
}

/** A sensible starting value so the panel is useful with zero thinking. */
export function suggestTokenValue(name: string): string {
  const bare = name.replace(/^--/, "").toLowerCase();
  if (/primary/.test(bare)) return "#6366f1";
  if (/secondary/.test(bare)) return "#8b5cf6";
  if (/accent/.test(bare)) return "#0ea5e9";
  if (/danger|error|destructive|red/.test(bare)) return "#ef4444";
  if (/success|positive|green/.test(bare)) return "#22c55e";
  if (/warning|warn|yellow/.test(bare)) return "#f59e0b";
  if (/background|surface|bg\b/.test(bare)) return "#ffffff";
  if (/text|foreground|fg\b/.test(bare)) return "#111827";
  if (/border|stroke|line/.test(bare) && !/line-height/.test(bare)) return "#e5e7eb";
  if (/radius|round/.test(bare)) return "12px";
  if (/shadow/.test(bare)) return "0 8px 20px rgba(15, 23, 42, 0.12)";
  if (/size|width|height/.test(bare)) return "16px";
  if (/speed|duration|time/.test(bare)) return "400ms";
  return "#6366f1";
}
