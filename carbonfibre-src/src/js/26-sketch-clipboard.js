/* ---- clipboard: copy, cut and paste shapes, including links between them ---- */

let skClip = [];          /* falls back to this when the system clipboard is unavailable */

function skSerialiseSel() {
  if (!sk.sels.length) return null;
  const picked = sk.sels.slice();
  const ids = {};
  picked.forEach(function (el) { ids[el.id] = 1; });
  return {
    carbonfibre: "sketch-clip", v: 1,
    elements: picked.map(function (el) {
      const c = JSON.parse(JSON.stringify(el));
      /* a link is only worth keeping if both ends came along */
      if (c.fromId && !ids[c.fromId]) c.fromId = null;
      if (c.toId && !ids[c.toId]) c.toId = null;
      return c;
    })
  };
}
function skCopy() {
  const payload = skSerialiseSel();
  if (!payload) return;
  skClip = payload.elements;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(JSON.stringify(payload)).catch(function () {});   /* the board's own copy still works */
  } catch (e) {}
}
function skCut() {
  if (!sk.sels.length) return;
  skCopy();
  skDeleteSel();          /* was skDelete(), which does not exist: Cut copied, then threw before deleting */
}
/* offset the copies and rewire any links so they point at the new elements */
function skPasteElements(list, atCursor) {
  if (!list || !list.length) return;
  skSnapshot();
  const map = {}, copies = list.map(function (el) {
    const c = JSON.parse(JSON.stringify(el));
    const old = c.id;
    c.id = skId();
    map[old] = c.id;
    return c;
  });
  let dx = 20, dy = 20;
  if (atCursor && sk.lastPointer) {
    let b = null;
    copies.forEach(function (c) {
      const bb = skBox(c);
      if (!b) b = { x: bb.x, y: bb.y }; else { b.x = Math.min(b.x, bb.x); b.y = Math.min(b.y, bb.y); }
    });
    dx = skSnapTo(sk.lastPointer[0]) - b.x;
    dy = skSnapTo(sk.lastPointer[1]) - b.y;
  }
  copies.forEach(function (c) {
    c.x += dx; c.y += dy;
    if (c.via) c.via = c.via.map(function (v) { return [v[0] + dx, v[1] + dy]; });
    if (c.fromId) c.fromId = map[c.fromId] || null;
    if (c.toId) c.toId = map[c.toId] || null;
    sk.elements.push(c);
  });
  skSelect(copies);
  skChanged(); skDraw();
}
function skPaste(atCursor) {
  let done = false;
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (txt) {
        let parsed = null;
        try { parsed = JSON.parse(txt); } catch (e) {}
        if (parsed && parsed.carbonfibre === "sketch-clip" && parsed.elements) skPasteElements(parsed.elements, atCursor);
        else if (typeof txt === "string" && txt.trim()) {          /* plain text becomes a text element */
          skSnapshot();
          const pt = sk.lastPointer || [0, 0];
          const te = skBase("text", skSnapTo(pt[0]), skSnapTo(pt[1]), sk.color, sk.width);
          te.text = te.originalText = txt.trim().slice(0, 400);
          te.fontSize = sk.textSize;
          te.width = te.text.length * te.fontSize * 0.55; te.height = te.fontSize * 1.25;
          sk.elements.push(te); skSelect([te]); skChanged(); skDraw();
        } else skPasteElements(skClip, atCursor);
      }).catch(function () { skPasteElements(skClip, atCursor); });
      done = true;
    }
  } catch (e) {}
  if (!done) skPasteElements(skClip, atCursor);
}

/* ---- bulk rename: find and replace across the labels of everything selected ---- */

