/* ============================================================
   Arranging: one core used by Tidy, by templates and by their previews.
   Group boxes (a rectangle with a title) are part of the layout: their members stay
   together in each column, and the box is refitted around them, title included.
   Two-headed links are peer links (replication between cluster members, say): they say
   nothing about which comes first, so they do not push one partner into a later column.
   ============================================================ */
/* ---- groups follow your hands ----
   Dragging a group box carries its members and title. Dragging members leaves the box to
   refit round them when you let go - a member dropped well outside leaves the group, a shape
   dropped inside a box joins it. Bend points Tidy worked out for a link no longer fit once
   one of its shapes has moved, so they are dropped; bends you made yourself are kept. */
function skGroupsAtDragStart(d) {
  var pool = sk.elements.filter(function (e) { return e.type === "stencil" && !e.isDeleted; });
  d.zones = skFindZones(pool);
  d.carry = [];
  var sel = {}; sk.sels.forEach(function (e) { sel[e.id] = 1; });
  d.zones.forEach(function (z) {
    /* grabbing a group by its box or by its title moves the whole group */
    if (!sel[z.rect.id] && !(z.text && sel[z.text.id])) return;
    if (!sel[z.rect.id]) { d.carry.push(z.rect); sel[z.rect.id] = 1; }
    z.members.forEach(function (id) { var m = skFindEl(id); if (m && !sel[id]) { d.carry.push(m); sel[id] = 1; } });
    if (z.text && !sel[z.text.id]) { d.carry.push(z.text); sel[z.text.id] = 1; }
  });
}
function skFitZone(z, members) {
  if (!members.length) return;
  skctx.font = "12px Segoe UI, Arial, sans-serif";
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  members.forEach(function (el) {
    var w = Math.abs(el.width), lw = el.label && !skIsFlow(el.shape) ? skctx.measureText(el.label).width * skLabelSize(el) / 12 * 1.25 + 18 : 0;
    var foot = el.label && !skIsFlow(el.shape) ? skLabelSize(el) * 1.8 : 0, ww = Math.max(w, lw), left = el.x - (ww - w) / 2;
    x0 = Math.min(x0, left); x1 = Math.max(x1, left + ww);
    y0 = Math.min(y0, el.y); y1 = Math.max(y1, el.y + Math.abs(el.height) + foot);
  });
  var pad = 22, head = 34;
  z.rect.x = x0 - pad; z.rect.y = y0 - head; z.rect.width = x1 - x0 + pad * 2; z.rect.height = y1 - y0 + head + pad - 6;
  if (z.text) { z.text.x = z.rect.x + 10; z.text.y = z.rect.y + 8; }
}
function skGroupsAtDragEnd(d) {
  var moved = {};
  sk.sels.concat(d.carry || []).forEach(function (e) { moved[e.id] = 1; });
  var zones = d.zones || [];
  var rectOf = function (z) { return { x: z.rect.x, y: z.rect.y, w: z.rect.width, h: z.rect.height }; };
  var inside = function (el, rb, margin) {
    var cx = el.x + Math.abs(el.width) / 2, cy = el.y + Math.abs(el.height) / 2;
    return cx > rb.x - margin && cx < rb.x + rb.w + margin && cy > rb.y - margin && cy < rb.y + rb.h + margin;
  };
  /* first, which moved shapes left their own group (dropped well outside its box) */
  var owner = {}, left = {};
  zones.forEach(function (z) { z.members.forEach(function (id) { owner[id] = z; }); });
  sk.sels.forEach(function (el) {
    var z = owner[el.id];
    if (z && !moved[z.rect.id] && !inside(el, rectOf(z), 40)) left[el.id] = 1;
  });
  zones.forEach(function (z) {
    if (moved[z.rect.id]) return;                         /* the box moved, carrying its members */
    var rb = rectOf(z), touched = false, members = [];
    z.members.forEach(function (id) {
      var el = skFindEl(id);
      if (!el) return;
      if (!moved[id]) { members.push(el); return; }
      touched = true;
      if (!left[id]) members.push(el);
    });
    /* a shape from no group, or one that left its own, joins the box it is dropped into */
    sk.sels.forEach(function (el) {
      if (el.type !== "stencil" || z.members.indexOf(el.id) !== -1) return;
      if ((!owner[el.id] || left[el.id]) && inside(el, rb, 0)) { members.push(el); touched = true; }
    });
    if (touched) skFitZone(z, members);
  });
  /* Tidy's bend points describe the old positions: drop them for links on moved shapes */
  sk.elements.forEach(function (c) {
    if (!c.autoVia || !skIsConnector(c) || !(moved[c.fromId] || moved[c.toId])) return;
    delete c.via; delete c.lanes; delete c.lanesAbs; delete c.autoVia;
  });
}
function skFindZones(pool) {
  var inPool = {}; pool.forEach(function (e) { inPool[e.id] = e; });
  var zones = [];
  sk.elements.forEach(function (r) {
    if (r.type !== "rectangle" || r.isDeleted) return;
    var rb = skBox(r);
    var members = pool.filter(function (e) {
      var b = skBox(e);
      return b.x >= rb.x - 1 && b.y >= rb.y - 1 && b.x + b.w <= rb.x + rb.w + 1 && b.y + b.h <= rb.y + rb.h + 1;
    }).map(function (e) { return e.id; });
    if (!members.length) return;
    var title = sk.elements.filter(function (t) {
      if (t.type !== "text" || t.isDeleted) return false;
      return t.x >= rb.x - 2 && t.x <= rb.x + Math.min(rb.w, 60) && t.y >= rb.y - 2 && t.y <= rb.y + 30;
    })[0] || null;
    zones.push({ rect: r, text: title, members: members, area: rb.w * rb.h });
  });
  /* a shape inside several boxes belongs to the smallest */
  var owner = {};
  zones.slice().sort(function (a, b) { return a.area - b.area; }).forEach(function (z) {
    z.members = z.members.filter(function (id) { if (owner[id]) return false; owner[id] = z; return true; });
  });
  return zones.filter(function (z) { return z.members.length; });
}
/* arrange one connected set of shapes; returns the moves (shapes and group boxes) */
/* which bus a link rides: its source's, if the source fans out; otherwise its target's, if
   the target gathers several links; the busier side wins when both do */
