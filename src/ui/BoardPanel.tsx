/**
 * BoardPanel — one mounted component on the dashboard: a draggable
 * header with the actions, an optional props editor, a lazily mounted
 * live preview and a quiet footer with warnings.
 */
import { useEffect, useState } from "react";
import { Braces, Code2, GripVertical, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useStore } from "../state/store";
import { useInView } from "./useInView";
import { PreviewFrame } from "./PreviewFrame";
import { KindBadge } from "./Badges";
import { PropsEditor } from "./PropsEditor";
import { dragSession } from "../core/board";
import { componentPaths, effectiveFile } from "../core/edits";
import { sampleProps } from "../core/propsSample";
import type { Component } from "../core/types";

interface BoardPanelProps {
  component: Component;
  /** Where a dragged panel would land relative to this one. */
  dropSide: "before" | "after" | null;
  onDragOverPanel(side: "before" | "after"): void;
  onDragLeavePanel(): void;
  onDropPanel(): void;
}

export function BoardPanel({
  component,
  dropSide,
  onDragOverPanel,
  onDragLeavePanel,
  onDropPanel,
}: BoardPanelProps) {
  const { session, backend, prefs, propsById, setProps, openEditor, removeFromBoard, editingId } =
    useStore();
  const [reloadKey, setReloadKey] = useState(0);
  const [propsOpen, setPropsOpen] = useState(false);
  const [ref, inView] = useInView<HTMLElement>();
  const editing = editingId === component.id;

  /* opening the editor brings its panel into view */
  useEffect(() => {
    if (!editing) return;
    document
      .getElementById(`hv-panel-${component.id}`)
      ?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [editing, component.id]);

  if (!session) return null;

  const props = propsById[component.id];
  const stubs = component.imports.filter((entry) => entry.status === "stub").length;
  const poster = component.screenshots[0];
  const sourcePath = componentPaths(component)[0];
  const sourceText = sourcePath ? effectiveFile(session, sourcePath) : "";
  const applySampleProps = () => {
    const sample = sampleProps(sourceText);
    if (Object.keys(sample.props).length === 0) return;
    setProps(component.id, sample.props);
    setPropsOpen(true);
  };

  return (
    <article
      id={`hv-panel-${component.id}`}
      ref={ref}
      className={`panel card${editing ? " editing" : ""}${
        dropSide ? ` drop-${dropSide}` : ""
      }`}
      onDragOver={(e) => {
        if (dragSession.kind !== "move") return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        onDragOverPanel(e.clientX < rect.left + rect.width / 2 ? "before" : "after");
      }}
      onDragLeave={() => onDragLeavePanel()}
      onDrop={(e) => {
        if (dragSession.kind !== "move") return;
        e.preventDefault();
        e.stopPropagation();
        onDropPanel();
      }}
    >
      <header className="panel-top">
        <span
          className="panel-grip"
          draggable
          title="Drag to reorder"
          aria-label="Drag to reorder"
          onDragStart={(e) => {
            dragSession.kind = "move";
            dragSession.id = component.id;
            e.dataTransfer.setData("text/plain", component.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            dragSession.kind = null;
            dragSession.id = null;
          }}
        >
          <GripVertical size={13} />
        </span>
        <span className="panel-name">{component.name}</span>
        <KindBadge kind={component.kind} />
        <span className="spacer" />
        <button
          className="btn ghost small"
          onClick={() => openEditor(component.id)}
          title="Edit this component's code"
        >
          <Code2 size={13} />
          Edit code
        </button>
        {component.kind === "tsx" && (
          <button
            className={`btn ghost small icon${propsOpen ? " active" : ""}`}
            onClick={() => setPropsOpen((open) => !open)}
            title="Props for this component (JSON)"
            aria-label="Props"
            aria-pressed={propsOpen}
          >
            <Braces size={13} />
          </button>
        )}
        <button
          className="btn ghost small icon"
          onClick={() => setReloadKey((k) => k + 1)}
          title="Reload preview"
          aria-label="Reload preview"
        >
          <RefreshCw size={13} />
        </button>
        <button
          className="btn ghost small icon"
          onClick={() => removeFromBoard(component.id)}
          title="Remove from the board"
          aria-label="Remove from the board"
        >
          <X size={13} />
        </button>
      </header>

      {propsOpen && (
        <PropsEditor
          props={props}
          source={sourceText}
          onApply={(next) => setProps(component.id, next)}
        />
      )}

      <div className="panel-preview">
        {inView ? (
          <PreviewFrame
            component={component}
            session={session}
            paused={prefs.paused}
            reloadKey={reloadKey}
            props={props}
            className="preview-frame"
            onSampleProps={applySampleProps}
          />
        ) : poster ? (
          <img
            className="panel-poster"
            src={backend.assetUrl(session.root, poster)}
            alt={`${component.name} reference`}
            loading="lazy"
          />
        ) : (
          <div className="panel-skeleton" />
        )}
      </div>

      <footer className="panel-foot">
        {component.cssOnly && (
          <span className="badge warn">
            <TriangleAlert size={10} /> css only
          </span>
        )}
        {stubs > 0 && (
          <span
            className="badge warn"
            title={component.imports
              .filter((entry) => entry.status === "stub")
              .map((entry) => entry.specifier)
              .join("\n")}
          >
            <TriangleAlert size={10} />
            {stubs} stub{stubs === 1 ? "" : "s"}
          </span>
        )}
        {props && Object.keys(props).length > 0 && <span className="badge accent">props</span>}
        {component.usesTailwind && <span className="badge">tailwind</span>}
        <span className="spacer" />
        {component.dir && <span className="faint mono panel-dir">{component.dir}/</span>}
      </footer>
    </article>
  );
}
