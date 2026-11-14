# CarbonFibre desktop

The same app as `public/index.html`, in its own window on macOS, Windows and Linux (Electron).
Nothing in the app changes: it runs in Chromium, so the folder choice works on every platform.

## Run it

Needs Node 20+ and Python 3. Step by step for Windows, macOS and Linux, and fixes for `npm install`
errors: [INSTALL.md](INSTALL.md).

```
cd desktop
npm install
npm start          # builds page/index.html from ../carbonfibre-src, then opens the window
```

## Make installers

```
npm run dist:linux   # AppImage, x64 and arm64
npm run dist:win     # installer, x64 and arm64   (build on Windows)
npm run dist:mac     # .dmg + .zip, Intel and Apple silicon   (build on a Mac)
```

Output goes to `desktop/dist/`. You rarely need to: every push to `main` that changes the app runs
`.github/workflows/desktop.yml`, which tests, builds all three and publishes a GitHub Release
`v1.0.<build number>` with fixed file names (`CarbonFibre-mac-arm64.dmg`, `CarbonFibre-win-x64-setup.exe`,
`CarbonFibre-linux-x86_64.AppImage`, ...). The website's **Get the app** links to the latest one, and
installed apps update from it (`updater.js`, see INSTALL.md, Updates). The `version` in `package.json`
is set by the workflow; leave it at 1.0.0.

## Obsidian plugins

The desktop app runs Obsidian community plugins. Open **Plugins** (the puzzle piece in the left bar, or
"Plugins" in the command palette, Ctrl+P):

