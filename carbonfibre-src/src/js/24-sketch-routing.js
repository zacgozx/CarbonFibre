/* ---- orthogonal routing through waypoints, turning at a chosen point in each gap ---- */
function skOrthoThrough(p0, s0, via, p1, s1, horiz, lanes, lanesAbs) {
  const N = { t: [0, -1], b: [0, 1], l: [-1, 0], r: [1, 0] }, off = 26;   /* room for the arrowhead */
  const A = [p0.x + N[s0][0] * off, p0.y + N[s0][1] * off], B = [p1.x + N[s1][0] * off, p1.y + N[s1][1] * off];
  const W = [A].concat(via || [], [B]), out = [[p0.x, p0.y], A];
  for (let i = 0; i < W.length - 1; i++) {
    const u = W[i], v = W[i + 1], f = lanes && lanes[i] !== undefined ? lanes[i] : 0.5;
    if (horiz) { const mx = lanesAbs ? lanesAbs[i] : u[0] + (v[0] - u[0]) * f; out.push([mx, u[1]], [mx, v[1]], v); }
    else { const my = lanesAbs ? lanesAbs[i] : u[1] + (v[1] - u[1]) * f; out.push([u[0], my], [v[0], my], v); }
  }
  out.push([p1.x, p1.y]);
  const clean = [];
  out.forEach(function (q) {
    const last = clean[clean.length - 1];
    if (last && Math.abs(last[0] - q[0]) < 0.5 && Math.abs(last[1] - q[1]) < 0.5) return;
    if (clean.length >= 2) {
      const pr = clean[clean.length - 2];
      const straight = (Math.abs(pr[0] - last[0]) < 0.5 && Math.abs(last[0] - q[0]) < 0.5) || (Math.abs(pr[1] - last[1]) < 0.5 && Math.abs(last[1] - q[1]) < 0.5);
      const onward = (last[0] - pr[0]) * (q[0] - last[0]) + (last[1] - pr[1]) * (q[1] - last[1]) >= 0;
      if (straight && onward) clean.pop();
    }
    clean.push(q);
  });
  return clean;
}

/* ---- focus: selecting or hovering a shape fades everything it is not connected to ---- */
function skFocusSets() {
  if (sk.highlight === false) return null;
  let ids = sk.sels.filter(function (e) { return e.type === "stencil"; }).map(function (e) { return e.id; });
  const link = sk.sels.length === 1 && skIsConnector(sk.sels[0]) ? sk.sels[0] : null;
  if (!ids.length && !link && sk.hoverId) ids = [sk.hoverId];
  if (!ids.length && !link) return null;
  const nodes = {}, links = {};
  ids.forEach(function (id) { nodes[id] = 1; });
  if (link) { links[link.id] = 1; nodes[link.fromId] = 1; nodes[link.toId] = 1; }
  let any = !!link;
  sk.elements.forEach(function (c) {
    if (c.isDeleted || !skIsConnector(c)) return;
    if (ids.indexOf(c.fromId) !== -1 || ids.indexOf(c.toId) !== -1) { links[c.id] = 1; nodes[c.fromId] = 1; nodes[c.toId] = 1; any = true; }
  });
  return any ? { nodes: nodes, links: links } : null;
}

/* ---- tree layout: parents centred over their children's subtrees ---- */
/* tree mode re-arranges when connections change: links or connected shapes added or removed */
/* the moves glide into place, unless motion is reduced */
function skAnimateMoves(moves, links, after) {
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const viaTo = links.map(function (c) { return c.via ? c.via.slice() : null; });
  links.forEach(function (c) { delete c.via; });
  const finish = function () {
    if (sk) sk.animating = false;
    moves.forEach(function (m) { m.el.x = m.tx; m.el.y = m.ty; if (m.tw !== undefined) { m.el.width = m.tw; m.el.height = m.th; } });
    links.forEach(function (c, i) { if (viaTo[i]) c.via = viaTo[i]; });
    skChanged(); skDraw(); if (after) after();
  };
  if (reduce) { finish(); return; }
  const t0 = performance.now(), dur = 260;
  sk.animating = true;
  (function step(now) {
    if (!sk) return;
    const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
    moves.forEach(function (m) {
      m.el.x = m.fx + (m.tx - m.fx) * e; m.el.y = m.fy + (m.ty - m.fy) * e;
      if (m.tw !== undefined) { m.el.width = m.fw + (m.tw - m.fw) * e; m.el.height = m.fh + (m.th - m.fh) * e; }
    });
    if (t < 1) { skDraw(); requestAnimationFrame(step); } else finish();
  })(t0);
}

