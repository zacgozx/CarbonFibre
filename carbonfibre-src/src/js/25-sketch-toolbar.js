/* ---- toolbar state ---- */
function skSetTool(t) {
  sk.tool = t;
  Array.prototype.forEach.call(sketchEl.querySelectorAll("[data-tool]"), function (b) { b.classList.toggle("on", b.dataset.tool === t); });
  skSelUI();
  skCanvas.style.cursor = t === "select" ? "default" : t === "hand" ? "grab" : t === "text" ? "text" : t === "eraser" ? "cell" : "crosshair";
}
function skSwatch(hex, name) {
  const b = document.createElement("button");
  b.className = "sk-swatch";
  b.dataset.color = hex;
  b.style.background = skInk(hex);
  b.dataset.ink = hex;
  b.title = name ? name + "  " + hex : hex;
  b.addEventListener("click", function (e) { e.stopPropagation(); skSetColor(hex); });
  return b;
}
function skBuildColorUI() {
  const grid = document.getElementById("skGrid");
  grid.innerHTML = "";
  SK_PALETTE.forEach(function (c) { grid.appendChild(skSwatch(c.hex, c.name)); });
  skRenderRecent();
  skColorUI();
}
function skRenderRecent() {
  const r = document.getElementById("skRecent");
  if (!r) return;
  r.innerHTML = "";
  skRecent.slice(0, 6).forEach(function (hex) { r.appendChild(skSwatch(hex, "Recent")); });
}
function skPushRecent(hex) {
  if (SK_QUICK.indexOf(hex) !== -1) return;          /* already one click away */
  skRecent = [hex].concat(skRecent.filter(function (h) { return h !== hex; })).slice(0, 12);
  storeSet("carbonfibre-sk-recent", JSON.stringify(skRecent));
  skRenderRecent();
}
/* keep every swatch, the chip and the hex readout agreeing with sk.color */
/* what the panel shows: the selection's colour and thickness, or yours when nothing is selected */
function skShownColor() { const f = sk && sk.sels.filter(function (e) { return e.strokeColor; })[0]; return f ? f.strokeColor : (sk ? sk.color : SK_COLORS[0]); }
function skShownWidth() { const f = sk && sk.sels.filter(function (e) { return e.strokeWidth && e.type !== "text"; })[0]; return f ? f.strokeWidth : sk.width; }
function skColorUI() {
  const chip = document.getElementById("skColorChip");
  const shown = skShownColor();
  if (chip) chip.style.background = skInk(shown);
  const hex = document.getElementById("skHex");
  if (hex) hex.textContent = shown;
  if (sk && !skPicking) skPickerFrom(shown);
  Array.prototype.forEach.call(sketchEl.querySelectorAll("[data-color]"), function (b) {
    b.classList.toggle("on", sk && b.dataset.color.toLowerCase() === String(shown).toLowerCase());
  });
}
function skSetColor(c) {
  sk.color = c;
  skWidthUI();
  if (sk.sels.length) {
    sk.sels.forEach(function (el) {
      el.strokeColor = c;
      if (el.fill && el.fill !== "transparent") el.fill = c;
    });
    skChanged(); skDraw();
  }
  skPushRecent(c);
  skColorUI();
}
function skSetWidth(wd) {
  sk.width = wd;
  if (sk.sels.length) {
    sk.sels.forEach(function (el) { if (el.type !== "text") el.strokeWidth = wd; });
    skChanged(); skDraw();
  }
  Array.prototype.forEach.call(sketchEl.querySelectorAll("[data-width]"), function (b) { b.classList.toggle("on", parseInt(b.dataset.width, 10) === wd); });
}
function skDeleteSel() {
  if (!sk.sels.length) return;
  skSnapshot();
  const doomed = sk.sels.slice();
  sk.elements = sk.elements.filter(function (e) {
    if (doomed.indexOf(e) !== -1) return false;
    if (skIsConnector(e)) {                       /* a link with nothing left to hold goes too */
      if ((e.fromId && doomed.indexOf(skFindEl(e.fromId)) !== -1) ||
          (e.toId && doomed.indexOf(skFindEl(e.toId)) !== -1)) return false;
    }
    return true;
  });
  skSelect([]); skChanged(); skDraw();
}
function skUndo() {
  if (!sk.undo.length) return;
  (sk.redo = sk.redo || []).push(JSON.stringify(sk.elements));
  sk.elements = JSON.parse(sk.undo.pop()); skSelect([]); sk.navHist = true; skChanged(); sk.navHist = false; skDraw();
}
function skRedo() {
  if (!sk.redo || !sk.redo.length) return;
  sk.undo.push(JSON.stringify(sk.elements));
  sk.elements = JSON.parse(sk.redo.pop()); skSelect([]); sk.navHist = true; skChanged(); sk.navHist = false; skDraw();
}
function skExport() {
  const blob = new Blob([JSON.stringify(skToExcalidraw(sk.elements), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  const n = findNote(sk.noteId);
  a.href = URL.createObjectURL(blob); a.download = sanitizeName(sk.file ? sk.file.split("/").pop() : n ? n.title : "sketch") + ".excalidraw";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

/* ---- pointer ---- */
function skOnDown(e) {
  if (!sk) return;
  const pt = evLocal(skCanvas, e), sx = pt[0], sy = pt[1], wp = skToWorld(sx, sy), wx = wp[0], wy = wp[1];
  if (e.button === 1 || (e.button === 0 && e.altKey)) { sk.down = { pan: true, sx: sx, sy: sy, cx: sk.cam.x, cy: sk.cam.y }; e.preventDefault(); return; }
  if (e.button !== 0) return;
  if (sk.tool === "select") {
    const lh = skLinkHandleAt(sx, sy);            /* a link's bend handles beat anything under them */
    if (lh && lh.kind === "seg") {
      skSnapshot();
      const cur0 = lh.el.segs && lh.el.segs[lh.i] && lh.el.segs[lh.i][0] === lh.ax ? lh.el.segs[lh.i][1] : 0;
      sk.down = { segDrag: true, el: lh.el, i: lh.i, ax: lh.ax, start: cur0, from: lh.ax === 0 ? wx : wy, moved: false };
      sk.segActive = { id: lh.el.id, i: lh.i, ax: lh.ax };
      skDraw();
      return;
    }
    if (lh) {
      skSnapshot();
      const idx = lh.kind === "mid" ? skInsertLinkPoint(lh.el, lh.i, wx, wy) : lh.i;
      sk.down = { bend: true, el: lh.el, i: idx, moved: lh.kind === "mid" };
      skDraw();
      return;
    }
    const handle = skHandleAt(sx, sy);            /* a resize grip beats anything under it */
    if (handle) {
      skSnapshot();
      sk.down = { resize: handle, wx: wx, wy: wy, box: skSelBox(),
        start: sk.sels.filter(function (el) { return !skIsConnector(el); }).map(function (el) {
          const b = skBox(el), st = { el: el, x: b.x, y: b.y, w: b.w, h: b.h, font: el.fontSize || 20 };
          if (el.points && el.points.length) {
            st.points = el.points.map(function (q) { return [q[0], q[1]]; });
            st.minx = Math.min.apply(null, st.points.map(function (q) { return q[0]; }));
            st.miny = Math.min.apply(null, st.points.map(function (q) { return q[1]; }));
          }
          return st;
        }) };
      return;
    }
    const stack = skHitAll(wx, wy);
    let hit = stack[0];
    if (hit && e.altKey && stack.length > 1) {  /* Alt cycles down through overlapping shapes */
      const cur = stack.indexOf(sk.sel);
      hit = stack[(cur + 1) % stack.length];
    }
    if (e.shiftKey) { if (hit) { skSelAdd(hit); skDraw(); } return; }
    if (hit) {
      if (sk.sels.indexOf(hit) === -1) skSelect([hit]);
      skSnapshot();
      sk.down = { move: true, wx: wx, wy: wy };
      skGroupsAtDragStart(sk.down);
    } else {
      skSelect([]);
      sk.down = { marquee: true, wx: wx, wy: wy };
      sk.marquee = { x: wx, y: wy, w: 0, h: 0 };
    }
    skDraw(); return;
  }
  if (sk.tool === "text") {
    const shift = e.shiftKey;
    Dialogs.prompt("Text", "").then(function (t) {
      if (!t || !t.trim() || !sk) return;
      skSnapshot();
      const te = skBase("text", wx, wy, sk.color, 1);
      te.text = t; te.originalText = t; te.fontSize = 20; te.fontFamily = 1; te.textAlign = "left"; te.verticalAlign = "top"; te.lineHeight = 1.25; te.baseline = 18; te.containerId = null;
      const tb = skBox(te); te.width = tb.w; te.height = tb.h;
      te.fontSize = sk.textSize;
      sk.elements.push(te); skSelect([te]); skChanged(); skDraw();
      if (!sk.sticky && !shift) skSetTool("select");
    });
    return;
  }
  if (sk.tool === "stencil") {                 /* click drops a stencil, nudged clear of its neighbours */
    skPlaceStencil(sk.stencil, wx, wy);
    if (!sk.sticky && !e.shiftKey) skSetTool("select");   /* one shape, then straight back to selecting */
    return;
  }
  if (sk.tool === "hand") {                    /* the Hand tool pans, like the middle button */
    sk.down = { pan: true, sx: sx, sy: sy, cx: sk.cam.x, cy: sk.cam.y };
    skCanvas.style.cursor = "grabbing";
    return;
  }
  if (sk.tool === "eraser") {                  /* erase what you click, and anything you drag across */
    skSnapshot();
    sk.down = { erase: true, n: 0 };
    skEraseAt(wx, wy);
    return;
  }

  if (sk.tool === "splitter") {                /* click to place a junction */
    skPlaceStencil("splitter", wx, wy);
    if (!sk.sticky) skSetTool("select");
    return;
  }
  if (sk.tool === "connect") {                 /* drag from one shape to another */
    let src = skHit(wx, wy), split = false;
    /* starting on a line taps into it: a splitter goes in at that spot, the line runs
       through it, and the new connector branches from it */
    let tapped = null;
    if (src && skIsConnector(src) && skFindEl(src.fromId) && skFindEl(src.toId)) { skSnapshot(); tapped = src; src = skSplitLink(src, wx, wy); split = true; }
    if (!src || skIsConnector(src)) return;
    skSnapshot();
    const cn = skBase("arrow", wx, wy, sk.color, sk.width);
    cn.curve = sk.linkStyle || "circuit";
    cn.points = [[0, 0], [0, 0]];
    cn.fromId = src.id; cn.toId = null; cn.label = "";
    if (tapped) {                                /* a branch looks like the line it taps */
      cn.strokeColor = tapped.strokeColor; cn.strokeWidth = tapped.strokeWidth;
      cn.strokeStyle = tapped.strokeStyle; cn.curve = tapped.curve || cn.curve;
    }
    if (split) sk.undo.pop();                    /* one undo step covers the split and the new line */
    sk.drawing = cn; sk.down = { connect: true, wx: wx, wy: wy, split: split };
    return;
  }

  skSnapshot();
  const el = skBase(sk.tool === "pen" ? "freedraw" : sk.tool === "diamond" ? "stencil" : sk.tool, wx, wy, sk.color, sk.width);
  if (sk.tool === "diamond") { el.shape = "fc-diamond"; el.label = ""; }
  if (el.type === "arrow" || el.type === "line") el.curve = sk.linkStyle || "circuit";   /* drawn like a rectangle, kept as a flowchart diamond */
  if (el.type === "rectangle" || el.type === "ellipse" || el.type === "stencil") el.fill = sk.fill ? sk.color : "transparent";
  if (el.type === "freedraw") { el.points = [[0, 0]]; el.pressures = []; el.simulatePressure = true; el.lastCommittedPoint = null; }
  else if (el.type === "line" || el.type === "arrow") {
    el.points = [[0, 0], [0, 0]]; el.startBinding = null; el.endBinding = null; el.lastCommittedPoint = null;
    el.startArrowhead = null; el.endArrowhead = el.type === "arrow" ? "arrow" : null;
  }
  sk.drawing = el; sk.down = { draw: true, wx: wx, wy: wy };
}
/* the canvas itself: press, hover, double-click, wheel. The drag and release halves
   live on the window below, so a drag that leaves the canvas still finishes properly. */
skCanvas.addEventListener("mousedown", skOnDown);
skCanvas.addEventListener("mousemove", skOnMove);
skCanvas.addEventListener("dblclick", skOnDbl);
skCanvas.addEventListener("wheel", skOnWheel, { passive: false });
skCanvas.addEventListener("contextmenu", function (e) { if (sk) e.preventDefault(); });
skCanvas.addEventListener("dragover", function (e) {
  if (sk && Array.prototype.indexOf.call(e.dataTransfer.types, "text/x-cf-sketch") !== -1) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
});
skCanvas.addEventListener("drop", function (e) {             /* a drawing from the library: a copy where it lands */
  const path = sk && e.dataTransfer.getData("text/x-cf-sketch");
  if (!path) return;
  e.preventDefault();
  const wp = evWorld(skCanvas, e, skToWorld);
  skInsertSketchFile(path, wp[0], wp[1]);
});

window.addEventListener("mousemove", function (e) {
  if (!sk || !sk.down) return;
  const pt = evLocal(skCanvas, e), sx = pt[0], sy = pt[1], wp = skToWorld(sx, sy), wx = wp[0], wy = wp[1];
  const d = sk.down;
  if (d.pan) { sk.cam.x = d.cx - (sx - d.sx) / sk.cam.k; sk.cam.y = d.cy - (sy - d.sy) / sk.cam.k; skDraw(); return; }
  if (d.marquee) {
    sk.marquee = { x: Math.min(d.wx, wx), y: Math.min(d.wy, wy), w: Math.abs(wx - d.wx), h: Math.abs(wy - d.wy) };
    skDraw(); return;
  }
  if (d.resize) {
    const b0 = d.box; let nx = b0.x, ny = b0.y, nw = b0.w, nh = b0.h;
    if (d.resize.indexOf("e") !== -1) nw = Math.max(12, wx - b0.x);
    if (d.resize.indexOf("s") !== -1) nh = Math.max(12, wy - b0.y);
    if (d.resize.indexOf("w") !== -1) { nw = Math.max(12, b0.x + b0.w - wx); nx = b0.x + b0.w - nw; }
    if (d.resize.indexOf("n") !== -1) { nh = Math.max(12, b0.y + b0.h - wy); ny = b0.y + b0.h - nh; }
    if (e.shiftKey && b0.w && b0.h) {           /* Shift keeps the proportions */
      const ratio = Math.min(nw / b0.w, nh / b0.h);
      nw = b0.w * ratio; nh = b0.h * ratio;
      if (d.resize.indexOf("w") !== -1) nx = b0.x + b0.w - nw;
      if (d.resize.indexOf("n") !== -1) ny = b0.y + b0.h - nh;
    }
    const fx = b0.w ? nw / b0.w : 1, fy = b0.h ? nh / b0.h : 1;
    applyResize(d, fx, fy, nx, ny);
    d.moved = true;
    skDraw(); return;
  }
  if (d.move) {
    const dx = wx - d.wx, dy = wy - d.wy;
    d.wx = wx; d.wy = wy;
    const movers = sk.sels.concat(d.carry || []);
    movers.forEach(function (el) { skMoveEl(el, dx, dy); });
    sk.guides = null;
    if (sk.snap && !e.altKey) {          /* hold Alt to place freely */
      if (!d.cand) d.cand = snapCandidates(movers);
      const adj = snapAdjust(skSelBox(), d.cand);
      if (adj.dx || adj.dy) movers.forEach(function (el) { skMoveEl(el, adj.dx, adj.dy); });
      if (adj.gx !== null || adj.gy !== null) sk.guides = { x: adj.gx, y: adj.gy };
    }
    d.moved = true; skDraw(); return;
  }
  if (d.connect && sk.drawing) {
    sk.drawing.points[1] = [wx - sk.drawing.x, wy - sk.drawing.y];
    const over = skHit(wx, wy);
    sk.hoverTarget = over && over !== skFindEl(sk.drawing.fromId) && !skIsConnector(over) ? over : null;
    skDraw();
    return;
  }
  if (d.erase) { skEraseAt(wx, wy); return; }
  if (d.segDrag) {
    let off = d.start + ((d.ax === 0 ? wx : wy) - d.from);
    if (!e.altKey) off = Math.round(off / 4) * 4;          /* small steps; Alt for free movement */
    d.el.segs = d.el.segs || {};
    d.el.segs[d.i] = [d.ax, off];
    d.moved = true; skDraw(); return;
  }
  if (d.bend) {
    const bp = skBendSnap(d.el, d.i, wx, wy, e.altKey);
    skSetLinkPoint(d.el, d.i, bp[0], bp[1]); d.moved = true; skDraw(); return;
  }
  if (d.draw && sk.drawing) {
    const el = sk.drawing;
    if (el.type === "freedraw") el.points.push([wx - el.x, wy - el.y]);
    else if (el.points) el.points[1] = [wx - el.x, wy - el.y];
    else { el.width = wx - el.x; el.height = wy - el.y; }
    skDraw();
  }
});
window.addEventListener("mouseup", function () {
  if (!sk || !sk.down) return;
  const d = sk.down; sk.down = null;
  if (d.erase) { if (d.n) skChanged(); else sk.undo.pop(); skDraw(); return; }
  if (d.segDrag) { if (d.moved) skChanged(); else sk.undo.pop(); skDraw(); return; }
  if (d.bend) { if (d.moved) { skFitLinkBox(d.el); skChanged(); } else sk.undo.pop(); skDraw(); return; }
  if (d.pan && sk.tool === "hand") skCanvas.style.cursor = "grab";
  if (d.connect && sk.drawing) {
    const cn = sk.drawing; sk.drawing = null;
    const tgt = sk.hoverTarget; sk.hoverTarget = null;
    if (!tgt) {                                   /* dropped on nothing: discard the new line */
      if (d.split) { skChanged(); skDraw(); return; }  /* ...but a tapped line keeps its splitter */
      sk.undo.pop(); skDraw(); return;
    }
    cn.toId = tgt.id;
    sk.elements.push(cn); skSelect([cn]);
    skChanged(); skDraw();
    return;
  }
  if (d.marquee) {
    const r = sk.marquee; sk.marquee = null;
    if (r && (r.w > 3 || r.h > 3)) {
      skSelect(sk.elements.filter(function (el) {
        const b = skBox(el);
        return b.x + b.w >= r.x && b.x <= r.x + r.w && b.y + b.h >= r.y && b.y <= r.y + r.h;
      }));
    }
    skDraw(); return;
  }
  if (d.resize) { if (d.moved) skChanged(); else sk.undo.pop(); skDraw(); return; }
  if (d.move) { sk.guides = null; if (d.moved) skGroupsAtDragEnd(d); skDraw(); if (d.moved) skChanged(); else sk.undo.pop(); return; }
  if (d.draw && sk.drawing) {
    const el = sk.drawing; sk.drawing = null;
    const b = skBox(el);
    if (b.w < 2 && b.h < 2 && el.type !== "freedraw") { sk.undo.pop(); skDraw(); return; }
    if (el.type === "rectangle" || el.type === "ellipse" || el.type === "stencil") {   /* normalise negative drags */
      if (el.width < 0) { el.x += el.width; el.width = -el.width; }
      if (el.height < 0) { el.y += el.height; el.height = -el.height; }
    }
    if (el.points) { el.width = b.w; el.height = b.h; }
    sk.elements.push(el);
    skSelect(sk.tool === "select" ? [el] : []);
    skChanged(); skDraw();
  }
});
function skOnWheel(e) {
  if (!sk) return;
  e.preventDefault();
  const rect = skCanvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  if (e.ctrlKey || e.metaKey) {
    const before = skToWorld(sx, sy);
    sk.cam.k = Math.max(0.2, Math.min(6, sk.cam.k * Math.exp(-e.deltaY * 0.0012)));
    const w = rect.width, h = rect.height;
    sk.cam.x = before[0] - (sx - w / 2) / sk.cam.k; sk.cam.y = before[1] - (sy - h / 2) / sk.cam.k;
  } else { sk.cam.x += e.deltaX / sk.cam.k; sk.cam.y += e.deltaY / sk.cam.k; }
  skDraw();
}
