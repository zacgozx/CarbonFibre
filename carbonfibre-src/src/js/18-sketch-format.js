/* ============================================================
   Drawing format.
   In notes, drawings are stored lean: fields that only matter to excalidraw.com (random
   seeds, version nonces, timestamps) and fields left at their defaults are dropped, and
   numbers are rounded - about half the size, with nothing CarbonFibre uses lost. Loading
   fills the defaults back in, so older, full-sized drawings open exactly as before.
   ============================================================ */
var SK_DEFAULTS = { angle: 0, backgroundColor: "transparent", fillStyle: "solid", roughness: 0, opacity: 100,
  frameId: null, roundness: null, isDeleted: false, boundElements: null, link: null, locked: false, strokeStyle: "solid" };
var SK_DROP = { seed: 1, version: 1, versionNonce: 1, updated: 1 };
function skRound(v, places) { var f = Math.pow(10, places); return Math.round(v * f) / f; }
function skRoundPts(a, places) { return a.map(function (q) { return [skRound(q[0], places), skRound(q[1], places)]; }); }
function skCompactEl(el) {
  var out = {};
  Object.keys(el).forEach(function (k) {
    var v = el[k];
    if (SK_DROP[k] || v === undefined) return;
    if (k === "groupIds" && (!v || !v.length)) return;
    if (Object.prototype.hasOwnProperty.call(SK_DEFAULTS, k) && v === SK_DEFAULTS[k]) return;
    if (typeof v === "number" && (k === "x" || k === "y" || k === "width" || k === "height")) v = skRound(v, 2);
    else if ((k === "points" || k === "via") && Array.isArray(v)) v = skRoundPts(v, 1);
    else if (k === "lanes" && Array.isArray(v)) v = v.map(function (n) { return skRound(n, 3); });
    else if (k === "lanesAbs" && Array.isArray(v)) v = v.map(function (n) { return skRound(n, 1); });
    else if (k === "labelScale" && typeof v === "number") v = skRound(v, 3);
    out[k] = v;
  });
  return out;
}
function skFullEl(el) {
  var full = { groupIds: [], seed: Math.floor(Math.random() * 1e9), version: 1, versionNonce: Math.floor(Math.random() * 1e9), updated: Date.now() };
  Object.keys(SK_DEFAULTS).forEach(function (k) { full[k] = SK_DEFAULTS[k]; });
  Object.keys(el).forEach(function (k) { full[k] = el[k]; });
  return full;
}

/* ---- import: drawings made at excalidraw.com (or exported from here) ----
   Excalidraw ties an arrow to its shapes with startBinding/endBinding, and puts labels in
   separate text elements bound by containerId. Those become CarbonFibre links (attached,
   routed live) and labels. Anything exported from CarbonFibre carries its original form
   in customData, so a round trip brings back icons, styles and layout hints exactly. */
function skImportExcalidraw(els) {
  var byId = {}, drop = {};
  els.forEach(function (e) { byId[e.id] = e; });
  var out = els.map(function (e) {
    var cf = e.customData && e.customData.carbonfibre;
    if (cf) {                                             /* our own export: restore the original */
      var back = skFullEl(cf.el);
      (e.boundElements || []).forEach(function (b) { if (b.type === "text") drop[b.id] = 1; });
      (cf.extras || []).forEach(function (id) { drop[id] = 1; });
      return back;
    }
    return e;
  });
  out.forEach(function (e) {
    if (e.type !== "arrow" && e.type !== "line") return;
    if (e.fromId || e.toId) return;
    var sb = e.startBinding && e.startBinding.elementId, eb = e.endBinding && e.endBinding.elementId;
    if (!sb || !eb || !byId[sb] || !byId[eb]) return;
    e.fromId = sb; e.toId = eb;
    var pts = e.points || [];
    if (pts.length > 2) e.via = pts.slice(1, -1).map(function (q) { return [e.x + q[0], e.y + q[1]]; });
    e.curve = e.roundness && e.roundness.type === 2 ? "curved" : "sharp";
    e.points = [[0, 0], [0, 0]];
    (e.boundElements || []).forEach(function (b) {
      var t = byId[b.id];
      if (b.type === "text" && t && t.containerId === e.id) { e.label = t.text; drop[t.id] = 1; }
    });
  });
  return out.filter(function (e) { return !drop[e.id]; });
}

/* ---- export: a file excalidraw.com opens as it looks here ----
   Icons become images (drawn by the same code as the board), flowchart shapes become
   native rectangles, diamonds and ellipses with their labels bound inside, links get
   their routed points and real bindings (so they stay attached when moved there), link
   labels become bound text, and status dots become small grouped circles. */
function skIconPng(el) {
  var w = Math.max(8, Math.abs(el.width)), h = Math.max(8, Math.abs(el.height)), scale = 3;
  var cv = document.createElement("canvas");
  cv.width = Math.ceil(w * scale); cv.height = Math.ceil(h * scale);
  var ctx = cv.getContext("2d");
  ctx.scale(scale, scale);
  ctx.strokeStyle = skExportInk(el.strokeColor); ctx.fillStyle = skExportInk(el.fill && el.fill !== "transparent" ? el.fill : el.strokeColor);
  ctx.lineWidth = Math.max(0.5, el.strokeWidth); ctx.lineCap = "round"; ctx.lineJoin = "round";
  skStencilPath(ctx, el.shape, w, h, !!(el.fill && el.fill !== "transparent"));
  return cv.toDataURL("image/png");
}
/* Excalidraw opens on a white canvas: colours chosen for the dark board (a pale grey for
   people, say) use the same light-background inks the board uses in light mode, or they
   would all but vanish there */
