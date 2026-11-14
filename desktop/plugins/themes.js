/* Obsidian community themes for the desktop app: the catalog, downloads, installed themes and the
   one in use. A theme is only CSS (theme.css and its manifest.json); no code runs. Lives in the app's
   data folder:
     themes/<name>/theme.css, manifest.json
     themes/active.json        { "name": "<name>" } or {} for CarbonFibre's own look
     plugin-cache/themes.json  the catalog
   The page shows it through an Obsidian-shaped layer (carbonfibre-src/src/js/plugins/06-themes.js):
   Obsidian's variables mapped onto CarbonFibre's, and Obsidian's class names on CarbonFibre's parts. */
"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { app } = require("electron");
const store = require("./store");

const CATALOG_URL = "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-css-themes.json";
const MAX_CSS = 8 * 1024 * 1024, CATALOG_AGE = 12 * 3600 * 1000;
const NAME_RE = /^[\w .()&'+-]{1,80}$/;

const root = () => path.join(app.getPath("userData"), "themes");
function checkName(name) {
  if (typeof name !== "string" || !NAME_RE.test(name) || name.includes("..") || /^[ .]|[ .]$/.test(name)) throw new Error("Not a valid theme name: " + name);
}
const dirOf = (name) => { checkName(name); return path.join(root(), name); };
async function readText(f) { try { return await fs.readFile(f, "utf8"); } catch (e) { return null; } }
async function readJson(f) { const t = await readText(f); if (t == null) return null; try { return JSON.parse(t); } catch (e) { return null; } }
async function writeText(f, text) { await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, text, "utf8"); }

let catalogMem = null;
async function catalog(refresh) {
  const f = path.join(app.getPath("userData"), "plugin-cache", "themes.json");
  if (!refresh) {
    if (catalogMem && Date.now() - catalogMem.at < CATALOG_AGE) return catalogMem.list;
    const c = await readJson(f);
    if (c && Array.isArray(c.list) && Date.now() - c.at < CATALOG_AGE) { catalogMem = c; return c.list; }
  }
  try {
    const list = JSON.parse((await store.get(CATALOG_URL, 4 * 1024 * 1024)) || "[]");
    const out = list.filter((t) => t && NAME_RE.test(String(t.name)) && /^[\w.-]+\/[\w.-]+$/.test(String(t.repo))).map((t) => ({
      name: String(t.name), author: String(t.author || ""), repo: String(t.repo),
      modes: Array.isArray(t.modes) ? t.modes.map(String).filter((m) => m === "dark" || m === "light") : ["dark", "light"]
    }));
    catalogMem = { at: Date.now(), list: out };
    await writeText(f, JSON.stringify(catalogMem));
    return out;
  } catch (e) {
    const c = await readJson(f);
    if (c && Array.isArray(c.list)) { catalogMem = c; return c.list; }
    throw e;
  }
}

async function list() {
  let names = [];
  try { names = await fs.readdir(root(), { withFileTypes: true }); } catch (e) { return []; }
  const active = await activeName(), out = [];
  for (const d of names) {
    if (!d.isDirectory() || !NAME_RE.test(d.name)) continue;
    const css = path.join(root(), d.name, "theme.css");
    let size = 0;
    try { size = (await fs.stat(css)).size; } catch (e) { continue; }
    const manifest = (await readJson(path.join(root(), d.name, "manifest.json"))) || { name: d.name };
    out.push({ name: d.name, manifest: { name: String(manifest.name || d.name), version: String(manifest.version || ""), author: String(manifest.author || "") }, size, active: d.name === active });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/* a catalog theme: theme.css from its latest release, or from the repository (older themes: obsidian.css) */
async function install(name) {
  checkName(name);
  const entry = (await catalog(false)).find((t) => t.name === name);
  if (!entry) throw new Error("No theme called " + name + " in the catalog");
  const r = entry.repo;
  let css = null;
  for (const u of ["https://github.com/" + r + "/releases/latest/download/theme.css", "https://raw.githubusercontent.com/" + r + "/HEAD/theme.css", "https://raw.githubusercontent.com/" + r + "/HEAD/obsidian.css"]) {
    try { css = await store.get(u, MAX_CSS); } catch (e) { css = null; }
    if (css) break;
  }
  if (!css) throw new Error("Couldn't download " + name + "'s theme.css from GitHub");
  let manifest = null;
  try { manifest = await store.get("https://raw.githubusercontent.com/" + r + "/HEAD/manifest.json", 64 * 1024); } catch (e) { manifest = null; }
  return place(name, css, manifest || JSON.stringify({ name, author: entry.author }));
}
/* a theme's files handed over by the page (a vault's .obsidian/themes/<name>/) */
async function place(name, css, manifest) {
  checkName(name);
  css = String(css || "");
  if (!css.trim()) throw new Error("The theme has no CSS");
  if (css.length > MAX_CSS) throw new Error("theme.css is too large");
  let m = {};
  try { m = JSON.parse(manifest || "{}") || {}; } catch (e) { m = {}; }
  await writeText(path.join(dirOf(name), "theme.css"), css);
  await writeText(path.join(dirOf(name), "manifest.json"), JSON.stringify({ name, version: String(m.version || ""), author: String(m.author || ""), minAppVersion: String(m.minAppVersion || "") }));
  return { name };
}
async function uninstall(name) {
  await fs.rm(dirOf(name), { recursive: true, force: true });
  if ((await activeName()) === name) await setActive(null);
}
async function activeName() { const a = await readJson(path.join(root(), "active.json")); return a && typeof a.name === "string" ? a.name : null; }
async function setActive(name) {
  if (name !== null) { checkName(name); if ((await readText(path.join(dirOf(name), "theme.css"))) == null) throw new Error("Not installed: " + name); }
  await writeText(path.join(root(), "active.json"), JSON.stringify(name === null ? {} : { name }));
  return name;
}
/* the active theme's CSS (or a named one), for the page to apply */
async function css(name) {
  const n = name == null ? await activeName() : String(name);
  if (!n) return null;
  checkName(n);
  const t = await readText(path.join(dirOf(n), "theme.css"));
  return t == null ? null : { name: n, css: t };
}

module.exports = { catalog, list, install, place, uninstall, setActive, activeName, css, checkName };
