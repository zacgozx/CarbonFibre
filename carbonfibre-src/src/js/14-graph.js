/* ============================================================
   graph view
   ============================================================ */

var graphCanvas = document.getElementById("graphCanvas");
var gctx = graphCanvas.getContext("2d");
var graphSide = document.getElementById("graphSide");
var graphData = null, graphRaf = null, graphHover = null, graphSel = null;
var cam = { x: 0, y: 0, k: 1, tk: 1, follow: null, home: false, fit: 1 };
var MIN_ORBIT = 150;              /* keeps a linkless vault from collapsing onto the sun */
var gDown = null, gLast = 0;

function sizeCanvas() {
  var wrap = graphCanvas.parentNode;
  var dpr = window.devicePixelRatio || 1;
  graphCanvas.width = wrap.clientWidth * dpr;
  graphCanvas.height = wrap.clientHeight * dpr;
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ---- solar system layout: sun -> planets -> moons, everything else in the belt ---- */
function planSystem(g) {
  var nodes = g.nodes, adj = {};
  g.order = []; g.planets = []; g.belt = 0; g.outer = MIN_ORBIT; g.sun = null; g.adj = adj; g.drawList = null;
  if (!nodes.length) return;      /* empty vault: outer stays at MIN_ORBIT so the camera maths holds */
  nodes.forEach(function (n) { adj[n.id] = []; });
  g.edges.forEach(function (e) { adj[e.a.id].push(e.b); adj[e.b.id].push(e.a); });

  /* the note you're editing is the sun whether or not it has links */
  var focusId = focusedPane ? String(focusedPane.noteId) : null, sun = null;
  nodes.forEach(function (n) { if (String(n.id) === focusId) sun = n; });
  if (!sun) nodes.forEach(function (n) { if (!sun || n.deg > sun.deg) sun = n; });

  var depth = {}, parent = {}, queue = [sun];
  depth[sun.id] = 0;
  while (queue.length) {
    var c = queue.shift();
    adj[c.id].forEach(function (m) {
      if (depth[m.id] === undefined) { depth[m.id] = depth[c.id] + 1; parent[m.id] = c; queue.push(m); }
    });
  }

  sun.kind = "sun"; sun.parent = null; sun.r = 0; sun.a = 0; sun.speed = 0; sun.size = 22; sun.moons = 0;
  g.sun = sun; g.order.push(sun);

  var planets = nodes.filter(function (n) { return depth[n.id] === 1; }).sort(function (a, b) { return b.deg - a.deg; });
  planets.forEach(function (n, i) {
    n.kind = "planet"; n.parent = sun; n.moons = 0;
    n.r = 130 + i * 48;
    n.a = (i / planets.length) * Math.PI * 2 + i * 0.7;
    n.speed = 0.12 / Math.sqrt(n.r / 130);
    n.size = 6 + Math.min(8, n.deg * 1.5);
    g.order.push(n);
  });
  g.planets = planets;

  nodes.filter(function (n) { return depth[n.id] === 2; }).forEach(function (n) {
    var pl = parent[n.id], j = pl.moons++;
    n.kind = "moon"; n.parent = pl; n.moons = 0;
    n.r = pl.size + 14 + j * 11; n.a = j * 1.9; n.speed = 0.9 - j * 0.1; n.size = 3.5;
    g.order.push(n);
  });

  var rocks = nodes.filter(function (n) { return !n.kind; });
  var belt = 130 + planets.length * 48 + 70;
  var rings = Math.max(3, Math.ceil(rocks.length / 48));
  var perRing = Math.ceil(rocks.length / rings);
  rocks.forEach(function (n, i) {
    var ring = Math.floor(i / perRing), slot = i % perRing;
    n.kind = "rock"; n.parent = sun; n.moons = 0;
    n.r = belt + ring * 16;
    n.a = (slot / perRing) * Math.PI * 2 + ring * 0.6;
    n.speed = 0.05 - ring * 0.004;
    n.size = 2.5;
    g.order.push(n);
  });
  g.belt = rocks.length ? belt + (rings - 1) * 16 : 0;
  g.outer = Math.max(MIN_ORBIT, g.belt + 30, planets.length ? 130 + (planets.length - 1) * 48 : 0);
  stepPositions(0);
}

function stepPositions(dt) {
  graphData.order.forEach(function (n) {
    n.a += n.speed * dt;
    if (n.parent) {
      n.x = n.parent.x + Math.cos(n.a) * n.r;
      n.y = n.parent.y + Math.sin(n.a) * n.r * TILT;   /* the plane is tipped, so orbits read as ellipses */
    } else { n.x = 0; n.y = 0; }
  });
}

function fitScale() {
  var w = graphCanvas.parentNode.clientWidth, h = graphCanvas.parentNode.clientHeight;
  var need = Math.max(MIN_ORBIT, graphData.outer || 0) + 60;
  var k = Math.min((w / 2) / need, (h / 2) / (need * TILT + 40));
  if (!isFinite(k) || k <= 0) return 1;          /* no canvas yet, or nothing to frame */
  return Math.max(0.25, Math.min(1.5, k));
}
function toScreen(wx, wy, w, h) { return [w / 2 + (wx - cam.x) * cam.k, h / 2 + (wy - cam.y) * cam.k]; }
function toWorld(sx, sy, w, h) { return [cam.x + (sx - w / 2) / cam.k, cam.y + (sy - h / 2) / cam.k]; }
function screenRadius(n) {
  /* bodies on the near side of their orbit sit slightly closer, so draw them larger */
  var near = n.parent && n.r ? 1 + 0.14 * ((n.y - n.parent.y) / (n.r * TILT)) : 1;
  return Math.max(2, n.size * Math.min(cam.k, 2.2) * near);
}

function openGraph() {
  state.graphOpen = true;
  graphEl.classList.add("show");
  document.getElementById("actGraph").classList.add("on");
  graphSel = null; graphHover = null;
  graphSide.classList.remove("show");
  graphData = buildGraph();
  planSystem(graphData);
  sizeCanvas();
  cam.fit = fitScale();
  cam.x = cam.y = 0; cam.k = cam.tk = cam.fit; cam.follow = null; cam.home = false;
  buildStars();
  document.getElementById("graphStats").textContent =
    graphData.nodes.length + " notes \u00b7 " + graphData.edges.length + " links" +
    (graphData.sun ? " \u00b7 sun: " + graphData.sun.title : "");
  gLast = performance.now();
  if (graphRaf) cancelAnimationFrame(graphRaf);
  tickGraph();
}

function closeGraph() {
  state.graphOpen = false;
  graphEl.classList.remove("show");
  document.getElementById("actGraph").classList.remove("on");
  if (graphRaf) { cancelAnimationFrame(graphRaf); graphRaf = null; }
}

function tickGraph() {
  if (!state.graphOpen || !graphData) return;
  var now = performance.now(), dt = Math.min(0.05, (now - gLast) / 1000);
  gLast = now;
  stepPositions(dt);
  if (cam.follow) { cam.x += (cam.follow.x - cam.x) * 0.15; cam.y += (cam.follow.y - cam.y) * 0.15; }
  else if (cam.home) { cam.x += (0 - cam.x) * 0.1; cam.y += (0 - cam.y) * 0.1; if (Math.abs(cam.x) + Math.abs(cam.y) < 0.5) cam.home = false; }
  cam.k += (cam.tk - cam.k) * 0.12;
  drawGraph(graphCanvas.parentNode.clientWidth, graphCanvas.parentNode.clientHeight);
  graphRaf = requestAnimationFrame(tickGraph);
}

/* ---- looks: every body gets a stable identity from its title ---- */

function hashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h >>> 0;
}
/* planets are tinted along a maroon -> orange -> blue sweep, picked by name */
var PLANET_HUES = [
  ["#b0495a", "#5e2634"], ["#c9713f", "#6b3520"], ["#d99a5b", "#7a5230"],
  ["#6e8fe8", "#33477e"], ["#5f9e8f", "#2c4e46"], ["#8a6bb0", "#432f5c"],
  ["#c05f7a", "#5f2c3c"], ["#7fa4c9", "#3b4f66"]
];
function bodyLook(n) {
  if (n.look) return n.look;
  var h = hashStr(n.title);
  /* low bits of FNV cluster for similar names, so pick the hue from higher ones */
  var pair = PLANET_HUES[(h >>> 5) % PLANET_HUES.length];
  n.look = {
    lit: pair[0], dark: pair[1],
    tilt: ((h >> 3) % 100) / 100 * Math.PI,
    ring: n.kind === "planet" && n.deg >= 3 && ((h >> 7) % 100) < 45,
    /* ">>" is a signed shift, so for about half of all titles this term is negative; a negative
       ring height made the canvas throw and froze the whole view. The magnitude is kept, so
       every ring that already drew still draws exactly the same. */
    ringTilt: Math.abs(0.25 + ((h >> 9) % 60) / 100),
    bands: ((h >> 11) % 3) + 1,
    spin: (((h >> 13) % 100) / 100 - 0.5) * 0.6
  };
  return n.look;
}

