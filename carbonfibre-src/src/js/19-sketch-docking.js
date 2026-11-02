/* ============================================================
   Several sketches side by side. There is one live editor (one DOM
   node, one canvas, one `sk`), so every other sketch pane is
   "parked": saved, and drawn as a snapshot at its own zoom. Clicking
   a parked pane saves the live board and hands the editor over.
   ============================================================ */

/* the fence holding this drawing: the hinted line if it still matches, else the one
   whose JSON matches, so two drawings in one note never get written to each other */
function skFenceBody(src, i) {
  var m = src.fmeta[i];
  if (!m || m.fence !== "open" || m.lang !== "excalidraw") return null;
  var close = i + 1;
  while (close < src.lines.length && !(src.fmeta[close] && src.fmeta[close].fence === "close")) close++;
  return src.lines.slice(i + 1, close).join("\n");
}
/* Find our drawing's fence. When we know what we last wrote, only an exact match counts:
   a fence at the same line number in some other note, or holding other content, is
   somebody else's drawing. Guessing by position is what overwrote one note's sketch
   with another's. With no JSON to go on (a restore at boot) the index is all there is. */
function skFenceFind(src, hint, json) {
  if (json == null) return skFenceBody(src, hint) !== null ? hint : -1;
  if (skFenceBody(src, hint) === json) return hint;
  for (var i = 0; i < src.lines.length; i++) if (skFenceBody(src, i) === json) return i;
  return -1;
}

/* a pane that can supply the note's lines: one already showing it, or the host itself */
function skSourcePane(noteId, host) {
  for (var i = 0; i < panes.length; i++) {
    var q = panes[i];
    if (q !== host && q.type === "note" && sameId(q.noteId, noteId)) return q;
  }
  host.noteId = noteId;
  host.reload();
  return host;
}

function skRenderParked(p) {
  var pk = p.parked;
  if (!pk) return;
  if (!p.parkEl) {
    p.parkEl = document.createElement("div");
    p.parkEl.className = "sk-parked";
    p.parkEl.innerHTML = '<canvas></canvas><span class="sk-parked-hint">Click to edit this sketch</span>';
    p.parkEl.addEventListener("mousedown", function (e) { e.preventDefault(); skActivate(p); });
    p.root.appendChild(p.parkEl);
    if (window.ResizeObserver) new ResizeObserver(function () { if (p.parked) skRenderParked(p); }).observe(p.parkEl);
  }
  p.parkEl.classList.add("show");
  var cv = p.parkEl.querySelector("canvas");
  var w = p.parkEl.clientWidth || p.root.clientWidth, h = p.parkEl.clientHeight || 300;
  var dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, w * dpr); cv.height = Math.max(1, h * dpr);
  cv.style.width = w + "px"; cv.style.height = h + "px";
  var ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  /* drawn by the real renderer at the camera it was left at, unless that would crop it
     in this pane - then fit. The saved camera is untouched and comes back on click. */
  var cam = pk.cam;
  var liveSk = sk, liveCtx = skctx;
  sk = { elements: pk.elements, cam: cam, viewW: w, viewH: h, sel: null, sels: [], hoverTarget: null };
  var bb = null;
  pk.elements.forEach(function (el) {
    if (skIsConnector(el)) return;
    var x = skBox(el);
    if (!bb) bb = { x: x.x, y: x.y, x2: x.x + x.w, y2: x.y + x.h + 18 };
    else { bb.x = Math.min(bb.x, x.x); bb.y = Math.min(bb.y, x.y); bb.x2 = Math.max(bb.x2, x.x + x.w); bb.y2 = Math.max(bb.y2, x.y + x.h + 18); }
  });
  if (bb) {
    var tl = skToScreen(bb.x, bb.y), br = skToScreen(bb.x2, bb.y2);
    if (tl[0] < 8 || tl[1] < 8 || br[0] > w - 8 || br[1] > h - 8) {
      var k = Math.min(cam.k, (w - 40) / Math.max(1, bb.x2 - bb.x), (h - 60) / Math.max(1, bb.y2 - bb.y));
      sk.cam = { x: (bb.x + bb.x2) / 2, y: (bb.y + bb.y2) / 2 + 10, k: Math.max(0.1, k) };
    }
  }
  skctx = ctx;
  try { pk.elements.forEach(function (el) { skDrawEl(el, false); }); }
  finally { sk = liveSk; skctx = liveCtx; }
}