function skDocFor(s) {
  const dd = skDocForBase(s);
  if (s.dir) dd.appState.cfDir = s.dir;
  return dd;
}
function skDocForBase(s) {
  const d = skDoc(s.elements);
  return d;
}

/* ---- spacing: parallel runs from different links are spread apart ----
   Each link is routed on its own, so two can choose the same channel and end up drawn a
   few pixels apart (a feedback loop beside a cross-link, say). Once every route is known,
   runs that are parallel, overlapping and closer than SK_GAP are moved apart; runs from
   the same source stay together, since a shared trunk is how a fan-out should read.
   A move never shortens the stub into a shape below SK_STUB, and never puts a run
   through a shape. */
const SK_GAP = 14;
const SK_STUB = 18;
function skOrthogonal(pts) {
  for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - pts[i - 1][0]) > 0.5 && Math.abs(pts[i][1] - pts[i - 1][1]) > 0.5) return false;
  return pts.length >= 4;
}
function skNudgeAxis(routes, axis, obstacles) {
  /* axis 0: vertical runs, spread in x; axis 1: horizontal runs, spread in y */
  const o = 1 - axis, tracks = [];
  routes.forEach(function (rt) {
    const p = rt.pts;
    for (let i = 0; i < p.length - 1; i++) {
      /* the stubs into shapes (first and last runs) never move, but other runs must still
         keep their distance from them - a long link used to slide right beside one */
      const stub = i === 0 || i === p.length - 2;
      if (Math.abs(p[i][axis] - p[i + 1][axis]) > 0.5) continue;
      const lo = Math.min(p[i][o], p[i + 1][o]), hi = Math.max(p[i][o], p[i + 1][o]);
      if (hi - lo < 3) continue;
      const c = Math.round(p[i][axis]);
      let tr = null;
      for (let t = 0; t < tracks.length; t++) if (tracks[t].net === rt.net && Math.abs(tracks[t].c - c) < 1) { tr = tracks[t]; break; }
      if (!tr) { tr = { id: tracks.length, net: rt.net, c: c, lo: lo, hi: hi, segs: [], w: 0 }; tracks.push(tr); }
      tr.lo = Math.min(tr.lo, lo); tr.hi = Math.max(tr.hi, hi);
      tr.w = Math.max(tr.w, rt.w || 2);
      if (rt.pinned && rt.pinned[i]) tr.pinned = true;      /* a segment you moved stays put */
      if (stub) { tr.pinned = true; continue; }             /* fixed, and never written back */
      tr.segs.push([rt, i]);
    }
  });
  if (tracks.length < 2) return;
  /* the gap two parallel runs need grows with their thickness: thin lines 18 px apart,
     8 px lines 36 px, so thick links never look squashed together */
  const gapOf = function (A, B) { return 12 + 1.5 * ((A.w || 2) + (B.w || 2)); };
  const maxGap = 12 + 3 * tracks.reduce(function (m, t) { return Math.max(m, t.w || 2); }, 2);
  /* how far each run may move: a run next to a stub must leave that stub SK_STUB long */
  tracks.forEach(function (t) {
    t.min = -Infinity; t.max = Infinity;
    t.segs.forEach(function (sg) {
      const p = sg[0].pts, i = sg[1], e = p.length - 1;
      if (i === 1 && Math.abs(p[0][o] - p[1][o]) < 0.5) {
        const d0 = Math.sign(p[1][axis] - p[0][axis]) || 1, lim0 = p[0][axis] + d0 * SK_STUB;
        if (d0 > 0) t.min = Math.max(t.min, lim0); else t.max = Math.min(t.max, lim0);
      }
      if (i + 1 === e - 1 && Math.abs(p[e - 1][o] - p[e][o]) < 0.5) {
        const d1 = Math.sign(p[e][axis] - p[e - 1][axis]) || 1, lim1 = p[e][axis] - d1 * SK_STUB;
        if (d1 > 0) t.max = Math.min(t.max, lim1); else t.min = Math.max(t.min, lim1);
      }
    });
    if (t.pinned) { t.min = t.c; t.max = t.c; }
    t.c0 = t.c;
  });
  /* can run t sit at position c? (stub limits, then shapes) - a cheap box test skips
     almost every shape, and each run/position pair is only worked out once */
  const fitMemo = {};
  const fits = function (t, c) {
    if (c < t.min - 0.01 || c > t.max + 0.01) return false;
    const key = t.id + ":" + Math.round(c * 10);           /* a stable id: the list is re-sorted each pass */
    if (fitMemo[key] !== undefined) return fitMemo[key];
    const ok = !t.segs.some(function (sg) {
      const p = sg[0].pts, i = sg[1], q0 = p[i].slice(), q1 = p[i + 1].slice();
      q0[axis] = q1[axis] = c;
      const x0 = Math.min(q0[0], q1[0]), x1 = Math.max(q0[0], q1[0]), y0 = Math.min(q0[1], q1[1]), y1 = Math.max(q0[1], q1[1]);
      for (let oi = 0; oi < obstacles.length; oi++) {
        const r = obstacles[oi];
        if (r[2] < x0 || r[0] > x1 || r[3] < y0 || r[1] > y1) continue;
        if (r.id !== sg[0].from && r.id !== sg[0].to && skSegHitsBox(q0[0], q0[1], q1[0], q1[1], r)) return true;
      }
      return false;
    });
    return (fitMemo[key] = ok);
  };
  /* how often two routes cross (their own joints do not count) */
  const crossCount = function (r1, r2) {
    let n = 0;
    const side = function (p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); };
    for (let i = 1; i < r1.length; i++) for (let j = 1; j < r2.length; j++) {
      const a0 = r1[i - 1], a1 = r1[i], b0 = r2[j - 1], b1 = r2[j];
      if (side(a0, a1, b0) * side(a0, a1, b1) < 0 && side(b0, b1, a0) * side(b0, b1, a1) < 0) n++;
    }
    return n;
  };
  const setC = function (t, c) { t.segs.forEach(function (sg) { sg[0].pts[sg[1]][axis] = c; sg[0].pts[sg[1] + 1][axis] = c; }); };
  /* push crowding pairs apart; if one run is pinned, the other moves the whole distance.
     Which run goes on which side is chosen by trying both and keeping the one where the two
     links cross less - otherwise a link could take the inner channel to the outer port. */
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    tracks.sort(function (x, y) { return (x.c - y.c) || (x.lo - y.lo); });
    for (let a = 0; a < tracks.length; a++) for (let b = a + 1; b < tracks.length && tracks[b].c - tracks[a].c < maxGap - 0.01; b++) {
      const A = tracks[a], B = tracks[b], G = gapOf(A, B);
      if (B.c - A.c >= G - 0.01) continue;
      if (A.net === B.net || Math.min(A.hi, B.hi) - Math.max(A.lo, B.lo) <= 2) continue;
      /* the full gap if anything fits; otherwise as much of it as fits - when shapes or
         stubs block the full gap, two runs used to be left almost on top of each other */
      let bestOpt = null;
      const oa = A.c, ob = B.c;
      [1, 0.7, 0.45].some(function (scale) {
        const Gs = (B.c - A.c) + (G - (B.c - A.c)) * scale;
        const need = Gs - (B.c - A.c), mid = (A.c + B.c) / 2;
        const options = [[A.c - need / 2, B.c + need / 2], [mid + Gs / 2, mid - Gs / 2],
                       [A.c, B.c + need], [A.c - need, B.c], [B.c + Gs, A.c], [B.c, A.c - Gs]];
        let bestX = Infinity;
        options.forEach(function (op) {
          if (!fits(A, op[0]) || !fits(B, op[1])) return;
          setC(A, op[0]); setC(B, op[1]);
          let x = 0;
          A.segs.forEach(function (sa) { B.segs.forEach(function (sb) { x += crossCount(sa[0].pts, sb[0].pts); }); });
          const cost = x * 1000 + Math.abs(op[0] - oa) + Math.abs(op[1] - ob);
          if (cost < bestX) { bestX = cost; bestOpt = op; }
        });
        setC(A, oa); setC(B, ob);
        return !!bestOpt;
      });
      if (bestOpt) { A.c = bestOpt[0]; B.c = bestOpt[1]; setC(A, A.c); setC(B, B.c); moved = true; }
    }
    if (!moved) break;
  }
  tracks.forEach(function (t) {
    if (t.c === t.c0) return;
    t.segs.forEach(function (sg) { sg[0].pts[sg[1]][axis] = t.c; sg[0].pts[sg[1] + 1][axis] = t.c; });
  });
}
/* Several links meeting one side of a shape used to share its single connection point.
   They are now spread along that side as separate ports, ordered by where each one heads,
   so they do not cross; links from the same source keep one port. */
