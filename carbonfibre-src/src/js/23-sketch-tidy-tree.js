/* ============================================================
   Tidy and Tree: one-shot commands. They arrange once, when asked, and then leave the
   board alone - no live mode rearranging things while you sketch. Before arranging:
   loose arrows whose ends touch shapes are connected to them, and text sitting beside a
   shape travels with it, so nothing is left behind. One undo step reverses all of it, and
   the view fits the result if it would otherwise run off-screen.
   ============================================================ */
function skAdoptLooseArrows() {
  var shapes = sk.elements.filter(function (e) { return e.type === "stencil" && !e.isDeleted; });
  var near = function (wx, wy) {
    var best = null, bd = Infinity;
    shapes.forEach(function (s) {
      var b = skBox(s), m = 24;
      if (wx < b.x - m || wx > b.x + b.w + m || wy < b.y - m || wy > b.y + b.h + m + 20) return;
      var d = Math.hypot(wx - (b.x + b.w / 2), wy - (b.y + b.h / 2));
      if (d < bd) { bd = d; best = s; }
    });
    return best;
  };
  var n = 0;
  sk.elements.forEach(function (el) {
    if (el.isDeleted || (el.type !== "arrow" && el.type !== "line") || el.fromId || el.toId || !el.points || el.points.length < 2) return;
    var p0 = el.points[0], p1 = el.points[el.points.length - 1];
    var a = near(el.x + p0[0], el.y + p0[1]), b = near(el.x + p1[0], el.y + p1[1]);
    if (!a || !b || a === b) return;
    el.fromId = a.id; el.toId = b.id; el.points = [[0, 0], [0, 0]];
    if (!el.curve) el.curve = "elbow";
    n++;
  });
  return n;
}
/* free text beside a shape (a hand-written caption, say) moves with that shape */
function skFindCaptions() {
  var shapes = sk.elements.filter(function (e) { return e.type === "stencil" && !e.isDeleted; });
  var zoneTitles = {};
  skFindZones(shapes).forEach(function (z) { if (z.text) zoneTitles[z.text.id] = 1; });
  var caps = [];
  sk.elements.forEach(function (t) {
    if (t.type !== "text" || t.isDeleted || t.containerId || zoneTitles[t.id]) return;
    var tb = skBox(t), best = null, bd = Infinity;
    shapes.forEach(function (s) {
      var b = skBox(s), under = s.label && !skIsFlow(s.shape) ? skLabelSize(s) * 1.8 : 0;
      /* the gap between the text's edges and the shape's (label included) */
      var gx = Math.max(0, b.x - (tb.x + tb.w), tb.x - (b.x + b.w));
      var gy = Math.max(0, b.y - (tb.y + tb.h), tb.y - (b.y + b.h + under));
      var d = Math.hypot(gx, gy);
      if (d <= 40 && d < bd) { bd = d; best = s; }
    });
    if (best) caps.push({ text: t, shape: best, dx: t.x - best.x, dy: t.y - best.y });
  });
  return caps;
}
/* which way the board already reads: a diagram arranged left to right (the templates) stays
   that way; anything else is laid out top-down */