/* save the live docked board and turn its pane into a snapshot */
/* hand a pane back to notes: save and detach a live board, or drop a snapshot */
function skReleasePane(p) {
  if (sk && sk.dockedIn === p) {
    if (sk.persistTimer) { clearTimeout(sk.persistTimer); sk.persistTimer = null; }
    skPersist();
    sketchEl.classList.remove("show", "docked");
    document.body.appendChild(sketchEl);
    sk = null;
  }
  p.parked = null;
  if (p.parkEl) p.parkEl.classList.remove("show");
  p.root.classList.remove("is-sketch");
  p.sketchOpen = -1;
  p.type = "note";
}

function skPark() {
  if (!sk || !sk.dockedIn) return;
  var host = sk.dockedIn;
  if (sk.persistTimer) { clearTimeout(sk.persistTimer); sk.persistTimer = null; }
  sk.dirty = true;
  skPersist();                          /* flush now: the timer would fire against the next board */
  host.parked = {
    noteId: sk.noteId, open: sk.open,
    json: JSON.stringify(skDocFor(sk)),
    elements: JSON.parse(JSON.stringify(sk.elements)),
    cam: { x: sk.cam.x, y: sk.cam.y, k: sk.cam.k }
  };
  sketchEl.classList.remove("show");
  document.body.appendChild(sketchEl);
  sketchEl.classList.remove("docked");
  sk = null;
  host.render();
}

/* hand the editor to a parked pane */
function skActivate(host) {
  var pk = host.parked;
  if (!pk) return;
  if (sk && sk.dockedIn === host) return;
  if (sk && sk.dockedIn) skPark();
  else if (sk) closeSketch();           /* the full-screen board, if it was up */
  var src = skSourcePane(pk.noteId, host);
  var idx = skFenceFind(src, pk.open, pk.json);
  if (idx < 0) {                        /* the drawing is gone from the note */
    host.parked = null;
    host.type = "note";
    host.root.classList.remove("is-sketch");
    if (host.parkEl) host.parkEl.classList.remove("show");
    host.render();
    return;
  }
  host.parked = null;
  if (host.parkEl) host.parkEl.classList.remove("show");
  openSketch(src, idx, host);
  sk.cam = { x: pk.cam.x, y: pk.cam.y, k: pk.cam.k };
  skDraw();
  host.focusThis();
}

function skDock(pane) {
  if (pane) {
    pane.root.appendChild(sketchEl);
    sketchEl.classList.add("docked", "show");
    pane.type = "sketch";
    pane.root.classList.add("is-sketch");
    pane.render();
  } else {
    document.body.appendChild(sketchEl);
    sketchEl.classList.remove("docked");
    panes.forEach(function (q) { if (!q.parked) q.root.classList.remove("is-sketch"); });
  }
  if (sk) sk.dockedIn = pane || null;
}

/* Open the fence at openIdx in its own pane beside the note it lives in. */
function openSketchSplit(pane, openIdx) {
  var target = null;
  if (panes.length < MAX_PANES) target = addPane(pane);
  else {                                   /* all panes in use: reuse a plain note pane first */
    for (var i = 0; i < panes.length && !target; i++) {
      if (panes[i] !== pane && panes[i].type === "note") target = panes[i];
    }
    target = target || nextPane(pane);
  }
  openSketch(pane, openIdx, target);
}

