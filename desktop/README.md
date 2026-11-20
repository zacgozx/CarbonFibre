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
  downloaded and checked before you install it: **Works** or **Partly works** (it runs; "What won't work"
  lists what's missing), plus **Internet** or **Node.js** when it will ask for that.
- **Themes** installs Obsidian community themes (or imports the ones in your vault's `.obsidian/themes`)
  and switches between them and CarbonFibre's own look. See "Obsidian themes" below.
- **Installed** has a switch per plugin, its settings page (the gear) and uninstall. **Install from
  folder...** takes a plugin's own folder (holding `manifest.json` and `main.js`); **Import from this
  vault** copies the plugins Obsidian installed in your vault's `.obsidian/plugins`.

What plugins get: commands (in the palette, with their hotkeys), ribbon buttons, status bar items,
settings pages (including Obsidian 1.13's declarative ones), notices, modals, pickers and menus, code blocks
they draw (` ```dataview `, ...), Markdown post processors, editor autocomplete, views in a side panel, and
the vault, metadata cache, workspace, editor and file manager APIs, all on CarbonFibre's own notes. Also
what popular plugins reach for beyond the documented API: the real moment.js and CodeMirror 6 (one shared
copy, as in Obsidian), `Buffer`, `i18next`, the file explorer (CarbonFibre's note list), core plugins
(`app.internalPlugins`, off but answering, with search and the palette wired to CarbonFibre's), view and
embed registries, hover link sources, `app.secretStorage` (kept encrypted by the system keychain), images
from your notes folder (`getResourcePath`), `obsidian://` links (open, search, new, and actions plugins
register), and plugins compiled to old JavaScript.

**The internet, per plugin.** The page itself still can't reach the network (it keeps `connect-src 'none'`).
A plugin that uses the internet (`requestUrl`, `request`, or a plain `fetch()`) is marked **Internet** and
asks when you switch it on, in the app's own dialog: the page can't answer it, so a plugin can't grant
itself access. Its requests then go through the main process (`plugins/store.js` `request`), which makes
them only for plugins you allowed. **Installed** shows which plugins can use the internet, with **Take
away** / **Allow...** to change it. Plugins share one page, so this keeps well-behaved plugins to what you
allowed; it is not a wall between plugins. Allow only plugins you trust.

**Node.js, per plugin.** In Obsidian every plugin has Node.js and Electron (files, programs, the network).
Here a plugin that uses them is marked **Node.js** and asks when you switch it on, in the app's own dialog,
with a stronger warning. Allowing it includes the internet. The window normally runs sandboxed; the first
time a plugin is allowed Node.js, the window closes (saving first) and opens again without the sandbox, and
it opens that way only while such a plugin is on. That plugin then gets Node's own modules (`fs`,
`child_process`, `electron`, ...; nothing from the app's files), the real `process` and `Buffer`,
`Platform.isDesktopApp` and `FileSystemAdapter.getBasePath()` (the app asks once which folder your notes
are in). Plugins you didn't allow still get the page's stand-ins, and **Installed** has **Take away** /
**Allow...** for each. Plugins share one page, so while one has Node.js, any plugin that tries could reach
it: allow it only for plugins you'd trust with your computer, as you do in Obsidian.

**Obsidian themes.** A theme is CSS written for Obsidian's page. CarbonFibre doesn't turn into that
page; it meets the theme halfway (`js/plugins/06-themes.js`, `css/27-obsidian-themes.css`):
Obsidian's class names go on CarbonFibre's own parts (`.workspace`, `.nav-file-title`, `.workspace-leaf`,
`.workspace-tab-header`, `.markdown-rendered`, `.status-bar`, `theme-dark` / `theme-light`, ...), and
Obsidian's variables (`--color-base-00` to `100`, `--accent-h/s/l`, `--background-primary`,
`--text-normal`, `--interactive-accent`, `--font-text`, `--h1-color`, ...) are mapped onto CarbonFibre's,
so a theme recolours the whole app and changes its fonts. Theme-settings plugins then work on what the
theme controls: Style Settings finds the theme's settings, and Minimal Theme Settings' switches (colourful
headings, contrast, fonts) show. The editor's Obsidian styling (Live Preview decorations, `.cm-*`) and
layout rules for parts CarbonFibre doesn't have don't apply, and fonts or images a theme loads from the web
stay blocked. Light or dark follows the moon/sun button. `test/themes_live.js` screenshots a folder of
themes (checked with Minimal, AnuPpuccin, Things, Blue Topaz, Catppuccin, Primary, Border, Atom, Nord,
Typewriter).

What they still don't get:

| Missing | Why |
|---|---|
| Obsidian's editor (CodeMirror) | CarbonFibre has its own editor. Plugins build their editor extensions from the real CodeMirror and load, but the extensions aren't attached, so editor decorations and anything reaching `editor.cm` don't work. Replacing the editor is a separate project. |
| Live connections | WebSockets and EventSource aren't offered to plugins without Node.js. |
| Some Obsidian internals | Private parts beyond the ones listed above (graph internals, Bases views, Obsidian's own DOM layout) may not work. |
| Remote images | Images from websites stay blocked (privacy); images from your notes folder show. |

Measured by running them, not only by reading their code: `test/live.js` installs each of the 500 most
downloaded plugins (November 2026) in a throwaway data folder, switches it on, opens its settings and runs
its commands' checks.

| | Starts | Starts with no errors |
|---|---|---|
| Before this work | 390 (78%) | 278 (56%) |
| Now, plugins without Node.js | 455 (91%) | 383 (77%) |
| Now, with Node.js allowed (as in Obsidian) | 471 (94%) | 396 (79%) |

"Starts with no errors" means it switched on, drew its settings and logged nothing wrong; it doesn't prove
every feature works. In particular 128 of the 500 use Obsidian's editor (CodeMirror) for part of what they
do, and those parts stay inert until the editor is replaced. Most of what still fails is a long tail of
private Obsidian internals, one or two plugins each. Reading the code alone (`compat.js`) rates 171 as
working and 328 as partly working; 262 will ask for the internet and 127 for Node.js.

Plugins live in the app's data folder (`plugins/<id>/`), not in the vault, so the website never sees them.
Their settings (what Obsidian keeps in `data.json`), which ones are on, their internet and Node.js grants
and their secrets are in the app's database (below). Plugin views open in a panel on the right.

## How it fits together

| File | What it does |
|---|---|
| `main.js` | Opens the window (sandboxed, or with Node.js while a plugin you allowed it is on), serves the page, plugin code, `vendor/` and notes-folder images from `app://carbonfibre/`, opens web links in the system browser, refuses permissions the app doesn't use |
| `preload.js` | Gives the page `window.cfDesktop`: native confirm, choose and prompt, and the plugin calls (internet requests only for plugins you allowed). In a Node.js window, also Node's built-in modules for the plugins you allowed |
| `prompt.html`, `prompt.js`, `prompt-preload.js` | The text-input dialog (Electron has no `window.prompt`) |
| `build-page.js` | Runs `carbonfibre-src/build.py` into `page/index.html`, and puts moment.js and a CodeMirror 6 bundle in `page/vendor/` for plugins |
| `updater.js` | Updates: checks the latest GitHub release, and on your yes downloads it, checks its SHA-256, swaps it in and restarts |
| `build-icons.js`, `build/icon.*` | The app icon: the butterfly the app draws as its logo (`appIconSvg`, dark theme), as `icon.svg`, a 1024 px `icon.png` (macOS, Linux) and `icon.ico` (Windows). `npm run icons` redraws them after the logo changes |
| `plugins/store.js` | Plugins: the community catalog, downloads (GitHub), installed plugins, their settings files, which may use the internet (`network.json`) or Node.js (`node.json`) and their requests, secrets (`secrets.json`, encrypted), the code the page loads |
| `plugins/themes.js` | Obsidian themes: the community catalog, downloads (GitHub), installed themes (`themes/<name>/theme.css`) and the one in use (`themes/active.json`). CSS only |
| `test/themes_live.js` | Not part of `npm test`: applies each theme in a folder and screenshots it dark and light |
| `plugins/compat.js` | Reads a plugin's code (never runs it) and decides Works / Partly works, what won't work, and whether it will ask for the internet or Node.js |
| `test/node_test.js` | Node.js per plugin end to end: asked in the dialog, the window reopens with it, the allowed plugin gets real files, another plugin doesn't, taking it away works |
| `test/live.js` | Not part of `npm test`: runs a folder of real plugins one by one and records what broke (`CF_LIVE_NODE=1` with Node.js allowed) |
| `test/popout_test.js` | `npm test`: a note popped out into its own window opens, shows the note, sends edits back to the main window, saves nothing itself, can't open further windows, keeps working when the main window reloads, and closes with it without losing what was just typed |
| `test/db_test.js` | `npm test`: the page's storage goes to `carbonfibre.db`, browser storage and the old JSON files are copied in once, and it all survives a restart |
| `test/update_test.js` | The update path end to end on Linux, with a made-up release: check, download, SHA-256, swap, restart |
| `test/run.js` | `npm test`: installs `test/fixture-plugin/` in a throwaway data folder and checks the plugin API end to end, the internet permission (requestUrl, fetch, XMLHttpRequest) against a server on this machine, old compiled plugins, moment, Buffer, secrets, notes-folder images, the file explorer, then checks the web build keeps plugins off |

`Dialogs` in `carbonfibre-src/src/js/01-dialogs.js` uses `window.cfDesktop` when it's there.

## Things to know

- **Plugins and your notes.** A plugin you switch on can read and change your notes, as in Obsidian.
  It can only send them somewhere if you let it use the internet or Node.js; otherwise the network is
  blocked, and while plugins are on, links ask before opening. A plugin with Node.js can do anything you
  can on this computer.
- **Hardening.** Only the app's own page, in the main window's top frame, can call the main process. Plugin
  requests can't reach link-local or reserved addresses (cloud metadata at 169.254.169.254 included), checked
  after DNS and again on every redirect. Plugins can't rewrite any plugin's `main.js`, `manifest.json` or
  `styles.css` from the page (a plugin with Node.js can, like any program you run). While a plugin is on, the page can't read the clipboard without a paste. Updates
  must match the SHA-256 the release lists. Builds switch off Electron's run-as-Node mode, `NODE_OPTIONS` and
  `--inspect` (Electron fuses), so the app can't be used to run other code.

- **Notes live in a folder, always.** The desktop app has no "browser storage" option: on first start it asks
  for a folder (pick one or make one), and doesn't go further until it has one. Notes an older version kept
  in the app's own storage are moved into that folder as `.md` files (sheets as `.csv` in `sheets/`), then
  removed from there. The website and the app can open the same folder. Settings (theme, pins, layout)
  are still remembered by the app itself.
- **The app's own data is one SQLite file**, `carbonfibre.db` in the app's data folder (`db.js`). Everything
  the website keeps in browser storage (settings, the task board, the timer, sessions, completion picks)
  goes there instead, with no 5 MB browser limit; so do the plugin and theme settings that used to be JSON
  files. What the browser storage or those files held is copied in once on first start and the originals are
  left alone. Notes are never in it: they stay `.md` files in your folder. SQLite is Electron's own
  (`node:sqlite`), so nothing native is added to the build.
- **Closing while saving:** if folder writes are still going, the app asks before closing.
- **Icon:** put a 1024×1024 `icon.png` in `desktop/build/`; electron-builder makes the Mac, Windows and
  Linux icons from it. Until then the default Electron icon shows.
- **Unsigned builds:** macOS says the app "can't be opened" (right-click → Open, or
  `xattr -cr /Applications/CarbonFibre.app`), and Windows SmartScreen asks "Run anyway". Signing needs an
  Apple Developer account / a Windows code-signing certificate; see electron-builder's code-signing docs.
