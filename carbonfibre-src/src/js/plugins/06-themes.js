/* ============================================================
   Obsidian plugins 6/6: Obsidian themes (desktop app). A theme is CSS written for Obsidian's page,
   so CarbonFibre meets it halfway instead of becoming that page:
   - ObsidianDom puts Obsidian's class names on CarbonFibre's own parts (the note list is
     .nav-file-title, panes are .workspace-leaf, previews .markdown-rendered, ...), so theme rules
     and plugins that look for them find something. Only names: nothing is rebuilt.
   - css/27-obsidian-themes.css maps Obsidian's variables (--background-primary, --text-normal,
     --interactive-accent, --font-text, --h1-color, ...) onto CarbonFibre's, defaulting to
     CarbonFibre's own colours, so a theme that sets them recolours the whole app.
   - ThemeHost installs themes (the community catalog, or a vault's .obsidian/themes), applies the
     one in use as a <style> after CarbonFibre's own, and answers app.customCss for plugins such as
     Style Settings and Minimal Theme Settings. Themes are CSS only; the page's policy still blocks
     scripts and every request a theme might make (fonts and images from the web don't load).
   ============================================================ */
const ObsidianDom = {
  on: false,
  STATIC: [
    ["#workarea", "workspace mod-root"], ["#side", "workspace-split mod-left-split mod-sidedock"], ["#activity", "workspace-ribbon side-dock-ribbon mod-left"],
    ["#notesList", "nav-files-container"], ["#statusbar", "status-bar"], ["#cmdPal .cmdpal-box", "prompt"], [".mo-body", "app-container horizontal-main-container"]
  ],
  /* parts drawn again and again: tagged as they appear */
  LIVE: [
    [".side-item", "nav-file tree-item"], [".side-item-row", "nav-file-title tree-item-self is-clickable"], [".side-item-title", "nav-file-title-content tree-item-inner"],
    [".fold-head", "nav-folder-title tree-item-self is-clickable"], [".fold-name", "nav-folder-title-content tree-item-inner"], [".fold-body", "nav-folder-children tree-item-children"],
    [".pane-col", "workspace-leaf"], [".tab", "workspace-tab-header"], [".tab-lbl", "workspace-tab-header-inner-title"],
    [".editor", "view-content markdown-source-view"], [".split-prev", "markdown-preview-view markdown-rendered"], [".act-btn", "side-dock-ribbon-action clickable-icon"],
    [".status-bar-item, .sb-item", "status-bar-item"]
  ],
  tag(root) {
    ObsidianDom.LIVE.forEach(function (r) {
      const add = r[1].split(" ");
      if (root.matches && root.matches(r[0])) root.classList.add.apply(root.classList, add);
      if (root.querySelectorAll) root.querySelectorAll(r[0]).forEach(function (el) { el.classList.add.apply(el.classList, add); });
    });
    ObsidianDom.state(root);
  },
  /* Obsidian's state classes, following CarbonFibre's */
  state(root) {
    const sync = function (el) {
      if (el.classList.contains("side-item") || el.classList.contains("tab")) {
        const on = el.classList.contains("on"), row = el.classList.contains("side-item") ? el.querySelector(".side-item-row") : null;
        if (el.classList.contains("is-active") !== on) el.classList.toggle("is-active", on);
        if (row && row.classList.contains("is-active") !== on) row.classList.toggle("is-active", on);   /* Obsidian marks the title: .nav-file-title.is-active */
      }
      if (el.classList.contains("fold-head")) { const c = el.classList.contains("collapsed"); if (el.classList.contains("is-collapsed") !== c) el.classList.toggle("is-collapsed", c); }
    };
    if (root.classList) sync(root);
    if (root.querySelectorAll) root.querySelectorAll(".side-item, .tab, .fold-head").forEach(sync);
  },
  start() {
    if (ObsidianDom.on) return;
    ObsidianDom.on = true;
    ObsidianDom.STATIC.forEach(function (r) { const el = document.querySelector(r[0]); if (el) el.classList.add.apply(el.classList, r[1].split(" ")); });
    ObsidianDom.tag(document.body);
    new MutationObserver(function (records) {
      records.forEach(function (m) {
        if (m.type === "attributes") ObsidianDom.state(m.target);
        else m.addedNodes.forEach(function (n) { if (n.nodeType === 1) ObsidianDom.tag(n); });
      });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }
};

const ThemeHost = {
  active: null,                                        /* the name of the theme in use, or null */
  installed: [],
  catalog: null, catalogError: "", query: "", shown: 40, busy: new Set(),
  api() { const d = cfDesktopPlugins(); return d && d.themes ? d.themes : null; },
  clean(e) { return String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""); },

  /* at start (desktop): the theme in use, if any */
  start() {
    const t = ThemeHost.api();
    if (!t) return Promise.resolve();
    ObsidianDom.start();                                /* .theme-dark / .theme-light: PluginHost.followTheme */
    return Promise.all([t.list(), t.css(null)]).then(function (r) {
      ThemeHost.installed = r[0] || [];
      ThemeHost.apply(r[1]);
    }).catch(function (e) { console.error("CarbonFibre themes:", e); });
  },
  apply(t) {
    let st = document.getElementById("cfObsidianTheme");
    if (!t || !t.css) {
      if (st) st.remove();
      document.body.classList.remove("cf-obs-theme");
      ThemeHost.active = null;
    } else {
      if (!st) { st = document.createElement("style"); st.id = "cfObsidianTheme"; }
      st.textContent = t.css;
      document.head.appendChild(st);                    /* last, after CarbonFibre's own sheets and plugins' */
      document.body.classList.add("cf-obs-theme");
      ThemeHost.active = t.name;
    }
    if (typeof PluginApp !== "undefined" && PluginApp.app && PluginApp.app.customCss) PluginApp.app.customCss.trigger("css-change");
    if (typeof PluginApp !== "undefined" && PluginApp.app && PluginApp.app.workspace) PluginApp.app.workspace.trigger("css-change");
    if (typeof SimpleGraph !== "undefined" && state.graphOpen) openGraph();
  },
  use(name) {
    const t = ThemeHost.api();
    if (!t) return Promise.resolve();
    return t.use(name || null).then(function () { return name ? t.css(name) : null; }).then(ThemeHost.apply)
      .then(function () { return ThemeHost.refreshList(); }).catch(function (e) { pushToastLike("Couldn’t use that theme: " + ThemeHost.clean(e)); });
  },
  refreshList() { const t = ThemeHost.api(); return t ? t.list().then(function (l) { ThemeHost.installed = l || []; if (PluginManager.tab === "themes") PluginManager.refresh(); }) : Promise.resolve(); },
  install(name) {
    const t = ThemeHost.api();
    ThemeHost.busy.add(name);
    PluginManager.refresh();
    return t.install(name).then(function () { return ThemeHost.use(name); }).then(function () { pushToastLike(name + " is installed and in use."); })
      .catch(function (e) { pushToastLike("Couldn’t install " + name + ": " + ThemeHost.clean(e)); })
      .then(function () { ThemeHost.busy.delete(name); return ThemeHost.refreshList(); });
  },
  remove(name) {
    return Dialogs.confirm("Remove the theme " + name + "?").then(function (ok) {
      if (!ok) return null;
      return ThemeHost.api().uninstall(name).then(function () { if (ThemeHost.active === name) ThemeHost.apply(null); return ThemeHost.refreshList(); });
    });
  },
  /* themes Obsidian installed in this vault: .obsidian/themes/<name>/theme.css (or <name>.css, older) */
  fromVault() {
    if (state.backend !== "folder" || !state.dirHandle) { pushToastLike("Open your vault folder first."); return; }
    const read = function (dir, name) { return dir.getFileHandle(name).then(function (h) { return h.getFile(); }).then(function (f) { return f.text(); }).catch(function () { return null; }); };
    state.dirHandle.getDirectoryHandle(".obsidian").then(function (o) { return o.getDirectoryHandle("themes"); }).then(function (tdir) {
      const found = [];
      return (async function () { for await (const e of tdir.values()) found.push(e); })().then(function () { return { tdir: tdir, found: found }; });
    }).then(function (r) {
      let done = 0, chain = Promise.resolve();
      r.found.forEach(function (e) {
        chain = chain.then(function () {
          if (e.kind === "directory") return Promise.all([read(e, "theme.css"), read(e, "manifest.json")]).then(function (f) { return f[0] ? ThemeHost.api().importFiles(e.name, f[0], f[1]).then(function () { done++; }) : null; });
          if (/\.css$/i.test(e.name)) return read(r.tdir, e.name).then(function (css) { return css ? ThemeHost.api().importFiles(e.name.replace(/\.css$/i, ""), css, null).then(function () { done++; }) : null; });
          return null;
        }).catch(function (er) { console.error(er); });
      });
      return chain.then(function () {
        pushToastLike(done ? "Imported " + done + " theme" + (done === 1 ? "" : "s") + " from this vault." : "This vault’s .obsidian/themes folder has no themes.");
        return ThemeHost.refreshList();
      });
    }).catch(function () { pushToastLike("This vault has no .obsidian/themes folder."); });
  },
  loadCatalog(refresh) {
    ThemeHost.catalogError = "";
    return ThemeHost.api().catalog(refresh).then(function (list) { ThemeHost.catalog = list; })
      .catch(function (e) { ThemeHost.catalogError = ThemeHost.clean(e); }).then(function () { PluginManager.refresh(); });
  },

  /* the Themes tab of the Plugins window */
  render(body) {
    const have = new Set(ThemeHost.installed.map(function (t) { return t.name; }));
    let h = '<div class="cfp-toolbar"><input id="cfpThemeSearch" class="cfp-search" type="search" placeholder="Search community themes" autocomplete="off" spellcheck="false" value="' + escAttr(ThemeHost.query) + '">' +
      '<button class="cfp-btn" data-cfpact="themevault"' + (state.backend === "folder" ? "" : ' disabled title="Open a vault folder first (bottom left)"') + ">Import from this vault’s .obsidian/themes</button>" +
      (ThemeHost.active ? '<button class="cfp-btn" data-cfpact="themenone">Use CarbonFibre’s own look</button>' : "") + "</div>";
    h += '<p class="cfp-dim cfp-theme-note">A theme recolours CarbonFibre and changes its fonts. Obsidian’s editor styling (Live Preview decorations) doesn’t apply, and fonts or images a theme loads from the web stay blocked. Light or dark follows the moon/sun button.</p>';
    if (ThemeHost.installed.length) {
      h += '<h3 class="cfp-sub">Installed</h3><div class="cfp-list">' + ThemeHost.installed.map(function (t) {
        const on = t.name === ThemeHost.active;
        return '<div class="cfp-row" data-theme-name="' + escAttr(t.name) + '"><div class="cfp-main"><div class="cfp-name">' + esc(t.manifest.name) +
          ' <span class="cfp-ver">' + esc(t.manifest.version) + "</span>" + (on ? ' <span class="cfp-badge cfp-ok">In use</span>' : "") + "</div>" +
          (t.manifest.author ? '<div class="cfp-by">by ' + esc(t.manifest.author) + "</div>" : "") + "</div>" +
          '<div class="cfp-side">' + (on ? "" : '<button class="cfp-btn cfp-primary" data-cfpact="themeuse">Use</button>') +
          '<button class="cfp-icon" data-cfpact="themeremove" title="Remove" aria-label="Remove ' + escAttr(t.name) + '">' + PluginIcons.svg("trash", 16) + "</button></div></div>";
      }).join("") + "</div>";
    }
    h += '<h3 class="cfp-sub">Community themes</h3><div class="cfp-list" id="cfpThemeList">';
    if (!ThemeHost.catalog) {
      h += ThemeHost.catalogError ? '<div class="cfp-empty"><p>Couldn’t load the theme catalog: ' + esc(ThemeHost.catalogError) + '</p><button class="cfp-btn" data-cfpact="themeretry">Try again</button></div>'
        : '<div class="cfp-empty"><p>Loading the theme catalog…</p></div>';
      if (!ThemeHost.catalogError) ThemeHost.loadCatalog(false);
    } else {
      const words = ThemeHost.query.toLowerCase().split(/\s+/).filter(Boolean);
      const all = ThemeHost.catalog.filter(function (t) { const s = (t.name + " " + t.author).toLowerCase(); return words.every(function (w) { return s.indexOf(w) !== -1; }); });
      h += all.slice(0, ThemeHost.shown).map(function (t) {
        const busy = ThemeHost.busy.has(t.name);
        return '<div class="cfp-row" data-theme-name="' + escAttr(t.name) + '" data-repo="' + escAttr(t.repo) + '"><div class="cfp-main"><div class="cfp-name">' + esc(t.name) + "</div>" +
          '<div class="cfp-by">by ' + esc(t.author) + " · " + esc(t.modes.join(" and ") || "dark and light") + ' · <a href="#" data-cfpact="repo">GitHub</a></div></div><div class="cfp-side">' +
          (have.has(t.name) ? '<span class="cfp-have">' + PluginIcons.svg("check", 14) + " Installed</span>"
            : '<button class="cfp-btn cfp-primary" data-cfpact="themeinstall"' + (busy ? " disabled" : "") + ">" + (busy ? "Installing…" : "Install") + "</button>") + "</div></div>";
      }).join("") + (all.length > ThemeHost.shown ? '<button class="cfp-btn cfp-more" data-cfpact="thememore">Show more (' + (all.length - ThemeHost.shown) + " left)</button>" : "") +
        (!all.length ? '<div class="cfp-empty"><p>No theme matches.</p></div>' : "");
    }
    body.innerHTML = h + "</div>";
  },
  /* clicks in the Themes tab; true when handled */
  onClick(act, row) {
    const name = row && row.dataset.themeName;
    if (act === "themeuse") ThemeHost.use(name);
    else if (act === "themenone") ThemeHost.use(null);
    else if (act === "themeinstall") ThemeHost.install(name);
    else if (act === "themeremove") ThemeHost.remove(name);
    else if (act === "themevault") ThemeHost.fromVault();
    else if (act === "themeretry") ThemeHost.loadCatalog(true);
    else if (act === "thememore") { ThemeHost.shown += 40; PluginManager.refresh(); }
    else return false;
    return true;
  }
};