function skLabelGet(el) { return el.type === "text" ? (el.text || "") : (el.label || ""); }
function skLabelSet(el, v) {
  if (el.type === "text") {
    el.text = el.originalText = v;
    const b = skBox(el);
    el.width = b.w; el.height = b.h;
  } else el.label = v;
}
function skRenameTargets() {
  const list = sk.sels.length ? sk.sels : sk.elements;
  return list.filter(function (el) {
    return el.type === "text" || el.type === "stencil" || skIsConnector(el);
  });
}
/* {n} counts up, $1 style backreferences work when the pattern is a regex */
function skRenamePreview() {
  const find = document.getElementById("skRnFind").value;
  const repl = document.getElementById("skRnRepl").value;
  const useRx = document.getElementById("skRnRegex").checked;
  const ci = document.getElementById("skRnCase").checked;
  const start = parseInt(document.getElementById("skRnStart").value, 10) || 1;
  const err = document.getElementById("skRnErr");
  const rows = document.getElementById("skRnRows");
  const targets = skRenameTargets();
  let rx = null;
  err.textContent = "";
  if (find) {
    try { rx = new RegExp(useRx ? find : find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ci ? "gi" : "g"); }
    catch (e) { err.textContent = "Pattern: " + e.message; rows.innerHTML = ""; return null; }
  }
  const out = targets.map(function (el, i) {
    const before = skLabelGet(el);
    let after = find ? before.replace(rx, repl) : repl;
    after = after.replace(/\{n\}/g, String(start + i));
    return { el: el, before: before, after: after };
  });
  rows.innerHTML = out.slice(0, 40).map(function (r) {
    return '<div class="rn-row"><span class="rn-before">' + esc(r.before || "(blank)") + "</span>" +
      '<span class="rn-arrow">\u2192</span><span class="rn-after">' + esc(r.after || "(blank)") + "</span></div>";
  }).join("") + (out.length > 40 ? '<div class="rn-more">+' + (out.length - 40) + " more</div>" : "");
  document.getElementById("skRnCount").textContent =
    out.length + (out.length === 1 ? " label" : " labels") + (sk.sels.length ? " selected" : " on the board");
  return out;
}
function skRenameOpen() {
  document.getElementById("skRename").classList.add("show");
  skRenamePreview();
  document.getElementById("skRnFind").focus();
}
function skRenameClose() {
  /* text selected in the dialog's preview must not linger, or the board's Ctrl+C would copy it */
  try { const gs = window.getSelection(); if (gs && document.getElementById("skRename").contains(gs.anchorNode)) gs.removeAllRanges(); } catch (e) {}
  document.getElementById("skRename").classList.remove("show");
}
function skRenameApply() {
  const out = skRenamePreview();
  if (!out || !out.length) return;
  skSnapshot();
  out.forEach(function (r) { if (r.after !== r.before) skLabelSet(r.el, r.after); });
  skChanged(); skDraw();
  skRenameClose();
}

function skRename(hit) {
  if (!hit) return;
  /* edit in the panel's label box, where copy and paste behave normally */
  if (sk.sels.length !== 1 || sk.sels[0] !== hit) skSelect([hit]);
  if (skFocusLabel()) return;
  if (hit.type === "text") {
    Dialogs.prompt("Text", hit.text).then(function (t) {
      if (t !== null) { skSnapshot(); hit.text = hit.originalText = t; const b = skBox(hit); hit.width = b.w; hit.height = b.h; skChanged(); skDraw(); }
    });
    return;
  }
  Dialogs.prompt(hit.type === "stencil" ? "Label" : "Label (blank to clear)", hit.label || "").then(function (lbl) {
    if (lbl !== null) { skSnapshot(); hit.label = lbl; skChanged(); skDraw(); }
  });
}

function skOnMove(e) {
  if (!sk) return;
  sk.lastPointer = evWorld(skCanvas, e, skToWorld);
  /* hovering a shape highlights what it connects to */
  if (!sk.down && sk.tool === "select") {
    const hit = skHit(sk.lastPointer[0], sk.lastPointer[1]);
    const hid = hit && hit.type === "stencil" ? hit.id : null;
    if (hid !== sk.hoverId) { sk.hoverId = hid; skDraw(); }
  }
}
function skOnDbl(e) {
  if (!sk) return;
  const dp = evLocal(skCanvas, e), lh = skLinkHandleAt(dp[0], dp[1]);
  if (lh && lh.kind === "pt") {
    const n = skLinkPoints(lh.el).length;
    if (skIsConnector(lh.el) || n > 2) { skSnapshot(); skRemoveLinkPoint(lh.el, lh.i); skFitLinkBox(lh.el); skChanged(); skDraw(); }
    return;
  }
  const wp = evWorld(skCanvas, e, skToWorld);
  const sh = lh;
  if (sh && sh.kind === "seg" && sh.el.segs && sh.el.segs[sh.i]) {      /* back to its automatic place */
    skSnapshot(); delete sh.el.segs[sh.i]; if (!Object.keys(sh.el.segs).length) delete sh.el.segs;
    skChanged(); skDraw(); return;
  }
  const hit = skHit(wp[0], wp[1]);
  if (!hit) return;
  skSelect([hit]);          /* double-click selects it too, so the next action lands on it */
  skSetTool("select");
  skRename(hit);
}

