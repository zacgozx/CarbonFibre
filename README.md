# CarbonFibre

A local notes app in one file. This repo holds the app, its source and its tests; GitHub Pages
publishes the app only.

| Folder | What it is | Published? |
|---|---|---|
| `public/` | The app (`index.html`) and `robots.txt` | Yes |
| `carbonfibre-src/` | The source, split by area; `build.py` joins it into the app | No |
| `cf-tests/` | The test suite and code checker | No |
| `CHANGELOG.md` | What changed, newest first | No |
| `SECURITY.md` | What protects your notes, the limits, and how to report a problem | No |
| `desktop/` | The same app as a desktop app for macOS, Windows and Linux (Electron), which also runs Obsidian community plugins (see its README) | No |
| `.github/workflows/pages.yml` | Rebuilds the app from the source and publishes `public/` on every push | — |
| `.github/workflows/desktop.yml` | Tests and builds the desktop app on every push that changes it (not docs or tests alone) and publishes it as a GitHub Release (the website's **Get the app** and the app's updates use it) | — |

## First time

1. **Create the repo** on GitHub (for example `carbonfibre`), empty: no README or licence.
   - A **private** repo needs GitHub **Pro** or above to use Pages. On a Free account the repo must be public.
2. **Upload this folder.** Either drag the folder's contents into the repo page ("uploading an existing file"),
   or with git:
   ```
   cd carbonfibre-repo
   git init -b main
   git add .
   git commit -m "CarbonFibre"
   git remote add origin https://github.com/YOU/carbonfibre.git
   git push -u origin main
   ```
3. **Turn on Pages:** repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Watch it publish:** the **Actions** tab shows the "Pages" workflow. When it's green, the app is at
   `https://YOU.github.io/carbonfibre/`.

## Updating

Edit files in `carbonfibre-src/src/`, then commit and push. The workflow rebuilds `index.html` from the
source and republishes it within a minute or two. (Before pushing, you can check locally:
`python carbonfibre-src/build.py public/index.html`, then the tests: see `carbonfibre-src/README.md`.)

## Where notes live

On a first visit the app asks:

| Choice | Where the notes are | Works in |
|---|---|---|
| A folder you choose | `.md` files in that folder, readable by any editor | Edge, Chrome and other Chromium browsers on a desktop or laptop |
| This browser | The browser's storage for this site, on this device | Any modern browser, including phones |

The desktop app always uses a folder (it asks for one on first start). Its own data (settings, the task
board, plugin settings) is kept in one SQLite file, `carbonfibre.db`, in the app's data folder; notes are
never in it (see `desktop/README.md`).

Firefox, Safari and phone browsers don't offer the folder API, so there the folder choice is shown
disabled with the reason. Switch any time from the bottom-left of the window.

## Security

- **No network.** (The **Get the app** button is a plain link to GitHub's download.) A Content-Security-Policy in the page blocks every network request (`connect-src 'none'`),
  external scripts, frames and form submissions. The app has nothing to send and no way to send it.
- **Only its own code runs.** The policy allows the page's two script blocks by their SHA-256 hash
  (`build.py` fills these in). An injected `<script>`, an `onerror=` handler or a `javascript:` link is
  refused by the browser even if a bug let one into the page. `cf-tests/csp_test.py` checks both halves.
- **Text stays text.** Everything a note, folder, sheet or task board can contain is escaped for both element
  text and attributes, so a title like `Plan" onmouseover=...` can't add markup. A task board read from a
  vault (`.carbonfibre/taskboard.json`, which anyone sharing the folder can edit) is cleaned field by field.
  `cf-tests/security_test.py` plants hostile text everywhere and checks nothing becomes markup.
- **Links open web pages and email only.** `http:`, `https:` and `mailto:` become links; `javascript:`,
  `data:`, `file:`, `smb:` and app handlers (such as `ms-msdt:`) are shown as text, so clicking a link in a
  shared note can't start a program. Links don't send the page's address (`no-referrer`).
- **It won't run framed.** Shown inside another site's frame, the app hides itself, so it can't be used for
  clickjacking (GitHub Pages can't send a `frame-ancestors` header).
- **Folder access is per folder.** The browser asks before CarbonFibre can read or write a folder, and only
  that folder. Depending on the browser and your answer, it may ask again after a restart.
- **One origin per GitHub account.** Every Pages site under `https://YOU.github.io/` shares one browser
  origin, so any other Pages site on the same account can read this one's browser storage and saved folder
  handle. Keep notes in a folder rather than browser storage, don't publish untrusted Pages sites on the
  same account, or give CarbonFibre its own custom domain.
- **Plugins run only in the desktop app.** The website never runs plugin code; its Plugins window is greyed
  out. In the desktop app a plugin you switch on can read and change your notes (as in Obsidian). The page
  keeps `connect-src 'none'`; a plugin reaches the internet, or Node.js (as Obsidian gives every plugin), only if you allowed it in the app's dialog. The desktop app widens the script
  lock there only for installed plugin code and for code plugins build from strings; injected `<script>`
  tags and `onerror=` handlers stay blocked. While any plugin is on, links opened from the page ask before
  your browser opens them. The desktop app itself talks to GitHub only: the plugin catalog, the plugins
  you check or install, and its own updates (checked against each release's SHA-256). See `SECURITY.md`.

## Typing aids

| You type | What happens |
|---|---|
| 3+ letters of a word | Words from your notes are suggested: start of the word first, then the start of a part (`vault` finds `ObsidianVault`), then the letters in order (`splk` finds `Splunk`). Words you pick and use often rank higher. The best one shows faintly after the cursor. |
| `[[` | Note titles are suggested (recent notes when nothing is typed yet) |
| `/` at the start of a word | Snippets: `/date`, `/time`, `/now`, `/today` (link to today's note), `/tomorrow`, `/yesterday`; at a line start also `/todo`, `/done`, `/h1`, `/h2`, `/quote`, `/code`, `/divider` |
| **Tab** | Takes the highlighted suggestion |
| **Enter** | A new line, as always. It takes a suggestion only for `[[links]]`, or after you moved to one with the arrow keys |
| **Esc**, or moving the cursor | Closes the suggestions |

Turn suggestions off with `COMPLETE_ON` in `carbonfibre-src/src/js/07-editing-aids.js`.

## Good to know

- **The address is public.** On Free, Pro and Team plans a Pages site can be opened by anyone who has the
  link; only GitHub Enterprise Cloud can restrict it. Search engines are asked not to list it (a noindex tag
  and `robots.txt`), but that's a request, not a lock.
- **Your notes never leave your computer.** The site only serves the app: your vault, sketch folder and
  browser storage are on your machine, exactly as with the local file.
- **Browser storage belongs to the address.** Notes kept in browser storage on the hosted app are separate
  from those in the local file. A vault folder works the same from both.
