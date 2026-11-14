# Installing CarbonFibre desktop

Two ways to get it:

- **Download a build.** On the website, **Get the app** (bottom right) picks the file for your computer. Or
  on GitHub, **Releases**: each push to `main` publishes one. Nothing to install first. Skip to
  [Opening it the first time](#opening-it-the-first-time).
- **Build it yourself** from this repo, below. You need **Node.js** (LTS, 20 or newer), **Python 3** and
  **Git**. Each system builds its own app: build the Windows app on Windows, the Mac app on a Mac.

The `npm` commands are the same on every system. What differs is installing the tools, and on Windows,
which terminal you type them into.

## Windows

### 1. Install the tools (once)

Open **PowerShell** (Start > type "PowerShell") and run each line:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
winget install Git.Git
```

No winget? Download the installers from nodejs.org, python.org and git-scm.com instead. In the Python
installer, tick **Add python.exe to PATH**.

**Close PowerShell and open a new one**, so it finds the new tools. Check:

```powershell
node -v
npm -v
py --version
```

### 2. Build and run

Go to the repo's `desktop` folder (your path may differ):

```powershell
cd E:\GitHub\CarbonFibre\desktop
npm install
npm start
```

Type these **one line at a time**. Windows PowerShell 5.1 (the one built into Windows) doesn't understand
`cd desktop && npm install`; PowerShell 7 and Command Prompt do.

### 3. Make the installer

```powershell
npm run dist:win
```

Output in `desktop\dist\`: the installers `CarbonFibre-win-x64-setup.exe` and `CarbonFibre-win-arm64-setup.exe`.

## macOS

### 1. Install the tools (once)

With [Homebrew](https://brew.sh), in **Terminal**:

```bash
brew install node python git
```

Without Homebrew: the installers from nodejs.org and python.org (Git comes with Xcode's command line
tools: run `xcode-select --install`).

### 2. Build and run

```bash
cd ~/path/to/CarbonFibre/desktop
npm install
npm start
```

### 3. Make the app

```bash
npm run dist:mac
```

Output in `desktop/dist/`: a `.dmg` and a `.zip` for Apple silicon (`arm64`) and one for Intel (`x64`).
Built on your own Mac it opens normally.

## Linux (Ubuntu, Debian, Mint)

### 1. Install the tools (once)

The `nodejs` in Ubuntu's own list is often too old, so get the LTS from NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs python3 git
```

Fedora: `sudo dnf install nodejs python3 git`. Arch: `sudo pacman -S nodejs npm python git`.

### 2. Build and run

```bash
cd ~/path/to/CarbonFibre/desktop
npm install
npm start
```

### 3. Make the app

```bash
npm run dist:linux
```

Output in `desktop/dist/`: `CarbonFibre-linux-x86_64.AppImage` and `CarbonFibre-linux-arm64.AppImage` (run anywhere, and update themselves).

## Updates

Every push to `main` that changes the app builds a new release on GitHub (`v1.0.<build number>`, about 10 minutes after the
push). An installed app checks for one a little after it starts and every few hours; when there is one,
**Update available** shows in the status bar. Click it, say yes, and it downloads the new version,
checks it against the release's SHA-256, replaces itself and restarts. **Check for Updates...** is in the
CarbonFibre menu on a Mac, and in **Help** on Windows and Linux.

- **Mac:** keep the app in **Applications** (it can't replace itself while it runs from the disk image or
  Downloads). The new version swaps in place, so the "Open Anyway" step doesn't come back.
- **Windows:** the installer runs silently over the installed copy.
- **Linux:** the AppImage file is replaced where it is. A copy built yourself with `npm run dist:linux`
  updates the same way.
- A copy run from source (`npm start`) never checks.

## Opening it the first time

None of the builds are signed (that needs paid certificates), so each system warns once:

| System | What you see | What to do |
|---|---|---|
| Windows | "Windows protected your PC" | **More info** > **Run anyway** |
| macOS 15 or newer | "Apple could not verify CarbonFibre" | System Settings > Privacy & Security > **Open Anyway**, or in Terminal: `xattr -cr /Applications/CarbonFibre.app` |
| macOS 14 or older | "unidentified developer" | Right-click the app > **Open** > **Open** |
| Linux AppImage | It doesn't start | `chmod +x CarbonFibre-*.AppImage`. On Ubuntu 22.04 or newer also `sudo apt install libfuse2` |

A managed work computer may block unsigned apps outright. Ask IT rather than working around it.

## When `npm install` fails

Match the first red line:

| Error says | Why | Fix |
|---|---|---|
| `npm.ps1 cannot be loaded because running scripts is disabled on this system` | PowerShell blocks npm's script by default | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use **Command Prompt** instead |
| `The token '&&' is not a valid statement separator` | Windows PowerShell 5.1 | Type the commands one line at a time |
| `'npm' is not recognized` / `command not found: npm` | Node isn't installed, or the terminal was open before it was | Install Node, then open a **new** terminal |
| `ENOENT: no such file or directory, open '...\package.json'` | You're in the repo's top folder | `cd desktop` first |
| `npm install` works but `npm start` says **Python 3 is needed** | No Python, or (Windows) only the Microsoft Store shortcut | Install Python from python.org with **Add to PATH** ticked, then a new terminal |
| `Python was not found; run without arguments to install from the Microsoft Store` | The Store shortcut, not Python | As above, or Settings > Apps > Advanced app settings > App execution aliases > turn off python.exe and python3.exe |
| Stuck or failing at `electron` / `node install.js`, or `ETIMEDOUT`, `ECONNRESET`, `self-signed certificate` | Electron downloads itself from GitHub, and a work network or VPN blocks it | Try another network, or turn off the VPN for the install |
| `Cannot create symbolic link : A required privilege is not held by the client` (during `npm run dist:win`) | electron-builder unpacks a tool with links in it, which Windows only allows in Developer Mode | Settings > System > For developers > **Developer Mode** on, or run the terminal as administrator once, then `npm run dist:win` again |
| `EPERM` / `EBUSY` while installing | Antivirus or an open window holding a file | Close CarbonFibre and editors on the folder, delete `desktop\node_modules`, run `npm install` again |

Still stuck: copy everything `npm install` printed and send it.
