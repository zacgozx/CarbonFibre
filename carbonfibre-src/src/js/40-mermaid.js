/* ============================================================
   Mermaid flowcharts -> CarbonFibre sketches.
   Reads graph/flowchart source (any direction): node shapes, the four link kinds,
   link labels, chains, "&" groups and subgraphs. Styling lines are ignored.
   The shapes the author chose are kept; nothing is guessed from the labels.
   ============================================================ */

/* longest openers first, so "((" wins over "(" */
var MM_SHAPES = [
  ["([", "])", "fc-pill"], ["[(", ")]", "database"], ["[[", "]]", "fc-box"], ["((", "))", "fc-circle"],
  ["{{", "}}", "fc-hex"], ["[/", "/]", "fc-para"], ["[\\", "\\]", "fc-para"], ["[/", "\\]", "fc-para"],
  ["[\\", "/]", "fc-para"], ["[", "]", "fc-box"], ["(", ")", "fc-round"], ["{", "}", "fc-diamond"], [">", "]", "fc-box"]
];
/* "A -- text --> B" style links, then plain links with an optional |label| */
var MM_TEXT_LINK = /^\s*(<)?(--|-\.|==)\s+(.+?)\s+(-{2,}[>xo]|-{3,}|\.-+[>xo]?|={2,}[>xo]|={3,})(?=\s|$|[A-Za-z0-9_"])/;
var MM_LINK = /^\s*(<)?(-{2,}[>xo]|-{3,}|-\.+-[>xo]?|={2,}[>xo]|={3,}|~{3,})\s*(?:\|([^|]*)\|)?/;

function mmText(s) {
  s = String(s).trim();
  if (s.length > 1 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') s = s.slice(1, -1);
  return s.replace(/<br\s*\/?>/gi, "\n").replace(/fa:fa-[\w-]+\s*/g, "")
    .replace(/#quot;|&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[*_`]{1,2}([^*_`]+)[*_`]{1,2}/g, "$1").trim();
}
function mmLinkKind(token) {
  /* "~~~" is Mermaid's invisible link: it shapes the layout but is never drawn */
  if (token.charAt(0) === "~") return { arrow: false, dashed: false, thick: false, invisible: true };
  return { arrow: /[>xo]$/.test(token), dashed: token.indexOf(".") !== -1, thick: token.charAt(0) === "=" || token.charAt(token.length - 1) === "=" && token.indexOf("=") !== -1 };
}

/* split a statement list on ";" and newlines, leaving quoted text alone */
function mmStatements(src) {
  var out = [], cur = "", q = false;
  for (var i = 0; i < src.length; i++) {
    var c = src.charAt(i);
    if (c === '"') q = !q;
    if (!q && (c === ";" || c === "\n")) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(function (s) { return s.trim(); }).filter(function (s) { return s && s.indexOf("%%") !== 0; });
}

/* Mermaid styling, shared by flowcharts and state diagrams: "fill:#f9f,stroke:#333" to a style,
   and the classDef / class / style statements (true when the statement was one of them) */
function mmStyleOf(txt) {
  var out = {};
  String(txt).split(",").forEach(function (part) {
    var kv = part.split(":"); if (kv.length < 2) return;
    var k = kv[0].trim().toLowerCase(), v = kv.slice(1).join(":").trim().replace(/;$/, "");
    if (k === "fill" || k === "stroke" || k === "color") out[k] = v;
    else if (k === "stroke-width") out.width = parseFloat(v);
    else if (k === "stroke-dasharray") out.dashed = true;
  });
  return out;
}
function mmStyleLine(g, st, addClass) {
  var cd = /^classDef\s+([\w,-]+)\s+(.+)$/i.exec(st);
  if (cd) { cd[1].split(",").forEach(function (nm) { g.classes[nm.trim()] = mmStyleOf(cd[2]); }); return true; }
  var cl = /^class\s+([\w,\s-]+?)\s+([\w-]+)\s*$/i.exec(st);
  if (cl) { cl[1].split(",").forEach(function (id) { addClass(id.trim(), cl[2]); }); return true; }
  var sy = /^style\s+([\w-]+)\s+(.+)$/i.exec(st);
  if (sy) { (g.inline = g.inline || {})[sy[1]] = mmStyleOf(sy[2]); return true; }
  return false;
}
function parseMermaid(src) {
  var lines = mmStatements(String(src).replace(/\r/g, ""));
  if (!lines.length) throw new Error("The Mermaid block is empty.");
  if (/^stateDiagram(-v2)?\b/i.test(lines[0])) return parseMermaidState(lines);
  if (/^mindmap\b/i.test(lines[0])) return parseMermaidMindmap(String(src).replace(/\r/g, ""));
  if (/^erDiagram\b/i.test(lines[0])) return parseMermaidER(lines);
  if (/^classDiagram(-v2)?\b/i.test(lines[0])) return parseMermaidClass(lines);
  var head = /^(graph|flowchart)\b\s*(TB|TD|BT|RL|LR)?/i.exec(lines[0]);
  if (!head) {
    var kind = (lines[0].split(/\s+/)[0] || "").replace(/[^A-Za-z-]/g, "");
    throw new Error("Flowcharts, state diagrams, mindmaps, ER and class diagrams can be converted. This one is \"" + kind + "\".");
  }
  var dir = (head[2] || "TB").toUpperCase(); if (dir === "TD") dir = "TB";
  var g = { dir: dir, nodes: {}, order: [], edges: [], groups: [], warnings: [], classes: {}, styled: {} };
  /* "fill:#dbeafe,stroke:#2563eb,color:#1e3a8a" -> { fill, stroke, color } */
  function addClass(id, cls) { var n = g.nodes[id]; if (n) (n.classes = n.classes || []).push(cls); else (g.styled[id] = g.styled[id] || []).push(cls); }
  var stack = [];

  function node(id, label, shape) {
    var n = g.nodes[id];
    var here = stack.length ? stack[stack.length - 1] : null;
    if (!n) { n = g.nodes[id] = { id: id, label: id, shape: "fc-box", defined: false, group: null }; g.order.push(id); }
    /* Mermaid places a node in the subgraph it appears inside, even if it was mentioned
       earlier outside one; the first subgraph to claim it keeps it */
    if (here && !n.group) { n.group = here; here.members.push(id); }
    if (label !== undefined && !n.defined) { n.label = label; n.shape = shape; n.defined = true; }
    return n;
  }
  /* one node reference at the start of s: id, optional shape and text, optional :::class */
  function readNode(s) {
    var m = /^\s*([A-Za-z0-9_][\w]*)/.exec(s);
    if (!m) return null;
    var id = m[1], rest = s.slice(m[0].length);
    for (var i = 0; i < MM_SHAPES.length; i++) {
      var op = MM_SHAPES[i][0], cl = MM_SHAPES[i][1];
      if (rest.indexOf(op) !== 0) continue;
      var body = rest.slice(op.length), end;
      if (body.charAt(0) === '"') {
        var q = body.indexOf('"', 1);
        if (q === -1) continue;
        end = body.indexOf(cl, q + 1);
      } else end = body.indexOf(cl);
      if (end === -1) continue;
      var text = body.slice(0, end);
      if (op === "(" && text.charAt(0) === "(") continue;           /* let "((" match instead */
      rest = body.slice(end + cl.length);
      var cm = /^:::([\w-]+)/.exec(rest);
      rest = rest.replace(/^:::[\w-]+/, "");
      return { id: id, label: mmText(text), shape: MM_SHAPES[i][2], rest: rest, cls: cm && cm[1] };
    }
    var cm2 = /^:::([\w-]+)/.exec(rest);
    rest = rest.replace(/^:::[\w-]+/, "");
    return { id: id, rest: rest, cls: cm2 && cm2[1] };
  }
  function readGroup(s) {                        /* A & B & C */
    var list = [], r = readNode(s);
    if (!r) return null;
    list.push(r);
    while (/^\s*&/.test(r.rest)) {
      var nx = readNode(r.rest.replace(/^\s*&/, ""));
      if (!nx) break;
      list.push(nx); r = nx;
    }
    return { nodes: list, rest: r.rest };
  }

  for (var li = 1; li < lines.length; li++) {
    var st = lines[li], lower = st.toLowerCase();
    var dm = /^direction\s+(TB|TD|BT|RL|LR)\b/i.exec(st);
    if (dm) { if (stack.length) stack[stack.length - 1].dir = dm[1].toUpperCase() === "TD" ? "TB" : dm[1].toUpperCase(); continue; }
    if (mmStyleLine(g, st, addClass)) continue;          /* classDef / class / style, shared by both diagram types */
    if (/^(linkstyle|click|accTitle|accDescr)\b/i.test(st)) continue;
    var sg = /^subgraph\s+(.+)$/i.exec(st);
    if (sg) {
      var t = sg[1].trim(), gid = t, title = t;
      var gm = /^([\w-]+)\s*\[\s*"?(.*?)"?\s*\]\s*$/.exec(t);
      if (gm) { gid = gm[1]; title = gm[2]; }
      else title = mmText(t);
      var grp = { id: gid, title: title, members: [], parent: stack.length ? stack[stack.length - 1] : null };
      stack.push(grp); g.groups.push(grp);
      continue;
    }
    if (lower === "end") { stack.pop(); continue; }

    var left = readGroup(st);
    if (!left) { g.warnings.push("Skipped a line I could not read: " + st.slice(0, 60)); continue; }
    left.nodes.forEach(function (r) { node(r.id, r.label, r.shape); if (r.cls) addClass(r.id, r.cls); });
    var rest = left.rest;
    while (rest && rest.trim()) {
      var lm = MM_TEXT_LINK.exec(rest), label = "", token;
      if (lm) { label = mmText(lm[3]); token = lm[2] + lm[4]; rest = rest.slice(lm[0].length); }
      else {
        lm = MM_LINK.exec(rest);
        if (!lm) { g.warnings.push("Skipped the end of a line I could not read: " + rest.trim().slice(0, 60)); break; }
        token = lm[2]; label = lm[3] ? mmText(lm[3]) : ""; rest = rest.slice(lm[0].length);
      }
      kind = mmLinkKind(token); var both = !!lm[1];
      var right = readGroup(rest);
      if (!right) { g.warnings.push("A link had nothing on its right-hand side: " + st.slice(0, 60)); break; }
      right.nodes.forEach(function (r) { node(r.id, r.label, r.shape); if (r.cls) addClass(r.id, r.cls); });
      left.nodes.forEach(function (a) {
        right.nodes.forEach(function (b) {
          g.edges.push({ a: a.id, b: b.id, label: label, arrow: kind.arrow, dashed: kind.dashed, thick: kind.thick, both: both, invisible: !!kind.invisible });
        });
      });
      left = right; rest = right.rest;
    }
  }
  return mmFinish(g);
}
/* the last steps every Mermaid type shares: links to a group's own id go to its box, and the
   classDef / class / style colours land on their nodes */
function mmFinish(g) {
  /* a link to a subgraph's own id goes to the subgraph's box, as Mermaid draws it */
  var gids = {}; g.groups.forEach(function (x) { gids[x.id] = 1; });
  g.edges.forEach(function (e) {
    if (gids[e.a] && !(g.nodes[e.a] && g.nodes[e.a].defined)) e.aGroup = true;
    if (gids[e.b] && !(g.nodes[e.b] && g.nodes[e.b].defined)) e.bGroup = true;
  });
  g.order = g.order.filter(function (id) { return !(gids[id] && !g.nodes[id].defined); });
  g.groups.forEach(function (gr) { gr.members = gr.members.filter(function (id) { return !(gids[id] && !g.nodes[id].defined); }); });
  /* colours: classDef default, then each class in order, then any style line */
  g.order.forEach(function (id) {
    var n = g.nodes[id], st2 = {};
    var apply = function (o) { if (o) Object.keys(o).forEach(function (k) { st2[k] = o[k]; }); };
    apply(g.classes["default"]);
    (n.classes || []).concat(g.styled[id] || []).forEach(function (c) { apply(g.classes[c]); });
    apply(g.inline && g.inline[id]);
    if (Object.keys(st2).length) n.style = st2;
  });
  if (!g.order.length) throw new Error("No nodes found in the Mermaid block.");
  return g;
}

/* ---- more Mermaid types, through the same layout and drawing ---- */
function mmBlank(kind, dir) { return { dir: dir, nodes: {}, order: [], edges: [], groups: [], warnings: [], classes: {}, styled: {}, kind: kind }; }
function mmAddNode(g, id, label, shape) {
  var n = g.nodes[id];
  if (!n) { n = g.nodes[id] = { id: id, label: label === undefined ? id : label, shape: shape || "fc-box", defined: true, group: null }; g.order.push(id); }
  else { if (label !== undefined) n.label = label; if (shape) n.shape = shape; }
  return n;
}
/* mindmap: the tree comes from the indentation; shapes as Mermaid writes them */
function parseMermaidMindmap(src) {
  var g = mmBlank("mindmap", "LR"), stack = [], k = 0;
  var shapes = [[/^\(\((.*)\)\)$/, "fc-circle"], [/^\)\)(.*)\(\($/, "fc-hex"], [/^\)(.*)\($/, "fc-round"], [/^\{\{(.*)\}\}$/, "fc-hex"], [/^\((.*)\)$/, "fc-round"], [/^\[(.*)\]$/, "fc-box"]];
  src.split("\n").slice(1).forEach(function (line) {
    if (!line.trim() || /^\s*%%/.test(line)) return;
    if (/^\s*::icon\(/.test(line)) return;                       /* icons aren't drawn */
    var cls = /:::\s*([\w\s-]+)$/.exec(line); if (cls) line = line.slice(0, cls.index);
    var depth = line.match(/^\s*/)[0].replace(/\t/g, "    ").length, text = line.trim(), shape = "fc-round", label = text;
    var idm = /^([\w-]+)(?=[\[({)])/.exec(text); if (idm) text = text.slice(idm[0].length);
    for (var i = 0; i < shapes.length; i++) { var m = shapes[i][0].exec(text); if (m) { label = m[1]; shape = shapes[i][1]; break; } }
    if (i === shapes.length) label = text;
    var id = "\u00a7mm" + (++k), n = mmAddNode(g, id, mmText(label), shape);
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length) g.edges.push({ a: stack[stack.length - 1].id, b: id, label: "", arrow: false, dashed: false });
    else n.style = { fill: "#9b3d4b", stroke: "#bf6a78", color: "#ffffff" };   /* the root stands out */
    stack.push({ id: id, depth: depth });
  });
  return mmFinish(g);
}
/* ER diagram: entities with attributes; relationships labelled with cardinality and the verb */
function parseMermaidER(lines) {
  var g = mmBlank("er", "LR"), attrs = {}, cur = null;
  var card = function (s, left) {
    var t = left ? s.slice(0, 2) : s.slice(-2);
    return { "||": "1", "|o": "0..1", "o|": "0..1", "}|": "1..n", "|{": "1..n", "}o": "0..n", "o{": "0..n" }[t] || "";
  };
  for (var li = 1; li < lines.length; li++) {
    var st = lines[li];
    if (/^direction\s+(TB|TD|BT|RL|LR)/i.test(st)) { g.dir = st.split(/\s+/)[1].toUpperCase().replace("TD", "TB"); continue; }
    if (cur) {
      if (st === "}") { cur = null; continue; }
      var am = /^([\w()[\],-]+)\s+([\w-]+)\s*((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*)?\s*(?:"([^"]*)")?/.exec(st);
      if (am) attrs[cur].push((am[3] ? am[3].replace(/\s+/g, "") + " " : "") + am[2] + ": " + am[1]);
      continue;
    }
    var bm = /^"?([\w-]+)"?(?:\["([^"]+)"\])?\s*\{\s*$/.exec(st);
    if (bm) { cur = bm[1]; attrs[cur] = attrs[cur] || []; mmAddNode(g, cur, bm[2] || cur); continue; }
    var rm = /^"?([\w-]+)"?\s+([|}o][|o]?(?:--|\.\.)[|o]?[|{o])\s+"?([\w-]+)"?\s*(?::\s*"?([^"]*)"?)?$/.exec(st);
    if (rm) {
      mmAddNode(g, rm[1]); mmAddNode(g, rm[3]);
      var rel = rm[2], lab = [card(rel, true), rm[4] ? mmText(rm[4]) : "", card(rel, false)].filter(Boolean).join("  ");
      g.edges.push({ a: rm[1], b: rm[3], label: lab, arrow: false, dashed: rel.indexOf("..") !== -1 });
      continue;
    }
    var lone = /^"?([\w-]+)"?$/.exec(st); if (lone) { mmAddNode(g, lone[1]); continue; }
    g.warnings.push("Skipped a line I could not read: " + st.slice(0, 60));
  }
  g.order.forEach(function (id) {
    var n = g.nodes[id], a = attrs[id] || [];
    if (a.length) n.label = n.label + "\n" + a.join("\n");
    n.style = { fill: "transparent", stroke: "#8ea7b8" };
  });
  return mmFinish(g);
}
/* class diagram: classes with their members; Mermaid's relation arrows */
function parseMermaidClass(lines) {
  var g = mmBlank("class", "TB"), members = {}, cur = null;
  var cls = function (id) { mmAddNode(g, id); members[id] = members[id] || []; return id; };
  var REL = /^([\w~<>,]+)\s*(?:"([^"]*)")?\s*(<\|--|--\|>|\*--|--\*|o--|--o|<--|-->|<\.\.|\.\.>|\.\.\|>|<\|\.\.|--|\.\.)\s*(?:"([^"]*)")?\s*([\w~<>,]+)\s*(?::\s*(.*))?$/;
  for (var li = 1; li < lines.length; li++) {
    var st = lines[li];
    if (/^direction\s+(TB|TD|BT|RL|LR)/i.test(st)) { g.dir = st.split(/\s+/)[1].toUpperCase().replace("TD", "TB"); continue; }
    if (cur) { if (st === "}") { cur = null; continue; } if (!/^<<.*>>$/.test(st)) members[cur].push(st); continue; }
    var cm = /^class\s+([\w~<>,]+)(?:\["([^"]+)"\])?\s*(\{)?\s*(\})?\s*$/.exec(st);
    if (cm) { cls(cm[1]); if (cm[2]) g.nodes[cm[1]].label = cm[2]; if (cm[3] && !cm[4]) cur = cm[1]; continue; }
    var rm = REL.exec(st);
    if (rm) {
      var a = cls(rm[1]), b = cls(rm[5]), op = rm[3], lab = [rm[2], rm[6] ? mmText(rm[6]) : "", rm[4]].filter(Boolean).join("  ");
      var dashed = op.indexOf("..") !== -1;
      /* arrows point at the parent / target, as Mermaid draws them */
      var toLeft = /^(<\|--|<--|<\.\.|<\|\.\.|\*--|o--)$/.test(op), plain = op === "--" || op === "..";
      g.edges.push(toLeft ? { a: b, b: a, label: lab, arrow: true, dashed: dashed } : { a: a, b: b, label: lab, arrow: !plain, dashed: dashed });
      continue;
    }
    var mm = /^([\w~<>,]+)\s*:\s*(.+)$/.exec(st);
    if (mm) { cls(mm[1]); members[mm[1]].push(mm[2].trim()); continue; }
    if (/^(note|link|click|callback|cssClass|style|classDef)\b/i.test(st)) continue;
    g.warnings.push("Skipped a line I could not read: " + st.slice(0, 60));
  }
  g.order.forEach(function (id) {
    var n = g.nodes[id], m = members[id] || [];
    var label = (n.label || id).replace(/~([^~]+)~/g, "<$1>");
    n.label = m.length ? label + "\n" + m.map(function (x) { return x.replace(/~([^~]+)~/g, "<$1>"); }).join("\n") : label;
    n.style = { fill: "transparent", stroke: "#8ea7b8" };
  });
  return mmFinish(g);
}
/* ---- Mermaid state diagrams (stateDiagram / stateDiagram-v2) ----
   States become boxes; "state "Label" as ID { ... }" becomes a group box (nested as deep as it
   goes); "A --> B : label" a labelled arrow; [*] a start dot (on the left of an arrow) or an end
   ring (on the right), one pair per group as Mermaid draws them; <<choice>> a small diamond;
   <<fork>> / <<join>> a bar; notes a pale card joined to what they describe by a dashed line;
   classDef / class / ::: colours as in flowcharts. */
function parseMermaidState(lines) {
  var g = { dir: "TB", nodes: {}, order: [], edges: [], groups: [], warnings: [], classes: {}, styled: {}, kind: "state" };
  var stack = [], notes = 0, seenEdge = {};
  var here = function () { return stack.length ? stack[stack.length - 1] : null; };
  function addClass(id, cls) { var n = g.nodes[id]; if (n) (n.classes = n.classes || []).push(cls); else (g.styled[id] = g.styled[id] || []).push(cls); }
  function node(id, label) {
    var n = g.nodes[id];
    if (!n) { n = g.nodes[id] = { id: id, label: id, shape: "fc-round", defined: true, group: null }; g.order.push(id); }
    if (here() && !n.group && !g.groups.some(function (x) { return x.id === id; })) { n.group = here(); here().members.push(id); }
    if (label !== undefined) n.label = label;
    return n;
  }
  /* the start dot and end ring of the group a [*] appears in */
  function pseudo(start) {
    var gr = here(), id = "\u00a7" + (start ? "start_" : "end_") + (gr ? gr.id : "root");
    var n = g.nodes[id];
    if (!n) {
      n = node(id, "");
      var d = start ? 20 : 26;
      n.fixed = true; n.w = d; n.h = d; n.foot = 0; n.lines = [""]; n.shape = "fc-circle"; n.pseudo = start ? "start" : "end";
      n.style = start ? { fill: "#e2e3e5", stroke: "#e2e3e5", width: 2 } : { fill: "transparent", stroke: "#e2e3e5", width: 5 };
    }
    return id;
  }
  /* a state reference: [*], an id, or an id with :::class */
  function ref(tok, isLeft) {
    tok = tok.trim();
    if (tok === "[*]") return pseudo(isLeft);
    var m = /^([\w.\u00c0-\uffff-]+)(?::::([\w-]+))?$/.exec(tok);
    if (!m) return null;
    node(m[1]);
    if (m[2]) addClass(m[1], m[2]);
    return m[1];
  }
  for (var li = 1; li < lines.length; li++) {
    var st = lines[li];
    var dm = /^direction\s+(TB|TD|BT|RL|LR)\b/i.exec(st);
    if (dm) { var dv = dm[1].toUpperCase() === "TD" ? "TB" : dm[1].toUpperCase(); if (here()) here().dir = dv; else g.dir = dv; continue; }
    if (mmStyleLine(g, st, addClass)) continue;          /* classDef / class / style, shared by both diagram types */
    if (/^(hide empty description|scale\s|accTitle|accDescr|title\s)/i.test(st)) continue;
    if (st === "--") continue;                         /* concurrent regions: drawn in the same box */
    /* notes: "note right of X : text" or "note left of X" ... "end note" */
    var nm = /^note\s+(left|right|top|bottom)?\s*of\s+([\w.-]+)\s*(?::\s*(.*))?$/i.exec(st);
    if (nm) {
      var text = nm[3];
      if (text === undefined) {
        var body = [];
        while (++li < lines.length && !/^end\s+note$/i.test(lines[li])) body.push(lines[li]);
        text = body.join("\n");
      }
      var nid = "\u00a7note_" + (++notes), nn = node(nid, mmText(text || ""));
      nn.shape = "fc-box"; nn.note = true;
      nn.style = { fill: "#fef9c3", stroke: "#d9a400", color: "#422006", dashed: true };
      g.edges.push({ a: nid, b: nm[2], label: "", arrow: false, dashed: true, note: true, side: (nm[1] || "right").toLowerCase() });
      continue;
    }
    /* a group: state "Label" as ID {   or   state ID { */
    var gm = /^state\s+(?:"([^"]*)"\s+as\s+([\w.-]+)|([\w.-]+))\s*\{\s*$/i.exec(st);
    if (gm) {
      var gid = gm[2] || gm[3], grp = { id: gid, title: mmText(gm[1] || gid), members: [], parent: here() };
      stack.push(grp); g.groups.push(grp);
      continue;
    }
    if (st === "}") { stack.pop(); continue; }
    /* state "Label" as ID   /   state ID <<choice|fork|join>>   /   state "Label" as ID : desc */
    var sm = /^state\s+(?:"([^"]*)"\s+as\s+([\w.-]+)|([\w.-]+))\s*(<<(choice|fork|join)>>)?\s*(?::\s*(.*))?$/i.exec(st);
    if (sm) {
      var sid = sm[2] || sm[3], sn = node(sid, sm[1] !== undefined ? mmText(sm[1]) : undefined);
      if (sm[7]) sn.label = (sm[1] !== undefined ? mmText(sm[1]) : sid) + "\n" + mmText(sm[7]);
      var kind = (sm[5] || "").toLowerCase();
      if (kind === "choice") { sn.shape = "fc-diamond"; sn.fixed = true; sn.w = 36; sn.h = 36; sn.foot = 0; sn.lines = [""]; sn.label = ""; }
      if (kind === "fork" || kind === "join") { sn.shape = "fc-box"; sn.fixed = true; sn.w = 96; sn.h = 10; sn.foot = 0; sn.lines = [""]; sn.label = ""; sn.style = { fill: "#e2e3e5", stroke: "#e2e3e5" }; }
      continue;
    }
    /* a transition: A --> B   or   A --> B : label */
    /* the target may carry :::class, so the label's colon is one that isn't part of ":::" */
    var tm = /^(.+?)\s*-->\s*([^\s:]+(?::::[\w-]+)?)\s*(?::\s*(.*))?$/.exec(st);
    if (tm) {
      var a = ref(tm[1], true), b = ref(tm[2], false);
      if (!a || !b) { g.warnings.push("Skipped a line I could not read: " + st.slice(0, 60)); continue; }
      var lab = tm[3] ? mmText(tm[3]) : "", key = a + ">" + b + ">" + lab;
      if (seenEdge[key]) continue;                     /* the same transition written twice: one arrow */
      seenEdge[key] = 1;
      g.edges.push({ a: a, b: b, label: lab, arrow: true, dashed: false });
      continue;
    }
    /* "ID : description" */
    var ds = /^([\w.-]+)\s*:\s*(.+)$/.exec(st);
    if (ds) { var dn = node(ds[1]); dn.label = ds[1] + "\n" + mmText(ds[2]); continue; }
    var lone = /^([\w.-]+)(?::::([\w-]+))?$/.exec(st);
    if (lone) { node(lone[1]); if (lone[2]) addClass(lone[1], lone[2]); continue; }
    g.warnings.push("Skipped a line I could not read: " + st.slice(0, 60));
  }
  /* a group referenced only by transitions or notes is a box, not a state */
  var gidSet = {}; g.groups.forEach(function (x) { gidSet[x.id] = 1; });
  g.order.forEach(function (id) { if (gidSet[id]) g.nodes[id].defined = false; });
  /* ids written in CamelCase read better as words: "AlertValidation" -> "Alert Validation" */
  g.order.forEach(function (id) {
    var n = g.nodes[id];
    /* "AlertValidation" -> "Alert Validation", "DNSReview" -> "DNS Review", "SOCLeadEscalation" -> "SOC Lead Escalation" */
    if (n.label === id && /^[A-Za-z][A-Za-z0-9]*$/.test(id) && /[a-z][A-Z]|[A-Z][A-Z][a-z]/.test(id))
      n.label = id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  });
  return mmFinish(g);
}
