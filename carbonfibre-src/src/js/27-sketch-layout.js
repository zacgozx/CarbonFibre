/* ============================================================
   Sketch board layout: tools on the left rail, board actions on top, the selection's
   properties on the right (only when there is something to style), shapes and templates
   in a library drawer.
   ============================================================ */
const SK_DRAW_TOOLS = { rectangle: "rectangle", ellipse: "ellipse", diamond: "diamond", line: "line", arrow: "arrow",
                      connect: "connector", pen: "pen", text: "text", stencil: "shape" };
function skKindName(el) {
  if (el.type === "stencil") {
    let def = null; SK_STENCILS.forEach(function (d) { if (d.id === el.shape) def = d; });
    return def ? def.label : "Shape";
  }
  if (skIsConnector(el)) return "Connector";
  return { rectangle: "Rectangle", ellipse: "Ellipse", text: "Text", line: "Line", arrow: "Arrow", freedraw: "Drawing" }[el.type] || "Shape";
}
function skPanelSync() {
  const pn = document.getElementById("skPanel");
  if (!pn || !sk) return;
  const sels = sk.sels, drawing = SK_DRAW_TOOLS[sk.tool];
  const show = sels.length > 0 || !!drawing;
  pn.classList.toggle("show", show);
  if (!show) return;
  const first = sels[0];
  /* the panel shows the selection's colour and thickness, but selecting something never
     changes your drawing colour: only a colour you pick yourself does */
  document.getElementById("skPanelHead").textContent = sels.length > 1 ? sels.length + " selected"
    : first ? skKindName(first) : "New " + drawing;
  const has = function (fn) { return sels.some(fn); };
  const vis = {
    fill: has(function (e) { return e.type === "rectangle" || e.type === "ellipse" || e.type === "stencil"; }) ||
          sk.tool === "rectangle" || sk.tool === "ellipse" || sk.tool === "diamond" || sk.tool === "stencil",
    stroke: true,
    text: sk.tool === "text" || has(function (e) { return e.type === "text" || e.type === "stencil" || skIsLink(e); }),
    link: has(skIsLink) || sk.tool === "arrow" || sk.tool === "line" || sk.tool === "connect",
    status: has(skIsSystem),
    label: sels.length === 1 && (first.type === "stencil" || first.type === "text" || skIsConnector(first)),
    arrange: sels.length > 0,
    actions: sels.length > 0
  };
  Array.prototype.forEach.call(pn.querySelectorAll("[data-sec]"), function (sec) {
    sec.style.display = vis[sec.dataset.sec] === false ? "none" : "";
  });
  const style = first ? (first.strokeStyle || "solid") : (sk.strokeStyle || "solid");
  Array.prototype.forEach.call(pn.querySelectorAll("[data-stroke]"), function (b) { b.classList.toggle("on", b.dataset.stroke === style); });
  skStatusPanelSync(sels);
  const lk = sels.filter(skIsLink)[0], cv = lk ? skLinkStyle(lk) : (sk.linkStyle || "circuit");
  Array.prototype.forEach.call(pn.querySelectorAll("[data-curve]"), function (b) { b.classList.toggle("on", b.dataset.curve === cv); });
  document.getElementById("skBendHint").textContent = cv === "elbow" || cv === "circuit" ? "Drag a run's handle (or use the arrow keys) to move it; double-click a handle to put it back."
    : "Drag the small dot on a line to bend it. Double-click a bend to remove it.";
  const filled = first ? !!(first.fill && first.fill !== "transparent") : !!sk.fill;
  document.getElementById("skFill").classList.toggle("on", filled);
  const li = document.getElementById("skLabelIn");
  if (vis.label && document.activeElement !== li) {
    li.value = first.type === "text" ? (first.text || "") : (first.label || "");
    li.placeholder = first.type === "text" ? "Text" : "Label";
  }
  skColorUI(); skWidthUI();
  if (typeof skPickerRender === "function") skPickerRender();
}