/* ---- starfield: drawn once into an offscreen canvas, panned with parallax ---- */
var starLayers = null;
var starInk = null;
function buildStars() {
  starLayers = [];
  starInk = GP.star;
  var specs = [[220, 0.7, 0.14, 0.12], [120, 1.1, 0.26, 0.30], [46, 1.7, 0.5, 0.6]];
  specs.forEach(function (spec) {
    var c = document.createElement("canvas"), size = 900;
    c.width = c.height = size;
    var x = c.getContext("2d");
    for (var i = 0; i < spec[0]; i++) {
      var px = Math.random() * size, py = Math.random() * size;
      var a = spec[2] + Math.random() * spec[2];
      x.fillStyle = "rgba(" + GP.star + "," + a.toFixed(3) + ")";
      x.beginPath(); x.arc(px, py, spec[1] * (0.6 + Math.random() * 0.7), 0, Math.PI * 2); x.fill();
    }
    starLayers.push({ canvas: c, depth: spec[3], size: size });
  });
}
function drawStars(w, h) {
  var neb = gctx.createRadialGradient(w * 0.32, h * 0.28, 0, w * 0.32, h * 0.28, Math.max(w, h) * 0.8);
  neb.addColorStop(0, GP.nebula[0]);
  neb.addColorStop(0.5, GP.nebula[1]);
  neb.addColorStop(1, GP.nebula[2]);
  gctx.fillStyle = neb;
  gctx.fillRect(0, 0, w, h);
  if (!starLayers || starInk !== GP.star) buildStars();   /* rebuilt when the theme changes */
  starLayers.forEach(function (L) {
    var sz = L.size;
    var ox = -(cam.x * cam.k * L.depth) % sz, oy = -(cam.y * cam.k * L.depth) % sz;
    if (ox > 0) ox -= sz;
    if (oy > 0) oy -= sz;
    for (var gx = ox; gx < w; gx += sz)
      for (var gy = oy; gy < h; gy += sz)
        gctx.drawImage(L.canvas, gx, gy);
  });
}

