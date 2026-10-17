/**
 * PreviewFrame — a sandboxed iframe that renders one component.
 *
 * Shared by the gallery tiles and the detail playground. Runtime errors
 * raised inside the preview come back over postMessage and show up as a
 * small overlay instead of a silent blank box.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { buildPreviewDoc, PREVIEW_READY_CHANNEL } from "../core/previewHtml";
import { splitTxtSource } from "../core/catalog";
import { useStore } from "../state/store";
import type { Component, Session } from "../core/types";

export interface PreviewError {
  message: string;
  detail?: string;
}

interface PreviewFrameProps {
  component: Component;
  session: Session;
  canvas: "light" | "dark";
  paused: boolean;
  /** Force a fresh reload when this changes. */
  reloadKey?: number;
  className?: string;
  /** Fixed pixel width (viewport presets); defaults to full width. */
  width?: number;
  /** Extra CSS injected after the component's own (design tokens). */
  extraCss?: string;
  /** Report errors upward as well (detail view shows them elsewhere). */
  onErrors?(errors: PreviewError[]): void;
}

/** The html/css pair a component renders from, honouring live drafts. */
export function resolvePreviewSource(
  component: Component,
  session: Session,
): { html: string; css: string } {
  const files = session.files;
  if (component.kind === "txt" && component.txtPath) {
    const raw = files.get(component.txtPath) ?? "";
    return splitTxtSource(raw);
  }
  const html = component.htmlPath ? (files.get(component.htmlPath) ?? "") : "";
  const css = component.cssPath ? (files.get(component.cssPath) ?? "") : "";
  return { html, css };
}

export function PreviewFrame({
  component,
  session,
  canvas,
  paused,
  reloadKey = 0,
  className,
  width,
  extraCss,
  onErrors,
}: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [errors, setErrors] = useState<PreviewError[]>([]);
  const { backend } = useStore();

  const source = useMemo(
    () => resolvePreviewSource(component, session),
    [component, session],
  );

  const doc = useMemo(
    () =>
      buildPreviewDoc({
        html: source.html,
        css: source.css,
        usesTailwind: component.usesTailwind,
        canvas,
        paused,
        extraCss,
      }),
    [source, component.usesTailwind, canvas, paused, extraCss],
  );

  /* fresh document: drop stale errors */
  useEffect(() => {
    setErrors([]);
  }, [doc, reloadKey]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (!data || typeof data !== "object") return;
      const payload = data as { source?: string; type?: string; message?: string; detail?: string };
      if (payload.source !== PREVIEW_READY_CHANNEL) return;
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
      if (payload.type === "error") {
        setErrors((prev) => {
          const next = [
            ...prev.slice(-2),
            { message: String(payload.message ?? "Script error"), detail: payload.detail },
          ];
          onErrors?.(next);
          return next;
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onErrors]);

  const isReact = component.kind === "tsx";
  const hasNothingToRender = component.cssOnly || (!isReact && source.html.trim() === "");

  if (isReact) {
    return (
      <div className={className} data-preview-kind="tsx-pending">
        <div className="preview-note">
          <span className="badge accent">react</span>
          <p>
            Live compilation for React sources lands in the compile milestone.
            {component.screenshots.length > 0 ? " A reference screenshot is below." : ""}
          </p>
          {component.screenshots.length > 0 && (
            <img
              className="preview-shot"
              src={backend.assetUrl(session.root, component.screenshots[0])}
              alt={`${component.name} reference`}
              loading="lazy"
            />
          )}
        </div>
      </div>
    );
  }

  if (hasNothingToRender) {
    return (
      <div className={className}>
        <div className="preview-note">
          {component.cssOnly ? (
            <>
              <span className="badge warn">
                <TriangleAlert size={11} /> css only
              </span>
              <p>This snippet has CSS but no markup yet — the editor lands next milestone.</p>
            </>
          ) : (
            <p className="faint">No markup found.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className} data-preview-kind="html">
      <iframe
        key={reloadKey}
        ref={iframeRef}
        title={`${component.name} preview`}
        sandbox="allow-scripts"
        loading="lazy"
        srcDoc={doc}
        style={width !== undefined ? { width, maxWidth: "100%" } : undefined}
      />
      {errors.length > 0 && (
        <div className="preview-errors" role="status">
          {errors.map((err, i) => (
            <div key={i} className="preview-error">
              <TriangleAlert size={12} />
              <span>{err.message}</span>
              {err.detail && <span className="faint mono">{err.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
