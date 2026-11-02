"use strict";
/* The app page and host.js together, the way VS Code joins them: the page (media/carbonfibre.html, seeded
   by pageHtml) in Chromium with acquireVsCodeApi supplied, its messages handled by host.js against a real
   folder on disk, and dialogs answered from a script.
   node test/bridge_test.js   (needs Playwright for Node; run build.py first) */
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("playwright");
const { make } = require("./fake_vscode");
const { Host, pageHtml, STORE_KEY } = require("../host");

const APP = process.env.CF_EXT_HTML || path.join(__dirname, "..", "media", "carbonfibre.html");
let ok = true;
function check(label, good, detail) { ok = ok && !!good; console.log("  " + label.padEnd(64) + " " + (good ? "ok" : "FAIL") + " " + (detail || "")); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) { const t = Date.now(); while (Date.now() - t < (ms || 4000)) { if (await fn()) return true; await wait(100); } return false; }

(async function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cf-bridge-"));
  const vault = path.join(tmp, "Notes");
  fs.mkdirSync(path.join(vault, "Projects"), { recursive: true });
  fs.mkdirSync(path.join(vault, ".obsidian"));
  fs.writeFileSync(path.join(vault, "Welcome.md"), "# Welcome\n\nSee [[Plan]].\n");
  fs.writeFileSync(path.join(vault, "Projects", "Plan.md"), "# Plan\n\n- [ ] ship it\n");
  fs.writeFileSync(path.join(vault, "Doomed.md"), "# Doomed\n");
  fs.writeFileSync(path.join(vault, ".obsidian", "app.json"), "{}");

  const f = make();
  const browser = await chromium.launch();
  let page, host;
  async function open() {
    const sent = [];
    host = new Host(f.vscode, (m) => { sent.push(m); return page.evaluate((x) => window.dispatchEvent(new MessageEvent("message", { data: x })), m).catch(() => {}); }, f.memento);
    host.setVault(f.vscode.Uri.file(vault));
    const html = pageHtml(fs.readFileSync(APP, "utf8"), { storage: host.storage() });
    const file = path.join(tmp, "page.html"); fs.writeFileSync(file, html);
    page = await browser.newPage({ viewport: { width: 1300, height: 820 } });
    page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
    page.native = 0; page.on("dialog", (d) => { page.native++; d.dismiss(); });
    await page.exposeFunction("__toHost", (m) => host.handle(m));
    await page.addInitScript(() => { window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__toHost(m), getState: () => null, setState: () => {} }); });
    await page.goto("file://" + file);
    await until(() => page.evaluate(() => typeof state !== "undefined" && state.backend === "folder" && state.notes.length > 0));
    await wait(300);
  }
  const E = (fn, arg) => page.evaluate(fn, arg);

  console.log("OPENING THE NOTES FOLDER");
  await open();
  const titles = await E(() => state.notes.map((n) => n.path).sort());
  check("opens straight into the folder (no first-visit question)", await E(() => HostBridge.active && state.backend === "folder" && !document.querySelector(".nsw-win:not([hidden])")));
  check("reads the notes, in their folders; .obsidian is skipped", JSON.stringify(titles) === JSON.stringify(["Doomed.md", "Projects/Plan.md", "Welcome.md"]), JSON.stringify(titles));
  check("the status bar names the folder", /Notes/.test(await E(() => document.getElementById("storageLabel").textContent)));

  console.log("EDITING SAVES TO DISK");
  await E(() => openInPane("Welcome.md"));
  await wait(200);
  await E(() => { const p = panes[0]; p.lines.push("Added in VS Code."); p.render(); const n = p.note(); n.content = p.lines.join("\n"); markDirty(n); });
  check("an edit is written to the .md file", await until(() => fs.readFileSync(path.join(vault, "Welcome.md"), "utf8").includes("Added in VS Code.")));
  await E(() => createNoteWithText("Fresh idea", "# Fresh idea\n\nbody", null, 2, 0));
  check("a new note becomes a new file", await until(() => fs.existsSync(path.join(vault, "Fresh idea.md"))));

  console.log("DIALOGS ARE VS CODE'S");
  f.answers.warning.push(undefined);                       /* closes the dialog: no */
  await E(() => deleteNote("Doomed.md"));
  await wait(400);
  check("delete asks VS Code, and No keeps the note", fs.existsSync(path.join(vault, "Doomed.md")) && /Doomed/.test(JSON.stringify(f.log.asked.slice(-1))));
  f.answers.warning.push("OK");
  await E(() => deleteNote("Doomed.md"));
  check("OK moves it to .trash (the delete that did nothing in the browser pane)", await until(() => !fs.existsSync(path.join(vault, "Doomed.md")) && fs.readdirSync(path.join(vault, ".trash")).some((n) => /Doomed/.test(n))));
  check("...and it leaves the list", !(await E(() => state.notes.some((n) => n.path === "Doomed.md"))));
  f.answers.input.push("Archive/2026");
  await E(() => createFolder());
  check("New folder asks for a name in VS Code's input box", await until(() => fs.existsSync(path.join(vault, "Archive", "2026"))));
  check("no browser pop-up was used", page.native === 0, String(page.native));

  console.log("CHANGED ON DISK WHILE OPEN");
  await E(() => openInPane("Projects/Plan.md"));
  await wait(200);
  await wait(1600);                                        /* the file must look newer than when it was read */
  fs.writeFileSync(path.join(vault, "Projects", "Plan.md"), "# Plan\n\nsomeone else's version\n");
  f.answers.warning.push("Keep");
  await E(() => { const p = panes[0]; p.lines.push("my version"); p.render(); const n = p.note(); n.content = p.lines.join("\n"); markDirty(n); });
  check("the keep / take / copy question comes as VS Code buttons", await until(() => f.log.asked.some((a) => a.items && a.items.join() === "Keep,Take,Copy")));
  check("Keep writes my version", await until(() => fs.readFileSync(path.join(vault, "Projects", "Plan.md"), "utf8").includes("my version")));

  console.log("LINKS, SAVING A FILE, THEME");
  await E(() => followLink("https://example.com/docs"));
  await E(() => window.open("javascript:alert(1)"));
  await wait(200);
  check("links open in the system browser; javascript: links don't", JSON.stringify(f.log.external) === JSON.stringify(["https://example.com/docs"]), JSON.stringify(f.log.external));
  const out = path.join(tmp, "Exports"); fs.mkdirSync(out);
  f.answers.save.push(f.vscode.Uri.file(path.join(out, "Welcome.docx")));
  await E(() => { openInPane("Welcome.md"); exportNote("docx"); });
  check("Export to Word saves where VS Code's save dialog says", await until(() => fs.existsSync(path.join(out, "Welcome.docx")) && fs.statSync(path.join(out, "Welcome.docx")).size > 1000));
  await E(() => { localStorage.removeItem("carbonfibre-theme"); document.body.classList.add("vscode-light"); });
  await wait(200);
  check("the theme follows VS Code's (light here)", await E(() => document.documentElement.getAttribute("data-theme") === "light"));

  console.log("SETTINGS KEPT BY VS CODE");
  await E(() => { togglePin(findNote("Welcome.md")); });
  await wait(300);
  const stored = f.memento.get(STORE_KEY) || {};
  check("pins are saved to the workspace's storage", /Welcome/.test(stored["carbonfibre-pins"] || ""), stored["carbonfibre-pins"]);
  check("no page errors", page.errors.length === 0, page.errors.slice(0, 2).join(" | "));
  await page.close();
  await open();
  check("...and come back when the panel opens again", await E(() => isPinned(findNote("Welcome.md"))));
  check("no page errors after reopening", page.errors.length === 0, page.errors.slice(0, 2).join(" | "));

  await browser.close();
  fs.rmSync(tmp, { recursive: true });
  console.log(ok ? "ALL PASS" : "FAILURES");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); console.log("FAILURES"); process.exit(1); });
