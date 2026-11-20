# Changelog

Newest first. Dates are when the change was made; each line names the commit.

## 2026-11-21

### Layout: split down, drag to split, floating panes, pop-out windows
- Panes split right or down (Alt+click on Split, or the bar's right-click menu); up to 6.
- A tab held near a pane's edge for a moment splits that way, with the half highlighted; a quick drop
  or one in the middle still moves the tab.
- Floating panes: moved by the bar, sized from the corner, double-click to dock.
- Pop out (VS Code's "Move into new window"): the note gets its own window running this same app, with a
  read-only copy of storage; edits go both ways and only the main window saves. In the desktop app it's a
  real window (`desktop/main.js` lets only these open). Opening a popped-out note focuses its window.
- The sidebar docks on the right by dragging its title. The whole layout is restored after a reload;
  "Reset the layout" in the command palette.
- Tests: `cf-tests/layout_test.py`, `desktop/test/popout_test.js`. Updated for the new menus and the
  6-pane limit: `reveal_test.py`, `tabmove_test.py`.

### Vim mode
- Off by default; "Toggle vim mode" in the command palette. Motions, counts, operators with motions and
  text objects, visual and visual line, put, undo/redo, `.`, search, `:w` `:q` `:s` `:%s`. No macros,
  marks or named registers. Tests: `cf-tests/vim_test.py`.

### Diagrams and the network
- Mermaid blocks are drawn under their code; pie charts and sequence diagrams are new; full-window view
  with pan and zoom. "Convert to sketch" moved from the code line to the diagram's "Edit as sketch"
  (`state_test.py`, `mmtypes_test.py` updated).
- The graph is called the Network; names are drawn wherever they don't overlap (most linked first), and
  "Find a note" in its bar flies to a note.

## 2026-11-20

### Typing: suggestions and snippets (3ddfa7e)
- **Fixed:** Enter took the word suggestion instead of starting a new line. Enter now always starts a new
  line for word suggestions; **Tab** takes them. Enter still takes a `[[link]]` suggestion, or one you moved
  to with the arrow keys.
- Ranking: start of the word, then the start of a part (`vault` -> `ObsidianVault`), then the letters in
  order (`splk` -> `Splunk`). Words you picked before (recent picks more), words used often, and words in
  notes edited in the last three days rank higher. Picks are remembered (`carbonfibre-complete-picks`).
- The best suggestion shows faintly after the cursor at the end of a line; matched letters are bold.
- Snippets after `/`: `/date`, `/time`, `/now`, `/today`, `/tomorrow`, `/yesterday`, and at a line start
  `/todo`, `/done`, `/h1`, `/h2`, `/quote`, `/code`, `/divider`.
- The list opens above the line when there's no room below and scrolls when long; it closes when the
  cursor moves; nothing is suggested inside `inline code` or code blocks. Screen readers get a listbox
  with the highlighted option marked.
- Tests: `cf-tests/complete_test.py`.

### Desktop app: its own data in SQLite (3ddfa7e)
- One file, `carbonfibre.db` in the app's data folder (`desktop/db.js`, Electron's built-in `node:sqlite`,
  so nothing native is added to the build or the .dmg).
- Everything the page kept in browser storage (settings, task board, timer, sessions, suggestion picks)
  is stored there instead, with no 5 MB browser limit. Browser storage is copied in once on first start
  and left in place.
- Plugin settings (`data.json`), which plugins are on, their internet and Node.js grants, secrets (still
  encrypted by the system keychain) and the active theme moved from JSON files into the database; each
  old file is read once and left as a backup.
- Notes are not in it: they stay `.md` files in your folder. The website is unchanged.
- Tests: `desktop/test/db_test.js`, added to `npm test` and the desktop workflow.

### Sketch library panel (1d325e1)
- Shapes and Files share one search box; switching tabs no longer jumps; file thumbnails are cached;
  search ignores the `.excalidraw` extension.

## 2026-11-19

### Sketch button with no note open (fe13636)
- Starts a new sketch instead of doing nothing.

### Graph as a tab, tooltips, UI fixes (fe84e06)
- The graph opens as a tab in a pane and keeps its zoom when you switch away and back.
- Tooltips: quick, show shortcut keys, hoverable, Esc closes, read correctly by screen readers.

### Modern web guidance fixes (527fdff)
- IME-safe Enter (Japanese, Chinese, Korean input), a real dialog for save conflicts, standard scrollbars.

### Reveal before open (cd89638)
- Clicking a note, sheet, board or graph that's already open takes you to it instead of opening it again.

## Earlier
- Obsidian themes (0059e06), plugins with Node.js per plugin (a94fc39), keychain only touched once a plugin
  saves a secret (4b7ea92), security patch (4b14519). See `git log` for the full history.
