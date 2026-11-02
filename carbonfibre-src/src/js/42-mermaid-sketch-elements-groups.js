/* ---- sketch elements: groups behind, then links, then the shapes ---- */
var MM_INK = { "fc-diamond": pc("orange"), "fc-pill": pc("blue"), "fc-circle": pc("blue"), "database": pc("green") };
/* A subgraph with its own direction whose nodes are only tied by invisible links ("~~~")
   is laid out as Mermaid does: each chain of nodes is a row along the subgraph's direction,
   rows stacked. During the main layout the subgraph is one block; afterwards it opens. */
function mmBlockGroups(g) {
  var PAD = 18, HEAD = 38, FOOT = 16, GX = 24, GY = 26, blocks = [];
  g.groups.forEach(function (gr) {
    if (!gr.dir) return;
    var mem = gr.members.filter(function (id) { return g.order.indexOf(id) !== -1; });
    if (mem.length < 2) return;
    var inMem = {}; mem.forEach(function (id) { inMem[id] = 1; });
    if (g.edges.some(function (e) { return !e.invisible && inMem[e.a] && inMem[e.b]; })) return;   /* real links inside: normal layout */
    var adj = {}; mem.forEach(function (id) { adj[id] = []; });
    g.edges.forEach(function (e) { if (e.invisible && inMem[e.a] && inMem[e.b]) { adj[e.a].push(e.b); adj[e.b].push(e.a); } });
    var seen = {}, rows = [];
    mem.forEach(function (id) {
      if (seen[id]) return;
      var row = [], q = [id]; seen[id] = 1;
      while (q.length) { var x = q.shift(); row.push(x); adj[x].forEach(function (y) { if (!seen[y]) { seen[y] = 1; q.push(y); } }); }
      rows.push(row);
    });
    mem.forEach(function (id) { mmSize(g.nodes[id]); });
    var cw = 0, ch = 0;
    mem.forEach(function (id) { var n = g.nodes[id]; cw = Math.max(cw, n.w); ch = Math.max(ch, n.h + (n.foot || 0)); });
    var across = gr.dir === "LR" || gr.dir === "RL";            /* chains run across, rows stack down */
    var longest = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    var cols = across ? longest : rows.length, lines = across ? rows.length : longest;
    var w = PAD * 2 + cols * cw + (cols - 1) * GX, h = HEAD + lines * ch + (lines - 1) * GY + FOOT;
    var bid = "\u00a7blk_" + gr.id;
    g.nodes[bid] = { id: bid, fixed: true, w: w, h: h, foot: 0, label: "", shape: "fc-box", lines: [""], group: null };
    var at = Math.min.apply(null, mem.map(function (id) { return g.order.indexOf(id); }));
    g.order = g.order.filter(function (id) { return !inMem[id]; });
    g.order.splice(Math.min(at, g.order.length), 0, bid);
    blocks.push({ gr: gr, bid: bid, rows: rows, cw: cw, ch: ch, across: across, mem: mem, inMem: inMem,
                  PAD: PAD, HEAD: HEAD, GX: GX, GY: GY, rev: gr.dir === "RL" || gr.dir === "BT" });
    gr.block = bid;
  });
  return blocks;
}
/* ---- box-by-box layout, as Mermaid does it ----
   Each box is laid out on its own, innermost first: its own states plus each inner box as one
   block, in the box's direction. The finished box is then a fixed-size block in its parent, and
   at the top the boxes are arranged as blocks. Links that cross boxes shape the layout of the
   level where both ends meet, and are routed afterwards. Laying every state out in one graph
   let links between phases pull states far from their box, and the boxes sprawled. */