function skSpreadPorts(routes) {
  const bySide = {};
  routes.forEach(function (rt) {
    [["from", 0, 1], ["to", rt.pts.length - 1, rt.pts.length - 2]].forEach(function (end) {
      const el = skFindEl(rt[end[0]]), p = rt.pts, i = end[1], j = end[2];
      if (!el) return;
      const bx = skBox(el), q = p[i];
      let side = null;
      if (Math.abs(q[0] - (bx.x + bx.w)) < 1) side = "r";
      else if (Math.abs(q[0] - bx.x) < 1) side = "l";
      else if (Math.abs(q[1] - bx.y) < 1) side = "t";
      else if (q[1] >= bx.y + bx.h - 1) side = "b";
      if (!side) return;
      const key = el.id + side;
      /* a two-way pair shares one port whichever way each arrow runs */
      const dirTag = String(rt.net).indexOf("pair:") === 0 ? "" : (end[0] === "to" ? ">" : "<");
      (bySide[key] = bySide[key] || { el: el, side: side, ends: [] }).ends.push({ rt: rt, i: i, j: j, net: rt.net + dirTag });
    });
  });
  Object.keys(bySide).forEach(function (key) {
    const sd = bySide[key], along = sd.side === "l" || sd.side === "r" ? 1 : 0;
    /* Order the ports so the links do not cross each other: those that turn upwards after
       leaving the side take the upper ports, nearest channel highest; those that turn
       downwards take the lower ports, nearest channel lowest. (For top and bottom sides
       the same rule runs left to right.) */
    const nets = {}, perp = 1 - along;
    sd.ends.forEach(function (e) {
      const p = e.rt.pts, k = e.i === 0 ? Math.min(2, p.length - 1) : Math.max(0, p.length - 3);
      const dist = Math.abs(p[e.j][perp] - p[e.i][perp]), turn = Math.sign(p[k][along] - p[e.j][along]);
      const key = turn < 0 ? -100000 + dist : turn > 0 ? 100000 - dist : p[k][along];
      (nets[e.net] = nets[e.net] || { ends: [], at: 0 }).ends.push(e);
      nets[e.net].at += key;
    });
    const list = Object.keys(nets).map(function (k) { const n = nets[k]; n.at /= n.ends.length; return n; });
    if (list.length < 2) return;
    list.sort(function (x, y) { return x.at - y.at; });
    const wmax = sd.ends.reduce(function (m, e) { return Math.max(m, e.rt.w || 2); }, 2);
    const bx = skBox(sd.el), span = (along ? bx.h : bx.w) * 0.8, step = Math.min(Math.max(12, 8 + 3 * wmax), span / (list.length - 1));
    list.forEach(function (n, k) {
      const d = (k - (list.length - 1) / 2) * step;
      n.ends.forEach(function (e) {
        const p = e.rt.pts;
        if (Math.abs(p[e.i][along] - p[e.j][along]) > 0.5) return;     /* only a straight stub can slide */
        p[e.i][along] += d; p[e.j][along] += d;
      });
    });
  });
}
/* Where each link's label goes: halfway along, unless that collides with a label already
   placed - then it slides along its own line until it is clear. */
