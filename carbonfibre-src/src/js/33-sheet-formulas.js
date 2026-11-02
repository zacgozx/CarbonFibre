/* ============================================================
   Sheet formulas. A cell whose text starts with "=" is calculated; "SUM=(10+12)" is read as
   "=SUM(10+12)" when the name is a known function. References (A1, $B$2), ranges (A1:C3),
   + - * / ^ & % and comparisons, and the functions in SH_FN. Errors are shown in the cell
   (#DIV/0!, #REF!, #NAME?, #VALUE!, #N/A, #CYCLE!). Values are worked out on demand and kept
   until the sheet changes.
   ============================================================ */
function ShErr(code) { this.err = code; }
function shErr(code) { return new ShErr(code); }
function shIsErr(v) { return v instanceof ShErr; }
function shColIndex(letters) { var n = 0; letters = letters.toUpperCase(); for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64); return n - 1; }
function shRef(s) { var m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(s); return m ? { c: shColIndex(m[1]), r: parseInt(m[2], 10) - 1 } : null; }
var SH_NUM_RE = /^\s*[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?\s*$/;
function shLiteral(s) {
  if (s === "") return "";
  if (SH_NUM_RE.test(s)) return parseFloat(s);
  return s;
}
function shNum(v) {
  if (shIsErr(v)) throw v;
  if (v === "" || v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (SH_NUM_RE.test(v)) return parseFloat(v);
  throw shErr("#VALUE!");
}
function shStr(v) { if (shIsErr(v)) throw v; return typeof v === "number" ? shFmt(v) : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v); }
function shBool(v) { if (shIsErr(v)) throw v; if (typeof v === "boolean") return v; if (typeof v === "number") return v !== 0; if (/^true$/i.test(v)) return true; if (/^false$/i.test(v) || v === "") return false; throw shErr("#VALUE!"); }
function shFmt(n) {                                   /* 0.1+0.2 shows 0.3, not 0.30000000000000004 */
  if (!isFinite(n)) return "#NUM!";
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toPrecision(12)));
}
/* "*.org", ">10", "<>x", "=x": criteria in COUNTIF/SUMIF */
function shCriteria(crit) {
  if (typeof crit === "number") return function (v) { return typeof v === "number" ? v === crit : v !== "" && SH_NUM_RE.test(v) && parseFloat(v) === crit; };
  var m = /^(<=|>=|<>|=|<|>)?(.*)$/.exec(String(crit)), op = m[1] || "=", rhs = m[2];
  var rn = SH_NUM_RE.test(rhs) ? parseFloat(rhs) : null;
  var re = op === "=" || op === "<>" ? new RegExp("^" + rhs.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i") : null;
  return function (v) {
    var vn = typeof v === "number" ? v : v !== "" && SH_NUM_RE.test(v) ? parseFloat(v) : null;
    if (rn !== null && vn !== null && op !== "=" && op !== "<>") return op === "<" ? vn < rn : op === ">" ? vn > rn : op === "<=" ? vn <= rn : vn >= rn;
    if (op === "=" || op === "<>") { var hit = rn !== null && vn !== null ? vn === rn : re.test(shStr(v)); return op === "=" ? hit : !hit; }
    return false;
  };
}
function shFlat(args) { var out = []; args.forEach(function (a) { if (a && a.range) out = out.concat(a.range); else out.push(a); }); return out; }
function shNums(args) {                               /* numbers in ranges; plain arguments must be numbers */
  var out = [];
  args.forEach(function (a) {
    if (a && a.range) a.range.forEach(function (v) { if (shIsErr(v)) throw v; if (typeof v === "number") out.push(v); });
    else out.push(shNum(a));
  });
  return out;
}
var SH_FN = {
  SUM: function (a) { return shNums(a).reduce(function (s, x) { return s + x; }, 0); },
  AVERAGE: function (a) { var n = shNums(a); if (!n.length) throw shErr("#DIV/0!"); return n.reduce(function (s, x) { return s + x; }, 0) / n.length; },
  MIN: function (a) { var n = shNums(a); return n.length ? Math.min.apply(null, n) : 0; },
  MAX: function (a) { var n = shNums(a); return n.length ? Math.max.apply(null, n) : 0; },
  COUNT: function (a) { return shFlat(a).filter(function (v) { return typeof v === "number"; }).length; },
  COUNTA: function (a) { return shFlat(a).filter(function (v) { return v !== ""; }).length; },
  ROUND: function (a) { var d = a.length > 1 ? shNum(a[1]) : 0, f = Math.pow(10, d); return Math.round(shNum(a[0]) * f) / f; },
  ABS: function (a) { return Math.abs(shNum(a[0])); },
  SQRT: function (a) { var x = shNum(a[0]); if (x < 0) throw shErr("#NUM!"); return Math.sqrt(x); },
  POWER: function (a) { return Math.pow(shNum(a[0]), shNum(a[1])); },
  INT: function (a) { return Math.floor(shNum(a[0])); },
  MOD: function (a) { var d = shNum(a[1]); if (!d) throw shErr("#DIV/0!"); var x = shNum(a[0]); return x - d * Math.floor(x / d); },
  AND: function (a) { return shFlat(a).every(shBool); },
  OR: function (a) { return shFlat(a).some(shBool); },
  NOT: function (a) { return !shBool(a[0]); },
  LEN: function (a) { return shStr(a[0]).length; },
  UPPER: function (a) { return shStr(a[0]).toUpperCase(); },
  LOWER: function (a) { return shStr(a[0]).toLowerCase(); },
  TRIM: function (a) { return shStr(a[0]).trim().replace(/\s+/g, " "); },
  LEFT: function (a) { return shStr(a[0]).slice(0, a.length > 1 ? shNum(a[1]) : 1); },
  RIGHT: function (a) { var s = shStr(a[0]), n = a.length > 1 ? shNum(a[1]) : 1; return n ? s.slice(-n) : ""; },
  MID: function (a) { return shStr(a[0]).substr(shNum(a[1]) - 1, shNum(a[2])); },
  CONCAT: function (a) { return shFlat(a).map(shStr).join(""); },
  TODAY: function () { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); },
  NOW: function () { var d = new Date(); return SH_FN.TODAY() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); },
  COUNTIF: function (a) { var f = shCriteria(a[1]); return (a[0].range || [a[0]]).filter(function (v) { return !shIsErr(v) && f(v); }).length; },
  SUMIF: function (a) {
    var f = shCriteria(a[1]), test = a[0].range || [a[0]], vals = a.length > 2 ? (a[2].range || [a[2]]) : test, s = 0;
    test.forEach(function (v, i) { if (!shIsErr(v) && f(v) && typeof vals[i] === "number") s += vals[i]; });
    return s;
  }
};
SH_FN.AVG = SH_FN.AVERAGE; SH_FN.CONCATENATE = SH_FN.CONCAT;
/* IF, IFERROR, VLOOKUP and MATCH are handled in the evaluator (IF only works out the branch it
   takes; the lookups use the column index) */
