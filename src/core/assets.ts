/**
 * assets — remote images, fonts and background URLs referenced by
 * snippets. htmlove can spot them, probe whether they still respond,
 * and swap dead ones for neutral placeholders (as an edit the user can
 * review and save).
 */

const CSS_URL_RE = /url\(\s*(['"]?)(https?:\/\/[^'")]+)\1\s*\)/g;
const HTML_URL_RE = /(?:src|poster)\s*=\s*["'](https?:\/\/[^"']+)["']/g;
const LOOSE_URL_RE = /https?:\/\/[^\s"'`)\]>,;]+/g;

const IGNORED_HOSTS = ["esm.sh", "cdn.tailwindcss.com", "unpkg.com", "cdn.jsdelivr.net"];
const CODE_EXTENSIONS = /\.(js|mjs|cjs|ts|tsx|jsx|css|map|json|wasm|html?)$/i;

function keep(url: string, loose: boolean): boolean {
  if (!url || url.startsWith("data:")) return false;
  if (loose && CODE_EXTENSIONS.test(url)) return false;
  try {
    const host = new URL(url).hostname;
    if (IGNORED_HOSTS.some((h) => host === h || host.endsWith("." + h))) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Every remote URL worth worrying about, in first-seen order.
 * `tsx` sources are scanned loosely (image URLs usually sit in string
 * literals there), css/html only where URLs actually mean assets.
 */
export function extractRemoteAssets(sources: {
  css?: string;
  html?: string;
  tsx?: string;
  txt?: string;
}): string[] {
  const found = new Set<string>();
  const add = (url: string, loose: boolean) => {
    if (found.size >= 60) return;
    if (keep(url, loose)) found.add(url);
  };

  for (const source of [sources.css, sources.html, sources.txt]) {
    if (!source) continue;
    for (const match of source.matchAll(CSS_URL_RE)) add(match[2], false);
    for (const match of source.matchAll(HTML_URL_RE)) add(match[1], false);
  }
  if (sources.tsx) {
    for (const match of sources.tsx.matchAll(LOOSE_URL_RE)) {
      add(match[0].replace(/[.,;:]+$/, ""), true);
    }
  }
  return [...found];
}

export const CSS_ASSET_PLACEHOLDER = "linear-gradient(135deg, #e6e6ea 0%, #d4d4dc 100%)";

const PLACEHOLDER_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100">` +
  `<rect width="160" height="100" fill="#e6e6ea"/>` +
  `<text x="80" y="54" font-family="monospace" font-size="10" fill="#71717a" text-anchor="middle">missing image</text>` +
  `</svg>`;

export const IMAGE_ASSET_PLACEHOLDER =
  "data:image/svg+xml," + encodeURIComponent(PLACEHOLDER_SVG);

/**
 * Replace references to known-dead URLs. CSS `url(…)` becomes a quiet
 * gradient, `src=`/`poster=` become a labelled placeholder image.
 */
export function rewriteDeadAssets(source: string, dead: ReadonlySet<string>): string {
  if (dead.size === 0) return source;
  let out = source.replace(CSS_URL_RE, (match, _quote: string, url: string) =>
    dead.has(url) ? CSS_ASSET_PLACEHOLDER : match,
  );
  out = out.replace(
    /((?:src|poster)\s*=\s*["'])(https?:\/\/[^"']+)(["'])/g,
    (match, pre: string, url: string, post: string) =>
      dead.has(url) ? `${pre}${IMAGE_ASSET_PLACEHOLDER}${post}` : match,
  );
  return out;
}

/* ------------------------------------------------------------------ */
/* probing (browser only)                                              */
/* ------------------------------------------------------------------ */

export type ProbeStatus = "ok" | "fail" | "opaque";

/** Images: an actual load tells 404s apart from successes. */
export function probeImageUrl(url: string, timeoutMs = 7000): Promise<ProbeStatus> {
  return new Promise((resolve) => {
    const img = new Image();
    const finish = (status: ProbeStatus) => {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(status);
    };
    const timer = setTimeout(() => finish("fail"), timeoutMs);
    img.onload = () => finish("ok");
    img.onerror = () => finish("fail");
    img.referrerPolicy = "no-referrer";
    img.src = url;
  });
}

/** Everything else (CDN modules, fonts): CORS fetch, opaque = reachable. */
export async function probeModuleUrl(url: string, timeoutMs = 8000): Promise<ProbeStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, mode: "cors" });
    return res.ok ? "ok" : "fail";
  } catch {
    return "fail";
  } finally {
    clearTimeout(timer);
  }
}

export function looksLikeImageUrl(url: string): boolean {
  if (/\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)([?#]|$)/i.test(url)) return true;
  return /unsplash|images\.|imgur|deviantart|postimg|cloudfront|s3\.|amazonaws|placehold|picsum|giphy|staticflickr/i.test(
    url,
  );
}

export function probeAssetUrl(url: string): Promise<ProbeStatus> {
  return looksLikeImageUrl(url) ? probeImageUrl(url) : probeModuleUrl(url);
}