/* ---- orbits are ellipses seen at an angle, so the system reads as 3D ---- */
var TILT = 0.42;                       /* how far the plane is tipped away from the viewer */
function orbitPath(cx, cy, r, k) {
  gctx.ellipse(cx, cy, r * k, r * k * TILT, 0, 0, Math.PI * 2);
}

/* The solar system's colours, one set per theme. drawGraph reads the current set, so the
   drawing itself is identical in both - only the ink changes.
   Night: a dark sky, pale stars, a warm sun. Day: white paper with a faint peach-pink
   wash, navy stars like a printed chart, and the sun in the brand peach, pink and rose. */
var GRAPH_NIGHT = {
  sky: "#08090b",
  nebula: ["rgba(60,40,72,0.20)", "rgba(28,32,54,0.13)", "rgba(8,9,11,0)"],
  star: "226,227,229",
  orbit: "rgba(150,155,175,0.11)", orbitLit: "rgba(212,145,124,0.35)",
  belt: "rgba(150,155,175,0.08)", moonOrbit: "rgba(150,155,175,0.13)",
  linkNear: "rgba(212,145,124,0.75)", linkFar: "rgba(212,145,124,0.12)",
  corona: ["rgba(212,145,124,0.42)", "rgba(155,61,75,0.22)", "rgba(155,61,75,0)"],
  flare: "rgba(212,145,124,0.30)",
  core: ["#ffe1d6", "#d4917c", "#9b3d4b"],
  hot: "#d4917c", rock: "#6b6e75",
  ringBack: "rgba(212,145,124,0.30)", ringFront: "rgba(212,145,124,0.55)",
  halo: ["rgba(212,145,124,0.38)", "rgba(212,145,124,0)"],
  labelHot: "#f0e6d6", labelLinked: "#d4917c", label: "#b9bcc4", labelDim: "#7d8087",
  labelHalo: "rgba(8,9,11,0.85)"
};
var GRAPH_DAY = {
  sky: "#fbfdff",
  nebula: ["rgba(142,195,223,0.20)", "rgba(174,212,232,0.16)", "rgba(255,255,255,0)"],
  star: "15,43,61",
  orbit: "rgba(15,43,61,0.12)", orbitLit: "rgba(26,101,133,0.50)",
  belt: "rgba(15,43,61,0.10)", moonOrbit: "rgba(15,43,61,0.14)",
  linkNear: "rgba(26,101,133,0.75)", linkFar: "rgba(15,43,61,0.12)",
  corona: ["rgba(174,212,232,0.80)", "rgba(91,163,201,0.38)", "rgba(91,163,201,0)"],
  flare: "rgba(46,134,171,0.42)",
  core: ["#f4fbff", "#8ec3df", "#2e86ab"],
  hot: "#1a6585", rock: "#a9bcc8",
  ringBack: "rgba(15,43,61,0.22)", ringFront: "rgba(26,101,133,0.50)",
  halo: ["rgba(91,163,201,0.50)", "rgba(91,163,201,0)"],
  labelHot: "#0f2b3d", labelLinked: "#1a6585", label: "#2c4a5e", labelDim: "#46606f",
  labelHalo: "rgba(255,255,255,0.92)"
};
var GP = GRAPH_NIGHT;