function skBoardFlow() {
  if (sk.dir) return sk.dir;                       /* the direction you last chose (Orientate or the menu) */
  var lr = 0, tb = 0;
  sk.elements.forEach(function (c) { if (!c.isDeleted && skIsConnector(c)) { if (c.flow === "LR") lr++; else if (c.flow === "TB") tb++; } });
  return lr > tb ? "LR" : "TB";
}
/* Orientate: a quarter turn clockwise each press - flow down, then left, up, right */
var SK_ORIENT_NEXT = { TB: "RL", RL: "BT", BT: "LR", LR: "TB" };
var SK_ORIENT_NAME = { TB: "top to bottom", RL: "right to left", BT: "bottom to top", LR: "left to right" };
function skOrientate() {
  if (!sk || sk.animating) return;
  if (!sk.elements.some(function (c) { return !c.isDeleted && skIsConnector(c) && skFindEl(c.fromId) && skFindEl(c.toId); })) {
    pushToastLike("Nothing to orientate: connect some shapes first."); return;
  }
  var next = SK_ORIENT_NEXT[skBoardFlow()] || "LR";
  skSnapshot();
  var adopted = skAdoptLooseArrows();                   /* connect hand-drawn arrows before turning anything */
  skAutoSplitPass();
  /* Turn positions a quarter turn first, out of sight, so the new layout inherits the old
     order (left-to-right becomes top-to-bottom, and so on) - four presses then bring the
     diagram back exactly. The glide still starts from where things are on screen. */
  var orig = {}, live = sk.elements.filter(function (e) { return !e.isDeleted && !skIsConnector(e) && e.type !== "arrow" && e.type !== "line"; });
  live.forEach(function (e) { orig[e.id] = [e.x, e.y, e.width, e.height]; });
  var zones = skFindZones(live.filter(function (e) { return e.type === "stencil"; }));
  var b = null;
  live.forEach(function (e) { var x = skBox(e); b = b ? [Math.min(b[0], x.x), Math.min(b[1], x.y), Math.max(b[2], x.x + x.w), Math.max(b[3], x.y + x.h)] : [x.x, x.y, x.x + x.w, x.y + x.h]; });
  var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  live.forEach(function (e) {
    var w = Math.abs(e.width), h = Math.abs(e.height), mx = e.x + w / 2, my = e.y + h / 2;
    var nx = cx - (my - cy), ny = cy + (mx - cx);               /* clockwise, y pointing down */
    if (e.type === "rectangle") { e.width = h; e.height = w; e.x = nx - h / 2; e.y = ny - w / 2; }
    else { e.x = nx - w / 2; e.y = ny - h / 2; }
  });
  zones.forEach(function (z) { if (z.text) { z.text.x = z.rect.x + 10; z.text.y = z.rect.y + 8; } });   /* titles stay at the top-left */
  sk.preRotate = orig;
  skArrange("tidy", next, true);
  if (sk.preRotate) {                                   /* nothing was arranged after all: put it back */
    Object.keys(orig).forEach(function (id) { var e = skFindEl(id), o = orig[id]; if (e) { e.x = o[0]; e.y = o[1]; e.width = o[2]; e.height = o[3]; } });
    sk.preRotate = null; skDraw();
  }
  pushToastLike("Layout: " + SK_ORIENT_NAME[next] + "." + (adopted ? " Connected " + adopted + (adopted === 1 ? " loose arrow." : " loose arrows.") : ""));
}
/* ---- automatic splitters ----
   On Tidy, a shape linking to three or more targets gets one trunk to a splitter that
   branches to each of them; three or more shapes feeding one target join at a splitter
   first. Auto splitters are dissolved and worked out afresh on every Tidy (same ids each
   time, so pressing again changes nothing); splitters you placed yourself are left alone,
   and so is an auto splitter you have since wired up differently. */
