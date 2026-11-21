/* ============================================================
   Rubber ducky mode: reads the code blocks in a note by pattern (no model, no network) and explains
   them in a panel beside the note: a one-line summary, the pipeline step by step with the fields after
   each, the names it defines, questions about likely mistakes, and how blocks feed each other.
   The rules and their ids are in docs/rubber-duck-rules.md; cf-tests/duck_rules_test.py tests each one
   for what must trigger it and what must not. Where a rule can't be sure it stays quiet.
   ============================================================ */
const Duck = {
  /* ---- shared helpers ---- */
  /* split s at sep (a character) outside quotes, brackets and parentheses; parts keep their offsets */
  split(s, sep) {
    const out = [];
    let depth = 0, q = "", start = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charAt(i);
      if (q) { if (c === "\\") { i++; continue; } if (c === q) q = ""; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
      else if (c === sep && depth === 0 && !(sep === "|" && (s.charAt(i + 1) === "|" || s.charAt(i - 1) === "|"))) { out.push({ t: s.slice(start, i), at: start }); start = i + 1; }
    }
    out.push({ t: s.slice(start), at: start });
    return out;
  },
  lineAt(text, at, base) { let n = 0; for (let i = 0; i < at && i < text.length; i++) if (text.charCodeAt(i) === 10) n++; return base + n; },
  short(s, n) { s = String(s).replace(/\s+/g, " ").trim(); return s.length > (n || 90) ? s.slice(0, (n || 90) - 1) + "…" : s; },
  unq(s) { return String(s).trim().replace(/^["']|["']$/g, ""); },
  base(path) { return String(path).split(/[\\/]/).pop().toLowerCase(); },

  /* ---- LANG-1, LANG-2, LANG-3: what language a block is in, or null for what isn't code ---- */
  FENCE: { spl: "spl", splunk: "spl", logstash: "logstash", conf: "logstash", sql: "sql", mysql: "sql", postgres: "sql", postgresql: "sql", tsql: "sql",
    python: "python", py: "python", js: "js", javascript: "js", ts: "js", typescript: "js", jsx: "js", tsx: "js", node: "js",
    bash: "shell", sh: "shell", shell: "shell", zsh: "shell", console: "shell", powershell: "powershell", ps1: "powershell", pwsh: "powershell", ps: "powershell" },
  NAMES: { spl: "Splunk SPL", logstash: "Logstash", sql: "SQL", python: "Python", js: "JavaScript", shell: "Shell", powershell: "PowerShell" },
  lang(fence, text) {
    const f = String(fence || "").trim().toLowerCase().split(/\s+/)[0];
    if (/^(mermaid|excalidraw)$/.test(f) || !String(text).trim()) return null;
    if (Duck.FENCE[f]) return Duck.FENCE[f];
    const t = String(text);
    if (/\b(index|sourcetype)\s*=/.test(t) || /^\s*\|\s*(tstats|inputlookup|makeresults|rest)\b/m.test(t) || /\|\s*(stats|eval|rex|table)\b/.test(t)) return "spl";
    if (/^\s*(input|filter|output)\s*\{/m.test(t)) return "logstash";
    if (/^\s*(select|with|insert|update|create\s+table)\b/im.test(t) && /\bfrom\b|\binto\b|\bset\b|create\s+table/i.test(t)) return "sql";
    if (/^\s*(def|class)\s+\w+.*:\s*$/m.test(t) || /^\s*(import\s+\w+|from\s+[\w.]+\s+import)\b/m.test(t)) return "python";
    if (/^\s*(const|let|var|function|import|export)\b/m.test(t)) return "js";
    if (/^\s*\$\w+\s*=/m.test(t) || /\b(Get|Set|Import|Export|Where|Select|Sort|Group|Measure|ForEach|Out)-[A-Z]\w+/.test(t)) return "powershell";
    if (/^#!/.test(t) || /^\s*[A-Za-z_]\w*=/m.test(t) || /\|\s*(grep|awk|sed|sort|uniq|wc|cut|head|tail|xargs)\b/.test(t)) return "shell";
    return null;
  },
  /* the fenced blocks of a note: { fence, start (the ``` line), base (first code line), lines } */
  blocks(lines) {
    const out = [];
    let open = -1, fence = "";
    lines.forEach(function (l, i) {
      if (!/^\s*```/.test(l)) return;
      if (open < 0) { open = i; fence = l.replace(/^\s*```/, "").trim(); }
      else { out.push({ fence: fence, start: open, base: open + 1, lines: lines.slice(open + 1, i) }); open = -1; }
    });
    return out;
  },

  /* ---- SPL-1, SPL-2, IO-1 ---- */
  SPL_KIND: { where: "filter", search: "filter", dedup: "filter", head: "filter", tail: "filter", sort: "filter", regex: "filter",
    eval: "transform", rex: "transform", rename: "transform", table: "reshape", fields: "reshape",
    stats: "aggregate", chart: "aggregate", timechart: "aggregate", top: "aggregate", rare: "aggregate", tstats: "aggregate", eventstats: "transform", streamstats: "transform",
    lookup: "join", join: "join", append: "join", appendcols: "join", outputlookup: "output", collect: "output", outputcsv: "output" },
  SPL_FIX: { stats: 1, chart: 1, timechart: 1, top: 1, rare: 1, tstats: 1, table: 1 },
  SPL_OPEN: { spath: 1, extract: 1, kv: 1, join: 1, append: 1, appendcols: 1 },
  SPL_SKIP: /^(and|or|not|by|as|over|in|like|true|false|null|limit|span|where|output|outputnew)$/i,
  fieldList(s) {   /* "a, b c" -> names; quoted names unquoted, options (x=y) and keywords left out */
    return Duck.split(s.replace(/,/g, " , "), " ").map(function (p) { return p.t.trim(); })
      .filter(function (w) { return w && w !== "," && w.indexOf("=") < 0 && !Duck.SPL_SKIP.test(w); }).map(Duck.unq);
  },
  aggs(s) {   /* "count, avg(bytes) as avgb dc(user)" -> [{ name, arg }] */
    const out = [], re = /([A-Za-z_]\w*)(?:\(([^()]*)\))?(?:\s+as\s+("[^"]+"|[\w.]+))?/gi;
    let m;
    Duck.split(s, ",").forEach(function (part) {
      re.lastIndex = 0;
      while ((m = re.exec(part.t))) {
        if (/=/.test(part.t.slice(m.index, m.index + m[0].length + 1)) && !m[2]) continue;     /* span=1h, limit=10 */
        if (Duck.SPL_SKIP.test(m[1]) && !m[2]) continue;
        out.push({ name: m[3] ? Duck.unq(m[3]) : (m[2] !== undefined ? m[1] + "(" + m[2] + ")" : m[1]), arg: m[2] ? m[2].trim() : "" });
      }
    });
    return out;
  },
  exprFields(s) {   /* names in a where/search: the word before =, !=, <, >, LIKE or IN */
    const out = [], re = /("[^"]*"|'[^']*')|([A-Za-z_][\w.]*)\s*(!=|==|<=|>=|=|<|>|\s+like\b|\s+in\s*\()/gi;
    let m;
    while ((m = re.exec(s))) if (m[2] && !Duck.SPL_SKIP.test(m[2])) out.push(m[2]);
    return out;
  },
  spl(b) {
    const raw = b.lines.join("\n"), text = raw.replace(/```[\s\S]*?```/g, function (c) { return c.replace(/[^\n]/g, " "); });
    const segs = Duck.split(text, "|"), steps = [], questions = [], reads = [], writes = [];
    let fields = null, fixed = null, first = true;
    const has = function (f) { return fields === null || f.charAt(0) === "_" || f === "*" || fields.has(f); };
    const ask = function (f, line, cmd) {
      if (has(f)) return;
      questions.push({ rule: "SPL-1", line: line, field: f, text: "“" + f + "” isn’t there any more: the " + fixed.cmd + " on line " + (fixed.line + 1) +
        " kept only " + Array.from(fields).slice(0, 5).join(", ") + (fields.size > 5 ? ", …" : "") + ", so this " + cmd + " can’t see it." });
    };
    segs.forEach(function (sg) {
      const t = sg.t.trim();
      if (!t) return;                                     /* "| inputlookup x": the empty part before the pipe */
      const line = Duck.lineAt(text, sg.at + (sg.t.length - sg.t.replace(/^\s+/, "").length), b.base);
      const mac = /^`([^`]+)`/.exec(t);
      let cmd = mac ? "macro" : (/^([a-z]+)\b/i.exec(t) || ["", ""])[1].toLowerCase();
      if (first && !/^(search|tstats|inputlookup|inputcsv|makeresults|rest|from|metadata)$/.test(cmd)) cmd = "search";
      const argText = first && cmd === "search" && !/^search\b/i.test(t) ? t : t.replace(/^`[^`]+`|^[a-z]+\b/i, "");
      const step = { line: line, cmd: cmd, kind: first ? "source" : (cmd === "macro" ? "macro" : Duck.SPL_KIND[cmd] || "transform"), text: Duck.short(t), adds: [], removes: [] };
      const add = function (f) { step.adds.push(f); if (fields) fields.add(f); };
      const keep = function (list, why) { fields = new Set(list); fixed = { cmd: why, line: line }; };
      /* IO-1 */
      if (first) { let m; const re = /\bindex\s*=\s*("[^"]+"|[^\s|)]+)/gi; while ((m = re.exec(t))) reads.push({ kind: "index", name: Duck.unq(m[1]), line: line }); }
      if (/^(inputlookup|inputcsv)$/.test(cmd)) { const m = /^\w+\s+(?:\w+=\S+\s+)*("[^"]+"|\S+)/i.exec(t); if (m) reads.push({ kind: "file", name: Duck.unq(m[1]), line: line }); }
      if (cmd === "lookup") { const m = /^lookup\s+(?:\w+=\S+\s+)*("[^"]+"|\S+)/i.exec(t); if (m) reads.push({ kind: "file", name: Duck.unq(m[1]), line: line }); }
      if (/^(outputlookup|outputcsv)$/.test(cmd)) { const m = /^\w+\s+(?:\w+=\S+\s+)*("[^"]+"|\S+)/i.exec(t); if (m) writes.push({ kind: "file", name: Duck.unq(m[1]), line: line }); }
      if (cmd === "collect") { const m = /\bindex\s*=\s*("[^"]+"|\S+)/i.exec(t); if (m) writes.push({ kind: "index", name: Duck.unq(m[1]), line: line }); }
      /* SPL-1 questions, then SPL-2 fields */
      if (cmd === "macro") { fields = null; fixed = null; }
      else if (cmd === "eval") Duck.split(argText, ",").forEach(function (p) { const m = /^\s*("?)([\w.]+)\1\s*=(?!=)/.exec(p.t); if (m) add(m[2]); });
      else if (cmd === "rex") { let m; const re = /\(\?<([A-Za-z_]\w*)>/g; while ((m = re.exec(t))) add(m[1]); }
      else if (cmd === "rename") Duck.split(argText, ",").forEach(function (p) {
        const m = /^\s*("[^"]+"|[\w.*]+)\s+as\s+("[^"]+"|[\w.*]+)\s*$/i.exec(p.t);
        if (!m) return;
        const a = Duck.unq(m[1]), z = Duck.unq(m[2]);
        ask(a, line, "rename");
        if (fields) fields.delete(a);
        step.removes.push(a); add(z);
      });
      else if (cmd === "table") {
        const list = Duck.fieldList(argText);
        if (list.indexOf("*") >= 0) { fields = null; fixed = null; }
        else { list.forEach(function (f) { ask(f, line, "table"); }); keep(list, "table"); }
      } else if (cmd === "fields") {
        const minus = /^\s*-/.test(argText), list = Duck.fieldList(argText.replace(/^\s*[-+]/, ""));
        if (minus) { step.removes = list; if (fields) list.forEach(function (f) { fields.delete(f); }); }
        else if (list.indexOf("*") < 0) { list.forEach(function (f) { ask(f, line, "fields"); }); keep(list, "fields"); }
      } else if (/^(where|search)$/.test(cmd) && !first) Duck.exprFields(argText).forEach(function (f) { ask(f, line, cmd); });
      else if (cmd === "dedup") Duck.fieldList(argText).forEach(function (f) { ask(f, line, "dedup"); });
      else if (cmd === "sort") Duck.fieldList(argText.replace(/\b(num|str|ip|auto)\(([^)]*)\)/g, "$2").replace(/(^|\s)[-+]/g, "$1")).filter(function (f) { return !/^\d+$/.test(f); }).forEach(function (f) { ask(f, line, "sort"); });
      else if (/^(stats|chart|timechart|top|rare|tstats|eventstats|streamstats)$/.test(cmd)) {
        let body = argText.replace(/\b(from|where)\b[\s\S]*?(?=\bby\b|$)/i, " ");
        if (cmd === "tstats") body = body.replace(/\b(summariesonly|prestats|allow_old_summaries)=\S+/gi, " ");
        const byM = /\b(by|over)\b([\s\S]*)$/i.exec(body), by = byM ? Duck.fieldList(byM[2].replace(/\bby\b/gi, " ")) : [];
        const head = byM ? body.slice(0, byM.index) : body;
        let res;
        if (cmd === "top" || cmd === "rare") { const f = Duck.fieldList(head); f.forEach(function (x) { ask(x, line, cmd); }); res = f.concat(["count", "percent"]); }
        else { const ag = Duck.aggs(head); ag.forEach(function (a) { Duck.fieldList(a.arg).forEach(function (x) { if (!/^eval\b/i.test(a.arg)) ask(x, line, cmd); }); }); res = ag.map(function (a) { return a.name; }); }
        by.forEach(function (x) { ask(x, line, cmd); });
        const out = (cmd === "timechart" ? ["_time"] : []).concat(by, res);
        if (Duck.SPL_FIX[cmd]) { step.adds = out.slice(); keep(out, cmd); }
        else out.forEach(add);
      } else if (cmd === "lookup") {
        const m = /^lookup\s+(?:\w+=\S+\s+)*\S+\s+([\s\S]*?)(?:\b(output|outputnew)\b([\s\S]*))?$/i.exec(t);
        if (m) {
          const match = m[1].trim(), am = /^(\S+)\s+as\s+(\S+)/i.exec(match);
          if (match) ask(am ? Duck.unq(am[2]) : Duck.fieldList(match)[0], line, "lookup");
          if (m[2]) Duck.split(m[3], ",").forEach(function (p) { const o = /("[^"]+"|[\w.]+)(?:\s+as\s+("[^"]+"|[\w.]+))?/i.exec(p.t); if (o) add(Duck.unq(o[2] || o[1])); });
          else { fields = null; fixed = null; }
        }
      } else if (Duck.SPL_OPEN[cmd]) { fields = null; fixed = null; }
      step.fields = fields === null ? null : Array.from(fields);
      steps.push(step);
      first = false;
    });
    return { steps: steps, questions: questions, reads: reads, writes: writes, symbols: [] };
  },

  /* ---- LS-1, LS-2, IO-1 ---- */
  LS_BUILTIN: /^(message|@timestamp|@version|host|path|type|tags|event\.original|log\.file\.path|@metadata(\..*)?)$/,
  lsField(s) { return Duck.unq(s).replace(/^\[|\]$/g, "").replace(/\]\[/g, "."); },
  logstash(b) {
    /* one frame per open brace: a section, a plugin (its body collected until its brace closes), or anything else */
    const steps = [], questions = [], reads = [], writes = [], made = new Set(), stack = [];
    let section = "filter";
    b.lines.forEach(function (raw, k) {
      const line = b.base + k, code = raw.replace(/(^|\s)#.*$/, ""), l = code.replace(/"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/g, function (q) { return q.replace(/[{}]/g, " "); });
      const plugin = stack.filter(function (f) { return f.t === "plugin"; })[0];
      if (plugin) plugin.p.body.push({ text: code, line: line });
      let m;
      for (let i = 0; i < l.length; i++) {
        const c = l.charAt(i);
        if (c === "{") {
          const before = l.slice(0, i), word = before.slice(Math.max(before.lastIndexOf("{"), before.lastIndexOf("}")) + 1), inPlugin = stack.some(function (f) { return f.t === "plugin"; }), up = stack.length ? stack[stack.length - 1] : null;
          if (!stack.length && (m = /(input|filter|output)\s*$/.exec(before))) { section = m[1]; stack.push({ t: "section" }); }
          else if (!inPlugin && up && (up.t === "section" || up.t === "cond") && (m = /^\s*([A-Za-z_][\w-]*)\s*$/.exec(word)) && !/^(if|else)$/.test(m[1])) {
            const p = { line: line, cmd: m[1], section: section, body: [] };
            if (code.slice(i + 1).trim()) p.body.push({ text: code.slice(i + 1), line: line });
            stack.push({ t: "plugin", p: p });
          } else stack.push({ t: /\b(if|else)\b/.test(word) ? "cond" : "hash" });
        } else if (c === "}") {
          const f = stack.pop();
          if (f && f.t === "plugin") Duck.lsPlugin(f.p, steps, questions, reads, writes, made);
        }
      }
    });
    stack.forEach(function (f) { if (f.t === "plugin") Duck.lsPlugin(f.p, steps, questions, reads, writes, made); });
    return { steps: steps, questions: questions, reads: reads, writes: writes, symbols: [] };
  },
  lsPlugin(p, steps, questions, reads, writes, made) {
    if (p.done) return;
    p.done = true;
    const body = p.body.map(function (x) { return x.text; }).join("\n"), lineOf = function (re) { const h = p.body.filter(function (x) { return re.test(x.text); })[0]; return h ? h.line : p.line; };
    const step = { line: p.line, cmd: p.cmd, kind: p.section === "input" ? "source" : p.section === "output" ? "output" : p.cmd === "drop" ? "filter" : "transform", text: p.cmd, adds: [], removes: [], fields: null };
    const add = function (f) { f = Duck.lsField(f); if (step.adds.indexOf(f) < 0) step.adds.push(f); made.add(f); };
    const need = function (f, re) {
      f = Duck.lsField(f);
      if (!f || made.has(f) || Duck.LS_BUILTIN.test(f) || /^@metadata\./.test(f)) return;
      questions.push({ rule: "LS-1", line: lineOf(re), field: f, text: "The " + p.cmd + " reads “" + f + "”, but nothing above creates it." });
    };
    let m;
    if (p.section === "filter") {
      const src = /\b(source|field)\s*=>\s*("[^"]+"|'[^']+'|\S+)/.exec(body);
      if (src && p.cmd !== "mutate") need(src[2], /\b(source|field)\s*=>/);
      if (p.cmd === "date" && (m = /\bmatch\s*=>\s*\[\s*("[^"]+"|'[^']+')/.exec(body))) need(m[1], /\bmatch\s*=>/);
      if ((m = /\brename\s*=>\s*\{([^}]*)\}/.exec(body))) {
        let r; const re = /("[^"]+"|'[^']+')\s*=>\s*("[^"]+"|'[^']+')/g;
        while ((r = re.exec(m[1]))) { need(r[1], /\brename\s*=>/); step.removes.push(Duck.lsField(r[1])); made.delete(Duck.lsField(r[1])); add(r[2]); }
      }
      const re2 = /%\{\w+:([\w@.\[\]]+)(?::\w+)?\}/g;
      while ((m = re2.exec(body))) add(m[1]);
      if ((m = /\badd_field\s*=>\s*(\{[^}]*\}|\[[^\]]*\])/.exec(body))) {
        if (m[1].charAt(0) === "{") { let r; const re = /("[^"]+"|'[^']+')\s*=>/g; while ((r = re.exec(m[1]))) add(r[1]); }
        else { const items = m[1].slice(1, -1).split(","); for (let i = 0; i < items.length; i += 2) add(items[i]); }
      }
      if ((m = /\bremove_field\s*=>\s*(\[[^\]]*\]|"[^"]+")/.exec(body))) m[1].replace(/[[\]]/g, "").split(",").forEach(function (f) { f = Duck.lsField(f); if (f) { step.removes.push(f); made.delete(f); } });
      if ((m = /\btarget\s*=>\s*("[^"]+"|'[^']+'|\S+)/.exec(body))) add(m[1]);
      if (p.cmd === "date") add("@timestamp");
    }
    const idx = /\bindex\s*=>\s*("[^"]+"|'[^']+')/.exec(body), path = /\bpath\s*=>\s*(\[\s*)?("[^"]+"|'[^']+')/.exec(body);
    const io = function (list) {
      if (idx) list.push({ kind: "index", name: Duck.unq(idx[1]).replace(/%\{\+?[^}]+\}/g, "*"), line: p.line });
      else if (path) list.push({ kind: "file", name: Duck.unq(path[2]), line: p.line });
    };
    if (p.section === "input") io(reads); else if (p.section === "output") io(writes);
    step.text = p.cmd + (idx ? " index " + Duck.unq(idx[1]) : path ? " " + Duck.unq(path[2]) : "");
    steps.push(step);
  },

  /* ---- SQL-1, SQL-2, IO-1 ---- */
  SQL_AGG: /\b(count|sum|avg|min|max|string_agg|array_agg|group_concat|listagg|stddev|stddev_pop|stddev_samp|variance|var_pop|var_samp)\s*\(/i,
  norm(s) { return String(s).replace(/\s+/g, " ").replace(/\s*([(),.])\s*/g, "$1").trim().toLowerCase(); },
  /* the clause between `from` and the first of `to` (outside parentheses) */
  clause(s, from, to) {
    const low = s.toLowerCase(), re = new RegExp("\\b" + from + "\\b", "i");
    let depth = 0, start = -1;
    for (let i = 0; i < s.length; i++) {
      const c = s.charAt(i);
      if (c === "(") depth++; else if (c === ")") depth--;
      if (depth !== 0) continue;
      if (start < 0) { if (re.test(low.slice(i, i + from.length + 1)) && (i === 0 || /\W/.test(low.charAt(i - 1))) && low.slice(i, i + from.length) === from.replace(/\\s\+/g, " ")) start = i + from.length; continue; }
      for (let k = 0; k < to.length; k++) if (low.slice(i, i + to[k].length) === to[k] && /\W/.test(low.charAt(i - 1) || " ") && /\W/.test(low.charAt(i + to[k].length) || " ")) return s.slice(start, i);
    }
    return start < 0 ? null : s.slice(start);
  },
  sqlQuery(q, line, name, text) {
    const select = Duck.clause(q.replace(/\bgroup\s+by\b/gi, "group by").replace(/\border\s+by\b/gi, "order by"), "select", ["from", "where", "group by", "having", "order by", "limit", "union"]);
    const Q = q.replace(/\bgroup\s+by\b/gi, "group by").replace(/\border\s+by\b/gi, "order by");
    const where = Duck.clause(Q, "where", ["group by", "having", "order by", "limit", "union"]), group = Duck.clause(Q, "group by", ["having", "order by", "limit", "union"]);
    const having = Duck.clause(Q, "having", ["order by", "limit", "union"]), order = Duck.clause(Q, "order by", ["limit", "union"]), lim = /\blimit\s+(\d+)|\btop\s+(\d+)/i.exec(Q);
    const reads = [], writes = [], questions = [];
    let m;
    const re = /\b(from|join)\s+([A-Za-z_][\w.]*)/gi;
    while ((m = re.exec(Q))) if (!/^(select|lateral|unnest)$/i.test(m[2]) && !reads.some(function (r) { return r.name === m[2].toLowerCase(); })) reads.push({ kind: "table", name: m[2].toLowerCase(), line: line });
    const wre = /\b(insert\s+into|create\s+table(?:\s+if\s+not\s+exists)?|update|delete\s+from|merge\s+into)\s+([A-Za-z_][\w.]*)/gi;
    while ((m = wre.exec(Q))) writes.push({ kind: "table", name: m[2].toLowerCase(), line: line });
    const items = select ? Duck.split(select, ",").map(function (p) { return p.t.trim(); }).filter(Boolean) : [];
    const cols = items.map(function (it) { const a = /^([\s\S]*?)\s+(?:as\s+)?("?[A-Za-z_]\w*"?)$/i.exec(it); return a && !/^\s*distinct\s*$/i.test(a[1]) && !/[*/+-]\s*$/.test(a[1]) ? { expr: a[1].trim(), alias: Duck.unq(a[2]).toLowerCase() } : { expr: it, alias: null }; });
    if (group) {
      const g = Duck.split(group, ",").map(function (p) { return Duck.norm(p.t); }).filter(Boolean);
      const bare = function (s) { return s.replace(/^[\w"]+\./, ""); };
      cols.forEach(function (c) {
        const e = Duck.norm(c.expr.replace(/^distinct\s+/i, ""));
        if (!e || Duck.SQL_AGG.test(e) || e === "*" || /^[\w"]+\.\*$/.test(e) || /^('.*'|\d+(\.\d+)?|null|true|false)$/.test(e)) return;
        if (g.indexOf(e) >= 0 || (c.alias && g.indexOf(c.alias) >= 0) || g.some(function (x) { return bare(x) === bare(e); })) return;
        if (!/^[\w"]+(\.[\w"]+)?$/.test(e)) return;                       /* an expression not grouped as written: can't be sure */
        questions.push({ rule: "SQL-1", line: line, field: c.expr, text: "“" + c.expr + "” is returned but neither grouped nor aggregated" + (name ? " (in " + name + ")" : "") + ": which row's value should it show?" });
      });
    }
    const parts = [];
    if (reads.length) parts.push("reads " + reads.map(function (r) { return r.name; }).join(", "));
    if (where) parts.push("keeps rows where " + Duck.short(where, 50));
    if (group) parts.push("groups by " + Duck.short(group, 40));
    if (having) parts.push("keeps groups where " + Duck.short(having, 40));
    if (cols.length) parts.push("returns " + Duck.short(cols.map(function (c) { return c.alias || c.expr; }).join(", "), 60));
    if (order) parts.push("sorted by " + Duck.short(order, 30));
    if (lim) parts.push("first " + (lim[1] || lim[2]));
    return { step: { line: line, cmd: name || (writes.length ? "write" : "query"), kind: writes.length ? "output" : group ? "aggregate" : reads.length ? "transform" : "source",
      text: parts.join(", ") || Duck.short(text), adds: [], removes: [], fields: cols.length && !cols.some(function (c) { return /\*/.test(c.expr); }) ? cols.map(function (c) { return c.alias || c.expr.replace(/^[\w"]+\./, ""); }) : null },
      reads: reads, writes: writes, questions: questions };
  },
  sql(b) {
    const raw = b.lines.join("\n"), text = raw.replace(/--[^\n]*/g, function (c) { return c.replace(/./g, " "); }).replace(/\/\*[\s\S]*?\*\//g, function (c) { return c.replace(/[^\n]/g, " "); });
    const out = { steps: [], questions: [], reads: [], writes: [], symbols: [] }, ctes = [];
    let rest = text, off = 0;
    const w = /^\s*with\s+(recursive\s+)?/i.exec(text);
    if (w) {
      off = w[0].length;
      for (;;) {
        const m = /^\s*,?\s*([A-Za-z_]\w*)\s*(\([^)]*\))?\s+as\s*\(/i.exec(text.slice(off));
        if (!m) break;
        const open = off + m[0].length;
        let depth = 1, i = open;
        for (; i < text.length && depth; i++) { const c = text.charAt(i); if (c === "(") depth++; else if (c === ")") depth--; }
        ctes.push({ name: m[1], body: text.slice(open, i - 1), at: off + m[0].indexOf(m[1]) });
        off = i;
      }
      rest = text.slice(off);
    }
    const local = new Set(ctes.map(function (c) { return c.name.toLowerCase(); }));
    const take = function (r) {
      out.steps.push(r.step); out.questions = out.questions.concat(r.questions);
      r.reads.forEach(function (x) { if (!local.has(x.name)) out.reads.push(x); });
      out.writes = out.writes.concat(r.writes);
    };
    ctes.forEach(function (c) {
      const line = Duck.lineAt(text, c.at, b.base);
      take(Duck.sqlQuery(c.body, line, c.name, c.body));
      out.symbols.push({ kind: "sql step", name: c.name, line: line });
    });
    Duck.split(rest, ";").forEach(function (st) {
      if (!st.t.trim()) return;
      const line = Duck.lineAt(text, off + st.at + (st.t.length - st.t.replace(/^\s+/, "").length), b.base);
      take(Duck.sqlQuery(st.t, line, "", st.t));
    });
    return out;
  },

  /* ---- PY-1, PY-2, UNUSED-1 (Python), IO-1 ---- */
  /* the text with comments gone and plain string contents blanked (f-strings, template literals and
     double quotes in shell/PowerShell keep theirs: what's inside them is code) */
  codeOnly(text, lang) {
    let out = "", i = 0;
    while (i < text.length) {
      const c = text.charAt(i), nx = text.charAt(i + 1);
      if ((lang === "python" || lang === "shell" || lang === "powershell") && c === "#" && !(lang === "shell" && /[\w$]/.test(text.charAt(i - 1) || ""))) { while (i < text.length && text.charAt(i) !== "\n") { out += " "; i++; } continue; }
      if (lang === "js" && c === "/" && nx === "/") { while (i < text.length && text.charAt(i) !== "\n") { out += " "; i++; } continue; }
      if (lang === "js" && c === "/" && nx === "*") { const e = text.indexOf("*/", i + 2); const j = e < 0 ? text.length : e + 2; out += text.slice(i, j).replace(/[^\n]/g, " "); i = j; continue; }
      if (c === '"' || c === "'" || (c === "`" && lang === "js")) {
        const keep = (lang === "python" && /[fF]/.test(text.charAt(i - 1) || "")) || (c === "`" && lang === "js") || (c === '"' && (lang === "shell" || lang === "powershell"));
        let j = i + 1;
        while (j < text.length && text.charAt(j) !== c && text.charAt(j) !== "\n") { if (text.charAt(j) === "\\") j++; j++; }
        out += c + (keep ? text.slice(i + 1, j) : text.slice(i + 1, j).replace(/[^\n]/g, " ")) + (j < text.length ? text.charAt(j) : "");
        i = j + 1; continue;
      }
      out += c; i++;
    }
    return out;
  },
  /* UNUSED-1: names set (with their line) and never read again in this block */
  unused(code, sets, useRe) {
    return sets.filter(function (s) {
      let n = 0, m;
      const re = useRe(s.name);
      while ((m = re.exec(code))) { if (m.index >= s.at + s.len || m.index + m[0].length <= s.at) n++; }   /* a match overlapping the name being set is that name, not a use */
      return n === 0;
    });
  },
  esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); },
  python(b) {
    const text = b.lines.join("\n"), code = Duck.codeOnly(text, "python"), symbols = [], steps = [], reads = [], writes = [], sets = [];
    let m;
    const at = function (i) { return Duck.lineAt(text, i, b.base); };
    let re = /^([ \t]*)def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/gm;
    while ((m = re.exec(code))) symbols.push({ kind: "function", name: m[2] + "(" + m[3].replace(/\s+/g, " ").trim() + ")", line: at(m.index) });
    re = /^[ \t]*class\s+([A-Za-z_]\w*)/gm;
    while ((m = re.exec(code))) symbols.push({ kind: "class", name: m[1], line: at(m.index) });
    re = /^[ \t]*(?:import\s+([\w., ]+?)(?:\s+as\s+\w+)?|from\s+([\w.]+)\s+import\s+([\w., ()*]+))\s*$/gm;
    while ((m = re.exec(code))) symbols.push({ kind: "import", name: m[1] ? m[1].trim() : m[2] + ": " + m[3].replace(/[()\s]+/g, " ").trim(), line: at(m.index) });
    re = /^([A-Za-z_]\w*)\s*(?::[^=\n]+)?=(?!=)/gm;
    while ((m = re.exec(code))) {
      const name = m[1];
      if (!sets.some(function (s) { return s.name === name; })) sets.push({ name: name, at: m.index, len: name.length, line: at(m.index) });
    }
    const unused = Duck.unused(code, sets.filter(function (s) { return s.name.charAt(0) !== "_" && s.name !== s.name.toUpperCase(); }), function (n) { return new RegExp("(^|[^\\w.])" + Duck.esc(n) + "(?!\\w)", "g"); });
    sets.forEach(function (s) { symbols.push({ kind: "variable", name: s.name, line: s.line, unused: unused.indexOf(s) >= 0 }); });
    const questions = unused.map(function (s) { return { rule: "UNUSED-1", line: s.line, field: s.name, text: "“" + s.name + "” is set here but never used." }; });
    /* PY-2: pandas, in the order the methods appear */
    const KIND = { query: "filter", dropna: "filter", drop_duplicates: "filter", head: "filter", loc: "filter",
      assign: "transform", rename: "transform", astype: "transform", fillna: "transform", apply: "transform", map: "transform", sort_values: "transform", reset_index: "transform", set_index: "transform",
      groupby: "aggregate", agg: "aggregate", sum: "aggregate", mean: "aggregate", count: "aggregate", size: "aggregate", pivot_table: "aggregate", resample: "aggregate",
      merge: "join", join: "join", concat: "join", drop: "transform" };
    if (/\bpd\.(read_\w+|DataFrame)\s*\(/.test(code)) {
      re = /\bpd\.(read_\w+|DataFrame|concat)\s*\(|\.(loc)\s*\[|\.([a-z_]+)\s*\(/g;
      while ((m = re.exec(code))) {
        const name = m[1] || m[2] || m[3], kind = /^(read_\w+|DataFrame)$/.test(name) ? "source" : /^to_/.test(name) ? "output" : KIND[name];
        if (!kind) continue;
        const args = Duck.callArgs(text, m.index + m[0].length - 1), step = { line: at(m.index), cmd: name, kind: kind, text: Duck.short(name + "(" + args + ")", 80), adds: [], removes: [], fields: null };
        if (name === "assign") Duck.split(args, ",").forEach(function (p) { const a = /^\s*([A-Za-z_]\w*)\s*=/.exec(p.t); if (a) step.adds.push(a[1]); });
        if (name === "rename") { let r; const rr = /["']([^"']+)["']\s*:\s*["']([^"']+)["']/g; while ((r = rr.exec(args))) { step.removes.push(r[1]); step.adds.push(r[2]); } }
        if (name === "drop" && /columns\s*=/.test(args)) { let r; const rr = /["']([^"']+)["']/g; while ((r = rr.exec(args.replace(/^[\s\S]*?columns\s*=/, "")))) step.removes.push(r[1]); }
        steps.push(step);
      }
    }
    re = /\b(?:pd\.)?read_\w+\s*\(\s*(?:r|f)?["']([^"']+)["']/g;
    while ((m = re.exec(text))) reads.push({ kind: "file", name: m[1], line: at(m.index) });
    re = /\bopen\s*\(\s*(?:r|f)?["']([^"']+)["']\s*(?:,\s*["']([rwaxb+t]+)["'])?/g;
    while ((m = re.exec(text))) (m[2] && /[wax]/.test(m[2]) ? writes : reads).push({ kind: "file", name: m[1], line: at(m.index) });
    re = /\.to_(?!sql)\w+\s*\(\s*(?:r|f)?["']([^"']+)["']/g;
    while ((m = re.exec(text))) writes.push({ kind: "file", name: m[1], line: at(m.index) });
    re = /\.to_sql\s*\(\s*["']([^"']+)["']/g;
    while ((m = re.exec(text))) writes.push({ kind: "table", name: m[1].toLowerCase(), line: at(m.index) });
    return { steps: steps, questions: questions, reads: reads, writes: writes, symbols: symbols };
  },
  callArgs(text, openAt) { let depth = 0, i = openAt; for (; i < text.length; i++) { const c = text.charAt(i); if (c === "(" || c === "[") depth++; else if (c === ")" || c === "]") { depth--; if (!depth) break; } } return text.slice(openAt + 1, i); },

  /* ---- JS-1, JS-2, UNUSED-1 (JS), IO-1 ---- */
  js(b) {
    const text = b.lines.join("\n"), code = Duck.codeOnly(text, "js"), symbols = [], steps = [], reads = [], writes = [], sets = [];
    const at = function (i) { return Duck.lineAt(text, i, b.base); };
    let m, re = /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
    while ((m = re.exec(code))) symbols.push({ kind: "function", name: m[1] + "(" + m[2].trim() + ")", line: at(m.index) });
    re = /\bclass\s+([A-Za-z_$][\w$]*)/g;
    while ((m = re.exec(code))) symbols.push({ kind: "class", name: m[1], line: at(m.index) });
    re = /^[ \t]*import\s+([\s\S]*?)\s+from\s+["'`]([^"'`]+)/gm;
    while ((m = re.exec(text))) symbols.push({ kind: "import", name: m[2] + ": " + m[1].replace(/\s+/g, " "), line: at(m.index) });
    re = /\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/g;
    while ((m = re.exec(code))) {
      const v = m[3], kind = /=>|^\s*(async\s+)?function\b/.test(v) ? "function" : /\brequire\s*\(/.test(v) ? "import" : "variable";
      const nameAt = m.index + m[0].indexOf(m[2], m[1].length);
      symbols.push({ kind: kind, name: kind === "import" ? m[2] + ": " + (/require\s*\(\s*["'`]([^"'`]+)/.exec(text.slice(m.index, m.index + m[0].length + 80)) || ["", ""])[1] : m[2], line: at(m.index), v: m[2] });
      sets.push({ name: m[2], at: nameAt, len: m[2].length, line: at(m.index) });
    }
    const unused = Duck.unused(code, sets.filter(function (s) { return s.name.charAt(0) !== "_" && s.name !== s.name.toUpperCase(); }), function (n) { return new RegExp("(^|[^\\w$.])" + Duck.esc(n) + "(?![\\w$])", "g"); });
    symbols.forEach(function (s) { if (s.v && unused.some(function (u) { return u.name === s.v && u.line === s.line; })) s.unused = true; delete s.v; });
    const questions = unused.map(function (s) { return { rule: "UNUSED-1", line: s.line, field: s.name, text: "“" + s.name + "” is set here but never used." }; });
    const KIND = { filter: "filter", find: "filter", slice: "filter", map: "transform", flatMap: "transform", sort: "transform", toSorted: "transform", reduce: "aggregate", some: "aggregate", every: "aggregate", groupBy: "aggregate", forEach: "output" };
    re = /\.(filter|find|slice|map|flatMap|sort|toSorted|reduce|some|every|groupBy|forEach)\s*\(/g;
    while ((m = re.exec(code))) steps.push({ line: at(m.index), cmd: m[1], kind: KIND[m[1]], text: Duck.short(m[1] + "(" + Duck.callArgs(text, m.index + m[0].length - 1) + ")", 80), adds: [], removes: [], fields: null });
    if (steps.length) steps[0] = Object.assign({}, steps[0]);
    re = /\breadFile(?:Sync)?\s*\(\s*["'`]([^"'`]+)/g;
    while ((m = re.exec(text))) reads.push({ kind: "file", name: m[1], line: at(m.index) });
    re = /\bwriteFile(?:Sync)?\s*\(\s*["'`]([^"'`]+)/g;
    while ((m = re.exec(text))) writes.push({ kind: "file", name: m[1], line: at(m.index) });
    return { steps: steps, questions: questions, reads: reads, writes: writes, symbols: symbols };
  },

  /* ---- PIPE-1, PIPE-2, UNUSED-1 (shell, PowerShell), IO-1 ---- */
  pipes(b, lang) {
    const text = b.lines.join("\n"), ps = lang === "powershell", code = Duck.codeOnly(text, lang), symbols = [], reads = [], writes = [], sets = [];
    const at = function (i) { return Duck.lineAt(text, i, b.base); };
    let m, re;
    if (ps) {
      re = /^[ \t]*function\s+([\w-]+)/gim;
      while ((m = re.exec(code))) symbols.push({ kind: "function", name: m[1], line: at(m.index) });
      re = /(^|[\s;(])\$([A-Za-z_]\w*)\s*=(?!=)/gm;
      while ((m = re.exec(code))) { const nm = m[2], p = m.index + m[1].length + 1; if (!sets.some(function (s) { return s.name.toLowerCase() === nm.toLowerCase(); })) sets.push({ name: nm, at: p, len: nm.length, line: at(p) }); }
    } else {
      re = /^[ \t]*(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{/gm;
      while ((m = re.exec(code))) symbols.push({ kind: "function", name: m[1], line: at(m.index) });
      re = /^([ \t]*)((?:export|readonly|local|declare)\s+)?([A-Za-z_]\w*)=/gm;
      while ((m = re.exec(code))) { const nm = m[3], p = m.index + m[0].indexOf(nm, m[1].length + (m[2] || "").length); if (!sets.some(function (s) { return s.name === nm; })) sets.push({ name: nm, at: p, len: nm.length, line: at(m.index), exported: !!m[2] && /export|readonly/.test(m[2]) }); }
    }
    const check = sets.filter(function (s) { return !s.exported && s.name.charAt(0) !== "_" && s.name !== s.name.toUpperCase(); });
    const unused = Duck.unused(code, check, ps ? function (n) { return new RegExp("\\$\\{?" + Duck.esc(n) + "(?!\\w)", "gi"); } : function (n) { return new RegExp("\\$\\{?" + Duck.esc(n) + "(?!\\w)", "g"); });
    sets.forEach(function (s) { symbols.push({ kind: "variable", name: (ps ? "$" : "") + s.name, line: s.line, unused: unused.indexOf(s) >= 0 }); });
    const questions = unused.map(function (s) { return { rule: "UNUSED-1", line: s.line, field: s.name, text: "“" + (ps ? "$" : "") + s.name + "” is set here but never used." }; });
    /* PIPE-1: the longest pipe line, continued lines joined */
    const joined = [], cont = ps ? /`\s*$/ : /\\\s*$/;
    let buf = null;
    b.lines.forEach(function (l, k) {
      if (buf) { buf.t += " " + l.replace(cont, "").trim(); } else buf = { t: l.replace(cont, ""), line: b.base + k };
      if (!cont.test(l)) { joined.push(buf); buf = null; }
    });
    if (buf) joined.push(buf);
    const best = joined.map(function (j) { return { j: j, parts: Duck.split(j.t.replace(/\s#.*$/, ""), "|").filter(function (p) { return p.t.trim(); }) }; })
      .filter(function (x) { return x.parts.length > 1; }).sort(function (a, z) { return z.parts.length - a.parts.length; })[0];
    const steps = [];
    if (best) best.parts.forEach(function (p, i) {
      const t = p.t.trim(), cmd = (/^([\w.-]+)/.exec(t) || ["", t])[1], lc = cmd.toLowerCase();
      let kind = i === 0 ? "source" : "transform";
      if (i > 0) {
        if (/^(grep|egrep|fgrep|rg|head|tail|where-object|where|\?)$/i.test(cmd) || (/^select-object$/i.test(cmd) && /-(first|last)\b/i.test(t))) kind = "filter";
        else if ((/^uniq$/.test(lc) && /-c\b/.test(t)) || /^(wc|group-object|measure-object)$/i.test(cmd)) kind = "aggregate";
        else if (/^(cut|select-object|select)$/i.test(cmd)) kind = "reshape";
        else if (/^(tee|export-csv|out-file|set-content|add-content)$/i.test(cmd)) kind = "output";
      }
      steps.push({ line: best.j.line, cmd: cmd, kind: kind, text: Duck.short(t, 80), adds: [], removes: [], fields: null });
    });
    if (steps.length && />>?\s*\S+\s*$/.test(best.parts[best.parts.length - 1].t) && !ps) steps[steps.length - 1].kind = "output";
    /* IO-1 */
    if (ps) {
      re = /\b(Import-Csv|Get-Content)\s+(?:-Path\s+)?["']?([^"'\s|]+)/gi;
      while ((m = re.exec(text))) reads.push({ kind: "file", name: m[2], line: at(m.index) });
      re = /\b(Export-Csv|Out-File|Set-Content|Add-Content)\s+(?:-(?:Path|FilePath)\s+)?["']?([^"'\s|]+)/gi;
      while ((m = re.exec(text))) writes.push({ kind: "file", name: m[2], line: at(m.index) });
    } else {
      re = /(?:\bcat\s+|<\s*)["']?([^\s"'|<>;&]+)/g;
      while ((m = re.exec(code))) reads.push({ kind: "file", name: m[1], line: at(m.index) });
      re = /(?:>>?|\btee\s+(?:-a\s+)?)\s*["']?([^\s"'|<>;&]+)/g;
      while ((m = re.exec(code))) if (!/^&?\d$|^\/dev\//.test(m[1])) writes.push({ kind: "file", name: m[1], line: at(m.index) });
    }
    return { steps: steps, questions: questions, reads: reads, writes: writes, symbols: symbols };
  },

  /* ---- SUM-1 ---- */
  summary(lang, nLines, r) {
    const count = function (k, one, many) { const n = r.symbols.filter(function (s) { return s.kind === k; }).length; return n ? n + " " + (n === 1 ? one : many) : null; };
    const defs = [count("function", "function", "functions"), count("class", "class", "classes"), count("variable", "variable", "variables"), count("import", "import", "imports"), count("sql step", "SQL step", "SQL steps")].filter(Boolean);
    let s = Duck.NAMES[lang] + ", " + nLines + (nLines === 1 ? " line" : " lines") + (defs.length ? ": " + defs.join(", ") : "") + ".";
    if (r.steps.length > 1) {
      const last = r.steps[r.steps.length - 1], f = last.fields;
      s += " A " + r.steps.length + "-step pipeline from " + r.steps[0].cmd + " to " + last.cmd + (f && f.length ? ", ending with " + f.slice(0, 6).join(", ") + (f.length > 6 ? ", …" : "") : "") + ".";
    }
    return s;
  },

  /* ---- the whole note: every block read, and FLOW-1 between them ---- */
  read(b) {
    const text = b.lines.join("\n"), lang = Duck.lang(b.fence, text);
    if (!lang) return null;
    const r = lang === "spl" ? Duck.spl(b) : lang === "logstash" ? Duck.logstash(b) : lang === "sql" ? Duck.sql(b) : lang === "python" ? Duck.python(b) : lang === "js" ? Duck.js(b) : Duck.pipes(b, lang);
    r.lang = lang; r.start = b.start; r.base = b.base; r.end = b.base + b.lines.length;
    r.summary = Duck.summary(lang, b.lines.length, r);
    return r;
  },
  /* FLOW-1: A feeds B when A writes something of the same kind that B reads (files by file name, lookups
     matching their .csv; an index written with %{+date} becomes a wildcard) */
  same(kind, w, r) {
    if (kind === "file") { const a = Duck.base(w).replace(/\.csv$/, ""), z = Duck.base(r).replace(/\.csv$/, ""); return a === z; }
    const rx = function (s) { return new RegExp("^" + s.toLowerCase().split("*").map(Duck.esc).join(".*") + "$"); };
    return rx(w).test(r.toLowerCase()) || rx(r).test(w.toLowerCase());
  },
  analyze(lines) {
    const blocks = Duck.blocks(lines).map(Duck.read).filter(Boolean), links = [];
    blocks.forEach(function (a, i) {
      blocks.forEach(function (z, j) {
        if (i === j) return;
        const hit = a.writes.filter(function (w) { return z.reads.some(function (r) { return r.kind === w.kind && Duck.same(w.kind, w.name, r.name); }); })[0];
        if (hit && !links.some(function (l) { return l.from === i && l.to === j; })) links.push({ from: i, to: j, kind: hit.kind, name: hit.name });
      });
    });
    /* links that follow on from each other, as chains */
    const chains = [], used = new Set();
    links.forEach(function (l) {
      if (links.some(function (x) { return x.to === l.from; }) || used.has(l)) return;
      const chain = [l.from];
      let cur = l;
      while (cur && chain.indexOf(cur.to) < 0) { chain.push(cur.to); used.add(cur); const c2 = cur; cur = links.filter(function (x) { return x.from === c2.to && !used.has(x); })[0]; }
      chains.push(chain);
    });
    return { blocks: blocks, links: links, chains: chains };
  },

  /* ---- K and the field chips: where a name comes from and where it goes ---- */
  explain(r, word) {
    if (!r || !word) return "";
    const w = word.replace(/^\$/, "");
    const def = r.symbols.filter(function (s) { return s.name.replace(/\(.*$/, "").replace(/^\$/, "").split(":")[0] === w; })[0];
    if (def) return w + ": " + def.kind + ", line " + (def.line + 1) + (def.unused ? " (never used)" : "") + ".";
    const made = r.steps.filter(function (s) { return s.adds.indexOf(w) >= 0; })[0], gone = r.steps.filter(function (s, i) { return s.fields && s.fields.indexOf(w) < 0 && i > (made ? r.steps.indexOf(made) : -1) && (i === 0 || !r.steps[i - 1].fields || r.steps[i - 1].fields.indexOf(w) >= 0 || !made); })[0];
    if (!made && !gone) return "";
    return w + ": " + (made ? "created by the " + made.cmd + " on line " + (made.line + 1) : "comes from the source") + (gone ? ", gone after the " + gone.cmd + " on line " + (gone.line + 1) : ", still there at the end") + ".";
  },
  /* gd: the line where a word is defined (a symbol, a field created by a step, a SQL step) */
  defLine(r, word) {
    const w = String(word || "").replace(/^\$/, "");
    const def = r && r.symbols.filter(function (s) { return s.name.replace(/\(.*$/, "").replace(/^\$/, "").split(":")[0] === w; })[0];
    if (def) return def.line;
    const made = r && r.steps.filter(function (s) { return s.adds.indexOf(w) >= 0; })[0];
    return made ? made.line : -1;
  },

  /* ============ the panel (Live mode, panes 520px or wider) ============ */
  KEY: "carbonfibre-duck",
  on: false,
  MIN: 520,
  toggle() {
    Duck.on = !Duck.on;
    storeSet(Duck.KEY, Duck.on ? "1" : "0");
    panes.forEach(function (p) { Duck.changed(p, true); });
    pushToastLike(Duck.on ? "Rubber ducky on: the panel explains the code blocks beside the note." : "Rubber ducky off.");
  },
  /* the analysis for a pane, cached on its lines */
  of(p) {
    const key = p.lines.join("\n");
    if (!p.duckA || p.duckKey !== key) { p.duckA = Duck.analyze(p.lines); p.duckKey = key; }
    return p.duckA;
  },
  blockAt(a, l) { return a.blocks.filter(function (b) { return l >= b.start && l <= b.end; })[0] || null; },
  /* the note changed (or was opened, or the mode changed): redraw, debounced while typing */
  changed(p, now) {
    clearTimeout(p.duckT);
    if (now) Duck.draw(p); else p.duckT = setTimeout(function () { Duck.draw(p); }, 250);
  },
  /* the caret moved: only the highlight, once per frame and a little after (so holding j stays smooth) */
  cursor(p) {
    if (!Duck.on || !p.duckEl || p.duckEl.hidden) return;
    clearTimeout(p.duckC);
    p.duckC = setTimeout(function () { Duck.mark(p); }, 60);
  },
  shown(p) { return Duck.on && p.type === "note" && p.mode === "live" && !!p.note() && p.root.clientWidth >= Duck.MIN; },
  el(p) {
    if (p.duckEl) return p.duckEl;
    const el = document.createElement("aside");
    el.className = "duck"; el.setAttribute("aria-label", "Rubber duck: what the code in this note does");
    p.root.appendChild(el);
    p.duckEl = el;
    el.addEventListener("mousedown", function (e) { if (e.target.closest("[data-line]")) e.preventDefault(); });   /* keep the editor's focus */
    el.addEventListener("click", function (e) {
      if (e.target.closest(".duck-x")) { Duck.toggle(); return; }
      const t = e.target.closest("[data-line]");
      if (t) Duck.jump(p, +t.dataset.line);
    });
    el.addEventListener("mouseover", function (e) { const t = e.target.closest("[data-line]"); Duck.hl(p, t ? +t.dataset.line : -1); });
    el.addEventListener("mouseleave", function () { Duck.hl(p, -1); });
    if (window.ResizeObserver) new ResizeObserver(function () { Duck.place(p); }).observe(p.root);
    return el;
  },
  /* sits over the right of the editor, which makes room for it */
  place(p) {
    const el = p.duckEl;
    if (!el) return;
    const show = Duck.shown(p);
    if (el.hidden === show) { el.hidden = !show; p.root.classList.toggle("duck-on", show); if (show) Duck.draw(p); }
    if (!show) return;
    el.style.top = p.editorEl.offsetTop + "px";
    el.style.height = p.editorEl.offsetHeight + "px";
  },
  hl(p, l) {
    const old = p.linesEl.querySelector(".duck-hl");
    if (old) old.classList.remove("duck-hl");
    if (l >= 0 && p.linesEl.children[l]) p.linesEl.children[l].classList.add("duck-hl");
  },
  draw(p) {
    if (!Duck.on && !p.duckEl) return;
    const el = Duck.el(p);
    Duck.place(p);
    if (!Duck.shown(p)) { el.hidden = true; p.root.classList.remove("duck-on"); return; }
    el.hidden = false; p.root.classList.add("duck-on");
    const a = Duck.of(p), l = p.activeLine == null ? -1 : p.activeLine, cur = Duck.blockAt(a, l) || a.blocks[0];
    p.duckCur = cur;
    const L = function (n) { return ' data-line="' + n + '"'; };
    const chip = function (b, f) { return '<span class="duck-f" title="' + escAttr(Duck.explain(b, f) || f) + '">' + esc(f) + "</span>"; };
    let h = '<div class="duck-head"><span>Rubber duck</span><button class="duck-x" title="Turn rubber ducky off (:duck)" aria-label="Turn rubber ducky off">' + ico("x") + "</button></div>";
    if (!a.blocks.length) { el.innerHTML = h + '<p class="duck-none">No code blocks here. Put code in a ``` block and this explains it.</p>'; return; }
    const num = function (b) { return a.blocks.indexOf(b) + 1; };
    if (a.chains.length) h += '<div class="duck-flow"><b>Data flow</b>' + a.chains.map(function (c) {
      return "<div>" + c.map(function (i, k) {
        const link = k ? a.links.filter(function (x) { return x.from === c[k - 1] && x.to === i; })[0] : null;
        return (link ? '<span class="duck-arrow" title="through ' + escAttr(link.name) + '">\u2192</span>' : "") + '<span class="duck-node"' + L(a.blocks[i].base) + ">" + (i + 1) + " " + esc(Duck.NAMES[a.blocks[i].lang]) + "</span>";
      }).join("") + "</div>";
    }).join("") + "</div>";
    a.blocks.forEach(function (b) {
      if (b !== cur) {
        h += '<div class="duck-card"' + L(b.base) + '><div class="duck-sum">' + num(b) + ". " + esc(b.summary.replace(/\. .*$/, ".")) + "</div>" +
          (b.questions.length ? '<div class="duck-qn">' + b.questions.length + (b.questions.length === 1 ? " question" : " questions") + "</div>" : "") + "</div>";
        return;
      }
      h += '<div class="duck-card on"><div class="duck-sum"' + L(b.base) + ">" + num(b) + ". " + esc(b.summary) + "</div>";
      if (b.questions.length) h += '<div class="duck-sec">Questions</div>' + b.questions.map(function (q) { return '<div class="duck-q"' + L(q.line) + ' title="' + q.rule + '">' + esc(q.text) + "</div>"; }).join("");
      if (b.steps.length) h += '<div class="duck-sec">Steps</div><ol class="duck-steps">' + b.steps.map(function (s) {
        const ch = (s.adds.length ? '<span class="duck-add">+ ' + s.adds.map(function (f) { return chip(b, f); }).join(" ") + "</span>" : "") +
          (s.removes.length ? '<span class="duck-rem">\u2212 ' + s.removes.map(function (f) { return chip(b, f); }).join(" ") + "</span>" : "") +
          (s.fields ? '<span class="duck-after">after: ' + (s.fields.length ? s.fields.map(function (f) { return chip(b, f); }).join(" ") : "none") + "</span>" : "");
        return '<li class="duck-step"' + L(s.line) + '><span class="duck-kind k-' + s.kind + '">' + s.kind + "</span> " + esc(s.text) + (ch ? '<div class="duck-fields">' + ch + "</div>" : "") + "</li>";
      }).join("") + "</ol>";
      if (b.symbols.length) h += '<div class="duck-sec">Names</div>' + b.symbols.map(function (s) {
        return '<div class="duck-sym' + (s.unused ? " unused" : "") + '"' + L(s.line) + '><span class="duck-kind">' + esc(s.kind) + "</span> " + esc(s.name) + ' <span class="duck-ln">' + (s.line + 1) + "</span>" + (s.unused ? ' <span class="duck-ln">unused</span>' : "") + "</div>";
      }).join("");
      const io = function (list, word) { return list.length ? '<div class="duck-io">' + word + " " + list.map(function (x) { return '<span' + L(x.line) + ">" + esc(x.name) + "</span>"; }).join(", ") + "</div>" : ""; };
      h += io(b.reads, "Reads") + io(b.writes, "Writes") + "</div>";
    });
    el.innerHTML = h;
    Duck.mark(p);
  },
  /* the step and name under the caret, highlighted; another block under it means a redraw */
  mark(p) {
    const el = p.duckEl;
    if (!el || el.hidden) return;
    const a = Duck.of(p), l = p.activeLine == null ? -1 : p.activeLine, b = Duck.blockAt(a, l);
    if (b && b !== p.duckCur) { Duck.draw(p); return; }
    const steps = el.querySelectorAll(".duck-step");
    let on = null;
    steps.forEach(function (s) { s.classList.remove("cur"); if (b && +s.dataset.line <= l) on = s; });
    if (on) { on.classList.add("cur"); if (on.scrollIntoView && (on.offsetTop < el.scrollTop || on.offsetTop > el.scrollTop + el.clientHeight - 40)) on.scrollIntoView({ block: "nearest" }); }
  },

  /* ============ moving around: panel clicks, gd, ]] [[, Ctrl+O / Ctrl+I ============ */
  go(p, l) {
    l = Math.max(0, Math.min(p.lines.length - 1, l));
    const c = /^\s*/.exec(p.lines[l])[0].length;
    if (Vim.on) Vim.go(p, l, c); else { p.setActive(l, c); p.keepVisible(l); }
  },
  jump(p, l) {
    const j = p.duckJumps || (p.duckJumps = { list: [], i: 0 });
    if (p.activeLine != null) { j.list = j.list.slice(0, j.i); j.list.push(p.activeLine); j.i = j.list.length; }
    Duck.go(p, l);
  },
  back(p) {
    const j = p.duckJumps;
    if (!j || !j.i) return;
    if (j.i === j.list.length) j.list.push(p.activeLine);
    j.i--; Duck.go(p, j.list[j.i]);
  },
  fwd(p) {
    const j = p.duckJumps;
    if (!j || j.i >= j.list.length - 1) return;
    j.i++; Duck.go(p, j.list[j.i]);
  },
  /* the words under the caret: the dotted name (event.original) and the plain part (df in df.query) */
  words(p) {
    const s = p.lines[p.activeLine] || "", c = p.ta ? p.ta.selectionStart : 0, at = function (re) {
      let m;
      while ((m = re.exec(s))) if (c >= m.index && c <= m.index + m[0].length) return m[0].replace(/^\.+|\.+$/g, "");
      return "";
    };
    const full = at(/[$@\w.]+/g), part = at(/[$@\w]+/g);
    return full && full !== part ? [full, part] : [part];
  },
  /* vim's normal mode hands these here; undefined: not ours */
  vim(p, keys) {
    if (keys === "]" || keys === "[") return false;
    if (keys === "<C-o>") { Duck.back(p); return "motion"; }
    if (keys === "<C-i>") { Duck.fwd(p); return "motion"; }
    if (keys === "]]" || keys === "[[") {
      const l = p.activeLine, starts = Duck.blocks(p.lines).map(function (b) { return b.base; });
      const t = keys === "]]" ? starts.filter(function (x) { return x > l; })[0] : starts.filter(function (x) { return x < l; }).pop();
      if (t === undefined) pushToastLike(keys === "]]" ? "No code block below." : "No code block above."); else Duck.jump(p, t);
      return "motion";
    }
    if (keys === "gd" || keys === "K") {
      const a = Duck.of(p), b = Duck.blockAt(a, p.activeLine), ws = Duck.words(p), w = ws[ws.length - 1];
      if (keys === "K") {
        const say = ws.map(function (x) { return Duck.explain(b, x); }).filter(Boolean)[0];
        pushToastLike(say || (w ? "Nothing known about \u201c" + w + "\u201d here." : "No word under the cursor."));
        return "motion";
      }
      const d = ws.map(function (x) { return Duck.defLine(b, x); }).filter(function (x) { return x >= 0; })[0];
      if (d === undefined) { pushToastLike(w ? "No definition of \u201c" + w + "\u201d in this block." : "No word under the cursor."); return "motion"; }
      if (d !== p.activeLine) Duck.jump(p, d);
      return "motion";
    }
    return undefined;
  },
  init() {
    try { Duck.on = localStorage.getItem(Duck.KEY) === "1"; } catch (e) { Duck.on = false; }
  }
};
Duck.init();