var GRAPH_FONT = "Segoe UI, Helvetica Neue, Arial, sans-serif";

/* One frame of the solar system. Each step below draws one layer, back to front;
   the frame's shared facts (camera, sun position, what is selected) travel in v. */
function drawGraph(w, h) {
  GP = isLight() ? GRAPH_DAY : GRAPH_NIGHT;
  gctx.clearRect(0, 0, w, h);
  gctx.fillStyle = GP.sky;
  gctx.fillRect(0, 0, w, h);
  drawStars(w, h);
  if (!graphData.sun) return;

  var hot = graphSel || graphHover;
  var v = {
    w: w, h: h, k: cam.k, t: performance.now() / 1000,
    sun: toScreen(0, 0, w, h), sr: screenRadius(graphData.sun),
    hot: hot, near: {}
  };
  /* the selected body's neighbours, looked up once per frame rather than once per body */
  if (hot) graphData.adj[hot.id].forEach(function (m) { v.near[m.id] = true; });

  drawOrbits(v);
  if (hot) drawHotLinks(v);
  drawSun(v);
  drawBodies(v);
  drawLabel(graphData.sun.title, v.sun[0], v.sun[1] - v.sr - 10, "600 12px", GP.labelHot, 1);
}

/* orbit rings, brighter for the body you are looking at; the belt; moon orbits when close */
function drawOrbits(v) {
  var hot = v.hot, sun = v.sun, k = v.k;
  graphData.planets.forEach(function (n) {
    var lit = hot && (n === hot || n.parent === hot || (hot.parent && hot.parent === n));
    gctx.strokeStyle = lit ? GP.orbitLit : GP.orbit;
    gctx.lineWidth = lit ? 1.4 : 1;
    gctx.beginPath(); orbitPath(sun[0], sun[1], n.r, k); gctx.stroke();
  });
  if (graphData.belt) {
    gctx.setLineDash([2, 7]);
    gctx.strokeStyle = GP.belt;
    gctx.lineWidth = 1;
    gctx.beginPath(); orbitPath(sun[0], sun[1], graphData.belt + 14, k); gctx.stroke();
    gctx.setLineDash([]);
  }
  if (k > 1.3) {
    gctx.strokeStyle = GP.moonOrbit;
    graphData.order.forEach(function (n) {
      if (n.kind !== "moon") return;
      var pp = toScreen(n.parent.x, n.parent.y, v.w, v.h);
      gctx.beginPath(); orbitPath(pp[0], pp[1], n.r, k); gctx.stroke();
    });
  }
}