/* every routing hint a layout or a hand edit can leave on a link, in one place */
function skLinkHintsClear(c) {
  delete c.via; delete c.lanes; delete c.lanesAbs; delete c.autoVia; delete c.loop;
  delete c.ports; delete c.loopSide; delete c.netKey; delete c.segs;
}
function skDissolveAutoSplitters() {
  var gone = {};
  sk.autoSplitAt = {};                             /* where each one was, so a re-added one starts there */
  sk.elements.forEach(function (j) {
    if (j.isDeleted || !skIsSplitter(j) || !j.autoSplit) return;
    var ins = sk.elements.filter(function (c) { return !c.isDeleted && skIsConnector(c) && c.toId === j.id; });
    var outs = sk.elements.filter(function (c) { return !c.isDeleted && skIsConnector(c) && c.fromId === j.id; });
    sk.autoSplitAt[j.id] = [j.x, j.y];
    if (j.autoSplit === "shared" && j.autoPrimary) {
      outs.forEach(function (o) { o.fromId = j.autoPrimary; skLinkHintsClear(o); });
      ins.forEach(function (i) { gone[i.id] = 1; });
      (j.autoKeep || []).forEach(function (k) { sk.elements.push(skFullEl(k)); });
      gone[j.id] = 1;
    } else if (j.autoSplit === "out" && ins.length === 1) {
      outs.forEach(function (o) { o.fromId = ins[0].fromId; skLinkHintsClear(o); });
      gone[ins[0].id] = gone[j.id] = 1;
    } else if (j.autoSplit === "in" && outs.length === 1) {
      ins.forEach(function (i) { i.toId = outs[0].toId; skLinkHintsClear(i); });
      gone[outs[0].id] = gone[j.id] = 1;
    } else delete j.autoSplit;                     /* rewired by hand: it is yours now */
  });
  sk.elements = sk.elements.filter(function (e) { return !gone[e.id]; });
}
function skInsertAutoSplitters() {
  var conns = sk.elements.filter(function (c) {
    if (c.isDeleted || !skIsConnector(c) || c.fromId === c.toId || c.startArrowhead) return false;
    var a = skFindEl(c.fromId), b = skFindEl(c.toId);
    return a && b && !skIsSplitter(a) && !skIsSplitter(b);
  });
  var dir = {};
  conns.forEach(function (c) { dir[c.fromId + ">" + c.toId] = 1; });
  conns = conns.filter(function (c) { return !dir[c.toId + ">" + c.fromId]; });      /* two-way pairs stay as they are */
  /* each shape's level (longest path from a start, feedback links ignored): a splitter
     only bundles links that step down exactly one level, to siblings - never feedback
     loops or links that skip levels */
  var outN = {}, state = {}, back = {}, lvl = {};
  conns.forEach(function (c) { (outN[c.fromId] = outN[c.fromId] || []).push(c); });
  var nodes = {};
  conns.forEach(function (c) { nodes[c.fromId] = nodes[c.toId] = 1; });
  var visit = function (u) {
    state[u] = 1;
    (outN[u] || []).forEach(function (c) {
      if (state[c.toId] === 1) back[c.id] = 1;                  /* closes a loop */
      else if (!state[c.toId]) visit(c.toId);
    });
    state[u] = 2;
  };
  Object.keys(nodes).sort().forEach(function (u) { if (!state[u]) visit(u); });
  Object.keys(nodes).forEach(function (u) { lvl[u] = 0; });
  for (var pass = 0; pass < Object.keys(nodes).length; pass++) {
    var moved = false;
    conns.forEach(function (c) { if (!back[c.id] && lvl[c.toId] < lvl[c.fromId] + 1) { lvl[c.toId] = lvl[c.fromId] + 1; moved = true; } });
    if (!moved) break;
  }
  /* a shape nothing feeds sits one level above the first thing it feeds, as the layout puts it */
  var hasIn = {};
  conns.forEach(function (c) { if (!back[c.id]) hasIn[c.toId] = 1; });
  Object.keys(nodes).forEach(function (u) {
    if (hasIn[u] || !(outN[u] || []).length) return;
    var kids = outN[u].filter(function (c) { return !back[c.id]; }).map(function (c) { return lvl[c.toId]; });
    if (kids.length) lvl[u] = Math.max(lvl[u], Math.min.apply(null, kids) - 1);
  });
  conns = conns.filter(function (c) { return !back[c.id] && lvl[c.toId] === lvl[c.fromId] + 1; });
  var made = 0, used = {};
  var centre = function (id) { var e = skFindEl(id); return [e.x + Math.abs(e.width) / 2, e.y + Math.abs(e.height) / 2]; };
  var addSplit = function (id, kind, near, like) {
    var was = sk.autoSplitAt && sk.autoSplitAt[id];
    var j = skBase("stencil", was ? was[0] : near[0] - 8, was ? was[1] : near[1] - 8, like.strokeColor, like.strokeWidth);
    j.id = id; j.shape = "splitter"; j.width = 16; j.height = 16; j.label = ""; j.fill = "transparent"; j.autoSplit = kind;
    return j;
  };
  var trunk = function (id, from, to, like) {
    var t = JSON.parse(JSON.stringify(like));
    t.id = id; t.fromId = from; t.toId = to; t.label = ""; t.startArrowhead = null; skLinkHintsClear(t);
    return t;
  };
  var bySrc = {};
  conns.forEach(function (c) { (bySrc[c.fromId] = bySrc[c.fromId] || []).push(c); });
  /* sources that feed exactly the same targets share one splitter, like a switch: one trunk
     in from each source, one branch out to each target - instead of competing buses */
  var bySet = {};
  Object.keys(bySrc).forEach(function (src) {
    var tg = {};
    bySrc[src].forEach(function (c) { tg[c.toId] = 1; });
    if (Object.keys(tg).length !== bySrc[src].length || bySrc[src].length < 2) return;   /* one link per target */
    var key = Object.keys(tg).sort().join("|");
    (bySet[key] = bySet[key] || []).push(src);
  });
  Object.keys(bySet).forEach(function (key) {
    var srcs = bySet[key].sort();
    if (srcs.length < 2) return;
    var primary = srcs[0], tgts = key.split("|"), m = [0, 0], c0 = [0, 0];
    tgts.forEach(function (t) { var q = centre(t); m[0] += q[0] / tgts.length; m[1] += q[1] / tgts.length; });
    srcs.forEach(function (s0) { var q = centre(s0); c0[0] += q[0] / srcs.length; c0[1] += q[1] / srcs.length; });
    var jid = "as-m-" + srcs.join("+");
    var j = addSplit(jid, "shared", [(c0[0] + m[0]) / 2, (c0[1] + m[1]) / 2], bySrc[primary][0]);
    j.autoPrimary = primary; j.autoKeep = [];
    var add = [j];
    srcs.forEach(function (s0) {
      add.unshift(trunk("at-m-" + s0 + "-" + jid, s0, jid, bySrc[s0][0]));
      bySrc[s0].forEach(function (c) {
        used[c.id] = 1;
        if (s0 === primary) { c.fromId = jid; skLinkHintsClear(c); }
        else j.autoKeep.push(skCompactEl(c));      /* set aside; put back if the splitter goes */
      });
    });
    var drop = {};
    srcs.forEach(function (s0) { if (s0 !== primary) bySrc[s0].forEach(function (c) { drop[c.id] = 1; }); delete bySrc[s0]; });
    sk.elements = sk.elements.filter(function (e) { return !drop[e.id]; });
    Array.prototype.push.apply(sk.elements, add);
    made++;
  });
  /* then single fan-outs */
  Object.keys(bySrc).forEach(function (src) {
    var list = bySrc[src], targets = {};
    list.forEach(function (c) { targets[c.toId] = 1; });
    if (Object.keys(targets).length < 3) return;
    var a = centre(src), m = [0, 0];
    list.forEach(function (c) { var q = centre(c.toId); m[0] += q[0] / list.length; m[1] += q[1] / list.length; });
    var j = addSplit("as-o-" + src, "out", [(a[0] + m[0]) / 2, (a[1] + m[1]) / 2], list[0]);
    var t = trunk("at-o-" + src, src, j.id, list[0]);
    list.forEach(function (c) { c.fromId = j.id; skLinkHintsClear(c); used[c.id] = 1; });
    sk.elements.push(t, j); made++;
  });
  /* then fan-ins, from links not already on a fan-out */
  var byTgt = {};
  conns.forEach(function (c) { if (!used[c.id]) (byTgt[c.toId] = byTgt[c.toId] || []).push(c); });
  Object.keys(byTgt).forEach(function (tgt) {
    var list = byTgt[tgt], sources = {};
    list.forEach(function (c) { sources[c.fromId] = 1; });
    if (Object.keys(sources).length < 3) return;
    var b = centre(tgt), m = [0, 0];
    list.forEach(function (c) { var q = centre(c.fromId); m[0] += q[0] / list.length; m[1] += q[1] / list.length; });
    var j = addSplit("as-i-" + tgt, "in", [(b[0] + m[0]) / 2, (b[1] + m[1]) / 2], list[0]);
    var t = trunk("at-i-" + tgt, j.id, tgt, list[0]);
    t.endArrowhead = list[0].endArrowhead;
    list.forEach(function (c) { c.toId = j.id; skLinkHintsClear(c); });
    sk.elements.push(t, j); made++;
  });
  return made;
}
function skAutoSplitPass() {
  if (sk.autoSplit === false) { skDissolveAutoSplitters(); return 0; }
  skDissolveAutoSplitters();
  return skInsertAutoSplitters();
}
function skArrange(kind, dir, snapTaken) {
  if (!sk || sk.animating) return;
  if (dir) sk.dir = dir;
  if (!snapTaken) skSnapshot();
  var adopted = skAdoptLooseArrows();
  if (!snapTaken) skAutoSplitPass();            /* Orientate does this itself, before its hidden turn */
  sk.captions = skFindCaptions();
  sk.arranging = true;
  try {
    skTidy(dir);
  } finally { sk.arranging = false; }
  if (adopted) pushToastLike("Connected " + adopted + (adopted === 1 ? " loose arrow" : " loose arrows") + " to the shapes they touch.");
}
/* every arrange ends here: captions travel with their shapes, then everything glides */
function skFinishArrange(moves, links) {
  if (sk.preRotate) {
    var orig = sk.preRotate;
    sk.preRotate = null;
    moves.forEach(function (m) { var o = orig[m.el.id]; if (o) { m.fx = o[0]; m.fy = o[1]; if (m.tw !== undefined) { m.fw = o[2]; m.fh = o[3]; } } });
    var movedIds = {}; moves.forEach(function (m) { movedIds[m.el.id] = 1; });
    /* keep the diagram centred where it was: the hidden quarter turn otherwise walked it
       across the board a little further with every press */
    var ob = null, nb = null;
    moves.forEach(function (m) {
      if (m.el.type !== "stencil") return;
      var w = Math.abs(m.el.width), h = Math.abs(m.el.height);
      ob = ob ? [Math.min(ob[0], m.fx), Math.min(ob[1], m.fy), Math.max(ob[2], m.fx + w), Math.max(ob[3], m.fy + h)] : [m.fx, m.fy, m.fx + w, m.fy + h];
      nb = nb ? [Math.min(nb[0], m.tx), Math.min(nb[1], m.ty), Math.max(nb[2], m.tx + w), Math.max(nb[3], m.ty + h)] : [m.tx, m.ty, m.tx + w, m.ty + h];
    });
    if (ob && nb) {
      var sx = Math.round((ob[0] + ob[2]) / 2 - (nb[0] + nb[2]) / 2), sy = Math.round((ob[1] + ob[3]) / 2 - (nb[1] + nb[3]) / 2);
      moves.forEach(function (m) { m.tx += sx; m.ty += sy; });
      (links || []).forEach(function (c) {
        if (!movedIds[c.fromId] || !movedIds[c.toId]) return;
        if (c.via) c.via = c.via.map(function (v) { return [v[0] + sx, v[1] + sy]; });
        if (c.lanesAbs) c.lanesAbs = c.lanesAbs.map(function (v) { return v + (c.flow === "LR" ? sx : sy); });
      });
    }
    Object.keys(orig).forEach(function (id) {
      var e = skFindEl(id), o = orig[id];
      if (!e) return;
      if (movedIds[id]) { e.x = o[0]; e.y = o[1]; if (e.type === "rectangle") { e.width = o[2]; e.height = o[3]; } }
      else { e.x = o[0]; e.y = o[1]; e.width = o[2]; e.height = o[3]; }      /* things Tidy leaves alone go back */
    });
  }
  /* links you never styled, and plain elbows, become circuit traces when arranged */
  (links || []).forEach(function (c) { if ((!c.curve || c.curve === "elbow") && !c.startArrowhead) c.curve = "circuit"; });
  var target = {};
  moves.forEach(function (m) { target[m.el.id] = m; });
  (sk.captions || []).forEach(function (c) {
    var m = target[c.shape.id];
    if (!m || target[c.text.id]) return;
    moves.push({ el: c.text, fx: c.text.x, fy: c.text.y, tx: m.tx + c.dx, ty: m.ty + c.dy });
  });
  sk.captions = null;
  skAnimateMoves(moves, links, function () {
    /* bring the result into view if it spills off-screen */
    var b = null;
    sk.elements.forEach(function (el) {
      if (el.isDeleted || skIsConnector(el)) return;
      var x = skBox(el);
      if (!b) b = { x: x.x, y: x.y, x2: x.x + x.w, y2: x.y + x.h };
      else { b.x = Math.min(b.x, x.x); b.y = Math.min(b.y, x.y); b.x2 = Math.max(b.x2, x.x + x.w); b.y2 = Math.max(b.y2, x.y + x.h); }
    });
    if (!b) return;
    /* centre the view on the result; zoom out to fit only if it is too big for the view */
    var w = skViewW(), h = skViewH();
    if ((b.x2 - b.x) * sk.cam.k > w - 40 || (b.y2 - b.y) * sk.cam.k > h - 40) document.getElementById("skFit").click();
    else { sk.cam.x = (b.x + b.x2) / 2; sk.cam.y = (b.y + b.y2) / 2; skDraw(); }
  });
}

