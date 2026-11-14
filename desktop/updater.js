/* Updates from GitHub Releases. Every push to main builds and publishes a release (see
   .github/workflows/desktop.yml), named v1.0.<build>, with one file per system and processor:
     CarbonFibre-mac-arm64.zip / -x64.zip            (the .app, for updating; the .dmg is for first installs)
     CarbonFibre-win-x64-setup.exe / -arm64-setup.exe
     CarbonFibre-linux-x86_64.AppImage / -arm64.AppImage
   The app checks the latest release a little after it starts and every few hours. A newer one is shown in
   the page's status bar; Update asks first (the system's dialog, so the page and plugins can't start an
   update on their own), downloads the file, checks its size and SHA-256 against what GitHub lists (and
   refuses a release that lists none), then:
     macOS    unzips the new .app beside the old one, quits, and a small script swaps them and reopens it
     Windows  runs the installer silently over the installed copy, which reopens the app when it's done
     Linux    replaces the AppImage file and starts the new one
   The builds aren't signed (no Apple or Microsoft certificate); the download is checked against the
   release's own SHA-256, over HTTPS from GitHub only. */
"use strict";
const { app, net } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const REPO = "zacgozx/CarbonFibre";
const LATEST = "https://api.github.com/repos/" + REPO + "/releases/latest";
const RELEASES = "https://github.com/" + REPO + "/releases/latest";
const HOSTS = new Set(["api.github.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);
const FIRST_CHECK = 15 * 1000, CHECK_EVERY = 6 * 3600 * 1000, MAX_FILE = 500 * 1024 * 1024;

/* the release file this copy of the app updates from, or null when it can't update itself */
function assetName() {
  const arm = process.arch === "arm64";
  if (process.platform === "darwin") return "CarbonFibre-mac-" + (arm ? "arm64" : "x64") + ".zip";
  if (process.platform === "win32") return "CarbonFibre-win-" + (arm ? "arm64" : "x64") + "-setup.exe";
  if (process.platform === "linux" && process.env.APPIMAGE) return "CarbonFibre-linux-" + (arm ? "arm64" : "x86_64") + ".AppImage";
  return null;
}
/* 1.0.12 > 1.0.9 */
function newer(a, b) {
  const x = String(a).replace(/^v/, "").split(".").map(Number), y = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) > (y[i] || 0)) return true;
    if ((x[i] || 0) < (y[i] || 0)) return false;
  }
  return false;
}
async function get(url, opts) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !HOSTS.has(u.hostname)) throw new Error("Blocked address: " + u.hostname);
  const res = await net.fetch(url, Object.assign({ redirect: "follow", cache: "no-store", credentials: "omit" }, opts || {}));
  if (!HOSTS.has(new URL(res.url || url).hostname)) throw new Error("Blocked redirect");
  return res;
}
/* the installed .app this is running from (Contents/MacOS/CarbonFibre -> CarbonFibre.app) */
function macBundle() { return path.resolve(path.dirname(app.getPath("exe")), "..", ".."); }
async function writable(dir) { try { await fsp.access(dir, fs.constants.W_OK); return true; } catch (e) { return false; } }
const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

class Updater {
  /* send(state): to the page, whenever the state changes */
  constructor(send) {
    this.send = send;
    this.state = { status: "idle", current: app.getVersion() };
    this.asset = null;
    this.timer = null;
  }
  set(patch) { this.state = Object.assign({}, this.state, patch); this.send(this.state); }
  /* updating only makes sense for an installed build; `npm start` and the tests never check */
  enabled() { return app.isPackaged && !process.env.CARBONFIBRE_NO_UPDATES; }
  start() {
    if (!this.enabled()) return;
    setTimeout(() => this.check().catch(() => {}), FIRST_CHECK);
    this.timer = setInterval(() => this.check().catch(() => {}), CHECK_EVERY);
  }

