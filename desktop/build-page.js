/* Builds the app from ../carbonfibre-src into page/index.html (what the desktop app loads), and copies
   the libraries plugins expect from Obsidian into page/vendor/ (only the desktop app serves them). */
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const out = path.join(__dirname, "page", "index.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
/* moment.js, the real one: Obsidian gives plugins moment with its locales and every method */
const vendor = path.join(__dirname, "page", "vendor");
fs.mkdirSync(vendor, { recursive: true });
const momentFile = path.join(__dirname, "node_modules", "moment", "min", "moment.min.js");
if (!fs.existsSync(momentFile)) { console.error("moment is missing: run npm install in desktop/"); process.exit(1); }
const momentVersion = JSON.parse(fs.readFileSync(path.join(__dirname, "node_modules", "moment", "package.json"), "utf8")).version;
fs.writeFileSync(path.join(vendor, "moment.js"), "/*! moment.js " + momentVersion + " | MIT License | https://momentjs.com */\n" + fs.readFileSync(momentFile, "utf8"));

/* CodeMirror 6, Obsidian's editor library: plugins require("@codemirror/view") and friends and build
   editor extensions from them at start. One shared copy, as in Obsidian (the page's editor doesn't
   use it yet, so the extensions are built but not attached). */
const CM = ["@codemirror/state", "@codemirror/view", "@codemirror/language", "@codemirror/commands", "@codemirror/search",
  "@codemirror/autocomplete", "@codemirror/lint", "@lezer/common", "@lezer/highlight", "@lezer/lr"];
try {
  require("esbuild").buildSync({
    stdin: { contents: CM.map((m, i) => "import * as m" + i + " from " + JSON.stringify(m) + ";").join("\n") +
      "\nwindow.__cfCodeMirror = {" + CM.map((m, i) => JSON.stringify(m) + ": m" + i).join(", ") + "};\n", resolveDir: __dirname, loader: "js" },
    bundle: true, minify: true, format: "iife", target: "chrome120", legalComments: "eof", outfile: path.join(vendor, "codemirror.js"), logLevel: "error"
  });
} catch (e) { console.error("CodeMirror couldn't be bundled (npm install in desktop/): " + e.message); process.exit(1); }

const build = path.join(__dirname, "..", "carbonfibre-src", "build.py");
for (const py of process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"]) {
  const r = spawnSync(py, [build, out], { stdio: "inherit" });
  if (r.error && r.error.code === "ENOENT") continue;
  process.exit(r.status === null ? 1 : r.status);
}
console.error("Python 3 is needed to build the page (carbonfibre-src/build.py).");
process.exit(1);