/* ---- the label box: edits as you type, one undo step per edit ---- */
(function () {
  const li = document.getElementById("skLabelIn"); let editing = false;
  li.addEventListener("input", function () {
    const el = sk && sk.sels.length === 1 ? sk.sels[0] : null;
    if (!el) return;
    if (!editing) { editing = true; skSnapshot(); }
    if (el.type === "text") {
      el.text = el.originalText = li.value;
      const b = skBox(el); el.width = b.w; el.height = b.h;
    } else el.label = li.value;
    skDraw();
  });
  const done = function () { if (editing) { editing = false; skChanged(); } };
  li.addEventListener("change", done);
  li.addEventListener("blur", done);
  li.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); li.blur(); }
  });
})();
/* F2 and double-click rename in the panel now, where copy and paste work as usual */

/* the custom colour square is folded away until wanted; the choice is remembered */
(function () {
  const btn = document.getElementById("skCustomBtn"), pk = document.getElementById("skPicker");
  const set = function (open) {
    pk.style.display = open ? "" : "none";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.classList.toggle("open", open);
    storeSet("carbonfibre-sk-custom", open ? "1" : "0");
    if (open && typeof skPickerRender === "function" && sk) skPickerRender();
  };
  let pref = null; try { pref = localStorage.getItem("carbonfibre-sk-custom"); } catch (e) {}
  set(pref === "1");
  btn.addEventListener("click", function () { set(pk.style.display === "none"); });
})();

/* the panel folds down to its title bar, so it never has to cover a narrow drawing;
   narrow boards start folded, and your last choice is remembered */
function skPanelMin(min, remember) {
  const pn = document.getElementById("skPanel");
  pn.classList.toggle("min", min);
  document.getElementById("skPanelHeadBtn").setAttribute("aria-expanded", min ? "false" : "true");
  if (remember) storeSet("carbonfibre-sk-panelmin", min ? "1" : "0");
}
document.getElementById("skPanelHeadBtn").addEventListener("click", function () {
  skPanelMin(!document.getElementById("skPanel").classList.contains("min"), true);
});
function skPanelFitWidth() {
  let pref = null; try { pref = localStorage.getItem("carbonfibre-sk-panelmin"); } catch (e) {}
  skPanelMin(pref === "1" || (pref === null && sketchEl.clientWidth < 640), false);
}
function skFocusLabel() {
  skPanelMin(false, false);
  skPanelSync();
  const li = document.getElementById("skLabelIn");
  if (li && li.offsetParent) { li.focus(); li.select(); return true; }
  return false;
}

