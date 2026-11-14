/* Obsidian plugins for the desktop app: the community catalog, downloads, installed plugins and
   their saved settings. Everything lives in the app's own data folder:
     plugins/<id>/manifest.json, main.js, styles.css, data.json, compat.json
     plugins/enabled.json
     plugins/network.json      which plugins you let use the internet (id: true / false)
     plugin-cache/catalog.json, plugin-cache/<id>@<version>/...   (checked but not installed)
   Only this file touches the network: GitHub for the catalog and release files, and (request below)
   the requests of plugins you let use the internet. The page itself still can't reach the network. */
"use strict";
const fs = require("node:fs/promises");
const dns = require("node:dns").promises;
const netmod = require("node:net");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { app, net } = require("electron");
const { VERSION } = require("./compat");

const CATALOG_URL = "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json";
const STATS_URL = "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json";
const HOSTS = new Set(["github.com", "raw.githubusercontent.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "codeload.github.com"]);
const MAX_CODE = 40 * 1024 * 1024, MAX_DATA = 20 * 1024 * 1024, CATALOG_AGE = 12 * 3600 * 1000;
const MAX_RESPONSE = 50 * 1024 * 1024, MAX_BODY = 50 * 1024 * 1024, REQUEST_TIMEOUT = 60 * 1000;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/;

const root = () => path.join(app.getPath("userData"), "plugins");
const cacheRoot = () => path.join(app.getPath("userData"), "plugin-cache");
const dirOf = (id) => { checkId(id); return path.join(root(), id); };

function checkId(id) {
  if (typeof id !== "string" || !ID_RE.test(id) || id.includes("..")) throw new Error("Not a valid plugin id: " + id);
}
async function readText(f) { try { return await fs.readFile(f, "utf8"); } catch (e) { return null; } }
async function readJson(f) { const t = await readText(f); if (t == null) return null; try { return JSON.parse(t); } catch (e) { return null; } }
async function writeText(f, text) { await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, text, "utf8"); }

/* ---- the network: GitHub only, size-limited ---- */
async function get(url, limit) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !HOSTS.has(u.hostname)) throw new Error("Blocked address: " + u.hostname);
  const res = await net.fetch(url, { redirect: "follow", cache: "no-store" });
  const final = new URL(res.url || url);
  if (!HOSTS.has(final.hostname)) throw new Error("Blocked redirect to " + final.hostname);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("GitHub answered " + res.status + " for " + u.pathname);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > (limit || MAX_CODE)) throw new Error("File too large: " + u.pathname);
  return buf.toString("utf8");
}

/* ---- checking code, in a worker thread ---- */
let worker = null, jobSeq = 0;
const jobs = new Map();
function analyzeAsync(code, manifest, info) {
  if (!worker) {
    /* in a packaged app the worker runs from app.asar.unpacked (see "asarUnpack" in package.json) */
    worker = new Worker(path.join(__dirname, "analyze-worker.js").replace(/app\.asar([\\/])/, "app.asar.unpacked$1"));
    worker.on("message", (m) => { const j = jobs.get(m.id); if (j) { jobs.delete(m.id); j(m.result); } });
    worker.on("error", (e) => { jobs.forEach((j) => j({ level: "no", reasons: ["Couldn't check this plugin: " + e.message], notes: [] })); jobs.clear(); worker = null; });
    worker.unref();
  }
  const id = ++jobSeq;
  return new Promise((resolve) => { jobs.set(id, resolve); worker.postMessage({ id, code, manifest, info }); });
}