function skExportInk(c) {
  if (!c || c === "transparent") return c;
  return INK_LIGHT[String(c).toLowerCase()] || c;
}
function skToExcalidraw(elements) {
  var out = [], files = {}, boundTo = {}, uid = 0;
  var nid = function () { uid++; return skId() + "x" + uid; };
  var keep = function (el) { return JSON.parse(JSON.stringify(el)); };
  var text = function (str, x, y, w, h, colour, size, container, align) {
    return skFullEl({ id: nid(), type: "text", x: x, y: y, width: w, height: h, strokeColor: colour, strokeWidth: 1,
      text: str, originalText: str, fontSize: size, fontFamily: 2, textAlign: align || "center", verticalAlign: container ? "middle" : "top",
      containerId: container || null, lineHeight: 1.25, autoResize: true });
  };
  var bind = function (shapeId, ref) { (boundTo[shapeId] = boundTo[shapeId] || []).push(ref); };
  skctx.font = "12px Segoe UI, Arial, sans-serif";
  var fc = { "fc-diamond": "diamond", "fc-circle": "ellipse" };
  elements.forEach(function (el) {
    if (el.isDeleted) return;
    var cfData = { carbonfibre: { el: keep(el) } };
    if (el.type === "stencil" && !skIsFlow(el.shape)) {
      var fileId = "cf" + el.id, gid = nid(), extras = [];
      files[fileId] = { mimeType: "image/png", id: fileId, dataURL: skIconPng(el), created: Date.now() };
      var img = skFullEl({ id: el.id, type: "image", x: el.x, y: el.y, width: Math.abs(el.width), height: Math.abs(el.height),
        strokeColor: "transparent", strokeWidth: 1, fileId: fileId, status: "saved", scale: [1, 1], groupIds: [gid], customData: cfData });
      out.push(img);
      if (el.label) {
        var fs = skLabelSize(el), tw = skctx.measureText(el.label).width * fs / 12 + 4;
        var t = text(el.label, el.x + Math.abs(el.width) / 2 - tw / 2, el.y + Math.abs(el.height) + fs * 0.42, tw, fs * 1.25, el.strokeColor, fs, null);
        t.groupIds = [gid]; extras.push(t.id); out.push(t);
      }
      if (sk.showStatus !== false && skIsSystem(el)) {
        var st = SK_STATUS[skStatusOf(el).rank];
        var dot = skFullEl({ id: nid(), type: "ellipse", x: el.x + Math.abs(el.width) - 6, y: el.y - 4, width: 10, height: 10,
          strokeColor: st.colour, backgroundColor: st.colour, strokeWidth: 1, groupIds: [gid] });
        extras.push(dot.id); out.push(dot);
      }
      cfData.carbonfibre.extras = extras;
      return;
    }
    if (el.type === "stencil") {                          /* flowchart shapes: native, label bound inside */
      var shp = skFullEl({ id: el.id, type: fc[el.shape] || "rectangle", x: el.x, y: el.y, width: Math.abs(el.width), height: Math.abs(el.height),
        strokeColor: el.strokeColor, strokeWidth: el.strokeWidth, strokeStyle: el.strokeStyle || "solid",
        backgroundColor: el.fill && el.fill !== "transparent" ? el.fill : "transparent",
        roundness: el.shape === "fc-round" || el.shape === "fc-pill" ? { type: 3 } : null, customData: cfData });
      out.push(shp);
      if (el.label) {
        var lt = text(el.label, el.x + 6, el.y + Math.abs(el.height) / 2 - 9, Math.abs(el.width) - 12, 18, el.strokeColor, skLabelSize(el), el.id);
        bind(el.id, { id: lt.id, type: "text" }); out.push(lt);
      }
      return;
    }
    if (skIsConnector(el) && skFindEl(el.fromId) && skFindEl(el.toId)) {
      var pts = skLinkRoute(el), p0 = pts[0];
      var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
      var ar = skFullEl({ id: el.id, type: el.type, x: p0[0], y: p0[1],
        width: Math.max.apply(null, xs) - Math.min.apply(null, xs), height: Math.max.apply(null, ys) - Math.min.apply(null, ys),
        strokeColor: el.strokeColor, strokeWidth: el.strokeWidth, strokeStyle: el.strokeStyle || "solid",
        points: pts.map(function (q) { return [q[0] - p0[0], q[1] - p0[1]]; }),
        roundness: skLinkStyle(el) === "curved" ? { type: 2 } : null,
        startBinding: { elementId: el.fromId, focus: 0, gap: 4 }, endBinding: { elementId: el.toId, focus: 0, gap: 4 },
        startArrowhead: el.startArrowhead || null, endArrowhead: el.type === "arrow" ? "arrow" : null, customData: cfData });
      bind(el.fromId, { id: el.id, type: "arrow" }); bind(el.toId, { id: el.id, type: "arrow" });
      out.push(ar);
      if (el.label) {
        var fsz = el.fontSize || 12;
        skctx.font = fsz + "px Segoe UI, Arial, sans-serif";
        var mid = pts[Math.floor(pts.length / 2)], lw = skctx.measureText(el.label).width + 4;
        var at = sk.labelAt && sk.labelAt[el.id] ? sk.labelAt[el.id] : (pts.length % 2 ? mid : [(pts[pts.length / 2 - 1][0] + mid[0]) / 2, (pts[pts.length / 2 - 1][1] + mid[1]) / 2]);
        var lbl = text(el.label, at[0] - lw / 2, at[1] - 8, lw, 16, el.strokeColor, fsz, el.id);
        ar.boundElements = [{ id: lbl.id, type: "text" }];
        out.push(lbl);
      }
      return;
    }
    var plain = skFullEl(keep(el));                       /* rectangles, ellipses, text, pen, free lines */
    if (plain.fill && plain.fill !== "transparent") plain.backgroundColor = plain.fill;
    if (plain.type === "text") { plain.fontFamily = plain.fontFamily || 2; plain.lineHeight = plain.lineHeight || 1.25; plain.containerId = null; }
    if (plain.type === "arrow" && !plain.endArrowhead) plain.endArrowhead = "arrow";
    out.push(plain);
  });
  out.forEach(function (e) {
    if (boundTo[e.id]) e.boundElements = (e.boundElements || []).concat(boundTo[e.id]);
    if (e.type !== "image") { e.strokeColor = skExportInk(e.strokeColor); e.backgroundColor = skExportInk(e.backgroundColor); }
  });
  return { type: "excalidraw", version: 2, source: "https://carbonfibre.local", elements: out,
    appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: files };
}

