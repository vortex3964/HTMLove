/**
 * Board — the dashboard itself: a free canvas where every mounted
 * component is a little window. Drag a panel by its header to move it,
 * drag its corner to resize it; both stick per folder. Clicking or
 * dragging components in from the sidebar adds them at the default size
 * — in the first free slot, or right where they were dropped.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Trash2 } from "lucide-react";
import { useStore } from "../state/store";
import { BoardPanel } from "./BoardPanel";
import { dragSession } from "../core/board";
import type { Component } from "../core/types";

const CANVAS_MIN_HEIGHT = 360;

export function Board() {
  const { session, board, layout, addToBoard, addAllToBoard, clearBoard, setBoardWidth } =
    useStore();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dropHint, setDropHint] = useState(false);

  const components = session?.catalog ?? [];
  const byId = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const mounted = useMemo(
    () => board.map((id) => byId.get(id)).filter((c): c is Component => c !== undefined),
    [board, byId],
  );

  /* keep the store's idea of the canvas width current so panels added
     by click or "Add all" are placed on a grid that fits */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    setBoardWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setBoardWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [setBoardWidth, session?.root]);

  if (!session) return null;

  const canvasHeight = Math.max(
    CANVAS_MIN_HEIGHT,
    mounted.reduce((bottom, component) => {
      const box = layout[component.id];
      return box ? Math.max(bottom, box.y + box.h + 80) : bottom;
    }, 0),
  );

  return (
    <section
      className={`board${dropHint ? " drop-active" : ""}`}
      onDragOver={(e) => {
        if (dragSession.kind !== "new") return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!dropHint) setDropHint(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropHint(false);
      }}
      onDrop={(e) => {
        if (dragSession.kind !== "new") return;
        e.preventDefault();
        setDropHint(false);
        const id = dragSession.id;
        dragSession.kind = null;
        dragSession.id = null;
        if (!id) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect && rect.width > 0) {
          addToBoard(id, { x: e.clientX - rect.left, y: e.clientY - rect.top });
        } else {
          addToBoard(id);
        }
      }}
    >
      <div className="board-bar">
        <span className="badge">
          {mounted.length === 0 ? "empty board" : `${mounted.length} on board`}
        </span>
        <span className="faint board-hint">
          {mounted.length === 0
            ? "click or drag components from the sidebar"
            : "drag a panel by its header to move it, the corner to resize"}
        </span>
        <span className="spacer" />
        <button
          className="btn ghost small"
          onClick={addAllToBoard}
          disabled={mounted.length === components.length}
          title="Put every component on the board"
        >
          <LayoutGrid size={13} />
          Add all
        </button>
        <button
          className="btn ghost small"
          onClick={clearBoard}
          disabled={board.length === 0}
          title="Remove everything from the board (props are kept)"
        >
          <Trash2 size={13} />
          Clear
        </button>
      </div>

      <div
        ref={canvasRef}
        className="board-canvas"
        style={{ height: mounted.length > 0 ? canvasHeight : undefined }}
      >
        {mounted.length === 0 ? (
          <div className="board-empty">
            <div className="card board-empty-card">
              <h2>Your board is empty</h2>
              <p className="muted">
                Click a component in the sidebar, drag one over here, or put everything up at
                once — then arrange the panels however you like.
              </p>
              <button
                className="btn primary"
                onClick={addAllToBoard}
                disabled={components.length === 0}
              >
                <LayoutGrid size={14} />
                Add all {components.length} component{components.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        ) : (
          mounted.map((component) => (
            <BoardPanel key={component.id} component={component} box={layout[component.id]} />
          ))
        )}
      </div>

      {dropHint && <div className="board-drop-hint">Drop to add</div>}
    </section>
  );
}