/* ---- the catalog ---- */
let catalogMem = null;
async function catalog(refresh) {
  const f = path.join(cacheRoot(), "catalog.json");
  if (!refresh) {
    if (catalogMem && Date.now() - catalogMem.at < CATALOG_AGE) return catalogMem.list;
    const c = await readJson(f);
    if (c && Array.isArray(c.list) && Date.now() - c.at < CATALOG_AGE) { catalogMem = c; return c.list; }
  }
  try {
    const [list, stats] = await Promise.all([get(CATALOG_URL, MAX_DATA), get(STATS_URL, MAX_DATA)]);
    const plugins = JSON.parse(list || "[]"), st = JSON.parse(stats || "{}");
    const out = plugins.filter((p) => p && ID_RE.test(String(p.id)) && /^[\w.-]+\/[\w.-]+$/.test(String(p.repo))).map((p) => ({
      id: String(p.id), name: String(p.name || p.id), author: String(p.author || ""), description: String(p.description || ""),
      repo: String(p.repo), downloads: (st[p.id] && st[p.id].downloads) || 0, updated: (st[p.id] && st[p.id].updated) || 0
    })).sort((a, b) => b.downloads - a.downloads);
    catalogMem = { at: Date.now(), list: out };
    await writeText(f, JSON.stringify(catalogMem));
    return out;
  } catch (e) {
    const c = await readJson(f);                      /* offline: an old catalog is better than none */
    if (c && Array.isArray(c.list)) { catalogMem = c; return c.list; }
    throw e;
  }
}
async function catalogEntry(id) {
  const list = await catalog(false);
  return list.find((p) => p.id === id) || null;
}

/* check a catalog plugin: download its manifest and code (cached by version) and read the code */
async function check(id) {
  checkId(id);
  const entry = await catalogEntry(id);
  if (!entry) throw new Error("Not in the community catalog: " + id);
  const base = "https://github.com/" + entry.repo + "/releases/latest/download/";
  const manText = await get(base + "manifest.json", MAX_DATA);
  if (!manText) return { id, level: "no", reasons: ["The plugin has no released version"], notes: [], manifest: null };
  let manifest;
  try { manifest = JSON.parse(manText); } catch (e) { return { id, level: "no", reasons: ["Its manifest.json is broken"], notes: [], manifest: null }; }
  const version = String(manifest.version || "0").replace(/[^\w.-]/g, "");
  const dir = path.join(cacheRoot(), id + "@" + version);
  const cached = await readJson(path.join(dir, "compat.json"));
  if (cached && cached.version === VERSION) return Object.assign({ id, manifest }, cached);
  const code = await get(base + "main.js", MAX_CODE);
  const result = await analyzeAsync(code || "", manifest, entry);
  await writeText(path.join(dir, "manifest.json"), manText);
  if (code) await writeText(path.join(dir, "main.js"), code);
  await writeText(path.join(dir, "compat.json"), JSON.stringify(result));
  return Object.assign({ id, manifest }, result);
}

/* ---- installed plugins ---- */
async function enabledSet() { const e = await readJson(path.join(root(), "enabled.json")); return new Set(Array.isArray(e) ? e : []); }
async function saveEnabled(set) { await writeText(path.join(root(), "enabled.json"), JSON.stringify(Array.from(set))); }

async function compatOf(id) {
  const dir = dirOf(id);
  const c = await readJson(path.join(dir, "compat.json"));
  if (c && c.version === VERSION) return c;
  const manifest = await readJson(path.join(dir, "manifest.json"));
  const code = await readText(path.join(dir, "main.js"));
  const r = await analyzeAsync(code || "", manifest || {}, {});
  await writeText(path.join(dir, "compat.json"), JSON.stringify(r));
  return r;
}

async function list() {
  let names = [];
  try { names = await fs.readdir(root(), { withFileTypes: true }); } catch (e) { return []; }
  const enabled = await enabledSet(), net = await networkMap();
  const out = [];
  for (const d of names) {
    if (!d.isDirectory() || !ID_RE.test(d.name)) continue;
    const manifest = await readJson(path.join(root(), d.name, "manifest.json"));
    if (!manifest) continue;
    const compat = await compatOf(d.name);
    out.push({ id: d.name, manifest, enabled: enabled.has(d.name) && compat.level !== "no", compat, network: net[d.name] === undefined ? null : !!net[d.name],
      hasStyles: (await readText(path.join(root(), d.name, "styles.css"))) != null });
  }
  return out.sort((a, b) => String(a.manifest.name || a.id).localeCompare(String(b.manifest.name || b.id)));
}

