/* ============================================================
   Links: one geometry and one drawing routine for every arrow and line, bound or free.
   Styles: "curved" (a smooth spline through the bends), "sharp" (straight runs with
   softly rounded joins) and "elbow" (right-angled routing from the boxes' sides).
   ============================================================ */
function skIsLink(el) { return el && (el.type === "arrow" || el.type === "line") && !el.isDeleted; }
function skLinkStyle(el) { return el.curve || "sharp"; }
/* circuit traces route exactly like elbows; only their drawing differs */
function skIsOrthoStyle(el) { var c = skLinkStyle(el); return c === "elbow" || c === "circuit"; }

/* the points you can edit: a bound link's ends follow its boxes, its bends are free;
   a free arrow's points are all yours */
function skLinkPoints(el) {
  if (skIsConnector(el)) return skConnectorPath(el);
  return (el.points || []).map(function (q) { return [el.x + q[0], el.y + q[1]]; });
}
/* right-angled route between two boxes, leaving and arriving square to their sides */
function skElbowPoints(el) {
  var a = el.fromId ? skFindEl(el.fromId) : null, b = el.toId ? skFindEl(el.toId) : null;
  var p0, p1, s0, s1;
  if (a && b) {
    /* score the actual right-angled routes, so the chosen sides keep the route clear */
    var via = el.via && el.via.length ? el.via : null, lanes = el.ports ? null : el.lanes;   /* a C round the outside needs no lanes */
    var lanesAbs = via && el.lanesAbs && el.lanesAbs.length === via.length + 1 ? el.lanesAbs : null;
    var best = skPickAnchors(a, b, function (p, q) {
      if (!via && !lanes) return skElbowRoute(p, p.side, q, q.side);
      var horiz = el.flow ? el.flow === "LR" : (p.side === "l" || p.side === "r");
      return skOrthoThrough(p, p.side, via, q, q.side, horiz, lanes, lanesAbs);
    }, el.flow + "|" + (via ? via.length + ":" + via[0] : "") + "|" + (lanes || "") + "|" + (lanesAbs || ""), el.ports);
    return best.pts;
  } else {
    var pts = skLinkPoints(el), f = pts[0], l = pts[pts.length - 1];
    p0 = { x: f[0], y: f[1] }; p1 = { x: l[0], y: l[1] };
    var horiz = Math.abs(l[0] - f[0]) >= Math.abs(l[1] - f[1]);
    s0 = horiz ? (l[0] > f[0] ? "r" : "l") : (l[1] > f[1] ? "b" : "t");
    s1 = horiz ? (l[0] > f[0] ? "l" : "r") : (l[1] > f[1] ? "t" : "b");
  }
  return skElbowRoute(p0, s0, p1, s1);
}
function skElbowRoute(p0, s0, p1, s1) {
  var N = { t: [0, -1], b: [0, 1], l: [-1, 0], r: [1, 0] }, off = 26;   /* room for the arrowhead */
  /* two shapes facing each other across a narrow gap: shorten the stubs to fit, so the link
     runs straight across instead of looping round (cluster neighbours, for instance) */
  var facing = (s0 === "r" && s1 === "l" && p1.x > p0.x) || (s0 === "l" && s1 === "r" && p1.x < p0.x) ? Math.abs(p1.x - p0.x)
             : (s0 === "b" && s1 === "t" && p1.y > p0.y) || (s0 === "t" && s1 === "b" && p1.y < p0.y) ? Math.abs(p1.y - p0.y) : Infinity;
  if (facing < off * 2) off = Math.max(4, facing / 2);
  var A = [p0.x + N[s0][0] * off, p0.y + N[s0][1] * off], B = [p1.x + N[s1][0] * off, p1.y + N[s1][1] * off];
  var out = [[p0.x, p0.y], A];
  var h0 = s0 === "l" || s0 === "r", h1 = s1 === "l" || s1 === "r";
  /* leaving and arriving on the same side: run round the outside in a C */
  var mx = s0 === s1 && h0 ? (s0 === "l" ? Math.min(A[0], B[0]) : Math.max(A[0], B[0])) : (A[0] + B[0]) / 2;
  var my = s0 === s1 && !h0 ? (s0 === "t" ? Math.min(A[1], B[1]) : Math.max(A[1], B[1])) : (A[1] + B[1]) / 2;
  if (h0 && h1) out.push([mx, A[1]], [mx, B[1]]);
  else if (!h0 && !h1) out.push([A[0], my], [B[0], my]);
  else if (h0) out.push([B[0], A[1]]);
  else out.push([A[0], B[1]]);
  out.push(B, [p1.x, p1.y]);
  /* drop repeats and points that sit on a straight run */
  var clean = [];
  out.forEach(function (q) {
    var last = clean[clean.length - 1];
    if (last && Math.abs(last[0] - q[0]) < 0.5 && Math.abs(last[1] - q[1]) < 0.5) return;
    if (clean.length >= 2) {
      var pr = clean[clean.length - 2];
      var straight = (Math.abs(pr[0] - last[0]) < 0.5 && Math.abs(last[0] - q[0]) < 0.5) ||
                     (Math.abs(pr[1] - last[1]) < 0.5 && Math.abs(last[1] - q[1]) < 0.5);
      /* merge only when the line carries on; a reversal stays visible, so it can be scored */
      var onward = (last[0] - pr[0]) * (q[0] - last[0]) + (last[1] - pr[1]) * (q[1] - last[1]) >= 0;
      if (straight && onward) clean.pop();
    }
    clean.push(q);
  });
  return clean;
}
/* the points the drawn line actually runs through */
/* ---- moving an elbow segment ----
   el.segs = { index: [axis, offset] }: a middle segment of an automatic elbow route, moved
   off its automatic position by offset (axis 0: a vertical run moved left/right; 1: a
   horizontal run moved up/down). Only runs whose neighbours meet them at right angles move,
   so the route stays square; the offset follows the route as the shapes move. */
