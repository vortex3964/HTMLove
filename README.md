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

- **Any folder becomes a dashboard.** The picker browses the whole machine (or pastes
  a path), and htmlove remembers the folder you had open — if it has moved away it
  says so and falls back to the picker. Components are catalogued into a sidebar;
  click or drag one onto the board, drag panels to reorder them, pick 2–4 columns,
  and the layout and props survive reloads (drafts and props are stored per folder).
- **React components actually run.** `.tsx` sources are bundled in the browser with
  esbuild (wasm). Imports that live in the folder are bundled for real; npm
  packages load from esm.sh pinned to a single React 18; anything that cannot be
  found becomes a visible dashed placeholder instead of a silent crash. Compile and
  render errors are shown on the panel, not swallowed — with a hint naming the
  usual suspects (missing props, a missing provider, a library loaded twice).
- **Props, right where they are needed.** Components that take props get a small
  JSON editor behind the `{}` button in the panel header; it applies as you type
  and tells you when the JSON is off. When a component fails because it is
  missing props, **Create sample props** writes starter JSON read from the
  component's own TypeScript types (arrays of local interfaces, literal unions,
  functions), so drag lists and carousels run with one click. Strings that read
  like functions — `"(item, index) => item.title"` — become real functions in the
  sandbox, which is how render-prop components are fed.
- **Edit beside the board.** Every file of a component opens in a drawer on the
  right (CodeMirror) that pushes the board over, so the edited panel stays visible.
  Typing re-renders the preview shortly after you pause. Drafts are kept in
  localStorage, **Save** (or `Ctrl/Cmd+S`) writes back to the original files,
  **Reset** returns to the last on-disk version. `Esc` closes the drawer, `/`
  jumps to the sidebar search, and small toasts confirm what was saved.
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
  (badges, placeholders, error overlays) instead of blank boxes — and the overlay
  does not stop at the raw message: it names the likely cause.
- The CodeMirror family shares one `@codemirror/state`/`view`/`language` instance
  in previews, so editing your own CodeMirror-based components does not trip the
  "Unrecognized extension value" wall.

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
  board.ts           the dashboard model: mount/order + props JSON helpers
  persist.ts         localStorage: recents, last folder, board, props, prefs
src/state/store.tsx  the one React context: session, board, edits, manifest, view
src/ui/              shell, sidebar, board panels, editor drawer, picker, doctor
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
