/**
 * previewHtml — build a complete, self-contained HTML document for a
 * snippet. Every preview runs inside its own `sandbox="allow-scripts"`
 * iframe, so styles, ids and animation names can never leak between
 * components or into the app itself.
 */

export interface PreviewDocOptions {
  html: string;
  css?: string;
  /** Inject the Tailwind CDN runtime (works offline only if cached). */
  usesTailwind?: boolean;
  canvas?: "light" | "dark";
  /** Freeze animations for easier comparison. */
  paused?: boolean;
  /** Extra css, injected after the user css (design tokens and the like). */
  extraCss?: string;
}

export const TAILWIND_CDN = "https://cdn.tailwindcss.com";

export const PREVIEW_READY_CHANNEL = "htmlove-preview";

/** Reports runtime errors and readiness back to the parent window. */
export const PREVIEW_RUNTIME_SCRIPT = `(function(){
  var send=function(type,payload){payload=payload||{};payload.source='${PREVIEW_READY_CHANNEL}';payload.type=type;try{parent.postMessage(payload,'*')}catch(e){}};
  window.addEventListener('error',function(e){send('error',{message:(e&&e.message)||'Script error',detail:e&&e.filename?String(e.filename)+':'+(e.lineno||0):''})});
  window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;send('error',{message:'Unhandled rejection: '+((r&&r.message)||String(r))})});
  if(document.readyState==='complete'){send('ready')}else{window.addEventListener('load',function(){send('ready')})}
})();`;

export function previewBaseCss(canvas: "light" | "dark"): string {
  const bg = canvas === "dark" ? "#18181b" : "#ffffff";
  const fg = canvas === "dark" ? "#e4e4e7" : "#18181b";
  return [
    "html,body{margin:0;padding:0}",
    `body{min-height:100vh;display:flex;padding:18px;box-sizing:border-box;background:${bg};color:${fg};font-family:system-ui,-apple-system,'Segoe UI',sans-serif}`,
    ".hv-stage{width:100%;margin:auto;display:flex;flex-direction:column;align-items:center}",
  ].join("\n");
}

export function buildPreviewDoc(options: PreviewDocOptions): string {
  const {
    html,
    css = "",
    usesTailwind = false,
    canvas = "light",
    paused = false,
    extraCss = "",
  } = options;

  const baseCss = previewBaseCss(canvas);

  const pauseCss = paused
    ? "*{animation-play-state:paused !important}"
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${usesTailwind ? `<script src="${TAILWIND_CDN}"></script>` : ""}
<style>${baseCss}</style>
<style id="hv-user-css">${css}</style>
${extraCss ? `<style id="hv-extra-css">${extraCss}</style>` : ""}
${pauseCss ? `<style id="hv-pause">${pauseCss}</style>` : ""}
</head>
<body>
<div class="hv-stage">${html}</div>
<script>${PREVIEW_RUNTIME_SCRIPT}</script>
</body>
</html>`;
}