function skSegMovable(pts, i) {
  if (i < 1 || i > pts.length - 3) return -1;
  var a = pts[i], b = pts[i + 1], vert = Math.abs(a[0] - b[0]) < 0.5, horz = Math.abs(a[1] - b[1]) < 0.5;
  if (vert === horz) return -1;
  var ax = vert ? 0 : 1, prev = pts[i - 1], next = pts[i + 2];
  if (Math.abs(prev[1 - ax] - a[1 - ax]) > 0.5 && Math.abs(prev[ax] - a[ax]) < 0.5) return -1;   /* runs straight on into it */
  if (Math.abs(next[1 - ax] - b[1 - ax]) > 0.5 && Math.abs(next[ax] - b[ax]) < 0.5) return -1;
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 12) return -1;
  return ax;
}
function skApplySegs(el, pts) {
  if (!el.segs) return pts;
  var out = pts.map(function (q) { return q.slice(); });
  Object.keys(el.segs).forEach(function (k) {
    var i = +k, ax = el.segs[k][0], off = el.segs[k][1];
    if (skSegMovable(out, i) !== ax) return;
    var nv = out[i][ax] + off, e = out.length - 1;
    /* keep the stubs into the shapes at least 10 long, pointing the way they did */
    if (i === 1) { var d0 = Math.sign(out[1][ax] - out[0][ax]); if (d0 && (nv - out[0][ax]) * d0 < 10) nv = out[0][ax] + d0 * 10; }
    if (i + 1 === e - 1) { var d1 = Math.sign(out[e][ax] - out[e - 1][ax]); if (d1 && (out[e][ax] - nv) * d1 < 10) nv = out[e][ax] - d1 * 10; }
    out[i][ax] = nv; out[i + 1][ax] = nv;
  });
  return out;
}
function skSegPinned(el, pts) {
  if (!el.segs) return null;
  var pin = {};
  Object.keys(el.segs).forEach(function (k) { if (skSegMovable(pts, +k) === el.segs[k][0]) pin[k] = 1; });
  return pin;
}
function skLinkRoute(el) {
  if (sk.routes && sk.routes[el.id]) return sk.routes[el.id];
  return skLinkRouteRaw(el);
}
function skLinkRouteRaw(el) {
  if (el.loop && skIsConnector(el) && skFindEl(el.fromId) && skFindEl(el.toId)) return skLoopRoute(el);
  return skIsOrthoStyle(el) ? skApplySegs(el, skElbowPoints(el)) : skLinkPoints(el);
}
/* A feedback link (one that runs against the flow) is drawn as a return loop: out of the
   bottom of its source, beneath everything in that row, and up into its target. In a
   top-down diagram the loop runs down the right-hand side instead. Worked out live, so it
   stays clear when shapes move. */
