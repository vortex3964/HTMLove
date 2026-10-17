/**
 * TokensPanel — CSS custom properties a component uses but never
 * defines. Missing ones are injected into previews with a sane default;
 * here you can adjust the values and promote them into
 * playground.deps.json so they stick for everyone.
 */
import { useMemo } from "react";
import { Paintbrush } from "lucide-react";
import type { Component } from "../core/types";
import { componentPaths, effectiveFile } from "../core/edits";
import { componentTokens } from "../core/manifest";
import { definedTokenNames, missingTokens, suggestTokenValue } from "../core/tokens";
import { useStore } from "../state/store";

function looksLikeColor(value: string): boolean {
  return /^#|^rgb|^hsl|^oklch|^[a-z]+$/i.test(value.trim());
}

export function TokensPanel({ component }: { component: Component }) {
  const { session, manifest, tokens, setToken, saveManifest, saving } = useStore();

  const report = useMemo(() => {
    if (!session) return { used: [] as string[], missing: new Set<string>() };
    const sources = componentPaths(component).map((path) => effectiveFile(session, path));
    return {
      used: [...new Set([...definedTokenNames(sources), ...missingTokens(sources)])].sort(),
      missing: new Set(missingTokens(sources)),
    };
  }, [session, component]);

  if (!session) return null;

  const manifestTokens = componentTokens(manifest, component);
  const valueOf = (name: string): string =>
    tokens[name] ?? manifestTokens[name] ?? manifestTokens[`--${name}`] ?? "";
  const names = [
    ...new Set([
      ...report.used,
      ...Object.keys(manifestTokens).map((k) => k.replace(/^--/, "")),
      ...Object.keys(tokens).map((k) => k.replace(/^--/, "")),
    ]),
  ].sort();

  const edits = names.filter((name) => (tokens[name] ?? "") !== "");
  const missingCount = report.missing.size;

  return (
    <div className="code-panel">
      <div className="panel-head">
        <span className="panel-title">
          <Paintbrush size={13} /> Design tokens
        </span>
        <span className="faint">
          {names.length === 0
            ? "no custom properties"
            : `${names.length} propert${names.length === 1 ? "y" : "ies"}${
                missingCount > 0 ? ` · ${missingCount} undefined` : ""
              }`}
        </span>
      </div>

      {names.length === 0 ? (
        <p className="faint panel-note">
          This component defines and uses no CSS variables (<code>var(--…)</code>) — nothing to
          configure.
        </p>
      ) : (
        <ul className="token-list">
          {names.map((name) => {
            const value = valueOf(name);
            const injected = report.missing.has(name);
            return (
              <li key={name} className="token-row">
                <code className="token-name">--{name}</code>
                <span className={`badge ${injected ? "warn" : "ok"}`}>
                  {injected ? "undefined — injected" : "defined"}
                </span>
                <input
                  className="token-input mono"
                  value={value}
                  placeholder={suggestTokenValue(name)}
                  spellCheck={false}
                  onChange={(e) => setToken(name, e.target.value)}
                />
                {looksLikeColor(value) && (
                  <span className="token-swatch" style={{ background: value }} />
                )}
                {injected && (
                  <button
                    className="btn ghost small"
                    onClick={() => setToken(name, suggestTokenValue(name))}
                  >
                    use default
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {edits.length > 0 && (
        <div className="panel-foot">
          <button
            className="btn primary small"
            disabled={saving}
            onClick={() => {
              const merged = { ...(manifest.tokens ?? {}) };
              for (const name of edits) {
                merged[`--${name}`] = tokens[name];
              }
              void saveManifest({ ...manifest, tokens: merged }).then(() => {
                for (const name of edits) setToken(name, "");
              });
            }}
          >
            {saving ? "Saving…" : `Save ${edits.length} token${edits.length === 1 ? "" : "s"} into playground.deps.json`}
          </button>
        </div>
      )}
    </div>
  );
}