/* links of the hovered or selected body, drawn as a curve rather than a chord */
function drawHotLinks(v) {
  var hp = toScreen(v.hot.x, v.hot.y, v.w, v.h);
  gctx.lineWidth = 1.2;
  graphData.adj[v.hot.id].forEach(function (m) {
    var mp = toScreen(m.x, m.y, v.w, v.h);
    var mx = (hp[0] + mp[0]) / 2, my = (hp[1] + mp[1]) / 2 - Math.abs(mp[0] - hp[0]) * 0.12;
    var g = gctx.createLinearGradient(hp[0], hp[1], mp[0], mp[1]);
    g.addColorStop(0, GP.linkNear);
    g.addColorStop(1, GP.linkFar);
    gctx.strokeStyle = g;
    gctx.beginPath(); gctx.moveTo(hp[0], hp[1]); gctx.quadraticCurveTo(mx, my, mp[0], mp[1]); gctx.stroke();
  });
  gctx.lineWidth = 1;
}

/* the sun: corona, breathing glow, a few flares, then the core */
function drawSun(v) {
  var sun = v.sun, sr = v.sr, t = v.t;
  var pulse = 1 + Math.sin(t * 0.9) * 0.05;
  gctx.fillStyle = radial(sun[0], sun[1], sr * 0.5, sun[0], sun[1], sr * 5 * pulse, [[0, GP.corona[0]], [0.35, GP.corona[1]], [1, GP.corona[2]]]);
  disc(sun[0], sun[1], sr * 5 * pulse);
  gctx.strokeStyle = GP.flare;
  gctx.lineWidth = 1.4;
  for (var f = 0; f < 5; f++) {
    var fa = t * 0.25 + f * 1.257;
    var fl = sr * (1.25 + 0.28 * Math.sin(t * 1.7 + f));
    gctx.beginPath();
    gctx.moveTo(sun[0] + Math.cos(fa) * sr, sun[1] + Math.sin(fa) * sr);
    gctx.lineTo(sun[0] + Math.cos(fa) * fl, sun[1] + Math.sin(fa) * fl);
    gctx.stroke();
  }
  gctx.fillStyle = radial(sun[0] - sr * 0.3, sun[1] - sr * 0.3, sr * 0.1, sun[0], sun[1], sr, [[0, GP.core[0]], [0.45, GP.core[1]], [1, GP.core[2]]]);
  disc(sun[0], sun[1], sr);
  gctx.lineWidth = 1;
}