  async check() {
    if (["downloading", "installing"].includes(this.state.status)) return this.state;
    this.set({ status: "checking", error: "" });
    try {
      const res = await get(LATEST, { headers: { accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error("GitHub answered " + res.status);
      const rel = await res.json();
      const version = String(rel.tag_name || "").replace(/^v/, "");
      if (!version || !newer(version, app.getVersion())) { this.set({ status: "none", latest: version }); return this.state; }
      const name = assetName();
      const a = name && (rel.assets || []).find((x) => x.name === name);
      this.asset = a ? { url: a.browser_download_url, size: a.size, sha256: /^sha256:[0-9a-f]{64}$/.test(a.digest || "") ? a.digest.slice(7) : null } : null;
      /* a Linux .deb, a Windows build without an installer, or a release still missing this file: the page links to the release instead */
      this.set({ status: "available", latest: version, canInstall: !!this.asset, page: rel.html_url || RELEASES });
    } catch (e) {
      this.set({ status: "error", error: "Couldn't check for updates: " + ((e && e.message) || e) });
    }
    return this.state;
  }

  /* download to a temporary file, with progress, and check it against the release */
  async download() {
    const a = this.asset;
    if (!a || !(a.size > 0) || a.size > MAX_FILE) throw new Error("This release has no file for this computer");
    if (!a.sha256) throw new Error("This release doesn't list a SHA-256 for its file, so the download can't be checked");
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "carbonfibre-update-"));
    const file = path.join(dir, path.basename(new URL(a.url).pathname));
    const res = await get(a.url);
    if (!res.ok || !res.body) throw new Error("GitHub answered " + res.status);
    const out = fs.createWriteStream(file);
    const hash = crypto.createHash("sha256");
    let got = 0, shown = 0;
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        if (got > a.size) throw new Error("The download is bigger than the release says");
        hash.update(value);
        if (!out.write(Buffer.from(value))) await new Promise((r) => out.once("drain", r));
        const pct = Math.floor((got / a.size) * 100);
        if (pct !== shown) { shown = pct; this.set({ progress: pct }); }
      }
    } finally { await new Promise((r) => out.end(r)); }
    if (got !== a.size) throw new Error("The download was cut short");
    if (hash.digest("hex") !== a.sha256) throw new Error("The download doesn't match the release (SHA-256)");
    return file;
  }

  /* where the new version goes, and whether this copy can be replaced there */
  async target() {
    if (process.platform === "darwin") {
      const b = macBundle();
      if (/AppTranslocation/.test(b)) return { ok: false, why: "Move CarbonFibre to your Applications folder first (it's running from a temporary copy macOS made)." };
      if (!(await writable(path.dirname(b)))) return { ok: false, why: "CarbonFibre can't replace itself in " + path.dirname(b) + "." };
      return { ok: true, where: b };
    }
    if (process.platform === "linux") {
      const f = process.env.APPIMAGE;
      if (!f || !(await writable(path.dirname(f)))) return { ok: false, why: "CarbonFibre can't replace its AppImage file here." };
      return { ok: true, where: f };
    }
    return { ok: true, where: null };
  }

  /* after the person said yes (main.js asks): download, check, swap, restart */
  async install() {
    if (this.state.status !== "available" || !this.state.canInstall) throw new Error("No update to install");
    const t = await this.target();
    if (!t.ok) throw new Error(t.why);
    this.set({ status: "downloading", progress: 0, error: "" });
    let file;
    try { file = await this.download(); } catch (e) { this.set({ status: "available", progress: 0, error: "Update failed: " + e.message }); throw e; }
    this.set({ status: "installing" });
    try {
      if (process.platform === "darwin") await this.swapMac(file, t.where);
      else if (process.platform === "win32") this.runInstaller(file);
      else await this.swapAppImage(file, t.where);
    } catch (e) { this.set({ status: "available", error: "Update failed: " + e.message }); throw e; }
    setTimeout(() => app.quit(), 300);       /* the page's own save-on-close runs first */
  }

  /* macOS: unzip beside the download; once this app has quit, a script moves the old .app aside,
     puts the new one in its place and reopens it (the old one is removed only when that worked) */
  async swapMac(zip, bundle) {
    const dir = path.dirname(zip), unpacked = path.join(dir, "new");
    await run("/usr/bin/ditto", ["-x", "-k", zip, unpacked]);
    const name = (await fsp.readdir(unpacked)).find((n) => n.endsWith(".app"));
    if (!name) throw new Error("The download has no app in it");
    const fresh = path.join(unpacked, name), old = bundle + ".old-" + Date.now();
    const script = path.join(dir, "swap.sh");
    await fsp.writeFile(script, [
      "#!/bin/bash",
      "while kill -0 " + process.pid + " 2>/dev/null; do sleep 0.3; done",
      "mv " + q(bundle) + " " + q(old) + " || exit 1",
      "if mv " + q(fresh) + " " + q(bundle) + "; then rm -rf " + q(old) + "; else mv " + q(old) + " " + q(bundle) + "; fi",
      "xattr -dr com.apple.quarantine " + q(bundle) + " 2>/dev/null",
      "open " + q(bundle),
      "rm -rf " + q(dir)
    ].join("\n") + "\n", { mode: 0o755 });
    spawn("/bin/bash", [script], { detached: true, stdio: "ignore" }).unref();
  }
  /* Windows: the installer, silent, over the same install; --force-run opens the app when it's done */
  runInstaller(exe) {
    spawn(exe, ["/S", "--updated", "--force-run"], { detached: true, stdio: "ignore" }).unref();
  }
  /* Linux: the new AppImage replaces the old file, then starts (outside this AppImage's environment) */
  async swapAppImage(file, target) {
    const tmp = target + ".new";
    await fsp.copyFile(file, tmp);
    await fsp.chmod(tmp, 0o755);
    await fsp.rename(tmp, target);
    await fsp.rm(path.dirname(file), { recursive: true, force: true });
    const env = Object.assign({}, process.env);
    ["APPIMAGE", "APPDIR", "ARGV0", "OWD"].forEach((k) => { delete env[k]; });
    spawn(target, [], { detached: true, stdio: "ignore", env }).unref();
  }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "ignore" });
    p.on("error", reject);
    p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(path.basename(cmd) + " failed (" + c + ")"))));
  });
}

module.exports = { Updater, assetName, newer, RELEASES };
