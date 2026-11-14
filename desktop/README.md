# CarbonFibre desktop

The same app as `public/index.html`, in its own window on macOS, Windows and Linux (Electron).
Nothing in the app changes: it runs in Chromium, so the folder choice works on every platform.

## Run it

Needs Node 20+ and Python 3.

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

## How it fits together

| File | What it does |
|---|---|
| `main.js` | Opens the window, serves the page from `app://carbonfibre/`, opens web links in the system browser, refuses permissions the app doesn't use |
| `preload.js` | Gives the page `window.cfDesktop`: native confirm, choose and prompt. No Node or file access |
| `prompt.html`, `prompt.js`, `prompt-preload.js` | The text-input dialog (Electron has no `window.prompt`) |
| `build-page.js` | Runs `carbonfibre-src/build.py` into `page/index.html` |

`Dialogs` in `carbonfibre-src/src/js/01-host-bridge.js` uses `window.cfDesktop` when it's there.

## Things to know

- **Storage is separate from the website.** "This browser" notes in the desktop app live in the app's own
  storage, not in your browser's. Folder notes are just `.md` files, so both can open the same folder.
- **Closing while saving:** if folder writes are still going, the app asks before closing.
- **Icon:** put a 1024×1024 `icon.png` in `desktop/build/`; electron-builder makes the Mac, Windows and
  Linux icons from it. Until then the default Electron icon shows.
- **Unsigned builds:** macOS says the app "can't be opened" (right-click → Open, or
  `xattr -cr /Applications/CarbonFibre.app`), and Windows SmartScreen asks "Run anyway". Signing needs an
  Apple Developer account / a Windows code-signing certificate; see electron-builder's code-signing docs.
