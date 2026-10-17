/**
 * BoardPanel — one mounted component on the dashboard, drawn like a
 * little window: drag the header to move it, drag the corner to resize
 * it. The panel follows the pointer locally and commits to the store
 * (which persists per folder) when the gesture ends. Inside: the
 * actions, an optional props editor, a lazily mounted live preview and
 * a quiet footer with warnings.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Braces, Code2, GripVertical, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useStore } from "../state/store";
import { useInView } from "./useInView";
import { PreviewFrame } from "./PreviewFrame";
import { KindBadge } from "./Badges";
import { PropsEditor } from "./PropsEditor";
import { clampBox, defaultPanelBox, type PanelBox } from "../core/board";
import { componentPaths, effectiveFile } from "../core/edits";
import { sampleProps } from "../core/propsSample";
import type { Component } from "../core/types";

interface BoardPanelProps {
  component: Component;
  /** Where the panel sits and how big it is (canvas pixels). */
  box: PanelBox | undefined;
}

export function BoardPanel({ component, box }: BoardPanelProps) {
  const {
    session,
    backend,
    prefs,
    propsById,
    setProps,
    openEditor,
    removeFromBoard,
    setPanelBox,
    editingId,
  } = useStore();
  const [reloadKey, setReloadKey] = useState(0);
  const [propsOpen, setPropsOpen] = useState(false);
  const [ref, inView] = useInView<HTMLElement>();
  const [localBox, setLocalBox] = useState<PanelBox>(() => box ?? defaultPanelBox());
  const [gesture, setGesture] = useState<"move" | "resize" | null>(null);
  const boxRef = useRef(localBox);
  const editing = editingId === component.id;

  /* follow the stored box unless a gesture is in progress right now */
  useEffect(() => {
    if (gesture) return;
    const next = box ?? defaultPanelBox();
    boxRef.current = next;
    setLocalBox(next);
  }, [box, gesture]);

  /* opening the editor brings its panel into view */
  useEffect(() => {
    if (!editing) return;
    document
      .getElementById(`hv-panel-${component.id}`)
      ?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [editing, component.id]);

  /**
   * Shared pointer gesture: the header moves the panel (by its x/y),
   * the corner handle resizes it (by its w/h). `start` keeps the box
   * from when the pointer went down, so nothing drifts mid-gesture.
   */
  const startGesture = (e: ReactPointerEvent<HTMLElement>, mode: "move" | "resize") => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (mode === "move" && target.closest("button, a, input, textarea, select")) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* jsdom and friends do not implement pointer capture */
    }

    const start = boxRef.current;
    const width = (e.currentTarget as HTMLElement).closest(".board-canvas")?.clientWidth ?? 0;
    const originX = e.clientX;
    const originY = e.clientY;

    setGesture(mode);
    document.body.classList.add("hv-panel-interacting");

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;
      const raw: PanelBox =
        mode === "move"
          ? { ...start, x: start.x + dx, y: start.y + dy }
          : { ...start, w: start.w + dx, h: start.h + dy };
      const next = clampBox(raw, width);
      boxRef.current = next;
      setLocalBox(next);
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      document.body.classList.remove("hv-panel-interacting");
      setGesture(null);
      setPanelBox(component.id, boxRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

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
      className={`panel card board-panel${editing ? " editing" : ""}${
        gesture ? ` interacting gesture-${gesture}` : ""
      }`}
      style={{
        left: localBox.x,
        top: localBox.y,
        width: localBox.w,
        height: localBox.h,
      }}
    >
      <header className="panel-top" onPointerDown={(e) => startGesture(e, "move")}>
        <span className="panel-grip" title="Drag to move" aria-hidden="true">
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

      <div
        className="panel-resize"
        role="separator"
        aria-label="Drag to resize"
        title="Drag to resize"
        onPointerDown={(e) => startGesture(e, "resize")}
      />
    </article>
  );
}
