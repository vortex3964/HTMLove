# htmlove

A small local playground for HTML and React snippets.

Point htmlove at any folder on your computer that has loose components in it.
They show up in a sidebar, you click one, and it runs live on your board.
Your files stay on your machine — no account and no build step. Previews do
reach the network for their runtime: React and other npm packages load from
esm.sh, Tailwind snippets load its CDN script, and "Create sample props"
fills in placeholder images from picsum.photos.

Things you can do:

- watch React components run for real, bundled right in the browser
- feed them props as JSON, or hit "Create sample props" and let htmlove read
  the component's own types for you
- open the code drawer on the right, edit a file, and watch the preview catch up
- save edits straight back to the original files, or reset to undo
- drag panels around, switch between 2, 3 or 4 columns, and your board comes
  back the way you left it
- open the dependency doctor to see what every component imports, test the
  remote URLs it fetches, and pull in missing files with one click

Getting started:

    npm install
    npm run dev

then open the localhost link it prints. `npm test` runs the tests and
`npm run build` makes a production build.

htmlove remembers the folder you last opened in a `.env` next to the app
(`HTMLOVE_FOLDER`): picking a folder in the app writes it there, and on
the next launch it opens straight away. Copy `.env.example` to `.env` to
point it at a folder by hand — when the file or the value is missing, the
folder remembered by the browser is the fallback.

If a snippet imports something that is not in the folder, htmlove shows a
visible placeholder instead of crashing, so you can see what is missing.
The doctor can do better than placeholders: the Resolve button fetches the
real files and writes them next to your components, then rescans. Built-in
presets cover shadcn/ui components, magicui registry items and the common
`cn` helper; anything else is pointed at by a `resolve` map in
`playground.deps.json`:

    {
      "resolve": {
        "./card": "registry:https://ui.shadcn.com/r/styles/new-york/*.json",
        "@/components/base/*": "gh:untitleduico/react/components/base/*",
        "@/utils/cx": "url:https://raw.githubusercontent.com/untitleduico/react/HEAD/utils/cx.ts",
        "@/lib/utils": "builtin:cn"
      }
    }

The `*` in a rule key is a prefix wildcard and captures the rest of the
specifier; the `*` in the source template gets replaced by that capture.
Sources are `gh:<owner>/<repo>/<path>` (raw GitHub, probing .tsx/.ts/… and
index files), `registry:<item-url>` (a shadcn-registry JSON item, which is
what shadcn and magicui serve), `url:<file-url>` (one exact file) and
`builtin:cn` (a tiny clsx + tailwind-merge helper). The resolver follows
the imports of everything it fetches, so a single rule can vendor a whole
component tree. Existing files are never overwritten — vendored files are
normal files you can read, edit and delete.

Two rules keep collections of snippets pleasant:

- **`@/` aliases belong to the snippet folder.** A file at
  `carousel/components/ui/button.tsx` treats `carousel/` as its project
  root, so `@/components/hooks/use-mobile` lands in (and resolves from)
  `carousel/components/hooks/use-mobile.tsx` — not at the top of the
  collection. Files at the scan root still resolve against the root.
- **Imported files are dependencies, not entries.** A `.tsx` that another
  file imports is kept out of the gallery: vendoring `./card` or
  `./calendar` never clones your snippet into a pile of look-alike cards.
  It still bundles into the preview and still gets scanned by the doctor.

A `playground.deps.json` belongs to the folder it sits in; one inside a
snippet subfolder only applies when you open that snippet directly.