function openSketch(pane, openIdx, dockPane, file) {
  scheduleChrome();
  setTimeout(function () {
    if (!sk) return;
    try { sk.showStatus = localStorage.getItem("carbonfibre-sk-status") !== "0"; } catch (e) { sk.showStatus = true; }
    document.getElementById("skStatusBtn").classList.toggle("on", sk.showStatus);
    try { sk.highlight = localStorage.getItem("carbonfibre-sk-highlight") !== "0"; } catch (e) { sk.highlight = true; }
    /* snapping was reset to on at every opening while its button stayed as you left it */
    try { sk.snap = localStorage.getItem("carbonfibre-sk-snap") !== "0"; } catch (e) { sk.snap = true; }
    document.getElementById("skSnap").classList.toggle("on", sk.snap);
    try { sk.netColours = localStorage.getItem("carbonfibre-sk-netcol") === "1"; } catch (e) {}
    try { sk.wrapFans = localStorage.getItem("carbonfibre-sk-wrap") !== "0"; } catch (e) { sk.wrapFans = true; }
    try { sk.autoSplit = localStorage.getItem("carbonfibre-sk-autosplit") !== "0"; } catch (e) { sk.autoSplit = true; }
    document.getElementById("skAutoSplitBtn").textContent = "Auto splitters: " + (sk.autoSplit ? "on" : "off");
    document.getElementById("skWrapBtn").textContent = "Wrap wide fan-outs: " + (sk.wrapFans ? "on" : "off");
    document.getElementById("skNetColBtn").textContent = sk.netColours ? "Colour links by source: on" : "Colour links by source";
    document.getElementById("skHighlightBtn").classList.toggle("on", sk.highlight);
    skPanelFitWidth(); skPanelSync(); skSizeCanvas(); skDraw();
  }, 0);
  var meta = pane.fmeta[openIdx];
  if (!file && (!meta || meta.fence !== "open" || meta.lang !== "excalidraw")) return;
  if (sk) {
    if (sk.dockedIn && sk.dockedIn !== dockPane) skPark();   /* keep it visible, don't steal its node */
    else if (sk.dirty) { if (sk.persistTimer) clearTimeout(sk.persistTimer); skPersist(); }
    if (sk && !dockPane) closeSketch();
  }
  var body;
  if (file) body = file.text;                           /* a sketch file: no note block involved */
  else {
    var close = openIdx + 1;
    while (close < pane.lines.length && !(pane.fmeta[close] && pane.fmeta[close].fence === "close")) close++;
    pane.sync(); pane.deactivate();
    body = pane.lines.slice(openIdx + 1, close).join("\n");
  }
  var dirSaved = null; try { var ap0 = JSON.parse(body).appState; if (ap0 && /^(TB|LR|BT|RL)$/.test(ap0.cfDir)) dirSaved = ap0.cfDir; } catch (e) {}
  sk = { pane: pane, noteId: file ? null : pane.noteId, file: file ? file.path : null, open: openIdx, elements: skParse(body), lastJson: body, dir: dirSaved,
    cam: { x: 0, y: 0, k: 1 }, tool: "select", color: SK_COLORS[0], width: 2, sel: null, sels: [], drawing: null,
    undo: [], down: null, dirty: false, stencil: "server", fill: false, sticky: false,
    textSize: 20, marquee: null, snap: true, guides: null };
  sketchEl.classList.add("show");
  if (dockPane) {
    dockPane.noteId = pane.noteId; dockPane.sketchOpen = openIdx; dockPane.parked = null;
    if (dockPane.parkEl) dockPane.parkEl.classList.remove("show");
    skDock(dockPane);
  }
  else sketchEl.classList.remove("docked");
  skSizeCanvas();
  var box = skContentBox();
  if (box) { sk.cam.x = box.x + box.w / 2; sk.cam.y = box.y + box.h / 2; }
  skSetTool("select");
  skWidthUI();
  skColorUI();
  skSetColor(sk.color);
  skSetWidth(sk.width);
  skDraw();
}
function skContentBox() {
  if (!sk.elements.length) return null;
  var b = null;
  sk.elements.forEach(function (el) {
    var bb = skBox(el);
    if (!b) b = { x: bb.x, y: bb.y, x2: bb.x + bb.w, y2: bb.y + bb.h };
    else { b.x = Math.min(b.x, bb.x); b.y = Math.min(b.y, bb.y); b.x2 = Math.max(b.x2, bb.x + bb.w); b.y2 = Math.max(b.y2, bb.y + bb.h); }
  });
  return { x: b.x, y: b.y, w: b.x2 - b.x, h: b.y2 - b.y };
}
function skSizeCanvas() {
  var wrap = skCanvas.parentNode, dpr = window.devicePixelRatio || 1;
  skCanvas.width = wrap.clientWidth * dpr; skCanvas.height = wrap.clientHeight * dpr;
  skctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
/* a note pane currently showing this note, preferring the one the drawing came from */
function skNotePane(noteId, prefer) {
  if (prefer && prefer.type === "note" && sameId(prefer.noteId, noteId)) return prefer;
  for (var i = 0; i < panes.length; i++) {
    var q = panes[i];
    if (q.type === "note" && sameId(q.noteId, noteId)) return q;
  }
  return null;
}

/* A drawing belongs to a note, not to a pane: panes are views that can switch to other
   notes at any time. So resolve the note by id and write there - through a pane showing
   it if there is one (keeps undo and the cursor right), otherwise straight into the note. */
function skPersist() {
  if (!sk || !sk.dirty) return;
  if (sk.file) {                                        /* a sketch file: straight back to it */
    var fj = JSON.stringify(skDocFor(sk));
    sk.lastJson = fj; sk.dirty = false;
    sketchSave(sk.file, fj);
    return;
  }
  var n = findNote(sk.noteId);
  if (!n) return;
  var host = skNotePane(sk.noteId, sk.pane);
  var view;
  if (host) { host.sync(); view = host; }
  else { var ls = n.content.split("\n"); view = { lines: ls, fmeta: computeFenceMeta(ls) }; }

  var json = JSON.stringify(skDocFor(sk));
  var openIdx = skFenceFind(view, sk.open, sk.lastJson);
  if (openIdx === -1) {
    /* our block was edited or removed elsewhere. Keep the work rather than lose it:
       add it as a new drawing at the end of its own note. */
    view.lines.push("", "```excalidraw", json, "```");
    openIdx = view.lines.length - 3;
    pushToastLike("Sketch block changed elsewhere - saved as a new sketch at the end of " + n.title);
  } else {
    var close = openIdx + 1;
    while (close < view.lines.length && !(view.fmeta[close] && view.fmeta[close].fence === "close")) close++;
    Array.prototype.splice.apply(view.lines, [openIdx + 1, close - openIdx - 1, json]);
  }
  sk.lastJson = json;
  sk.open = openIdx;
  sk.dirty = false;

  if (host) {
    host.commit(true);
    if (host.activeLine === null) host.render();
  } else {
    n.content = view.lines.join("\n");
    markDirty(n);
  }
  /* other panes on the same note should show the new shape count straight away */
  panes.forEach(function (q) {
    if (q.type !== "note" || q === host || !sameId(q.noteId, sk.noteId)) return;
    if (q.activeLine !== null || document.activeElement === q.srcEl) return;
    q.reload(); q.render();
  });
}
function closeSketch() {
  scheduleChrome();
  if (!sk) return;
  skPersist();
  var p = sk.pane, docked = sk.dockedIn;
  sketchEl.classList.remove("show");
  sk = null;
  if (docked) {
    skDock(null);
    docked.type = "note";
    docked.sketchOpen = -1;
    if (panes.length > 1 && docked !== p) closePane(docked);
    else docked.render();
  }
  p.render();
  scheduleSession();
}
function skChanged() {
  if (!sk.navHist) sk.redo = [];                /* a real edit ends the redo trail */
  scheduleChrome();
  sk.dirty = true;
  if (sk.persistTimer) clearTimeout(sk.persistTimer);
  sk.persistTimer = setTimeout(skPersist, 600);
}
function skSnapshot() { sk.undo.push(JSON.stringify(sk.elements)); if (sk.undo.length > 60) sk.undo.shift(); }

/* insert an empty board at the cursor of the focused pane and open it */
function insertSketch() {
  var p = focusedPane || panes[0];
  if (!p.note()) return;
  if (p.mode !== "live") p.setMode("live");
  var at = p.activeLine !== null ? p.activeLine + 1 : p.lines.length;
  var block = ["```excalidraw", JSON.stringify(skDoc([])), "```"];
  if (at > 0 && p.lines[at - 1].trim() !== "") block.unshift("");
  Array.prototype.splice.apply(p.lines, [at, 0].concat(block));
  p.commit(true);
  p.deactivate(); p.activeLine = null;
  p.render();
  openSketch(p, at + (block.length === 4 ? 1 : 0));
}

/* ---- transforms ---- */
/* view size: the live board's canvas, unless an off-screen render (export, previews) sets its own */
function skViewW() { return sk && sk.viewW != null ? sk.viewW : skCanvas.parentNode.clientWidth; }
function skViewH() { return sk && sk.viewH != null ? sk.viewH : skCanvas.parentNode.clientHeight; }
function skToScreen(x, y) { return [skViewW() / 2 + (x - sk.cam.x) * sk.cam.k, skViewH() / 2 + (y - sk.cam.y) * sk.cam.k]; }
function skToWorld(sx, sy) { return [sk.cam.x + (sx - skViewW() / 2) / sk.cam.k, sk.cam.y + (sy - skViewH() / 2) / sk.cam.k]; }

/* ---- drawing ---- */
function skDraw() {
  if (sk) {
    sk.statusCache = null;
    sk.focusSets = skFocusSets();
    /* link routes depend only on where the shapes are: keep them while nothing has moved,
       so hovering, selecting and panel changes do not re-route every link */
    skRefreshRouteCache();
    /* while something is moving (a drag, a resize, a bend, Tidy's glide) links take their
       plain routes; the spacing pass is too heavy for every frame, so it runs once the
       motion stops */
    var moving = sk.animating || (sk.down && (sk.down.move || sk.down.resize || sk.down.bend || sk.down.segDrag));
    if (moving) { sk.routes = null; sk.routeSig = null; }
    else {
      var rsig = sk.geoSigAll + "#" + skLinksSig();
      if (rsig !== sk.routeSig || !sk.routes) { sk.routes = null; sk.routes = skBuildRoutes(); sk.routeSig = rsig; }
    }
  }
  var zp = document.getElementById("skZoomPct");
  if (zp && sk) zp.textContent = Math.round(sk.cam.k * 100) + "%";
  if (!sk) return;
  var w = skCanvas.parentNode.clientWidth, h = skCanvas.parentNode.clientHeight, k = sk.cam.k;
  skctx.clearRect(0, 0, w, h);
  /* dot grid */
  var step = 24 * k;
  if (step > 8) {
    var o = skToScreen(0, 0);
    skctx.fillStyle = "rgba(140,140,140,0.16)";
    for (var gx = o[0] % step; gx < w; gx += step) for (var gy = o[1] % step; gy < h; gy += step) skctx.fillRect(gx, gy, 1, 1);
  }
  sk.elements.forEach(function (el) { skDrawEl(el, false); });
  if (sk.drawing) skDrawEl(sk.drawing, false);
  skDrawTarget();
  sk.sels.forEach(function (el) {                       /* every selected shape gets a faint outline */
    if (el === sk.sel) return;
    var bb = skBox(el), aa = skToScreen(bb.x, bb.y);
    skDashRect(aa[0] - 3, aa[1] - 3, bb.w * sk.cam.k + 6, bb.h * sk.cam.k + 6, "rgba(110,143,232,0.55)");
  });
  if (sk.guides) {                     /* the line you are snapping against */
    skctx.strokeStyle = pc("orange"); skctx.lineWidth = 1;
    skctx.setLineDash([3, 4]);
    if (sk.guides.x !== null && sk.guides.x !== undefined) {
      gx = skToScreen(sk.guides.x, 0)[0];
      skctx.beginPath(); skctx.moveTo(gx, 0); skctx.lineTo(gx, skCanvas.clientHeight); skctx.stroke();
    }
    if (sk.guides.y !== null && sk.guides.y !== undefined) {
      gy = skToScreen(0, sk.guides.y)[1];
      skctx.beginPath(); skctx.moveTo(0, gy); skctx.lineTo(skCanvas.clientWidth, gy); skctx.stroke();
    }
    skctx.setLineDash([]);
  }
  if (sk.marquee) {
    var mq = skToScreen(sk.marquee.x, sk.marquee.y);
    skDashRect(mq[0], mq[1], sk.marquee.w * sk.cam.k, sk.marquee.h * sk.cam.k, pc("blue"), pcA("blue", 0.10));
  }
  skDrawJunctions();
  /* a focused node's links are drawn again on top, thicker, so they read clearly */
  if (sk.focusSets) {
    sk.emphasis = true;
    sk.elements.forEach(function (el) { if (!el.isDeleted && skIsConnector(el) && sk.focusSets.links[el.id]) skDrawLink(el); });
    sk.emphasis = false;
  }
  var oneLink = skSingleLink();
  if (oneLink) skDrawLinkHandles(oneLink);
  else if (sk.sels.length) {
    var sb = skSelBox(), sa = skToScreen(sb.x, sb.y);
    var W = sb.w * sk.cam.k, H = sb.h * sk.cam.k;
    skDashRect(sa[0] - 4, sa[1] - 4, W + 8, H + 8, pc("blue"));
    skHandlePoints(sa[0] - 4, sa[1] - 4, W + 8, H + 8).forEach(function (hp) {
      skctx.fillStyle = themeColour("--bg"); skctx.strokeStyle = skInk(pc("blue"));
      skctx.fillRect(hp.x - 4.5, hp.y - 4.5, 9, 9);
      skctx.strokeRect(hp.x - 4.5, hp.y - 4.5, 9, 9);
    });
  }
}
function skDrawTarget() {
  if (!sk.hoverTarget) return;
  var b = skBox(sk.hoverTarget), tl = skToScreen(b.x, b.y), k = sk.cam.k;
  skDashRect(tl[0] - 4, tl[1] - 4, b.w * k + 8, b.h * k + 8, pc("orange"));
}

function skDrawEl(el) {
  var fs = sk.focusSets;
  if (fs && (skIsConnector(el) ? !fs.links[el.id] : el.type === "stencil" && !fs.nodes[el.id])) {
    skctx.save(); skctx.globalAlpha = skIsConnector(el) ? 0.1 : 0.32;
    try { skDrawElCore(el); } finally { skctx.restore(); }
    return;
  }
  skDrawElCore(el);
}
function skDrawElCore(el) {
  if (el.strokeStyle === "dashed" && !skIsConnector(el)) {
    var dk = Math.max(0.6, sk.cam.k);
    skctx.setLineDash([6 * dk, 5 * dk]);
    try { skDrawElInner(el); } finally { skctx.setLineDash([]); }
    return;
  }
  skDrawElInner(el);
}
function skDrawElInner(el) {
  var k = sk.cam.k;
  skctx.strokeStyle = skInk(el.strokeColor); skctx.fillStyle = skInk(el.strokeColor);
  skctx.lineWidth = Math.max(1, el.strokeWidth * k); skctx.lineCap = "round"; skctx.lineJoin = "round";
  var p = skToScreen(el.x, el.y);

  if (el.type === "stencil") {
    var b = skBox(el), tl = skToScreen(b.x, b.y);
    skctx.save();
    skctx.translate(tl[0], tl[1]);
    skctx.scale(k, k);
    skctx.lineWidth = Math.max(0.5, el.strokeWidth);
    if (el.fill && el.fill !== "transparent") { skctx.fillStyle = skFill(el.fill); skStencilPath(skctx, el.shape, b.w, b.h, true); }
    else skStencilPath(skctx, el.shape, b.w, b.h, false);
    skctx.restore();
    skDrawStatusDot(el, tl, b, k);
    var lfs = skLabelSize(el);
    if (el.label && skIsFlow(el.shape)) {             /* flowchart shapes carry their label inside */
      skctx.fillStyle = skInk(el.textColor || el.strokeColor);
      skctx.font = Math.max(7, lfs * k) + "px Segoe UI, Arial, sans-serif";
      skctx.textAlign = "center"; skctx.textBaseline = "middle";
      var inset = el.shape === "fc-diamond" ? 0.62 : el.shape === "fc-circle" ? 0.72 : 1;
      var lines = skWrapLabel(el.label, Math.max(20, (b.w * inset - 18) * k)), lh = lfs * 1.23 * k;
      lines.forEach(function (ln, li) {
        skctx.fillText(ln, tl[0] + b.w * k / 2, tl[1] + b.h * k / 2 + (li - (lines.length - 1) / 2) * lh);
      });
      skctx.textAlign = "left"; skctx.textBaseline = "top";
    } else if (el.label) {
      skctx.fillStyle = skInk(el.strokeColor);          /* a label under an icon sits on the board, not on its fill */
      skctx.font = Math.max(7, lfs * k) + "px Segoe UI, Arial, sans-serif";
      skctx.textAlign = "center"; skctx.textBaseline = "top";
      skctx.fillText(el.label, tl[0] + b.w * k / 2, tl[1] + b.h * k + lfs * 0.42 * k);
      skctx.textAlign = "left";
    }
    return;
  }

  if (skIsLink(el)) { skDrawLink(el); return; }   /* every arrow and line, bound or free */

  if (el.type === "rectangle" && el.fill && el.fill !== "transparent") {
    skctx.fillStyle = skFill(el.fill);
    skctx.fillRect(p[0], p[1], el.width * k, el.height * k);
    skctx.fillStyle = skInk(el.strokeColor);
  }
  if (el.type === "ellipse" && el.fill && el.fill !== "transparent") {
    skctx.fillStyle = skFill(el.fill);
    skctx.beginPath();
    skctx.ellipse(p[0] + el.width * k / 2, p[1] + el.height * k / 2, Math.abs(el.width * k / 2), Math.abs(el.height * k / 2), 0, 0, Math.PI * 2);
    skctx.fill();
    skctx.fillStyle = skInk(el.strokeColor);
  }
  if (el.type === "rectangle") { skctx.strokeRect(p[0], p[1], el.width * k, el.height * k); return; }
  if (el.type === "ellipse") {
    skctx.beginPath();
    skctx.ellipse(p[0] + el.width * k / 2, p[1] + el.height * k / 2, Math.abs(el.width * k / 2), Math.abs(el.height * k / 2), 0, 0, Math.PI * 2);
    skctx.stroke(); return;
  }
  if (el.type === "text") {
    skctx.font = (el.fontSize * k) + "px Segoe UI, Arial, sans-serif"; skctx.textBaseline = "top"; skctx.textAlign = "left";
    String(el.text).split("\n").forEach(function (line, i) { skctx.fillText(line, p[0], p[1] + i * el.fontSize * 1.25 * k); });
    return;
  }
  if (el.points && el.points.length) {
    skctx.beginPath();
    el.points.forEach(function (pt, i) { var q = skToScreen(el.x + pt[0], el.y + pt[1]); if (i === 0) skctx.moveTo(q[0], q[1]); else skctx.lineTo(q[0], q[1]); });
    skctx.stroke();
    if (el.type === "arrow" && el.points.length >= 2) {
      var a1 = el.points[el.points.length - 2], a2 = el.points[el.points.length - 1];
      var s1 = skToScreen(el.x + a1[0], el.y + a1[1]), s2 = skToScreen(el.x + a2[0], el.y + a2[1]);
      var ang = Math.atan2(s2[1] - s1[1], s2[0] - s1[0]), len = 9 + el.strokeWidth * 2 * Math.sqrt(k);
      skctx.beginPath();
      skctx.moveTo(s2[0], s2[1]); skctx.lineTo(s2[0] - len * Math.cos(ang - 0.45), s2[1] - len * Math.sin(ang - 0.45));
      skctx.moveTo(s2[0], s2[1]); skctx.lineTo(s2[0] - len * Math.cos(ang + 0.45), s2[1] - len * Math.sin(ang + 0.45));
      skctx.stroke();
    }
  }
}
