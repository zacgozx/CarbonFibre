
"use strict";

/* Icons: drawn line icons at one stroke weight, in place of text glyphs. */
var ICON = {
  x: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
  chevronDown: '<path d="M4 6l4 4 4-4"/>',
  chevronUp: '<path d="M4 10l4-4 4 4"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4L14 14"/>',
  chevronRight: '<path d="M6 4l4 4-4 4"/>',
  star: '<path d="M8 1.9l1.8 3.8 4.1.5-3 2.9.8 4.1L8 11.2l-3.7 2 .8-4.1-3-2.9 4.1-.5z"/>',
  starFill: '<path class="f" d="M8 1.9l1.8 3.8 4.1.5-3 2.9.8 4.1L8 11.2l-3.7 2 .8-4.1-3-2.9 4.1-.5z"/>',
  pencil: '<path d="M10.8 2.6l2.6 2.6-7.9 7.9H2.9v-2.6z"/><path d="M9.3 4.1l2.6 2.6"/>',
  table: '<rect x="2" y="2.5" width="12" height="11" rx="1"/><path d="M2 6.2h12M6.2 6.2v7.3"/>',
  folder: '<path d="M1.8 4.2a.9.9 0 0 1 .9-.9h3.4l1.4 1.6h5.8a.9.9 0 0 1 .9.9v6.9a.9.9 0 0 1-.9.9H2.7a.9.9 0 0 1-.9-.9z"/>',
  file: '<path d="M9 1.8H4.2a.9.9 0 0 0-.9.9v10.6a.9.9 0 0 0 .9.9h7.6a.9.9 0 0 0 .9-.9V5.5z"/><path d="M9 1.8v3.7h3.7"/>',
  hash: '<path d="M6.2 2.5L5 13.5M11 2.5l-1.2 11M2.8 6h11M2.2 10h11"/>',
  command: '<path d="M4.5 2.5a2 2 0 1 0 2 2v7a2 2 0 1 1-2-2h7a2 2 0 1 1-2 2v-7a2 2 0 1 0 2-2z"/>',
  sort: '<path d="M4.5 2.5v11M2.5 11.5l2 2 2-2M8.5 4h5M8.5 8h3.5M8.5 12h2"/>',
  check: '<path d="M3.5 8.5l3 3 6-6.5"/>'
};
var ICO_CACHE = {};
function ico(name, cls) {
  var key = name + "|" + (cls || "");
  return ICO_CACHE[key] || (ICO_CACHE[key] = '<svg class="ico' + (cls ? " " + cls : "") + '" viewBox="0 0 16 16" aria-hidden="true">' + ICON[name] + "</svg>");
}

