/**
 * Board — the dashboard itself: the mounted components as a grid you can
 * reorder, resize (2/3/4 columns), fill and empty. Drops from the
 * sidebar add a component; drops on a panel reorder it.
 */
import { useMemo, useState } from "react";
import { LayoutGrid, Trash2 } from "lucide-react";
import { useStore } from "../state/store";
import { BoardPanel } from "./BoardPanel";
import { dragSession, insertionIndex } from "../core/board";
import type { Component } from "../core/types";

export function Board() {
  const { session, board, addToBoard, addAllToBoard, moveOnBoard, clearBoard, prefs, setPrefs } =
    useStore();
  const [dropHint, setDropHint] = useState(false);
  const [dropTarget, setDropTarget] = useState<{ id: string; side: "before" | "after" } | null>(
    null,
  );

  const components = session?.catalog ?? [];
  const byId = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const mounted = useMemo(
    () => board.map((id) => byId.get(id)).filter((c): c is Component => c !== undefined),
    [board, byId],
  );

  if (!session) return null;

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
        if (dragSession.id) addToBoard(dragSession.id);
        dragSession.kind = null;
        dragSession.id = null;
      }}
    >
      <div className="board-bar">
        <span className="badge">
          {mounted.length === 0 ? "empty board" : `${mounted.length} on board`}
        </span>
        <span className="faint board-hint">click or drag components from the sidebar</span>
        <span className="spacer" />
        <div className="chips" role="group" aria-label="Columns">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              className={`chip${prefs.columns === n ? " active" : ""}`}
              onClick={() => setPrefs({ columns: n })}
              title={`${n} columns`}
            >
              {n}
            </button>
          ))}
        </div>
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

      {mounted.length === 0 ? (
        <div className="board-empty">
          <div className="card board-empty-card">
            <h2>Your board is empty</h2>
            <p className="muted">
              Click a component in the sidebar, drag one over here, or put everything up at once.
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
        <div
          className="board-grid"
          style={{ gridTemplateColumns: `repeat(${prefs.columns}, minmax(0, 1fr))` }}
        >
          {mounted.map((component) => (
            <BoardPanel
              key={component.id}
              component={component}
              dropSide={dropTarget?.id === component.id ? dropTarget.side : null}
              onDragOverPanel={(side) => {
                setDropTarget((prev) =>
                  prev?.id === component.id && prev.side === side
                    ? prev
                    : { id: component.id, side },
                );
              }}
              onDragLeavePanel={() => {
                setDropTarget((prev) => (prev?.id === component.id ? null : prev));
              }}
              onDropPanel={() => {
                if (
                  dragSession.kind === "move" &&
                  dragSession.id &&
                  dragSession.id !== component.id
                ) {
                  moveOnBoard(
                    dragSession.id,
                    insertionIndex(board, component.id, dropTarget?.side ?? "before"),
                  );
                }
                dragSession.kind = null;
                dragSession.id = null;
                setDropTarget(null);
              }}
            />
          ))}
        </div>
      )}

      {dropHint && <div className="board-drop-hint">Drop to add</div>}
    </section>
  );
}
