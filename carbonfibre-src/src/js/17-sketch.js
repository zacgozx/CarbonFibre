/* ============================================================
   sketch board - Excalidraw-compatible shapes stored in a
   ```excalidraw fence inside the note
   ============================================================ */

var sketchEl = document.getElementById("sketch");
var skCanvas = document.getElementById("sketchCanvas");
var skctx = skCanvas.getContext("2d");
/* ---- theme ----
   Drawings store their colours as picked on the dark board. On a light background the
   near-white ink would vanish, so colours are mapped at draw time, never rewritten:
   a drawing opened in the other theme, or on another machine, is unchanged. */
/* inks for the light page: the shared palette's light shades, plus the board's earlier swatches
   (still saved in older drawings) */
var INK_LIGHT = {
  "#e2e3e5": "#0f2b3d",
  "#9aa0a8": "#46606f",
  "#d98592": "#9C3D54",
  "#c2453f": "#B4323F",
  "#d99a5b": "#b45309",
  "#e8c46a": "#a16207",
  "#8fc98f": "#3D7A3A",
  "#4f9d69": "#2D6B45",
  "#6e8fe8": "#1f6f94",
  "#4256a8": "#1a4f6e",
  "#b58ad4": "#7A4E9E",
  "#7b4fa8": "#5B3A86",
  "#b9bcc4": "#2c4a5e",
  "#f0e6d6": "#2c4a5e"
};
PALETTE.forEach(function (c) { INK_LIGHT[c.dark.toLowerCase()] = c.light; });
var skLightInk = false;        /* forced on while rendering for a white page (exports) */
function isLight() { return document.documentElement.getAttribute("data-theme") === "light"; }
/* Any other colour (imported, or picked outside the swatches) is darkened on the light page
   until it reads like text on it (4.5:1), keeping its hue, so pale pinks and greens drawn on the
   dark board stay visible. Display only: the drawing keeps its own colours. */
var INK_AUTO = {};
function skInkDarken(hex) {
  if (INK_AUTO[hex]) return INK_AUTO[hex];
  var m = /^#([0-9a-f]{6})$/.exec(hex);
  if (!m) return (INK_AUTO[hex] = hex);
  var n = parseInt(m[1], 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  var lum = function (R, G, B) { var f = function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(R) + 0.7152 * f(G) + 0.0722 * f(B); };
  var page = 0.9785;                                 /* the light page, #fbfdff */
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, h = 0, sat = 0;
  if (d) {
    sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  var hue = function (p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  var rgbOf = function (L) {
    if (!sat) return [L, L, L];
    var q = L < 0.5 ? L * (1 + sat) : L + sat - L * sat, p = 2 * L - q;
    return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
  };
  if (sat > 0.25) sat = Math.max(sat, 0.6);            /* a colour, not a grey: lift dull ones so they darken clean, not muddy */
  var cur = rgbOf(l);
  while ((page + 0.05) / (lum(cur[0], cur[1], cur[2]) + 0.05) < 4.5 && l > 0.12) { l -= 0.02; cur = rgbOf(l); }   /* as readable as text */
  var out = "#" + cur.map(function (v) { return ("0" + Math.round(v * 255).toString(16)).slice(-2); }).join("");
  return (INK_AUTO[hex] = out);
}
function skInk(c) {
  if (!c || c === "transparent" || !(skLightInk || isLight())) return c;
  var k = String(c).toLowerCase();
  return INK_LIGHT[k] || skInkDarken(k);
}
/* fills are meant to be pale: on the light page they keep their colour (swatch fills still
   map through INK_LIGHT, as before); darkening them turned a cream fill into olive */
function skFill(c) {
  if (!c || c === "transparent" || !(skLightInk || isLight())) return c;
  return INK_LIGHT[String(c).toLowerCase()] || c;
}
function themeColour(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#0e0f11";
}

/* the board's swatches are the shared palette: what you pick here matches text colour in notes */
var SK_PALETTE = PALETTE.map(function (c) { return { hex: c.dark, name: c.name }; });
var SK_COLORS = SK_PALETTE.map(function (c) { return c.hex; });
var SK_QUICK = ["ink", "grey", "red", "orange", "green", "blue"].map(pc);
var skRecent = [];
try { skRecent = JSON.parse(localStorage.getItem("carbonfibre-sk-recent") || "[]") || []; } catch (e) {}
var sk = null;   /* active board: { pane, noteId, elements, cam, tool, color, width, sel, drawing, undo } */

function skId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function skBase(type, x, y, color, width) {
  return { id: skId(), type: type, x: x, y: y, width: 0, height: 0, angle: 0,
    strokeColor: color, backgroundColor: "transparent", fillStyle: "solid", strokeWidth: width,
    strokeStyle: (typeof sk !== "undefined" && sk && sk.strokeStyle) || "solid", roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null,
    seed: Math.floor(Math.random() * 1e9), version: 1, versionNonce: Math.floor(Math.random() * 1e9),
    isDeleted: false, boundElements: null, updated: Date.now(), link: null, locked: false };
}
