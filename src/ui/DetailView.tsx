/**
 * DetailView — the single-component view. For now this is a large live
 * preview with the component's metadata; editors and saving arrive with
 * the next milestone.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, Moon, RefreshCw, Sun } from "lucide-react";
import { useStore } from "../state/store";
import { PreviewFrame } from "./PreviewFrame";
import { KindBadge } from "./Badges";

export function DetailView() {
  const { session, view, backToGallery, prefs, setPrefs } = useStore();
  const [reloadKey, setReloadKey] = useState(0);

  const component = useMemo(
    () =>
      session && view.mode === "detail"
        ? session.catalog.find((c) => c.id === view.id)
        : undefined,
    [session, view],
  );

  if (!session || !component) return null;

  const fileLabel =
    component.htmlPath ??
    component.txtPath ??
    component.tsxPath ??
    component.id;

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
        <span className="spacer" />
        <span className="faint mono" style={{ fontSize: 11 }} title={fileLabel}>
          {fileLabel}
        </span>
        <button
          className="btn ghost small"
          onClick={() => setReloadKey((k) => k + 1)}
          title="Reload preview"
        >
          <RefreshCw size={13} />
        </button>
        <button
          className="btn ghost small"
          onClick={() => setPrefs({ canvas: prefs.canvas === "light" ? "dark" : "light" })}
          title="Toggle preview background"
        >
          {prefs.canvas === "light" ? <Moon size={13} /> : <Sun size={13} />}
        </button>
      </div>

      <div className="detail-stage">
        <PreviewFrame
          component={component}
          session={session}
          canvas={prefs.canvas}
          paused={prefs.paused}
          reloadKey={reloadKey}
          className="preview-frame detail-frame"
        />
      </div>
    </div>
  );
}