function skPlaceLabels(routes) {
  const placed = [], at = {};
  skctx.font = "11px Segoe UI, Arial, sans-serif";
  sk.elements.forEach(function (c) {
    if (c.isDeleted || !skIsConnector(c) || !c.label || !routes[c.id]) return;
    let pts = routes[c.id];
    if (skLinkStyle(c) === "curved" && pts.length >= 3 && !c.loop) {
      const dense = [pts[0]];
      skCurveSegs(pts).forEach(function (sg) { for (let t = 1; t <= 16; t++) dense.push(skBez(sg, t / 16)); });
      pts = dense;
    }
    const lens = [0];
    let total = 0;
    for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(total); }
    const pointAt = function (f) {
      const want = total * f;
      for (let m = 1; m < pts.length; m++) if (lens[m] >= want) {
        const q = (want - lens[m - 1]) / ((lens[m] - lens[m - 1]) || 1);
        return [pts[m - 1][0] + (pts[m][0] - pts[m - 1][0]) * q, pts[m - 1][1] + (pts[m][1] - pts[m - 1][1]) * q];
      }
      return pts[pts.length - 1];
    };
    const lsz = c.fontSize || 11;
    skctx.font = lsz + "px Segoe UI, Arial, sans-serif";
    const w = skctx.measureText(c.label).width + 18, h = lsz * 1.6;
    let best = null;
    [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8].some(function (f) {
      const pnt = pointAt(f), box = [pnt[0] - w / 2, pnt[1] - h / 2, pnt[0] + w / 2, pnt[1] + h / 2];
      const clash = placed.some(function (b) { return box[0] < b[2] && b[0] < box[2] && box[1] < b[3] && b[1] < box[3]; });
      if (!best) best = { p: pnt, box: box };
      if (!clash) { best = { p: pnt, box: box }; return true; }
      return false;
    });
    placed.push(best.box); at[c.id] = best.p;
  });
  return at;
}
/* ---- circuit nets ----
   A source fanning out to several targets is one net; several sources feeding one target
   are one net too. Links on a net share a trunk, an entry port and a single arrowhead,
   and a dot marks every junction where a trace leaves or joins the bus - so a shared bus
   reads as one connection, not as lines crossing. "Colour links by source" gives each
   net its own colour. */
