/**
 * Gallery — every component in the folder, laid out as a grid of live,
 * sandboxed previews. Tiles mount their iframes lazily, screenshots act
 * as instant placeholders and a few controls shape the whole wall.
 */
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Moon,
  Pause,
  Play,
  Search,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { useStore } from "../state/store";
import { useInView } from "./useInView";
import { PreviewFrame } from "./PreviewFrame";
import { KindBadge } from "./Badges";
import type { Component, ComponentKind } from "../core/types";

type KindFilter = "all" | ComponentKind;

const KIND_LABELS: Record<KindFilter, string> = {
  all: "All",
  html: "HTML",
  txt: "txt",
  tsx: "React",
};

export function Gallery() {
  const { session, prefs, setPrefs } = useStore();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [columns, setColumns] = useState(3);

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

  return (
    <div className="gallery">
      <div className="gallery-bar">
        <label className="search">
          <Search size={13} className="faint" />
          <input
            placeholder="Search components…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
        </label>

        <div className="chips">
          {(Object.keys(KIND_LABELS) as KindFilter[]).map((k) => (
            <button
              key={k}
              className={`chip${kind === k ? " active" : ""}`}
              onClick={() => setKind(k)}
            >
              {KIND_LABELS[k]}
              <span className="chip-count">{counts[k]}</span>
            </button>
          ))}
        </div>

        <span className="spacer" />

        <div className="chips" role="group" aria-label="Columns">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              className={`chip${columns === n ? " active" : ""}`}
              onClick={() => setColumns(n)}
              title={`${n} columns`}
            >
              {n}
            </button>
          ))}
        </div>

        <button
          className="btn ghost small"
          onClick={() => setPrefs({ paused: !prefs.paused })}
          title={prefs.paused ? "Resume animations" : "Pause animations"}
        >
          {prefs.paused ? <Play size={13} /> : <Pause size={13} />}
          {prefs.paused ? "Resume" : "Pause"}
        </button>

        <button
          className="btn ghost small"
          onClick={() => setPrefs({ canvas: prefs.canvas === "light" ? "dark" : "light" })}
          title="Toggle preview background"
        >
          {prefs.canvas === "light" ? <Moon size={13} /> : <Sun size={13} />}
          {prefs.canvas === "light" ? "Dark" : "Light"}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="gallery-empty faint">
          Nothing matches {query ? `“${query}”` : "this filter"}.
        </div>
      ) : (
        <div
          className="gallery-grid"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {filtered.map((component) => (
            <GalleryTile key={component.id} component={component} />
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryTile({ component }: { component: Component }) {
  const { session, prefs, openComponent, backend } = useStore();
  const [ref, inView] = useInView<HTMLElement>();
  const poster = component.screenshots[0];

  if (!session) return null;

  const needsLive = component.kind !== "tsx";
  /* parse before mount, keep React sources visible either way */
  const showLive = needsLive ? inView : true;

  return (
    <article className="tile card" ref={ref}>
      <header
        className="tile-head"
        onClick={() => openComponent(component.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openComponent(component.id);
          }
        }}
        role="button"
        tabIndex={0}
        title="Open in the playground"
      >
        <span className="tile-name">{component.name}</span>
        <KindBadge kind={component.kind} />
        <span className="spacer" />
        {component.attribution && (
          <span className="tile-credit faint" title={component.attribution}>
            {component.attribution}
          </span>
        )}
        <ArrowUpRight size={14} className="faint" />
      </header>

      <div className="tile-preview">
        {showLive ? (
          <PreviewFrame
            component={component}
            session={session}
            canvas={prefs.canvas}
            paused={prefs.paused}
            className="preview-frame"
          />
        ) : poster ? (
          <img
            className="tile-poster"
            src={backend.assetUrl(session.root, poster)}
            alt={`${component.name} reference`}
            loading="lazy"
          />
        ) : (
          <div className="tile-skeleton" />
        )}
      </div>

      <footer className="tile-foot">
        {component.usesTailwind && <span className="badge">tailwind</span>}
        {component.cssOnly && (
          <span className="badge warn">
            <TriangleAlert size={10} /> css only
          </span>
        )}
        {component.kind === "tsx" && <span className="badge">not compiled yet</span>}
        <span className="spacer" />
        {component.dir && <span className="faint mono tile-dir">{component.dir}/</span>}
      </footer>
    </article>
  );
}
