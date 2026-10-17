# htmlove

A local playground for loose HTML, CSS and React snippets: point it at any folder
and everything inside becomes browsable, live, editable and saveable — in place.

```
npm install
npm run dev      # open the printed localhost URL (http://localhost:5199)
npm test         # unit + integration tests
npm run build    # production build (serve it with npm run preview)
```

No account, no cloud: a small dev-server plugin reads and writes the folders you
choose, and everything else happens in your browser.

## What it does

- **Any folder becomes a gallery.** The picker browses the whole machine (or paste
  a path). Folders of loose snippets — `hi.html` + `hi.css` pairs, standalone HTML,
  `.tsx` sources and `.txt` files with CSS and markup pasted together — are
  catalogued into components and rendered live, side by side, each in its own
  sandboxed iframe.
- **React components actually run.** `.tsx` sources are bundled in the browser with
  esbuild (wasm). Imports that live in the folder are bundled for real; npm
  packages load from esm.sh pinned to a single React 18; anything that cannot be
  found becomes a visible dashed placeholder instead of a silent crash. Compile and
  render errors are shown on the card, not swallowed.
- **Edit with live preview.** Every file of a component opens in an editor
  (CodeMirror). Typing re-renders the preview shortly after you pause. Drafts are
  kept in localStorage, **Save** writes back to the original files, **Reset**
  returns to the last on-disk version.
- **A dependency doctor.** A folder-wide table of every import and remote asset:
  classify imports, probe CDN reachability, find dead remote images and replace
  them with neutral placeholders (as editable changes), edit the folder's
  `playground.deps.json`, and pin versions or map any import to a custom URL.
- **Design-token rescue.** CSS variables a snippet uses but never defines (like
  `--primarylw` in the glass-folder demo) are detected per component, given a
  sensible default, injected into previews, and adjustable — with one click they
  are written into `playground.deps.json`.

## playground.deps.json

Drop this file into the folder you point htmlove at. Everything in it is optional.

```jsonc
{
  // pin package versions for the import map (otherwise: latest / built-in pins)
  "packages": { "lucide-react": "0.469.0" },

  // map any import specifier to a full URL — wins over package resolution
  "urls": { "@/registry/magicui/file-tree": "https://esm.sh/@magicui/file-tree" },

  // never fetch these; always show the visible stub instead
  "stubs": ["@untitledui/icons"],

  // force Tailwind on/off for every component (default: auto-detect)
  "tailwind": false,

  // design tokens injected into every preview (overridable per component)
  "tokens": { "--primarylw": "#6366f1" },

  // per-component overrides, keyed by folder id or display name
  "components": {
    "glass-folder/glass.tsx": { "tailwind": true, "tokens": { "--primarylw": "tomato" } }
  }
}
```

## How previews stay safe and honest

- Previews run in `<iframe sandbox="allow-scripts">` — component code can never
  touch the shell, its state or the file API.
- The file API only serves files under the chosen root, rejects path escapes, and
  skips noise (`node_modules`, `.git`, `dist`, …) with sane size caps.
- Missing imports, unresolved assets and render errors surface as first-class UI
  (badges, placeholders, error overlays) instead of blank boxes.

## Project layout

```
server/fsApi.ts      dev-server API: browse, scan, write, asset streaming
src/backends/        the FileBackend interface + server implementation
src/core/            pure logic, heavily unit-tested
  catalog.ts         snapshot -> components (pairing, .txt split, attribution)
  imports.ts         import parsing, specifier resolution
  deps.ts            static import classification (the deps panel's brain)
  compile.ts         esbuild bundling + stub/asset resolver plugin
  packages.ts        esm.sh URLs + import maps
  manifest.ts        playground.deps.json
  tokens.ts          CSS variable detection + injection
  assets.ts          remote-asset extraction, probing, dead-link rewriting
  edits.ts/drafts.ts preview-vs-disk content, dirty logic, localStorage drafts
src/state/store.tsx  the one React context: session, edits, manifest, view
src/ui/              shell, gallery, detail playground, picker, doctor
tests/               unit + integration tests (vitest)
```

## Known limits

- npm packages are fetched from esm.sh, so previews of React components need
  network access. A `playground.deps.json` `urls` override can point anywhere,
  including a local file server.
- The File System Access API picker is not built yet — the dev-server API works in
  every browser instead (and while `vite preview` is running too).
- Component styles are sandboxed per preview; snippets that rely on styles from
  outside their own folder will only look right if you add those files.
