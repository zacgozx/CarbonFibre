---
tags: [carbonfibre, rubber-duck]
---
# Rubber duck rules

Rubber ducky mode reads the code blocks in a note by pattern: no model, no network, nothing leaves the
page. Every rule below has an id; `cf-tests/duck_rules_test.py` has cases that must trigger it and cases
that must not. **When a rule can't be sure, it stays quiet.** A wrong question costs more trust than a
missed one.

Code: `carbonfibre-src/src/js/44-duck.js`. Turn it on with **Toggle rubber ducky mode** in the command
palette, or `:duck` in vim mode.

## Questions (the duck asks)

| Id | When it asks | When it doesn't |
|---|---|---|
| **SPL-1** | A field is used (`where`, `search`, `sort`, `dedup`, `rename`, `table`, `fields`, a `stats` argument or `by`) after a `stats`, `chart`, `timechart`, `top`, `rare`, `tstats`, `table` or `fields` that didn't keep it. The question names that command and its line. | Fields that command made; fields added later (`eval`, `rex`, `rename`, `lookup ... OUTPUT`); `_time` and other `_` fields; before anything fixes the field list; after a macro, `spath`, `extract`, `kv`, `join`, `append`, or a `lookup` without `OUTPUT` (any field could be there again); options like `span=` and `limit=`; quoted values. |
| **LS-1** | A Logstash filter reads a field (`source`, `field`, `date` `match`, `mutate` `rename`) that nothing above created. | Fields made by `grok`/`dissect` patterns, `add_field`, `rename`, `target`, `date` (`@timestamp`), including inside an `if`; built-ins (`message`, `@timestamp`, `host`, `path`, `type`, `tags`, `event.original`, `log.file.path`); anything under `@metadata`. |
| **SQL-1** | A query with `GROUP BY` returns a plain column that's neither grouped nor aggregated (also inside a CTE, named in the question). | Columns grouped as written, by alias, or by bare name vs `table.col`; aggregates (`count`, `sum`, `avg`, `min`, `max`, `string_agg`, …); constants; `*`; queries without `GROUP BY`; any expression it can't match exactly (`GROUP BY 1`, functions). |
| **UNUSED-1** | A name is set and never read again in that block: Python and JS variables, shell variables, PowerShell variables (case-insensitive). Marked in Names too. | Names read in f-strings, template literals, or shell/PowerShell double quotes; `CONSTANTS`; `_private` names; `export`ed or `readonly` shell variables. A name that only appears in a comment or a plain string still counts as unused. |

## Reading (the duck explains)

| Id | What it does |
|---|---|
| **LANG-1** | The fence name decides the language: `spl splunk`, `logstash conf`, `sql mysql postgres tsql`, `python py`, `js javascript ts jsx node`, `bash sh shell zsh console`, `powershell ps1 pwsh`. |
| **LANG-2** | No fence name: guessed from the content (`index=` or `\| stats` is SPL, `input {` is Logstash, `SELECT … FROM` is SQL, `def`/`import` is Python, `const`/`function` is JS, `$x =` or `Verb-Noun` is PowerShell, pipes into `grep`/`awk`/… is shell). |
| **LANG-3** | Skipped: `mermaid` and `excalidraw` blocks, empty blocks, and text that doesn't look like any of the above. |
| **LANG-4** | Every line number is a line of the note, so clicking anything goes to the right place. |
| **SPL-2** | Each SPL command is a step with a kind (source, filter, transform, reshape, aggregate, join, output, macro), what it adds and removes, and the fields after it when they're known. A leading `\| inputlookup` is the source. Pipes inside quotes don't split. |
| **LS-2** | Each Logstash plugin is a step (input: source, output: output, `drop`: filter, the rest: transform) with the fields it adds (`grok` captures, `add_field`, `target`, `rename`) and removes (`remove_field`, `rename`). Braces inside quotes don't count. |
| **SQL-2** | One sentence per query: what it reads, keeps, groups, returns, sorts and limits. A CTE is a step and a name; tables it reads only through a CTE aren't listed as reads. `INSERT`/`CREATE TABLE`/`UPDATE`/`DELETE`/`MERGE` write a table. |
| **PY-1** | Python functions (with their arguments), classes and imports, with line numbers. Not inside strings or comments. |
| **PY-2** | A pandas chain (`pd.read_*`, `DataFrame`) as steps in order: `query`, `groupby`, `agg`, `merge`, `to_*`, …; `assign` and `rename` list their fields. |
| **JS-1** | JS functions, arrow functions, classes, `import` and `require`. Not inside strings or comments. |
| **JS-2** | Array method chains (`filter`, `map`, `reduce`, `sort`, `find`, `forEach`, …) as steps. |
| **PIPE-1** | The longest shell pipeline (backslash continuations joined) as steps: `grep head tail` filter, `uniq -c wc` aggregate, `cut` reshape, `tee` or a final `>` output. `\|\|` is not a pipe. |
| **PIPE-2** | The same for PowerShell (backtick continuations): `Where-Object`, `Select-Object -First` filter, `Group-Object`, `Measure-Object` aggregate, `Select-Object` reshape, `Export-Csv`, `Out-File` output. |
| **IO-1** | What each block reads and writes: SPL indexes and lookups (`inputlookup`, `lookup`, `outputlookup`, `collect`), Logstash `path` and `index`, SQL tables, Python `open()`/`read_*`/`to_*`, Node `readFile`/`writeFile`, shell `cat`/`<`/`>`/`tee` (not `/dev/null` or `2>&1`), PowerShell `Import-Csv`/`Export-Csv`/…. |
| **FLOW-1** | Block A feeds block B when A writes what B reads: files by name (a lookup matches its `.csv`), indexes with `%{+date}` read as a wildcard. Linked blocks are shown as chains at the top of the panel. |
| **SUM-1** | A one-line summary per block: language, lines, what it defines, and for a pipeline its first and last step and the fields it ends with. |

## The panel and keys

- Beside the note in **Live** mode, for panes 520px or wider. The block under the caret gets the full card:
  summary, questions, steps (kind, plain-English line, fields added/removed/after), names with line
  numbers (unused struck through), reads and writes. Other blocks get one card each: summary and question
  count. Data flow chains sit at the top.
- Click anything to go to its line; hover to highlight the line in the note; hover a field for where it's
  made and where it goes. The step under the caret is highlighted as you move.
- Vim mode: `gd` go to where the word is defined, `]]` / `[[` next / previous code block, `K` explain the
  word under the cursor, `:duck` show or hide the panel, **Ctrl+O** / **Ctrl+I** back and forward through
  jumps (these and panel clicks).
- Performance: the analysis is cached per note text and redone 250ms after typing stops; moving the caret
  only moves the highlight (at most once per 60ms while a key is held).

## Known limits

- Patterns, not parsers: unusual formatting (a SPL command split over lines without a pipe, a Logstash
  plugin and its brace on different lines, SQL with nested subqueries in `FROM`) can be misread. Where
  that would mean a question, the rules lean towards saying nothing.
- No knowledge of your data: SPL fields from the source events, Logstash fields set by inputs or codecs,
  and SQL table columns are unknown, so the duck never asks about them.
- One block at a time, apart from FLOW-1: a name defined in one block and used in another counts as
  unused in the first.
- PIPE-1/PIPE-2 show only the longest pipeline in a block.
- Macros, subsearches (`[ … ]`) and `eval` functions aren't expanded.
