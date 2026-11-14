/* Updates (updater.js), without GitHub: net.fetch answers with a made-up release, and the
   "installed app" is a small AppImage stand-in in a temporary folder, so the whole Linux path runs:
   check, download, size and SHA-256 check, swap the file, start the new one, quit.
   Run with Electron on Linux: electron test/update_test.js (npm test runs it too). */
"use strict";
const { app, net } = require("electron");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(() => main().catch((e) => { console.log("FAIL  test crashed\n      " + e.stack); app.exit(1); }));
async function main() {
  if (process.platform !== "linux") { console.log("update test: Linux only, skipped"); app.exit(0); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-upd-"));
  const marker = path.join(dir, "started");
  const target = path.join(dir, "CarbonFibre.AppImage");
  fs.writeFileSync(target, "#!/bin/sh\necho old > " + JSON.stringify(marker) + "\n", { mode: 0o755 });
  const fresh = Buffer.from("#!/bin/sh\necho new > " + JSON.stringify(marker) + "\n");
  const name = "CarbonFibre-linux-" + (process.arch === "arm64" ? "arm64" : "x86_64") + ".AppImage";
  let digest = "sha256:" + crypto.createHash("sha256").update(fresh).digest("hex");
  let latest = "99.9.9";
  const asked = [];
  net.fetch = async (url) => {
    asked.push(url);
    if (/api\.github\.com/.test(url)) {
      return new Response(JSON.stringify({ tag_name: "v" + latest, html_url: "https://github.com/x/y/releases/tag/v" + latest,
        assets: [{ name, size: fresh.length, digest, browser_download_url: "https://github.com/x/y/releases/download/v" + latest + "/" + name }] }));
    }
    return new Response(fresh);
  };
  process.env.APPIMAGE = target;
  let quit = 0;
  app.quit = () => { quit++; };
  const { Updater, newer, assetName } = require("../updater");

  check("version order", newer("1.0.12", "1.0.9") && !newer("1.0.9", "1.0.9") && newer("v2.0.0", "1.9.99") && !newer("1.0.0", "1.0.1"));
  check("this computer's file name", assetName() === name, assetName());

  const states = [];
  const u = new Updater((s) => states.push(s));
  check("off when running from source", !u.enabled());

  latest = app.getVersion();
  let st = await u.check();
  check("same version: up to date", st.status === "none", JSON.stringify(st));

  latest = "99.9.9";
  digest = "sha256:" + "0".repeat(64);
  st = await u.check();
  check("newer version: available, installable", st.status === "available" && st.latest === "99.9.9" && st.canInstall, JSON.stringify(st));
  let err = "";
  try { await u.install(); } catch (e) { err = e.message; }
  check("a download that doesn't match the release's SHA-256 is refused", /SHA-256/.test(err) && fs.readFileSync(target, "utf8").includes("old") && quit === 0, err);

  digest = "sha256:" + crypto.createHash("sha256").update(fresh).digest("hex");
  st = await u.check();
  await u.install();
  await wait(1200);
  check("progress is reported", states.some((s) => s.status === "downloading" && s.progress === 100));
  check("the AppImage is replaced with the new one", fs.readFileSync(target).equals(fresh));
  check("the new one is started", fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim() === "new");
  check("and this one quits", quit === 1);
  check("only GitHub was asked", asked.every((x) => /^https:\/\/(api\.)?github\.com\//.test(x)), JSON.stringify(asked));

  let bad = 0;
  for (const r of results) { if (!r.ok) bad++; console.log((r.ok ? "PASS  " : "FAIL  ") + r.name + (r.ok || !r.detail ? "" : "\n      " + r.detail)); }
  console.log("\n" + (results.length - bad) + " of " + results.length + " passed");
  fs.rmSync(dir, { recursive: true, force: true });
  app.exit(bad ? 1 : 0);
}