/* ---- status and impact controls ---- */
(function () {
  const row = document.getElementById("skStatusRow");
  row.innerHTML = SK_STATUS.map(function (st, i) {
    return '<button class="sk-status-btn" data-status="' + st.id + '" title="' + st.label + ' (' + (i + 1) + ')"><i style="background:' + st.colour + '"></i>' + st.label + "</button>";
  }).join("");
  Array.prototype.forEach.call(row.querySelectorAll("[data-status]"), function (b) {
    b.addEventListener("click", function () { if (sk) skSetStatus(b.dataset.status); });
  });
})();
document.getElementById("skStatusBtn").addEventListener("click", function () {
  if (!sk) return;
  sk.showStatus = sk.showStatus === false;
  this.classList.toggle("on", sk.showStatus);
  storeSet("carbonfibre-sk-status", sk.showStatus ? "1" : "0");
  skDraw();
});
document.getElementById("skTidy").addEventListener("click", function () { if (sk) skArrange("tidy", skBoardFlow()); });
document.getElementById("skTreeBtn").addEventListener("click", function () { if (sk) skOrientate(); });
document.getElementById("skHighlightBtn").addEventListener("click", function () {
  if (!sk) return;
  sk.highlight = sk.highlight === false;
  this.classList.toggle("on", sk.highlight);
  storeSet("carbonfibre-sk-highlight", sk.highlight ? "1" : "0");
  skDraw();
});
document.getElementById("skReverse").addEventListener("click", function () {
  if (!sk) return;
  const links = sk.sels.filter(function (e) { return skIsConnector(e); });
  if (!links.length) return;
  skSnapshot();
  links.forEach(function (c) { const t = c.fromId; c.fromId = c.toId; c.toId = t; if (c.via) c.via.reverse(); });
  skChanged(); skDraw(); skPanelSync();
});
document.getElementById("skImpact").addEventListener("click", function () {
  if (!sk) return;
  const links = sk.sels.filter(function (e) { return skIsConnector(e) && e.type === "arrow"; });
  if (!links.length) return;
  const on = !links.every(function (c) { return c.impact !== false; });
  skSnapshot();
  links.forEach(function (c) { if (on) delete c.impact; else c.impact = false; });
  skChanged(); skDraw(); skPanelSync();
});
function skStatusPanelSync(sels) {
  const sys = sels.filter(skIsSystem);
  if (sys.length) {
    const st = skStatusOf(sys[0]), own = SK_STATUS[st.own].id;
    Array.prototype.forEach.call(document.querySelectorAll("#skStatusRow [data-status]"), function (b) { b.classList.toggle("on", b.dataset.status === own); });
    const why = document.getElementById("skStatusWhy");
    if (st.rank > st.own && st.why) {
      const dep = skFindEl(st.why), depSt = skStatusOf(dep);
      why.textContent = SK_STATUS[st.rank].label + " because " + (dep.label || "a dependency") + " is " + SK_STATUS[depSt.rank].label.toLowerCase() + ".";
      why.style.display = "";
    } else why.style.display = "none";
  }
  const conn = sels.filter(function (e) { return skIsConnector(e); });
  const imp = document.getElementById("skImpact"), rev = document.getElementById("skReverse");
  imp.style.display = rev.style.display = conn.length ? "" : "none";
  if (conn.length) {
    const arrows = conn.filter(function (c) { return c.type === "arrow"; });
    imp.disabled = !arrows.length;
    imp.classList.toggle("on", arrows.length > 0 && arrows.every(function (c) { return c.impact !== false; }));
    imp.title = arrows.length ? "Status flows back along this arrow: the end it points at is what the other end depends on" : "Plain lines never carry impact";
  }
}
try { if (localStorage.getItem("carbonfibre-sk-status") === "0") document.getElementById("skStatusBtn").classList.remove("on"); } catch (e) {}

/* ---- connector style and straightening ---- */
Array.prototype.forEach.call(document.querySelectorAll("#skPanel [data-curve]"), function (b) {
  b.addEventListener("click", function () {
    if (!sk) return;
    sk.linkStyle = b.dataset.curve;
    const links = sk.sels.filter(skIsLink);
    if (links.length) { skSnapshot(); links.forEach(function (el) { el.curve = b.dataset.curve; skFitLinkBox(el); }); skChanged(); skDraw(); }
    skPanelSync();
  });
});
document.getElementById("skStraighten").addEventListener("click", function () {
  if (!sk) return;
  const links = sk.sels.filter(skIsLink);
  if (!links.length) return;
  skSnapshot();
  links.forEach(function (el) {
    if (skIsConnector(el)) skLinkHintsClear(el);
    else if (el.points && el.points.length > 2) el.points = [el.points[0], el.points[el.points.length - 1]];
    skFitLinkBox(el);
  });
  skChanged(); skDraw();
});

/* ---- stroke style ---- */
Array.prototype.forEach.call(document.querySelectorAll("#skPanel [data-stroke]"), function (b) {
  b.addEventListener("click", function () {
    if (!sk) return;
    sk.strokeStyle = b.dataset.stroke;
    if (sk.sels.length) {
      skSnapshot();
      sk.sels.forEach(function (el) { if (el.type !== "text") el.strokeStyle = b.dataset.stroke; });
      skChanged(); skDraw();
    }
    skPanelSync();
  });
});

/* ---- placing a stencil, by click on the canvas or by dragging a tile onto it ---- */
/* put a splitter on link L at the point nearest (wx, wy): L now runs into the splitter, and a
   copy carries on from it to L's old target. Returns the splitter. */
