/* ============================================================
   backlinks + graph data
   ============================================================ */

function wikilinksIn(text) {
  var re = /\[\[([^\]\n]+)\]\]/g, out = [], m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

/* One pass over the vault builds every note's backlinks at once. Rebuilt only when
   the notes actually change, which a cheap signature detects without any call sites
   having to remember to invalidate. */
var blCache = { sig: null, index: null };

function notesSignature() {
  var sig = state.notes.length + ":";
  for (var i = 0; i < state.notes.length; i++) sig += state.notes[i].content.length + ",";
  return sig;
}
function buildBacklinkIndex() {
  var index = {};
  state.notes.forEach(function (n) {
    var ls = n.content.split("\n");
    for (var i = 0; i < ls.length; i++) {
      var links = wikilinksIn(ls[i]);
      if (!links.length) continue;
      var seen = {};
      for (var j = 0; j < links.length; j++) {
        var k = links[j].toLowerCase();
        if (seen[k]) continue;                 /* one entry per line, as before */
        seen[k] = 1;
        (index[k] = index[k] || []).push({ note: n, line: i, text: ls[i] });
      }
    }
  });
  return index;
}
function backlinksFor(title) {
  syncAllPanes();
  var sig = notesSignature();
  if (blCache.sig !== sig) { blCache.index = buildBacklinkIndex(); blCache.sig = sig; }
  var t = String(title).toLowerCase();
  return (blCache.index[t] || []).filter(function (r) { return r.note.title.toLowerCase() !== t; });
}

function buildGraph() {
  syncAllPanes();
  var nodes = state.notes.map(function (n) {
    return { id: n.id, title: n.title, x: 0, y: 0, vx: 0, vy: 0, deg: 0 };
  });
  var byTitle = {};
  nodes.forEach(function (nd) { byTitle[nd.title.toLowerCase()] = nd; });
  var edges = [];
  /* one edge per pair of notes, whichever way round they link: the graph draws a single
     line either way, and counting A->B and B->A separately listed the same note twice
     and inflated link counts and how prominent a body looks */
  var seen = {};
  state.notes.forEach(function (n) {
    var from = byTitle[n.title.toLowerCase()];
    wikilinksIn(n.content).forEach(function (t) {
      var to = byTitle[String(t).toLowerCase()];
      if (!to || to === from) return;
      var key = String(from.id) < String(to.id) ? from.id + "\u0000" + to.id : to.id + "\u0000" + from.id;
      if (seen[key]) return;
      seen[key] = 1;
      edges.push({ a: from, b: to });
      from.deg++; to.deg++;
    });
  });
  return { nodes: nodes, edges: edges };
}

