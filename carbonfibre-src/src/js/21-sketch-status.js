/* ============================================================
   System status and dependencies.
   Every system icon has a status: operational (the default), degraded, critical or down.
   An arrow points from the thing that uses to the thing it uses, so impact flows back
   along it: a dependency that is down makes its users critical; a critical one makes
   them degraded. Each link can opt out ("Carries impact"); plain lines never carry it.
   ============================================================ */
var SK_STATUS = [
  { id: "operational", label: "Operational", colour: "#2f9e5a" },
  { id: "degraded",    label: "Degraded",    colour: "#e0a800" },
  { id: "critical",    label: "Critical",    colour: "#d64045" },
  { id: "down",        label: "Down",        colour: "#141414" }
];
var SK_RANK = { operational: 0, degraded: 1, critical: 2, down: 3 };
function skIsSplitter(el) { return !!el && el.type === "stencil" && el.shape === "splitter"; }
/* a system has a status; flowchart shapes and splitters do not */
function skIsSystem(el) { return el && el.type === "stencil" && !el.isDeleted && !skIsFlow(el.shape) && el.shape !== "splitter"; }
function skCarriesImpact(c) { return c.type === "arrow" && c.impact !== false && c.fromId && c.toId; }
/* the status every system ends up with, and why: worst of its own and what it inherits */
function skComputeStatus() {
  var eff = {}, why = {}, systems = sk.elements.filter(skIsSystem);
  systems.forEach(function (el) { eff[el.id] = SK_RANK[el.status] || 0; });
  var deps = sk.elements.filter(function (c) { return !c.isDeleted && skCarriesImpact(c); });
  /* the user of a dependency is at the arrow's tail; two-headed arrows depend both ways */
  var raw = [];
  deps.forEach(function (c) {
    raw.push([c.fromId, c.toId]);
    if (c.startArrowhead) raw.push([c.toId, c.fromId]);
  });
  /* a splitter is only a junction: a user behind one depends on everything past it */
  var outOf = {};
  raw.forEach(function (pr) { (outOf[pr[0]] = outOf[pr[0]] || []).push(pr[1]); });
  var through = function (id, seen) {
    if (!skIsSplitter(skFindEl(id))) return [id];
    if (seen[id]) return [];
    seen[id] = 1;
    return (outOf[id] || []).reduce(function (acc, d) { return acc.concat(through(d, seen)); }, []);
  };
  var pairs = [];
  raw.forEach(function (pr) {
    if (skIsSplitter(skFindEl(pr[0]))) return;
    through(pr[1], {}).forEach(function (d) { if (d !== pr[0]) pairs.push([pr[0], d]); });
  });
  for (var pass = 0; pass < systems.length + 2; pass++) {    /* settles quickly; bounded for loops */
    var changed = false;
    pairs.forEach(function (pr) {
      var user = pr[0], dep = pr[1];
      if (eff[user] === undefined || eff[dep] === undefined) return;
      var impact = eff[dep] === 3 ? 2 : eff[dep] === 2 ? 1 : 0;
      if (impact > eff[user]) { eff[user] = impact; why[user] = dep; changed = true; }
    });
    if (!changed) break;
  }
  return { eff: eff, why: why };
}
function skStatusOf(el) {
  if (!sk.statusCache) sk.statusCache = skComputeStatus();
  var r = sk.statusCache.eff[el.id] || 0;
  return { rank: r, own: SK_RANK[el.status] || 0, why: sk.statusCache.why[el.id] };
}
/* a dot at the icon's top-right; a ring around it marks a status that was inherited */
function skDrawStatusDot(el, tl, b, k) {
  if (sk.showStatus === false || !skIsSystem(el)) return;
  var st = skStatusOf(el), def = SK_STATUS[st.rank];
  var r = Math.max(3.5, 5.5 * Math.min(1.6, Math.max(0.7, k)));
  var x = tl[0] + b.w * k - r * 0.4, y = tl[1] + r * 0.4;
  skctx.save();
  skctx.beginPath(); skctx.arc(x, y, r + 2, 0, Math.PI * 2);
  skctx.fillStyle = themeColour("--bg"); skctx.fill();
  skctx.beginPath(); skctx.arc(x, y, r, 0, Math.PI * 2);
  skctx.fillStyle = def.colour; skctx.fill();
  if (st.rank === 3) { skctx.lineWidth = 1; skctx.strokeStyle = pc("grey"); skctx.stroke(); }   /* black stays visible on dark */
  if (st.rank > st.own) {
    skctx.beginPath(); skctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
    skctx.lineWidth = 1.5; skctx.strokeStyle = def.colour; skctx.setLineDash([2, 2]); skctx.stroke();
  }
  skctx.restore();
}
function skSetStatus(id) {
  var sys = sk.sels.filter(skIsSystem);
  if (!sys.length) return;
  skSnapshot();
  sys.forEach(function (el) { if (id === "operational") delete el.status; else el.status = id; });
  skChanged(); skDraw(); skPanelSync();
}

/* ============================================================
   Tidy up: lay out everything that is connected, along its links.
   Unconnected shapes stay where you left them. Each connected group keeps its place on
   the board and is laid out in layers, with bends routed around long links.
   ============================================================ */