function skDoc(elements) {
  return { type: "excalidraw", version: 2, source: "CarbonFibre", elements: elements.map(skCompactEl),
    appState: { viewBackgroundColor: "#0e0f11", gridSize: null, cfFormat: 2 }, files: {} };
}
function skParse(text) {
  try {
    var d = JSON.parse(text);
    if (!Array.isArray(d.elements)) return [];
    /* lean or full, CarbonFibre or excalidraw.com: every element comes back complete */
    return skImportExcalidraw(d.elements.filter(function (e) { return !e.isDeleted; })).map(skFullEl);
  }
  catch (e) { return []; }
}
/* bounding box in world units */
/* ---- stencils: network shapes drawn as vector paths, so they scale and recolour.
   Each is one element of type "stencil" with a shape name, a box and a label. ---- */

/* What the Shapes palette offers. Router, switch, firewall and printer have left the
   palette but skStencilPath still draws them, so older drawings render unchanged. */
var SK_STENCILS = [
  { id: "service",   label: "Service",       group: "Compute" },
  { id: "server",    label: "Server",        group: "Compute" },
  { id: "function",  label: "Function",      group: "Compute" },
  { id: "job",       label: "Job",           group: "Compute" },
  { id: "processor", label: "Stream processor", group: "Compute" },
  { id: "lb",        label: "Load balancer", group: "Traffic" },
  { id: "gateway",   label: "API gateway",   group: "Traffic" },
  { id: "queue",     label: "Queue",         group: "Messaging" },
  { id: "topic",     label: "Event bus",     group: "Messaging" },
  { id: "stream",    label: "Stream",        group: "Messaging" },
  { id: "database",  label: "Database",      group: "Data" },
  { id: "cache",     label: "Cache",         group: "Data" },
  { id: "storage",   label: "Storage",       group: "Data" },
  { id: "llm",       label: "LLM",           group: "AI" },
  { id: "dashboard", label: "Dashboard",     group: "Ops" },
  { id: "repo",      label: "Repository",    group: "Ops" },
  { id: "cloud",     label: "Cloud",         group: "External" },
  { id: "internet",  label: "Internet",      group: "External" },
  { id: "user",      label: "User",          group: "People" },
  { id: "desktop",   label: "Workstation",   group: "People" },
  { id: "laptop",    label: "Laptop",        group: "People" },
  { id: "mobile",    label: "Mobile",        group: "People" },
  { id: "splitter",   label: "Splitter",      group: "Flowchart" },
  { id: "fc-box",     label: "Box",           group: "Flowchart" },
  { id: "fc-round",   label: "Rounded box",   group: "Flowchart" },
  { id: "fc-pill",    label: "Start / end",   group: "Flowchart" },
  { id: "fc-diamond", label: "Decision",      group: "Flowchart" },
  { id: "fc-circle",  label: "Circle",        group: "Flowchart" },
  { id: "fc-hex",     label: "Preparation",   group: "Flowchart" },
  { id: "fc-para",    label: "Input / output", group: "Flowchart" }
];
var SK_STENCIL_SIZE = { w: 76, h: 62 };

/* Every stencil draws inside a unit box (0..1, 0..1) so one routine scales them all.
   ctx is already translated and scaled; fill is applied to closed bodies. */
/* flowchart shapes: drawn to the element's full size, with the label inside (see skDrawEl) */
function skFlowShape(ctx, shape, w, h, fill) {
  var i = 1;                                             /* keep the stroke inside the box */
  ctx.beginPath();
  if (shape === "fc-circle") ctx.ellipse(w / 2, h / 2, w / 2 - i, h / 2 - i, 0, 0, Math.PI * 2);
  else if (shape === "fc-diamond") { ctx.moveTo(w / 2, i); ctx.lineTo(w - i, h / 2); ctx.lineTo(w / 2, h - i); ctx.lineTo(i, h / 2); ctx.closePath(); }
  else if (shape === "fc-hex") { var c = Math.min(18, w * 0.14); ctx.moveTo(c, i); ctx.lineTo(w - c, i); ctx.lineTo(w - i, h / 2); ctx.lineTo(w - c, h - i); ctx.lineTo(c, h - i); ctx.lineTo(i, h / 2); ctx.closePath(); }
  else if (shape === "fc-para") { var sl = Math.min(16, w * 0.12); ctx.moveTo(sl, i); ctx.lineTo(w - i, i); ctx.lineTo(w - sl, h - i); ctx.lineTo(i, h - i); ctx.closePath(); }
  else {
    var r = shape === "fc-pill" ? (h - 2 * i) / 2 : shape === "fc-round" ? Math.min(14, h / 3) : 4;
    ctx.moveTo(i + r, i); ctx.arcTo(w - i, i, w - i, h - i, r); ctx.arcTo(w - i, h - i, i, h - i, r);
    ctx.arcTo(i, h - i, i, i, r); ctx.arcTo(i, i, w - i, i, r); ctx.closePath();
  }
  if (fill) ctx.fill();
  ctx.stroke();
}
function skIsFlow(shape) { return String(shape).indexOf("fc-") === 0; }
/* A stencil's label size, in board units. It follows the shape: an icon's label scales
   with the icon, a flowchart box's label grows once the box is taller than its default.
   el.labelScale is the user's own adjustment from the Text slider; it is kept relative,
   so a label made bigger keeps growing with its shape. At the default size and with no
   adjustment, labels are exactly as they were. */
