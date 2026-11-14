# CarbonFibre source

CarbonFibre ships as one file, `CarbonFibre.html`. This folder is the same code split into
files by area, so each part can be read and changed on its own.

## Build

```
python build.py                      # writes CarbonFibre.html in this folder
python build.py --check FILE.html    # says whether FILE.html is exactly what src/ builds
```

The build only joins the files listed in `src/manifest.txt`, in that order. Nothing is
transformed except one placeholder: `__SCRIPT_HASHES__` in the Content-Security-Policy (`html/01-head.html`)
becomes the SHA-256 of each `<script>` block, so the browser runs those scripts and nothing else. Always
rebuild after changing any JavaScript; a hand-joined file would have no valid hashes and run nothing.

## Layout

| Folder | What's in it |
|---|---|
| `src/html/` | The page shell: head, body markup, closing tags |
| `src/css/` | Styles by area: header, layout, panes, editor lines, sketch board, task board, notes views, status bar, palette, narrow screens |
| `src/js/` | Code by area: state, find, paste, undo, panes, notes, backlinks, graph, search, sketch board (format, docking, links, arrange, tidy, layout), export (zip, docx, pdf), sheets, formulas, timer, task board, workbench, templates, Mermaid, session, shortcuts, boot |
| `src/js/pane/` | The editor pane, by job: DOM, content, focus and live view, line selection, extra cursors, line operations, mouse, dropping, the edited line (completion, input and paste, keys), split view, render |
| `src/js/01-host-bridge.js` | Inside the VS Code extension: folders, dialogs, storage and links go through VS Code. Does nothing in a browser |
| `src/js/grid/` | The sheet grid: view, render, editing, structure, sorting, clipboard, find, fill |
| `src/js/plugins/` | Obsidian plugins (desktop app only): DOM helpers, UI pieces, the app/vault/workspace/editor API, the host that loads plugins, the Plugins window. Styles in `css/26-plugins.css`. The rules for which plugins can run are in `desktop/plugins/compat.js` |

## Theme

Plain greys with one accent, light and dark (`css/01-base.css` sets the variables, `css/25-theme.css`,
loaded after the other sheets, re-points them to the plain look). The page follows
the system's light/dark setting until you pick one with the moon button (Alt+L).

**Your own theme** (command palette: *Theme: accent colour and custom CSS*): pick an accent colour, and
optionally paste CSS or load a `.css` file. The accent is adjusted per theme so text on it stays
readable. Both are kept in browser storage and applied before the page draws (`js/43-user-theme.js`,
and the script in `html/02-body.html`). *Theme: back to the default colours* clears it. Variables worth
setting, in `:root { }` for dark and `:root[data-theme="light"] { }` for light:

| Variable | What it colours |
|---|---|
| `--bg` | Page background (notes, sheets) |
| `--panel` | Side bars, dialogs, cards |
| `--chrome` | Title bar and activity bar |
| `--txt`, `--dim` | Text, secondary text and icons |
| `--line` | Borders and dividers |
| `--acc`, `--acc-text`, `--acc-soft` | Accent: buttons, focus, the active tab; accent text; accent backgrounds |
| `--sel` | Selected text and lines |
| `--h1c`, `--h2c` | Headings |
| `--sans`, `--mono` | Fonts (ones installed on the computer) |

A stylesheet can't load anything from outside: the page's security policy allows images and fonts from
`data:` only and no requests, so pasted CSS restyles the app but can't send anything anywhere.

## Graph

The website shows the graph as dots and lines (`js/14-graph-simple.js`, a small force layout; drag a
dot to move it). The desktop app shows the same by default, with **Show as planets** in the graph's top
bar to switch to the solar system (`js/14-graph.js`); the choice is remembered.

**Note:** the files in `js/pane/` are consecutive parts of one function (`createPane`), and
`js/grid/` of `makeGrid`. They share that function's local variables, so they are not
standalone scripts: edit them as parts of the whole, and always check the built file.

## Changing something

1. Edit the file(s) in `src/`.
2. `python build.py`
3. Check the files you changed with the new-code rules (not for `js/pane/` or `js/grid/`, which are
   parts of one function): `bash cf-tests/lint/lint.sh --strict src/js/NN-file.js`
4. Run the code checker on the built file: `bash cf-tests/lint/lint.sh path/to/CarbonFibre.html`
5. Run the tests: `CF_HTML=path/to/CarbonFibre.html python cf-tests/run_all.py`
   (3 at a time, about 70 seconds; `-j 1` for one at a time, `run_all.py sheet` for just the sheet tests)

To add a file, create it and add its path to `src/manifest.txt` where it belongs.

## Conventions for new and changed code

Older code uses `var` and plain global functions. Rather than rewrite 16,000 lines at once (every line
touched, nothing gained on screen, plenty of room to break things), code moves to the newer style one
file at a time, whenever a file is being changed anyway:

- `const` (or `let` when it's reassigned) instead of `var`; `===` instead of `==`.
  `lint.sh --strict` checks exactly this for one file.
- A new feature keeps its functions and state in one object named after it, for example
  `const SketchLibrary = { open() {...}, render() {...} }`, instead of adding more global names.
  Name clashes between files are already caught by the code checker (`no-redeclare`).
- `js/05-indexeddb.js` is the first file converted, as an example.
- To ask before doing something, use `Dialogs.confirm(msg)` / `Dialogs.prompt(msg, value)` (they return promises),
  not `window.confirm` / `window.prompt`: those never show inside VS Code, or in some embedded browsers.