/* ---- diagram templates: common infrastructure layouts, built from stencils and
   bound connectors so every piece stays editable after it lands ---- */



/* The ten patterns you meet most often in system design.
   n: [id, shape, label, x, y, role]   l: [from, to, label]   z: [label, x, y, w, h] */


/* turn a template into real elements, offset by (ox, oy), with fresh ids */
/* A template is only structure: groups, nodes in reading order, and links. It is laid out
   by the same core as Tidy - twice, the second time by Tidy's own rules - so a fresh
   template is already exactly what Tidy would make of it, and tidying it changes nothing. */


/* drop a template beside whatever is already on the board, or in the middle of the view */


/* thumbnails, drawn with the board's own renderer into small canvases */




/* ---- stencil palette: each button previews its own shape ---- */
function skBuildPalette() {
  const wrap = document.getElementById("skPalette");
  if (wrap.dataset.built) return;
  wrap.dataset.built = "1";
  let lastGroup = null;
  SK_STENCILS.forEach(function (st) {
    if (st.group !== lastGroup) {
      const h = document.createElement("div");
      h.className = "sk-lib-h"; h.textContent = st.group;
      wrap.appendChild(h); lastGroup = st.group;
    }
    const b = document.createElement("button");
    b.className = "sk-stencil";
    b.draggable = true;
    b.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text/x-cf-stencil", st.id); e.dataTransfer.effectAllowed = "copy"; });
    b.dataset.stencil = st.id;
    b.title = st.label + " (" + st.group + ")";
    const c = document.createElement("canvas");
    c.width = 44; c.height = 36;
    const x = c.getContext("2d");
    x.strokeStyle = skInk("#b9bcc4"); x.fillStyle = skInk("#b9bcc4");
    x.lineWidth = 1.2; x.lineCap = "round"; x.lineJoin = "round";
    skStencilPath(x, st.id, 44, 36, false);
    const lbl = document.createElement("span");
    lbl.textContent = st.label;
    b.appendChild(c); b.appendChild(lbl);
    b.addEventListener("click", function () {
      sk.stencil = st.id;
      skSetTool("stencil");
      Array.prototype.forEach.call(wrap.querySelectorAll(".sk-stencil"), function (o) { o.classList.toggle("on", o === b); });
    });
    wrap.appendChild(b);
  });
}
function skWidthUI() {
  const wv = skShownWidth();
  document.getElementById("skWidthRange").value = wv;
  document.getElementById("skWidthNum").textContent = wv;
  const d = document.getElementById("skWidthDot"), px = Math.max(2, Math.min(20, wv));
  d.style.width = px + "px"; d.style.height = px + "px"; d.style.background = skInk(skShownColor());
}

/* toolbar wiring */
document.getElementById("skWidthRange").addEventListener("input", function () {
  sk.width = parseInt(this.value, 10);
  skWidthUI();
  if (sk.sels.length) { skSnapshot(); sk.sels.forEach(function (el) { el.strokeWidth = sk.width; }); skChanged(); skDraw(); }
});
Array.prototype.forEach.call(document.querySelectorAll("[data-order]"), function (b) {
  b.addEventListener("click", function () { skOrder(b.dataset.order); });
});
document.getElementById("skTextRange").addEventListener("input", function () { skSetTextSize(parseInt(this.value, 10)); });
document.getElementById("skRnCancel").addEventListener("click", skRenameClose);
document.getElementById("skRnApply").addEventListener("click", skRenameApply);
["skRnFind", "skRnRepl", "skRnStart"].forEach(function (id) {
  document.getElementById(id).addEventListener("input", skRenamePreview);
  document.getElementById(id).addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); skRenameApply(); }
    if (e.key === "Escape") { e.preventDefault(); skRenameClose(); }
  });
});
["skRnRegex", "skRnCase"].forEach(function (id) {
  document.getElementById(id).addEventListener("change", function () {
    this.parentNode.classList.toggle("on", this.checked);
    skRenamePreview();
  });
});
document.getElementById("skRename").addEventListener("mousedown", function (e) {
  if (e.target === this) skRenameClose();
});
document.getElementById("skSnap").addEventListener("click", function () {
  sk.snap = !sk.snap; this.classList.toggle("on", sk.snap);
  storeSet("carbonfibre-sk-snap", sk.snap ? "1" : "0");
});
document.getElementById("skSticky").addEventListener("click", function () {
  sk.sticky = !sk.sticky; this.classList.toggle("on", sk.sticky);
});
document.getElementById("skFill").addEventListener("click", function () {
  sk.fill = !sk.fill;
  this.classList.toggle("on", sk.fill);
  if (sk.sels.length) { skSnapshot(); sk.sels.forEach(function (el) { el.fill = sk.fill ? sk.color : "transparent"; }); skChanged(); skDraw(); }
});
Array.prototype.forEach.call(sketchEl.querySelectorAll("[data-tool]"), function (b) { b.addEventListener("click", function () { skSetTool(b.dataset.tool); }); });
skBuildColorUI();
/* ---- the colour picker, built into the page ----
   Edge closed its native colour picker as soon as a colour was clicked, and a popover
   around it made things worse. This one is the page's own: a saturation and brightness
   square, a hue strip and a hex box. Dragging previews on the selection; letting go
   commits once (one undo step, one entry in Recent). */
