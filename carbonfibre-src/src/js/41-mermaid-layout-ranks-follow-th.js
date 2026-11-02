/* ---- layout: ranks follow the arrows, then each rank is ordered to cut crossings ---- */
function mmSize(n) {
  var lines = mmWrap(n.label, 26);
  var widest = lines.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
  var tw = widest * 7.4 + 30, th = lines.length * 17 + 24;
  n.lines = lines;
  if (n.shape === "database") { n.w = 76; n.h = 62; n.foot = 22; return; }
  if (n.shape === "fc-circle") { var d = Math.max(76, Math.min(160, Math.max(tw, th) * 0.95)); n.w = n.h = d; return; }
  if (n.shape === "fc-diamond") { n.w = Math.max(120, tw * 1.35); n.h = Math.max(72, th * 1.5); return; }
  n.w = Math.max(110, Math.min(260, tw + (n.shape === "fc-hex" || n.shape === "fc-para" ? 26 : 0)));
  n.h = Math.max(48, th);
}
function mmWrap(text, max) {
  var out = [];
  String(text).split("\n").forEach(function (para) {
    var line = "";
    para.split(/\s+/).forEach(function (w) {
      if (!line) line = w;
      else if ((line + " " + w).length <= max) line += " " + w;
      else { out.push(line); line = w; }
    });
    out.push(line);
  });
  return out;
}