/* write a plugin's files into plugins/<id>/ (replacing an older version, keeping its data.json) */
async function place(id, files) {
  checkId(id);
  if (!files.main || !files.manifest) throw new Error("A plugin needs manifest.json and main.js");
  let manifest;
  try { manifest = JSON.parse(files.manifest); } catch (e) { throw new Error("manifest.json isn't valid JSON"); }
  if (manifest.id && manifest.id !== id) id = String(manifest.id);
  checkId(id);
  if (files.main.length > MAX_CODE) throw new Error("main.js is too large");
  const dir = dirOf(id);
  await fs.mkdir(dir, { recursive: true });
  await writeText(path.join(dir, "manifest.json"), files.manifest);
  await writeText(path.join(dir, "main.js"), files.main);
  if (files.styles != null) await writeText(path.join(dir, "styles.css"), files.styles);
  else await fs.rm(path.join(dir, "styles.css"), { force: true });
  if (files.data != null && (await readText(path.join(dir, "data.json"))) == null) await writeText(path.join(dir, "data.json"), files.data);
  await fs.rm(path.join(dir, "compat.json"), { force: true });
  const compat = await compatOf(id);
  return { id, manifest, compat };
}

async function install(id) {
  const c = await check(id);
  if (c.level === "no") throw new Error("This plugin can't run in CarbonFibre: " + c.reasons.join("; "));
  const entry = await catalogEntry(id);
  const version = String(c.manifest.version || "0").replace(/[^\w.-]/g, "");
  const dir = path.join(cacheRoot(), id + "@" + version);
  const styles = await get("https://github.com/" + entry.repo + "/releases/latest/download/styles.css", MAX_DATA).catch(() => null);
  return place(id, { manifest: await readText(path.join(dir, "manifest.json")), main: await readText(path.join(dir, "main.js")), styles });
}

async function installFromDir(dir) {
  const manifest = await readText(path.join(dir, "manifest.json"));
  const main = await readText(path.join(dir, "main.js"));
  if (!manifest || !main) throw new Error("That folder has no manifest.json and main.js. Choose a plugin's own folder (for example .obsidian/plugins/dataview).");
  let id;
  try { id = String(JSON.parse(manifest).id || path.basename(dir)); } catch (e) { throw new Error("manifest.json isn't valid JSON"); }
  return place(id, { manifest, main, styles: await readText(path.join(dir, "styles.css")), data: await readText(path.join(dir, "data.json")) });
}

async function uninstall(id) {
  await fs.rm(dirOf(id), { recursive: true, force: true });
  const e = await enabledSet(); e.delete(id); await saveEnabled(e);
  const n = await networkMap(); delete n[id]; await writeText(path.join(root(), "network.json"), JSON.stringify(n));
}
async function setEnabled(id, on) {
  checkId(id);
  const e = await enabledSet();
  if (on) e.add(id); else e.delete(id);
  await saveEnabled(e);
  return Array.from(e);
}
async function anyEnabled() { return (await enabledSet()).size > 0; }

/* ---- the internet, per plugin ----
   Granting happens only in main.js, behind a dialog the page can't answer; the page may only take
   access away. A request is made here, by the main process, and only for a plugin that was granted. */