const SK_NET_COLOURS = ["#e8a23a", "#5fb4e8", "#e86f8a", "#7fd18b", "#b58ae8", "#e8d35f", "#5fd1c9", "#e8875f", "#8aa4e8", "#c9e85f"];
function skNetKey(c) { return c.netKey || c.fromId; }
function skNetColour(el) {
  if (!sk.netColours || !skIsConnector(el)) return skInk(el.strokeColor);
  const keys = sk.netOrder || (sk.netOrder = {}), k = skNetKey(el);
  if (keys[k] === undefined) keys[k] = Object.keys(keys).length;
  return skInk(SK_NET_COLOURS[keys[k] % SK_NET_COLOURS.length]);
}
/* junctions: a corner of one trace that sits on another trace of the same net */
function skFindJunctions(routes) {
  const byNet = {}, dots = [];
  sk.elements.forEach(function (c) {
    if (c.isDeleted || !skIsConnector(c) || !routes[c.id] || skLinkStyle(c) !== "circuit") return;
    (byNet[skNetKey(c)] = byNet[skNetKey(c)] || []).push(c);
  });
  Object.keys(byNet).forEach(function (net) {
    const list = byNet[net];
    if (list.length < 2) return;
    const seen = {};
    list.forEach(function (c) {
      const pts = routes[c.id];
      for (let i = 1; i < pts.length - 1; i++) {
        const v = pts[i];
        const onOther = list.some(function (o) {
          if (o === c) return false;
          const q = routes[o.id];
          for (let j = 1; j < q.length; j++) {
            const a = q[j - 1], b = q[j];
            const inX = v[0] >= Math.min(a[0], b[0]) - 0.6 && v[0] <= Math.max(a[0], b[0]) + 0.6;
            const inY = v[1] >= Math.min(a[1], b[1]) - 0.6 && v[1] <= Math.max(a[1], b[1]) + 0.6;
            const colinear = Math.abs((b[0] - a[0]) * (v[1] - a[1]) - (b[1] - a[1]) * (v[0] - a[0])) < 1;
            /* strictly inside the other trace's run: a real branch, not a shared corner */
            const atEnd = (Math.abs(v[0] - a[0]) < 0.6 && Math.abs(v[1] - a[1]) < 0.6) || (Math.abs(v[0] - b[0]) < 0.6 && Math.abs(v[1] - b[1]) < 0.6);
            if (inX && inY && colinear && !atEnd) return true;
          }
          return false;
        });
        const key = Math.round(v[0]) + "," + Math.round(v[1]);
        if (onOther && !seen[key]) { seen[key] = 1; dots.push({ x: v[0], y: v[1], link: c }); }
      }
    });
  });
  return dots;
}
function skDrawJunctions() {
  if (!sk.junctions) return;
  const k = sk.cam.k, fs = sk.focusSets;
  sk.junctions.forEach(function (j) {
    const s = skToScreen(j.x, j.y);
    skctx.save();
    if (fs && !fs.links[j.link.id]) skctx.globalAlpha = 0.16;
    skctx.fillStyle = skNetColour(j.link);
    skctx.beginPath(); skctx.arc(s[0], s[1], Math.max(2.2, 3.2 * Math.sqrt(k)), 0, Math.PI * 2); skctx.fill();
    skctx.restore();
  });
}
function skBuildRoutes() {
  const out = {}, ortho = [];
  /* A to B and B to A share a net, so they are drawn as one line with an arrowhead at each
     end; as separate nets the spacing pass pulled them apart into two jogged lines */
  /* (a link drawn as a return loop is not part of a pair: it goes round the side on its own) */
  const pairs = {};
  sk.elements.forEach(function (c) { if (!c.isDeleted && skIsConnector(c) && !c.loop) pairs[c.fromId + ">" + c.toId] = 1; });
  const netOf = function (c) {
    if (!c.loop && pairs[c.toId + ">" + c.fromId]) return "pair:" + [c.fromId, c.toId].sort().join("|");
    return skNetKey(c);
  };
  sk.elements.forEach(function (c) {
    if (c.isDeleted || !skIsConnector(c)) return;
    const pts = skLinkRouteRaw(c).map(function (q) { return q.slice(); });
    out[c.id] = pts;
    if (skOrthogonal(pts)) ortho.push({ pts: pts, net: netOf(c), from: c.fromId, to: c.toId, w: c.strokeWidth || 2, pinned: skSegPinned(c, pts) });
  });
  if (ortho.length > 1) {
    const obs = skObstacles(null, null);
    skSpreadPorts(ortho);
    skNudgeAxis(ortho, 0, obs);
    skNudgeAxis(ortho, 1, obs);
  }
  sk.labelAt = skPlaceLabels(out);
  sk.junctions = skFindJunctions(out);
  return out;
}
function skLinksSig() {
  let s = "";
  sk.elements.forEach(function (c) {
    if (!skIsLink(c)) return;
    s += c.id + (c.isDeleted ? "x" : "") + ":" + c.fromId + ">" + c.toId + "," + (c.curve || "") + "," + (c.flow || "") + "," + (c.loop ? 1 : 0) + (c.loopSide || "") + (c.netKey || "") + JSON.stringify(c.ports || "") + "," +
      JSON.stringify(c.via || "") + JSON.stringify(c.lanes || "") + JSON.stringify(c.lanesAbs || "") + JSON.stringify(c.segs || "") + JSON.stringify(c.points || "") + c.x + "," + c.y + ";";
  });
  return s;
}