/* bodies, far side first so nearer ones overlap correctly */
function drawBodies(v) {
  /* the same bodies every frame, so keep the array and just re-sort it by depth */
  if (!graphData.drawList) graphData.drawList = graphData.order.filter(function (n) { return n.kind !== "sun"; });
  var list = graphData.drawList;
  list.sort(function (a, b) { return a.y - b.y; });
  gctx.textAlign = "center";
  list.forEach(function (n) {
    var p = toScreen(n.x, n.y, v.w, v.h), r = screenRadius(n);
    if (p[0] < -60 || p[1] < -60 || p[0] > v.w + 60 || p[1] > v.h + 60) return;   /* off screen */
    var isHot = n === graphSel || n === graphHover;
    var linked = !!v.near[n.id];
    /* the far half of an orbit sits behind the sun: fade it back */
    var depth = n.parent ? 0.72 + 0.28 * ((n.y - n.parent.y) / (n.r || 1) + 1) / 2 : 1;

    if (n.kind === "rock") drawRock(p, r, depth, isHot || linked);
    else drawPlanet(n, p, r, depth, v);
    if (isHot || linked) drawHalo(p, r);

    if (n.kind === "planet" || isHot || linked || v.k >= 1.6) {
      var label = n.title.length > 24 ? n.title.slice(0, 23) + "\u2026" : n.title;
      var ink = isHot ? GP.labelHot : linked ? GP.labelLinked : n.kind === "planet" ? GP.label : GP.labelDim;
      drawLabel(label, p[0], p[1] + r + 13, isHot ? "600 11px" : "11px", ink, isHot || linked ? 1 : 0.55 + depth * 0.4);
    }
  });
}

function drawRock(p, r, depth, lit) {
  gctx.globalAlpha = 0.5 * depth;
  gctx.fillStyle = lit ? GP.hot : GP.rock;
  disc(p[0], p[1], r);
  gctx.globalAlpha = 1;
}

/* a planet or moon: lit from the sun side, optional ring (back half, disc, front half), bands when close */
function drawPlanet(n, p, r, depth, v) {
  var look = bodyLook(n), ringed = look.ring && v.k > 0.5;
  var ang = Math.atan2(n.y, n.x);                  /* light comes from the sun */
  gctx.globalAlpha = depth;
  if (ringed) drawRingHalf(p, r, look, Math.PI, Math.PI * 2, GP.ringBack);
  var lx = p[0] - Math.cos(ang) * r * 0.45, ly = p[1] - Math.sin(ang) * r * 0.45;
  gctx.fillStyle = radial(lx, ly, r * 0.08, p[0], p[1], r * 1.15, [[0, look.lit], [0.55, look.lit], [1, look.dark]]);
  disc(p[0], p[1], r);
  if (v.k > 1.1 && n.kind === "planet" && r > 7) {   /* a couple of latitude bands, clipped to the disc */
    gctx.save();
    gctx.beginPath(); gctx.arc(p[0], p[1], r, 0, Math.PI * 2); gctx.clip();
    gctx.globalAlpha = depth * 0.20;
    gctx.fillStyle = look.dark;
    for (var b = 0; b < look.bands; b++) {
      var by = p[1] - r + (r * 2) * ((b + 1) / (look.bands + 1)) + Math.sin(v.t * 0.2 + look.spin * 4) * 1.5;
      gctx.fillRect(p[0] - r, by - r * 0.11, r * 2, r * 0.22);
    }
    gctx.restore();
    gctx.globalAlpha = depth;
  }
  if (ringed) drawRingHalf(p, r, look, 0, Math.PI, GP.ringFront);
  gctx.lineWidth = 1;
  gctx.globalAlpha = 1;
}

function drawRingHalf(p, r, look, from, to, ink) {
  gctx.strokeStyle = ink;
  gctx.lineWidth = Math.max(1, r * 0.28);
  gctx.beginPath();
  gctx.ellipse(p[0], p[1], r * 2.05, r * 2.05 * look.ringTilt, look.tilt, from, to);
  gctx.stroke();
}

/* glow and ring on whatever you are pointing at, and on its neighbours */
function drawHalo(p, r) {
  gctx.fillStyle = radial(p[0], p[1], r, p[0], p[1], r * 2.6, [[0, GP.halo[0]], [1, GP.halo[1]]]);
  disc(p[0], p[1], r * 2.6);
  gctx.strokeStyle = GP.hot;
  gctx.lineWidth = 1.4;
  gctx.beginPath(); gctx.arc(p[0], p[1], r + 2.5, 0, Math.PI * 2); gctx.stroke();
  gctx.lineWidth = 1;
}

