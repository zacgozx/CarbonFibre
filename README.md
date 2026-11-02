# CarbonFibre

A local notes app in one file. This repo holds the app, its source and its tests; GitHub Pages
publishes the app only.

| Folder | What it is | Published? |
|---|---|---|
| `public/` | The app (`index.html`) and `robots.txt` | Yes |
| `carbonfibre-src/` | The source, split by area; `build.py` joins it into the app | No |
| `cf-tests/` | The test suite and code checker | No |
| `.github/workflows/pages.yml` | Rebuilds the app from the source and publishes `public/` on every push | — |

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

Firefox, Safari and phone browsers don't offer the folder API, so there the folder choice is shown
disabled with the reason. Switch any time from the bottom-left of the window.

## Security

- **No network.** A Content-Security-Policy in the page blocks every network request (`connect-src 'none'`),
  external scripts, frames and form submissions. The app has nothing to send and no way to send it.
- **Only its own code runs.** The policy allows the page's two script blocks by their SHA-256 hash
  (`build.py` fills these in). An injected `<script>`, an `onerror=` handler or a `javascript:` link is
  refused by the browser even if a bug let one into the page. `cf-tests/csp_test.py` checks both halves.
- **Folder access is per folder.** The browser asks before CarbonFibre can read or write a folder, and only
  that folder. Depending on the browser and your answer, it may ask again after a restart.
- **One origin per GitHub account.** Every Pages site under `https://YOU.github.io/` shares one browser
  origin, so any other Pages site on the same account can read this one's browser storage and saved folder
  handle. Keep notes in a folder rather than browser storage, don't publish untrusted Pages sites on the
  same account, or give CarbonFibre its own custom domain.

## Good to know

- **The address is public.** On Free, Pro and Team plans a Pages site can be opened by anyone who has the
  link; only GitHub Enterprise Cloud can restrict it. Search engines are asked not to list it (a noindex tag
  and `robots.txt`), but that's a request, not a lock.
- **Your notes never leave your computer.** The site only serves the app: your vault, sketch folder and
  browser storage are on your machine, exactly as with the local file.
- **Browser storage belongs to the address.** Notes kept in browser storage on the hosted app are separate
  from those in the local file. A vault folder works the same from both.
