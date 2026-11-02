# CarbonFibre for VS Code

The CarbonFibre app (the same one as the website) in a VS Code panel, working on a folder of Markdown
notes: notes with `[[links]]`, the task board, sketches, sheets, search and the graph.

## Install

1. Get `carbonfibre-<version>.vsix` (build it below, or from a release).
2. In VS Code: **Extensions** view → **...** menu → **Install from VSIX...** → pick the file.
   Or: `code --install-extension carbonfibre-0.1.0.vsix`

## Use

- **CarbonFibre: Open** (Ctrl+Shift+P) opens the panel on your notes folder.
- **CarbonFibre: Open a Notes Folder...** picks a different folder.
- The notes folder is the setting `carbonfibre.notesFolder` (relative to the workspace, or absolute), or
  the first workspace folder when that's blank.

Notes are plain `.md` files in that folder, so the VS Code editor, Git and other tools see the same files.
When a note changes outside the panel, CarbonFibre says so; press **Reload** (bottom left) to see it.

## How it differs from the website

| | Website | VS Code |
|---|---|---|
| Notes folder | Chosen in the browser (Edge, Chrome) | The workspace, or the setting |
| Questions (delete, rename, new folder) | Browser pop-ups | VS Code's dialogs and input box |
| Settings, pins, board, session | Browser storage | VS Code's storage for this workspace |
| Export to Word | Downloads | VS Code's save dialog |
| Export to PDF | Print dialog | Not available (webviews can't print) |
| Links | New tab | Your default browser (http, https and mailto only) |
| Theme | Follows the system | Follows VS Code |

VS Code may take some keys before the panel sees them (Ctrl+P opens VS Code's Quick Open). Use the
search box at the top of CarbonFibre, or Ctrl+Shift+P → the panel's own commands, instead.

## Security

The page keeps the website's Content-Security-Policy: no network requests and only its own scripts. It
can reach only the notes folder and folders or files you pick in a VS Code dialog; `host.js` refuses any
path that steps outside them (`..`, drive letters, backslashes).

## Build

```
python build.py                                   # media/carbonfibre.html from ../carbonfibre-src
npx --yes @vscode/vsce@2.32.0 package --skip-license
```

Tests: `node test/host_test.js` (the extension side) and `node test/bridge_test.js` (the app page and the
extension side together, in Chromium; needs Playwright for Node). `cf-tests/run_all.py` runs both.