async function networkMap() { const n = await readJson(path.join(root(), "network.json")); return n && typeof n === "object" && !Array.isArray(n) ? n : {}; }
async function networkAllowed(id) { checkId(id); return (await networkMap())[id] === true; }
async function setNetwork(id, on) {
  checkId(id);
  const n = await networkMap();
  n[id] = !!on;
  await writeText(path.join(root(), "network.json"), JSON.stringify(n));
  return !!on;
}
const FORBIDDEN_HEADERS = /^(host|content-length|connection|transfer-encoding|keep-alive|upgrade|te|trailer|proxy-.*)$/i;
/* Addresses no plugin needs: link-local (169.254.x.x, fe80::, where cloud machines answer with their
   credentials), "this network" 0.x, multicast and reserved ranges. Checked on the address the name
   resolves to, and again after every redirect, so a public name or a redirect can't lead there.
   Plugins may still reach this computer and the local network (local AI servers, LanguageTool). */
function blockedIp(ip) {
  let a = String(ip).toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) a = mapped[1];
  if (netmod.isIPv4(a)) {
    const o = a.split(".").map(Number);
    return o[0] === 0 || (o[0] === 169 && o[1] === 254) || o[0] >= 224;
  }
  return a === "::" || /^fe[89ab]/.test(a) || /^ff/.test(a);
}
async function checkTarget(u) {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http and https addresses can be requested");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = netmod.isIP(host) ? [host] : (await dns.lookup(host, { all: true, verbatim: true })).map((x) => x.address);
  if (!ips.length || ips.some(blockedIp)) throw new Error("Blocked address: " + u.hostname + " (link-local and reserved addresses can't be reached by plugins)");
}
const MAX_REDIRECTS = 5;
async function request(id, opts) {
  if (!(await networkAllowed(id))) throw new Error("This plugin isn't allowed to use the internet. Allow it in Plugins, Installed.");
  opts = opts || {};
  const u = new URL(String(opts.url || ""));
  const method = String(opts.method || "GET").toUpperCase();
  if (!/^[A-Z]{1,16}$/.test(method)) throw new Error("Not a request method: " + method);
  const headers = {};
  Object.keys(opts.headers || {}).forEach((k) => { if (!FORBIDDEN_HEADERS.test(k)) headers[k] = String(opts.headers[k]); });
  if (opts.contentType && !Object.keys(headers).some((k) => /^content-type$/i.test(k))) headers["Content-Type"] = String(opts.contentType);
  let body;
  if (opts.body != null && method !== "GET" && method !== "HEAD") {
    body = typeof opts.body === "string" ? opts.body : Buffer.from(opts.body.buffer ? new Uint8Array(opts.body.buffer, opts.body.byteOffset || 0, opts.body.byteLength) : opts.body);
    if (body.length > MAX_BODY) throw new Error("Request body too large");
  }
  await checkTarget(u);
  return send(u, method, headers, body);
}
/* one request through Chromium's network stack (the system's proxy and certificates). A redirect isn't
   followed blindly: its address is checked by checkTarget and then requested afresh (Chromium only
   lets a redirect be followed synchronously, before a name could be looked up). */
function send(u, method, headers, body, hops) {
  hops = hops || 0;
  return new Promise((resolve, reject) => {
    let done = false, moved = false;          /* moved: this request was dropped for a redirect */
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v); };
    const fail = (msg) => { try { req.abort(); } catch (e) { /* already closed */ } finish(reject, new Error(msg)); };
    const req = net.request({ method, url: u.href, redirect: "manual", useSessionCookies: false, cache: "no-store" });
    const timer = setTimeout(() => fail("The request took too long"), REQUEST_TIMEOUT);
    Object.keys(headers).forEach((k) => { try { req.setHeader(k, headers[k]); } catch (e) { /* a header Chromium sets itself */ } });
    req.on("redirect", (status, _method, url) => {
      let next;
      try { next = new URL(url); } catch (e) { fail("A redirect to a bad address"); return; }
      if (hops >= MAX_REDIRECTS) { fail("Too many redirects"); return; }
      moved = true;
      try { req.abort(); } catch (e) { /* closed */ }
      const toGet = status === 303 || ((status === 301 || status === 302) && method === "POST");
      checkTarget(next)
        .then(() => send(next, toGet ? "GET" : method, headers, toGet ? undefined : body, hops + 1))
        .then((r) => finish(resolve, r), (e) => finish(reject, e));
    });
    req.on("response", (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (c) => { size += c.length; if (size > MAX_RESPONSE) fail("Response too large"); else chunks.push(c); });
      res.on("end", () => {
        const h = {};
        Object.keys(res.headers || {}).forEach((k) => { const v = res.headers[k]; h[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v); });
        finish(resolve, { status: res.statusCode, headers: h, url: u.href, body: new Uint8Array(Buffer.concat(chunks)) });
      });
      res.on("error", (e) => fail("The request failed: " + ((e && e.message) || e)));
    });
    req.on("error", (e) => { if (!done && !moved) fail("The request failed: " + ((e && e.message) || e)); });
    if (body != null) req.write(body);
    req.end();
  });
}

