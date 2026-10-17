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
  return `https://esm.sh/${versioned}?deps=react@${PREVIEW_REACT_VERSION}`;
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
  for (const specifier of externals) {
    imports[specifier] = urlOverrides?.[specifier] ?? esmUrl(specifier, versionOverrides);
  }
  return { imports };
}