- **Community plugins** lists the whole Obsidian catalog, most downloaded first. Each plugin on screen is
  downloaded and checked before you install it. One of three answers: **Works**, **Partly works** (it runs;
  "What won't work" lists what's missing), or **Can't run here**, greyed out with the reason.
- **Installed** has a switch per plugin, its settings page (the gear) and uninstall. **Install from
  folder...** takes a plugin's own folder (holding `manifest.json` and `main.js`); **Import from this
  vault** copies the plugins Obsidian installed in your vault's `.obsidian/plugins`.

What plugins get: commands (in the palette, with their hotkeys), ribbon buttons, status bar items,
settings pages, notices, modals, pickers and menus, code blocks they draw (` ```dataview `, ...),
Markdown post processors, editor autocomplete, views in a side panel, and the vault, metadata cache,
workspace, editor and file manager APIs, all on CarbonFibre's own notes.

**The internet, per plugin.** The page itself still can't reach the network (it keeps `connect-src 'none'`).
A plugin that uses the internet (`requestUrl`, `request`, or a plain `fetch()`) is marked **Internet** and
asks when you switch it on, in the app's own dialog: the page can't answer it, so a plugin can't grant
itself access. Its requests then go through the main process (`plugins/store.js` `request`), which makes
them only for plugins you allowed. **Installed** shows which plugins can use the internet, with **Take
away** / **Allow...** to change it. Plugins share one page, so this keeps well-behaved plugins to what you
allowed; it is not a wall between plugins. Allow only plugins you trust.

What they don't get, so plugins that depend on it are greyed out or partly work:

| Missing | Why |
|---|---|
| Other ways online | Node's `http`/`https`, `XMLHttpRequest`, WebSockets and `window.fetch` aren't offered. Plugins that go online only that way and are online by nature are greyed out. |
| Node.js / Electron | Plugins run inside the page, not with system access. Desktop-only plugins that need files, a shell or a terminal are greyed out; others lose only those features. |
| Obsidian's editor (CodeMirror) | CarbonFibre has its own editor, so editor decorations don't show. Plugins that only change the editor are greyed out. |
| Obsidian internals | Private APIs (core plugins, themes, Bases) aren't there; those parts may not work. |

On the 500 most downloaded plugins (November 2026), the checker rates 147 as working, 287 as partly
working and 66 (13%) as unable to run: 87% can run (before internet per plugin: 71%). 184 of them use
the internet and ask for it. Of the 66: 44 need Node.js or Electron (files, a shell), 22 reach the
internet through Node's `http`/`https`, 8 only change Obsidian's editor, 6 use XMLHttpRequest or sockets
(some have more than one).

Plugins live in the app's data folder (`plugins/<id>/`, each with its own `data.json` settings), not in
the vault, so the website never sees them. Plugin views open in a panel on the right.

## How it fits together

| File | What it does |
|---|---|
| `main.js` | Opens the window, serves the page from `app://carbonfibre/`, opens web links in the system browser, refuses permissions the app doesn't use |
| `preload.js` | Gives the page `window.cfDesktop`: native confirm, choose and prompt, and the plugin calls (internet requests only for plugins you allowed). No Node or file access |
| `prompt.html`, `prompt.js`, `prompt-preload.js` | The text-input dialog (Electron has no `window.prompt`) |
| `build-page.js` | Runs `carbonfibre-src/build.py` into `page/index.html` |
| `updater.js` | Updates: checks the latest GitHub release, and on your yes downloads it, checks its SHA-256, swaps it in and restarts |
| `build-icons.js`, `build/icon.*` | The app icon: the butterfly the app draws as its logo (`appIconSvg`, dark theme), as `icon.svg`, a 1024 px `icon.png` (macOS, Linux) and `icon.ico` (Windows). `npm run icons` redraws them after the logo changes |
| `plugins/store.js` | Plugins: the community catalog, downloads (GitHub), installed plugins, their settings files, which may use the internet (`network.json`) and their requests, the code the page loads |
| `plugins/compat.js` | Reads a plugin's code (never runs it) and decides Works / Partly works / Can't run, with reasons |
| `test/update_test.js` | The update path end to end on Linux, with a made-up release: check, download, SHA-256, swap, restart |
| `test/run.js` | `npm test`: installs `test/fixture-plugin/` in a throwaway data folder and checks the plugin API end to end, the internet permission against a server on this machine, then checks the web build keeps plugins off |

`Dialogs` in `carbonfibre-src/src/js/01-host-bridge.js` uses `window.cfDesktop` when it's there.

## Things to know

- **Plugins and your notes.** A plugin you switch on can read and change your notes, as in Obsidian.
  It can only send them somewhere if you let it use the internet; otherwise the network is blocked, and
  while plugins are on, links ask before opening.
- **Hardening.** Only the app's own page, in the main window's top frame, can call the main process. Plugin
  requests can't reach link-local or reserved addresses (cloud metadata at 169.254.169.254 included), checked
  after DNS and again on every redirect. Plugins can't rewrite any plugin's `main.js`, `manifest.json` or
  `styles.css` from the page. While a plugin is on, the page can't read the clipboard without a paste. Updates
  must match the SHA-256 the release lists. Builds switch off Electron's run-as-Node mode, `NODE_OPTIONS` and
  `--inspect` (Electron fuses), so the app can't be used to run other code.

- **Notes live in a folder, always.** The desktop app has no "browser storage" option: on first start it asks
  for a folder (pick one or make one), and doesn't go further until it has one. Notes an older version kept
  in the app's own storage are moved into that folder as `.md` files (sheets as `.csv` in `sheets/`), then
  removed from there. The website and the app can open the same folder. Settings (theme, pins, layout)
  are still remembered by the app itself.
- **Closing while saving:** if folder writes are still going, the app asks before closing.
- **Icon:** put a 1024×1024 `icon.png` in `desktop/build/`; electron-builder makes the Mac, Windows and
  Linux icons from it. Until then the default Electron icon shows.
- **Unsigned builds:** macOS says the app "can't be opened" (right-click → Open, or
  `xattr -cr /Applications/CarbonFibre.app`), and Windows SmartScreen asks "Run anyway". Signing needs an
  Apple Developer account / a Windows code-signing certificate; see electron-builder's code-signing docs.