function mmClusterLayout(g, all) {
  var PAD = 18, HEAD = 38, FOOT = 16;
  var groupById = {}; g.groups.forEach(function (x) { groupById[x.id] = x; });
  var chainOf = function (gr) { var c = []; while (gr) { c.push(gr); gr = gr.parent; } return c; };   /* innermost first */
  /* what an end of a link is, seen from inside box cl (null = the top level): the state itself,
     the inner box that holds it, or nothing if it is outside cl */
  var rep = function (id, isGroup, cl) {
    var start = isGroup ? groupById[id] : (g.nodes[id] ? g.nodes[id].group : undefined);
    if (start === undefined || (isGroup && !start)) return null;
    var chain = chainOf(start);
    if (cl === null) {
      if (!chain.length) return isGroup ? null : id;
      return "\u00a7cl_" + chain[chain.length - 1].id;
    }
    var k = chain.indexOf(cl);
    if (k < 0) return null;
    if (k === 0) return isGroup ? null : id;
    return "\u00a7cl_" + chain[k - 1].id;
  };
  function layout(cl) {
    var sg = { dir: (cl && cl.dir) || g.dir, nodes: {}, order: [], edges: [], groups: [], warnings: [], kind: g.kind };
    g.order.forEach(function (id) { if ((g.nodes[id].group || null) === cl) { sg.nodes[id] = g.nodes[id]; sg.order.push(id); } });
    var blocks = {};
    g.groups.filter(function (x) { return x.parent === cl; }).forEach(function (c) {
      var b = layout(c);
      if (!b) return;
      var bid = "\u00a7cl_" + c.id;
      blocks[bid] = b;
      sg.nodes[bid] = { id: bid, fixed: true, w: b.w, h: b.h, foot: 0, label: "", shape: "fc-box", lines: [""], group: null };
      sg.order.push(bid);
    });
    if (!sg.order.length) return null;
    var seen = {};
    all.forEach(function (e) {
      if (e.note) return;
      var a = rep(e.a, e.aGroup, cl), b = rep(e.b, e.bGroup, cl);
      if (!a || !b || a === b || !sg.nodes[a] || !sg.nodes[b] || seen[a + ">" + b]) return;
      seen[a + ">" + b] = 1;
      sg.edges.push({ a: a, b: b });
    });
    /* inside this level nothing is grouped: inner boxes are blocks */
    var kept = sg.order.map(function (id) { return sg.nodes[id].group; });
    sg.order.forEach(function (id) { sg.nodes[id].group = null; });
    mmLayout(sg);
    sg.order.forEach(function (id, i) { sg.nodes[id].group = kept[i]; });
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    sg.order.forEach(function (id) {
      var n = sg.nodes[id];
      x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x + n.w); y2 = Math.max(y2, n.y + n.h + (n.foot || 0));
    });
    var padX = cl ? PAD : 0, head = cl ? HEAD : 0, foot = cl ? FOOT : 0;
    var w = (x2 - x1) + padX * 2, h = (y2 - y1) + head + foot;
    return { w: w, h: h, place: function (ox, oy) {
      if (cl) cl.rect = { x1: ox, y1: oy, x2: ox + w, y2: oy + h };
      sg.order.forEach(function (id) {
        var n = sg.nodes[id], nx = ox + padX + (n.x - x1), ny = oy + head + (n.y - y1);
        if (blocks[id]) blocks[id].place(nx, ny); else { n.x = nx; n.y = ny; }
      });
    } };
  }
  var root = layout(null);
  if (root) root.place(0, 0);
}
function mermaidToElements(src) {
  var g = parseMermaid(src);
  /* notes are placed after the layout, beside what they describe: in it they had no arrows in and
     landed first, far from their targets */
  var noteIds = g.order.filter(function (id) { return g.nodes[id].note; });
  g.order = g.order.filter(function (id) { return !g.nodes[id].note; });
  var clustered = g.kind === "state" || g.groups.some(function (x) { return x.parent; });
  var all = g.edges.slice(), blocks = clustered ? [] : mmBlockGroups(g), owner = {};
  blocks.forEach(function (bk) { bk.mem.forEach(function (id) { owner[id] = bk.bid; }); });
  var groupById = {}; g.groups.forEach(function (gr) { groupById[gr.id] = gr; });
  /* the layout sees blocks for grids, a subgraph link as a link to its block (or first node) */
  var end = function (id, isGroup) {
    if (isGroup) { var gr = groupById[id]; if (!gr) return null; return gr.block || gr.members[0] || null; }
    return owner[id] || id;
  };
  var seenL = {};
  g.edges = [];
  if (clustered) { mmClusterLayout(g, all); all.forEach(function (e) { e.via = null; }); }
  else all.forEach(function (e) {
    if (e.note) return;                                  /* notes are placed afterwards */
    var a = end(e.a, e.aGroup), b = end(e.b, e.bGroup);
    if (!a || !b || a === b || !g.nodes[a] || !g.nodes[b]) return;
    var plain = a === e.a && b === e.b && !e.aGroup && !e.bGroup;
    var key = a + ">" + b;
    if (!plain && seenL[key]) return;
    seenL[key] = 1;
    g.edges.push({ a: a, b: b, orig: plain ? e : null });
  });
  if (!clustered) mmLayout(g);
  if (!clustered) all.forEach(function (e) { e.via = null; });
  g.edges.forEach(function (le) { if (le.orig && le.via) le.orig.via = le.via; });
  /* open each block into its grid */
  blocks.forEach(function (bk) {
    var B = g.nodes[bk.bid];
    bk.rows.forEach(function (row, r) {
      var seq = bk.rev ? row.slice().reverse() : row;
      seq.forEach(function (id, k) {
        var n = g.nodes[id], col = bk.across ? k : r, line = bk.across ? r : k;
        n.x = B.x + bk.PAD + col * (bk.cw + bk.GX) + (bk.cw - n.w) / 2;
        n.y = B.y + bk.HEAD + line * (bk.ch + bk.GY) + (bk.ch - n.h - (n.foot || 0)) / 2;
      });
    });
    g.order = g.order.filter(function (id) { return id !== bk.bid; }).concat(bk.mem);
  });
  var zones = [], links = [], shapes = [], idOf = {}, zoneOf = {};
  /* each box wraps its own members and any boxes inside it (worked out innermost first), with
     room for its title; outer boxes are drawn first so the inner ones sit on top */
  var rectOf = {};
  var boundsOf = function (gr) {
    if (gr.id in rectOf) return rectOf[gr.id];
    if (gr.rect) return (rectOf[gr.id] = gr.rect);
    var r = null;
    if (gr.block) { var B = g.nodes[gr.block]; r = { x1: B.x, y1: B.y, x2: B.x + B.w, y2: B.y + B.h }; }
    else {
      var bx = [];
      gr.members.forEach(function (i) { var n = g.nodes[i]; if (n && n.x !== undefined) bx.push([n.x, n.y, n.x + n.w, n.y + n.h + (n.foot || 0)]); });
      g.groups.forEach(function (c) { if (c.parent === gr) { var cr = boundsOf(c); if (cr) bx.push([cr.x1, cr.y1, cr.x2, cr.y2]); } });
      if (bx.length) r = {
        x1: Math.min.apply(null, bx.map(function (b) { return b[0]; })) - 18, y1: Math.min.apply(null, bx.map(function (b) { return b[1]; })) - 38,
        x2: Math.max.apply(null, bx.map(function (b) { return b[2]; })) + 18, y2: Math.max.apply(null, bx.map(function (b) { return b[3]; })) + 16 };
    }
    return (rectOf[gr.id] = r);
  };
  var depthOf = function (gr) { var d = 0; while (gr.parent) { gr = gr.parent; d++; } return d; };
  g.groups.slice().sort(function (a, b) { return depthOf(a) - depthOf(b); }).forEach(function (gr) {
    var rb = boundsOf(gr);
    if (!rb) return;
    var x1 = rb.x1, y1 = rb.y1, x2 = rb.x2, y2 = rb.y2;
    var z = skBase("rectangle", x1, y1, pc("grey"), 1);
    z.width = x2 - x1; z.height = y2 - y1; z.fill = "transparent";
    var t = skBase("text", x1 + 10, y1 + 8, pc("grey"), 1);
    t.text = t.originalText = gr.title; t.fontSize = 13; t.width = gr.title.length * 7.2; t.height = 16;
    zones.push(z, t); zoneOf[gr.id] = z.id;
  });
  /* notes beside their target (a state, or a box): right of it, or left for "note left of";
     moved down until they clear every shape and box they would land on */
  var taken = [];
  g.order.forEach(function (i) { var n = g.nodes[i]; if (n.x !== undefined) taken.push([n.x, n.y, n.x + n.w, n.y + n.h + (n.foot || 0)]); });
  noteIds.forEach(function (nid) {
    var n = g.nodes[nid], e = all.filter(function (x) { return x.a === nid; })[0];
    if (!e) return;
    mmSize(n);
    var tb = rectOf[e.b] ? [rectOf[e.b].x1, rectOf[e.b].y1, rectOf[e.b].x2, rectOf[e.b].y2]
      : g.nodes[e.b] && g.nodes[e.b].x !== undefined ? [g.nodes[e.b].x, g.nodes[e.b].y, g.nodes[e.b].x + g.nodes[e.b].w, g.nodes[e.b].y + g.nodes[e.b].h] : null;
    if (!tb) return;
    if (rectOf[e.b]) e.bGroup = true;
    var x = e.side === "left" ? tb[0] - 40 - n.w : tb[2] + 40, y = tb[1];
    var hits = function (yy) {
      var r = [x - 10, yy - 10, x + n.w + 10, yy + n.h + 10];
      return taken.concat(Object.keys(rectOf).filter(function (k) { return rectOf[k] && k !== e.b; }).map(function (k) { return [rectOf[k].x1, rectOf[k].y1, rectOf[k].x2, rectOf[k].y2]; }))
        .some(function (b) { return b[0] < r[2] && r[0] < b[2] && b[1] < r[3] && r[1] < b[3]; });
    };
    for (var tries = 0; tries < 60 && hits(y); tries++) y += 40;
    n.x = x; n.y = y;
    taken.push([x, y, x + n.w, y + n.h]);
    g.order.push(nid);
  });
  g.order.forEach(function (i) {
    var n = g.nodes[i];
    if (n.x === undefined) return;
    var stl = n.style || {};
    var el = skBase("stencil", n.x, n.y, stl.stroke || MM_INK[n.shape] || "#e2e3e5", stl.width || 2);
    el.shape = n.shape; el.label = n.lines.join("\n"); el.width = n.w; el.height = n.h;
    /* a box tall because it holds more lines keeps 13px text: labels grow with a box's height
       (for shapes resized by hand), which made multi-line boxes' text overflow them */
    if (skIsFlow(n.shape) && n.lines.length > 1) { var defH = skStencilSize(n.shape).h; if (n.h > defH) el.labelScale = defH / n.h; }
    el.fill = stl.fill || "transparent";
    if (stl.color) el.textColor = stl.color;                  /* Mermaid's text colour */
    if (stl.dashed) el.strokeStyle = "dashed";
    idOf[i] = el.id; shapes.push(el);
  });
  /* Links are routed like Tidy's: right-angled circuit traces, so links that meet a shape
     get their own ports, fan-ins and fan-outs share a bus, parallel runs keep apart, and a
     link pointing back up the flow is drawn as a return loop round the side instead of
     running back over the link it answers. (Curved splines through these points used to
     pile arrowheads onto one spot and wobble on long links.) */
  var rankOf = function (id) { var n = g.nodes[owner[id] || id]; return n ? n.rank : undefined; };
  all.forEach(function (e) {
    if (e.invisible) return;                                  /* "~~~" shapes the layout only */
    var from = e.aGroup ? zoneOf[e.a] : idOf[e.a], to = e.bGroup ? zoneOf[e.b] : idOf[e.b];
    if (!from || !to || from === to) return;
    var c = skBase(e.arrow ? "arrow" : "line", 0, 0, pc("orange"), e.thick ? 3.5 : 2);
    c.points = [[0, 0], [0, 0]]; c.fromId = from; c.toId = to; c.label = e.label || "";
    var ra = rankOf(e.a), rb = rankOf(e.b), plain = !e.aGroup && !e.bGroup;
    var backward = plain && !e.both && ra !== undefined && rb !== undefined && rb <= ra;
    if (clustered && plain && !e.both) {                 /* boxes laid out separately: compare positions */
      var na = g.nodes[e.a], nb = g.nodes[e.b], tbFlow = g.dir === "TB" || g.dir === "BT";
      backward = tbFlow ? nb.y + nb.h / 2 < na.y + na.h / 2 - 20 === (g.dir === "TB") : nb.x + nb.w / 2 < na.x + na.w / 2 - 20 === (g.dir === "LR");
    }
    if (backward) c.loop = true;
    else if (e.via && plain) c.via = e.via;
    c.curve = "circuit";
    c.flow = g.dir === "TB" || g.dir === "BT" ? "TB" : "LR";
    if (e.dashed) c.strokeStyle = "dashed";
    if (e.arrow) { c.startArrowhead = e.both ? "arrow" : null; c.endArrowhead = "arrow"; }
    links.push(c);
  });
  skAssignNets(links.filter(function (c) { return !c.loop && !c.startArrowhead; }));   /* buses, as Tidy makes them */
  return { elements: zones.concat(links, shapes), warnings: g.warnings, nodes: shapes.length, links: links.length };
}