/* a label with a halo, so it stays readable over stars */
function drawLabel(text, x, y, weightSize, ink, alpha) {
  gctx.font = weightSize + " " + GRAPH_FONT;
  gctx.globalAlpha = alpha;
  gctx.lineWidth = 3;
  gctx.strokeStyle = GP.labelHalo;
  gctx.strokeText(text, x, y);
  gctx.fillStyle = ink;
  gctx.fillText(text, x, y);
  gctx.globalAlpha = 1;
  gctx.lineWidth = 1;
}

/* small drawing helpers */
function disc(x, y, r) { gctx.beginPath(); gctx.arc(x, y, r, 0, Math.PI * 2); gctx.fill(); }
function radial(x0, y0, r0, x1, y1, r1, stops) {
  var g = gctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
  return g;
}

function graphNodeAt(sx, sy) {
  if (!graphData) return null;
  var w = graphCanvas.parentNode.clientWidth, h = graphCanvas.parentNode.clientHeight;
  for (var i = graphData.order.length - 1; i >= 0; i--) {
    var n = graphData.order[i], p = toScreen(n.x, n.y, w, h), r = Math.max(12, screenRadius(n) + 4);
    if ((sx - p[0]) * (sx - p[0]) + (sy - p[1]) * (sy - p[1]) <= r * r) return n;
  }
  return null;
}
function graphNodeByTitle(title) {
  var t = String(title).toLowerCase();
  for (var i = 0; i < graphData.nodes.length; i++) if (graphData.nodes[i].title.toLowerCase() === t) return graphData.nodes[i];
  return null;
}

/* ---- selection: zoom onto a body and show the note beside the canvas ---- */
function graphSelect(n) {
  graphSel = n;
  if (n) {
    cam.follow = n; cam.home = false;
    renderGraphSide(n);
    graphSide.classList.add("show");
    sizeCanvas();
    /* zoom relative to the visible canvas: about 260 world units across its short side */
    var wrap = graphCanvas.parentNode;
    cam.tk = Math.max(cam.k, Math.max(1.5, Math.min(6, Math.min(wrap.clientWidth, wrap.clientHeight) / 260)));
  } else {
    cam.follow = null; cam.home = true;
    graphSide.classList.remove("show");
    sizeCanvas();
    cam.tk = cam.fit;
  }
  cam.fit = fitScale();
}

function renderGraphSide(n) {
  var note = findNote(n.id);
  graphSide.innerHTML = "";
  if (!note) return;
  var head = document.createElement("div");
  head.className = "gs-head";
  var kind = n.kind === "sun" ? "Sun" : n.kind === "planet" ? "Planet of " + n.parent.title : n.kind === "moon" ? "Moon of " + n.parent.title : "Belt";
  head.innerHTML = '<div class="gs-title">' + esc(note.title) + '</div>' +
    '<div class="gs-meta">' + esc(kind) + " \u00b7 " + n.deg + (n.deg === 1 ? " link" : " links") + (note.path ? " \u00b7 " + esc(note.path) : "") + "</div>";
  var actions = document.createElement("div");
  actions.className = "gs-actions";
  var open = document.createElement("button");
  open.className = "new-btn"; open.textContent = "Open note";
  open.addEventListener("click", function () { closeGraph(); openInPane(note.id, focusedPane || panes[0]); renderSidebar(); });
  var split = document.createElement("button");
  split.className = "btn-mini"; split.textContent = "Open in split";
  split.addEventListener("click", function () { closeGraph(); addPane(focusedPane || panes[0], note.id); renderSidebar(); });
  var back = document.createElement("button");
  back.className = "btn-mini"; back.textContent = "Back out";
  back.addEventListener("click", function () { graphSelect(null); });
  actions.appendChild(open); actions.appendChild(split); actions.appendChild(back);
  head.appendChild(actions);
  graphSide.appendChild(head);

  var links = graphData.adj[n.id];
  if (links.length) {
    var lk = document.createElement("div");
    lk.className = "gs-links";
    lk.innerHTML = "Linked: " + links.map(function (m) { return '<span class="wl" data-wikilink="' + escAttr(m.title) + '">' + esc(m.title) + "</span>"; }).join(" ");
    graphSide.appendChild(lk);
  }

  var body = document.createElement("div");
  body.className = "gs-body";
  renderMarkdownInto(body, note.content);
  body.addEventListener("mousedown", function (e) {
    var wl = e.target.closest("[data-wikilink]");
    if (!wl) return;
    e.preventDefault();
    var target = graphNodeByTitle(wl.dataset.wikilink);
    if (target) graphSelect(target);
  });
  graphSide.appendChild(body);
  graphSide.addEventListener("mousedown", function (e) {
    var wl = e.target.closest(".gs-links [data-wikilink]");
    if (!wl) return;
    e.preventDefault();
    var target = graphNodeByTitle(wl.dataset.wikilink);
    if (target) graphSelect(target);
  });
}

