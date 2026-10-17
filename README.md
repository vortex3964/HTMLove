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

Getting started:

    npm install
    npm run dev

then open the localhost link it prints. `npm test` runs the tests and
`npm run build` makes a production build.

If a snippet imports something that is not in the folder, htmlove shows a
visible placeholder instead of crashing, so you can see what is missing.
