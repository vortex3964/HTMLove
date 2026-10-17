/**
 * DepsPanel — the dependency report for one component, living under the
 * editor. Every import is classified; stubs get a one-field fix (paste a
 * URL, saved into playground.deps.json) so gaps are closable in place.
 */
import { useState } from "react";
import { Link2, Package } from "lucide-react";
import type { Component } from "../core/types";
import type { PlanStatus } from "../core/deps";
import { useStore } from "../state/store";

const TONES: Record<PlanStatus, string> = {
  react: "ok",
  local: "ok",
  external: "accent",
  asset: "warn",
  stub: "bad",
};

const LABELS: Record<PlanStatus, string> = {
  react: "react",
  local: "local",
  external: "cdn",
  asset: "asset",
  stub: "stub",
};

export function DepsPanel({ component }: { component: Component }) {
  const { session, manifest, saveManifest, saving } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (!session) return null;

  if (component.kind !== "tsx") {
    return (
      <div className="code-panel">
        <p className="faint panel-note">
          Dependency analysis is for React components — this snippet has no imports.
          {component.remoteAssets.length > 0
            ? ` It references ${component.remoteAssets.length} remote asset${component.remoteAssets.length === 1 ? "" : "s"}; open the doctor to probe them.`
            : ""}
        </p>
      </div>
    );
  }

  const stubs = component.imports.filter((entry) => entry.status === "stub");
  const pinned = (spec: string) => manifest.packages?.[spec];

  const submitFix = (specifier: string) => {
    const url = (drafts[specifier] ?? "").trim();
    if (!url) return;
    void saveManifest({
      ...manifest,
      urls: { ...(manifest.urls ?? {}), [specifier]: url },
    });
  };

  return (
    <div className="code-panel">
      <div className="panel-head">
        <span className="panel-title">
          <Package size={13} /> Dependencies
        </span>
        <span className="faint">
          {component.imports.length} import{component.imports.length === 1 ? "" : "s"}
          {stubs.length > 0 ? ` · ${stubs.length} stubbed` : " · all accounted for"}
        </span>
      </div>

      {component.imports.length === 0 ? (
        <p className="faint panel-note">This component imports nothing.</p>
      ) : (
        <ul className="dep-list">
          {component.imports.map((entry, index) => (
            <li key={`${entry.specifier}:${index}`} className="dep-row">
              <code className="dep-spec" title={entry.specifier}>
                {entry.specifier}
              </code>
              {entry.names.length > 0 && (
                <span className="dep-names faint">
                  {entry.names.slice(0, 4).join(", ")}
                  {entry.names.length > 4 ? " …" : ""}
                </span>
              )}
              <span className={`badge ${TONES[entry.status]}`}>{LABELS[entry.status]}</span>
              <span className="dep-note faint">{entry.note}</span>
              {entry.status === "external" && pinned(entry.specifier) && (
                <span className="faint">v{pinned(entry.specifier)}</span>
              )}

              {entry.status === "stub" && (
                <span className="dep-fix">
                  <Link2 size={12} className="faint" />
                  <input
                    className="dep-fix-input"
                    placeholder="https://…  (fix this import)"
                    value={drafts[entry.specifier] ?? ""}
                    spellCheck={false}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [entry.specifier]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitFix(entry.specifier);
                    }}
                  />
                  <button
                    className="btn ghost small"
                    disabled={!(drafts[entry.specifier] ?? "").trim() || saving}
                    onClick={() => submitFix(entry.specifier)}
                  >
                    Use URL
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="faint panel-note">
        Custom URLs are saved to <code>playground.deps.json</code> and resolve this import in
        every preview from then on.
      </p>
    </div>
  );
}