/* ---- pointer: click selects, drag pans, wheel zooms about the cursor ---- */
graphCanvas.addEventListener("mousedown", function (e) {
  var pt = evLocal(graphCanvas, e), x = pt[0], y = pt[1];
  gDown = { node: graphNodeAt(x, y), x: x, y: y, cx: cam.x, cy: cam.y, moved: false };
});
graphCanvas.addEventListener("mousemove", function (e) {
  var pt = evLocal(graphCanvas, e), x = pt[0], y = pt[1];
  if (gDown && (e.buttons & 1)) {
    var dx = x - gDown.x, dy = y - gDown.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) gDown.moved = true;
    if (gDown.moved) {
      cam.follow = null; cam.home = false;
      cam.x = gDown.cx - dx / cam.k; cam.y = gDown.cy - dy / cam.k;
    }
    return;
  }
  graphHover = graphNodeAt(x, y);
  graphCanvas.style.cursor = graphHover ? "pointer" : "grab";
});
var gPick = null;          /* the note the last click chose, and when */
window.addEventListener("mouseup", function () {
  if (!gDown) return;
  var d = gDown; gDown = null;
  if (!d.moved && d.node) { graphSelect(d.node); gPick = { node: d.node, t: performance.now() }; }
});
graphCanvas.addEventListener("dblclick", function (e) {
  /* the first click starts the camera moving towards its note, so by the second click
     something else may be under the pointer: open the note the first click chose */
  var pt = evLocal(graphCanvas, e);
  var n = gPick && performance.now() - gPick.t < 600 ? gPick.node : graphNodeAt(pt[0], pt[1]);
  gPick = null;
  if (!n) return;
  closeGraph();
  openInPane(n.id, focusedPane || panes[0]);
  renderSidebar();
});
graphCanvas.addEventListener("wheel", function (e) {
  e.preventDefault();
  var rect = graphCanvas.getBoundingClientRect();
  var w = rect.width, h = rect.height;
  var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  var before = toWorld(sx, sy, w, h);
  var nk = Math.max(0.2, Math.min(6, cam.k * Math.exp(-e.deltaY * 0.0012)));
  cam.k = cam.tk = nk;
  if (!cam.follow) {
    /* keep the world point under the cursor fixed */
    cam.x = before[0] - (sx - w / 2) / nk;
    cam.y = before[1] - (sy - h / 2) / nk;
    cam.home = false;
  }
}, { passive: false });
/* the canvas changes size when the sidebar, a pane, or the reader column does - not only the window */
new ResizeObserver(function () {
  if (!state.graphOpen || !graphData) return;
  sizeCanvas();
  cam.fit = fitScale();
  if (!graphSel) cam.tk = cam.fit;
}).observe(graphCanvas.parentNode);

