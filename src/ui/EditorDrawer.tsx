/**
 * EditorDrawer — the code half of the dashboard. It slides in on the
 * left (pushing the board over, so the edited component stays visible)
 * with one tab per file, live edits flowing straight to the panel
 * preview. Save writes every dirty file back to disk.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Boxes, Paintbrush, RotateCcw, Save } from "lucide-react";
import { useStore } from "../state/store";
import { KindBadge } from "./Badges";
import { CodeEditor } from "./CodeEditor";
import { DepsPanel } from "./DepsPanel";
import { TokensPanel } from "./TokensPanel";
import { toast } from "./Toasts";
import { componentPaths, effectiveFile, languageFor } from "../core/edits";
import { getDraft } from "../core/drafts";
import { missingTokens } from "../core/tokens";
import { baseOf } from "../core/catalog";

export function EditorDrawer() {
  const {
    session,
    editingId,
    closeEditor,
    setEdit,
    discardEdits,
    saveEdits,
    saving,
    lastSavedAt,
    dirty,
  } = useStore();

  const [activePath, setActivePath] = useState<string | null>(null);
  const [restored, setRestored] = useState<string[]>([]);
  const [panel, setPanel] = useState<"deps" | "tokens" | null>(null);

  const component = useMemo(
    () => (session && editingId ? session.catalog.find((c) => c.id === editingId) : undefined),
    [session, editingId],
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
    setPanel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component?.id]);

  /* Esc closes the drawer */
  useEffect(() => {
    if (!editingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeEditor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId, closeEditor]);

  const dirtySet = useMemo(() => new Set(dirty), [dirty]);

  const stubCount = component
    ? component.imports.filter((entry) => entry.status === "stub").length
    : 0;
  const tokenCount = useMemo(() => {
    if (!session || !component) return 0;
    const sources = componentPaths(component).map((path) => effectiveFile(session, path));
    return missingTokens(sources).length;
  }, [session, component]);

  if (!session || !component) return null;

  const componentDirty = paths.filter((p) => dirtySet.has(p));
  const activeValue = activePath ? effectiveFile(session, activePath) : "";
  const restoreNote = restored.filter((p) => session.edits.has(p));
  const justSaved = lastSavedAt !== null && Date.now() - lastSavedAt < 2500 && dirty.length === 0;

  const save = async () => {
    const count = dirty.length;
    const written = await saveEdits();
    if (written > 0) {
      toast(`Saved ${written} file${written === 1 ? "" : "s"}`);
    } else if (count > 0) {
      toast("Nothing was saved — check the error banner", "bad");
    }
  };

  return (
    <aside className="drawer" aria-label={`Editing ${component.name}`}>
      <div className="drawer-bar">
        <button
          className="btn ghost small"
          onClick={closeEditor}
          title="Back to the full board (Esc)"
          aria-label="Close the editor"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="drawer-name">{component.name}</span>
        <KindBadge kind={component.kind} />
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
          onClick={() => void save()}
          disabled={dirty.length === 0 || saving}
          title={`Write ${dirty.length} changed file(s) back to disk (Ctrl/Cmd+S)`}
        >
          <Save size={13} />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {component.attribution && (
        <div className="drawer-credit faint">credit: {component.attribution}</div>
      )}

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
    </aside>
  );
}
