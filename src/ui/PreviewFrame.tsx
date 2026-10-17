/**
 * PreviewFrame — a sandboxed iframe that renders one component.
 *
 * HTML/txt components render straight from their source; React
 * components are bundled first (esbuild), then run inside the same kind
 * of sandbox with an import map for their npm dependencies. Runtime
 * errors come back over postMessage and show up as an overlay instead
 * of a silent blank box.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { buildPreviewDoc, PREVIEW_READY_CHANNEL } from "../core/previewHtml";
import { buildTsxPreviewDoc } from "../core/tsxPreviewHtml";
import { splitTxtSource } from "../core/catalog";
import { effectiveFile } from "../core/edits";
import { compileTsxComponentCached, getBrowserEsbuild, type CompileResult } from "../core/compile";
import { componentTokens } from "../core/manifest";
import { buildTokenCss, missingTokens, suggestTokenValue } from "../core/tokens";
import { useStore } from "../state/store";
import type { Component, Session } from "../core/types";

export interface PreviewError {
  message: string;
  detail?: string;
}

interface PreviewFrameProps {
  component: Component;
  session: Session;
  /** Preview background; light by default until htmlove grows a dark theme. */
  canvas?: "light" | "dark";
  paused: boolean;
  /** Force a fresh reload when this changes. */
  reloadKey?: number;
  className?: string;
  /** Props handed to the component (window.__hvProps). */
  props?: Record<string, unknown>;
  /** Extra CSS injected after the component's own (design tokens). */
  extraCss?: string;
  /** Report errors upward as well (detail view shows them elsewhere). */
  onErrors?(errors: PreviewError[]): void;
}

/**
 * A plain-language guess at what went wrong, shown under the raw error.
 * These three families cover almost every failure this playground sees.
 */
export function errorHint(message: string): string | null {
  if (/reading '(map|length|forEach|filter|find|slice|reduce|join|split)'/.test(message)) {
    return "This component probably needs props — open its props editor ({} in the panel header) and provide them.";
  }
  if (/useStore must be used inside|must be used within a .*Provider|createContext/i.test(message)) {
    return "This component expects to run inside its own app — the context/provider it relies on does not exist in the sandbox.";
  }
  if (/Unrecognized extension value|same instance|instanceof/i.test(message)) {
    return "A library got loaded twice with different copies of its core module — a version pin in the manifest can share one copy.";
  }
  if (/Cannot convert undefined or null to object|is not iterable/.test(message)) {
    return "A value this component expects is missing — check its props.";
  }
  return null;
}

/** The sources a component renders from, honouring live drafts. */
export function resolvePreviewSource(
  component: Component,
  session: Session,
): { html: string; css: string; tsx: string | null } {
  if (component.kind === "txt" && component.txtPath) {
    const raw = effectiveFile(session, component.txtPath);
    const { html, css } = splitTxtSource(raw);
    return { html, css, tsx: null };
  }
  return {
    html: effectiveFile(session, component.htmlPath),
    css: effectiveFile(session, component.cssPath),
    tsx: component.tsxPath ? effectiveFile(session, component.tsxPath) : null,
  };
}