function skSplitLink(L, wx, wy) {
  const smp = skLinkSamples(L); let best = smp[0], bd = Infinity;
  for (let i = 1; i < smp.length; i++) {
    const a = smp[i - 1], b = smp[i], dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((wx - a[0]) * dx + (wy - a[1]) * dy) / len2));
    const q = [a[0] + dx * t, a[1] + dy * t], d = Math.hypot(q[0] - wx, q[1] - wy);
    if (d < bd) { bd = d; best = q; }
  }
  const sp = skBase("stencil", best[0] - 8, best[1] - 8, L.strokeColor, L.strokeWidth);
  sp.shape = "splitter"; sp.width = 16; sp.height = 16; sp.label = ""; sp.fill = "transparent";
  const rest = JSON.parse(JSON.stringify(L));
  rest.id = skId(); rest.fromId = sp.id; rest.label = ""; rest.startArrowhead = null;
  [L, rest].forEach(skLinkHintsClear);
  L.toId = sp.id;
  sk.elements.push(rest, sp);
  return sp;
}
function skPlaceStencil(shape, wx, wy) {
  skSnapshot();
  const sz = skStencilSize(shape);
  const spot = skFreeSpot(skSnapTo(wx - sz.w / 2), skSnapTo(wy - sz.h / 2), sz.w, sz.h);
  const st = skBase("stencil", spot[0], spot[1], sk.color, sk.width);
  st.shape = shape;
  st.width = sz.w; st.height = sz.h;
  st.fill = sk.fill ? sk.color : "transparent";
  let def = null;
  SK_STENCILS.forEach(function (d) { if (d.id === shape) def = d; });
  st.label = shape === "splitter" ? "" : def ? def.label : shape;
  sk.elements.push(st);
  skSelect([st]);
  skChanged(); skDraw();
  return st;
}
/* the hover highlight ends when the pointer leaves the board */
skCanvas.addEventListener("mouseleave", function () { if (sk && sk.hoverId) { sk.hoverId = null; skDraw(); } });
skCanvas.addEventListener("dragover", function (e) {
  if (sk && Array.prototype.indexOf.call(e.dataTransfer.types, "text/x-cf-stencil") !== -1) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
});
skCanvas.addEventListener("drop", function (e) {
  const id = e.dataTransfer.getData("text/x-cf-stencil");
  if (!sk || !id) return;
  e.preventDefault();
  const pt = evLocal(skCanvas, e), w = skToWorld(pt[0], pt[1]);
  skPlaceStencil(id, w[0], w[1]);
});

/* ---- eraser ---- */
function skEraseAt(wx, wy) {
  const el = skHit(wx, wy);
  if (!el) return;
  sk.elements = sk.elements.filter(function (e) {
    if (e === el) return false;
    return !(skIsConnector(e) && (e.fromId === el.id || e.toId === el.id));   /* its links go with it */
  });
  if (sk.sels.indexOf(el) !== -1) skSelect([]);
  if (sk.down) sk.down.n++;
  skDraw();
}