function skLoopRoute(el) {
  var a = skFindEl(el.fromId), b = skFindEl(el.toId), tb = el.flow === "TB";
  var ea = skAnchors(a), eb = skAnchors(b);
  var ext = function (e) {
    var bx = skBox(e), under = !skIsFlow(e.shape) && e.label ? skLabelSize(e) * 1.6 : 0;
    return { x0: bx.x, y0: bx.y, x1: bx.x + bx.w, y1: bx.y + bx.h + under };
  };
  var A = ext(a), B = ext(b), gap = 30 + Math.max(0, (el.strokeWidth || 2) - 2) * 4;
  var others = sk.elements.filter(function (e) { return e.type === "stencil" && !e.isDeleted && e !== a && e !== b; }).map(ext);
  /* the loop on one side of the row (or column), clear of every shape between its ends */
  var build = function (flipSide) {
    var pa = tb ? (flipSide ? ea[3] : ea[1]) : (flipSide ? ea[0] : ea[2]);
    var pb = tb ? (flipSide ? eb[3] : eb[1]) : (flipSide ? eb[0] : eb[2]);
    if (!tb) {
      var lo = Math.min(A.x0, B.x0), hi = Math.max(A.x1, B.x1), top = Math.min(A.y0, B.y0), bot = Math.max(A.y1, B.y1);
      var floor = flipSide ? top : bot;
      others.forEach(function (E) { if (E.x1 > lo && E.x0 < hi && E.y1 > top - 10 && E.y0 < bot + 10) floor = flipSide ? Math.min(floor, E.y0) : Math.max(floor, E.y1); });
      var y = flipSide ? floor - gap : floor + gap;
      return [[pa.x, pa.y], [pa.x, y], [pb.x, y], [pb.x, pb.y]];
    }
    var lo2 = Math.min(A.y0, B.y0), hi2 = Math.max(A.y1, B.y1), left = Math.min(A.x0, B.x0), right = Math.max(A.x1, B.x1);
    var wall = flipSide ? left : right;
    others.forEach(function (E) { if (E.y1 > lo2 && E.y0 < hi2 && E.x1 > left - 10 && E.x0 < right + 10) wall = flipSide ? Math.min(wall, E.x0) : Math.max(wall, E.x1); });
    var x = flipSide ? wall - gap : wall + gap;
    return [[pa.x, pa.y], [x, pa.y], [x, pb.y], [pb.x, pb.y]];
  };
  /* how many shapes a path crosses: the way into an end can pass a neighbour sitting beside it */
  var hits = function (pts) {
    var n = 0;
    others.forEach(function (E) {
      var r = [E.x0 + 2, E.y0 + 2, E.x1 - 2, E.y1 - 2];
      for (var i = 1; i < pts.length; i++) if (skSegHitsBox(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], r)) { n++; break; }
    });
    return n;
  };
  /* the usual side unless it runs through something and the other side is clearer */
  var usual = tb ? el.loopSide === "l" : el.loopSide === "t";
  var one = build(usual);
  var h1 = hits(one);
  if (!h1) return one;
  var two = build(!usual);
  return hits(two) < h1 ? two : one;
}

