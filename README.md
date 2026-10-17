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
- move panels around by their header, resize them from the corner like a
  little window, and your board — positions, sizes, props — comes back the
  way you left it
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
point it at a folder by hand when the file or the value is missing, the
folder remembered by the browser is the fallback.

If a snippet imports something that is not in the folder, htmlove shows a
visible placeholder instead of crashing, so you can see what is missing.
The doctor can do better than placeholders: the Resolve button fetches the
real files and writes them next to your components, then rescans.
