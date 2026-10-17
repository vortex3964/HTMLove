/**
 * DetailView — the playground. Code on the left (one editor tab per file),
 * the live preview on the right. Typing updates the preview shortly
 * after you pause; Save writes every dirty file straight back to disk.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  Moon,
  Paintbrush,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Sun,
} from "lucide-react";
import { useStore } from "../state/store";
import { PreviewFrame } from "./PreviewFrame";
import { KindBadge } from "./Badges";
import { CodeEditor } from "./CodeEditor";
import { DepsPanel } from "./DepsPanel";
import { TokensPanel } from "./TokensPanel";
import { useDebounced } from "./useDebounced";
import {
  componentPaths,
  effectiveFile,
  languageFor,
} from "../core/edits";
import { getDraft } from "../core/drafts";
import { missingTokens } from "../core/tokens";
import { baseOf } from "../core/catalog";

export function DetailView() {
  const {
    session,
    view,
    backToGallery,
    prefs,
    setPrefs,
    setEdit,
    discardEdits,
    saveEdits,
    saving,
    lastSavedAt,
    dirty,
  } = useStore();

  const [reloadKey, setReloadKey] = useState(0);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [restored, setRestored] = useState<string[]>([]);
  const [panel, setPanel] = useState<"deps" | "tokens" | null>(null);

  const component = useMemo(
    () =>
      session && view.mode === "detail"
        ? session.catalog.find((c) => c.id === view.id)
        : undefined,
    [session, view],
  );

  const paths = useMemo(() => (component ? componentPaths(component) : []), [component]);

  /* when a component opens: pick the first tab and restore any drafts */
  useEffect(() => {
    if (!component || !session) return;
    const foundDrafts: string[] = [];
    for (const path of componentPaths(component)) {
      const draft = getDraft(session.root, path);
      if (draft !== null && draft !== (session.files.get(path) ?? "")) {
        setEdit(path, draft);
        foundDrafts.push(path);
      }
    }
    setRestored(foundDrafts);
    setActivePath(componentPaths(component)[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component?.id]);

  const dirtySet = useMemo(() => new Set(dirty), [dirty]);

  const stubCount = component
    ? component.imports.filter((entry) => entry.status === "stub").length
    : 0;
  const tokenCount = useMemo(() => {
    if (!session || !component) return 0;
    const sources = componentPaths(component).map((path) => effectiveFile(session, path));
    return missingTokens(sources).length;
  }, [session, component]);

  /* calm the preview while typing */
  const debouncedEdits = useDebounced(session?.edits, 350);
  const previewSession = useMemo(() => {
    if (!session) return null;
    return { ...session, edits: debouncedEdits ?? session.edits };
  }, [session, debouncedEdits]);

  if (!session || !component || !previewSession) return null;

  const componentDirty = paths.filter((p) => dirtySet.has(p));
  const activeValue = activePath ? effectiveFile(session, activePath) : "";
  const restoreNote = restored.filter((p) => session.edits.has(p));
  const justSaved = lastSavedAt !== null && Date.now() - lastSavedAt < 2500 && dirty.length === 0;

  return (
    <div className="detail">
      <div className="detail-bar">
        <button className="btn ghost small" onClick={backToGallery}>
          <ArrowLeft size={14} />
          Gallery
        </button>
        <span className="detail-name">{component.name}</span>
        <KindBadge kind={component.kind} />
        {component.attribution && (
          <span className="faint" style={{ fontSize: 12 }}>
            {component.attribution}
          </span>
        )}
        {restoreNote.length > 0 && (
          <span className="badge accent" title={`Drafts found for: ${restoreNote.join(", ")}`}>
            draft restored
          </span>
        )}
        <span className="spacer" />

        {componentDirty.length > 0 && (
          <span className="badge warn">{componentDirty.length} unsaved</span>
        )}
        {justSaved && <span className="badge ok">saved ✓</span>}

        <button
          className="btn ghost small"
          onClick={() => discardEdits(paths)}
          disabled={componentDirty.length === 0 || saving}
          title="Revert this component's edits to the last on-disk version"
        >
          <RotateCcw size={13} />
          Reset
        </button>
        <button
          className="btn primary small"
          onClick={() => void saveEdits()}
          disabled={dirty.length === 0 || saving}
          title={`Write ${dirty.length} changed file(s) back to disk`}
        >
          <Save size={13} />
          {saving ? "Saving…" : "Save"}
        </button>

        <button
          className="btn ghost small"
          onClick={() => setReloadKey((k) => k + 1)}
          title="Reload preview"
        >
          <RefreshCw size={13} />
        </button>
        <button
          className="btn ghost small"
          onClick={() => setPrefs({ paused: !prefs.paused })}
          title={prefs.paused ? "Resume animations" : "Pause animations"}
        >
          {prefs.paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
        <button
          className="btn ghost small"
          onClick={() => setPrefs({ canvas: prefs.canvas === "light" ? "dark" : "light" })}
          title="Toggle preview background"
        >
          {prefs.canvas === "light" ? <Moon size={13} /> : <Sun size={13} />}
        </button>
      </div>

      <div className="detail-body">
        <section className="detail-code">
          <div className="code-tabs">
            {paths.map((path) => (
              <button
                key={path}
                className={`code-tab${activePath === path ? " active" : ""}`}
                onClick={() => setActivePath(path)}
                title={path}
              >
                {baseOf(path)}
                {dirtySet.has(path) && <span className="dirty-dot" title="unsaved" />}
              </button>
            ))}
          </div>
          {activePath ? (
            <CodeEditor
              key={`${component.id}:${activePath}`}
              value={activeValue}
              language={languageFor(activePath)}
              onChange={(next) => setEdit(activePath, next)}
              ariaLabel={`${component.name} — ${activePath}`}
            />
          ) : (
            <div className="preview-note">This component has no editable files.</div>
          )}
          <div className="code-foot faint mono">
            <span className="code-foot-path">
              {activePath ?? ""}
              {dirtySet.has(activePath ?? "") ? (
                <span className="code-foot-dirty">● unsaved changes</span>
              ) : (
                <span> · in sync with disk</span>
              )}
            </span>
            <span className="spacer" />
            <button
              className={`btn ghost small${panel === "deps" ? " active" : ""}`}
              onClick={() => setPanel(panel === "deps" ? null : "deps")}
              title="What this component imports and how each import resolves"
            >
              <Boxes size={12} />
              Deps
              {stubCount > 0 && <span className="badge warn">{stubCount}</span>}
            </button>
            <button
              className={`btn ghost small${panel === "tokens" ? " active" : ""}`}
              onClick={() => setPanel(panel === "tokens" ? null : "tokens")}
              title="CSS custom properties this component uses"
            >
              <Paintbrush size={12} />
              Tokens
              {tokenCount > 0 && <span className="badge warn">{tokenCount}</span>}
            </button>
          </div>
          {panel === "deps" && <DepsPanel component={component} />}
          {panel === "tokens" && <TokensPanel component={component} />}
        </section>

        <section className="detail-preview">
          <PreviewFrame
            component={component}
            session={previewSession}
            canvas={prefs.canvas}
            paused={prefs.paused}
            reloadKey={reloadKey}
            className="preview-frame detail-frame"
          />
        </section>
      </div>
    </div>
  );
}
