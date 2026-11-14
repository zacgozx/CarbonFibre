/* Live theme run (not part of npm test): applies each Obsidian theme in a folder of .css files and
   takes a dark and a light screenshot, to see how far each one reaches.
   electron test/themes_live.js <folder of name.css> <out folder> */
"use strict";
const { app, dialog } = require("electron");
const path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const ud = fs.mkdtempSync(path.join(os.tmpdir(), "cf-themes-"));
app.setPath("userData", ud);
process.env.CARBONFIBRE_NO_UPDATES = "1";
dialog.showMessageBox = async () => ({ response: 1 });
require("../main.js");
const themes = require("../plugins/themes.js");
const [SRC, OUT] = process.argv.slice(process.argv.findIndex((a) => /themes_live\.js$/.test(a)) + 1).filter((a) => !a.startsWith("--"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let done = false;

app.on("browser-window-created", (_e, w) => {
  if (done) return;
  done = true;
  w.setSize(1280, 800);
  w.webContents.once("did-finish-load", async () => {
    try {
      fs.mkdirSync(OUT, { recursive: true }); console.log("loaded");
      w.webContents.on("console-message", (e) => { if (e.level === "error" || e.level === 3) console.log("PAGE", String(e.message).slice(0, 300)); });
      await wait(1200);
      await w.webContents.executeJavaScript(`(async () => {
        await PluginApp.app.vault.create("Welcome.md", "---\\ntags: [demo]\\n---\\n# Heading one\\n\\nSome **bold** text, a [[Second note]] link, a #tag and \`code\`.\\n\\n## Heading two\\n\\n- a list item\\n- [ ] a task\\n\\n> A quote\\n\\n| a | b |\\n|---|---|\\n| 1 | 2 |\\n\\n### Heading three\\n");
        await PluginApp.app.vault.create("Second note.md", "Back to [[Welcome]]");
        openInPane(state.notes.find(n => n.title === "Welcome").id, panes[0]);
        return true;
      })()`);
      const report = {};
      for (const mode of ["dark", "light"]) {
        await w.webContents.executeJavaScript(`setTheme(${JSON.stringify(mode)}); new Promise(r => setTimeout(r, 300))`);
        fs.writeFileSync(path.join(OUT, "_none-" + mode + ".png"), (await w.webContents.capturePage()).toPNG());
      }
      for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith(".css"))) {
        const name = f.replace(/\.css$/, "");
        await themes.place(name, fs.readFileSync(path.join(SRC, f), "utf8"), null);
        report[name] = {}; console.log("theme", name);
        for (const mode of ["dark", "light"]) {
          const r = await w.webContents.executeJavaScript(`(async () => {
            setTheme(${JSON.stringify(mode)});
            await ThemeHost.use(${JSON.stringify(name)});
            await new Promise(r => setTimeout(r, 400));
            const cs = (sel, p) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[p] : ""; };
            return { bg: cs("#workarea", "backgroundColor"), side: cs("#side", "backgroundColor"), text: cs(".editor", "color"), font: cs(".editor", "fontFamily").slice(0, 40),
              h1: cs(".ln-h1", "color"), errors: [] };
          })()`);
          report[name][mode] = r;
          const img = await w.webContents.capturePage();
          fs.writeFileSync(path.join(OUT, name.replace(/\W+/g, "_") + "-" + mode + ".png"), img.toPNG());
        }
      }
      await w.webContents.executeJavaScript(`ThemeHost.use(null)`);
      fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
      console.log(JSON.stringify(report, null, 1));
    } catch (e) { console.log("crashed", e.stack); }
    app.exit(0);
  });
});
