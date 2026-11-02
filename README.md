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
4. **Watch it publish:** the **Actions** tab shows "Publish CarbonFibre". When it's green, the app is at
   `https://YOU.github.io/carbonfibre/`.

## Updating

Edit files in `carbonfibre-src/src/`, then commit and push. The workflow rebuilds `index.html` from the
source and republishes it within a minute or two. (Before pushing, you can check locally:
`python carbonfibre-src/build.py public/index.html`, then the tests: see `carbonfibre-src/README.md`.)

## Good to know

- **The address is public.** On Free, Pro and Team plans a Pages site can be opened by anyone who has the
  link; only GitHub Enterprise Cloud can restrict it. Search engines are asked not to list it (a noindex tag
  and `robots.txt`), but that's a request, not a lock.
- **Your notes never leave your computer.** The site only serves the app: your vault, sketch folder and
  browser storage are on your machine, exactly as with the local file.
- **Browser storage belongs to the address.** Notes kept in browser storage on the hosted app are separate
  from those in the local file. A vault folder works the same from both.