/* Catmull-Rom through the points, as cubic Bezier segments [p0, c1, c2, p1] */
function skCurveSegs(pts) {
  var segs = [];
  for (var i = 0; i < pts.length - 1; i++) {
    var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    segs.push([p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
                   [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2]);
  }
  return segs;
}
function skBez(s, t) {
  var u = 1 - t;
  return [u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0],
          u * u * u * s[0][1] + 3 * u * u * t * s[1][1] + 3 * u * t * t * s[2][1] + t * t * t * s[3][1]];
}
/* the drawn line as a dense polyline: used for hit testing, bounds and label placement */
function skLinkSamples(el) {
  var pts = skLinkRoute(el);
  if (pts.length < 3 || skLinkStyle(el) !== "curved") return pts;
  var out = [pts[0]];
  skCurveSegs(pts).forEach(function (s) { for (var t = 1; t <= 16; t++) out.push(skBez(s, t / 16)); });
  return out;
}
/* where a segment's midpoint sits on the drawn line, for the add-a-bend handles */
function skLinkAt(el, i, t) {
  var pts = skLinkPoints(el);
  if (skLinkStyle(el) === "curved" && pts.length >= 3) return skBez(skCurveSegs(pts)[i], t);
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
}
function skLinkMid(el, i) {
  var pts = skLinkPoints(el);
  if (skLinkStyle(el) === "curved" && pts.length >= 3) return skBez(skCurveSegs(pts)[i], 0.5);
  return [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
}

function skDrawLink(el) {
  var k = sk.cam.k, style = skLinkStyle(el);
  var pts = skLinkRoute(el).map(function (q) { return skToScreen(q[0], q[1]); });
  if (pts.length < 2) return;
  var lw = Math.max(1, el.strokeWidth * k) * (sk.emphasis ? 1.6 : 1);   /* a focused node's links stand out */
  var circuit = style === "circuit";
  var headLen = Math.max(8, (7 + el.strokeWidth * 2.4) * Math.sqrt(k)), headW = headLen * 0.55;
  var segs = style === "curved" && pts.length >= 3 ? skCurveSegs(pts) : null;
  /* directions the line arrives at its ends, for arrowheads that follow the curve */
  var endFrom = segs ? segs[segs.length - 1][2] : pts[pts.length - 2];
  var startFrom = segs ? segs[0][1] : pts[1];
  var dir = function (tip, from) {
    var dx = tip[0] - from[0], dy = tip[1] - from[1], L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  };
  var endDir = dir(pts[pts.length - 1], endFrom), startDir = dir(pts[0], startFrom);
  var arrowEnd = el.type === "arrow" && !skIsSplitter(skFindEl(el.toId));
  var arrowStart = el.type === "arrow" && !!el.startArrowhead && !skIsSplitter(skFindEl(el.fromId));
  /* stop the line under the arrowhead, so its tip stays sharp */
  var line = pts.map(function (q) { return q.slice(); });
  if (arrowEnd) { var e = line[line.length - 1]; e[0] -= endDir[0] * headLen * 0.6; e[1] -= endDir[1] * headLen * 0.6; }
  if (arrowStart) { var s0 = line[0]; s0[0] -= startDir[0] * headLen * 0.6; s0[1] -= startDir[1] * headLen * 0.6; }
  var lsegs = segs ? skCurveSegs(line) : null;
  skctx.save();
  skctx.strokeStyle = skNetColour(el);
  skctx.lineWidth = lw; skctx.lineCap = "round"; skctx.lineJoin = "round";
  if (el.strokeStyle === "dashed") skctx.setLineDash([6 * Math.max(0.6, k), 5 * Math.max(0.6, k)]);
  skctx.beginPath(); skctx.moveTo(line[0][0], line[0][1]);
  if (lsegs) lsegs.forEach(function (s) { skctx.bezierCurveTo(s[1][0], s[1][1], s[2][0], s[2][1], s[3][0], s[3][1]); });
  else if (circuit) {
    /* circuit traces: 45-degree chamfered corners, like copper on a board */
    for (var ci = 1; ci < line.length - 1; ci++) {
      var pa = line[ci - 1], pb = line[ci], pc = line[ci + 1];
      var l1 = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1, l2 = Math.hypot(pc[0] - pb[0], pc[1] - pb[1]) || 1;
      var cut = Math.min(9 * Math.max(0.6, k), l1 / 2, l2 / 2);
      skctx.lineTo(pb[0] - (pb[0] - pa[0]) / l1 * cut, pb[1] - (pb[1] - pa[1]) / l1 * cut);
      skctx.lineTo(pb[0] + (pc[0] - pb[0]) / l2 * cut, pb[1] + (pc[1] - pb[1]) / l2 * cut);
    }
    skctx.lineTo(line[line.length - 1][0], line[line.length - 1][1]);
  }
  else {
    for (var i = 1; i < line.length - 1; i++) {        /* rounded joins */
      var a = line[i - 1], b = line[i], c = line[i + 1];
      var r = Math.min(12 * Math.max(0.6, k), Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, Math.hypot(c[0] - b[0], c[1] - b[1]) / 2);
      skctx.arcTo(b[0], b[1], c[0], c[1], r);
    }
    skctx.lineTo(line[line.length - 1][0], line[line.length - 1][1]);
  }
  skctx.stroke();
  skctx.setLineDash([]);
  /* filled arrowheads */
  var head = function (tip, d) {
    var bx = tip[0] - d[0] * headLen, by = tip[1] - d[1] * headLen;
    skctx.beginPath();
    skctx.moveTo(tip[0], tip[1]);
    skctx.lineTo(bx - d[1] * headW, by + d[0] * headW);
    skctx.quadraticCurveTo(tip[0] - d[0] * headLen * 0.72, tip[1] - d[1] * headLen * 0.72, bx + d[1] * headW, by - d[0] * headW);
    skctx.closePath(); skctx.fill();
  };
  skctx.fillStyle = skctx.strokeStyle;
  if (circuit && !skIsSplitter(skFindEl(el.fromId))) {  /* a pad where the trace leaves its source */
    skctx.beginPath(); skctx.arc(pts[0][0], pts[0][1], Math.max(2, 2.6 * Math.sqrt(k)) * (sk.emphasis ? 1.3 : 1), 0, Math.PI * 2); skctx.fill();
  }
  if (arrowEnd) head(pts[pts.length - 1], endDir);
  if (arrowStart) head(pts[0], startDir);
  skctx.restore();
  /* the label sits halfway along the drawn line, on a knocked-out background */
  if (el.label) {
    var smp = skLinkSamples(el).map(function (q) { return skToScreen(q[0], q[1]); }), total = 0, lens = [0];
    for (var j = 1; j < smp.length; j++) { total += Math.hypot(smp[j][0] - smp[j - 1][0], smp[j][1] - smp[j - 1][1]); lens.push(total); }
    var half = total / 2, at = smp[0];
    for (var m = 1; m < smp.length; m++) if (lens[m] >= half) {
      var f = (half - lens[m - 1]) / ((lens[m] - lens[m - 1]) || 1);
      at = [smp[m - 1][0] + (smp[m][0] - smp[m - 1][0]) * f, smp[m - 1][1] + (smp[m][1] - smp[m - 1][1]) * f]; break;
    }
    if (sk.routes && sk.labelAt && sk.labelAt[el.id]) at = skToScreen(sk.labelAt[el.id][0], sk.labelAt[el.id][1]);   /* slid clear of other labels */
    var fs = Math.max(7, (el.fontSize || 11) * k);           /* a link label's own size */
    skctx.font = fs + "px Segoe UI, Arial, sans-serif";
    var tw = skctx.measureText(el.label).width;
    skctx.fillStyle = themeColour("--bg");
    skctx.fillRect(at[0] - tw / 2 - 4, at[1] - fs * 0.7, tw + 8, fs * 1.4);
    skctx.fillStyle = skInk(el.strokeColor);
    skctx.textAlign = "center"; skctx.textBaseline = "middle";
    skctx.fillText(el.label, at[0], at[1]);
    skctx.textAlign = "left"; skctx.textBaseline = "top";
  }
}

/* ---- bending: handles on the selected link ---- */
function skLinkEditable(el, i, n) { return skIsConnector(el) ? (i > 0 && i < n - 1) : true; }
function skLinkHandles(el) {
  var out = [], pts = skLinkPoints(el), n = pts.length;
  if (el.loop) return out;                                 /* loops route themselves */
  if (skIsOrthoStyle(el)) {                                /* elbow and circuit: a handle on each middle run */
    var rp = skLinkRoute(el);
    for (var si2 = 1; si2 < rp.length - 2; si2++) {
      var ax2 = skSegMovable(rp, si2);
      if (ax2 < 0) continue;
      out.push({ kind: "seg", i: si2, ax: ax2, x: (rp[si2][0] + rp[si2 + 1][0]) / 2, y: (rp[si2][1] + rp[si2 + 1][1]) / 2 });
    }
    return out;
  }
  pts.forEach(function (q, i) { if (skLinkEditable(el, i, n)) out.push({ kind: "pt", i: i, x: q[0], y: q[1] }); });
  /* the add-a-bend handle sits mid-segment, unless the label is there: then it moves along
     the segment to the nearest clear spot, so labelled links can still be bent */
  var lb = skLinkLabelBox(el);
  for (var i = 0; i < n - 1; i++) {
    var m = skLinkMid(el, i);
    if (lb) {
      var spots = [0.5, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88];
      for (var si = 0; si < spots.length; si++) {
        var q = skLinkAt(el, i, spots[si]);
        if (!(q[0] >= lb[0] - 6 && q[0] <= lb[2] + 6 && q[1] >= lb[1] - 6 && q[1] <= lb[3] + 6)) { m = q; break; }
      }
    }
    out.push({ kind: "mid", i: i, x: m[0], y: m[1] });
  }
  return out;
}
function skSingleLink() { return sk.sels.length === 1 && skIsLink(sk.sels[0]) ? sk.sels[0] : null; }
function skLinkHandleAt(sx, sy) {
  var el = skSingleLink();
  if (!el) return null;
  var w = skToWorld(sx, sy), lb = skLinkLabelBox(el), onLabel = lb && w[0] >= lb[0] && w[0] <= lb[2] && w[1] >= lb[1] && w[1] <= lb[3];
  var hs = skLinkHandles(el), best = null;
  hs.forEach(function (h) {
    var s = skToScreen(h.x, h.y), d = Math.hypot(s[0] - sx, s[1] - sy);
    if (h.kind === "mid" && onLabel) return;            /* the label is there: clicks go to it */
    if (d <= (h.kind === "pt" || h.kind === "seg" ? 10 : 8) && (!best || d < best.d || (h.kind === "pt" && best.h.kind === "mid"))) best = { d: d, h: h };
  });
  return best ? { el: el, kind: best.h.kind, i: best.h.i, ax: best.h.ax } : null;
}
function skSetLinkPoint(el, i, wx, wy) {
  delete el.autoVia; delete el.lanesAbs;              /* your own bend now */
  if (skIsConnector(el)) { el.via[i - 1] = [wx, wy]; return; }
  el.points[i] = [wx - el.x, wy - el.y];
}
function skInsertLinkPoint(el, i, wx, wy) {      /* a new point after control point i */
  delete el.autoVia; delete el.lanesAbs;
  if (skIsConnector(el)) { el.via = el.via || []; el.via.splice(i, 0, [wx, wy]); return i + 1; }
  el.points.splice(i + 1, 0, [wx - el.x, wy - el.y]); return i + 1;
}
function skRemoveLinkPoint(el, i) {
  if (skIsConnector(el)) { el.via.splice(i - 1, 1); if (!el.via.length) delete el.via; return; }
  if (el.points.length > 2) el.points.splice(i, 1);
}
/* a dragged bend snaps to the grid, and level with its neighbours when close */
function skBendSnap(el, i, wx, wy, free) {
  if (free) return [wx, wy];
  var x = skSnapTo(wx), y = skSnapTo(wy), pts = skLinkPoints(el), tol = 8 / sk.cam.k;
  [pts[i - 1], pts[i + 1]].forEach(function (nb) {
    if (!nb) return;
    if (Math.abs(wx - nb[0]) < tol) x = nb[0];
    if (Math.abs(wy - nb[1]) < tol) y = nb[1];
  });
  return [x, y];
}
function skFitLinkBox(el) {
  if (skIsConnector(el) || !el.points) return;
  var b = skBox(el); el.width = b.w; el.height = b.h;
}
function skDrawLinkHandles(el) {
  skLinkHandles(el).forEach(function (h) {
    var s = skToScreen(h.x, h.y);
    skctx.beginPath();
    if (h.kind === "seg") {                        /* a pill along the run: drag across it */
      var lw2 = h.ax === 0 ? 7 : 20, lh2 = h.ax === 0 ? 20 : 7;
      skctx.roundRect ? skctx.roundRect(s[0] - lw2 / 2, s[1] - lh2 / 2, lw2, lh2, 3.5) : skctx.rect(s[0] - lw2 / 2, s[1] - lh2 / 2, lw2, lh2);
      skctx.fillStyle = themeColour("--bg"); skctx.fill();
      skctx.lineWidth = 1.5; skctx.strokeStyle = skInk(pc("blue")); skctx.stroke();
    } else if (h.kind === "pt") {
      skctx.arc(s[0], s[1], 5, 0, Math.PI * 2);
      skctx.fillStyle = skInk(pc("blue")); skctx.fill();
      skctx.lineWidth = 2; skctx.strokeStyle = themeColour("--bg"); skctx.stroke();
    } else {
      skctx.arc(s[0], s[1], 4, 0, Math.PI * 2);
      skctx.fillStyle = themeColour("--bg"); skctx.fill();
      skctx.lineWidth = 1.5; skctx.strokeStyle = skInk(pc("blue")); skctx.stroke();
    }
  });
}