async function styles(id) { return readText(path.join(dirOf(id), "styles.css")); }
async function loadData(id) { return readText(path.join(dirOf(id), "data.json")); }
async function saveData(id, text) {
  if (typeof text !== "string" || text.length > MAX_DATA) throw new Error("Settings too large");
  await writeText(path.join(dirOf(id), "data.json"), text);
}

/* a plugin's own folder, for app.vault.adapter calls under manifest.dir */
function inPluginDir(id, rel) {
  const dir = dirOf(id), f = path.resolve(dir, String(rel || "."));
  if (f !== dir && !f.startsWith(dir + path.sep)) throw new Error("Outside the plugin's folder: " + rel);
  return f;
}
const pluginFs = {
  async read(id, rel) { const t = await readText(inPluginDir(id, rel)); if (t == null) throw new Error("No such file: " + rel); return t; },
  async write(id, rel, text) { if (String(text).length > MAX_DATA) throw new Error("File too large"); await writeText(writable(id, rel), String(text)); },
  async exists(id, rel) { try { await fs.stat(inPluginDir(id, rel)); return true; } catch (e) { return false; } },
  async list(id, rel) {
    const f = inPluginDir(id, rel), out = { files: [], folders: [] };
    try { for (const d of await fs.readdir(f, { withFileTypes: true })) (d.isDirectory() ? out.folders : out.files).push(d.name); } catch (e) {}
    return out;
  },
  async mkdir(id, rel) { await fs.mkdir(writable(id, rel), { recursive: true }); },
  async remove(id, rel) { const f = writable(id, rel); if (f === dirOf(id)) throw new Error("Can't remove the plugin's folder"); await fs.rm(f, { recursive: true, force: true }); }
};
/* A plugin's code and description are installed by the app, never written from the page: otherwise a
   plugin (they all share one page) could rewrite its own or another plugin's code for next start,
   skipping the check every plugin gets before it runs. Its settings go through saveData. */
const PROTECTED = new Set(["main.js", "manifest.json", "styles.css", "compat.json", "data.json"]);
function writable(id, rel) {
  const f = inPluginDir(id, rel);
  if (path.dirname(f) === dirOf(id) && PROTECTED.has(path.basename(f).toLowerCase())) throw new Error("A plugin can't change " + path.basename(f) + " from here");
  return f;
}

/* the code the page loads: main.js wrapped as a CommonJS module and handed to the plugin host */
async function wrappedCode(id) {
  const code = await readText(path.join(dirOf(id), "main.js"));
  if (code == null) return null;
  /* fetch: the plugin's own, through its internet permission (window.fetch stays blocked by the page's policy) */
  return "window.__cfPluginDefine(" + JSON.stringify(id) + ", function (require, module, exports, process, global, fetch) {\n" + code +
    "\n});\n//# sourceURL=plugin:" + id + "/main.js\n";
}

module.exports = { catalog, check, list, install, installFromDir, place, uninstall, setEnabled, anyEnabled, networkAllowed, setNetwork, request, styles, loadData, saveData, pluginFs, wrappedCode, checkId };
