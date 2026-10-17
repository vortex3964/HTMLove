/**
 * packages — how third-party imports become real code inside a preview.
 *
 * Everything runs from esm.sh pinned to React 18 (the version most of
 * these snippets were written against), with `deps=react@18.3.1` so all
 * packages share one React instance.
 */

export const PREVIEW_REACT_VERSION = "18.3.1";

/** Optional version pins; anything unlisted resolves to the latest. */
export const PINNED_VERSIONS: Record<string, string> = {
  "lucide-react": "0.469.0",
  "framer-motion": "11.15.0",
  "@internationalized/date": "3.6.0",
  "react-aria": "3.36.0",
  "react-aria-components": "1.5.0",
  /* Exact on purpose: npm has a stray `codemirror@6.65.7` (a legacy
     bundle with only a default export) and `@6` resolves to it. */
  codemirror: "6.0.2",
  "@codemirror/state": "6",
  "@codemirror/view": "6",
  "@codemirror/language": "6",
  "@codemirror/lang-html": "6",
  "@codemirror/lang-css": "6",
  "@codemirror/lang-javascript": "6",
};

/**
 * Packages that pass instances across module boundaries and therefore
 * must share one copy per preview. CodeMirror is the classic case: two
 * `@codemirror/state` copies make every extension check fail. Listing a
 * specifier here makes esm.sh leave those dependencies external and the
 * import map wires everyone to the same URL.
 */
export const SHARED_PEERS: Record<string, string[]> = {
  codemirror: ["@codemirror/state", "@codemirror/view", "@codemirror/language"],
  "@codemirror/view": ["@codemirror/state"],
  "@codemirror/language": ["@codemirror/state", "@codemirror/view"],
  "@codemirror/lang-html": ["@codemirror/state", "@codemirror/view", "@codemirror/language"],
  "@codemirror/lang-css": ["@codemirror/state", "@codemirror/view", "@codemirror/language"],
  "@codemirror/lang-javascript": [
    "@codemirror/state",
    "@codemirror/view",
    "@codemirror/language",
  ],
};

const REACT_SUBPATHS: Record<string, string> = {
  "react/jsx-runtime": "jsx-runtime",
  "react/jsx-dev-runtime": "jsx-dev-runtime",
  "react-dom/client": "react-dom/client",
};

/** The CDN URL a bare specifier should load from. */
export function esmUrl(specifier: string, versionOverrides?: Record<string, string>): string {
  if (specifier === "react") {
    return `https://esm.sh/react@${PREVIEW_REACT_VERSION}`;
  }
  if (REACT_SUBPATHS[specifier] === "jsx-runtime" || REACT_SUBPATHS[specifier] === "jsx-dev-runtime") {
    return `https://esm.sh/react@${PREVIEW_REACT_VERSION}/${REACT_SUBPATHS[specifier]}`;
  }
  if (specifier === "react-dom") {
    return `https://esm.sh/react-dom@${PREVIEW_REACT_VERSION}?deps=react@${PREVIEW_REACT_VERSION}`;
  }
  if (specifier === "react-dom/client") {
    return `https://esm.sh/react-dom@${PREVIEW_REACT_VERSION}/client?deps=react@${PREVIEW_REACT_VERSION}`;
  }

  const pinned = versionOverrides?.[specifier] ?? PINNED_VERSIONS[specifier];
  const versioned = pinned ? `${specifier}@${pinned}` : specifier;
  const shared = SHARED_PEERS[specifier];
  /* CodeMirror never touches React: adding the deps param would only
     isolate its build from the module paths its own bundles reference. */
  const reactFree = specifier === "codemirror" || specifier.startsWith("@codemirror/");
  const params: string[] = [];
  if (!reactFree) params.push(`deps=react@${PREVIEW_REACT_VERSION}`);
  if (shared && shared.length > 0) params.push(`external=${shared.join(",")}`);
  const query = params.length > 0 ? `?${params.join("&")}` : "";
  return `https://esm.sh/${versioned}${query}`;
}

export interface ImportMap {
  imports: Record<string, string>;
}

/** The import map injected into a preview iframe. */
export function buildImportMap(
  externals: string[],
  versionOverrides?: Record<string, string>,
  urlOverrides?: Record<string, string>,
): ImportMap {
  const imports: Record<string, string> = {};
  /* Shared peers ride along transitively so a package that only asks
     for `codemirror` still gets one @codemirror/state for everyone. */
  const queue = [...externals];
  while (queue.length > 0) {
    const specifier = queue.shift() as string;
    if (specifier in imports) continue;
    imports[specifier] = urlOverrides?.[specifier] ?? esmUrl(specifier, versionOverrides);
    for (const peer of SHARED_PEERS[specifier] ?? []) queue.push(peer);
  }
  return { imports };
}