var SH_SPECIAL = { IF: 1, IFERROR: 1, VLOOKUP: 1, MATCH: 1 };
function shTokens(src) {
  var out = [], i = 0, m;
  while (i < src.length) {
    var ch = src.charAt(i);
    if (/\s/.test(ch)) { i++; continue; }
    if ((m = /^(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i)))) { out.push({ t: "num", v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if (ch === '"') {
      var j = i + 1, s = "";
      while (j < src.length) { if (src.charAt(j) === '"') { if (src.charAt(j + 1) === '"') { s += '"'; j += 2; continue; } break; } s += src.charAt(j++); }
      if (j >= src.length) throw shErr("#ERROR!");
      out.push({ t: "str", v: s }); i = j + 1; continue;
    }
    /* an error code written into a formula (a deleted reference becomes #REF!) is that error */
    if ((m = /^#(REF!|N\/A|DIV\/0!|VALUE!|NAME\?|NUM!|CYCLE!|ERROR!)/.exec(src.slice(i)))) { out.push({ t: "errv", v: m[0] }); i += m[0].length; continue; }
    /* another sheet: Hosts!A1, 'Q1 2026'!B2:B9 */
    if ((m = /^(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))!(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?/.exec(src.slice(i)))) {
      var sheetName = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2], R1 = shRef(m[3]), R2 = m[4] ? shRef(m[4]) : null;
      if (R2) out.push({ t: "range", sheet: sheetName, r1: Math.min(R1.r, R2.r), c1: Math.min(R1.c, R2.c), r2: Math.max(R1.r, R2.r), c2: Math.max(R1.c, R2.c) });
      else out.push({ t: "ref", sheet: sheetName, r: R1.r, c: R1.c });
      i += m[0].length; continue;
    }
    if ((m = /^\$?[A-Za-z]{1,3}\$?\d+:\$?[A-Za-z]{1,3}\$?\d+/.exec(src.slice(i))) && src.charAt(i + m[0].length) !== "(") {
      var ab = m[0].split(":"), A = shRef(ab[0]), B = shRef(ab[1]);
      out.push({ t: "range", r1: Math.min(A.r, B.r), c1: Math.min(A.c, B.c), r2: Math.max(A.r, B.r), c2: Math.max(A.c, B.c) }); i += m[0].length; continue;
    }
    if ((m = /^[A-Za-z_$][A-Za-z0-9_.$]*/.exec(src.slice(i)))) {
      var w = m[0], after = src.slice(i + w.length).replace(/^\s+/, "");
      if (after.charAt(0) === "(") out.push({ t: "fn", v: w.toUpperCase() });
      else if (shRef(w)) { var rf = shRef(w); out.push({ t: "ref", r: rf.r, c: rf.c }); }
      else if (/^(TRUE|FALSE)$/i.test(w)) out.push({ t: "bool", v: /^TRUE$/i.test(w) });
      else throw shErr("#NAME?");
      i += w.length; continue;
    }
    if ((m = /^(<=|>=|<>|!=)/.exec(src.slice(i)))) { out.push({ t: "op", v: m[0] === "!=" ? "<>" : m[0] }); i += 2; continue; }
    if ("+-*/^&%=<>(),;".indexOf(ch) !== -1) { out.push({ t: "op", v: ch === ";" ? "," : ch }); i++; continue; }
    throw shErr("#ERROR!");
  }
  return out;
}
/* precedence, lowest first: comparison, &, + -, * /, ^, unary -, % */
function shParse(src) {
  var tk = shTokens(src), i = 0;
  var peek = function () { return tk[i]; }, isOp = function (v) { return tk[i] && tk[i].t === "op" && tk[i].v === v; };
  var expect = function (v) { if (!isOp(v)) throw shErr("#ERROR!"); i++; };
  function cmp() { var a = cat(); while (tk[i] && tk[i].t === "op" && /^(=|<>|<|>|<=|>=)$/.test(tk[i].v)) { var op = tk[i++].v; a = { t: "bin", op: op, a: a, b: cat() }; } return a; }
  function cat() { var a = add(); while (isOp("&")) { i++; a = { t: "bin", op: "&", a: a, b: add() }; } return a; }
  function add() { var a = mul(); while (isOp("+") || isOp("-")) { var op = tk[i++].v; a = { t: "bin", op: op, a: a, b: mul() }; } return a; }
  function mul() { var a = pow(); while (isOp("*") || isOp("/")) { var op = tk[i++].v; a = { t: "bin", op: op, a: a, b: pow() }; } return a; }
  function pow() { var a = una(); while (isOp("^")) { i++; a = { t: "bin", op: "^", a: a, b: una() }; } return a; }
  function una() { if (isOp("-")) { i++; return { t: "neg", a: una() }; } if (isOp("+")) { i++; return una(); } return post(); }
  function post() { var a = prim(); while (isOp("%")) { i++; a = { t: "pct", a: a }; } return a; }
  function prim() {
    var t = peek();
    if (!t) throw shErr("#ERROR!");
    if (t.t === "num" || t.t === "str" || t.t === "bool" || t.t === "ref" || t.t === "range" || t.t === "errv") { i++; return t; }
    if (t.t === "fn") {
      i++; expect("(");
      var args = [];
      if (!isOp(")")) { args.push(cmp()); while (isOp(",")) { i++; args.push(cmp()); } }
      expect(")");
      if (!SH_FN[t.v] && !SH_SPECIAL[t.v]) throw shErr("#NAME?");
      return { t: "call", name: t.v, args: args };
    }
    if (isOp("(")) { i++; var e = cmp(); expect(")"); return e; }
    throw shErr("#ERROR!");
  }
  var tree = cmp();
  if (i < tk.length) throw shErr("#ERROR!");
  return tree;
}
function shFormulaOf(s) {
  s = String(s || "");
  if (s.charAt(0) === "=" && s.length > 1) return s.slice(1);
  var m = /^\s*([A-Za-z][A-Za-z0-9]*)\s*=\s*\((.*)\)\s*$/.exec(s);      /* SUM=(10+12) -> SUM(10+12) */
  if (m && (SH_FN[m[1].toUpperCase()] || SH_SPECIAL[m[1].toUpperCase()])) return m[1] + "(" + m[2] + ")";
  return null;
}
/* the calculator for one sheet: value(r, c) and text(r, c), cached until reset() */
/* one calculator per sheet, so formulas can read other sheets' values (cached until any sheet changes) */
var SHEET_CALCS = {};
function sheetCalcFor(name, selfTitle) {
  var key = String(name || "").toLowerCase();
  if (selfTitle && key === String(selfTitle).toLowerCase()) return null;   /* own name: the local sheet */
  var sh = (typeof sheets !== "undefined" ? sheets : []).filter(function (x) { return String(x.title).toLowerCase() === key; })[0];
  if (!sh) return undefined;
  return SHEET_CALCS[sh.id] || (SHEET_CALCS[sh.id] = makeSheetCalc(function () { return sh.rows; }, sh.title));
}
function resetSheetCalcs() { Object.keys(SHEET_CALCS).forEach(function (k) { SHEET_CALCS[k].reset(); }); }
function makeSheetCalc(getRows, selfTitle) {
  var cache = new Map(), visiting = new Set(), parsed = new Map(), lookIdx = new Map();
  var raw = function (r, c) { var row = getRows()[r]; return row && row[c] != null ? String(row[c]) : ""; };
  function value(r, c) {
    var key = r * 16384 + c;
    if (cache.has(key)) return cache.get(key);
    var src = raw(r, c), f = shFormulaOf(src), v;
    if (f === null) v = shLiteral(src);
    else if (visiting.has(key)) return shErr("#CYCLE!");
    else {
      visiting.add(key);
      try { var tree = parsed.get(f); if (!tree) { tree = shParse(f); parsed.set(f, tree); } v = ev(tree); if (v && v.range) v = v.range.length === 1 ? v.range[0] : shErr("#VALUE!"); }
      catch (e) { v = shIsErr(e) ? e : shErr("#ERROR!"); }
      visiting.delete(key);
    }
    if (typeof v === "number" && !isFinite(v)) v = shErr("#NUM!");
    cache.set(key, v);
    return v;
  }
  function inside(r, c) { var rs = getRows(); return r >= 0 && c >= 0 && r < rs.length && c < (rs[0] || []).length; }
  function rangeVals(n) {
    if (!inside(n.r1, n.c1) || !inside(n.r2, n.c2)) throw shErr("#REF!");
    var out = [];
    for (var r = n.r1; r <= n.r2; r++) for (var c = n.c1; c <= n.c2; c++) out.push(value(r, c));
    return out;
  }
  /* exact lookups in a column go through an index built once per range (until the sheet changes) */
  function columnIndex(n, col) {
    var key = n.r1 + ":" + n.r2 + ":" + col;
    if (lookIdx.has(key)) return lookIdx.get(key);
    var map = new Map();
    for (var r = n.r1; r <= n.r2; r++) { var v = value(r, col), k = shIsErr(v) ? null : shStr(v).toLowerCase(); if (k !== null && !map.has(k)) map.set(k, r); }
    lookIdx.set(key, map);
    return map;
  }
  /* a reference into another sheet goes to that sheet's calculator */
  function other(n) {
    var o = sheetCalcFor(n.sheet, selfTitle);
    if (o === undefined) throw shErr("#REF!");
    return o;
  }
  function ev(n) {
    if (n.sheet && (n.t === "ref" || n.t === "range")) {
      var oc = other(n);
      if (oc) {
        if (n.t === "ref") { if (!oc.inside(n.r, n.c)) throw shErr("#REF!"); var ov = oc.value(n.r, n.c); if (shIsErr(ov)) throw ov; return ov; }
        if (!oc.inside(n.r1, n.c1) || !oc.inside(n.r2, n.c2)) throw shErr("#REF!");
        var vals = []; for (var rr = n.r1; rr <= n.r2; rr++) for (var cc = n.c1; cc <= n.c2; cc++) vals.push(oc.value(rr, cc));
        return { range: vals, calc: oc };
      }
    }
    switch (n.t) {
      case "errv": throw shErr(n.v);
      case "num": case "str": case "bool": return n.v;
      case "ref": if (!inside(n.r, n.c)) throw shErr("#REF!"); var v = value(n.r, n.c); if (shIsErr(v)) throw v; return v;
      case "range": return { range: rangeVals(n) };
      case "neg": return -shNum(ev(n.a));
      case "pct": return shNum(ev(n.a)) / 100;
      case "bin": {
        var a = ev(n.a), b = ev(n.b);
        if (a && a.range || b && b.range) throw shErr("#VALUE!");
        switch (n.op) {
          case "+": return shNum(a) + shNum(b);
          case "-": return shNum(a) - shNum(b);
          case "*": return shNum(a) * shNum(b);
          case "/": { var d = shNum(b); if (d === 0) throw shErr("#DIV/0!"); return shNum(a) / d; }
          case "^": return Math.pow(shNum(a), shNum(b));
          case "&": return shStr(a) + shStr(b);
          default: {
            var an = typeof a === "number" || (a !== "" && SH_NUM_RE.test(a)), bn = typeof b === "number" || (b !== "" && SH_NUM_RE.test(b));
            var x = an && bn ? shNum(a) : shStr(a).toLowerCase(), y = an && bn ? shNum(b) : shStr(b).toLowerCase();
            return n.op === "=" ? x === y : n.op === "<>" ? x !== y : n.op === "<" ? x < y : n.op === ">" ? x > y : n.op === "<=" ? x <= y : x >= y;
          }
        }
      }
      case "call": {
        if (n.name === "IF") { var c0 = shBool(ev(n.args[0])); return c0 ? ev(n.args[1]) : n.args.length > 2 ? ev(n.args[2]) : false; }
        if (n.name === "IFERROR") { try { var t = ev(n.args[0]); if (shIsErr(t)) throw t; return t; } catch (e) { if (shIsErr(e)) return ev(n.args[1]); throw e; } }
        if (n.name === "VLOOKUP" || n.name === "MATCH") {
          var key = ev(n.args[0]), rg = n.args[1];
          if (rg.t !== "range") throw shErr("#VALUE!");
          if (rg.sheet && other(rg)) {                  /* a range on another sheet: look it up there */
            var oc2 = other(rg), call = { t: "call", name: n.name, args: [{ t: "str", v: shIsErr(key) ? "" : key }].concat(n.args.slice(1).map(function (a, k) { return k === 0 ? Object.assign({}, a, { sheet: null }) : { t: "num", v: shNum(ev(a)) }; })) };
            return oc2.evalTree(call);
          }
          if (!inside(rg.r1, rg.c1) || !inside(rg.r2, rg.c2)) throw shErr("#REF!");
          var exact = n.name === "VLOOKUP" ? n.args.length < 4 || !shBool(ev(n.args[3])) : n.args.length < 3 || shNum(ev(n.args[2])) === 0;
          var hit = -1;
          if (exact) { var at = columnIndex(rg, rg.c1).get(shStr(key).toLowerCase()); if (at !== undefined) hit = at; }
          else {                                     /* sorted first column: the last row not past the key */
            var kn = shNum(key);
            for (var r = rg.r1; r <= rg.r2; r++) { var cv = value(r, rg.c1); if (typeof cv === "number" && cv <= kn) hit = r; else if (typeof cv === "number") break; }
          }
          if (hit < 0) throw shErr("#N/A");
          if (n.name === "MATCH") return hit - rg.r1 + 1;
          var col = rg.c1 + shNum(ev(n.args[2])) - 1;
          if (col < rg.c1 || col > rg.c2) throw shErr("#REF!");
          var out = value(hit, col); if (shIsErr(out)) throw out; return out;
        }
        var args = n.args.map(ev);
        return SH_FN[n.name](args);
      }
    }
    throw shErr("#ERROR!");
  }
  return {
    value: value,
    /* what the cell shows: a formula's result, or exactly what was typed ("1.20" and "0042" stay) */
    text: function (r, c) {
      var src = raw(r, c);
      if (shFormulaOf(src) === null) return src;
      var v = value(r, c);
      return shIsErr(v) ? v.err : typeof v === "number" ? shFmt(v) : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v;
    },
    isFormula: function (r, c) { return shFormulaOf(raw(r, c)) !== null; },
    inside: inside,
    evalTree: function (tree) { return ev(tree); },
    reset: function () { cache.clear(); lookIdx.clear(); }
  };
}
/* ---- filters and search ---- */
/* letters of the query in order, anywhere in the text: "clnt" finds "Clinton" */
function shFuzzy(q, text) {
  q = q.toLowerCase(); text = String(text).toLowerCase();
  if (!q) return true;
  for (var i = 0, j = 0; j < text.length; j++) if (text.charAt(j) === q.charAt(i) && ++i === q.length) return true;
  return false;
}
/* one filter box: "test" the whole word, "test*" words starting test, "%test%" anywhere,
   "%org" ends with, "org%" starts with, "a%b" pattern, ">10" "<=5" compare, "=Male" exact,
   "!test" not the word, "~clnt" fuzzy */
function shFilterTest(q) {
  q = String(q || "").trim();
  if (!q) return null;
  if (q.charAt(0) === "~") { var fz = q.slice(1); return { test: function (v) { return shFuzzy(fz, v); } }; }
  if (q.charAt(0) === "!" && q.charAt(1) !== "=") { var negT = shWordMatch(q.slice(1)); return { test: function (v) { return !negT(v); } }; }
  var m = /^(<=|>=|<>|!=|<|>|=)(.*)$/.exec(q);
  if (m) {
    var op = m[1] === "!=" ? "<>" : m[1], rhs = m[2].trim(), rn = SH_NUM_RE.test(rhs) ? parseFloat(rhs) : null, rl = rhs.toLowerCase();
    return { exact: op === "=" ? rl : null, test: function (v) {
      var s = String(v), vn = s !== "" && SH_NUM_RE.test(s) ? parseFloat(s) : null;
      if (op === "=") return rn !== null && vn !== null ? vn === rn : s.toLowerCase() === rl;
      if (op === "<>") return rn !== null && vn !== null ? vn !== rn : s.toLowerCase() !== rl;
      if (rn !== null && vn !== null) return op === "<" ? vn < rn : op === ">" ? vn > rn : op === "<=" ? vn <= rn : vn >= rn;
      if (rn !== null) return false;
      var sl = s.toLowerCase();
      return op === "<" ? sl < rl : op === ">" ? sl > rl : op === "<=" ? sl <= rl : sl >= rl;
    } };
  }
  if (q.indexOf("%") !== -1 || q.indexOf("_") !== -1 && /%|_/.test(q)) {
    var re = new RegExp("^" + q.replace(/[.+^${}()|[\]\\*?]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "i");
    return { test: function (v) { return re.test(String(v)); } };
  }
  /* plain text is a whole word: "test" finds "test" and "test server" but not "testing" or
     "pretest". "test*" finds words starting test; %test% still means anywhere. */
  var wm = shWordMatch(q);
  return { test: function (v) { return wm(String(v)); } };
}
function shWordMatch(q) {
  q = String(q).trim();
  var prefix = /\*$/.test(q);                         /* test* : the start of a word */
  var word = q.replace(/\*+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var re = new RegExp("(^|[^\\p{L}\\p{N}])" + word + (prefix ? "" : "(?![\\p{L}\\p{N}])"), "iu");
  return function (v) { return re.test(String(v)); };
}

/* ---- filling ----
   Moving a formula by (dr, dc) shifts its references, as Excel does: A1 moves both ways, $A$1
   stays put, $A1 keeps its column, A$1 keeps its row. Text in quotes and function names are left
   alone; a reference pushed off the sheet becomes #REF!. */
function shShiftFormula(src, dr, dc) {
  var f = shFormulaOf(src);
  if (f === null) return src;
  var out = "", i = 0, m;
  var shift = function (tok) {
    var p = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(tok);
    if (!p) return tok;
    var c = shColIndex(p[2]) + (p[1] ? 0 : dc), r = parseInt(p[4], 10) - 1 + (p[3] ? 0 : dr);
    if (c < 0 || r < 0) return "#REF!";
    return p[1] + colName(c) + p[3] + (r + 1);
  };
  while (i < f.length) {
    var ch = f.charAt(i);
    if (ch === '"') {                                  /* text in quotes is not touched */
      var j = i + 1;
      while (j < f.length && !(f.charAt(j) === '"' && f.charAt(j + 1) !== '"')) j += f.charAt(j) === '"' ? 2 : 1;
      out += f.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === "'") {                                  /* a quoted sheet name: 'Q1 2026'!A1 - not a cell */
      var q = i + 1;
      while (q < f.length && !(f.charAt(q) === "'" && f.charAt(q + 1) !== "'")) q += f.charAt(q) === "'" ? 2 : 1;
      out += f.slice(i, q + 1); i = q + 1; continue;
    }
    if ((m = /^[A-Za-z_$][A-Za-z0-9_.$]*/.exec(f.slice(i)))) {
      var w = m[0], after = f.slice(i + w.length).replace(/^\s+/, "");
      out += after.charAt(0) === "(" || after.charAt(0) === "!" ? w : shift(w);    /* SUM( is a function, Hosts! a sheet; A1 is a reference */
      i += w.length; continue;
    }
    out += ch; i++;
  }
  return "=" + out;
}
/* Rewrite the references in a formula, Excel-style: fn gets each reference ({ sheet, r, c, absR,
   absC, end: "start" | "end" | null }) and returns the new { r, c } or null for #REF!. Text in
   quotes, sheet names and function names are left alone. */
function shMapRefs(src, fn, swapInverted) {
  var f = shFormulaOf(src);
  if (f === null) return src;
  var out = "", i = 0, m;
  var cell = function (tok, sheet, end) {
    var p = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(tok);
    var nr = fn({ sheet: sheet, r: parseInt(p[4], 10) - 1, c: shColIndex(p[2]), absC: !!p[1], absR: !!p[3], end: end });
    if (nr) nr.text = p[1] + colName(nr.c) + p[3] + (nr.r + 1);
    return nr;
  };
  while (i < f.length) {
    var ch = f.charAt(i);
    if (ch === '"') {
      var j = i + 1;
      while (j < f.length && !(f.charAt(j) === '"' && f.charAt(j + 1) !== '"')) j += f.charAt(j) === '"' ? 2 : 1;
      out += f.slice(i, j + 1); i = j + 1; continue;
    }
    if ((m = /^(?:('(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?(?![\w(])/.exec(f.slice(i))) && (m[1] || !/[\w.$]/.test(f.charAt(i - 1) || ""))) {
      var sheet = m[1] ? m[1].replace(/^'|'$/g, "").replace(/''/g, "'") : null, a, b2;
      if (m[3]) {
        a = cell(m[2], sheet, "start"); b2 = cell(m[3], sheet, "end");
        if (swapInverted && a && b2) {                  /* moved rows/columns: ends that crossed are put back in order */
          var p1 = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(m[2]), p2 = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(m[3]);
          var r1 = Math.min(a.r, b2.r), r2 = Math.max(a.r, b2.r), c1 = Math.min(a.c, b2.c), c2 = Math.max(a.c, b2.c);
          a = { r: r1, c: c1, text: p1[1] + colName(c1) + p1[3] + (r1 + 1) }; b2 = { r: r2, c: c2, text: p2[1] + colName(c2) + p2[3] + (r2 + 1) };
        }
        var whole = a && b2 && b2.r >= a.r && b2.c >= a.c;          /* everything in it deleted: #REF! */
        out += whole ? (m[1] ? m[1] + "!" : "") + a.text + ":" + b2.text : "#REF!";
      } else { a = cell(m[2], sheet, null); out += a ? (m[1] ? m[1] + "!" : "") + a.text : "#REF!"; }
      i += m[0].length; continue;
    }
    if ((m = /^[A-Za-z_][\w.]*/.exec(f.slice(i)))) { out += m[0]; i += m[0].length; continue; }
    out += ch; i++;
  }
  return "=" + out;
}
/* a row (axis "r") or column ("c") inserted at index `at` (delta +1), or the one at `at` deleted
   (delta -1). `mine(sheet)` says whether a reference's sheet is the one that changed. */
function shShiftRefs(src, axis, at, delta, mine) {
  return shMapRefs(src, function (ref) {
    if (!mine(ref.sheet)) return { r: ref.r, c: ref.c };
    var v = ref[axis];
    if (delta > 0) { if (v >= at) v += delta; }
    else if (v === at) {
      if (ref.end === "start") { /* the range starts on the deleted line: it now starts on the next one */ }
      else if (ref.end === "end") v -= 1;
      else return null;                                /* a single reference to what was deleted */
    } else if (v > at) v -= 1;
    if (v < 0) return null;
    var o = { r: ref.r, c: ref.c }; o[axis] = v;
    return o;
  });
}
var SH_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
var SH_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
/* the next values after a run of cells (one column's or one row's worth), as a fill continues them */
function shSeries(src, count) {
  var out = [], n = src.length, cycle = function (k) { return src[k % n]; };
  var allNum = src.every(function (v) { return v !== "" && SH_NUM_RE.test(v); });
  /* names in a cycle: Jan, Feb / Monday, Tuesday - in the case and length they were typed */
  var named = function (list) {
    var idx = src.map(function (v) {
      var l = String(v).trim().toLowerCase();
      for (var k = 0; k < list.length; k++) if (l === list[k] || (l.length === 3 && list[k].slice(0, 3) === l)) return k;
      return -1;
    });
    if (idx.some(function (k) { return k < 0; })) return null;
    var step = n > 1 ? ((idx[n - 1] - idx[n - 2]) % list.length + list.length) % list.length || 1 : 1;
    var last = src[n - 1].trim(), shortForm = last.length === 3, upper = last === last.toUpperCase(), cap = last.charAt(0) === last.charAt(0).toUpperCase();
    var res = [];
    for (var k = 1; k <= count; k++) {
      var name = list[(idx[n - 1] + step * k) % list.length];
      if (shortForm) name = name.slice(0, 3);
      res.push(upper ? name.toUpperCase() : cap ? name.charAt(0).toUpperCase() + name.slice(1) : name);
    }
    return res;
  };
  if (!allNum) { var nm = named(SH_MONTHS) || named(SH_DAYS); if (nm) return nm; }
  if (allNum && n > 1) {                               /* 2, 4 -> 6, 8 (the average step) */
    var nums = src.map(parseFloat), step = (nums[n - 1] - nums[0]) / (n - 1);
    for (var k = 1; k <= count; k++) out.push(shFmt(nums[n - 1] + step * k));
    return out;
  }
  var iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  if (src.every(function (v) { return iso.test(v); })) {   /* dates step by a day, or by the gap between two */
    var t = src.map(function (v) { var p = iso.exec(v); return Date.UTC(+p[1], +p[2] - 1, +p[3]); });
    var dstep = n > 1 ? (t[n - 1] - t[0]) / (n - 1) : 864e5;
    for (var k2 = 1; k2 <= count; k2++) out.push(new Date(t[n - 1] + dstep * k2).toISOString().slice(0, 10));
    return out;
  }
  var tail = /^(.*?)(\d+)$/;                           /* host01 -> host02, Item 9 -> Item 10 */
  if (!allNum && src.every(function (v) { return tail.test(v); })) {
    var pp = src.map(function (v) { return tail.exec(v); });
    if (pp.every(function (x) { return x[1] === pp[0][1]; })) {
      var vals = pp.map(function (x) { return parseInt(x[2], 10); }), st = n > 1 ? (vals[n - 1] - vals[0]) / (n - 1) || 1 : 1, width = pp[n - 1][2].length;
      for (var k3 = 1; k3 <= count; k3++) { var v3 = String(Math.round(vals[n - 1] + st * k3)); out.push(pp[0][1] + (v3.length < width ? "0".repeat(width - v3.length) + v3 : v3)); }
      return out;
    }
  }
  for (var k4 = 0; k4 < count; k4++) out.push(cycle(k4));  /* anything else repeats */
  return out;
}
/* the function cheatsheet beside a sheet: syntax, what it does, and an example with its result */
var SH_HELP = [
  ["Maths", [
    ["SUM", "SUM(range, ...)", "Adds numbers. Text and blanks in a range are skipped.", "=SUM(B2:B10)", "the total of B2 to B10"],
    ["ROUND", "ROUND(number, digits)", "Rounds to that many decimal places.", "=ROUND(3.14159, 2)", "3.14"],
    ["ABS", "ABS(number)", "The number without its sign.", "=ABS(-7)", "7"],
    ["SQRT", "SQRT(number)", "Square root.", "=SQRT(81)", "9"],
    ["POWER", "POWER(number, power)", "A number raised to a power (same as ^).", "=POWER(2, 10)", "1024"],
    ["INT", "INT(number)", "Rounds down to a whole number.", "=INT(7.9)", "7"],
    ["MOD", "MOD(number, divisor)", "The remainder after dividing.", "=MOD(17, 5)", "2"]
  ]],
  ["Statistics", [
    ["AVERAGE", "AVERAGE(range, ...)", "The mean of the numbers (AVG works too).", "=AVERAGE(C2:C20)", "the average of C2 to C20"],
    ["MIN", "MIN(range, ...)", "The smallest number.", "=MIN(D2:D50)", "the lowest value"],
    ["MAX", "MAX(range, ...)", "The largest number.", "=MAX(D2:D50)", "the highest value"],
    ["COUNT", "COUNT(range, ...)", "How many cells hold numbers.", "=COUNT(A2:A100)", "the number of numeric cells"],
    ["COUNTA", "COUNTA(range, ...)", "How many cells are not empty.", "=COUNTA(A2:A100)", "the number of filled cells"],
    ["COUNTIF", "COUNTIF(range, criteria)", "How many cells match: \"Male\", \">10\", \"<>x\", \"*.org\".", "=COUNTIF(C2:C40, \"Female\")", "how many say Female"],
    ["SUMIF", "SUMIF(range, criteria, [sum_range])", "Adds the cells (or their partners in sum_range) that match.", "=SUMIF(C2:C40, \"Male\", F2:F40)", "the F total for Male rows"]
  ]],
  ["Logic", [
    ["IF", "IF(test, if_true, [if_false])", "One value or another depending on a test.", "=IF(B2>90, \"High\", \"OK\")", "High when B2 is over 90"],
    ["IFERROR", "IFERROR(value, if_error)", "A fallback when a formula fails.", "=IFERROR(A2/B2, 0)", "0 instead of #DIV/0!"],
    ["AND", "AND(test, ...)", "TRUE when every test is true.", "=AND(B2>0, B2<10)", "TRUE for 1 to 9"],
    ["OR", "OR(test, ...)", "TRUE when any test is true.", "=OR(C2=\"P1\", C2=\"P2\")", "TRUE for P1 or P2"],
    ["NOT", "NOT(test)", "Flips TRUE and FALSE.", "=NOT(D2=\"Done\")", "TRUE until it is Done"]
  ]],
  ["Text", [
    ["CONCAT", "CONCAT(text, ...)", "Joins text together (CONCATENATE and & do the same).", "=CONCAT(A2, \" \", B2)", "first and last name"],
    ["LEN", "LEN(text)", "How many characters.", "=LEN(\"idx01\")", "5"],
    ["UPPER", "UPPER(text)", "In capitals.", "=UPPER(\"inc\")", "INC"],
    ["LOWER", "LOWER(text)", "In lower case.", "=LOWER(\"HOST01\")", "host01"],
    ["TRIM", "TRIM(text)", "Removes extra spaces.", "=TRIM(\"  a   b \")", "a b"],
    ["LEFT", "LEFT(text, [count])", "The first characters.", "=LEFT(\"INC0048812\", 3)", "INC"],
    ["RIGHT", "RIGHT(text, [count])", "The last characters.", "=RIGHT(\"host-prd\", 3)", "prd"],
    ["MID", "MID(text, start, count)", "Characters from the middle.", "=MID(\"HOSTWEB01PRD\", 5, 3)", "WEB"]
  ]],
  ["Lookup", [
    ["VLOOKUP", "VLOOKUP(value, range, column, [approx])", "Finds value in the range's first column and returns that row's cell from another column. Leave approx off (or FALSE) for an exact match.", "=VLOOKUP(\"idx02\", A2:D50, 3, FALSE)", "column 3 of idx02's row"],
    ["MATCH", "MATCH(value, range, [type])", "Where value sits in a list (1 = first). Type 0 means exact.", "=MATCH(\"Karen\", B2:B40, 0)", "Karen's position"]
  ]],
  ["Date", [
    ["TODAY", "TODAY()", "Today's date (yyyy-mm-dd).", "=TODAY()", "e.g. 2026-10-10"],
    ["NOW", "NOW()", "Today's date and the time.", "=NOW()", "e.g. 2026-10-10 08:30"]
  ]]
];
var SH_HELP_BASICS = [
  ["A1", "a cell", "column letter then row number"], ["A1:B5", "a range", "every cell from A1 to B5"], ["$A$1", "a fixed reference", "stays put when filled ($A1 keeps the column, A$1 the row)"], ["Hosts!A1", "another sheet", "'Q1 2026'!B2:B9 for names with spaces; works in SUM, VLOOKUP and the rest"],
  ["+ - * / ^", "maths", "=B2*C2, =2^8"], ["&", "join text", "=A2&\" \"&B2"], ["%", "percent", "=50% gives 0.5"],
  ["= <> < > <= >=", "comparisons", "=B2>10 gives TRUE or FALSE"], ["\"text\"", "text in a formula", "use \"\" for a quote inside it"]
];
var SH_HELP_ERRORS = [
  ["#DIV/0!", "dividing by zero (or an empty cell)"], ["#REF!", "a cell or range outside the sheet"], ["#NAME?", "a function name it doesn't know"],
  ["#VALUE!", "text where a number was needed"], ["#N/A", "a lookup that found nothing"], ["#CYCLE!", "a formula that refers back to its own cell"], ["#ERROR!", "the formula couldn't be read"]
];
/* A pasted table becomes rows and columns: a markdown table (pipes and the --- line dropped) or an
   HTML table (from a web page, Teams, Outlook or CarbonFibre's own formatted copy). Anything else
   is pasted as tab-separated text, as before. */
function shTableToTsv(text, html) {
  var lines = String(text || "").replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  var isRow = function (l) { return /^\s*\|.*\|\s*$/.test(l); };
  var isDelim = function (l) { return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l); };
  var mdRows = lines.filter(function (l) { return l.trim(); });
  if (mdRows.length >= 2 && mdRows.every(function (l) { return isRow(l) || isDelim(l); }) && mdRows.some(isDelim)) {
    return mdRows.filter(function (l) { return !isDelim(l); }).map(function (l) {
      return splitCells(l).map(function (c) { return c.text.replace(/\\\|/g, "|").replace(/\t/g, " ").trim(); }).join("\t");
    }).join("\n");
  }
  if (html && /<table/i.test(html) && !/\t/.test(text)) {
    try {
      var doc = new DOMParser().parseFromString(html, "text/html"), table = doc.querySelector("table");
      if (table) return Array.prototype.map.call(table.rows, function (tr) {
        return Array.prototype.map.call(tr.cells, function (td) { return td.textContent.replace(/\s+/g, " ").trim(); }).join("\t");
      }).join("\n");
    } catch (e) {}
  }
  return text;
}
