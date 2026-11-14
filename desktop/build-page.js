/* Builds the app from ../carbonfibre-src into page/index.html (what the desktop app loads). */
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const out = path.join(__dirname, "page", "index.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
const build = path.join(__dirname, "..", "carbonfibre-src", "build.py");
for (const py of process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"]) {
  const r = spawnSync(py, [build, out], { stdio: "inherit" });
  if (r.error && r.error.code === "ENOENT") continue;
  process.exit(r.status === null ? 1 : r.status);
}
console.error("Python 3 is needed to build the page (carbonfibre-src/build.py).");
process.exit(1);
