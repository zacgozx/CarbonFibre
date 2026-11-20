/* ============================================================
   Vim keys in the editor (Live mode). Off until "Toggle vim mode" in the command palette; the choice
   is kept, and the mode shows in the status bar.
   Normal: h j k l w b e 0 ^ $ gg G { } f F t T ; , with counts; x X D C s S Y r J ~ p P u Ctrl+R .
   operators d c y > < with a motion, doubled (dd), or a text object (iw aw i" a" i' a' i( a( i[ a[
   i{ a{ i< a<); i a I A o O; v and V with the same motions and d c y > < ~; / ? n N search; :w :q
   :wq :<line> :s/a/b/g :%s/a/b/g. Not here: macros, marks, named registers; "." repeats the
   command but not text typed after it in insert mode.
   Edits go through the pane's own applyLines, so each is one undo step like any other edit.
   ============================================================ */
const Vim = {
  KEY: "carbonfibre-vim",
  on: false, mode: "normal", keys: "", reg: { text: "", lines: false }, last: null, rec: [],
  find: null, search: null, vis: null, replaying: false,

  toggle() {
    Vim.on = !Vim.on;
    storeSet(Vim.KEY, Vim.on ? "1" : "0");
    Vim.mode = "normal"; Vim.keys = "";
    Vim.show();
    pushToastLike(Vim.on ? "Vim mode on. Esc for normal mode, i to type." : "Vim mode off.");
  },
  show() {
    let el = document.getElementById("sbVim");
    if (!el) {
      el = document.createElement("span");
      el.id = "sbVim"; el.className = "sb-item sb-vim";
      const right = document.querySelector("#statusbar .sb-right");
      if (right) right.insertBefore(el, right.firstChild);
    }
    el.hidden = !Vim.on;
    el.textContent = Vim.on ? "-- " + { normal: "NORMAL", insert: "INSERT", visual: "VISUAL", vline: "VISUAL LINE" }[Vim.mode] + " --" + (Vim.keys ? "  " + Vim.keys : "") : "";
    document.body.classList.toggle("vim-normal", Vim.on && Vim.mode !== "insert");
  },

  /* the editor's keydown hands every key here first; true: it was a vim key, nothing else runs */
  key(p, ta, e) {
    if (!Vim.on || e.isComposing || e.keyCode === 229 || p.mode !== "live") return false;
    if (Vim.mode === "insert") {
      if (e.key !== "Escape" && !(e.ctrlKey && e.key === "[")) return false;
      e.preventDefault();
      Vim.mode = "normal";
      const c = Vim.pos(p);
      Vim.go(p, c.l, c.c - 1);
      Vim.show();
      return true;
    }
    if (e.metaKey || (e.ctrlKey && e.key !== "r" && e.key !== "[") || e.altKey) return false;   /* the app's own shortcuts */
    if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return true;
    const k = e.ctrlKey ? "C-" + e.key : e.key === "Escape" ? "Esc" : e.key === "Enter" ? "Enter" : e.key === "Backspace" ? "BS" : e.key.length === 1 ? e.key : null;
    e.preventDefault(); e.stopPropagation();
    if (k) Vim.feed(p, k);
    return true;
  },

  /* ---- positions ---- */
  pos(p) {
    if (Vim.vis) return { l: Vim.vis.f.l, c: Vim.vis.f.c };
    return { l: p.activeLine, c: p.ta ? p.ta.selectionStart : 0 };
  },
  clampC(p, l, c, ins) { const n = p.lines[l].length; return Math.max(0, Math.min(c, ins ? n : Math.max(0, n - 1))); },
  go(p, l, c, ins) {
    l = Math.max(0, Math.min(p.lines.length - 1, l));
    c = Vim.clampC(p, l, c, ins);
    if (Vim.vis) { Vim.vis.f = { l: l, c: c }; Vim.paintVis(p); p.keepVisible(l); return; }
    if (l !== p.activeLine) p.setActive(l, c); else if (p.ta) p.ta.setSelectionRange(c, c);
    p.keepVisible(l);
  },
  at(p, l, c) { const s = p.lines[l]; return c < s.length ? s.charAt(c) : "\n"; },
  cls(ch) { return /\s/.test(ch) ? 0 : /\w/.test(ch) ? 1 : 2; },
  fwd(p, q) { if (q.c < p.lines[q.l].length) return { l: q.l, c: q.c + 1 }; return q.l < p.lines.length - 1 ? { l: q.l + 1, c: 0 } : null; },
  back(p, q) { if (q.c > 0) return { l: q.l, c: q.c - 1 }; return q.l > 0 ? { l: q.l - 1, c: p.lines[q.l - 1].length } : null; },
  firstNonBlank(p, l) { const m = /^\s*/.exec(p.lines[l]); return Math.min(m[0].length, Math.max(0, p.lines[l].length - 1)); },

  /* ---- motions: where `count` of `m` goes from q; { l, c, lw: whole lines, inc: takes the last char } ---- */
  motion(p, m, count, q, forOp) {
    let r = { l: q.l, c: q.c }, nx;
    const n = p.lines.length;
    const rep = function (fn) { for (let i = 0; i < count; i++) { const t = fn(r); if (!t) break; r = t; } };
    switch (m) {
      case "h": case "BS": return { l: q.l, c: Math.max(0, q.c - count) };
      case "l": case " ": return { l: q.l, c: Math.min(q.c + count, forOp ? p.lines[q.l].length : Math.max(0, p.lines[q.l].length - 1)) };
      case "j": case "Enter": case "+": return { l: Math.min(n - 1, q.l + count), c: m === "j" ? Vim.goal(p, q) : Vim.firstNonBlank(p, Math.min(n - 1, q.l + count)), lw: true };
      case "k": case "-": return { l: Math.max(0, q.l - count), c: m === "k" ? Vim.goal(p, q) : Vim.firstNonBlank(p, Math.max(0, q.l - count)), lw: true };
      case "0": return { l: q.l, c: 0 };
      case "^": return { l: q.l, c: Vim.firstNonBlank(p, q.l) };
      case "$": { const L = Math.min(n - 1, q.l + count - 1); return { l: L, c: Math.max(0, p.lines[L].length - 1), inc: true, eol: true }; }
      case "gg": return { l: Math.min(n - 1, (Vim.counted ? count : 1) - 1), c: 0, lw: true };
      case "G": return { l: Vim.counted ? Math.min(n - 1, count - 1) : n - 1, c: 0, lw: true };
      case "w":
        rep(function (s) {
          const k = Vim.cls(Vim.at(p, s.l, s.c)), startL = s.l;
          let t = s;
          if (k !== 0) while (t && t.l === startL && Vim.cls(Vim.at(p, t.l, t.c)) === k && Vim.at(p, t.l, t.c) !== "\n") t = Vim.fwd(p, t);
          while (t && /\s/.test(Vim.at(p, t.l, t.c)) && !(t.l !== s.l && p.lines[t.l] === "")) {
            if (forOp && count === 1 && t.l !== s.l) return { l: s.l, c: p.lines[s.l].length };   /* cw / dw stop at the line's end */
            nx = Vim.fwd(p, t); if (!nx) return { l: t.l, c: p.lines[t.l].length };
            t = nx;
          }
          return t;
        });
        return r;
      case "e":
        rep(function (s) {
          let t = Vim.fwd(p, s);
          while (t && /\s/.test(Vim.at(p, t.l, t.c))) t = Vim.fwd(p, t);
          if (!t) return null;
          const k = Vim.cls(Vim.at(p, t.l, t.c));
          while ((nx = Vim.fwd(p, t)) && nx.l === t.l && Vim.cls(Vim.at(p, nx.l, nx.c)) === k && Vim.at(p, nx.l, nx.c) !== "\n") t = nx;
          return t;
        });
        r.inc = true;
        return r;
      case "b":
        rep(function (s) {
          let t = Vim.back(p, s);
          while (t && /\s/.test(Vim.at(p, t.l, t.c)) && !(p.lines[t.l] === "" && t.l !== s.l)) t = Vim.back(p, t);
          if (!t) return { l: 0, c: 0 };
          const k = Vim.cls(Vim.at(p, t.l, t.c));
          while ((nx = Vim.back(p, t)) && nx.l === t.l && Vim.cls(Vim.at(p, nx.l, nx.c)) === k) t = nx;
          return t;
        });
        return r;
      case "}": case "{": {
        let L = q.l;
        for (let i = 0; i < count; i++) {
          const d = m === "}" ? 1 : -1;
          L += d;
          while (L > 0 && L < n - 1 && p.lines[L].trim() !== "") L += d;
          L = Math.max(0, Math.min(n - 1, L));
        }
        return { l: L, c: 0 };
      }
      default: return null;
    }
  },
  goal(p, q) { if (Vim.goalCol == null) Vim.goalCol = q.c; return Vim.goalCol; },
  findChar(p, how, ch, count, q) {
    const s = p.lines[q.l];
    let c = q.c;
    for (let i = 0; i < count; i++) {
      const f = how === "f" || how === "t" ? s.indexOf(ch, c + 1 + (how === "t" && i === 0 ? 1 : 0)) : s.lastIndexOf(ch, c - 1 - (how === "T" && i === 0 ? 1 : 0));
      if (f < 0) return null;
      c = f;
    }
    if (how === "t") c--; else if (how === "T") c++;
    return { l: q.l, c: c, inc: how === "f" || how === "t" };
  },
  /* iw aw i" a( ...: the range on this line, or null */
  object(p, kind, ch, q) {
    const s = p.lines[q.l], c = q.c;
    if (ch === "w" || ch === "W") {
      if (!s.length) return null;
      const k = Vim.cls(s.charAt(c) || " ");
      let a = c, b = c;
      while (a > 0 && Vim.cls(s.charAt(a - 1)) === k) a--;
      while (b < s.length - 1 && Vim.cls(s.charAt(b + 1)) === k) b++;
      if (kind === "a") { let b2 = b; while (b2 < s.length - 1 && /\s/.test(s.charAt(b2 + 1))) b2++; if (b2 > b) b = b2; else while (a > 0 && /\s/.test(s.charAt(a - 1))) a--; }
      return { a: { l: q.l, c: a }, b: { l: q.l, c: b + 1 } };
    }
    const pairs = { "(": "()", ")": "()", b: "()", "[": "[]", "]": "[]", "{": "{}", "}": "{}", B: "{}", "<": "<>", ">": "<>", '"': '""', "'": "''", "`": "``" };
    const pr = pairs[ch];
    if (!pr) return null;
    let open = -1, close = -1;
    if (pr[0] === pr[1]) {
      const marks = [];
      for (let i = 0; i < s.length; i++) if (s.charAt(i) === pr[0] && s.charAt(i - 1) !== "\\") marks.push(i);
      for (let i = 0; i + 1 < marks.length; i += 2) if (c >= marks[i] && c <= marks[i + 1]) { open = marks[i]; close = marks[i + 1]; }
      if (open < 0) { const nx = marks.filter(function (m) { return m > c; }); if (nx.length >= 2) { open = nx[0]; close = nx[1]; } }
    } else {
      let d = 0;
      for (let i = c; i >= 0; i--) { const x = s.charAt(i); if (x === pr[1] && i !== c) d++; else if (x === pr[0]) { if (!d) { open = i; break; } d--; } }
      d = 0;
      if (open >= 0) for (let i = open + 1; i < s.length; i++) { const x = s.charAt(i); if (x === pr[0]) d++; else if (x === pr[1]) { if (!d) { close = i; break; } d--; } }
    }
    if (open < 0 || close < 0) return null;
    return kind === "i" ? { a: { l: q.l, c: open + 1 }, b: { l: q.l, c: close } } : { a: { l: q.l, c: open }, b: { l: q.l, c: close + 1 } };
  },

  /* ---- edits ---- */
  textOf(p, a, b) {   /* chars from a up to (not including) b */
    if (a.l === b.l) return p.lines[a.l].slice(a.c, b.c);
    return [p.lines[a.l].slice(a.c)].concat(p.lines.slice(a.l + 1, b.l), [p.lines[b.l].slice(0, b.c)]).join("\n");
  },
  /* op over chars a..b (b not included) or whole lines a.l..b.l */
  apply(p, op, a, b, lw) {
    if (lw) {
      const from = Math.min(a.l, b.l), to = Math.max(a.l, b.l), block = p.lines.slice(from, to + 1);
      if (op === "y") { Vim.reg = { text: block.join("\n"), lines: true }; Vim.go(p, from, Vim.pos(p).c); return; }
      if (op === "d") { Vim.reg = { text: block.join("\n"), lines: true }; p.applyLines(from, to, [], { line: from, col: 0 }); Vim.go(p, Math.min(from, p.lines.length - 1), Vim.firstNonBlank(p, Math.min(from, p.lines.length - 1))); return; }
      if (op === "c") { Vim.reg = { text: block.join("\n"), lines: true }; const ind = /^\s*/.exec(block[0])[0]; p.applyLines(from, to, [ind], { line: from, col: ind.length }); Vim.insert(p, from, ind.length); return; }
      if (op === ">" || op === "<") {
        const out = block.map(function (s) { return op === ">" ? (s ? "  " + s : s) : s.replace(/^( {1,2}|\t)/, ""); });
        p.applyLines(from, to, out, { line: from, col: 0 }); Vim.go(p, from, Vim.firstNonBlank(p, from)); return;
      }
      if (op === "~" || op === "u" || op === "U") { const out = block.map(function (s) { return Vim.recase(op, s); }); p.applyLines(from, to, out, { line: from, col: 0 }); return; }
      return;
    }
    if (b.l < a.l || (b.l === a.l && b.c < a.c)) { const t = a; a = b; b = t; }
    const text = Vim.textOf(p, a, b);
    if (op === "y") { Vim.reg = { text: text, lines: false }; Vim.go(p, a.l, a.c); return; }
    if (op === "~" || op === "u" || op === "U") {
      const fresh = (p.lines[a.l].slice(0, a.c) + Vim.recase(op, text) + p.lines[b.l].slice(b.c)).split("\n");
      p.applyLines(a.l, b.l, fresh, { line: a.l, col: a.c }); Vim.go(p, a.l, a.c); return;
    }
    if (op === ">" || op === "<") { Vim.apply(p, op, a, b, true); return; }
    Vim.reg = { text: text, lines: false };
    p.applyLines(a.l, b.l, [p.lines[a.l].slice(0, a.c) + p.lines[b.l].slice(b.c)], { line: a.l, col: a.c });
    if (op === "c") Vim.insert(p, a.l, a.c); else Vim.go(p, a.l, a.c);
  },
  recase(op, s) { return op === "u" ? s.toLowerCase() : op === "U" ? s.toUpperCase() : s.replace(/./g, function (ch) { const u = ch.toUpperCase(); return ch === u ? ch.toLowerCase() : u; }); },
  insert(p, l, c) {
    Vim.mode = "insert";
    Vim.vis = null;
    p.clearSelectAll();
    if (l !== p.activeLine) p.setActive(l, c); else if (p.ta) p.ta.setSelectionRange(c, c);
    Vim.show();
  },
  put(p, before, count) {
    const r = Vim.reg, q = Vim.pos(p);
    if (!r.text && !r.lines) return;
    if (r.lines) {
      const block = []; for (let i = 0; i < count; i++) Array.prototype.push.apply(block, r.text.split("\n"));
      const at = before ? q.l : q.l + 1;
      p.applyLines(at, at - 1, block, { line: at, col: 0 });
      Vim.go(p, at, Vim.firstNonBlank(p, at));
      return;
    }
    const s = p.lines[q.l], c = before || !s.length ? q.c : q.c + 1;
    const ins = new Array(count + 1).join(r.text), fresh = (s.slice(0, c) + ins + s.slice(c)).split("\n");
    p.applyLines(q.l, q.l, fresh, { line: q.l, col: c });
    const endL = q.l + fresh.length - 1;
    Vim.go(p, endL, fresh.length > 1 ? fresh[fresh.length - 1].length - s.slice(c).length - 1 : c + ins.length - 1);
  },

  /* ---- visual ---- */
  paintVis(p) {
    const v = Vim.vis;
    if (Vim.mode === "vline") { p.setRange(v.a.l, v.f.l); return; }
    const fwd = v.f.l > v.a.l || (v.f.l === v.a.l && v.f.c >= v.a.c);
    p.setPartial(v.a.l, fwd ? v.a.c : v.a.c + 1, v.f.l, fwd ? v.f.c + 1 : v.f.c);
  },
  visRange() {
    const v = Vim.vis, fwd = v.f.l > v.a.l || (v.f.l === v.a.l && v.f.c >= v.a.c);
    const a = fwd ? v.a : v.f, b = fwd ? v.f : v.a;
    return { a: a, b: { l: b.l, c: b.c + 1 } };
  },
  endVis(p, keepAt) {
    const f = keepAt || (Vim.vis && Vim.vis.f);
    Vim.vis = null; Vim.mode = "normal";
    p.clearSelectAll();
    if (f) Vim.go(p, f.l, f.c);
  },

  /* ---- the command language ---- */
  feed(p, k) {
    if (!p.note() || p.activeLine === null || p.activeLine === undefined) return;
    if (!Vim.replaying) Vim.rec.push(k);
    Vim.keys += k.length > 1 ? "<" + k + ">" : k;
    const done = Vim.run(p, Vim.keys);
    if (done) {
      if (done === "change" && !Vim.replaying) Vim.last = Vim.rec.slice();
      Vim.keys = ""; Vim.rec = [];
      if (done !== "motion-keepgoal") Vim.goalCol = Vim.goalKeep ? Vim.goalCol : null;
      Vim.goalKeep = false;
    }
    Vim.show();
  },
  /* the keys so far: false while more are needed, else what kind of command it was */
  run(p, keys) {
    if (keys === "<Esc>") { if (Vim.vis) Vim.endVis(p); return "motion"; }
    const m = /^(\d*)(.*)$/.exec(keys), countStr = m[1] === "0" ? "" : m[1], rest = m[1] === "0" ? "0" + m[2] : m[2];
    if (!rest) return false;
    const count = Math.max(1, parseInt(countStr || "1", 10));
    Vim.counted = !!countStr;
    const q = Vim.pos(p), visual = !!Vim.vis;
    const motionOf = function (s, forOp) {
      if (/^[fFtT]$/.test(s)) return false;
      const fm = /^([fFtT])(.)$/.exec(s);
      if (fm) { Vim.find = { how: fm[1], ch: fm[2] }; return Vim.findChar(p, fm[1], fm[2], count, q) || "none"; }
      if (s === ";" || s === ",") {
        if (!Vim.find) return "none";
        const flip = { f: "F", F: "f", t: "T", T: "t" }, how = s === ";" ? Vim.find.how : flip[Vim.find.how];
        return Vim.findChar(p, how, Vim.find.ch, count, q) || "none";
      }
      if (s === "g") return false;
      const r = Vim.motion(p, s, count, q, forOp);
      return r || null;
    };

    if (visual) {
      const mv = motionOf(rest, false);
      if (mv === false) return false;
      if (mv && mv !== "none") { if (mv.lw && (rest === "j" || rest === "k")) Vim.goalKeep = true; Vim.go(p, mv.l, mv.c); return "motion"; }
      if (mv === "none") return "motion";
      const ops = { d: "d", x: "d", c: "c", s: "c", y: "y", ">": ">", "<": "<", "~": "~", u: "u", U: "U" };
      if (ops[rest]) {
        const op = ops[rest], lw = Vim.mode === "vline", r = Vim.visRange(), at = r.a;
        Vim.vis = null; Vim.mode = "normal"; p.clearSelectAll();
        if (op === "y" && !lw) { Vim.reg = { text: Vim.textOf(p, r.a, r.b), lines: false }; Vim.go(p, at.l, at.c); return "motion"; }
        Vim.apply(p, op, r.a, r.b, lw);
        return op === "y" ? "motion" : "change";
      }
      if (rest === "v" || rest === "V") {
        if ((rest === "v") === (Vim.mode === "visual")) Vim.endVis(p);
        else { Vim.mode = rest === "v" ? "visual" : "vline"; p.clearSelectAll(); Vim.paintVis(p); }
        return "motion";
      }
      if (rest === "o") { const t = Vim.vis.a; Vim.vis.a = Vim.vis.f; Vim.vis.f = t; Vim.paintVis(p); return "motion"; }
      if (rest === "i" || rest === "a") return false;
      const ob = /^([ia])(.)$/.exec(rest);
      if (ob) { const r = Vim.object(p, ob[1], ob[2], q); if (r) { Vim.vis.a = r.a; Vim.vis.f = { l: r.b.l, c: r.b.c - 1 }; Vim.paintVis(p); } return "motion"; }
      return "motion";
    }

    /* operators: d c y > < ~(g~) with a motion, a text object, or doubled */
    const om = /^(d|c|y|>|<|g~|gu|gU)(.*)$/.exec(rest);
    if (om) {
      const op = om[1] === "g~" ? "~" : om[1] === "gu" ? "u" : om[1] === "gU" ? "U" : om[1], tail = om[2];
      if (!tail) return false;
      const tm = /^(\d*)(.*)$/.exec(tail), mult = Math.max(1, parseInt(tm[1] || "1", 10)), mrest = tm[2];
      if (!mrest) return false;
      const total = count * mult;
      if (mult > 1) Vim.counted = true;
      if (mrest === om[1].slice(-1) || (om[1].length === 2 && mrest === om[1])) {     /* dd cc yy >> << g~~ */
        Vim.apply(p, op, q, { l: Math.min(p.lines.length - 1, q.l + total - 1), c: 0 }, true);
        return op === "y" ? "motion" : "change";
      }
      if (mrest === "i" || mrest === "a") return false;
      const ob = /^([ia])(.)$/.exec(mrest);
      if (ob) { const r = Vim.object(p, ob[1], ob[2], q); if (r) Vim.apply(p, op, r.a, r.b, false); return op === "y" ? "motion" : "change"; }
      const mv = motionOf(op === "c" && mrest === "w" ? "e" : mrest, true);   /* cw changes to the word's end, as in vim */
      if (mv === false) return false;
      if (!mv || mv === "none") return "motion";
      if (mv.lw) Vim.apply(p, op, q, mv, true);
      else Vim.apply(p, op, q, mv.inc ? { l: mv.l, c: mv.c + 1 } : mv, false);
      return op === "y" ? "motion" : "change";
    }

    switch (rest) {
      case "i": Vim.insert(p, q.l, q.c); return "change";
      case "a": Vim.insert(p, q.l, Math.min(q.c + 1, p.lines[q.l].length)); return "change";
      case "I": Vim.insert(p, q.l, /^\s*/.exec(p.lines[q.l])[0].length); return "change";
      case "A": Vim.insert(p, q.l, p.lines[q.l].length); return "change";
      case "o": case "O": {
        const ind = /^\s*/.exec(p.lines[q.l])[0], at = rest === "o" ? q.l + 1 : q.l;
        p.applyLines(at, at - 1, [ind], { line: at, col: ind.length });
        Vim.insert(p, at, ind.length);
        return "change";
      }
      case "x": if (p.lines[q.l].length) Vim.apply(p, "d", q, { l: q.l, c: Math.min(p.lines[q.l].length, q.c + count) }, false); return "change";
      case "X": if (q.c) Vim.apply(p, "d", { l: q.l, c: Math.max(0, q.c - count) }, q, false); return "change";
      case "D": Vim.apply(p, "d", q, { l: q.l, c: p.lines[q.l].length }, false); return "change";
      case "C": Vim.apply(p, "c", q, { l: q.l, c: p.lines[q.l].length }, false); return "change";
      case "s": Vim.apply(p, "c", q, { l: q.l, c: Math.min(p.lines[q.l].length, q.c + count) }, false); return "change";
      case "S": Vim.apply(p, "c", q, { l: Math.min(p.lines.length - 1, q.l + count - 1), c: 0 }, true); return "change";
      case "Y": Vim.apply(p, "y", q, { l: Math.min(p.lines.length - 1, q.l + count - 1), c: 0 }, true); return "motion";
      case "p": Vim.put(p, false, count); return "change";
      case "P": Vim.put(p, true, count); return "change";
      case "J": {
        if (q.l >= p.lines.length - 1) return "motion";
        const to = Math.min(p.lines.length - 1, q.l + Math.max(1, count - 1));
        let s = p.lines[q.l], col = s.length;
        for (let i = q.l + 1; i <= to; i++) { const t = p.lines[i].replace(/^\s+/, ""); col = s.length; s = s.replace(/\s+$/, "") + (t ? " " + t : ""); }
        p.applyLines(q.l, to, [s], { line: q.l, col: col });
        return "change";
      }
      case "~": {
        const s = p.lines[q.l], e = Math.min(s.length, q.c + count);
        if (!s.length) return "motion";
        p.applyLines(q.l, q.l, [s.slice(0, q.c) + Vim.recase("~", s.slice(q.c, e)) + s.slice(e)], { line: q.l, col: Math.min(e, s.length - 1) });
        return "change";
      }
      case "u": for (let i = 0; i < count; i++) histUndo(p); return "motion";
      case "<C-r>": for (let i = 0; i < count; i++) histRedo(p); return "motion";
      case ".": {
        if (!Vim.last) return "motion";
        const seq = Vim.last.slice();
        Vim.keys = ""; Vim.replaying = true;
        try { seq.forEach(function (key) { Vim.feed(p, key); }); } finally { Vim.replaying = false; }
        if (Vim.mode === "insert") { Vim.mode = "normal"; Vim.show(); }
        return "motion";
      }
      case "v": case "V":
        Vim.mode = rest === "v" ? "visual" : "vline";
        Vim.vis = { a: { l: q.l, c: q.c }, f: { l: q.l, c: q.c } };
        Vim.paintVis(p);
        return "motion";
      case "n": case "N": Vim.next(p, rest === "N"); return "motion";
      case "/": case "?":
        Dialogs.prompt(rest === "/" ? "Search forward:" : "Search backward:", Vim.search ? Vim.search.q : "").then(function (s) {
          if (!s) return;
          Vim.search = { q: s, back: rest === "?" };
          Vim.next(p, false);
        });
        return "motion";
      case ":": Dialogs.prompt(":", "").then(function (c) { if (c) Vim.ex(p, c.trim()); }); return "motion";
      case "r": return false;
      case "Esc": return "motion";
    }
    if (/^r.$/.test(rest)) {
      const s = p.lines[q.l], e = q.c + count;
      if (e > s.length) return "motion";
      p.applyLines(q.l, q.l, [s.slice(0, q.c) + new Array(count + 1).join(rest.charAt(1)) + s.slice(e)], { line: q.l, col: e - 1 });
      return "change";
    }
    if (rest === "g") return false;
    const mv = motionOf(rest, false);
    if (mv === false) return false;
    if (mv && mv !== "none") {
      if (rest === "j" || rest === "k") Vim.goalKeep = true;
      Vim.go(p, mv.l, mv.c);
      return "motion";
    }
    return "motion";                      /* not a command: dropped, as vim does */
  },
  /* n / N: the next match of the last search, wrapping round */
  next(p, reverse) {
    if (!Vim.search) return;
    const q = Vim.pos(p), back = Vim.search.back !== reverse, n = p.lines.length;
    const ci = Vim.search.q === Vim.search.q.toLowerCase(), needle = ci ? Vim.search.q.toLowerCase() : Vim.search.q;
    for (let i = 0; i <= n; i++) {
      const L = back ? (q.l - i + n * 2) % n : (q.l + i) % n, hay = ci ? p.lines[L].toLowerCase() : p.lines[L];
      let c;
      if (back) c = hay.lastIndexOf(needle, i === 0 ? q.c - 1 : hay.length); else c = hay.indexOf(needle, i === 0 ? q.c + 1 : 0);
      if (i === 0 && back && q.c === 0) c = -1;
      if (c >= 0) { Vim.go(p, L, c); return; }
    }
    pushToastLike("Not found: " + Vim.search.q);
  },
  /* : commands */
  ex(p, c) {
    if (/^\d+$/.test(c)) { Vim.go(p, parseInt(c, 10) - 1, 0); return; }
    if (c === "w" || c === "write") { flushPersist(); pushToastLike("Saved."); return; }
    if (c === "q" || c === "q!" || c === "wq" || c === "x") { if (c !== "q!") flushPersist(); if (p.noteId != null) p.closeTab(p.noteId); return; }
    if (c === "noh" || c === "nohlsearch") return;
    const sm = /^(%?)s(.)(.*?)\2(.*?)(?:\2([gi]*))?$/.exec(c);
    if (sm) {
      const flags = sm[5] || "", from = sm[1] ? 0 : Vim.pos(p).l, to = sm[1] ? p.lines.length - 1 : from;
      let re;
      try { re = new RegExp(sm[3], (flags.indexOf("g") >= 0 ? "g" : "") + (flags.indexOf("i") >= 0 ? "i" : "")); } catch (e) { pushToastLike("Not a valid pattern: " + sm[3]); return; }
      let hits = 0;
      const out = p.lines.slice(from, to + 1).map(function (s) { return s.replace(re, function () { hits++; return sm[4].replace(/\\\//g, "/"); }); });
      if (!hits) { pushToastLike("Not found: " + sm[3]); return; }
      p.applyLines(from, to, out, { line: Vim.pos(p).l, col: 0 });
      pushToastLike(hits + (hits === 1 ? " replacement" : " replacements"));
      return;
    }
    pushToastLike("Not a command here: :" + c);
  },

  init() {
    try { Vim.on = localStorage.getItem(Vim.KEY) === "1"; } catch (e) { Vim.on = false; }
    Vim.show();
  }
};
Vim.init();