function skLabelSize(el) {
  var base = skIsFlow(el.shape) ? 13 : 12, def = skStencilSize(el.shape);
  var grow = skIsFlow(el.shape) ? Math.max(1, Math.abs(el.height) / def.h) : Math.abs(el.height) / def.h;
  grow = Math.max(0.6, Math.min(6, grow || 1));
  return base * grow * (el.labelScale || 1);
}
/* a label wrapped to fit inside its shape */
function skWrapLabel(text, maxW) {
  var out = [];
  String(text).split("\n").forEach(function (para) {
    var line = "";
    para.split(/\s+/).forEach(function (w) {
      var t = line ? line + " " + w : w;
      if (!line || skctx.measureText(t).width <= maxW) line = t; else { out.push(line); line = w; }
    });
    out.push(line);
  });
  return out;
}
function skStencilSize(shape) {
  if (shape === "splitter") return { w: 16, h: 16 };
  if (shape === "fc-circle") return { w: 84, h: 84 };
  if (shape === "fc-diamond") return { w: 130, h: 80 };
  if (skIsFlow(shape)) return { w: 140, h: 56 };
  return SK_STENCIL_SIZE;
}

function skStencilPath(ctx, shape, w, h, fill) {
  if (shape === "splitter") {                    /* a junction: one line in, many out */
    ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle; ctx.fill(); return;
  }
  if (skIsFlow(shape)) { skFlowShape(ctx, shape, w, h, fill); return; }
  function rr(x, y, bw, bh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + bw, y, x + bw, y + bh, r);
    ctx.arcTo(x + bw, y + bh, x, y + bh, r);
    ctx.arcTo(x, y + bh, x, y, r);
    ctx.arcTo(x, y, x + bw, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    ctx.stroke();
  }
  function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function dot(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

  if (shape === "server") {
    rr(w * 0.24, h * 0.06, w * 0.52, h * 0.88, w * 0.05);
    for (var i = 1; i <= 3; i++) {
      var y = h * (0.06 + 0.22 * i);
      line(w * 0.24, y, w * 0.76, y);
      dot(w * 0.32, y - h * 0.11, Math.max(1, w * 0.025));
    }
    return;
  }
  if (shape === "desktop") {
    rr(w * 0.1, h * 0.12, w * 0.8, h * 0.52, w * 0.05);
    line(w * 0.5, h * 0.64, w * 0.5, h * 0.8);
    line(w * 0.28, h * 0.86, w * 0.72, h * 0.86);
    line(w * 0.32, h * 0.8, w * 0.68, h * 0.8);
    return;
  }
  if (shape === "laptop") {
    rr(w * 0.18, h * 0.16, w * 0.64, h * 0.46, w * 0.04);
    ctx.beginPath();
    ctx.moveTo(w * 0.06, h * 0.82); ctx.lineTo(w * 0.18, h * 0.62);
    ctx.lineTo(w * 0.82, h * 0.62); ctx.lineTo(w * 0.94, h * 0.82);
    ctx.closePath();
    if (fill) ctx.fill();
    ctx.stroke();
    return;
  }
  if (shape === "router") {
    rr(w * 0.08, h * 0.44, w * 0.84, h * 0.34, w * 0.08);
    /* four arrows fanning out of the top */
    [[0.28, -1], [0.44, -1], [0.58, 1], [0.74, 1]].forEach(function (a) {
      var x = w * a[0], top = h * 0.14;
      line(x, h * 0.44, x, top);
      ctx.beginPath();
      ctx.moveTo(x - w * 0.04, top + (a[1] > 0 ? 0 : h * 0.08));
      ctx.lineTo(x, top - (a[1] > 0 ? h * 0.04 : -h * 0.04));
      ctx.lineTo(x + w * 0.04, top + (a[1] > 0 ? 0 : h * 0.08));
      ctx.stroke();
    });
    return;
  }
  if (shape === "switch") {
    rr(w * 0.06, h * 0.4, w * 0.88, h * 0.36, w * 0.05);
    for (var p = 0; p < 6; p++) {
      var px = w * (0.14 + p * 0.145);
      line(px, h * 0.58, px, h * 0.72);
    }
    line(w * 0.2, h * 0.26, w * 0.8, h * 0.26);
    line(w * 0.2, h * 0.26, w * 0.26, h * 0.18);
    line(w * 0.8, h * 0.26, w * 0.74, h * 0.34);
    return;
  }
  if (shape === "firewall") {
    rr(w * 0.12, h * 0.14, w * 0.76, h * 0.72, w * 0.03);
    for (var r2 = 1; r2 < 4; r2++) line(w * 0.12, h * (0.14 + 0.18 * r2), w * 0.88, h * (0.14 + 0.18 * r2));
    line(w * 0.38, h * 0.14, w * 0.38, h * 0.32);
    line(w * 0.62, h * 0.32, w * 0.62, h * 0.5);
    line(w * 0.38, h * 0.5, w * 0.38, h * 0.68);
    line(w * 0.62, h * 0.68, w * 0.62, h * 0.86);
    return;
  }
  if (shape === "cloud" || shape === "internet") {
    ctx.beginPath();
    ctx.moveTo(w * 0.26, h * 0.74);
    ctx.bezierCurveTo(w * 0.02, h * 0.74, w * 0.04, h * 0.4, w * 0.26, h * 0.42);
    ctx.bezierCurveTo(w * 0.28, h * 0.14, w * 0.66, h * 0.12, w * 0.72, h * 0.38);
    ctx.bezierCurveTo(w * 0.96, h * 0.36, w * 0.98, h * 0.74, w * 0.74, h * 0.74);
    ctx.closePath();
    if (fill) ctx.fill();
    ctx.stroke();
    if (shape === "internet") {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.5, w * 0.2, h * 0.2, 0, 0, Math.PI * 2); ctx.clip();
      line(w * 0.3, h * 0.5, w * 0.7, h * 0.5);
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.5, w * 0.09, h * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.5, w * 0.2, h * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    return;
  }
  if (shape === "database") {
    var ry = h * 0.13, top = h * 0.16, bot = h * 0.84;
    ctx.beginPath();
    ctx.moveTo(w * 0.18, top);
    ctx.lineTo(w * 0.18, bot);
    ctx.bezierCurveTo(w * 0.18, bot + ry, w * 0.82, bot + ry, w * 0.82, bot);
    ctx.lineTo(w * 0.82, top);
    ctx.closePath();
    if (fill) ctx.fill();
    ctx.stroke();
    [0, 1, 2].forEach(function (i2) {
      var yy = top + i2 * (bot - top) / 3;
      ctx.beginPath();
      ctx.ellipse(w * 0.5, yy, w * 0.32, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    return;
  }
  if (shape === "user") {
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.28, Math.min(w, h) * 0.17, 0, Math.PI * 2);
    if (fill) ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.86);
    ctx.bezierCurveTo(w * 0.2, h * 0.52, w * 0.8, h * 0.52, w * 0.8, h * 0.86);
    if (fill) ctx.fill();
    ctx.stroke();
    return;
  }
  if (shape === "printer") {
    rr(w * 0.24, h * 0.1, w * 0.52, h * 0.24, w * 0.03);
    rr(w * 0.1, h * 0.34, w * 0.8, h * 0.34, w * 0.05);
    rr(w * 0.26, h * 0.62, w * 0.48, h * 0.28, w * 0.03);
    dot(w * 0.78, h * 0.44, Math.max(1, w * 0.025));
    return;
  }
  if (shape === "mobile") {
    rr(w * 0.32, h * 0.08, w * 0.36, h * 0.84, w * 0.07);
    line(w * 0.42, h * 0.16, w * 0.58, h * 0.16);
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.82, Math.max(1, w * 0.035), 0, Math.PI * 2); ctx.stroke();
    return;
  }
  function poly(pts, close) {
    ctx.beginPath();
    ctx.moveTo(w * pts[0][0], h * pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(w * pts[i][0], h * pts[i][1]);
    if (close) { ctx.closePath(); if (fill) ctx.fill(); }
    ctx.stroke();
  }
  function circ(cx, cy, r, filled) {
    ctx.beginPath(); ctx.arc(w * cx, h * cy, Math.min(w, h) * r, 0, Math.PI * 2);
    if (filled || fill) ctx.fill();
    ctx.stroke();
  }

  if (shape === "service") {              /* a container: an isometric cube */
    poly([[0.5, 0.1], [0.86, 0.29], [0.86, 0.71], [0.5, 0.9], [0.14, 0.71], [0.14, 0.29]], true);
    poly([[0.14, 0.29], [0.5, 0.48], [0.86, 0.29]], false);
    line(w * 0.5, h * 0.48, w * 0.5, h * 0.9);
    return;
  }
  if (shape === "function") {             /* lambda in a tile */
    rr(w * 0.2, h * 0.1, w * 0.6, h * 0.8, w * 0.07);
    poly([[0.36, 0.28], [0.44, 0.28], [0.64, 0.74]], false);
    line(w * 0.5, h * 0.48, w * 0.37, h * 0.74);
    return;
  }
  if (shape === "job") {                  /* scheduled or batch work: a gear */
    for (var t = 0; t < 8; t++) {
      var a = (t / 8) * Math.PI * 2, m = Math.min(w, h);
      line(w / 2 + Math.cos(a) * m * 0.24, h / 2 + Math.sin(a) * m * 0.24,
           w / 2 + Math.cos(a) * m * 0.36, h / 2 + Math.sin(a) * m * 0.36);
    }
    circ(0.5, 0.5, 0.25);
    ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.09, 0, Math.PI * 2); ctx.stroke();
    return;
  }
  if (shape === "lb") {                   /* one stream in, fanned out */
    circ(0.5, 0.5, 0.38);
    line(w * 0.22, h * 0.5, w * 0.44, h * 0.5);
    [0.3, 0.5, 0.7].forEach(function (yy) { line(w * 0.44, h * 0.5, w * 0.74, h * yy); });
    return;
  }
  if (shape === "gateway") {              /* hexagon with angle brackets */
    poly([[0.26, 0.12], [0.74, 0.12], [0.94, 0.5], [0.74, 0.88], [0.26, 0.88], [0.06, 0.5]], true);
    poly([[0.42, 0.34], [0.31, 0.5], [0.42, 0.66]], false);
    poly([[0.58, 0.34], [0.69, 0.5], [0.58, 0.66]], false);
    return;
  }
  if (shape === "queue") {                /* a row of slots */
    rr(w * 0.06, h * 0.3, w * 0.88, h * 0.4, h * 0.06);
    [0.28, 0.5, 0.72].forEach(function (xx) { line(w * xx, h * 0.3, w * xx, h * 0.7); });
    poly([[0.78, 0.18], [0.9, 0.18]], false);
    poly([[0.86, 0.13], [0.9, 0.18], [0.86, 0.23]], false);
    return;
  }
  if (shape === "stream") {               /* a partitioned log: lanes of records, each at its own offset */
    rr(w * 0.06, h * 0.18, w * 0.88, h * 0.64, h * 0.06);
    line(w * 0.06, h * 0.393, w * 0.94, h * 0.393);
    line(w * 0.06, h * 0.607, w * 0.94, h * 0.607);
    [[0.18, 0.4, 0.62], [0.28, 0.5], [0.14, 0.34, 0.54, 0.74]].forEach(function (ticks, lane) {
      var y0 = 0.18 + lane * 0.213, y1 = y0 + 0.213;
      ticks.forEach(function (tx) { line(w * tx, h * (y0 + 0.05), w * tx, h * (y1 - 0.05)); });
    });
    return;
  }
  if (shape === "processor") {            /* a funnel: many records in, fewer out */
    poly([[0.14, 0.18], [0.86, 0.18], [0.58, 0.54], [0.58, 0.78], [0.42, 0.88], [0.42, 0.54]], true);
    line(w * 0.3, h * 0.32, w * 0.7, h * 0.32);
    return;
  }
  if (shape === "topic") {                /* broadcast: one source, several receivers */
    circ(0.24, 0.5, 0.08, true);
    [[0.78, 0.2], [0.84, 0.5], [0.78, 0.8]].forEach(function (pt) {
      line(w * 0.3, h * 0.5, w * pt[0], h * pt[1]);
      circ(pt[0], pt[1], 0.06);
    });
    return;
  }
  if (shape === "cache") {                /* a tile with a lightning bolt */
    rr(w * 0.18, h * 0.08, w * 0.64, h * 0.84, w * 0.08);
    var keep = fill; fill = false;
    poly([[0.56, 0.18], [0.36, 0.54], [0.5, 0.54], [0.43, 0.84], [0.66, 0.44], [0.51, 0.44], [0.58, 0.18]], true);
    fill = keep;
    return;
  }
  if (shape === "storage") {              /* a bucket */
    ctx.beginPath();
    ctx.moveTo(w * 0.16, h * 0.24);
    ctx.lineTo(w * 0.26, h * 0.82);
    ctx.bezierCurveTo(w * 0.3, h * 0.94, w * 0.7, h * 0.94, w * 0.74, h * 0.82);
    ctx.lineTo(w * 0.84, h * 0.24);
    if (fill) ctx.fill();
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.24, w * 0.34, h * 0.09, 0, 0, Math.PI * 2); ctx.stroke();
    return;
  }
  if (shape === "llm") {                  /* a sparkle, matching the agent icon */
    poly([[0.5, 0.08], [0.58, 0.4], [0.9, 0.5], [0.58, 0.6], [0.5, 0.92], [0.42, 0.6], [0.1, 0.5], [0.42, 0.4]], true);
    poly([[0.8, 0.1], [0.83, 0.19], [0.92, 0.22], [0.83, 0.25], [0.8, 0.34], [0.77, 0.25], [0.68, 0.22], [0.77, 0.19]], true);
    return;
  }
  if (shape === "dashboard") {            /* a screen with bars and a trend */
    rr(w * 0.08, h * 0.1, w * 0.84, h * 0.62, w * 0.04);
    line(w * 0.24, h * 0.6, w * 0.24, h * 0.46);
    line(w * 0.36, h * 0.6, w * 0.36, h * 0.3);
    line(w * 0.48, h * 0.6, w * 0.48, h * 0.4);
    poly([[0.58, 0.56], [0.68, 0.38], [0.78, 0.46], [0.84, 0.28]], false);
    line(w * 0.5, h * 0.72, w * 0.5, h * 0.84);
    line(w * 0.34, h * 0.88, w * 0.66, h * 0.88);
    return;
  }
  if (shape === "repo") {                 /* a git branch */
    circ(0.32, 0.2, 0.08); circ(0.32, 0.8, 0.08); circ(0.7, 0.36, 0.08);
    line(w * 0.32, h * 0.29, w * 0.32, h * 0.71);
    ctx.beginPath();
    ctx.moveTo(w * 0.7, h * 0.45);
    ctx.bezierCurveTo(w * 0.7, h * 0.62, w * 0.36, h * 0.56, w * 0.33, h * 0.7);
    ctx.stroke();
    return;
  }
  rr(w * 0.1, h * 0.1, w * 0.8, h * 0.8, w * 0.05);   /* unknown shape: plain box */
}