/* selection helpers: sels is the truth, sel is its first member for single-target code */
function skSelect(els) {
  scheduleChrome();
  setTimeout(function () { if (sk) skTextUI(); }, 0);
  sk.sels = els ? (els.length ? els.slice() : []) : [];
  sk.sel = sk.sels.length ? sk.sels[0] : null;
  skSelUI();
}
function skSelAdd(el) {
  if (!el) return;
  const i = sk.sels.indexOf(el);
  if (i === -1) sk.sels.push(el); else sk.sels.splice(i, 1);
  sk.sel = sk.sels.length ? sk.sels[0] : null;
  skSelUI();
}
function skSelUI() {
  const ts = document.getElementById("skTextRow");
  if (ts) ts.classList.toggle("show", sk.tool === "text" || sk.sels.some(function (e) { return e.type === "text"; }));
  skPanelSync();
}
function skSelBox() {
  if (!sk.sels.length) return null;
  let b = null;
  sk.sels.forEach(function (el) {
    const x = skBox(el);
    if (!b) b = { x: x.x, y: x.y, x2: x.x + x.w, y2: x.y + x.h };
    else { b.x = Math.min(b.x, x.x); b.y = Math.min(b.y, x.y); b.x2 = Math.max(b.x2, x.x + x.w); b.y2 = Math.max(b.y2, x.y + x.h); }
  });
  return { x: b.x, y: b.y, w: b.x2 - b.x, h: b.y2 - b.y };
}
/* every element under the pointer, topmost first, so overlaps can be cycled through */
function skHitAll(wx, wy) {
  const pad = 6 / sk.cam.k, out = [];
  for (let i = sk.elements.length - 1; i >= 0; i--) {
    const b = skBox(sk.elements[i]);
    if (wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad) out.push(sk.elements[i]);
  }
  return out;
}
function skMoveEl(el, dx, dy) {
  el.x += dx; el.y += dy;
  if (el.via) el.via = el.via.map(function (v) { return [v[0] + dx, v[1] + dy]; });
}
/* drop a new shape somewhere free, so stencils don't land on top of each other */
function skFreeSpot(x, y, w, h) {
  for (let tries = 0; tries < 40; tries++) {
    let clash = false;
    for (let i = 0; i < sk.elements.length; i++) {
      const b = skBox(sk.elements[i]);
      if (x < b.x + b.w + 8 && x + w + 8 > b.x && y < b.y + b.h + 8 && y + h + 8 > b.y) { clash = true; break; }
    }
    if (!clash) return [x, y];
    x += w + 24;
    if (tries % 4 === 3) { x -= (w + 24) * 4; y += h + 34; }
  }
  return [x, y];
}
function skSnapTo(v) { return sk.snap ? Math.round(v / 8) * 8 : v; }

/* Resize from the state captured at mousedown, never from the previous frame.
   Scaling the live size by a factor measured against the original box compounds
   on every mouse event, which is what made text jump from 20px to 85px on a 10% drag.

   Icons and text scale uniformly so they never distort; boxes, lines and pen strokes
   stretch freely. In a group, each element keeps its place relative to the group. */
