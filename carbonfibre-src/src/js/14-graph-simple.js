/* ============================================================
   graph view, simple: dots and lines, laid out by a small force simulation.
   The website always shows this one. The desktop app shows it too unless you switch to the
   solar system (js/14-graph.js) with the button in the graph's top bar; the choice is kept.
   It shares the solar system's camera, picking, side panel and keys: openGraph, tickGraph and
   drawGraph hand over to SimpleGraph when graphData.simple is set.
   ============================================================ */
const SimpleGraph = {
  KEY: "carbonfibre-graph",
  LINK: 70,                                       /* resting length of a link, in world units */
  CELL: 140,                                      /* repulsion reaches about this far */

  /* the solar system is a choice in the desktop app only */
  choosable() { return !!Dialogs.desktop; },
  on() {
    if (!SimpleGraph.choosable()) return true;
    try { return localStorage.getItem(SimpleGraph.KEY) !== "planets"; } catch (e) { return true; }
  },
  setMode(simple) {
    try { if (simple) localStorage.removeItem(SimpleGraph.KEY); else storeSet(SimpleGraph.KEY, "planets"); } catch (e) { /* storage off */ }
    if (state.graphOpen) openGraph();
  },

  /* the top bar: its title, hint and (desktop) the switch */
  bar(g) {
    const simple = !!g.simple;
    const title = document.getElementById("graphTitle"), hint = document.getElementById("graphHint"), b = document.getElementById("graphMode");
    if (title) title.textContent = simple ? "Graph" : "Solar system";
    if (hint) hint.innerHTML = simple
      ? "Scroll to zoom &middot; drag to pan &middot; drag a dot to move it &middot; click a note to read it &middot; double-click opens it &middot; Esc backs out"
      : "Scroll to zoom &middot; drag to pan &middot; click a body to read it &middot; double-click opens it &middot; Esc backs out";
    if (b) {
      b.hidden = !SimpleGraph.choosable();
      b.textContent = simple ? "Show as planets" : "Show as simple graph";
    }
  },

  /* starting places: each group of linked notes grows out from its most-linked note, every note
     a link's length from the one that reached it; groups sit on a sunflower spiral. Starting
     close to the answer leaves fewer crossings, and the same vault opens the same way. */
  plan(g) {
    const nodes = g.nodes.slice().sort(function (a, b) { return b.deg - a.deg || (a.title < b.title ? -1 : 1); });
    const adj = {}, L = SimpleGraph.LINK;
    g.simple = true; g.order = nodes; g.adj = adj; g.planets = []; g.drawList = null;
    nodes.forEach(function (n) { adj[n.id] = []; });
    g.edges.forEach(function (e) { adj[e.a.id].push(e.b); adj[e.b.id].push(e.a); });
    const focusId = focusedPane ? String(focusedPane.noteId) : null;
    g.sun = nodes.find(function (n) { return String(n.id) === focusId; }) || nodes[0] || null;
    const placed = new Set();
    let group = 0;
    nodes.forEach(function (root) {
      if (placed.has(root)) return;
      const r0 = L * 3 * Math.sqrt(group), a0 = group * 2.39996;
      group++;
      root.x = Math.cos(a0) * r0; root.y = Math.sin(a0) * r0; root.dir = a0;
      placed.add(root);
      const queue = [root];
      while (queue.length) {
        const c = queue.shift(), kids = adj[c.id].filter(function (m) { return !placed.has(m); });
        kids.forEach(function (m, i) {
          /* children fan out away from where their parent came from */
          const spread = c === root ? Math.PI * 2 : Math.PI * 0.9;
          const a = c.dir + (kids.length === 1 ? 0 : (i / (c === root ? kids.length : kids.length - 1) - (c === root ? 0 : 0.5)) * spread);
          m.x = c.x + Math.cos(a) * L; m.y = c.y + Math.sin(a) * L; m.dir = a;
          placed.add(m); queue.push(m);
        });
      }
    });
    nodes.forEach(function (n) {
      n.vx = 0; n.vy = 0; n.kind = "note"; n.parent = null; n.r = 0; n.pinned = false;
      n.size = 3.5 + Math.min(9, Math.sqrt(n.deg) * 1.8);
    });
    g.heat = 1;
    /* settle most of the way before the first frame: up to ~150 ms, then the rest is animated */
    const t0 = performance.now();
    for (let i = 0; i < 400 && performance.now() - t0 < 150; i++) SimpleGraph.step(g);
    SimpleGraph.measure(g);
  },
  measure(g) {
    let far = 0;
    g.order.forEach(function (n) { far = Math.max(far, Math.abs(n.x), Math.abs(n.y)); });
    g.outer = Math.max(MIN_ORBIT, far);
  },

  /* one step: nearby notes push apart, links pull together, a weak pull to the middle keeps
     unlinked notes from drifting off. Pushing only reaches neighbouring grid cells, so a few
     thousand notes stay quick. heat cools to nothing, and the picture then stops moving. */
  step(g) {
    if (g.heat < 0.004) return;
    const C = SimpleGraph.CELL, cells = new Map(), key = function (cx, cy) { return cx + "," + cy; };
    g.order.forEach(function (n) {
      const k = key(Math.floor(n.x / C), Math.floor(n.y / C));
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(n);
    });
    const push = 7000 * g.heat;
    g.order.forEach(function (n) {
      const cx = Math.floor(n.x / C), cy = Math.floor(n.y / C);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const list = cells.get(key(cx + dx, cy + dy));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const m = list[i];
          if (m === n) continue;
          let ddx = n.x - m.x, ddy = n.y - m.y, d2 = ddx * ddx + ddy * ddy;
          if (d2 > C * C) continue;
          if (d2 < 0.01) { ddx = (n.id < m.id ? 1 : -1) * 0.1; ddy = 0.1; d2 = 0.02; }   /* on top of each other: a fixed nudge */
          const f = push / d2;
          n.vx += ddx * f / Math.sqrt(d2); n.vy += ddy * f / Math.sqrt(d2);
        }
      }
    });
    g.edges.forEach(function (e) {
      const a = e.a, b = e.b, dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - SimpleGraph.LINK) * 0.06 * g.heat;
      a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
    });
    g.order.forEach(function (n) {
      n.vx -= n.x * 0.004 * g.heat; n.vy -= n.y * 0.004 * g.heat;
      if (n.pinned) { n.vx = n.vy = 0; return; }
      n.vx *= 0.6; n.vy *= 0.6;
      const sp = Math.sqrt(n.vx * n.vx + n.vy * n.vy), cap = 30;
      if (sp > cap) { n.vx *= cap / sp; n.vy *= cap / sp; }
      n.x += n.vx; n.y += n.vy;
    });
    g.heat *= 0.99;
  },

  /* dragging a dot: it follows the pointer and the others make room */
  drag(n, wx, wy) {
    n.pinned = true; n.x = wx; n.y = wy;
    graphData.heat = Math.max(graphData.heat, 0.25);
  },
  release(n) { n.pinned = false; },

  /* one frame, in the page's own colours (so a custom theme reaches it too) */
  draw(w, h) {
    const css = getComputedStyle(document.documentElement), col = function (v, d) { return css.getPropertyValue(v).trim() || d; };
    const bg = col("--bg", "#18181b"), line = col("--line", "#2e2e33"), dim = col("--dim", "#a1a1aa"), txt = col("--txt", "#e4e4e7"), acc = col("--acc", "#5b8def");
    gctx.clearRect(0, 0, w, h);
    gctx.fillStyle = bg;
    gctx.fillRect(0, 0, w, h);
    const g = graphData;
    if (!g.order.length) return;
    const hot = graphSel || graphHover, near = {};
    if (hot) g.adj[hot.id].forEach(function (m) { near[m.id] = true; });
    const P = function (n) { return toScreen(n.x, n.y, w, h); };

    gctx.lineWidth = 1;
    gctx.strokeStyle = line;
    gctx.globalAlpha = hot ? 0.5 : 1;
    gctx.beginPath();
    g.edges.forEach(function (e) {
      if (hot && (e.a === hot || e.b === hot)) return;
      const a = P(e.a), b = P(e.b);
      gctx.moveTo(a[0], a[1]); gctx.lineTo(b[0], b[1]);
    });
    gctx.stroke();
    gctx.globalAlpha = 1;
    if (hot) {
      gctx.strokeStyle = acc; gctx.lineWidth = 1.5;
      gctx.beginPath();
      g.adj[hot.id].forEach(function (m) { const a = P(hot), b = P(m); gctx.moveTo(a[0], a[1]); gctx.lineTo(b[0], b[1]); });
      gctx.stroke();
    }

    g.order.forEach(function (n) {
      const p = P(n), r = screenRadius(n), lit = n === hot || near[n.id];
      gctx.globalAlpha = hot && !lit ? 0.35 : 1;
      gctx.fillStyle = lit ? acc : dim;
      disc(p[0], p[1], r);
      if (n === g.sun && !hot) { gctx.strokeStyle = acc; gctx.lineWidth = 1.5; gctx.beginPath(); gctx.arc(p[0], p[1], r + 3, 0, Math.PI * 2); gctx.stroke(); }
    });
    /* names: always for the hot note and its neighbours; for everyone in a small vault or once zoomed in */
    gctx.font = "12px " + GRAPH_FONT;
    gctx.textAlign = "center"; gctx.textBaseline = "top";
    g.order.forEach(function (n) {
      const lit = n === hot || near[n.id];
      if (!lit && cam.k < 0.9 && n.deg < 6 && g.order.length > 80) return;
      const p = P(n);
      gctx.globalAlpha = hot && !lit ? 0.3 : 1;
      gctx.fillStyle = n === hot ? txt : (lit ? txt : dim);
      gctx.fillText(n.title, p[0], p[1] + screenRadius(n) + 4);
    });
    gctx.globalAlpha = 1;
  },

  init() {
    const b = document.getElementById("graphMode");
    if (b) b.addEventListener("click", function () { SimpleGraph.setMode(!(graphData && graphData.simple)); });
  }
};
SimpleGraph.init();
