"use strict";
/* host.js on its own: requests answered against a real folder, and every way out of that folder refused. */
const fs = require("fs"), os = require("os"), path = require("path");
const { make } = require("./fake_vscode");
const { Host, pageHtml, STORE_KEY } = require("../host");

let ok = true;
function check(label, good, detail) { ok = ok && !!good; console.log("  " + label.padEnd(64) + " " + (good ? "ok" : "FAIL") + " " + (detail || "")); }

(async function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-host-"));
  const vault = path.join(dir, "vault"); fs.mkdirSync(vault);
  fs.writeFileSync(path.join(dir, "secret.txt"), "outside");
  fs.writeFileSync(path.join(vault, "A.md"), "# A");
  const f = make(), sent = [];
  const host = new Host(f.vscode, (m) => sent.push(m), f.memento);
  host.setVault(f.vscode.Uri.file(vault));
  const ask = async (m) => { m.id = sent.length + 1000; await host.handle(m); return sent.find((x) => x.id === m.id); };

  const v = await ask({ op: "vault" });
  check("the notes folder is offered", v.result && v.result.name === "vault", JSON.stringify(v.result));
  const r = v.result.root;
  const rd = await ask({ op: "read", root: r, path: "A.md" });
  check("reads a file, with its time", new TextDecoder().decode(rd.result.data) === "# A" && rd.result.mtime > 0);
  await ask({ op: "write", root: r, path: "Sub/B.md", data: Uint8Array.from([104, 105]) });
  check("writes a file", fs.readFileSync(path.join(vault, "Sub/B.md"), "utf8") === "hi");
  await ask({ op: "write", root: r, path: "C.md", data: { 0: 111, 1: 107 } });
  check("...bytes that arrive as an index-keyed object too", fs.readFileSync(path.join(vault, "C.md"), "utf8") === "ok");
  const ls = await ask({ op: "list", root: r, path: "" });
  check("lists a folder, files and folders told apart", JSON.stringify(ls.result.map((x) => x.name + ":" + x.kind).sort()) === JSON.stringify(["A.md:file", "C.md:file", "Sub:directory"]));
  const nf = await ask({ op: "file", root: r, path: "Nope.md", create: false });
  check("a missing file is NotFoundError (the app relies on it)", nf.error && nf.error.name === "NotFoundError");
  const tm = await ask({ op: "dir", root: r, path: "A.md", create: false });
  check("a file asked for as a folder is TypeMismatchError", tm.error && tm.error.name === "TypeMismatchError");
  await ask({ op: "dir", root: r, path: ".trash", create: true });
  check("creates a folder", fs.statSync(path.join(vault, ".trash")).isDirectory());

  /* ways out */
  for (const bad of ["../secret.txt", "Sub/../../secret.txt", "..", "a\\..\\..\\secret.txt", "C:"]) {
    const x = await ask({ op: "read", root: r, path: bad });
    check("refused: " + bad, x.error && x.error.name === "NotAllowedError", x.error ? x.error.name : "READ IT");
  }
  const unk = await ask({ op: "read", root: "r99", path: "A.md" });
  check("refused: a folder it was never given", unk.error && unk.error.name === "NotAllowedError");
  const rmRoot = await ask({ op: "remove", root: r, path: "", recursive: true });
  check("refused: removing the notes folder itself", rmRoot.error && fs.existsSync(vault));
  await ask({ op: "remove", root: r, path: "Sub", recursive: true });
  check("removes a folder when asked to", !fs.existsSync(path.join(vault, "Sub")));

  /* dialogs */
  f.answers.warning.push("OK");
  check("confirm: OK is yes", (await ask({ op: "confirm", message: "Delete?" })).result === true);
  f.answers.warning.push(undefined);
  check("confirm: closing the dialog is no", (await ask({ op: "confirm", message: "Delete?" })).result === false);
  f.answers.warning.push("Take");
  check("choose: the button picked comes back as the choice", (await ask({ op: "choose", message: "?", choices: ["keep", "take", "copy"] })).result === "take");
  f.answers.input.push(undefined);
  check("prompt: Escape is null", (await ask({ op: "prompt", message: "Name", value: "x" })).result === null);
  f.answers.input.push("Projects");
  check("prompt: the typed text", (await ask({ op: "prompt", message: "Name", value: "" })).result === "Projects");

  /* links and storage */
  await host.handle({ op: "openExternal", url: "https://example.com/a" });
  await host.handle({ op: "openExternal", url: "javascript:alert(1)" });
  await host.handle({ op: "openExternal", url: "file:///etc/passwd" });
  check("links: https opens, javascript: and file: don't", JSON.stringify(f.log.external) === JSON.stringify(["https://example.com/a"]), JSON.stringify(f.log.external));
  await host.handle({ op: "store.set", key: "k", value: "v" });
  await host.handle({ op: "store.set", key: "gone", value: "x" });
  await host.handle({ op: "store.remove", key: "gone" });
  check("storage: set and remove reach the workspace store", JSON.stringify(f.memento.get(STORE_KEY)) === JSON.stringify({ k: "v" }));

  /* the page */
  const html = pageHtml("<html><head></head><body>\n<p>x</p></body></html>", { storage: { a: "</script><script>alert(1)</script>" } });
  check("the seed goes in after <body>, and can't close its own tag", /<body>\n<script type="application\/json" id="cf-host">/.test(html) && html.indexOf("</script><script>alert") === -1);

  /* own writes aren't reported back as outside changes */
  check("a change the page made isn't reported", host.changedOnDisk(f.vscode.Uri.joinPath(f.vscode.Uri.file(vault), "C.md")) === false);
  check("a change from elsewhere is", host.changedOnDisk(f.vscode.Uri.joinPath(f.vscode.Uri.file(vault), "A.md")) === true);
  fs.rmSync(dir, { recursive: true });
  console.log(ok ? "ALL PASS" : "FAILURES");
  process.exit(ok ? 0 : 1);
})();
