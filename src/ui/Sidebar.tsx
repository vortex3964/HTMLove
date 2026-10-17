/**
 * Sidebar — the catalog: search, kind filters and one draggable row per
 * component. Clicking a row mounts it on the board (or jumps to it when
 * it is already there); dragging drops it straight onto the board.
 */
import { useMemo, useState } from "react";
import { Check, GripVertical, Plus, Search, TriangleAlert } from "lucide-react";
import { useStore } from "../state/store";
import { dragSession } from "../core/board";
import { KindBadge, KindIcon } from "./Badges";
import type { ComponentKind } from "../core/types";

type KindFilter = "all" | ComponentKind;

const KIND_LABELS: Record<KindFilter, string> = {
  all: "All",
  html: "HTML",
  txt: "txt",
  tsx: "React",
};

export function Sidebar() {
  const { session, backend, board, addToBoard } = useStore();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");

  const components = session?.catalog ?? [];

  const counts = useMemo(() => {
    const base: Record<KindFilter, number> = { all: components.length, html: 0, txt: 0, tsx: 0 };
    for (const c of components) base[c.kind]++;
    return base;
  }, [components]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return components.filter((c) => {
      if (kind !== "all" && c.kind !== kind) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.dir.toLowerCase().includes(q) ||
        (c.attribution ?? "").toLowerCase().includes(q)
      );
    });
  }, [components, query, kind]);

  const boardSet = useMemo(() => new Set(board), [board]);

  if (!session) return null;

  const activate = (id: string) => {
    if (!boardSet.has(id)) {
      addToBoard(id);
      return;
    }
    /* already mounted: bring the panel into view and flash it */
    const el = document.getElementById(`hv-panel-${id}`);
    el?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    el?.classList.add("ping");
    window.setTimeout(() => el?.classList.remove("ping"), 1000);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="sidebar-title">Components</span>
        <span className="faint sidebar-count">
          {filtered.length === components.length
            ? components.length
            : `${filtered.length}/${components.length}`}
        </span>
      </div>

      <label className="search sidebar-search">
        <Search size={13} className="faint" />
        <input
          id="hv-sidebar-search"
          placeholder="Search components…  /"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          aria-label="Search components"
        />
      </label>

      <div className="chips sidebar-kinds" role="group" aria-label="Filter by kind">
        {(Object.keys(KIND_LABELS) as KindFilter[]).map((k) => (
          <button
            key={k}
            className={`chip${kind === k ? " active" : ""}`}
            onClick={() => setKind(k)}
            title={`${KIND_LABELS[k]} (${counts[k]})`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <ul className="sidebar-list">
        {filtered.map((component) => {
          const mounted = boardSet.has(component.id);
          const stubs = component.imports.filter((entry) => entry.status === "stub").length;
          return (
            <li
              key={component.id}
              className={`sidebar-item${mounted ? " mounted" : ""}`}
              draggable
              onDragStart={(e) => {
                dragSession.kind = "new";
                dragSession.id = component.id;
                e.dataTransfer.setData("text/plain", component.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onDragEnd={() => {
                dragSession.kind = null;
                dragSession.id = null;
              }}
              onClick={() => activate(component.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  activate(component.id);
                }
              }}
              role="button"
              tabIndex={0}
              title={
                mounted
                  ? `${component.name} is on the board — click to jump to it`
                  : `Add ${component.name} to the board (or drag it over)`
              }
            >
              <span className="sidebar-grip" aria-hidden="true">
                <GripVertical size={12} />
              </span>
              {component.screenshots.length > 0 ? (
                <img
                  className="sidebar-thumb"
                  src={backend.assetUrl(session.root, component.screenshots[0])}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="sidebar-thumb sidebar-thumb-empty">
                  <KindIcon kind={component.kind} />
                </span>
              )}
              <span className="sidebar-name">{component.name}</span>
              {stubs > 0 && (
                <span
                  className="sidebar-warn"
                  title={`${stubs} stubbed import${stubs === 1 ? "" : "s"}`}
                >
                  <TriangleAlert size={11} />
                </span>
              )}
              <span className="spacer" />
              <KindBadge kind={component.kind} />
              {mounted ? (
                <Check size={13} className="sidebar-check" aria-label="on the board" />
              ) : (
                <Plus size={13} className="sidebar-plus" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && <div className="sidebar-empty faint">Nothing matches.</div>}
    </aside>
  );
}
