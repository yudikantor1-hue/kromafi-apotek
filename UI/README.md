# UI prototype and approved baseline

This folder is the client-approved UI prototype and workflow baseline for Kromafi Apotek. The
production application lives in `..\app\` and currently implements the Barang first slice; the
remaining menus exist only in this prototype. This prototype is not the application source; it
defines the approved interface direction and intended product flows. Its generated `index.html` is
the reviewed prototype output, not the production runtime.

The prototype source is split into small files; a build step joins them into one standalone
`index.html` for reviewing the approved design and workflow.

## Structure

```
UI/
├─ build.mjs              Build script (Node, no dependencies)
├─ index.html             Generated output — do not edit
├─ referensi_ui.html      Original single-file prototype (backup, read-only reference)
└─ src/
   ├─ index.html          Page shell: head, login screen, sidebar, header, <main> wrapper
   ├─ css/app.css         Custom styles (Tailwind config stays in src/index.html)
   ├─ pages/
   │  ├─ _header-actions.html   Per-page buttons in the header
   │  └─ <page>.html            Markup for each menu (18 files)
   └─ js/
      ├─ core/store.js    Sync queue helpers, default staff/distributor lists
      ├─ components/      Date picker and month picker Alpine components
      ├─ app.js           Root component (login, header, sync button)
      └─ pages/<page>.js  Logic for each menu (18 files)
```

## Editing

1. Change a file inside `src/`. For a menu, edit `src/pages/<page>.html` (markup) and/or
   `src/js/pages/<page>.js` (logic).
2. Treat this prototype as the approved UI baseline for the production application to be built in
   `app/`; keep production application code separate from this prototype.
3. Run the build from this folder:

   ```
   node build.mjs            # build once
   node build.mjs --watch    # rebuild on every change in src/
   node build.mjs --check    # exit 1 if index.html is older than src/
   ```

3. Open `index.html`.

`src/index.html` contains include markers that the build replaces:

```html
<!-- include: pages/penjualan.html -->
/* include: js/pages/penjualan.js */
```

Add a new page by creating its files and adding both markers in the right places
(markup inside `<main>`, script inside the `<script>` block at the bottom).

`--check` never writes; use it before handing the app over, in a pre-commit step, or in an editor
hook. `--watch` keeps running and rebuilds after every save inside `src/` (about 150 ms delay to
coalesce rapid saves), so `index.html` stays current while you edit.

## How the JavaScript is wired

Each `src/js/**` file registers itself with `Kromafi.register(() => { … })`, which runs when
Alpine starts. All files are concatenated into one classic script, in build order, so helpers in
`src/js/core/store.js` (for example `enqueueSync`) are available to every page module.
