# Security

## What protects your notes

| Part | Protection |
|---|---|
| Website | No server and no network: a Content-Security-Policy blocks every request (`connect-src 'none'`), external scripts, frames and form posts. Only the page's own two scripts run, allowed by their SHA-256. |
| Notes, folders, sheets, task boards | Escaped wherever they are shown, in text and in attributes. A vault's `.carbonfibre/taskboard.json` is cleaned field by field when it is read. |
| Links | Only `http:`, `https:` and `mailto:` open. Other schemes are shown as text. |
| Framing | The app hides itself inside another site's frame (no clickjacking). |
| Desktop app | The page has no Node access (`contextIsolation`, `sandbox`); only the main window's own page may call the main process. Plugins get the internet only after you allow it in the app's own dialog, and never link-local or reserved addresses. Updates are checked against each release's SHA-256. Electron fuses switch off run-as-Node, `NODE_OPTIONS` and `--inspect`. |
| Builds | GitHub Actions are pinned to exact commits, jobs get the least permissions they need, and only the release job can publish. |

## Limits worth knowing

- **Plugins are trusted code.** They run in the same page as your notes, as in Obsidian. The internet
  permission keeps well-behaved plugins to what you allowed; it is not a wall between plugins. Install
  plugins you trust.
- **Builds aren't signed** (no Apple or Microsoft certificate). Downloads are checked against the SHA-256
  GitHub lists for the release, so they are only as trustworthy as the GitHub account that publishes them:
  use two-factor authentication on it.
- **Browser storage on `github.io`** is shared by every Pages site on the same account. Keep notes in a
  folder, or give the site its own domain.
- **Notes are plain files.** They aren't encrypted at rest; protect them as you would any document (disk
  encryption, the folder's permissions).

## Checks

Website: `cf-tests/security_test.py` and `cf-tests/csp_test.py`, part of `python cf-tests/run_all.py`.
Desktop: `desktop/test/run.js` and `desktop/test/update_test.js` (`npm test`), which GitHub runs before every
release.

## Reporting a problem

Open a private security advisory on the repository (Security, Report a vulnerability) rather than a public
issue.