let skPicking = false; const skHSV = { h: 220, s: 0.5, v: 0.8 };
function skHexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function skRgbToHex(r, g, b) { return "#" + [r, g, b].map(function (x) { return ("0" + Math.round(x).toString(16)).slice(-2); }).join(""); }
function skRgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
}
function skHsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function skPickerHex() { const c = skHsvToRgb(skHSV.h, skHSV.s, skHSV.v); return skRgbToHex(c[0], c[1], c[2]); }
function skPickerRender() {
  const sv = document.getElementById("skSV"); if (!sv) return;
  sv.style.backgroundColor = "hsl(" + Math.round(skHSV.h) + ", 100%, 50%)";
  const dot = document.getElementById("skSVDot");
  dot.style.left = (skHSV.s * 100) + "%"; dot.style.top = ((1 - skHSV.v) * 100) + "%";
  document.getElementById("skHueDot").style.left = (skHSV.h / 360 * 100) + "%";
  const hx = document.getElementById("skHexIn");
  if (document.activeElement !== hx) hx.value = skPickerHex();
}
function skPickerFrom(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) return;
  const c = skHexToRgb(hex), hsv = skRgbToHsv(c[0], c[1], c[2]);
  if (hsv.s > 0.02 && hsv.v > 0.02) skHSV.h = hsv.h;    /* greys have no hue: keep the last one */
  skHSV.s = hsv.s; skHSV.v = hsv.v;
  skPickerRender();
}
function skCommitColor(hex) {
  skPicking = false;
  sk.color = hex;
  if (sk.sels.length) skChanged();
  skPushRecent(hex);
  skColorUI();
}
/* drag inside a control; values come from the pointer position, clamped to the control */
function skPickerDrag(el, onMove) {
  el.addEventListener("pointerdown", function (e) {
    if (!sk) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    const move = function (ev) {
      const r = el.getBoundingClientRect();
      onMove(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)));
      skPickerRender();
      skPreviewColor(skPickerHex());
    };
    const up = function () {
      el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      skCommitColor(skPickerHex());
    };
    move(e);
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  });
}
function skPreviewColor(c) {
  if (!skPicking) { skPicking = true; if (sk.sels.length) skSnapshot(); }
  sk.color = c;
  sk.sels.forEach(function (el) {
    el.strokeColor = c;
    if (el.fill && el.fill !== "transparent") el.fill = c;
  });
  const chip = document.getElementById("skColorChip"); if (chip) chip.style.background = skInk(c);
  const hex = document.getElementById("skHex"); if (hex) hex.textContent = c;
  skDraw();
}
skPickerDrag(document.getElementById("skSV"), function (x, y) { skHSV.s = x; skHSV.v = 1 - y; });
skPickerDrag(document.getElementById("skHue"), function (x) { skHSV.h = Math.min(359.9, x * 360); });
(function () {
  const hx = document.getElementById("skHexIn");
  const norm = function (v) { v = v.trim(); if (v.charAt(0) !== "#") v = "#" + v; return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null; };
  hx.addEventListener("input", function () { const v = norm(hx.value); if (v && sk) { skPickerFrom(v); skPreviewColor(v); } });
  hx.addEventListener("change", function () { const v = norm(hx.value); if (v && sk) skCommitColor(v); else skPickerRender(); });
  hx.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); hx.blur(); } });
})();
document.getElementById("skDup").addEventListener("click", function () { if (sk) skDuplicate(); });