function applyResize(d, fx, fy, nx, ny) {
  const h = d.resize, b0 = d.box;
  const corner = h.length === 2;
  let s = corner ? Math.min(fx, fy) : (h === "e" || h === "w") ? fx : fy;
  s = Math.max(0.1, s);
  const single = d.start.length === 1;

  d.start.forEach(function (st) {
    const el = st.el;
    const uniform = (el.type === "stencil" && !skIsFlow(el.shape)) || el.type === "text";   /* flowchart boxes stretch */
    const tw = Math.max(4, st.w * (uniform ? s : fx));
    const th = Math.max(4, st.h * (uniform ? s : fy));
    let tx, ty;

    if (single) {                           /* pin the side you are not dragging */
      tx = h.indexOf("w") !== -1 ? b0.x + b0.w - tw : h.indexOf("e") !== -1 ? b0.x : b0.x + (b0.w - tw) / 2;
      ty = h.indexOf("n") !== -1 ? b0.y + b0.h - th : h.indexOf("s") !== -1 ? b0.y : b0.y + (b0.h - th) / 2;
    } else {                                /* move each centre with the group, size about it */
      const cx = nx + (st.x + st.w / 2 - b0.x) * fx;
      const cy = ny + (st.y + st.h / 2 - b0.y) * fy;
      tx = cx - tw / 2; ty = cy - th / 2;
    }

    if (el.type === "text") {
      el.fontSize = Math.max(8, Math.min(200, Math.round(st.font * s)));
      el.x = tx; el.y = ty;
    } else if (st.points) {
      const sx = st.w ? tw / st.w : 1, sy = st.h ? th / st.h : 1;
      el.points = st.points.map(function (pt) { return [pt[0] * sx, pt[1] * sy]; });
      el.x = tx - st.minx * sx; el.y = ty - st.miny * sy;
      el.width = tw; el.height = th;
    } else {
      el.x = tx; el.y = ty; el.width = tw; el.height = th;
    }
  });
}

/* eight resize grips around the selection box, in screen space */
/* While dragging, look for edges and centres that line up with other shapes and
   pull to them. Replaces the old align buttons: you align by moving, not by clicking. */
const SNAP_PULL = 7;                 /* how close, in screen pixels, before it grabs */

function snapCandidates(moving) {
  const xs = [], ys = [];
  sk.elements.forEach(function (el) {
    if (moving.indexOf(el) !== -1) return;
    if (skIsConnector(el)) return;
    const b = skBox(el);
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  });
  return { xs: xs, ys: ys };
}
/* returns the nudge to apply, plus the guide lines to draw */
function snapAdjust(box, cand) {
  const tol = SNAP_PULL / sk.cam.k;
  const mine = {
    xs: [box.x, box.x + box.w / 2, box.x + box.w],
    ys: [box.y, box.y + box.h / 2, box.y + box.h]
  };
  const best = { dx: 0, dy: 0, gx: null, gy: null, bx: tol + 1, by: tol + 1 };
  mine.xs.forEach(function (mx) {
    cand.xs.forEach(function (cx) {
      const d = Math.abs(cx - mx);
      if (d <= tol && d < best.bx) { best.bx = d; best.dx = cx - mx; best.gx = cx; }
    });
  });
  mine.ys.forEach(function (my) {
    cand.ys.forEach(function (cy) {
      const d = Math.abs(cy - my);
      if (d <= tol && d < best.by) { best.by = d; best.dy = cy - my; best.gy = cy; }
    });
  });
  return best;
}

function skOrder(dir) {
  if (!sk.sels.length) return;
  skSnapshot();
  const picked = sk.sels.slice();
  const rest = sk.elements.filter(function (e) { return picked.indexOf(e) === -1; });
  sk.elements = dir === "front" ? rest.concat(picked) : picked.concat(rest);
  skChanged(); skDraw();
}
function skDuplicate() {
  if (!sk.sels.length) return;
  skSnapshot();
  const copies = sk.sels.map(function (el) {
    const c = structuredClone(el);
    c.id = skId(); c.x += 18; c.y += 18;
    c.fromId = null; c.toId = null;        /* a copied link would point at the originals */
    return c;
  });
  copies.forEach(function (c) { sk.elements.push(c); });
  skSelect(copies);
  skChanged(); skDraw();
}
function skSetTextSize(px) {
  sk.textSize = px;
  const n = document.getElementById("skTextNum");
  if (n) n.textContent = px;
  const t = sk.sels.filter(function (el) { return el.type === "text"; });
  const st = sk.sels.filter(function (el) { return el.type === "stencil"; });
  const ln = sk.sels.filter(function (el) { return skIsLink(el); });
  if (!t.length && !st.length && !ln.length) return;
  skSnapshot();
  t.forEach(function (el) { el.fontSize = px; });
  ln.forEach(function (el) { el.fontSize = px; });      /* link labels */
  /* stored relative to the shape's own size, so the label keeps growing with the shape */
  st.forEach(function (el) { el.labelScale = 1; el.labelScale = px / skLabelSize(el); });
  skChanged(); skDraw();
}
/* the slider shows the size of whatever is selected */
function skTextUI() {
  const first = sk.sels.filter(function (el) { return el.type === "text" || el.type === "stencil" || skIsLink(el); })[0];
  if (!first) return;
  const px = Math.round(first.type === "text" ? first.fontSize : skIsLink(first) ? (first.fontSize || 11) : skLabelSize(first));
  const r = document.getElementById("skTextRange"), n = document.getElementById("skTextNum");
  if (r) r.value = Math.max(+r.min, Math.min(+r.max, px));
  if (n) n.textContent = px;
}