/* the four edge midpoints a connector can attach to */
function skAnchors(el) {
  var b = skBox(el);
  /* an icon stencil's label sits under it, so its bottom connection point goes under the
     label: a link arriving from below, or leaving downwards, no longer runs through the text */
  var under = 0;
  if (el.type === "stencil" && el.label && !skIsFlow(el.shape)) {
    var lfs = skLabelSize(el);
    under = lfs * 0.42 + lfs * 1.35 * String(el.label).split("\n").length;
  }
  return [
    { side: "t", x: b.x + b.w / 2, y: b.y },
    { side: "r", x: b.x + b.w, y: b.y + b.h / 2 },
    { side: "b", x: b.x + b.w / 2, y: b.y + b.h + under },
    { side: "l", x: b.x, y: b.y + b.h / 2 }
  ];
}
/* pick the anchor pair that gives the shortest run between two elements */
/* Which sides a link attaches to. The old rule took the closest pair of points, which
   ignored what lies between: after a Tidy, a link to a server high up a column would leave
   the top of the service and climb through every server in between. Now each pairing is
   scored by the route it produces: its length, plus a heavy cost for every shape it would
   pass through, plus a little for every turn. With nothing in the way the shortest pairing
   still wins, so drawings only change where a link used to cut through a shape. */
