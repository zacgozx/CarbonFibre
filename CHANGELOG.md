# Changelog

Newest first. Dates are when the change was made; each line names the commit.

## 2026-11-21

### Timeline past midnight, and a day you can set
- The Timeline heading carries its day (`## Timeline 2026-11-21`): set with the browser's own date picker
  on the heading, or today's date when the first entry is made. Stamps and entries on a later day carry
  their date (`- 2026-11-22 00:10 Restart`), so the list and the strip stay in order past midnight (the
  strip's axis runs on across 00:00). Entries on the heading's day stay plain `HH:MM`; picking a new day
  drops dates that now match it. Days are counted with `Date.UTC`, so a daylight-saving change can't
  shift one. Copy timeline names the heading's day.
- Tests in `timeline_test.py`: sorting and stamping after midnight, unticking, the strip's minutes,
  daylight-saving days, the picker (sets, rewrites dates, clears, never opens the heading).

### Rubber ducky mode
- **Toggle rubber ducky mode** (palette) or `:duck`: a panel beside the note that reads its code blocks by
  pattern, offline. Per block: summary, steps with kinds and fields added/removed/after, names with line
  numbers (unused marked), reads/writes, and questions (SPL-1 field dropped by an earlier command, LS-1
  Logstash field nothing made, SQL-1 not grouped or aggregated, UNUSED-1). Data flow between blocks at the
  top. Click to jump, hover to highlight, the step under the caret highlighted. Vim: `gd`, `]]` `[[`, `K`,
  Ctrl+O / Ctrl+I. Hidden in Source mode and panes under 520px. Rules: `docs/rubber-duck-rules.md`.
- Tests: `duck_rules_test.py` (78 cases, each rule's trigger and must-not), `duck_test.py` (the panel and keys).
- Fixed on the way: vim **Ctrl+R** was read as the `<` operator and did nothing (check added to
  `vim_test.py`); code blocks showed single-quoted strings as `&#39;` and the rest of the line as a comment,
  because highlighting ran on already-escaped text.

### Timeline strip
- The Timeline is drawn under its heading on a time axis: dots for entries (filled: ticked step, hollow:
  your own), shaded stretches, the longest wait marked, a "now" line while it's going, labels in rows so
  they don't overlap (reading leftwards near the right edge), dots in the same minute side by side.
  Hover for detail, click or Enter to go to the step, drag to pan, Ctrl+scroll or +/- to zoom, Fit.
  Editing an entry redraws it. Tests in `timeline_test.py`.

### Timeline for incident and change notes
- In a note with a `## Timeline` heading, ticking a step stamps the time at its end and lists it in the
  Timeline in time order; unticking takes both away; one undo step. Your own entries stay. Alt+Enter or
  `/log` adds an entry; "Copy timeline" (on the heading, or the palette) copies plain `HH:MM text` lines
  for a ticket. Notes without the heading are never changed. The Change template gains a Timeline.
- Tests: `timeline_test.py` (new). `folders_test.py` checks saved pins without a reload (a reload on a busy
  machine could read storage from before the last write).

### Sheets and Linked mentions bars line up
- The Sheets bar at the bottom of the sidebar and the Linked mentions bar at the bottom of a pane are
  both 40px under a 1px line, with centred labels, so collapsed their lines and labels are level.
  Check in `layout_test.py`.

### CI: the pop-out test waited for nothing
- `desktop/test/popout_test.js` added its note before the page had loaded its own notes, so on a busy
  machine (CI) the note was replaced and nothing popped out. It now waits for the page to be ready,
  opens the window as a user action (as the app always does), and waits for the note's window to show the
  note. Passed 15 runs out of 15 with five running at once; it failed 1 in 10 that way before.

### Fixes from the audit
- Popped-out note renamed, moved or deleted in the main window: its window now says edits there aren't
  saved and offers Copy (they used to be dropped without a word).
- Sketch files: a drawing still being written counts as unsaved, so closing the page asks first (the last
  strokes could be lost).
- Sheets: ROUND rounds as Excel does (1.005 -> 1.01, -2.5 -> -3); a long chain of formulas asked for from
  its far end (a total pointing at the last row) works instead of showing #ERROR!; MIN and MAX work on
  ranges of any size.
- Splitting or closing a pane no longer scrolls the other panes back to the top.
- Word suggestions re-read only the notes that changed: 4 ms after an edit in a 2,000-note vault, from about 200 ms.
- Desktop updates on Linux and Windows start the new copy (or installer) as the app quits, not before, so it
  can't find the old copy still open and give up.
- The tab menu is built by the same code as every other menu; newer built-in JavaScript (structuredClone,
  toSorted, replaceChildren) where Modern Web Guidance flagged the old forms.
- Two tests that failed now and then: they set storage just before a reload, which the browser can read back
  missing; they no longer do.
- Tests: `sheetcalc_test.py` (new); `layout_test.py`, `complete_test.py`, `sketchfolder_test.py`,
  `folders_test.py`, `desktop/test/update_test.js` updated.

### Drag a tab out of the window
- A tab dragged out of the window and let go outside it comes out into a window of its own at that spot,
  as in VS Code (the same pop-out window as "Move into a new window"). Let go inside the window, it moves
  or splits as before.
- Desktop tests now fail with where they stopped if a page crashes or nothing finishes within 90 s, an
  unanswerable dialog can't hold them, and the CI test job stops after 15 minutes. (The last run sat
  until it was cancelled; the same commit passes here, so the next run will say where it stuck.)
- Tests: `layout_test.py` (inside vs outside), `popout_test.js` (opens where the tab was let go).

### Task board removed
- Removed: the Board (lanes, cards, quick-add, filter chips, the "Working on" banner and its clock), the
  Dashboard (figure cards, My tickets, Last 7 days, Time by type, Activity), ServiceNow (ticket links,
  "Open ticket", the address and link-style commands), the task board button in the left bar, "+ Task",
  the task-board commands, ticket badges and the "On the board" filter in Notes, and the board's copy in
  a vault (`.carbonfibre/taskboard.json` is no longer read or written; an old one can be deleted).
  About 1,200 lines of code and styles.
- Kept: the Notes panel (Overview: pinned notes, pinned folders, recent notes; All notes), its Incident,
  Change and Daily note buttons and its pin; it opens from the All notes button in the left bar, Alt+N
  or the command palette. The Timer in the status bar is unchanged.
- Old saved board data is ignored and dropped on the next save.
- Tests: `dash_test.py`, `tb2_test.py`, `tbvault_test.py` and `link_test.py` deleted (board only);
  `allnotes`, `notesdash`, `library`, `reveal`, `tooltips`, `security` and `cleanup` updated.

### Pop-out: no lost edits when the main window reloads or closes
- A popped-out note says hello to the main window every 1.5 s, with its text while an edit is
  unconfirmed. A reloaded main window recognises its popped-out notes again and saves what they typed
  meanwhile. With no answer, a bar says changes aren't being saved; with the main window closed, it
  offers to copy the note. In the desktop app the note's window closes with the main one, and its text is
  taken from it just before, so keystrokes typed a moment before closing are saved too.
- A popped-out window no longer asks the desktop app about updates (the main window shows them).
- Tests: `cf-tests/layout_test.py` (reload and close), `desktop/test/popout_test.js` (9 checks).

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