export function PreviewFrame({
  component,
  session,
  canvas = "light",
  paused,
  reloadKey = 0,
  className,
  props,
  extraCss,
  onErrors,
}: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [errors, setErrors] = useState<PreviewError[]>([]);
  const { backend, manifest, tokens } = useStore();

  const source = useMemo(() => resolvePreviewSource(component, session), [component, session]);

  /**
   * Design tokens. Anything the component uses but never defines gets a
   * sensible default so previews look right out of the box; manifest
   * values come next and the user's in-session tweaks win over both.
   */
  const tokenCss = useMemo(() => {
    const effective: Record<string, string> = {};
    for (const name of missingTokens([source.html, source.css, source.tsx ?? ""])) {
      effective[`--${name}`] = suggestTokenValue(name);
    }
    const normalize = (record: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(record).map(([key, value]) => [
          key.startsWith("--") ? key : `--${key}`,
          value,
        ]),
      );
    Object.assign(
      effective,
      normalize(componentTokens(manifest, component)),
      normalize(tokens),
    );
    return [buildTokenCss(effective), extraCss ?? ""].filter((part) => part.trim() !== "").join("\n");
  }, [source, manifest, component, tokens, extraCss]);

  const forceStub = useMemo(
    () =>
      new Set(
        (manifest.stubs ?? []).filter((spec) => spec !== "react" && !spec.startsWith("react-dom")),
      ),
    [manifest.stubs],
  );

  /* ---------------- react pipeline ---------------- */
  const isReact = component.kind === "tsx" && component.tsxPath !== undefined;
  const [compiled, setCompiled] = useState<CompileResult | null>(null);
  const [compiling, setCompiling] = useState(false);

  useEffect(() => {
    if (!isReact || source.tsx === null || !component.tsxPath) return;
    let cancelled = false;
    setCompiling(true);
    compileTsxComponentCached({
      source: source.tsx,
      path: component.tsxPath,
      files: session.files,
      assets: new Set(session.assets.keys()),
      getEsbuild: getBrowserEsbuild,
      forceStub,
    })
      .then((result) => {
        if (cancelled) return;
        setCompiled(result);
        setCompiling(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCompiled({
          ok: false,
          errors: [err instanceof Error ? err.message : String(err)],
        });
        setCompiling(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isReact, source.tsx, component.tsxPath, session.files, session.assets, forceStub]);

  const tsxDoc = useMemo(() => {
    if (!compiled || !compiled.ok) return null;
    return buildTsxPreviewDoc({
      code: compiled.code,
      css: compiled.css,
      externals: compiled.externals,
      canvas,
      paused,
      usesTailwind: component.usesTailwind,
      props,
      versionOverrides: manifest.packages,
      urlOverrides: manifest.urls,
      extraCss: tokenCss,
    });
  }, [compiled, canvas, paused, component.usesTailwind, props, manifest, tokenCss]);

  /* ---------------- html pipeline ---------------- */
  const doc = useMemo(
    () =>
      buildPreviewDoc({
        html: source.html,
        css: source.css,
        usesTailwind: component.usesTailwind,
        canvas,
        paused,
        extraCss: tokenCss,
      }),
    [source, component.usesTailwind, canvas, paused, tokenCss],
  );

  /* fresh document: drop stale errors */
  useEffect(() => {
    setErrors([]);
  }, [doc, tsxDoc, reloadKey]);

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

  /* ---------------- react states ---------------- */

  if (isReact) {
    if (!compiled && compiling) {
      return (
        <div className={className} data-preview-kind="tsx">
          <div className="preview-note">
            <span className="spinner-ring" />
            <p>Compiling React component…</p>
          </div>
        </div>
      );
    }
    if (!compiled || !compiled.ok) {
      return (
        <div className={className} data-preview-kind="tsx">
          <div className="preview-note preview-note-bad">
            <span className="badge bad">
              <TriangleAlert size={11} /> compile failed
            </span>
            <div className="preview-compile-errors mono">
              {(compiled && !compiled.ok ? compiled.errors : ["unknown error"]).map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className={className} data-preview-kind="tsx">
        <iframe
          key={reloadKey}
          ref={iframeRef}
          title={`${component.name} preview`}
          sandbox="allow-scripts"
          loading="lazy"
          srcDoc={tsxDoc ?? ""}
        />
        {compiled.stubs.length > 0 && (
          <div className="preview-stubs" title={compiled.stubs.join("\n")}>
            {compiled.stubs.length} stubbed import{compiled.stubs.length === 1 ? "" : "s"}
          </div>
        )}
        {errors.length > 0 && (
          <div className="preview-errors" role="status">
            {errors.map((err, i) => {
              const hint = errorHint(err.message);
              return (
                <div key={i} className="preview-error">
                  <TriangleAlert size={12} />
                  <div className="preview-error-text">
                    <span>{err.message}</span>
                    {err.detail && <span className="faint mono">{err.detail}</span>}
                    {hint && <span className="preview-hint">{hint}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ---------------- html states ---------------- */

  const hasNothingToRender = component.cssOnly || source.html.trim() === "";

  if (hasNothingToRender) {
    return (
      <div className={className}>
        <div className="preview-note">
          {component.cssOnly ? (
            <>
              <span className="badge warn">
                <TriangleAlert size={11} /> css only
              </span>
              <p>
                This snippet has CSS but no markup — add some HTML in the editor (or the
                text file) to see it.
              </p>
            </>
          ) : (
            <p className="faint">No markup found.</p>
          )}
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

  return (
    <div className={className} data-preview-kind="html">
      <iframe
        key={reloadKey}
        ref={iframeRef}
        title={`${component.name} preview`}
        sandbox="allow-scripts"
        loading="lazy"
        srcDoc={doc}
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
