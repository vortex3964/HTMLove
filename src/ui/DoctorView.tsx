/**
 * DoctorView — one table over the whole folder: which components import
 * what, where those imports will come from, which remote assets still
 * respond, and one-click repairs (dead assets, custom import URLs).
 */
import { useMemo, useState } from "react";
import { Activity, ArrowLeft, Wrench } from "lucide-react";
import { useStore } from "../state/store";
import { KindBadge } from "./Badges";
import { toast } from "./Toasts";
import { esmUrl } from "../core/packages";
import { probeAssetUrl, type ProbeStatus } from "../core/assets";
import { parseManifest } from "../core/manifest";
import type { Component } from "../core/types";
import type { PlanEntry } from "../core/deps";

type ProbeState = ProbeStatus | "pending";

const NEW_MANIFEST = `{
  "packages": {},
  "urls": {},
  "stubs": [],
  "tokens": {}
}
`;

function chipTone(status: PlanEntry["status"]): string {
  if (status === "stub") return "bad";
  if (status === "asset") return "warn";
  if (status === "external") return "accent";
  return "ok";
}

function shortUrl(url: string): string {
  const bare = url.replace(/^https?:\/\//, "");
  return bare.length > 38 ? `${bare.slice(0, 36)}…` : bare;
}

export function DoctorView() {
  const {
    session,
    showBoard,
    openOnBoard,
    manifest,
    manifestError,
    saveManifest,
    saving,
    applyAssetFix,
  } = useStore();
  const [probes, setProbes] = useState<Map<string, ProbeState>>(new Map());
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [manifestDraft, setManifestDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const components = session?.catalog ?? [];

  /** Every URL a preview will fetch, with the components that need it. */
  const usage = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (url: string, name: string) => {
      if (!/^https?:\/\//.test(url)) return;
      const names = map.get(url);
      if (names) names.add(name);
      else map.set(url, new Set([name]));
    };
    for (const component of components) {
      for (const entry of component.imports) {
        if (entry.status !== "external") continue;
        add(
          manifest.urls?.[entry.specifier] ??
            (/^https?:/.test(entry.specifier)
              ? entry.specifier
              : esmUrl(entry.specifier, manifest.packages)),
          component.name,
        );
      }
      for (const url of component.remoteAssets) add(url, component.name);
    }
    return map;
  }, [components, manifest]);

  const probe = async (url: string) => {
    setProbes((prev) => new Map(prev).set(url, "pending"));
    const status = await probeAssetUrl(url);
    setProbes((prev) => new Map(prev).set(url, status));
  };

  const probeAll = () => {
    for (const url of usage.keys()) void probe(url);
  };

  const failingAssets = (component: Component) =>
    component.remoteAssets.filter((url) => probes.get(url) === "fail");

  const hasProblems = (component: Component) =>
    component.imports.some((entry) => entry.status === "stub") ||
    failingAssets(component).length > 0;

  const counts = useMemo(() => {
    let stubs = 0;
    let external = 0;
    let assets = 0;
    let failed = 0;
    for (const component of components) {
      stubs += component.imports.filter((entry) => entry.status === "stub").length;
      external += component.imports.filter((entry) => entry.status === "external").length;
      assets += component.remoteAssets.length;
      failed += component.remoteAssets.filter((url) => probes.get(url) === "fail").length;
    }
    return { stubs, external, assets, failed };
  }, [components, probes]);

  if (!session) return null;

  const shown = onlyProblems ? components.filter(hasProblems) : components;

  const saveDraft = () => {
    const text = manifestDraft ?? "";
    if (text.trim() === "") {
      setDraftError("playground.deps.json cannot be empty — use {} to clear it.");
      return;
    }
    const { manifest: next, error } = parseManifest(text);
    if (error) {
      setDraftError(error);
      return;
    }
    setDraftError(null);
    void saveManifest(next).then((ok) => {
      if (ok) {
        setManifestDraft(null);
        toast("playground.deps.json saved");
      }
    });
  };

  return (
    <div className="doctor">
      <div className="detail-bar">
        <button className="btn ghost small" onClick={showBoard}>
          <ArrowLeft size={14} />
          Board
        </button>
        <span className="detail-name">Dependency doctor</span>
        <span className="badge">{components.length} components</span>
        <span className="badge">{counts.external} cdn imports</span>
        {counts.stubs > 0 && <span className="badge bad">{counts.stubs} stubbed</span>}
        <span className="badge">{counts.assets} remote assets</span>
        {counts.failed > 0 && <span className="badge bad">{counts.failed} unreachable</span>}

        <span className="spacer" />

        <label className="doctor-toggle">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(e) => setOnlyProblems(e.target.checked)}
          />
          only problems
        </label>
        <button className="btn ghost small" onClick={probeAll} title="Test every URL a preview fetches">
          <Activity size={13} />
          Probe all
        </button>
      </div>

      <div className="doctor-body">
        {shown.length === 0 ? (
          <div className="gallery-empty faint">
            No problems found — imports resolve, assets respond.
          </div>
        ) : (
          <table className="doctor-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Imports</th>
                <th>Remote assets</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((component) => {
                const failing = failingAssets(component);
                return (
                  <tr key={component.id}>
                    <td className="doctor-name-cell">
                      <button
                        className="doctor-name"
                        onClick={() => openOnBoard(component.id)}
                        title="Open on the board, with its code beside it"
                      >
                        {component.name}
                      </button>
                      <KindBadge kind={component.kind} />
                    </td>
                    <td className="doctor-chips">
                      {component.imports.length === 0 ? (
                        <span className="faint">—</span>
                      ) : (
                        component.imports.map((entry, index) => {
                          const url =
                            entry.status === "external"
                              ? (manifest.urls?.[entry.specifier] ??
                                (/^https?:/.test(entry.specifier)
                                  ? entry.specifier
                                  : esmUrl(entry.specifier, manifest.packages)))
                              : undefined;
                          const state = url ? probes.get(url) : undefined;
                          return (
                            <button
                              key={`${entry.specifier}:${index}`}
                              className={`chip doctor-chip ${chipTone(entry.status)}`}
                              disabled={!url}
                              title={[entry.specifier, entry.note, url]
                                .filter(Boolean)
                                .join("\n")}
                              onClick={url ? () => void probe(url) : undefined}
                            >
                              {entry.specifier}
                              {state && (
                                <span className={`probe-dot ${state}`}>
                                  {state === "pending" ? "…" : state === "ok" ? "✓" : "✗"}
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </td>
                    <td className="doctor-chips">
                      {component.remoteAssets.length === 0 ? (
                        <span className="faint">—</span>
                      ) : (
                        component.remoteAssets.map((url, index) => {
                          const state = probes.get(url);
                          return (
                            <button
                              key={`${url}:${index}`}
                              className={`chip doctor-chip ${
                                state === "fail" ? "bad" : state === "ok" ? "ok" : "warn"
                              }`}
                              title={url}
                              onClick={() => void probe(url)}
                            >
                              {shortUrl(url)}
                              {state && (
                                <span className={`probe-dot ${state}`}>
                                  {state === "pending" ? "…" : state === "ok" ? "✓" : "✗"}
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </td>
                    <td className="doctor-actions">
                      {failing.length > 0 && (
                        <button
                          className="btn ghost small"
                          title="Replace the dead URLs in this component's files (as editable changes)"
                          onClick={() => {
                            const patched = applyAssetFix(component.id, failing);
                            toast(
                              patched > 0
                                ? `${component.name}: replaced ${failing.length} dead URL${
                                    failing.length === 1 ? "" : "s"
                                  } in ${patched} file${patched === 1 ? "" : "s"} — review, then Save.`
                                : `${component.name}: nothing to replace.`,
                              patched > 0 ? "ok" : "warn",
                            );
                          }}
                        >
                          <Wrench size={12} />
                          Fix {failing.length}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <details className="manifest-box">
          <summary>
            playground.deps.json{" "}
            {manifestError ? (
              <span className="badge bad">invalid — defaults in use</span>
            ) : session.manifestText ? (
              <span className="badge ok">active</span>
            ) : (
              <span className="badge">not in this folder yet</span>
            )}
          </summary>
          {manifestError && <p className="faint panel-note">{manifestError}</p>}
          <p className="faint panel-note">
            Version pins, custom URLs, forced stubs and design tokens for this folder. Saving
            writes the file next to your components.
          </p>
          <textarea
            className="manifest-text mono"
            spellCheck={false}
            rows={14}
            value={manifestDraft ?? session.manifestText ?? NEW_MANIFEST}
            onChange={(e) => {
              setManifestDraft(e.target.value);
              setDraftError(null);
            }}
          />
          <div className="manifest-actions">
            <button
              className="btn primary small"
              disabled={saving || manifestDraft === null}
              onClick={saveDraft}
            >
              {saving ? "Saving…" : "Save manifest"}
            </button>
            <button
              className="btn ghost small"
              disabled={manifestDraft === null}
              onClick={() => {
                setManifestDraft(null);
                setDraftError(null);
              }}
            >
              Revert
            </button>
            {draftError && <span className="badge bad">{draftError}</span>}
          </div>
        </details>
      </div>
    </div>
  );
}
