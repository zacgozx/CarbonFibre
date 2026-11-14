# Installing CarbonFibre desktop

Two ways to get it:

- **Download a build.** On GitHub: **Releases** (each `v*` tag builds all three), or **Actions** > **Desktop** >
  **Run workflow**, then the run's **Artifacts**. Nothing to install first. Skip to [Opening it the first time](#opening-it-the-first-time).
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

Output in `desktop\dist\`: an installer (`CarbonFibre Setup 1.0.0.exe`) and a portable
`CarbonFibre 1.0.0.exe` that runs without installing.

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

Output in `desktop/dist/`: an `.AppImage` (runs anywhere) and a `.deb` (Ubuntu, Debian).

## Updating on a Mac

Installed apps don't change when the repo does. On a Mac that has the repo cloned (and Git, Node and
Python from step 1), CarbonFibre updates itself from Git:

- **In the app:** CarbonFibre menu > **Update from Git...** The first time it asks where the repo is.
- **Or in Finder:** double-click `desktop/Update CarbonFibre.command`.

Terminal opens and runs `desktop/scripts/update-mac.sh`. It does a `git pull`, builds the app for this
Mac (the same build as `npm run dist:mac`, for this Mac only, which is quicker), closes CarbonFibre,
puts the new version where the old one was, and opens it again. Built on your Mac, it opens without
the "Open Anyway" step. If anything fails, the version you have stays.

If `git pull` stops because you changed files in the repo on that Mac, commit them or `git stash` first.

## Opening it the first time

None of the builds are signed (that needs paid certificates), so each system warns once:

| System | What you see | What to do |
|---|---|---|
| Windows | "Windows protected your PC" | **More info** > **Run anyway** |
| macOS 15 or newer | "Apple could not verify CarbonFibre" | System Settings > Privacy & Security > **Open Anyway**, or in Terminal: `xattr -cr /Applications/CarbonFibre.app` |
| macOS 14 or older | "unidentified developer" | Right-click the app > **Open** > **Open** |
| Linux AppImage | It doesn't start | `chmod +x CarbonFibre-*.AppImage`. On Ubuntu 22.04 or newer also `sudo apt install libfuse2` |
| Linux .deb | | `sudo apt install ./carbonfibre-desktop_*.deb` |

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