/* dashed outline in screen space - used by selection, marquee and drop targets */
function skDashRect(x, y, w, h, colour, fillColour) {
  skctx.strokeStyle = colour; skctx.lineWidth = 1;
  skctx.setLineDash([4, 3]);
  skctx.strokeRect(x, y, w, h);
  skctx.setLineDash([]);
  if (fillColour) { skctx.fillStyle = fillColour; skctx.fillRect(x, y, w, h); }
}

function skHandlePoints(x, y, w, h) {
  return [
    { n: "nw", x: x, y: y }, { n: "n", x: x + w / 2, y: y }, { n: "ne", x: x + w, y: y },
    { n: "e", x: x + w, y: y + h / 2 }, { n: "se", x: x + w, y: y + h },
    { n: "s", x: x + w / 2, y: y + h }, { n: "sw", x: x, y: y + h }, { n: "w", x: x, y: y + h / 2 }
  ];
}
function skHandleAt(sx, sy) {
  if (!sk.sels.length || skSingleLink()) return null;   /* a lone link is edited by its bend handles */
  const sb = skSelBox(), sa = skToScreen(sb.x, sb.y);
  const pts = skHandlePoints(sa[0] - 4, sa[1] - 4, sb.w * sk.cam.k + 8, sb.h * sk.cam.k + 8);
  for (let i = 0; i < pts.length; i++) {
    if (Math.abs(sx - pts[i].x) <= 8 && Math.abs(sy - pts[i].y) <= 8) return pts[i].n;
  }
  return null;
}

/* pointer position, the only places either canvas rect is read */
function evWorld(canvas, e, toWorld) {
  const r = canvas.getBoundingClientRect();
  return toWorld(e.clientX - r.left, e.clientY - r.top);
}
function evLocal(canvas, e) {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

/* the box a link's label occupies, in board units */
function skLinkLabelBox(el) {
  if (!el.label) return null;
  let at = sk.routes && sk.labelAt && sk.labelAt[el.id];
  if (!at) {
    const smp = skLinkSamples(el);
    let tot = 0;
    const lens = [0];
    for (let i = 1; i < smp.length; i++) { tot += Math.hypot(smp[i][0] - smp[i - 1][0], smp[i][1] - smp[i - 1][1]); lens.push(tot); }
    at = smp[0];
    for (let m = 1; m < smp.length; m++) if (lens[m] >= tot / 2) {
      const f = (tot / 2 - lens[m - 1]) / ((lens[m] - lens[m - 1]) || 1);
      at = [smp[m - 1][0] + (smp[m][0] - smp[m - 1][0]) * f, smp[m - 1][1] + (smp[m][1] - smp[m - 1][1]) * f]; break;
    }
  }
  const fs = el.fontSize || 11;
  skctx.font = fs + "px Segoe UI, Arial, sans-serif";
  const w = skctx.measureText(el.label).width + 8, h = fs * 1.4;
  return [at[0] - w / 2, at[1] - h / 2, at[0] + w / 2, at[1] + h / 2];
}
function skNearPath(el, wx, wy, pad) {
  const ps = skLinkSamples(el);
  for (let i = 1; i < ps.length; i++) {
    const ax = ps[i - 1][0], ay = ps[i - 1][1], bx = ps[i][0], by = ps[i][1];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((wx - ax) * dx + (wy - ay) * dy) / L)) : 0;
    const cx = ax + t * dx - wx, cy = ay + t * dy - wy;
    if (cx * cx + cy * cy <= pad * pad) return true;
  }
  return false;
}
function skHit(wx, wy) {
  const pad = 6 / sk.cam.k;
  for (let i = sk.elements.length - 1; i >= 0; i--) {
    if (skIsLink(sk.elements[i])) {
      const lb = skLinkLabelBox(sk.elements[i]);
      if (lb && wx >= lb[0] - pad && wx <= lb[2] + pad && wy >= lb[1] - pad && wy <= lb[3] + pad) return sk.elements[i];   /* its label */
      if (skNearPath(sk.elements[i], wx, wy, pad)) return sk.elements[i];
      continue;
    }
    const b = skBox(sk.elements[i]);
    if (wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad) return sk.elements[i];
  }
  return null;
}