function skTidy(dir) {
  var pool = sk.sels.length > 1 ? sk.sels.filter(function (e) { return e.type === "stencil"; }) : sk.elements.filter(function (e) { return e.type === "stencil" && !e.isDeleted; });
  var inPool = {}; pool.forEach(function (e) { inPool[e.id] = e; });
  var links = sk.elements.filter(function (c) { return !c.isDeleted && skIsConnector(c) && inPool[c.fromId] && inPool[c.toId] && c.fromId !== c.toId; });
  if (!links.length) { if (sk.arranging) sk.undo.pop(); pushToastLike("Nothing to tidy: connect some shapes first."); return; }
  var zones = skFindZones(pool);
  if (!sk.arranging) skSnapshot();
  var moves = [], sets = skConnectedSets(pool, links), inSet = {};
  sets.forEach(function (ids) { ids.forEach(function (id) { inSet[id] = 1; }); });
  /* shapes Tidy does not move: an arranged set must not land on them */
  var taken = sk.elements.filter(function (e) { return e.type === "stencil" && !e.isDeleted && !inSet[e.id]; }).map(function (e) {
    var b = skBox(e); return [b.x, b.y, b.x + b.w, b.y + b.h + 24];
  });
  sets.forEach(function (ids) {
    var mv = skArrangeSet(ids, inPool, links, dir || "LR", zones, null);
    var box = null;
    mv.forEach(function (m) {
      var w = m.tw !== undefined ? m.tw : Math.abs(m.el.width), h = m.th !== undefined ? m.th : Math.abs(m.el.height) + 24;
      box = box ? [Math.min(box[0], m.tx), Math.min(box[1], m.ty), Math.max(box[2], m.tx + w), Math.max(box[3], m.ty + h)] : [m.tx, m.ty, m.tx + w, m.ty + h];
    });
    /* the smallest step (right, down, left, up, then further) that clears everything taken */
    var gap = 40, hit = function (dx, dy) {
      return taken.some(function (t) { return box[0] + dx - gap < t[2] && t[0] < box[2] + dx + gap && box[1] + dy - gap < t[3] && t[1] < box[3] + dy + gap; });
    };
    var off = [0, 0];
    if (box && hit(0, 0)) {
      search: for (var r = 1; r <= 60; r++) {
        var d = r * 40, cands = [[d, 0], [0, d], [-d, 0], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]];
        for (var ci = 0; ci < cands.length; ci++) if (!hit(cands[ci][0], cands[ci][1])) { off = cands[ci]; break search; }
      }
    }
    if (off[0] || off[1]) {
      mv.forEach(function (m) { m.tx += off[0]; m.ty += off[1]; });
      var member = {}; ids.forEach(function (id) { member[id] = 1; });
      links.forEach(function (c) {
        if (!member[c.fromId] || !member[c.toId]) return;
        if (c.via) c.via = c.via.map(function (v) { return [v[0] + off[0], v[1] + off[1]]; });
        if (c.lanesAbs) c.lanesAbs = c.lanesAbs.map(function (v) { return v + (c.flow === "LR" ? off[0] : off[1]); });
      });
    }
    if (box) taken.push([box[0] + off[0], box[1] + off[1], box[2] + off[0], box[3] + off[1]]);
    moves = moves.concat(mv);
  });
  skFinishArrange(moves, links);
}