/* every shape's box, measured once per frame and shared by all links */
function skObstacles(skipA, skipB) {
  if (!sk.obsCache) {
    sk.obsCache = sk.elements.filter(function (e) { return e.type === "stencil" && !e.isDeleted; }).map(function (e) {
      var b = skBox(e), under = !skIsFlow(e.shape) && e.label ? skLabelSize(e) * 1.6 : 0;
      var r = [b.x + 2, b.y + 2, b.x + b.w - 2, b.y + b.h + under - 2]; r.id = e.id; return r;
    }).concat(sk.elements.filter(function (e) {
      if (e.type !== "text" || e.isDeleted || e.containerId) return false;
      /* a group's title (at its box's top-left corner) is not in the way */
      return !sk.elements.some(function (r) { return r.type === "rectangle" && !r.isDeleted && e.x >= r.x - 2 && e.x <= r.x + 60 && e.y >= r.y - 2 && e.y <= r.y + 30; });
    }).map(function (e) {
      var b = skBox(e), r = [b.x - 4, b.y - 4, b.x + b.w + 4, b.y + b.h + 4]; r.id = e.id; return r;   /* links route round text too */
    }));
  }
  if (!skipA && !skipB) return sk.obsCache;
  return sk.obsCache.filter(function (r) { return r.id !== skipA && r.id !== skipB; });
}
/* does the segment touch the box? (Liang-Barsky clipping) */
function skSegHitsBox(x1, y1, x2, y2, r) {
  var t0 = 0, t1 = 1, dx = x2 - x1, dy = y2 - y1;
  var p = [-dx, dx, -dy, dy], q = [x1 - r[0], r[2] - x1, y1 - r[1], r[3] - y1];
  for (var i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else { var t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
  }
  return true;
}
/* the part of a route's cost that needs no obstacle test: length, turns, reversals */
function skRouteBase(pts) {
  var len = 0;
  for (var i = 1; i < pts.length; i++) len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
  var back = 0;
  for (var k = 2; k < pts.length; k++) {
    var ax = pts[k - 1][0] - pts[k - 2][0], ay = pts[k - 1][1] - pts[k - 2][1];
    var bx = pts[k][0] - pts[k - 1][0], by = pts[k][1] - pts[k - 1][1];
    if (Math.abs(ax * by - ay * bx) < 0.5 && ax * bx + ay * by < 0) back++;
  }
  return len + (pts.length - 2) * 24 + back * 400;
}
function skRouteHits(pts, obstacles) {
  var hits = 0;
  for (var i = 1; i < pts.length; i++) {
    var x0 = Math.min(pts[i - 1][0], pts[i][0]), x1 = Math.max(pts[i - 1][0], pts[i][0]);
    var y0 = Math.min(pts[i - 1][1], pts[i][1]), y1 = Math.max(pts[i - 1][1], pts[i][1]);
    for (var j = 0; j < obstacles.length; j++) {
      var r = obstacles[j];
      if (r[2] < x0 || r[0] > x1 || r[3] < y0 || r[1] > y1) continue;      /* cheap reject */
      if (skSegHitsBox(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], r)) hits++;
    }
  }
  return hits;
}
function skPickAnchors(a, b, route, flow, ports) {
  var key = a.id + "|" + b.id + "|" + (route ? "e" : "s") + (flow || "") + (ports ? ports.from + ports.to : "");
  /* a tidied diagram reads one way: leaving and arriving on the sides that face that way
     reads as a flow; a small preference, so a clear route still beats it */
  var axis = String(flow || "").split("|")[0];
  var offAxis = axis === "LR" ? { t: 1, b: 1 } : axis === "TB" ? { l: 1, r: 1 } : {};
  if (sk.anchorCache && sk.anchorCache[key]) return sk.anchorCache[key];
  var as = skAnchors(a), bs = skAnchors(b), obs = skObstacles(a.id, b.id), best = null, cands = [];
  as.forEach(function (p) {
    bs.forEach(function (q) {
      var pts = route ? route(p, q) : [[p.x, p.y], [q.x, q.y]];
      var portCost = ports ? (ports.from && p.side !== ports.from ? 5000 : 0) + (ports.to && q.side !== ports.to ? 5000 : 0) : 0;
      cands.push({ from: p, to: q, pts: pts, base: skRouteBase(pts) + ((offAxis[p.side] ? 80 : 0) + (offAxis[q.side] ? 80 : 0)) + portCost });
    });
  });
  /* cheapest first: once a clear route is found, nothing dearer can beat it */
  cands.sort(function (x, y) { return x.base - y.base; });
  for (var ci = 0; ci < cands.length; ci++) {
    var cd = cands[ci];
    if (best && cd.base >= best.cost) break;
    var cost = cd.base + skRouteHits(cd.pts, obs) * 100000;
    if (!best || cost < best.cost) best = { cost: cost, from: cd.from, to: cd.to, pts: cd.pts };
  }
  if (sk.anchorCache) {
    sk.anchorCache[key] = best;
    var ba = skBox(a), bb = skBox(b), m = 60;
    (sk.anchorRegion = sk.anchorRegion || {})[key] = [Math.min(ba.x, bb.x) - m, Math.min(ba.y, bb.y) - m,
      Math.max(ba.x + ba.w, bb.x + bb.w) + m, Math.max(ba.y + ba.h, bb.y + bb.h) + m];
  }
  return best;
}
function skBestAnchors(a, b, flow) { return skPickAnchors(a, b, null, flow); }
/* Keep each link's route until something could change it: one of its own ends moving, or a
   shape moving through (or out of) the area its routes can use - the box around its two
   ends, plus a margin. Dragging one shape then re-routes only the links near it. */
