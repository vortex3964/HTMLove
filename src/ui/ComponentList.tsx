/**
 * ComponentList — the interim way to see what a folder contained.
 * A live gallery replaces this in the next milestone.
 */
import { FileCode2, FileText, Image as ImageIcon, Palette, TriangleAlert } from "lucide-react";
import { useStore } from "../state/store";
import type { Component } from "../core/types";

function KindBadge({ kind }: { kind: Component["kind"] }) {
  const label = kind === "tsx" ? "react" : kind;
  return <span className="badge accent">{label}</span>;
}

export function ComponentList() {
  const { session } = useStore();
  if (!session) return null;

  const fileCount = session.files.size + session.assets.size;

  return (
    <div className="list-wrap">
      <div className="list-meta muted">
        <strong>{session.catalog.length}</strong> components · {fileCount} files read ·{" "}
        <span className="mono">{session.root}</span>
        {session.skipped.length > 0 && (
          <span className="faint"> · {session.skipped.length} files skipped</span>
        )}
      </div>

      {session.catalog.length === 0 && (
        <div className="card empty" style={{ maxWidth: 520 }}>
          <h1>Nothing to preview here</h1>
          <p>
            htmlove looked around but found no <code>.html</code>, <code>.txt</code> or{" "}
            <code>.tsx</code> snippets. Try a folder that contains them.
          </p>
        </div>
      )}

      <div className="component-rows">
        {session.catalog.map((c) => (
          <article key={c.id} className="card component-row">
            <div className="component-row-main">
              <div className="component-row-title">
                <strong>{c.name}</strong>
                <KindBadge kind={c.kind} />
                {c.usesTailwind && <span className="badge">tailwind</span>}
                {c.cssOnly && (
                  <span className="badge warn">
                    <TriangleAlert size={11} /> css only
                  </span>
                )}
              </div>
              <div className="component-row-sub muted">
                {c.dir && <span className="mono faint">{c.dir}/</span>}
                {c.htmlPath && <span className="mono">{c.htmlPath}</span>}
                {c.cssPath && <span className="mono faint"> + {c.cssPath}</span>}
                {c.tsxPath && <span className="mono">{c.tsxPath}</span>}
                {c.txtPath && <span className="mono">{c.txtPath}</span>}
              </div>
            </div>
            <div className="component-row-side">
              {c.attribution && <span className="faint">{c.attribution}</span>}
              {c.screenshots.length > 0 && (
                <span className="badge" title={c.screenshots.join("\n")}>
                  <ImageIcon size={11} /> {c.screenshots.length}
                </span>
              )}
              {c.kind === "tsx" ? <FileCode2 size={14} className="faint" /> : <FileText size={14} className="faint" />}
              {c.cssPath && <Palette size={14} className="faint" />}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