function skAssignNets(edgeList) {
  var outN = {}, inN = {};
  edgeList.forEach(function (c) { outN[c.fromId] = (outN[c.fromId] || 0) + 1; inN[c.toId] = (inN[c.toId] || 0) + 1; });
  edgeList.forEach(function (c) {
    var o = outN[c.fromId], i = inN[c.toId];
    c.netKey = o >= 2 && o >= i ? "s:" + c.fromId : i >= 2 ? "t:" + c.toId : "s:" + c.fromId;
  });
}
function skArrangeSet(ids, inPool, links, dir, zones, anchorAt) {
  dir = dir || "LR";
  var horiz = dir !== "TB" && dir !== "BT";
  var g = { dir: dir, nodes: {}, order: [], edges: [], groups: [], peers: [] };
  var flipDir = dir === "BT" || dir === "RL";
  var myZones = [], wraps = [], gA = 0, gL = 0, x0 = 0, y0 = 0, moves = [], target = {};
  function layIds() { return Object.keys(g.nodes); }
  /* the stages, in order */
  buildGraph();            /* the graph: shapes, groups, corridor widths, links and two-way pairs */
  weightSplitterLinks();   /* a link into or out of a splitter weighs as much as its branches */
  prepareWraps();          /* wide fan-outs become one block for the layout */
  settleLayout();          /* lay out, then re-run until positions stop changing */
  openWraps();             /* open each block into its two staggered rows */
  placeShapes();           /* anchor the layout and work out where each shape goes */
  markLinks();             /* flow, return loops and bend points for each link */
  assignLanes();           /* turning lines in each gap, and long links' turns between rows */
  assignWrapLanes();       /* links into and out of wrapped rows turn on their buses */
  fitGroupBoxes();         /* group boxes refitted round their members */
  return moves;

  function buildGraph() {
    skctx.font = "12px Segoe UI, Arial, sans-serif";
    ids.forEach(function (id) {
      var el = inPool[id], lw = el.label && !skIsFlow(el.shape) ? skctx.measureText(el.label).width * skLabelSize(el) / 12 * 1.25 + 18 : 0;
      var w = Math.max(Math.abs(el.width), lw), foot = el.label && !skIsFlow(el.shape) ? skLabelSize(el) * 1.8 : 0;
      g.nodes[id] = { id: id, fixed: true, w: w, h: Math.abs(el.height), foot: foot, group: null, offx: (w - Math.abs(el.width)) / 2,
                      cur: horiz ? el.y + Math.abs(el.height) / 2 : el.x + Math.abs(el.width) / 2 };
    });
    /* groups, in the order they sit now, so arranging again keeps them where they are */
    myZones = zones.filter(function (z) { return z.members.some(function (m) { return g.nodes[m]; }); });
    myZones.sort(function (a, b) { var ra = skBox(a.rect), rb = skBox(b.rect); return horiz ? (ra.y - rb.y) || (ra.x - rb.x) : (ra.x - rb.x) || (ra.y - rb.y); });
    myZones.forEach(function (z) {
      var grp = { id: z.rect.id, title: z.text ? z.text.text : "", members: z.members.filter(function (m) { return g.nodes[m]; }) };
      g.groups.push(grp);
      grp.members.forEach(function (m) { g.nodes[m].group = grp; });
    });
    g.order = ids.slice().sort(function (a, b) { return (inPool[a].x - inPool[b].x) || (inPool[a].y - inPool[b].y); });
    /* thicker links get wider corridors: rows and columns spread with the thickest link, so
       the gaps between parallel runs still fit */
    var thick = links.reduce(function (m, c) { return g.nodes[c.fromId] && g.nodes[c.toId] ? Math.max(m, c.strokeWidth || 2) : m; }, 2);
    if (thick > 2) {
      g.gapAlong = (horiz ? 132 : 104) + (thick - 2) * 14;
      g.gapAcross = (horiz ? 62 : 56) + (thick - 2) * 8;
    }
    /* two arrows joining the same pair opposite ways are a two-way link, laid out like a
       two-headed one: partners side by side, one straight line - not a link plus a loop */
    var dirs = {};
    links.forEach(function (c) { dirs[c.fromId + ">" + c.toId] = 1; });
    links.forEach(function (c) {
      if (!g.nodes[c.fromId] || !g.nodes[c.toId]) return;
      if (c.startArrowhead || dirs[c.toId + ">" + c.fromId]) g.peers.push([c.fromId, c.toId, c]);   /* a peer link */
      else g.edges.push({ a: c.fromId, b: c.toId, el: c });
    });
  }

  function weightSplitterLinks() {
    /* A splitter stands for its branches: a link into one weighs as many links as leave it
       (and a link out of a gathering splitter as many as enter it), so a web server centres
       over the apps behind its splitter, not on the single link above it. The extra copies
       only weigh; they are dropped once the layout is done. */
    var outDegS = {}, inDegS = {}, weightCopies = [];
    g.edges.forEach(function (e) { outDegS[e.a] = (outDegS[e.a] || 0) + 1; inDegS[e.b] = (inDegS[e.b] || 0) + 1; });
    g.edges.forEach(function (e) {
      var wgt = 1;
      if (skIsSplitter(inPool[e.b])) wgt = Math.max(wgt, outDegS[e.b] || 1);
      if (skIsSplitter(inPool[e.a])) wgt = Math.max(wgt, inDegS[e.a] || 1);
      for (var wk = 1; wk < wgt; wk++) weightCopies.push({ a: e.a, b: e.b, el: e.el, dup: true });
    });
    g.edges = g.edges.concat(weightCopies);
  }

  function prepareWraps() {
    /* ---- wide fan-outs wrap into two staggered rows ----
       A parent with five or more children that have no other parent lays them out in two
       rows, the second sitting in the gaps of the first: the trunk drops between them and
       every child is still entered from above, as when drawn by hand. During layout the
       children are one block; afterwards the block opens into its rows. */
    gA = g.gapAcross || (horiz ? 62 : 56); gL = g.gapAlong || (horiz ? 132 : 104);
    if (sk.wrapFans !== false) {
      var predsOf = {}, succsOf = {}, peerSet = {};
      g.edges.forEach(function (e) { (predsOf[e.b] = predsOf[e.b] || []).push(e.a); (succsOf[e.a] = succsOf[e.a] || []).push(e.b); });
      g.peers.forEach(function (pr) { peerSet[pr[0]] = peerSet[pr[1]] = 1; });
      Object.keys(succsOf).forEach(function (P) {
        if (!g.nodes[P]) return;
        var kids = succsOf[P].filter(function (c, i, a) {
          return a.indexOf(c) === i && c !== P && g.nodes[c] && (predsOf[c] || []).length === 1 && !peerSet[c] && !g.nodes[c].group;
        });
        kids = kids.filter(function (c) { return !(succsOf[c] || []).some(function (x) { return x === P || kids.indexOf(x) !== -1; }); });
        if (kids.length < 5) return;
        wraps.push({ parent: P, kids: kids });
      });
    }
    wraps.forEach(function (w) {
      var kn = w.kids.map(function (id) { return g.nodes[id]; });
      /* children in reading order: by row, then along the row */
      /* the row nearest the parent comes first: the top row when flowing down, the bottom row
         when flowing up (and likewise sideways) - reading it the other way swapped the rows on
         every press */
      var nearFirst = flipDir ? -1 : 1;
      w.kids.sort(function (a, b) {
        var A = inPool[a], B = inPool[b];
        return horiz ? nearFirst * (A.x - B.x) || (A.y - B.y) : nearFirst * (A.y - B.y) || (A.x - B.x);
      });
      var n = w.kids.length, K = Math.ceil((n + 1) / 2);
      w.rows = [w.kids.slice(0, K), w.kids.slice(K)];
      w.maxAcross = Math.max.apply(null, kn.map(function (q) { return horiz ? q.h + q.foot : q.w; }));
      w.rowDepth = Math.max.apply(null, kn.map(function (q) { return horiz ? q.w : q.h + q.foot; }));
      w.slot = w.maxAcross + gA;
      w.rowGap = Math.max(72, gL * 0.62);
      w.K = K;
      var across = K * w.slot - gA, along = 2 * w.rowDepth + w.rowGap;
      var bid = "blk:" + w.parent;
      w.bid = bid; w.saved = {};
      w.kids.forEach(function (id) { w.saved[id] = g.nodes[id]; delete g.nodes[id]; });
      var cur = w.kids.reduce(function (sum, id) { return sum + w.saved[id].cur; }, 0) / n;
      g.nodes[bid] = { id: bid, fixed: true, w: horiz ? along : across, h: horiz ? across : along, foot: 0, group: null, offx: 0, cur: cur };
      var firstAt = g.order.indexOf(w.kids[0]);
      g.order = g.order.filter(function (id) { return w.kids.indexOf(id) === -1; });
      g.order.splice(Math.max(0, Math.min(firstAt, g.order.length)), 0, bid);
      w.real = g.edges.filter(function (e) { return w.kids.indexOf(e.a) !== -1 || w.kids.indexOf(e.b) !== -1; });
      g.edges = g.edges.filter(function (e) { return w.real.indexOf(e) === -1; });
      /* the block weighs as much as the children it stands for, so its parent still centres on it */
      for (var wi = 0; wi < n; wi++) g.edges.push({ a: w.parent, b: bid, syn: w });
      var outs = {};
      w.real.forEach(function (e) { if (w.kids.indexOf(e.a) !== -1) { outs[e.b] = (outs[e.b] || 0) + 1; g.edges.push({ a: bid, b: e.b, syn: w }); } });
    });
    var kidOf = {};
    wraps.forEach(function (w) { w.kids.forEach(function (k) { kidOf[k] = w.bid; }); });
    g.made = [];
    sk.elements.forEach(function (e) {
      var id = kidOf[e.id] || e.id;
      if (g.nodes[id] && g.made.indexOf(id) === -1) g.made.push(id);
    });
  }

  function settleLayout() {
    /* one press keeps improving until the ordering stops changing (three rounds at most),
       so a single press lands where pressing again would - turning a left-to-right
       template top-down used to need a second press to settle */
    var orderKey = function () {
      /* the whole arrangement, relative to its corner: rounds stop only when positions stop
         changing - the order of shapes can settle while long links' stand-ins still shift */
      var ks = layIds(), mx = Infinity, my = Infinity;
      ks.forEach(function (id) { mx = Math.min(mx, g.nodes[id].x); my = Math.min(my, g.nodes[id].y); });
      return ks.sort().map(function (id) { return id + ":" + Math.round(g.nodes[id].x - mx) + "," + Math.round(g.nodes[id].y - my); }).join("|");
    };
    mmLayout(g);
    for (var round = 0; round < 5; round++) {
      var before = orderKey();
      layIds().forEach(function (id) { var n = g.nodes[id]; n.cur = horiz ? n.y + n.h / 2 : n.x + n.w / 2; });
      /* tie-breaks follow the new positions too, exactly as a real second press would see them */
      g.order = layIds().sort(function (a, b) {          /* by icon position, as a press sorts shapes */
        return ((g.nodes[a].x + (g.nodes[a].offx || 0)) - (g.nodes[b].x + (g.nodes[b].offx || 0))) || (g.nodes[a].y - g.nodes[b].y);
      });
      g.edges.forEach(function (e) { delete e.via; });
      mmLayout(g);
      if (orderKey() === before) break;
    }
  }

  function openWraps() {
    /* open each block into its two rows: the second row sits in the gaps of the first */
    wraps.forEach(function (w) {
      var B = g.nodes[w.bid], bx = B.x, by = B.y, blockAlong = 2 * w.rowDepth + w.rowGap;
      w.rows.forEach(function (row, r) {
        var cap = r === 0 ? w.K : w.K - 1, startIdx = Math.floor((cap - row.length) / 2);
        var rowAlong = flipDir ? blockAlong - (r + 1) * w.rowDepth - r * w.rowGap : r * (w.rowDepth + w.rowGap);
        row.forEach(function (id, k) {
          var nd = w.saved[id], pos = startIdx + k + (r === 1 ? 0.5 : 0);
          var acrossAt = pos * w.slot + (w.maxAcross - (horiz ? nd.h + nd.foot : nd.w)) / 2;
          var alongAt = rowAlong + (w.rowDepth - (horiz ? nd.w : nd.h + nd.foot)) / 2;
          nd.x = bx + (horiz ? alongAt : acrossAt); nd.y = by + (horiz ? acrossAt : alongAt);
          nd.rank = B.rank; nd.wrapRow = r;
          g.nodes[id] = nd;
        });
      });
      delete g.nodes[w.bid];
      var synVia = {};
      g.edges.forEach(function (e) { if (e.syn === w && e.a === w.bid && e.via) synVia[e.b] = e.via; });
      g.edges = g.edges.filter(function (e) { return e.syn !== w; });
      w.real.forEach(function (e) { delete e.via; if (synVia[e.b] && w.kids.indexOf(e.a) !== -1) e.via = synVia[e.b].map(function (v) { return v.slice(); }); g.edges.push(e); });
      g.order = g.order.filter(function (id) { return id !== w.bid; }).concat(w.kids);
    });
    g.edges = g.edges.filter(function (e) { return !e.dup; });      /* the weight-only copies have done their job */
  }

  function placeShapes() {
    /* anchored on one shape (or a given point) and snapped once, so arranging is repeatable */
    var lead = ids.slice().sort(function (a, b) { return (g.nodes[a].x + g.nodes[a].offx - g.nodes[b].x - g.nodes[b].offx) || (g.nodes[a].y - g.nodes[b].y); })[0];
    var topId = ids.slice().sort(function (a, b) { return g.nodes[a].y - g.nodes[b].y; })[0];
    if (anchorAt) { x0 = anchorAt[0]; y0 = anchorAt[1]; }
    else { x0 = skSnapTo(inPool[lead].x - g.nodes[lead].x - g.nodes[lead].offx); y0 = skSnapTo(inPool[topId].y - g.nodes[topId].y); }
    ids.forEach(function (id) {
      var n = g.nodes[id], el = inPool[id];
      target[id] = [x0 + n.x + n.offx, y0 + n.y];
      moves.push({ el: el, fx: el.x, fy: el.y, tx: target[id][0], ty: target[id][1] });
    });
  }

  function markLinks() {
    var flowName = horiz ? "LR" : "TB";
    g.peers.forEach(function (pr) {
      var c = pr[2];
      skLinkHintsClear(c); delete c.flow;
    });
    g.edges.forEach(function (e) {
      var backward = g.nodes[e.b].rank <= g.nodes[e.a].rank;
      delete e.el.ports; delete e.el.loopSide; delete e.el.segs;      /* a fresh layout starts from automatic runs */
      if (backward) { delete e.el.via; e.el.loop = true; }
      else {
        delete e.el.loop;
        if (e.via) { e.el.via = e.via.map(function (v) { return [x0 + v[0], y0 + v[1]]; }); e.el.autoVia = true; }
        else { delete e.el.via; delete e.el.autoVia; }
      }
      delete e.el.lanes;
      e.el.flow = flowName;
    });
  }

  function assignLanes() {
    /* each gap gives every bus its own turning line: links on one bus share a trunk.
       Fan-out buses turn early in the gap (near their source), fan-in buses late (near their
       target), so the two kinds do not cross each other */
    skAssignNets(g.edges.map(function (e) { return e.el; }));
    g.peers.forEach(function (pr) { delete pr[2].netKey; });
    var gaps = {};
    g.edges.forEach(function (e) {
      var ra = g.nodes[e.a].rank, rb = g.nodes[e.b].rank;
      if (rb <= ra) { e.el.netKey = "s:" + e.a; return; }
      for (var gi = 0; gi < rb - ra; gi++) {
        var key = ra + gi, src = gi === 0 ? e.el.netKey : e.el.netKey + "#" + gi;
        var acrossAt = gi === 0 ? (horiz ? g.nodes[e.a].y : g.nodes[e.a].x) : (e.via ? (horiz ? e.via[gi - 1][1] : e.via[gi - 1][0]) : 0);
        var slot = gaps[key] = gaps[key] || {};
        (slot[src] = slot[src] || { at: acrossAt, edges: [] }).edges.push([e, gi]);
      }
    });
    Object.keys(gaps).forEach(function (key) {
      var groups = Object.keys(gaps[key]).map(function (k) { var sg = gaps[key][k]; sg.fanIn = k.indexOf("t:") === 0; return sg; });
      if (groups.length < 2) return;
      var outs = groups.filter(function (sg) { return !sg.fanIn; }).sort(function (a, b) { return a.at - b.at; });
      var ins = groups.filter(function (sg) { return sg.fanIn; }).sort(function (a, b) { return a.at - b.at; });
      var band = function (list, lo, hi) {
        list.forEach(function (sg, i) {
          var lane = list.length === 1 ? (lo + hi) / 2 : lo + (hi - lo) * i / (list.length - 1);
          sg.edges.forEach(function (pair) { var el = pair[0].el; (el.lanes = el.lanes || [])[pair[1]] = lane; });
        });
      };
      if (outs.length && ins.length) { band(outs, 0.2, 0.46); band(ins, 0.56, 0.82); }
      else band(outs.length ? outs : ins, 0.22, 0.78);
    });
    g.edges.forEach(function (e) {
      if (!e.el.lanes) return;
      for (var li = 0; li < e.el.lanes.length; li++) if (e.el.lanes[li] === undefined) e.el.lanes[li] = 0.5;
    });
    /* A long link turns once in each gap it crosses. As a fraction of the distance between
       its waypoints, a turn could land inside a row, among the shapes and labels there; it is
       placed within the gap between rows instead, from the rows' measured extents. */
    g.edges.forEach(function (e) {
      delete e.el.lanesAbs;
      if (!e.via || g.nodes[e.b].rank <= g.nodes[e.a].rank || !g.rowSpan) return;
      var ra = g.nodes[e.a].rank, abs = [], off = horiz ? x0 : y0;
      for (var gi = 0; gi <= e.via.length; gi++) {
        var r1 = g.rowSpan[ra + gi], r2 = g.rowSpan[ra + gi + 1];
        if (!r1 || !r2) { abs = null; break; }
        var f = e.el.lanes && e.el.lanes[gi] !== undefined ? e.el.lanes[gi] : 0.5;
        abs.push(off + r1[1] + (r2[0] - r1[1]) * f);
      }
      if (abs) e.el.lanesAbs = abs;
    });
  }

  function assignWrapLanes() {
    wraps.forEach(function (w) {
      var al = function (q) { return horiz ? q.x : q.y; }, asz = function (q) { return horiz ? q.w : q.h + q.foot; };
      var fwd = !flipDir, P = g.nodes[w.parent], kn = w.kids.map(function (id) { return g.nodes[id]; });
      var pFar = fwd ? al(P) + asz(P) : al(P);
      var row0Near = fwd ? Math.min.apply(null, kn.map(al)) : Math.max.apply(null, kn.map(function (q) { return al(q) + asz(q); }));
      var bus = (pFar + row0Near) / 2, A = pFar + (fwd ? 26 : -26);
      var blockFar = fwd ? Math.max.apply(null, kn.map(function (q) { return al(q) + asz(q); })) : Math.min.apply(null, kn.map(al));
      links.forEach(function (c) {
        var kidIdx = w.kids.indexOf(c.toId);
        if (c.fromId === w.parent && kidIdx !== -1) {
          var q = g.nodes[c.toId], Bn = (fwd ? al(q) : al(q) + asz(q)) + (fwd ? -26 : 26);
          if ((Bn - A) * (fwd ? 1 : -1) > 4) { c.lanes = [Math.max(0.02, Math.min(0.98, (bus - A) / (Bn - A)))]; delete c.lanesAbs; }
        }
        var fromIdx = w.kids.indexOf(c.fromId);
        if (fromIdx !== -1 && g.nodes[c.toId] && g.nodes[c.toId].rank === g.nodes[c.fromId].rank + 1 && !c.via) {
          var X = g.nodes[c.toId], q2 = g.nodes[c.fromId];
          var xNear = fwd ? al(X) : al(X) + asz(X), bus2 = (blockFar + xNear) / 2;
          var A2 = (fwd ? al(q2) + asz(q2) : al(q2)) + (fwd ? 26 : -26), B2 = xNear + (fwd ? -26 : 26);
          if ((B2 - A2) * (fwd ? 1 : -1) > 4) { c.lanes = [Math.max(0.02, Math.min(0.98, (bus2 - A2) / (B2 - A2)))]; delete c.lanesAbs; }
        }
      });
    });
  }

  function fitGroupBoxes() {
    /* group boxes refitted around their members, title at the top */
    myZones.forEach(function (z) {
      var x0b = Infinity, y0b = Infinity, x1b = -Infinity, y1b = -Infinity;
      z.members.forEach(function (m) {
        if (!target[m]) return;
        var el = inPool[m], n = g.nodes[m], left = target[m][0] - n.offx;
        x0b = Math.min(x0b, left); x1b = Math.max(x1b, left + n.w);
        y0b = Math.min(y0b, target[m][1]); y1b = Math.max(y1b, target[m][1] + Math.abs(el.height) + n.foot);
      });
      if (x0b === Infinity) return;
      var pad = 22, head = 34;
      var rx = x0b - pad, ry = y0b - head;
      moves.push({ el: z.rect, fx: z.rect.x, fy: z.rect.y, tx: rx, ty: ry, fw: z.rect.width, fh: z.rect.height, tw: x1b - x0b + pad * 2, th: y1b - y0b + head + pad - 6 });
      if (z.text) moves.push({ el: z.text, fx: z.text.x, fy: z.text.y, tx: rx + 10, ty: ry + 8 });
    });
  }
}
/* the connected sets in a pool of shapes; peer links count as connections */
function skConnectedSets(pool, links) {
  var parent = {};
  var find = function (x) { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  links.forEach(function (c) { [c.fromId, c.toId].forEach(function (id) { if (parent[id] === undefined) parent[id] = id; }); parent[find(c.fromId)] = find(c.toId); });
  var sets = {};
  Object.keys(parent).forEach(function (id) { (sets[find(id)] = sets[find(id)] || []).push(id); });
  return Object.keys(sets).map(function (k) { return sets[k]; });
}
