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
npm run dist:linux   # AppImage + .deb
npm run dist:win     # installer + portable .exe   (build on Windows)
npm run dist:mac     # .dmg + .zip, Intel and Apple silicon   (build on a Mac)
```

Output goes to `desktop/dist/`. Each platform is best built on that platform, so the easy route is
GitHub Actions: push a tag such as `v1.0.0` (or run **Desktop** from the Actions tab) and
`.github/workflows/desktop.yml` builds all three. The files are on the run page, and a tag also puts
them on a GitHub Release.

Bump `version` in `package.json` for each release.

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

What they don't get, so plugins that depend on it are greyed out or partly work:

| Missing | Why |
|---|---|
| The internet | Plugins can't reach the network, by design (the page keeps `connect-src 'none'`). Plugins whose main job is online (sync, AI, web clipping, publishing) are greyed out. |
| Node.js / Electron | Plugins run inside the page, not with system access. Desktop-only plugins that need files, a shell or a terminal are greyed out; others lose only those features. |
| Obsidian's editor (CodeMirror) | CarbonFibre has its own editor, so editor decorations don't show. Plugins that only change the editor are greyed out. |
| Obsidian internals | Private APIs (core plugins, themes, Bases) aren't there; those parts may not work. |

On the 500 most downloaded plugins (November 2026), the checker rates 115 as working, 239 as partly
working and 146 (29%) as unable to run: 71% can run. Almost all of the 146 need the internet or
Node.js. Allowing network access would raise this to about 90%.

Plugins live in the app's data folder (`plugins/<id>/`, each with its own `data.json` settings), not in
the vault, so the website never sees them. Plugin views open in a panel on the right.

## How it fits together

| File | What it does |
|---|---|
| `main.js` | Opens the window, serves the page from `app://carbonfibre/`, opens web links in the system browser, refuses permissions the app doesn't use |
| `preload.js` | Gives the page `window.cfDesktop`: native confirm, choose and prompt. No Node or file access |
| `prompt.html`, `prompt.js`, `prompt-preload.js` | The text-input dialog (Electron has no `window.prompt`) |
| `build-page.js` | Runs `carbonfibre-src/build.py` into `page/index.html` |
| `build-icons.js`, `build/icon.*` | The app icon: the butterfly the app draws as its logo (`appIconSvg`, dark theme), as `icon.svg`, a 1024 px `icon.png` (macOS, Linux) and `icon.ico` (Windows). `npm run icons` redraws them after the logo changes |
| `plugins/store.js` | Plugins: the community catalog, downloads (GitHub only), installed plugins, their settings files, the code the page loads |
| `plugins/compat.js` | Reads a plugin's code (never runs it) and decides Works / Partly works / Can't run, with reasons |
| `test/run.js` | `npm test`: installs `test/fixture-plugin/` in a throwaway data folder and checks the plugin API end to end, then checks the web build keeps plugins off |

`Dialogs` in `carbonfibre-src/src/js/01-host-bridge.js` uses `window.cfDesktop` when it's there.

## Things to know

- **Plugins and your notes.** A plugin you switch on can read and change your notes, as in Obsidian.
  It can't send them anywhere: the network is blocked, and while plugins are on, links ask before opening.

- **Storage is separate from the website.** "This browser" notes in the desktop app live in the app's own
  storage, not in your browser's. Folder notes are just `.md` files, so both can open the same folder.
- **Closing while saving:** if folder writes are still going, the app asks before closing.
- **Icon:** put a 1024×1024 `icon.png` in `desktop/build/`; electron-builder makes the Mac, Windows and
  Linux icons from it. Until then the default Electron icon shows.
- **Unsigned builds:** macOS says the app "can't be opened" (right-click → Open, or
  `xattr -cr /Applications/CarbonFibre.app`), and Windows SmartScreen asks "Run anyway". Signing needs an
  Apple Developer account / a Windows code-signing certificate; see electron-builder's code-signing docs.