function mmLayout(g) {
  var along, back, stand, order2, dn, chains, widest, cursor, flip, gapAlong, gapAcross, groupKey, subKey, layers, at, node, rank, indeg, queue, sizeAcross, sizeAlong;   /* shared between stages */
  var ids = g.order, pos = {}, preds = {}, succs = {};
  ids.forEach(function (i) { preds[i] = []; succs[i] = []; if (!g.nodes[i].fixed) mmSize(g.nodes[i]); });
  /* the stages, in order */
  breakLoops();          /* pick the feedback links in each loop and link nodes up */
  rankNodes();           /* ranks along the flow: longest path, peers together, sources pulled down */
  addStandIns();         /* stand-ins for links that skip ranks */
  orderLayers();         /* order each rank to cut crossings */
  placeAcross();         /* positions across the flow: centred on neighbours */
  bandGroups();          /* groups packed into bands */
  writeCoords();         /* x and y for every node */
  bendLongLinks();       /* long links bend through their stand-ins */

  function breakLoops() {
    /* Loops are laid out by treating one link in each as going back. Which one matters: the
       old rule reversed whichever link a search happened to reach first, so in a loop like
       processor -> storage -> service -> processor it could pick processor -> storage and
       push nodes into the wrong columns. The Eades-Lin-Smyth order picks the real feedback
       links: peel off nodes that only send, then nodes that only receive, then whichever node
       sends most beyond what it receives. Links pointing backwards in that order are reversed;
       that reverses few links, and they are the ones a person would call "going back". */
    back = {};
    (function () {
      var left = {}, outE = {}, inE = {};
      ids.forEach(function (i) { left[i] = 1; outE[i] = []; inE[i] = []; });
      /* ties are broken in a fixed order (creation order, when the caller gives one), not by
         where shapes sit now: otherwise a scattered diagram and the same diagram tidied could
         break a loop at different links, and the second Tidy moved things again */
      var stable = ids;
      if (g.made) {
        var inIds = {}; ids.forEach(function (i) { inIds[i] = 1; });
        var seen = {};
        stable = g.made.filter(function (i) { if (!inIds[i] || seen[i]) return false; seen[i] = 1; return true; });
        ids.forEach(function (i) { if (!seen[i]) stable.push(i); });
      }
      g.edges.forEach(function (e) { if (e.a !== e.b && left[e.a] && left[e.b]) { outE[e.a].push(e.b); inE[e.b].push(e.a); } });
      var deg = function (i, list) { return list[i].filter(function (x) { return left[x]; }).length; };
      var head = [], tail = [], remaining = ids.length;
      while (remaining) {
        var moved = true;
        while (moved) {
          moved = false;
          stable.forEach(function (i) {
            if (!left[i]) return;
            if (deg(i, outE) === 0) { tail.unshift(i); delete left[i]; remaining--; moved = true; }
            else if (deg(i, inE) === 0) { head.push(i); delete left[i]; remaining--; moved = true; }
          });
        }
        if (!remaining) break;
        /* enter a loop where the rest of the diagram feeds it: most links from nodes already
           placed, then most sent beyond received; ties keep the existing reading order */
        var placed = {}; head.forEach(function (h) { placed[h] = 1; });
        var pick = null, best = null;
        stable.forEach(function (i) {
          if (!left[i]) return;
          var fed = inE[i].filter(function (x) { return placed[x]; }).length;
          var key = [fed, deg(i, outE) - deg(i, inE)];
          if (!best || key[0] > best[0] || (key[0] === best[0] && key[1] > best[1])) { best = key; pick = i; }
        });
        head.push(pick); delete left[pick]; remaining--;
      }
      var at = {};
      head.concat(tail).forEach(function (i, k) { at[i] = k; });
      g.edges.forEach(function (e) { if (e.a !== e.b && at[e.a] > at[e.b]) back[e.a + "\u0000" + e.b] = 1; });
    })();
    g.edges.forEach(function (e) {
      var a = e.a, b = e.b;
      if (a === b) return;
      if (back[a + "\u0000" + b]) { var t = a; a = b; b = t; }
      preds[b].push(a); succs[a].push(b);
    });
  }

  function rankNodes() {
    rank = {}, indeg = {}, queue = [];
    ids.forEach(function (i) { indeg[i] = preds[i].length; if (!indeg[i]) queue.push(i); });
    while (queue.length) {
      var u = queue.shift();
      rank[u] = preds[u].reduce(function (m, p) { return Math.max(m, (rank[p] || 0) + 1); }, 0);
      succs[u].forEach(function (v) { if (--indeg[v] === 0) queue.push(v); });
    }
    ids.forEach(function (i) { if (rank[i] === undefined) rank[i] = 0; });
    /* Peer links (two-headed) join partners in one column: cluster members fed from
       different places would otherwise rank apart, and the cluster split across rows.
       A node joined only by peer links takes its partner's column; otherwise the earlier
       partner moves to the later one's, and everything after it moves on to keep every
       arrow pointing forwards. */
    for (var pp = 0; pp < ids.length + 2; pp++) {
      var changedRank = false;
      (g.peers || []).forEach(function (pr) {
        var a = pr[0], b = pr[1];
        if (rank[a] === undefined || rank[b] === undefined) return;
        var loneA = !preds[a].length && !succs[a].length, loneB = !preds[b].length && !succs[b].length;
        if (loneA && rank[a] !== rank[b]) { rank[a] = rank[b]; changedRank = true; }
        else if (loneB && rank[b] !== rank[a]) { rank[b] = rank[a]; changedRank = true; }
        else if (rank[a] !== rank[b]) { var m = Math.max(rank[a], rank[b]); rank[a] = rank[b] = m; changedRank = true; }
      });
      ids.forEach(function (u) { succs[u].forEach(function (v) { if (rank[v] <= rank[u]) { rank[v] = rank[u] + 1; changedRank = true; } }); });
      if (!changedRank) break;
    }
    /* A node that nothing feeds (a file server feeding the web tier, say) used to sit on the
       first row, its links reaching all the way down. It sits one row above the first thing
       it feeds instead - beside whatever else feeds that row. */
    for (var pd = 0; pd < 3; pd++) ids.forEach(function (i) {
      if (preds[i].length || !succs[i].length) return;
      var lowest = Math.min.apply(null, succs[i].map(function (v) { return rank[v]; })) - 1;
      if (lowest > rank[i]) rank[i] = lowest;
    });

  }

  function addStandIns() {
    /* A link that skips ranks would be drawn straight through whatever sits between.
       Give it an invisible stand-in on every rank it crosses: the stand-ins take part in
       ordering and spacing, so real boxes are pushed out of the link's path. */
    ids.forEach(function (i) { g.nodes[i].rank = rank[i]; });
    stand = {}, order2 = ids.slice(), dn = 0, chains = {};
    node = function (i) { return g.nodes[i] || stand[i]; };
    ids.forEach(function (a) {
      succs[a].slice().forEach(function (b) {
        if (rank[b] - rank[a] < 2) return;
        succs[a].splice(succs[a].indexOf(b), 1); preds[b].splice(preds[b].indexOf(a), 1);
        if (chains[a + "\u0000" + b]) return;           /* a repeated (weight-only) link: one chain is enough */
        var prev = a, chain = chains[a + "\u0000" + b] = [];
        for (var r = rank[a] + 1; r < rank[b]; r++) {
          var d = "\u0000d" + (dn++);
          stand[d] = { w: 20, h: 20, foot: 0, group: null, chainFrom: a, chainTo: b, frac: (r - rank[a]) / (rank[b] - rank[a]) };
          rank[d] = r; preds[d] = [prev]; succs[d] = []; succs[prev].push(d);
          order2.push(d); chain.push(d); prev = d;
        }
        succs[prev].push(b); preds[b].push(prev);
      });
    });

  }

  function orderLayers() {
    layers = [], at = {};
    order2.forEach(function (i, k) { (layers[rank[i]] = layers[rank[i]] || []).push(i); at[i] = k; });
    layers = layers.filter(Boolean);
    var innerOf = function (i) {
      var n = node(i), gr = n.group;
      /* a stand-in travels with the group its link leaves, so the lane stays level with its source */
      if (!gr && n.chainTo !== undefined) gr = node(n.chainFrom).group || node(n.chainTo).group;
      return gr || null;
    };
    /* nested groups keep together by their outermost box first (its members share one band),
       then by the inner box inside it */
    groupKey = function (i) { var gr = innerOf(i); while (gr && gr.parent) gr = gr.parent; return gr ? g.groups.indexOf(gr) : -1; };
    subKey = function (i) { var gr = innerOf(i); return gr ? g.groups.indexOf(gr) : -1; };
    var place = function () { var p = {}; layers.forEach(function (L) { L.forEach(function (i, k) { p[i] = k; }); }); return p; };
    /* line crossings between neighbouring columns: the measure of a good ordering */
    var crossings = function () {
      var pp = place(), total = 0;
      for (var li = 0; li < layers.length - 1; li++) {
        var es = [];
        layers[li].forEach(function (u) { succs[u].forEach(function (v) { if (pp[v] !== undefined && rank[v] === rank[u] + 1) es.push([pp[u], pp[v]]); }); });
        for (var x = 0; x < es.length; x++) for (var y = x + 1; y < es.length; y++)
          if ((es[x][0] - es[y][0]) * (es[x][1] - es[y][1]) < 0) total++;
      }
      return total;
    };
    /* start from the order things are in now (group members together), then improve it -
       but keep a change only if it is strictly better. A tidy diagram is then already the
       best Tidy can find, so pressing it again changes nothing. */
    /* where each node sits across the flow right now: real shapes from the drawing (when
       Tidy supplies it), stand-ins partway between their link's two ends */
    var nowAt = function (i) {
      var n = node(i);
      if (n.cur !== undefined) return n.cur;
      if (n.chainFrom !== undefined) {
        var fa = node(n.chainFrom), fb = node(n.chainTo);
        if (fa.cur !== undefined && fb.cur !== undefined) return fa.cur + (fb.cur - fa.cur) * n.frac;
      }
      return at[i];
    };
    layers.forEach(function (L) { L.sort(function (a, b) { return (groupKey(a) - groupKey(b)) || (nowAt(a) - nowAt(b)) || (at[a] - at[b]); }); });
    var snapshot = function () { return layers.map(function (L) { return L.slice(); }); };
    var best = snapshot(), bestX = crossings();
    for (var sweep = 0; sweep < 12 && bestX > 0; sweep++) {
      var down = sweep % 2 === 0, p = place();
      (down ? layers.slice(1) : layers.slice(0, -1).reverse()).forEach(function (L) {
        var bary = {};
        L.forEach(function (i) {
          var nb = down ? preds[i] : succs[i];
          bary[i] = nb.length ? nb.reduce(function (s, x) { return s + p[x]; }, 0) / nb.length : p[i];
        });
        /* members of one subgraph stay together, so its box does not swallow strangers */
        L.sort(function (a, b) { return (groupKey(a) - groupKey(b)) || (subKey(a) - subKey(b)) || (bary[a] - bary[b]) || (p[a] - p[b]); });
        L.forEach(function (i, k) { p[i] = k; });          /* only this column changed */
      });
      var cx = crossings();
      if (cx < bestX) { bestX = cx; best = snapshot(); }
    }
    layers.forEach(function (L, li) { L.length = 0; Array.prototype.push.apply(L, best[li]); });

  }

  function placeAcross() {
    /* coordinates: ranks along the flow, positions across it, each rank centred */
    along = g.dir === "LR" || g.dir === "RL";
    flip = g.dir === "BT" || g.dir === "RL";
    sizeAlong = function (n) { return along ? n.w : n.h + (n.foot || 0); };
    sizeAcross = function (n) { return along ? n.h + (n.foot || 0) : n.w; };
    /* generous spacing: room for labels, arrowheads and the eye */
    gapAlong = g.gapAlong || (along ? 132 : 104), gapAcross = g.gapAcross || (along ? 62 : 56);
    var spans = layers.map(function (L) {
      return L.reduce(function (s, i) { return s + sizeAcross(node(i)); }, 0) + gapAcross * (L.length - 1);
    });
    widest = Math.max.apply(null, spans), cursor = 0;
    /* Across the flow, each node goes where its neighbours are: a parent centres on its
       children, a child sits near its parent. Each column keeps its order and spacing, and
       within those limits lands as close as possible to where its neighbours want it (the
       pool-adjacent-violators solution). Passes alternate direction and end placing parents
       from their children. Stacking every column from the middle, as before, left a parent
       level with only one of its children. */
    pos = {};
    layers.forEach(function (L, r) {
      var a = (widest - spans[r]) / 2;
      L.forEach(function (i) { var sz = sizeAcross(node(i)); pos[i] = a + sz / 2; a += sz + gapAcross; });
    });
    var placeLayer = function (L, want) {
      var c = [0];
      for (var k = 1; k < L.length; k++) c[k] = c[k - 1] + (sizeAcross(node(L[k - 1])) + sizeAcross(node(L[k]))) / 2 + gapAcross;
      var blocks = [];
      L.forEach(function (i, k) {
        blocks.push({ sum: want[k] - c[k], n: 1 });
        while (blocks.length > 1) {
          var hi = blocks[blocks.length - 1], lo = blocks[blocks.length - 2];
          if (lo.sum / lo.n <= hi.sum / hi.n) break;
          lo.sum += hi.sum; lo.n += hi.n; blocks.pop();
        }
      });
      var k2 = 0;
      blocks.forEach(function (bl) { for (var j = 0; j < bl.n; j++, k2++) pos[L[k2]] = bl.sum / bl.n + c[k2]; });
    };
    var avg = function (list, fallback) {
      if (!list.length) return fallback;
      return list.reduce(function (sum, x) { return sum + pos[x]; }, 0) / list.length;
    };
    /* two-way (peer) partners are neighbours too: a replica sits beside its primary */
    var peersOf = {};
    (g.peers || []).forEach(function (pr) {
      if (pos[pr[0]] === undefined || pos[pr[1]] === undefined) return;
      (peersOf[pr[0]] = peersOf[pr[0]] || []).push(pr[1]); (peersOf[pr[1]] = peersOf[pr[1]] || []).push(pr[0]);
    });
    for (var pass = 0; pass < 8; pass++) {
      var downward = pass % 2 === 0;
      (downward ? layers.slice(1) : layers.slice(0, -1).reverse()).forEach(function (L) {
        placeLayer(L, L.map(function (i) {
          var nb = downward ? preds[i] : succs[i];
          if (!nb.length) nb = (peersOf[i] || []).length ? peersOf[i] : (downward ? succs[i] : preds[i]);
          return avg(nb, pos[i]);
        }));
      });
    }
    /* The final passes use the tree rule: a node centres on its bigger side. A web server
       with two feeds and five apps centres on its apps; a CMX server fed by five apps and
       feeding one database centres on the five; a node with only a two-way partner sits
       beside it. */
    var side = function (i) {
      if (succs[i].length > preds[i].length) return succs[i];
      if (preds[i].length) return preds[i];
      if (succs[i].length) return succs[i];
      return peersOf[i] || [];
    };
    for (var fin = 0; fin < 4; fin++) {
      var ordered = fin % 2 === 0 ? layers : layers.slice().reverse();
      ordered.forEach(function (L) { placeLayer(L, L.map(function (i) { return avg(side(i), pos[i]); })); });
    }
  }

  function bandGroups() {
    /* Groups become bands: all of a group's members share one strip across every column, and
       the strips are stacked in group order with room between them for the boxes' titles and
       padding. Placed column by column, a group spread over several columns could interleave
       with its neighbours, and the boxes drawn round them crossed. */
    if (g.groups && g.groups.length) {
      var GROUP_GAP = 96, everyone = Object.keys(pos);
      /* a group's members in one column sit together as a block, centred where they want to
         be together: without this, each member was pulled towards its own neighbours and a
         cluster spread across the board, stretching its peer links */
      layers.forEach(function (L) {
        var k = 0;
        while (k < L.length) {
          var gk = groupKey(L[k]), j = k;
          while (j + 1 < L.length && groupKey(L[j + 1]) === gk) j++;
          if (gk >= 0 && j > k) {
            var run = L.slice(k, j + 1), mean = run.reduce(function (sum, i) { return sum + pos[i]; }, 0) / run.length;
            var span = 0;
            run.forEach(function (i, n) { span += sizeAcross(node(i)) + (n ? gapAcross : 0); });
            var at2 = mean - span / 2;
            run.forEach(function (i) { var sz = sizeAcross(node(i)); pos[i] = at2 + sz / 2; at2 += sz + gapAcross; });
          }
          k = j + 1;
        }
      });
      /* first, each column keeps its order and spacing, with extra room where groups change */
      layers.forEach(function (L) {
        for (var k = 1; k < L.length; k++) {
          var minPos = pos[L[k - 1]] + (sizeAcross(node(L[k - 1])) + sizeAcross(node(L[k]))) / 2 + gapAcross;
          if (groupKey(L[k]) !== groupKey(L[k - 1]) && groupKey(L[k]) >= 0) minPos += GROUP_GAP - gapAcross;
          if (pos[L[k]] < minPos) pos[L[k]] = minPos;
        }
      });
      /* boxes nested in one parent are stacked first, innermost parents first, so they never share
         space (their members can line up differently row by row, and the boxes drawn round them
         overlapped). Pushing a box aside moves only what is inside the same parent; the top-level
         boxes are stacked afterwards, at their final sizes. */
      var innerG = function (i) { var n = node(i), gr = n.group; if (!gr && n.chainTo !== undefined) gr = node(n.chainFrom).group || node(n.chainTo).group; return gr || null; };
      var within = function (i, gr) { var x = innerG(i); while (x) { if (x === gr) return true; x = x.parent; } return false; };
      var SUB_GAP = 64;
      var stackNested = function () {
      g.groups.slice().reverse().forEach(function (parentG) {
        var kids = g.groups.filter(function (c) { return c.parent === parentG; });
        if (!kids.length) return;
        var placedIn = [], settled = {};                    /* [first column, last column, top edge, bottom edge, a sibling box?] */
        everyone.filter(function (i) { return innerG(i) === parentG; }).forEach(function (i) {
          var hs = sizeAcross(node(i)) / 2; placedIn.push([rank[i], rank[i], pos[i] - hs, pos[i] + hs, false]);
        });
        kids.forEach(function (gr) {
          var mem = everyone.filter(function (i) { return within(i, gr); });
          if (!mem.length) return;
          var lo = Infinity, hi = -Infinity, c0 = Infinity, c1 = -Infinity;
          mem.forEach(function (i) {
            var hs = sizeAcross(node(i)) / 2;
            lo = Math.min(lo, pos[i] - hs); hi = Math.max(hi, pos[i] + hs);
            c0 = Math.min(c0, rank[i]); c1 = Math.max(c1, rank[i]);
          });
          var floor = -Infinity;
          /* in its way: sibling boxes already placed that share its columns (or the next ones, for
             the titles), and the parent's own shapes that come before it */
          placedIn.forEach(function (pl) {
            var sib = pl[4];
            if (sib ? pl[1] >= c0 - 1 && pl[0] <= c1 + 1 : pl[1] >= c0 && pl[0] <= c1 && pl[2] < lo) floor = Math.max(floor, pl[3]);
          });
          var need = floor === -Infinity ? 0 : floor + SUB_GAP - lo;
          if (need > 0) {
            var shift = {};
            mem.forEach(function (i) { shift[i] = 1; });
            layers.forEach(function (L) {
              var first = -1;
              L.forEach(function (i, k) { if (shift[i] && first < 0) first = k; });
              /* only inside this parent, and never a sibling box already placed */
              if (first >= 0) for (var k = first; k < L.length; k++) if (within(L[k], parentG) && !settled[L[k]]) shift[L[k]] = 1;
            });
            Object.keys(shift).forEach(function (i) { pos[i] += need; });
            lo += need; hi += need;
            placedIn.forEach(function (pl) { if (pl[2] >= lo - need && pl[1] >= c0 && pl[0] <= c1) { pl[2] += need; pl[3] += need; } });
          }
          placedIn.push([c0, c1, lo, hi, true]);
          mem.forEach(function (i) { settled[i] = 1; });
        });
      });
      };
      var stackTop = function () {
      /* then the bands are stacked - but a group only has to clear what shares its columns:
         groups (and ungrouped shapes) in other columns are not in its way. Groups only ever
         move down, so the spacing above holds. */
      var placed = [];                                      /* [first column, last column, bottom edge] */
      ids.filter(function (i) { return groupKey(i) < 0; }).forEach(function (i) {
        placed.push([rank[i], rank[i], pos[i] + sizeAcross(node(i)) / 2]);
      });
      g.groups.forEach(function (gr, gi) {
        if (gr.parent) return;                              /* inner boxes travel inside their outer box's band */
        var mem = everyone.filter(function (i) { return groupKey(i) === gi; });
        if (!mem.length) return;
        var lo = Infinity, hi = -Infinity, c0 = Infinity, c1 = -Infinity;
        mem.forEach(function (i) {
          var hs = sizeAcross(node(i)) / 2;
          lo = Math.min(lo, pos[i] - hs); hi = Math.max(hi, pos[i] + hs);
          c0 = Math.min(c0, rank[i]); c1 = Math.max(c1, rank[i]);
        });
        var floor = -Infinity;
        /* a box's title and padding reach into the neighbouring columns, more so when boxes are
           nested inside it: those columns count as shared, so boxes there never overlap it */
        var reach = g.groups.some(function (c) { return c.parent; }) ? 1 : 0;
        placed.forEach(function (pl) { if (pl[1] >= c0 - reach && pl[0] <= c1 + reach) floor = Math.max(floor, pl[2]); });
        var need = floor === -Infinity ? 0 : floor + GROUP_GAP - lo;
        if (need > 0) {
          var shift = {};
          mem.forEach(function (i) { shift[i] = 1; });
          layers.forEach(function (L) {
            var first = -1;
            L.forEach(function (i, k) { if (shift[i] && first < 0) first = k; });
            if (first >= 0) for (var k = first; k < L.length; k++) shift[L[k]] = 1;
          });
          Object.keys(shift).forEach(function (i) { pos[i] += need; });
          lo += need; hi += need;
        }
        placed.push([c0, c1, hi]);
      });
      };
      /* the two passes disturb each other a little (moving a top-level box moves what follows it in
         its columns), so they run twice: the second round settles what the first left uneven */
      stackNested(); stackTop(); stackNested(); stackTop();
    }
  }

  function writeCoords() {
    /* line the layout up on the real shapes only: the invisible stand-ins for long links can
       sit beyond them, and measuring from those shifted every Tidy a little further down */
    var minEdge = Infinity;
    ids.forEach(function (i) { minEdge = Math.min(minEdge, pos[i] - sizeAcross(node(i)) / 2); });
    var order = flip ? layers.slice().reverse() : layers;
    g.rowSpan = {};
    order.forEach(function (L) {
      var deep = L.reduce(function (m, i) { return Math.max(m, sizeAlong(node(i))); }, 0);
      g.rowSpan[rank[L[0]]] = [cursor, cursor + deep];
      L.forEach(function (i) {
        var n = node(i);
        var a0 = cursor + (deep - sizeAlong(n)) / 2, across = pos[i] - sizeAcross(n) / 2 - minEdge;
        if (along) { n.x = a0; n.y = across; } else { n.x = across; n.y = a0; }
      });
      cursor += deep + gapAlong;
    });
  }

  function bendLongLinks() {
    /* each long link bends through its stand-ins' lane, in the direction it points */
    g.edges.forEach(function (e) {
      var rev = !!back[e.a + "\u0000" + e.b];
      var ch = chains[rev ? e.b + "\u0000" + e.a : e.a + "\u0000" + e.b];
      if (!ch || !ch.length) return;
      var pts = ch.map(function (d) { var n = stand[d]; return [n.x + n.w / 2, n.y + n.h / 2]; });
      e.via = rev ? pts.reverse() : pts;
    });
  }
}

