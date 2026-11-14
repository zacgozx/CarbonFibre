/* Makes the app icons from the butterfly the app draws for itself (appIconSvg in
   carbonfibre-src/src/js/44-shortcuts.js, dark theme), so the icon always matches the logo:
     build/icon.svg   the drawing
     build/icon.png   1024 x 1024 (macOS and Linux; electron-builder makes the .icns from it)
     build/icon.ico   16 to 256 (Windows)
   Run with Electron, which draws the SVG:  npm run icons */
"use strict";
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const OUT = path.join(__dirname, "build");
const SIZES = [16, 24, 32, 48, 64, 128, 256];

function iconSvg() {
  const src = fs.readFileSync(path.join(__dirname, "..", "carbonfibre-src", "src", "js", "44-shortcuts.js"), "utf8");
  const a = src.indexOf("const APP_ICON_PALETTE = {"), b = src.indexOf("function appIconApply()");
  if (a === -1 || b === -1) throw new Error("appIconSvg not found in 44-shortcuts.js");
  const m = { exports: null };
  new Function("module", src.slice(a, b) + "\nmodule.exports = appIconSvg(APP_ICON_PALETTE.dark);")(m);
  return m.exports;
}

/* an .ico holding PNG images (Windows Vista and later read these) */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  const svg = iconSvg();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "icon.svg"), svg + "\n");
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true } });
  const html = "<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:1024px;height:1024px}</style></head><body>" + svg + "</body></html>";
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  let img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  if (img.getSize().width !== 1024) img = img.resize({ width: 1024, height: 1024, quality: "best" });
  fs.writeFileSync(path.join(OUT, "icon.png"), img.toPNG());
  fs.writeFileSync(path.join(OUT, "icon.ico"), ico(SIZES.map((size) => ({ size, data: img.resize({ width: size, height: size, quality: "best" }).toPNG() }))));
  console.log("wrote build/icon.svg, build/icon.png (1024), build/icon.ico (" + SIZES.join(", ") + ")");
  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });
