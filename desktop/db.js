/* The desktop app's own data, in one SQLite file: <userData>/carbonfibre.db. Notes stay .md files in
   your notes folder; this holds what the app keeps for itself:
     page    everything the page would otherwise keep in browser storage: settings, the task board,
             sheets, the timer, sessions, sketches, notes not yet saved to a folder
     app     the desktop side: which plugins are on, their internet and Node.js grants, their saved
             settings (data.json in Obsidian), secrets (still encrypted by the system keychain), the theme
     meta    the schema version, and whether browser storage was copied in yet
   SQLite comes with Electron's Node (node:sqlite), so there is nothing native to build or ship.
   Downloads (plugin code, the catalogs) stay files: they're caches, not your data. */
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { app } = require("electron");

const SCHEMA = 1;
let db = null;
let file = null;

function open() {
  if (db) return db;
  const { DatabaseSync } = require("node:sqlite");
  file = path.join(app.getPath("userData"), "carbonfibre.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 3000;");
  const v = db.prepare("PRAGMA user_version").get().user_version;
  if (v < 1) {
    db.exec(`BEGIN;
      CREATE TABLE IF NOT EXISTS page (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app (ns TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (ns, key));
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version = ${SCHEMA};
      COMMIT;`);
  }
  return db;
}
function close() { if (db) { try { db.close(); } catch (e) { /* closed */ } db = null; } }
function where() { open(); return file; }

/* a group of writes as one transaction: all or none */
function tx(fn) {
  const d = open();
  d.exec("BEGIN");
  try { const r = fn(d); d.exec("COMMIT"); return r; } catch (e) { d.exec("ROLLBACK"); throw e; }
}

/* ---- meta ---- */
function meta(key) { const r = open().prepare("SELECT value FROM meta WHERE key = ?").get(String(key)); return r ? r.value : null; }
function setMeta(key, value) { open().prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(key), String(value)); }

/* ---- page storage: the page's localStorage, kept here instead (desktop/preload.js, js/00-desktop-store.js) ---- */
const MAX_PAGE_VALUE = 64 * 1024 * 1024;
function pageAll() {
  const out = {};
  for (const r of open().prepare("SELECT key, value FROM page").all()) out[r.key] = r.value;
  return { data: out, copied: meta("page-copied") === "1" };
}
/* ops: [[key, value]] sets, [[key, null]] removes, [["", null, "clear"]] empties it */
function pageWrite(ops, copied) {
  if (!Array.isArray(ops)) return;
  tx((d) => {
    const put = d.prepare("INSERT INTO page (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    const del = d.prepare("DELETE FROM page WHERE key = ?");
    for (const op of ops) {
      if (!Array.isArray(op)) continue;
      if (op[2] === "clear") { d.exec("DELETE FROM page"); continue; }
      const k = String(op[0]);
      if (op[1] == null) del.run(k);
      else { const v = String(op[1]); if (v.length <= MAX_PAGE_VALUE) put.run(k, v); }
    }
    if (copied) d.prepare("INSERT INTO meta (key, value) VALUES ('page-copied', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
  });
}

/* ---- the desktop side's settings ---- */
function get(ns, key) { const r = open().prepare("SELECT value FROM app WHERE ns = ? AND key = ?").get(String(ns), String(key)); return r ? r.value : null; }
function set(ns, key, value) {
  if (value == null) open().prepare("DELETE FROM app WHERE ns = ? AND key = ?").run(String(ns), String(key));
  else open().prepare("INSERT INTO app (ns, key, value) VALUES (?, ?, ?) ON CONFLICT(ns, key) DO UPDATE SET value = excluded.value").run(String(ns), String(key), String(value));
}
/* a value that used to be a JSON file: read here; the first time, taken from the file (which is left
   where it was, as a backup for an older version of the app) */
function getJson(ns, key, oldFile) {
  let t = get(ns, key);
  if (t == null && oldFile && meta("moved:" + ns + ":" + key) !== "1") {
    try { t = fs.readFileSync(oldFile, "utf8"); } catch (e) { t = null; }
    tx(() => { if (t != null) set(ns, key, t); setMeta("moved:" + ns + ":" + key, "1"); });
  }
  if (t == null) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}
function setJson(ns, key, value) { set(ns, key, value == null ? null : JSON.stringify(value)); }
/* plain text the same way (a plugin's data.json) */
function getText(ns, key, oldFile) {
  let t = get(ns, key);
  if (t == null && oldFile && meta("moved:" + ns + ":" + key) !== "1") {
    try { t = fs.readFileSync(oldFile, "utf8"); } catch (e) { t = null; }
    tx(() => { if (t != null) set(ns, key, t); setMeta("moved:" + ns + ":" + key, "1"); });
  }
  return t;
}
function removePrefix(ns, prefix) { open().prepare("DELETE FROM app WHERE ns = ? AND substr(key, 1, ?) = ?").run(String(ns), prefix.length, prefix); }

module.exports = { open, close, where, tx, meta, setMeta, pageAll, pageWrite, get, set, getJson, setJson, getText, removePrefix };
