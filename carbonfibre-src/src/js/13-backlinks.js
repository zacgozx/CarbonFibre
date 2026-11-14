/* ============================================================
   backlinks + graph data
   ============================================================ */

function wikilinksIn(text) {
  const re = /\[\[([^\]\n]+)\]\]/g, out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

/* One pass over the vault builds every note's backlinks at once. Rebuilt only when
   the notes actually change, which a cheap signature detects without any call sites
   having to remember to invalidate. */
const blCache = { sig: null, index: null };

function notesSignature() {
  let sig = state.notes.length + ":";
  for (let i = 0; i < state.notes.length; i++) sig += state.notes[i].content.length + ",";
  return sig;
}
function buildBacklinkIndex() {
  const index = {};
  state.notes.forEach(function (n) {
    const ls = n.content.split("\n");
    for (let i = 0; i < ls.length; i++) {
      const links = wikilinksIn(ls[i]);
      if (!links.length) continue;
      const seen = {};
      for (let j = 0; j < links.length; j++) {
        const k = links[j].toLowerCase();
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
  const sig = notesSignature();
  if (blCache.sig !== sig) { blCache.index = buildBacklinkIndex(); blCache.sig = sig; }
  const t = String(title).toLowerCase();
  return (blCache.index[t] || []).filter(function (r) { return r.note.title.toLowerCase() !== t; });
}

function buildGraph() {
  syncAllPanes();
  const nodes = state.notes.map(function (n) {
    return { id: n.id, title: n.title, x: 0, y: 0, vx: 0, vy: 0, deg: 0 };
  });
  const byTitle = {};
  nodes.forEach(function (nd) { byTitle[nd.title.toLowerCase()] = nd; });
  const edges = [];
  /* one edge per pair of notes, whichever way round they link: the graph draws a single
     line either way, and counting A->B and B->A separately listed the same note twice
     and inflated link counts and how prominent a body looks */
  const seen = {};
  state.notes.forEach(function (n) {
    const from = byTitle[n.title.toLowerCase()];
    wikilinksIn(n.content).forEach(function (t) {
      const to = byTitle[String(t).toLowerCase()];
      if (!to || to === from) return;
      const key = String(from.id) < String(to.id) ? from.id + "\u0000" + to.id : to.id + "\u0000" + from.id;
      if (seen[key]) return;
      seen[key] = 1;
      edges.push({ a: from, b: to });
      from.deg++; to.deg++;
    });
  });
  return { nodes: nodes, edges: edges };
}