/* ---- the library drawer: search, two tabs, shapes grouped by category ---- */
function skLibOpen(open) {
  const lib = document.getElementById("skLibrary");
  if (open === undefined) open = !lib.classList.contains("show");
  lib.classList.toggle("show", open);
  document.getElementById("skLibBtn").classList.toggle("on", open);
  if (open) {
    skBuildPalette(); skLibFilter();
    setTimeout(function () { document.getElementById("skLibSearch").focus(); }, 0);
  } else if (sk && sk.tool === "stencil") skSetTool("select");
}
function skLibTab(which) {
  Array.prototype.forEach.call(document.querySelectorAll("#skLibrary [data-lib]"), function (b) { b.classList.toggle("on", b.dataset.lib === which); });
  document.getElementById("skPalette").classList.toggle("show", which === "stencils");
  document.getElementById("skTemplates").classList.toggle("show", which === "files");
  document.getElementById("skLibSearch").style.display = which === "files" ? "none" : "";   /* the files browser has its own */
  if (which === "files") { skLib.where = "panel"; sketchLibRender(document.getElementById("skTemplates")); }
  skLibFilter();
}
function skLibFilter() {
  const q = document.getElementById("skLibSearch").value.trim().toLowerCase(); let any = false;
  const stencilsOn = document.getElementById("skPalette").classList.contains("show");
  Array.prototype.forEach.call(document.querySelectorAll("#skPalette .sk-stencil"), function (b) {
    const hit = !q || (b.title + " " + b.textContent).toLowerCase().indexOf(q) !== -1;
    b.style.display = hit ? "" : "none";
    if (hit && stencilsOn) any = true;
  });
  Array.prototype.forEach.call(document.querySelectorAll("#skPalette .sk-lib-h"), function (h) {
    let n = h.nextElementSibling, seen = false;
    while (n && !n.classList.contains("sk-lib-h")) { if (n.style.display !== "none") seen = true; n = n.nextElementSibling; }
    h.style.display = seen ? "" : "none";
  });
  document.getElementById("skLibEmpty").style.display = any ? "none" : "block";
}
document.getElementById("skLibBtn").addEventListener("click", function () { skLibOpen(); });
document.getElementById("skLibSearch").addEventListener("input", skLibFilter);
document.getElementById("skLibSearch").addEventListener("keydown", function (e) {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); skLibOpen(false); }
});
sketchLibWire(document.getElementById("skTemplates"));
Array.prototype.forEach.call(document.querySelectorAll("#skLibrary [data-lib]"), function (b) {
  b.addEventListener("click", function () { skLibTab(b.dataset.lib); });
});

/* ---- top bar: redo, zoom, the overflow menu ---- */
function skZoomBy(f) { sk.cam.k = Math.max(0.2, Math.min(6, sk.cam.k * f)); skDraw(); }
document.getElementById("skRedo").addEventListener("click", function () { if (sk) skRedo(); });
document.getElementById("skZoomIn").addEventListener("click", function () { if (sk) skZoomBy(1.2); });
document.getElementById("skZoomOut").addEventListener("click", function () { if (sk) skZoomBy(1 / 1.2); });
document.getElementById("skZoomPct").addEventListener("click", function () { if (sk) { sk.cam.k = 1; skDraw(); } });
document.getElementById("skMoreBtn").addEventListener("click", function (e) {
  e.stopPropagation();
  const m = document.getElementById("skMore"), open = !m.classList.contains("show");
  m.classList.toggle("show", open); this.classList.toggle("on", open);
});
document.addEventListener("click", function () {
  const m = document.getElementById("skMore");
  if (m) m.classList.remove("show");
  const mb = document.getElementById("skMoreBtn"); if (mb) mb.classList.remove("on");
});
Array.prototype.forEach.call(document.querySelectorAll("#skMore [data-more]"), function (b) {
  b.addEventListener("click", function () {
    if (!sk) return;
    const what = b.dataset.more;
    if (what === "tidy-tb") skArrange("tidy", "TB");
    else if (what === "tidy-lr") skArrange("tidy", "LR");
    else if (what === "autosplit") {
      sk.autoSplit = sk.autoSplit === false;
      storeSet("carbonfibre-sk-autosplit", sk.autoSplit ? "1" : "0");
      b.textContent = "Auto splitters: " + (sk.autoSplit ? "on" : "off");
      skArrange("tidy", skBoardFlow());
    }
    else if (what === "wrapfans") {
      sk.wrapFans = sk.wrapFans === false;
      storeSet("carbonfibre-sk-wrap", sk.wrapFans ? "1" : "0");
      b.textContent = "Wrap wide fan-outs: " + (sk.wrapFans ? "on" : "off");
      skArrange("tidy", skBoardFlow());
    }

    else if (what === "netcolours") {
      sk.netColours = !sk.netColours; sk.netOrder = null;
      storeSet("carbonfibre-sk-netcol", sk.netColours ? "1" : "0");
      b.textContent = sk.netColours ? "Colour links by source: on" : "Colour links by source";
      skDraw();
    }
    else if (what === "rename") skRenameOpen();
    else if (what === "clear") {
      if (sk.elements.length) Dialogs.confirm("Clear every shape from this board? You can undo this.").then(function (ok) {
        if (ok && sk) { skSnapshot(); sk.elements = []; skSelect([]); skChanged(); skDraw(); }
      });
    } else if (what === "keys") skShowKeys();
  });
});
function skShowKeys() {
  let box = document.getElementById("skKeys");
  if (!box) {
    box = document.createElement("div");
    box.className = "sk-rename"; box.id = "skKeys";
    const rows = [["V", "Select"], ["H", "Hand (or drag with the middle button)"], ["R / O / D", "Rectangle, ellipse, diamond"],
      ["C / A / L", "Connector, arrow, line"], ["T / P", "Text, pen"], ["E", "Eraser"], ["S", "Library"], ["Q", "Keep the tool after drawing"],
      ["Ctrl+Z / Ctrl+Y", "Undo, redo"], ["Ctrl+= / Ctrl+-", "Zoom in, out"], ["Shift+1", "Fit to view"],
      ["1 / 2 / 3 / 4", "Status: operational, degraded, critical, down"], ["Shift+T", "Tidy up connected shapes"], ["Ctrl+D", "Duplicate"], ["F2", "Edit the label"], ["Ctrl+R", "Rename labels in bulk"], ["Del", "Delete"],
      ["[ / ]", "Thinner, thicker"], ["Arrows", "Nudge (Shift for 10)"]];
    box.innerHTML = '<div class="rn-box sk-keys"><div class="rn-head">Keyboard shortcuts</div><dl>' +
      rows.map(function (r) { return "<dt><kbd>" + r[0] + "</kbd></dt><dd>" + r[1] + "</dd>"; }).join("") +
      '</dl><div class="rn-foot"><button class="new-btn" id="skKeysClose">Close</button></div></div>';
    sketchEl.appendChild(box);
    box.addEventListener("mousedown", function (e) { if (e.target === box) box.classList.remove("show"); });
    box.querySelector("#skKeysClose").addEventListener("click", function () { box.classList.remove("show"); });
  }
  box.classList.add("show");
}