/* convert the Mermaid block that opens at line openIdx, adding a sketch right after it */
function convertMermaid(p, openIdx) {
  var m = p.fmeta[openIdx];
  if (!m || m.fence !== "open" || !/^mermaid$/i.test(m.lang || "")) { pushToastLike("Put the cursor in a Mermaid block first."); return false; }
  var close = openIdx + 1;
  while (close < p.lines.length && !(p.fmeta[close] && p.fmeta[close].fence === "close")) close++;
  var res;
  try { res = mermaidToElements(p.lines.slice(openIdx + 1, close).join("\n")); }
  catch (e) { pushToastLike(e.message); return false; }
  histBreak(p);
  Array.prototype.splice.apply(p.lines, [close + 1, 0, "", "```excalidraw", JSON.stringify(skDoc(res.elements)), "```"]);
  p.commit(true);
  p.activeLine = null;
  p.render();
  pushToastLike("Converted: " + res.nodes + (res.nodes === 1 ? " shape, " : " shapes, ") + res.links + (res.links === 1 ? " link" : " links") +
    (res.warnings.length ? ". " + res.warnings[0] : "."));
  return true;
}
/* the Mermaid block under the cursor, or else the first one in the note */
function mermaidBlockFor(p) {
  var from = p.activeLine;
  if (from !== null && from !== undefined) {
    for (var i = from; i >= 0; i--) {
      var m = p.fmeta[i] || {};
      if (m.fence === "open") return /^mermaid$/i.test(m.lang || "") ? i : -1;
      if (m.fence === "close" && i !== from) break;
    }
  }
  for (var j = 0; j < p.lines.length; j++) if ((p.fmeta[j] || {}).fence === "open" && /^mermaid$/i.test(p.fmeta[j].lang || "")) return j;
  return -1;
}