function skRefreshRouteCache() {
  var now = {}, changed = [], any = false;
  sk.elements.forEach(function (e) {
    if (e.type !== "stencil" && !(e.type === "text" && !e.containerId)) return;
    var sig = (e.isDeleted ? "x" : "") + e.x + "," + e.y + "," + e.width + "," + e.height + "," + (e.labelScale || 1) + "," + (e.label || e.text || "");
    var b = e.isDeleted ? null : skBox(e);
    now[e.id] = { sig: sig, box: b ? [b.x, b.y, b.x + b.w, b.y + b.h + 40] : null };
  });
  sk.geoSigAll = Object.keys(now).map(function (id) { return id + now[id].sig; }).join(";");
  var old = sk.geoMap || {};
  Object.keys(now).forEach(function (id) {
    if (!old[id] || old[id].sig !== now[id].sig) { changed.push(id); if (old[id] && old[id].box) changed.push(old[id].box); if (now[id].box) changed.push(now[id].box); any = true; }
  });
  Object.keys(old).forEach(function (id) { if (!now[id]) { changed.push(id); if (old[id].box) changed.push(old[id].box); any = true; } });
  sk.geoMap = now;
  if (!any && sk.anchorCache) return;
  sk.obsCache = null;
  if (!sk.anchorCache || !sk.anchorRegion) { sk.anchorCache = {}; sk.anchorRegion = {}; return; }
  var ids = {}, boxes = [];
  changed.forEach(function (c) { if (typeof c === "string") ids[c] = 1; else boxes.push(c); });
  Object.keys(sk.anchorCache).forEach(function (key) {
    var parts = key.split("|"), reg = sk.anchorRegion[key];
    var stale = ids[parts[0]] || ids[parts[1]] || !reg || boxes.some(function (bx) {
      return !(bx[2] < reg[0] || bx[0] > reg[2] || bx[3] < reg[1] || bx[1] > reg[3]);
    });
    if (stale) { delete sk.anchorCache[key]; delete sk.anchorRegion[key]; }
  });
}
function skFindEl(id) {
  for (var i = 0; i < sk.elements.length; i++) if (sk.elements[i].id === id) return sk.elements[i];
  return null;
}
/* a connector's endpoints follow whatever it is bound to */
/* the nearest side of a box to a point */
function skNearestAnchor(box, x, y) {
  var best = null, bd = Infinity;
  skAnchors(box).forEach(function (p) {
    var d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bd) { bd = d; best = p; }
  });
  return best;
}
function skConnectorEnds(el) {
  var a = el.fromId ? skFindEl(el.fromId) : null, b = el.toId ? skFindEl(el.toId) : null;
  /* a link with bends: each end attaches where it meets its nearest bend, so moving a box
     still drags the end along while the bends keep the line clear of what lies between */
  if (a && b && el.via && el.via.length) {
    var v0 = el.via[0], v1 = el.via[el.via.length - 1];
    var fa = skNearestAnchor(a, v0[0], v0[1]), tb = skNearestAnchor(b, v1[0], v1[1]);
    return [fa.x, fa.y, tb.x, tb.y];
  }
  if (a && b) {
    var pair = skBestAnchors(a, b, el.flow);
    return [pair.from.x, pair.from.y, pair.to.x, pair.to.y];
  }
  if (a) {
    var pa = skAnchors(a), tx = el.x + el.points[1][0], ty = el.y + el.points[1][1], bestp = pa[0], bd = Infinity;
    pa.forEach(function (p) {
      var d = (p.x - tx) * (p.x - tx) + (p.y - ty) * (p.y - ty);
      if (d < bd) { bd = d; bestp = p; }
    });
    return [bestp.x, bestp.y, tx, ty];
  }
  return [el.x + el.points[0][0], el.y + el.points[0][1], el.x + el.points[1][0], el.y + el.points[1][1]];
}

