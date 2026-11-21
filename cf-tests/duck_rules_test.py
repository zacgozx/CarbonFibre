import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); CF = os.environ.get("CF_HTML", os.path.join(HERE, "..", "CarbonFibre.html"))
from playwright.sync_api import sync_playwright
# Rubber ducky rules, one table: every rule in docs/rubber-duck-rules.md has cases that must trigger it
# and cases that must not. Each case is a note, and a JS check run on a = Duck.analyze(lines)
# (b = a.blocks[0], q(rule) = that rule's questions in all blocks).
ok = True
def check(label, good, detail=""):
    global ok; ok &= bool(good); print("  %-72s %s %s" % (label, "ok" if good else "FAIL", detail))
F = lambda lang, code: "# Note\n\n```" + lang + "\n" + code + "\n```\n"
CASES = [
  # ---- SPL-1: a field used after a command that dropped it
  ("SPL-1", "where on a field stats dropped", F("spl", "index=web\n| stats count by host\n| where status>400"), "q('SPL-1').length === 1 && q('SPL-1')[0].field === 'status'"),
  ("SPL-1", "table then sort on a field not in the table", F("spl", "index=web\n| table host, user\n| sort - bytes"), "q('SPL-1').length === 1 && q('SPL-1')[0].field === 'bytes'"),
  ("SPL-1", "fields keeps a list, then rename of another", F("spl", "index=web\n| fields host\n| rename user as who"), "q('SPL-1')[0].field === 'user'"),
  ("SPL-1", "the question names the command that dropped it, with its line", F("spl", "index=web\n| stats count by host\n| where status>400"), "/the stats on line 5/.test(q('SPL-1')[0].text)"),
  ("SPL-1", "must not: a field the stats made", F("spl", "index=web\n| stats count by host\n| where count>10"), "q('SPL-1').length === 0"),
  ("SPL-1", "must not: a field eval added after the stats", F("spl", "index=web\n| stats count by host\n| eval big=count*2\n| where big>10"), "q('SPL-1').length === 0"),
  ("SPL-1", "must not: no stats/table yet (every field may be there)", F("spl", "index=web\n| where status>400\n| dedup user"), "q('SPL-1').length === 0"),
  ("SPL-1", "must not: a macro makes the fields unknown again", F("spl", "index=web\n| stats count by host\n| `enrich`\n| where status>1"), "q('SPL-1').length === 0"),
  ("SPL-1", "must not: lookup without OUTPUT can add anything", F("spl", "index=web\n| stats count by host\n| lookup assets host\n| where owner=\"x\""), "q('SPL-1').length === 0"),
  ("SPL-1", "must not: internal _time", F("spl", "index=web\n| stats count by host\n| sort _time"), "q('SPL-1').length === 0"),
  ("SPL-1", "must not: span= and limit= options are not fields", F("spl", "index=web\n| timechart span=1h count by host limit=5\n| where count>1"), "q('SPL-1').length === 0"),
  ("SPL-1", "must not: a quoted value is not a field", F("spl", "index=web\n| stats count by host\n| where host=\"status\""), "q('SPL-1').length === 0"),
  # ---- SPL-2: fields after each step
  ("SPL-2", "stats keeps the by-fields and the results", F("spl", "index=web\n| stats count, avg(bytes) as avgb by host"), "JSON.stringify(b.steps[1].fields) === JSON.stringify(['host','count','avgb'])"),
  ("SPL-2", "timechart adds _time", F("spl", "index=web\n| timechart count by host"), "b.steps[1].fields[0] === '_time'"),
  ("SPL-2", "eval and rex add fields", F("spl", "index=web\n| rex \"(?<user>\\w+)@\"\n| eval len=len(user)"), "b.steps[1].adds[0] === 'user' && b.steps[2].adds[0] === 'len'"),
  ("SPL-2", "rename removes one name and adds the other", F("spl", "index=web\n| table a, b\n| rename a as z"), "b.steps[2].removes[0] === 'a' && b.steps[2].fields.indexOf('z') >= 0 && b.steps[2].fields.indexOf('a') < 0"),
  ("SPL-2", "fields - removes", F("spl", "index=web\n| table a, b\n| fields - b"), "JSON.stringify(b.steps[2].fields) === '[\"a\"]'"),
  ("SPL-2", "unknown before any fixing command (null, not empty)", F("spl", "index=web\n| eval x=1"), "b.steps[1].fields === null"),
  ("SPL-2", "step kinds: source, filter, aggregate, output", F("spl", "index=web\n| where a=1\n| stats count\n| outputlookup x.csv"), "b.steps.map(s => s.kind).join() === 'source,filter,aggregate,output'"),
  ("SPL-2", "a search starting with | inputlookup: that's the source", F("spl", "| inputlookup hosts.csv\n| stats count"), "b.steps[0].kind === 'source' && b.steps[0].cmd === 'inputlookup' && b.reads[0].name === 'hosts.csv'"),
  ("SPL-2", "a pipe inside quotes is not a new step", F("spl", "index=web\n| eval x=\"a|b\"\n| stats count"), "b.steps.length === 3"),
  # ---- LS-1: Logstash reads a field nothing made
  ("LS-1", "date on a field nothing made", F("logstash", "filter {\n  date { match => [ \"ts\", \"ISO8601\" ] }\n}"), "q('LS-1').length === 1 && q('LS-1')[0].field === 'ts'"),
  ("LS-1", "json source nothing made", F("logstash", "filter {\n  json { source => \"payload\" }\n}"), "q('LS-1')[0].field === 'payload'"),
  ("LS-1", "rename of a field nothing made", F("logstash", "filter {\n  mutate { rename => { \"usr\" => \"user\" } }\n}"), "q('LS-1')[0].field === 'usr'"),
  ("LS-1", "must not: grok made it first", F("logstash", "filter {\n  grok { match => { \"message\" => \"%{TIMESTAMP_ISO8601:ts} %{GREEDYDATA:rest}\" } }\n  date { match => [ \"ts\", \"ISO8601\" ] }\n}"), "q('LS-1').length === 0"),
  ("LS-1", "must not: built-in message", F("logstash", "filter {\n  json { source => \"message\" }\n}"), "q('LS-1').length === 0"),
  ("LS-1", "must not: @metadata fields", F("logstash", "filter {\n  json { source => \"[@metadata][raw]\" }\n}"), "q('LS-1').length === 0"),
  ("LS-1", "must not: made by add_field in a condition above", F("logstash", "filter {\n  if [type] == \"x\" {\n    mutate { add_field => { \"stamp\" => \"now\" } }\n  }\n  date { match => [ \"stamp\", \"ISO8601\" ] }\n}"), "q('LS-1').length === 0"),
  # ---- LS-2: what each plugin adds and removes
  ("LS-2", "grok adds its named captures", F("logstash", "filter {\n  grok { match => { \"message\" => \"%{IP:client} %{WORD:verb}\" } }\n}"), "b.steps[0].adds.join() === 'client,verb'"),
  ("LS-2", "remove_field removes", F("logstash", "filter {\n  mutate {\n    remove_field => [\"a\", \"b\"]\n  }\n}"), "b.steps[0].removes.join() === 'a,b'"),
  ("LS-2", "plugins across lines, one step each, in order", F("logstash", "input {\n  beats {\n    port => 5044\n  }\n}\nfilter {\n  grok {\n    match => { \"message\" => \"%{IP:ip}\" }\n  }\n}\noutput {\n  stdout {}\n}"), "b.steps.map(s => s.cmd + ':' + s.kind).join() === 'beats:source,grok:transform,stdout:output'"),
  ("LS-2", "must not: braces inside a quoted pattern open nothing", F("logstash", "filter {\n  grok { match => { \"message\" => \"}{ %{WORD:w}\" } }\n  mutate { add_field => { \"k\" => \"v\" } }\n}"), "b.steps.length === 2"),
  # ---- SQL-1: returned but neither grouped nor aggregated
  ("SQL-1", "a column not in GROUP BY", F("sql", "SELECT host, user, count(*) FROM logs GROUP BY host"), "q('SQL-1').length === 1 && q('SQL-1')[0].field === 'user'"),
  ("SQL-1", "inside a CTE, named in the question", F("sql", "WITH t AS (SELECT a, b, sum(x) FROM s GROUP BY a)\nSELECT * FROM t"), "q('SQL-1').length === 1 && /in t/.test(q('SQL-1')[0].text)"),
  ("SQL-1", "must not: grouped by its alias", F("sql", "SELECT lower(host) AS h, count(*) FROM logs GROUP BY h"), "q('SQL-1').length === 0"),
  ("SQL-1", "must not: table-qualified vs bare name", F("sql", "SELECT l.host, count(*) FROM logs l GROUP BY host"), "q('SQL-1').length === 0"),
  ("SQL-1", "must not: aggregates and constants", F("sql", "SELECT host, 'x' AS tag, max(ts), count(DISTINCT user) FROM logs GROUP BY host"), "q('SQL-1').length === 0"),
  ("SQL-1", "must not: no GROUP BY at all", F("sql", "SELECT host, user FROM logs WHERE x = 1"), "q('SQL-1').length === 0"),
  ("SQL-1", "must not: an expression it can't match exactly (stays quiet)", F("sql", "SELECT date_trunc('day', ts), count(*) FROM logs GROUP BY 1"), "q('SQL-1').length === 0"),
  # ---- SQL-2: one sentence per query, reads and writes
  ("SQL-2", "a sentence of reads, filter, groups, returns, sort, limit", F("sql", "SELECT host, count(*) AS n FROM logs WHERE status >= 500 GROUP BY host ORDER BY n DESC LIMIT 10"), "/reads logs/.test(b.steps[0].text) && /keeps rows where status >= 500/.test(b.steps[0].text) && /groups by host/.test(b.steps[0].text) && /returns host, n/.test(b.steps[0].text) && /first 10/.test(b.steps[0].text)"),
  ("SQL-2", "a CTE is a step and a symbol, and isn't read as a table", F("sql", "WITH recent AS (SELECT * FROM logs)\nSELECT host FROM recent"), "b.steps.length === 2 && b.symbols[0].name === 'recent' && b.reads.map(r => r.name).join() === 'logs'"),
  ("SQL-2", "INSERT writes a table", F("sql", "INSERT INTO daily SELECT host, count(*) FROM logs GROUP BY host"), "b.writes[0].name === 'daily' && b.steps[0].kind === 'output'"),
  ("SQL-2", "a semicolon starts another query on its own line", F("sql", "SELECT 1;\nSELECT a FROM t"), "b.steps.length === 2 && b.steps[1].line === 4"),
  # ---- PY-1 / PY-2
  ("PY-1", "functions, classes and imports with their lines", F("python", "import os\nfrom pathlib import Path\n\nclass Job:\n    pass\n\ndef run(path, n=1):\n    return Path(path)"), "b.symbols.filter(s => s.kind === 'function')[0].name === 'run(path, n=1)' && b.symbols.some(s => s.kind === 'class' && s.name === 'Job' && s.line === 6) && b.symbols.filter(s => s.kind === 'import').length === 2"),
  ("PY-1", "must not: a def inside a string", F("python", "doc = \"def fake(): pass\"\nprint(doc)"), "!b.symbols.some(s => s.kind === 'function')"),
  ("PY-2", "pandas steps in order with kinds", F("python", "import pandas as pd\ndf = pd.read_csv('a.csv')\nout = df.query('x > 1').groupby('h').agg({'x': 'sum'})\nout.to_csv('b.csv')"), "b.steps.map(s => s.cmd).join() === 'read_csv,query,groupby,agg,to_csv' && b.steps[0].kind === 'source' && b.steps[1].kind === 'filter'"),
  ("PY-2", "assign and rename list their fields", F("python", "import pandas as pd\ndf = pd.DataFrame()\ndf = df.assign(total=1).rename(columns={'a': 'b'})"), "b.steps[1].adds[0] === 'total' && b.steps[2].removes[0] === 'a' && b.steps[2].adds[0] === 'b'"),
  ("PY-2", "must not: no pandas, no pipeline", F("python", "items = [1, 2]\nprint(items.count(1))"), "b.steps.length === 0"),
  # ---- JS-1 / JS-2
  ("JS-1", "functions, arrows, classes, imports, require", F("js", "import fs from 'fs'\nconst path = require('path')\nfunction load(a) { return fs.readFileSync(path.join(a)) }\nconst add = (x, y) => x + y\nclass Box {}\nexport { load, add, Box }"), "['function','import','class'].every(k => b.symbols.some(s => s.kind === k)) && b.symbols.some(s => s.kind === 'function' && s.name === 'add') && b.symbols.some(s => s.kind === 'import' && /path/.test(s.name))"),
  ("JS-1", "must not: a function in a comment", F("js", "// function ghost() {}\nconst a = 1\nconsole.log(a)"), "!b.symbols.some(s => s.name.indexOf('ghost') >= 0)"),
  ("JS-2", "array methods as steps", F("js", "const r = rows.filter(x => x.ok).map(x => x.n).reduce((a, b) => a + b, 0)\nconsole.log(r)"), "b.steps.map(s => s.cmd + ':' + s.kind).join() === 'filter:filter,map:transform,reduce:aggregate'"),
  ("JS-2", "must not: a method name inside a string", F("js", "const s = 'a.map(b)'\nconsole.log(s)"), "b.steps.length === 0"),
  # ---- PIPE-1 / PIPE-2
  ("PIPE-1", "shell pipe: each command a step with its kind", F("bash", "cat app.log | grep ERROR | sort | uniq -c | head -5"), "b.steps.map(s => s.kind).join() === 'source,filter,transform,aggregate,filter'"),
  ("PIPE-1", "lines continued with a backslash are one pipeline", F("bash", "cat a.log \\\n  | grep x \\\n  | wc -l"), "b.steps.length === 3 && b.steps[2].kind === 'aggregate'"),
  ("PIPE-1", "must not: || is not a pipe", F("bash", "test -f a || echo missing"), "b.steps.length === 0"),
  ("PIPE-2", "PowerShell pipeline with kinds", F("powershell", "Import-Csv users.csv | Where-Object { $_.Enabled } | Select-Object Name | Export-Csv out.csv"), "b.steps.map(s => s.kind).join() === 'source,filter,reshape,output'"),
  ("PIPE-2", "PowerShell backtick continuation", F("powershell", "Get-Process `\n  | Sort-Object CPU `\n  | Select-Object -First 5"), "b.steps.length === 3 && b.steps[2].kind === 'filter'"),
  # ---- UNUSED-1
  ("UNUSED-1", "Python name set and never used", F("python", "a = 1\nb = 2\nprint(a)"), "q('UNUSED-1').map(x => x.field).join() === 'b' && b.symbols.some(s => s.name === 'b' && s.unused)"),
  ("UNUSED-1", "JS const never used", F("js", "const used = 1\nconst spare = 2\nconsole.log(used)"), "q('UNUSED-1').map(x => x.field).join() === 'spare'"),
  ("UNUSED-1", "shell variable never used", F("bash", "dir=/tmp\nlog=/var/log\nls $dir"), "q('UNUSED-1').map(x => x.field).join() === 'log'"),
  ("UNUSED-1", "PowerShell, names are case-insensitive", F("powershell", "$Path = 'C:\\x'\n$spare = 1\nGet-ChildItem $path"), "q('UNUSED-1').map(x => x.field).join() === 'spare'"),
  ("UNUSED-1", "must not: used in an f-string or template literal", F("python", "name = 'x'\nprint(f'hi {name}')"), "q('UNUSED-1').length === 0"),
  ("UNUSED-1", "a name only in a comment or a plain string is still unused", F("python", "x = 1\nprint('x')  # x"), "q('UNUSED-1').length === 1"),
  ("UNUSED-1", "must not: CONSTANTS, _private and exported shell vars", F("bash", "export PATHX=/a\n_tmp=1\nLIMIT=5\necho hi"), "q('UNUSED-1').length === 0"),
  ("UNUSED-1", "must not: shell var used inside double quotes", F("bash", "n=3\necho \"count: ${n}\""), "q('UNUSED-1').length === 0"),
  # ---- LANG-1..4
  ("LANG-1", "the fence name decides (splunk -> SPL, ps1 -> PowerShell)", "```splunk\nfoo\n```\n```ps1\nbar\n```", "a.blocks.map(x => x.lang).join() === 'spl,powershell'"),
  ("LANG-2", "no fence name: guessed from the content", "```\nindex=main | stats count\n```\n```\nSELECT a FROM t\n```\n```\ndef f():\n    pass\n```", "a.blocks.map(x => x.lang).join() === 'spl,sql,python'"),
  ("LANG-3", "must not: mermaid, empty blocks and plain text are skipped", "```mermaid\ngraph TD\nA-->B\n```\n```\n\n```\n```\njust some words\n```", "a.blocks.length === 0"),
  ("LANG-4", "lines are note lines, so clicking goes to the right place", "# T\n\ntext\n```sql\nSELECT a FROM t\n```", "b.start === 3 && b.steps[0].line === 4"),
  # ---- IO-1 / FLOW-1 / SUM-1
  ("IO-1", "SPL index read and lookup written", F("spl", "index=fw\n| stats count by src\n| outputlookup srcs.csv"), "b.reads[0].kind === 'index' && b.reads[0].name === 'fw' && b.writes[0].name === 'srcs.csv'"),
  ("IO-1", "Python open() for writing vs reading", F("python", "f = open('in.txt')\ng = open('out.txt', 'w')\nprint(f, g)"), "b.reads[0].name === 'in.txt' && b.writes[0].name === 'out.txt'"),
  ("IO-1", "must not: 2>&1 and /dev/null are not files", F("bash", "run.sh > /dev/null 2>&1"), "b.writes.length === 0"),
  ("FLOW-1", "a block's output feeds the next (lookup file without .csv)", F("python", "import pandas as pd\ndf = pd.read_csv('a.csv')\ndf.to_csv('hosts.csv')") + F("spl", "| inputlookup hosts\n| stats count"), "a.links.length === 1 && a.links[0].from === 0 && a.links[0].to === 1 && a.chains[0].join() === '0,1'"),
  ("FLOW-1", "a dated Logstash index matches the SPL search", F("logstash", "output { elasticsearch { index => \"fw-%{+YYYY.MM.dd}\" } }") + F("spl", "index=fw-2026.01.01\n| stats count"), "a.links.length === 1"),
  ("FLOW-1", "three blocks make one chain", F("bash", "cat raw.log > a.txt") + F("bash", "cat a.txt | sort > b.txt") + F("bash", "cat b.txt | wc -l"), "a.chains.length === 1 && a.chains[0].join() === '0,1,2'"),
  ("FLOW-1", "must not: different names don't link", F("bash", "cat raw.log > a.txt") + F("bash", "cat other.txt | wc -l"), "a.links.length === 0"),
  ("SUM-1", "language, length, what it defines, the pipeline ends", F("spl", "index=web\n| stats count by host"), "b.summary === 'Splunk SPL, 2 lines. A 2-step pipeline from search to stats, ending with host, count.'"),
  ("SUM-1", "counts names in the summary", F("python", "import os\ndef f():\n    pass\nx = 1\nprint(x)"), "/Python, 5 lines: 1 function, 1 variable, 1 import\\./.test(b.summary)"),
]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + CF); pg.wait_for_timeout(300)
    rules = set()
    for rule, label, note, js in CASES:
        rules.add(rule)
        res = pg.evaluate("""([note, js]) => { const a = Duck.analyze(note.split('\\n')), b = a.blocks[0] || null;
          const q = r => [].concat(...a.blocks.map(x => x.questions)).filter(x => x.rule === r);
          try { return { pass: !!(new Function('a', 'b', 'q', 'return (' + js + ')'))(a, b, q), a: a }; } catch (e) { return { pass: false, err: String(e), a: a }; } }""", [note, js])
        check(rule + ": " + label, res["pass"], "" if res["pass"] else (res.get("err") or json.dumps(res["a"])[:600]))
    want = {"SPL-1", "LS-1", "SQL-1", "UNUSED-1", "LANG-1", "LANG-2", "LANG-3", "LANG-4", "SPL-2", "LS-2", "SQL-2", "PY-1", "PY-2", "JS-1", "JS-2", "PIPE-1", "PIPE-2", "IO-1", "FLOW-1", "SUM-1"}
    check("every rule in the doc has cases (%d cases)" % len(CASES), want <= rules, str(want - rules))
    check("no errors", not errs, errs[:2])
    b.close()
print("ALL PASS" if ok else "FAILURES"); sys.exit(0 if ok else 1)