Array.prototype.forEach.call(sketchEl.querySelectorAll("[data-width]"), function (b) { b.addEventListener("click", function () { skSetWidth(parseInt(b.dataset.width, 10)); }); });
document.getElementById("skUndo").addEventListener("click", skUndo);
document.getElementById("skDelete").addEventListener("click", skDeleteSel);
document.getElementById("skFit").addEventListener("click", function () {
  const box = skContentBox(); if (!box) { sk.cam = { x: 0, y: 0, k: 1 }; skDraw(); return; }
  const w = skCanvas.parentNode.clientWidth, h = skCanvas.parentNode.clientHeight;
  /* fit into the part of the board you can see: the properties panel and the library
     drawer float over it, and fitting underneath them looked as if Fit had failed */
  const cr = skCanvas.getBoundingClientRect(); let left = 0, right = w;
  const pn = document.getElementById("skPanel"), lib = document.getElementById("skLibrary");
  if (pn && pn.classList.contains("show") && !pn.classList.contains("min")) right = Math.min(right, pn.getBoundingClientRect().left - cr.left - 8);
  if (lib && lib.classList.contains("show")) left = Math.max(left, lib.getBoundingClientRect().right - cr.left + 8);
  if (right - left < w * 0.4) { left = 0; right = w; }   /* a narrow board: use all of it */
  const vw = right - left;
  sk.cam.k = Math.max(0.2, Math.min(3, Math.min(vw / (box.w + 80), h / (box.h + 80))));
  sk.cam.x = box.x + box.w / 2 - ((left + right) / 2 - w / 2) / sk.cam.k;
  sk.cam.y = box.y + box.h / 2; skDraw();
});
document.getElementById("skExport").addEventListener("click", skExport);
document.getElementById("skClose").addEventListener("click", closeSketch);
new ResizeObserver(function () { if (sk) { skSizeCanvas(); skDraw(); } }).observe(skCanvas.parentNode);