/* every point a connector passes through, end to end */
function skConnectorPath(el) {
  var e = skConnectorEnds(el), pts = [[e[0], e[1]]];
  (el.via || []).forEach(function (v) { pts.push([v[0], v[1]]); });
  pts.push([e[2], e[3]]);
  return pts;
}
function skBox(el) {
  if (typeof skIsLink === "function" && skIsLink(el)) {
    var ps = skLinkSamples(el), xs = ps.map(function (q) { return q[0]; }), ys = ps.map(function (q) { return q[1]; });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    return { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 };
  }
  if (el.points && el.points.length) {
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    el.points.forEach(function (pt) { minx = Math.min(minx, pt[0]); miny = Math.min(miny, pt[1]); maxx = Math.max(maxx, pt[0]); maxy = Math.max(maxy, pt[1]); });
    return { x: el.x + minx, y: el.y + miny, w: maxx - minx, h: maxy - miny };
  }
  if (el.type === "text") {
    skctx.font = el.fontSize + "px " + "Segoe UI, Arial, sans-serif";
    var lines = String(el.text).split("\n"), w = 0;
    lines.forEach(function (l) { w = Math.max(w, skctx.measureText(l).width); });
    return { x: el.x, y: el.y, w: w, h: lines.length * el.fontSize * 1.25 };
  }
  var x = Math.min(el.x, el.x + el.width), y = Math.min(el.y, el.y + el.height);
  return { x: x, y: y, w: Math.abs(el.width), h: Math.abs(el.height) };
}
function skIsConnector(el) { return (el.type === "line" || el.type === "arrow") && (el.fromId || el.toId); }

/* ---- open / close / persist ---- */

/* Move the board's DOM into a pane, or back to the overlay. Only one board is
   open at a time, so this relocates the single element rather than cloning it. */
