/* A small Obsidian plugin, written the way esbuild bundles them (CommonJS, require("obsidian")).
   desktop/test/run.js installs it and checks that each part works inside CarbonFibre. */
"use strict";
var obsidian = require("obsidian");
var VIEW = "cf-fixture-view";

class FixtureView extends obsidian.ItemView {
  getViewType() { return VIEW; }
  getDisplayText() { return "Fixture view"; }
  getIcon() { return "calendar"; }
  async onOpen() { this.contentEl.createEl("p", { text: "Hello from the fixture view", cls: "fixture-view-text" }); }
}

class FixtureSettings extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    this.containerEl.empty();
    new obsidian.Setting(this.containerEl).setName("Greeting").setDesc("What to say").addText((t) => t.setValue(this.plugin.settings.greeting).onChange(async (v) => { this.plugin.settings.greeting = v; await this.plugin.saveData(this.plugin.settings); }));
    new obsidian.Setting(this.containerEl).setName("Loud").addToggle((t) => t.setValue(false));
  }
}

class Fixture extends obsidian.Plugin {
  async onload() {
    this.settings = Object.assign({ greeting: "hi" }, await this.loadData());
    this.events = [];
    window.cfFixture = this;
    this.addCommand({ id: "insert-greeting", name: "Insert greeting", editorCallback: (editor) => { editor.replaceSelection(this.settings.greeting); } });
    this.addCommand({ id: "only-in-notes", name: "Only in notes", checkCallback: (checking) => { const ok = !!this.app.workspace.getActiveViewOfType(obsidian.MarkdownView); if (!checking && ok) this.ran = true; return ok; } });
    this.ribbon = this.addRibbonIcon("dice", "Fixture ribbon", () => { this.ribbonClicked = true; });
    this.status = this.addStatusBarItem();
    this.status.setText("fixture status");
    this.addSettingTab(new FixtureSettings(this.app, this));
    this.registerView(VIEW, (leaf) => new FixtureView(leaf));
    this.registerMarkdownCodeBlockProcessor("fixture", (source, el) => { el.createDiv({ cls: "fixture-block", text: "rendered: " + source.trim() }); });
    this.registerEvent(this.app.vault.on("create", (f) => this.events.push("create:" + f.path)));
    this.registerEvent(this.app.vault.on("modify", (f) => this.events.push("modify:" + f.path)));
    this.registerEvent(this.app.workspace.on("file-open", (f) => this.events.push("open:" + (f ? f.path : "none"))));
    this.app.workspace.onLayoutReady(() => { this.layoutReady = true; });
  }
  onunload() { window.cfFixtureUnloaded = true; }
}
module.exports = Fixture;
