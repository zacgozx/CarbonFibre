/* ============================================================
   Mermaid diagrams drawn in the note, under their code. Flowcharts, state, class, ER and mind maps
   go through the same layout as "convert to sketch" (mermaidToElements) and are drawn by the sketch
   preview; pie charts and sequence diagrams are drawn here. Click a diagram to open it full window
   (drag to pan, scroll to zoom, Fit, Esc closes). Gantt, timeline and git graphs say they can't be drawn.
   ============================================================ */
const MermaidView = {
  cache: new Map(),

  /* a picture of the diagram: { url } or { error } */
  picture(src) {
    const key = (isLight() ? "L" : "D") + src;
    if (MermaidView.cache.has(key)) return MermaidView.cache.get(key);
    let out;
    const head = (src.trim().split("\n")[0] || "").trim().toLowerCase();
    try {
      if (/^pie\b/.test(head)) out = { url: MermaidView.svgUrl(MermaidView.pie(src)) };
      else if (/^sequencediagram\b/.test(head)) out = { url: MermaidView.svgUrl(MermaidView.sequence(src)) };
      else if (/^(gantt|timeline|gitgraph|journey|quadrantchart|xychart|sankey|requirementdiagram|c4)/.test(head)) out = { error: "This kind of diagram (" + head.split(/\s/)[0] + ") can't be drawn here yet." };
      else {
        const res = mermaidToElements(src);
        const url = res.elements.length ? sketchPreviewUrl(JSON.stringify(skDoc(res.elements))) : "";
        out = url ? { url: url } : { error: "Nothing to draw yet." };
      }
    } catch (e) { out = { error: "Can't draw this: " + ((e && e.message) || e) }; }
    if (MermaidView.cache.size > 60) MermaidView.cache.clear();
    MermaidView.cache.set(key, out);
    return out;
  },
  svgUrl(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); },
  ink() { return isLight() ? { txt: "#1f2328", dim: "#59636e", line: "#8c959f", box: "#f6f8fa" } : { txt: "#e6e6e6", dim: "#a1a1aa", line: "#71717a", box: "#27272a" }; },
  x(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); },
  FONT: "font-family=\"system-ui, sans-serif\"",
  SLICES: ["#5b8def", "#f59e0b", "#10b981", "#ef4444", "#a855f7", "#14b8a6", "#f97316", "#64748b", "#ec4899", "#84cc16"],

  /* pie [showData] / title ... / "Label" : value */
  pie(src) {
    const ink = MermaidView.ink(), X = MermaidView.x;
    let title = "";
    const rows = [];
    src.split("\n").forEach(function (l, i) {
      const t = l.trim();
      if (!t || t.indexOf("%%") === 0) return;
      const tm = /^(?:pie\b.*?\btitle\s+|title\s+)(.+)$/i.exec(t);
      if (tm && (i === 0 || /^title\s/i.test(t))) { title = tm[1].trim(); return; }
      const m = /^"([^"]*)"\s*:\s*([\d.]+)\s*$/.exec(t);
      if (m && parseFloat(m[2]) > 0) rows.push({ label: m[1], v: parseFloat(m[2]) });
    });
    if (!rows.length) throw new Error("a pie chart needs lines like \"Label\" : 10");
    const total = rows.reduce(function (a, r) { return a + r.v; }, 0), R = 110, cx = 130, cy = (title ? 40 : 14) + R;
    let a0 = -Math.PI / 2, body = "";
    rows.forEach(function (r, i) {
      const a1 = a0 + r.v / total * Math.PI * 2, col = MermaidView.SLICES[i % MermaidView.SLICES.length];
      if (rows.length === 1) body += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + col + '"/>';
      else {
        const big = a1 - a0 > Math.PI ? 1 : 0, p0 = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)], p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
        body += '<path d="M' + cx + " " + cy + "L" + p0[0].toFixed(1) + " " + p0[1].toFixed(1) + "A" + R + " " + R + " 0 " + big + " 1 " + p1[0].toFixed(1) + " " + p1[1].toFixed(1) + 'Z" fill="' + col + '" stroke="' + ink.box + '" stroke-width="1.5"/>';
      }
      const am = (a0 + a1) / 2, pct = Math.round(r.v / total * 100);
      if (pct >= 6) body += '<text x="' + (cx + R * 0.62 * Math.cos(am)).toFixed(1) + '" y="' + (cy + R * 0.62 * Math.sin(am) + 4).toFixed(1) + '" text-anchor="middle" font-size="12" fill="#fff" ' + MermaidView.FONT + ">" + pct + "%</text>";
      body += '<rect x="270" y="' + (cy - rows.length * 11 + i * 22) + '" width="12" height="12" rx="2" fill="' + col + '"/>' +
        '<text x="290" y="' + (cy - rows.length * 11 + i * 22 + 11) + '" font-size="13" fill="' + ink.txt + '" ' + MermaidView.FONT + ">" + X(r.label) + " (" + r.v + ")</text>";
      a0 = a1;
    });
    const w = 290 + Math.max.apply(null, rows.map(function (r) { return (r.label.length + String(r.v).length + 3) * 7.5; })) + 16, h = cy + R + 16;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(w) + '" height="' + Math.max(h, 40 + rows.length * 22) + '">' +
      (title ? '<text x="' + cx + '" y="22" text-anchor="middle" font-size="15" font-weight="600" fill="' + ink.txt + '" ' + MermaidView.FONT + ">" + X(title) + "</text>" : "") + body + "</svg>";
  },

  /* sequenceDiagram: participant / actor (as alias), A->>B: text (->, -->, ->>, -->>, -x, --x, -), notes, autonumber.
     loop / alt / opt / par blocks draw as a labelled band. */
  sequence(src) {
    const ink = MermaidView.ink(), X = MermaidView.x, people = [], byId = {}, steps = [];
    let auto = false;
    const who = function (id, label) {
      id = id.trim();
      if (!byId[id]) { byId[id] = { id: id, label: label || id, i: people.length }; people.push(byId[id]); }
      else if (label) byId[id].label = label;
      return byId[id];
    };
    src.split("\n").slice(1).forEach(function (l) {
      const t = l.trim();
      let m;
      if (!t || t.indexOf("%%") === 0) return;
      if (/^autonumber\b/i.test(t)) { auto = true; return; }
      if ((m = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i.exec(t))) { who(m[2], m[3] ? m[3].trim() : null); return; }
      if ((m = /^note\s+(left of|right of|over)\s+([^:]+):\s*(.*)$/i.exec(t))) {
        const ids = m[2].split(",").map(function (s) { return who(s); });
        steps.push({ note: m[3], where: m[1].toLowerCase(), a: ids[0], b: ids[ids.length - 1] }); return;
      }
      if ((m = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i.exec(t))) { steps.push({ open: m[1].toLowerCase() + (m[2] ? " " + m[2] : "") }); return; }
      if ((m = /^(else|and)\b\s*(.*)$/i.exec(t))) { steps.push({ mid: m[1].toLowerCase() + (m[2] ? " " + m[2] : "") }); return; }
      if (/^end$/i.test(t)) { steps.push({ close: true }); return; }
      if ((m = /^([^-:]+?)\s*(-->>|->>|-->|->|--x|-x|--\)|-\))\s*([+-]?)([^:]+?)\s*:\s*(.*)$/.exec(t))) {
        steps.push({ a: who(m[1]), b: who(m[4]), dashed: m[2].indexOf("--") === 0, head: /x$/.test(m[2]) ? "x" : />>$/.test(m[2]) || /\)$/.test(m[2]) ? "arrow" : "open", text: m[5] });
      }
    });
    if (!people.length) throw new Error("a sequence diagram needs messages like Alice->>Bob: Hi");
    const GAP = 170, BOX_W = 130, BOX_H = 34, top = 10, colX = function (p) { return 20 + BOX_W / 2 + p.i * GAP; };
    let y = top + BOX_H + 30, body = "", n = 0;
    const open = [];
    steps.forEach(function (s) {
      if (s.open) { open.push({ label: s.open, y: y, mids: [] }); y += 26; return; }
      if (s.mid) { if (open.length) open[open.length - 1].mids.push({ label: s.mid, y: y }); y += 26; return; }
      if (s.close) {
        const b = open.pop(); if (!b) return;
        const x1 = 8, x2 = 32 + BOX_W + (people.length - 1) * GAP;
        body += '<rect x="' + x1 + '" y="' + (b.y - 14) + '" width="' + (x2 - x1) + '" height="' + (y - b.y + 6) + '" fill="none" stroke="' + ink.line + '" stroke-dasharray="4 3" rx="4"/>' +
          '<text x="' + (x1 + 6) + '" y="' + (b.y + 2) + '" font-size="11" font-weight="600" fill="' + ink.dim + '" ' + MermaidView.FONT + ">" + X(b.label) + "</text>";
        b.mids.forEach(function (m) { body += '<line x1="' + x1 + '" x2="' + x2 + '" y1="' + (m.y - 14) + '" y2="' + (m.y - 14) + '" stroke="' + ink.line + '" stroke-dasharray="4 3"/><text x="' + (x1 + 6) + '" y="' + (m.y + 2) + '" font-size="11" fill="' + ink.dim + '" ' + MermaidView.FONT + ">" + X(m.label) + "</text>"; });
        y += 14; return;
      }
      if (s.note) {
        const xa = colX(s.a), xb = colX(s.b), w = Math.max(110, s.note.length * 7 + 16);
        const x = s.where === "left of" ? xa - w - 10 : s.where === "right of" ? xa + 10 : Math.min(xa, xb) - (s.a === s.b ? w / 2 : 20);
        const ww = s.where === "over" && s.a !== s.b ? Math.abs(xb - xa) + 40 : w;
        body += '<rect x="' + x + '" y="' + (y - 14) + '" width="' + ww + '" height="26" rx="3" fill="' + (isLight() ? "#fff8c5" : "#3f3a1c") + '" stroke="' + ink.line + '"/>' +
          '<text x="' + (x + ww / 2) + '" y="' + (y + 3) + '" text-anchor="middle" font-size="12" fill="' + ink.txt + '" ' + MermaidView.FONT + ">" + X(s.note) + "</text>";
        y += 38; return;
      }
      n++;
      const xa = colX(s.a), xb = colX(s.b), label = (auto ? n + ". " : "") + s.text, dash = s.dashed ? ' stroke-dasharray="6 4"' : "";
      if (s.a === s.b) {
        body += '<path d="M' + xa + " " + y + "h40v22h-40" + '" fill="none" stroke="' + ink.txt + '" stroke-width="1.4"' + dash + "/>" +
          MermaidView.head(xa, y + 22, -1, s.head, ink.txt) +
          '<text x="' + (xa + 46) + '" y="' + (y + 14) + '" font-size="12" fill="' + ink.txt + '" ' + MermaidView.FONT + ">" + X(label) + "</text>";
        y += 44; return;
      }
      const dir = xb > xa ? 1 : -1;
      body += '<line x1="' + xa + '" y1="' + y + '" x2="' + (xb - dir * 2) + '" y2="' + y + '" stroke="' + ink.txt + '" stroke-width="1.4"' + dash + "/>" +
        MermaidView.head(xb, y, dir, s.head, ink.txt) +
        '<text x="' + ((xa + xb) / 2) + '" y="' + (y - 7) + '" text-anchor="middle" font-size="12" fill="' + ink.txt + '" ' + MermaidView.FONT + ">" + X(label) + "</text>";
      y += 40;
    });
    const bottom = y + 4, W = 40 + BOX_W + (people.length - 1) * GAP;
    let heads = "";
    people.forEach(function (p) {
      const x = colX(p);
      heads += '<line x1="' + x + '" y1="' + (top + BOX_H) + '" x2="' + x + '" y2="' + bottom + '" stroke="' + ink.line + '" stroke-dasharray="3 3"/>';
      [top, bottom].forEach(function (yy) {
        heads += '<rect x="' + (x - BOX_W / 2) + '" y="' + yy + '" width="' + BOX_W + '" height="' + BOX_H + '" rx="5" fill="' + ink.box + '" stroke="' + ink.line + '"/>' +
          '<text x="' + x + '" y="' + (yy + 21) + '" text-anchor="middle" font-size="13" fill="' + ink.txt + '" ' + MermaidView.FONT + ">" + X(p.label.length > 18 ? p.label.slice(0, 17) + "…" : p.label) + "</text>";
      });
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + (bottom + BOX_H + 10) + '">' + heads + body + "</svg>";
  },
  head(x, y, dir, kind, col) {
    if (kind === "x") return '<path d="M' + (x - dir * 10 - 4) + " " + (y - 5) + "l8 10m0 -10l-8 10" + '" stroke="' + col + '" stroke-width="1.6"/>';
    if (kind === "open") return "";
    return '<path d="M' + x + " " + y + "l" + (-dir * 9) + " -4.5v9z" + '" fill="' + col + '"/>';
  },

  /* the card under the code (04-find.js lineHtml, on the closing ``` line) */
  html(src, openIdx) {
    const pic = MermaidView.picture(src);
    if (pic.error) return '<span data-deco="1" class="mmd mmd-err">' + esc(pic.error) + "</span>";
    const sketchable = !/^\s*(pie|sequencediagram)\b/i.test(src);   /* those two have no sketch form */
    return '<span data-deco="1" class="mmd" data-mm-view="' + openIdx + '" title="Click to open it full window">' +
      '<img class="mmd-img" src="' + pic.url + '" alt="Mermaid diagram" draggable="false">' +
      '<span class="skp-bar"><span class="skp-btn" data-mm-view="' + openIdx + '">Expand</span>' +
      (sketchable ? '<span class="skp-btn" data-mermaid="' + openIdx + '" title="Add an editable sketch of this diagram below it">Edit as sketch</span>' : "") + "</span></span>";
  },

  /* full window: drag pans, the wheel zooms round the pointer, Fit, Esc or the backdrop closes */
  expand(src) {
    const pic = MermaidView.picture(src);
    if (!pic.url) return;
    const box = document.createElement("div");
    box.className = "mmd-full"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Diagram"); box.tabIndex = -1;
    box.innerHTML = '<div class="mmd-tools"><button type="button" data-a="fit">Fit</button><button type="button" data-a="in" aria-label="Zoom in">+</button><button type="button" data-a="out" aria-label="Zoom out">−</button><button type="button" data-a="x" aria-label="Close">' + ico("x") + "</button></div>" +
      '<div class="mmd-stage"><img alt="Mermaid diagram" draggable="false"></div>';
    document.body.appendChild(box);
    const img = box.querySelector("img"), stage = box.querySelector(".mmd-stage"), v = { x: 0, y: 0, k: 1 };
    const paint = function () { img.style.transform = "translate(" + v.x + "px," + v.y + "px) scale(" + v.k + ")"; };
    const fit = function () {
      const W = stage.clientWidth, H = stage.clientHeight, w = img.naturalWidth || 400, h = img.naturalHeight || 300;
      v.k = Math.min(4, Math.max(0.1, Math.min((W - 40) / w, (H - 40) / h))); v.x = (W - w * v.k) / 2; v.y = (H - h * v.k) / 2; paint();
    };
    const zoom = function (f, cx, cy) { const k = Math.max(0.1, Math.min(8, v.k * f)); v.x = cx - (cx - v.x) * k / v.k; v.y = cy - (cy - v.y) * k / v.k; v.k = k; paint(); };
    const close = function () { box.remove(); document.removeEventListener("keydown", key, true); };
    const key = function (e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
    img.onload = fit; img.src = pic.url;
    document.addEventListener("keydown", key, true);
    box.addEventListener("click", function (e) {
      const a = e.target.closest("[data-a]");
      if (a) { const r = stage.getBoundingClientRect(); ({ fit: fit, in: function () { zoom(1.25, r.width / 2, r.height / 2); }, out: function () { zoom(0.8, r.width / 2, r.height / 2); }, x: close })[a.dataset.a](); }
    });
    stage.addEventListener("wheel", function (e) { e.preventDefault(); const r = stage.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    stage.addEventListener("pointerdown", function (e) {
      const sx = e.clientX - v.x, sy = e.clientY - v.y;
      stage.setPointerCapture(e.pointerId);
      const mv = function (ev) { v.x = ev.clientX - sx; v.y = ev.clientY - sy; paint(); };
      const up = function () { stage.removeEventListener("pointermove", mv); stage.removeEventListener("pointerup", up); };
      stage.addEventListener("pointermove", mv); stage.addEventListener("pointerup", up);
    });
    box.querySelector('[data-a="x"]').focus();
  }
};
