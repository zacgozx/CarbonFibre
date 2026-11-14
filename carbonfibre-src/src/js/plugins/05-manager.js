/* ============================================================
   Obsidian plugins 5/5: the Plugins window. Installed plugins (switch on/off, settings, remove),
   the community catalog (each plugin checked before you install it; ones that can't run here are
   greyed out with the reason), and each plugin's own settings page. In the browser build the
   window opens greyed out, explaining that plugins run in the desktop app.
   ============================================================ */
const PluginManager = {
  el: null, tab: "installed", catalog: null, catalogError: "", query: "", hideNo: false, shown: 40,
  checks: new Map(), queue: [], checking: 0, settingsOf: null, busy: new Set(),

  init() {
    const bar = document.getElementById("activity"), before = document.getElementById("actBoard");
    if (!bar || document.getElementById("actPlugins")) return;
    const b = document.createElement("button");
    b.className = "act-btn";
    b.id = "actPlugins";
    b.title = "Plugins (Obsidian community plugins)";
    b.setAttribute("aria-label", "Plugins");
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + PluginIcons.paths.puzzle + '"/></svg>';
    b.addEventListener("click", function () { PluginManager.open(); });
    bar.insertBefore(b, before || bar.querySelector(".act-spacer"));
  },
  desktop() { return !!cfDesktopPlugins(); },

  build() {
    if (PluginManager.el) return;
    const w = document.createElement("div");
    w.className = "cfp-win";
    w.hidden = true;
    w.innerHTML =
      '<div class="cfp-dialog" role="dialog" aria-modal="true" aria-labelledby="cfpTitle">' +
        '<div class="cfp-head"><h2 id="cfpTitle">Plugins</h2>' +
          '<div class="cfp-tabs" role="tablist">' +
            '<button class="cfp-tab" role="tab" data-cfptab="installed">Installed</button>' +
            '<button class="cfp-tab" role="tab" data-cfptab="browse">Community plugins</button>' +
          "</div>" +
          '<button class="cfp-x" data-cfpclose title="Close (Esc)" aria-label="Close">' + PluginIcons.svg("x", 16) + "</button></div>" +
        '<p class="cfp-lede"></p>' +
        '<div class="cfp-body"></div>' +
      "</div>";
    document.body.appendChild(w);
    PluginManager.el = w;
    w.addEventListener("mousedown", function (e) { if (e.target === w) PluginManager.close(); });
    w.addEventListener("keydown", function (e) { if (e.key === "Escape" && !PluginModals.open.length) { e.preventDefault(); e.stopPropagation(); PluginManager.close(); } });
    w.addEventListener("click", PluginManager.onClick);
    w.addEventListener("change", PluginManager.onChange);
    w.addEventListener("input", function (e) {
      if (e.target.id === "cfpSearch") { PluginManager.query = e.target.value; PluginManager.shown = 40; PluginManager.renderList(); }
    });
  },
  open(tab) {
    PluginManager.build();
    if (tab) PluginManager.tab = tab;
    PluginManager.settingsOf = null;
    PluginManager.el.hidden = false;
    PluginManager.render();
    const t = PluginManager.el.querySelector('.cfp-tab[data-cfptab="' + PluginManager.tab + '"]');
    if (t) t.focus();
  },
  close() {
    if (!PluginManager.el || PluginManager.el.hidden) return;
    PluginManager.leaveSettings();
    PluginManager.el.hidden = true;
  },
  refresh() { if (PluginManager.el && !PluginManager.el.hidden && !PluginManager.settingsOf) PluginManager.render(); },

  badge(c) {
    if (!c) return '<span class="cfp-badge cfp-wait">Checking…</span>';
    if (c.error) return '<span class="cfp-badge cfp-wait" title="' + escAttr(c.error) + '">Couldn’t check</span>';
    return (c.node && c.level !== "no" ? '<span class="cfp-badge cfp-nodeb" title="Asks to use Node.js (files, programs, the internet) when you switch it on, as it has in Obsidian">Node.js</span> '
      : c.net && c.level !== "no" ? '<span class="cfp-badge cfp-netb" title="Asks to use the internet when you switch it on">Internet</span> ' : "") + (c.level === "ok" ? '<span class="cfp-badge cfp-ok">Works</span>'
      : c.level === "partial" ? '<span class="cfp-badge cfp-part">Partly works</span>'
      : '<span class="cfp-badge cfp-no">Can’t run here</span>');
  },
  why(c) {
    if (!c || c.error) return "";
    const items = (c.reasons || []).map(function (r) { return '<li class="cfp-why-no">' + esc(r) + "</li>"; })
      .concat((c.notes || []).map(function (r) { return "<li>" + esc(r) + "</li>"; }));
    if (!items.length) return "";
    const first = c.reasons && c.reasons.length ? c.reasons[0] : null;
    return (first ? '<p class="cfp-reason">' + esc(first) + "</p>" : "") +
      '<details class="cfp-details"><summary>' + (c.level === "no" ? "Why it can’t run" : "What won’t work") + "</summary><ul>" + items.join("") + "</ul></details>";
  },

  render() {
    const w = PluginManager.el, desk = PluginManager.desktop();
    w.querySelectorAll(".cfp-tab").forEach(function (t) {
      const on = t.dataset.cfptab === PluginManager.tab;
      t.classList.toggle("on", on);
      t.setAttribute("aria-selected", String(on));
    });
    const n = PluginHost.installed.length;
    w.querySelector('.cfp-tab[data-cfptab="installed"]').textContent = "Installed" + (n ? " (" + n + ")" : "");
    w.querySelector(".cfp-lede").innerHTML = desk
      ? "Obsidian community plugins, running inside CarbonFibre. A plugin that uses the internet, or Node.js (files and programs on this computer, as in Obsidian), asks first, and you can take that back below. A plugin can read and change your notes, so install ones you trust."
      : "<strong>Plugins run in the CarbonFibre desktop app</strong> (macOS, Windows and Linux). This web version only runs its own code, which keeps your notes safe from injected scripts, so plugins are switched off here.";
    w.classList.toggle("cfp-web", !desk);
    const body = w.querySelector(".cfp-body");
    if (!desk) {
      body.innerHTML = '<div class="cfp-empty cfp-greyed"><p>Installing, browsing and running plugins is available in the desktop app.</p>' +
        '<p class="cfp-dim">Get it from the project’s Releases page, or build it from the <code>desktop/</code> folder.</p></div>' +
        '<div class="cfp-toolbar cfp-greyed"><button class="cfp-btn" disabled>Install from folder…</button><button class="cfp-btn" disabled>Import from this vault</button></div>';
      return;
    }
    if (PluginManager.tab === "installed") PluginManager.renderInstalled(body); else PluginManager.renderBrowse(body);
  },

  renderInstalled(body) {
    const list = PluginHost.installed;
    let h = '<div class="cfp-toolbar"><button class="cfp-btn" data-cfpact="folder">Install from folder…</button>' +
      '<button class="cfp-btn" data-cfpact="vault"' + (state.backend === "folder" ? "" : ' disabled title="Open a vault folder first (bottom left)"') + ">Import from this vault’s .obsidian/plugins</button>" +
      '<button class="cfp-btn" data-cfpact="tobrowse">Browse community plugins</button></div>';
    if (!list.length) h += '<div class="cfp-empty"><p>No plugins installed yet.</p><p class="cfp-dim">Browse the community plugins, or install one from a folder that holds its <code>manifest.json</code> and <code>main.js</code>.</p></div>';
    else h += '<div class="cfp-list">' + list.map(function (p) {
      const m = p.manifest || {}, c = p.compat || {}, no = c.level === "no", err = PluginHost.errors.get(p.id), on = p.enabled && !no;
      const loaded = PluginHost.instances.has(p.id), tab = loaded && PluginHost.settingTabs.has(p.id), busy = PluginManager.busy.has(p.id);
      return '<div class="cfp-row' + (no ? " cfp-off" : "") + '" data-id="' + escAttr(p.id) + '">' +
        '<div class="cfp-main"><div class="cfp-name">' + esc(String(m.name || p.id)) + ' <span class="cfp-ver">' + esc(String(m.version || "")) + "</span> " + PluginManager.badge(c) + "</div>" +
          '<div class="cfp-by">' + (m.author ? "by " + esc(String(m.author)) : "") + "</div>" +
          '<div class="cfp-desc">' + esc(String(m.description || "")) + "</div>" +
          (err ? '<p class="cfp-err">Didn’t start: ' + esc(err) + "</p>" : "") + PluginManager.why(c) + PluginManager.nodeLine(p) + PluginManager.netLine(p) + "</div>" +
        '<div class="cfp-side">' +
          (tab ? '<button class="cfp-icon" data-cfpact="settings" title="Settings" aria-label="Settings for ' + escAttr(String(m.name || p.id)) + '">' + PluginIcons.svg("settings", 16) + "</button>" : "") +
          '<button class="cfp-icon" data-cfpact="remove" title="Uninstall" aria-label="Uninstall ' + escAttr(String(m.name || p.id)) + '">' + PluginIcons.svg("trash", 16) + "</button>" +
          '<label class="cfp-switch' + (no ? " cfp-greyed" : "") + '" title="' + (no ? "This plugin can’t run in CarbonFibre" : on ? "Turn off" : "Turn on") + '">' +
            '<input type="checkbox" data-cfpact="toggle"' + (on ? " checked" : "") + (no || busy ? " disabled" : "") + ' aria-label="Enable ' + escAttr(String(m.name || p.id)) + '"><span></span></label>' +
        "</div></div>";
    }).join("") + "</div>";
    body.innerHTML = h;
  },

  /* a plugin that uses Node.js: whether it may, and the button to change that */
  nodeLine(p) {
    if (!p.compat || !p.compat.node) return "";
    const live = PluginNodeAccess.have();
    return p.node
      ? '<p class="cfp-net cfp-node">' + PluginIcons.svg("terminal", 14) + " Can use Node.js" + (live ? "" : " (once its window reopens)") + ' <button class="cfp-btn cfp-small" data-cfpact="nodeoff">Take away</button></p>'
      : '<p class="cfp-net cfp-dim">' + PluginIcons.svg("terminal", 14) + " " + (p.node === false ? "Not allowed to use Node.js: those parts are off" : "Uses Node.js: asks when switched on") +
        ' <button class="cfp-btn cfp-small" data-cfpact="nodeon">Allow…</button></p>';
  },
  /* a plugin that uses the internet: whether it may, and the button to change that */
  netLine(p) {
    if (!p.compat || !p.compat.net || p.node) return "";
    return p.network
      ? '<p class="cfp-net">' + PluginIcons.svg("globe", 14) + ' Can use the internet <button class="cfp-btn cfp-small" data-cfpact="netoff">Take away</button></p>'
      : '<p class="cfp-net cfp-dim">' + PluginIcons.svg("globe", 14) + ' ' + (p.network === false ? "Not allowed to use the internet" : "Uses the internet: asks when switched on") +
        ' <button class="cfp-btn cfp-small" data-cfpact="neton">Allow…</button></p>';
  },
  renderBrowse(body) {
    body.innerHTML =
      '<div class="cfp-toolbar"><input id="cfpSearch" class="cfp-search" type="search" placeholder="Search community plugins" autocomplete="off" spellcheck="false" value="' + escAttr(PluginManager.query) + '">' +
      '<label class="cfp-check"><input type="checkbox" id="cfpHideNo"' + (PluginManager.hideNo ? " checked" : "") + "> Hide ones that can’t run</label></div>" +
      '<div class="cfp-count" id="cfpCount"></div><div class="cfp-list" id="cfpList"></div>';
    if (!PluginManager.catalog) {
      body.querySelector("#cfpList").innerHTML = PluginManager.catalogError
        ? '<div class="cfp-empty"><p>Couldn’t load the community catalog: ' + esc(PluginManager.catalogError) + '</p><button class="cfp-btn" data-cfpact="retry">Try again</button></div>'
        : '<div class="cfp-empty"><p>Loading the community catalog…</p></div>';
      if (!PluginManager.catalogError) PluginManager.loadCatalog(false);
      return;
    }
    PluginManager.renderList();
    const s = body.querySelector("#cfpSearch");
    if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  },
  loadCatalog(refresh) {
    PluginManager.catalogError = "";
    cfDesktopPlugins().catalog(refresh).then(function (list) {
      PluginManager.catalog = list;
      if (PluginManager.tab === "browse" && !PluginManager.settingsOf) PluginManager.render();
    }).catch(function (e) {
      PluginManager.catalogError = String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      if (PluginManager.tab === "browse" && !PluginManager.settingsOf) PluginManager.render();
    });
  },
  matches() {
    const q = PluginManager.query.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    return PluginManager.catalog.filter(function (p) {
      if (PluginManager.hideNo) { const c = PluginManager.checks.get(p.id); if (c && c.level === "no") return false; }
      if (!words.length) return true;
      const t = (p.name + " " + p.author + " " + p.description + " " + p.id).toLowerCase();
      return words.every(function (w) { return t.indexOf(w) !== -1; });
    });
  },
  renderList() {
    const listEl = document.getElementById("cfpList");
    if (!listEl || !PluginManager.catalog) return;
    const all = PluginManager.matches(), shown = all.slice(0, PluginManager.shown);
    const have = new Set(PluginHost.installed.map(function (p) { return p.id; }));
    let checked = 0, runnable = 0;
    PluginManager.checks.forEach(function (c) { if (!c.error) { checked++; if (c.level !== "no") runnable++; } });
    document.getElementById("cfpCount").textContent = all.length + " plugin" + (all.length === 1 ? "" : "s") +
      (checked ? " · of the " + checked + " checked so far, " + Math.round(runnable / checked * 100) + "% can run here" : "");
    listEl.innerHTML = shown.map(function (p) {
      const c = PluginManager.checks.get(p.id), no = c && c.level === "no", inst = have.has(p.id), busy = PluginManager.busy.has(p.id);
      return '<div class="cfp-row' + (no ? " cfp-off" : "") + '" data-id="' + escAttr(p.id) + '" data-repo="' + escAttr(p.repo) + '">' +
        '<div class="cfp-main"><div class="cfp-name">' + esc(p.name) + " " + PluginManager.badge(c) + "</div>" +
          '<div class="cfp-by">by ' + esc(p.author) + " · " + PluginManager.count(p.downloads) + ' downloads · <a href="#" data-cfpact="repo">GitHub</a></div>' +
          '<div class="cfp-desc">' + esc(p.description) + "</div>" + PluginManager.why(c) + "</div>" +
        '<div class="cfp-side">' +
          (inst ? '<span class="cfp-have">' + PluginIcons.svg("check", 14) + " Installed</span>"
            : '<button class="cfp-btn' + (c && c.level !== "no" && !c.error ? " cfp-primary" : "") + '" data-cfpact="install"' + (!c || no || c.error || busy ? " disabled" : "") + ">" +
              (busy ? "Installing…" : no ? "Can’t install" : "Install") + "</button>") +
        "</div></div>";
    }).join("") + (all.length > shown.length ? '<button class="cfp-btn cfp-more" data-cfpact="more">Show more (' + (all.length - shown.length) + " left)</button>" : "") +
      (!all.length ? '<div class="cfp-empty"><p>No plugin matches.</p></div>' : "");
    shown.forEach(function (p) { if (!PluginManager.checks.has(p.id)) PluginManager.enqueue(p.id); });
  },
  count(n) { return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n); },

  /* check plugins a few at a time, the ones on screen first */
  enqueue(id) { if (PluginManager.queue.indexOf(id) === -1) PluginManager.queue.push(id); PluginManager.pump(); },
  pump() {
    while (PluginManager.checking < 3 && PluginManager.queue.length) {
      const id = PluginManager.queue.shift();
      if (PluginManager.checks.has(id)) continue;
      PluginManager.checking++;
      cfDesktopPlugins().check(id).then(function (r) { PluginManager.checks.set(id, r); }, function (e) {
        PluginManager.checks.set(id, { error: String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "") });
      }).then(function () {
        PluginManager.checking--;
        PluginManager.updateRow(id);
        PluginManager.pump();
      });
    }
  },
  updateRow(id) {
    if (!PluginManager.el || PluginManager.el.hidden || PluginManager.tab !== "browse" || PluginManager.settingsOf) return;
    clearTimeout(PluginManager.rowTimer);
    PluginManager.rowTimer = setTimeout(function () {
      const list = document.getElementById("cfpList");
      if (!list) return;
      const top = list.parentNode.scrollTop;
      PluginManager.renderList();
      list.parentNode.scrollTop = top;
    }, 120);
  },

  onChange(e) {
    const t = e.target;
    if (t.id === "cfpHideNo") { PluginManager.hideNo = t.checked; PluginManager.renderList(); return; }
    if (t.dataset.cfpact === "toggle") {
      const id = t.closest(".cfp-row").dataset.id;
      PluginManager.busy.add(id);
      t.disabled = true;
      (t.checked ? PluginHost.enable(id) : PluginHost.disable(id)).catch(function () {}).then(function () {
        PluginManager.busy.delete(id);
        return cfDesktopPlugins().list();
      }).then(function (list) { PluginHost.installed = list; PluginManager.refresh(); });
    }
  },
  onClick(e) {
    const tabBtn = e.target.closest("[data-cfptab]");
    if (tabBtn) { PluginManager.leaveSettings(); PluginManager.tab = tabBtn.dataset.cfptab; PluginManager.render(); return; }
    if (e.target.closest("[data-cfpclose]")) { PluginManager.close(); return; }
    const a = e.target.closest("[data-cfpact]");
    if (!a || a.disabled) return;
    const act = a.dataset.cfpact, row = a.closest(".cfp-row"), id = row && row.dataset.id;
    if (act === "toggle") return;
    if (act === "neton" || act === "netoff" || act === "nodeon" || act === "nodeoff") {
      const d = cfDesktopPlugins();
      const run = { neton: d.askNetwork, netoff: d.revokeNetwork, nodeon: d.askNode, nodeoff: d.revokeNode }[act];
      /* Node.js is taken away at once for that plugin's next start; switching it off and on again applies it */
      Promise.resolve(run(id)).catch(function () {})
        .then(function () { return d.list(); }).then(function (l) { PluginHost.installed = l; PluginManager.refresh(); });
      return;
    }
    e.preventDefault();
    if (act === "tobrowse") { PluginManager.tab = "browse"; PluginManager.render(); }
    else if (act === "more") { PluginManager.shown += 40; PluginManager.renderList(); }
    else if (act === "retry") { PluginManager.catalogError = ""; PluginManager.render(); PluginManager.loadCatalog(true); }
    else if (act === "repo") cfDesktopPlugins().openRepo(row.dataset.repo);
    else if (act === "settings") PluginManager.openSettings(id);
    else if (act === "install") PluginManager.install(id);
    else if (act === "remove") PluginManager.remove(id);
    else if (act === "folder") PluginManager.fromFolder();
    else if (act === "vault") PluginManager.fromVault();
  },
  afterInstall(r) {
    return cfDesktopPlugins().list().then(function (list) {
      PluginHost.installed = list;
      const name = (r.manifest && r.manifest.name) || r.id;
      if (r.compat && r.compat.level === "no") { pushToastLike(name + " is installed but has no code to run."); PluginManager.refresh(); return null; }
      return Dialogs.confirm("Turn on " + name + " now?\n\nA plugin can read and change your notes.").then(function (ok) {
        if (!ok) { PluginManager.refresh(); return null; }
        return PluginHost.enable(r.id).catch(function (e) { pushToastLike(name + " didn’t start: " + e.message); }).then(function () { return cfDesktopPlugins().list(); }).then(function (l2) { PluginHost.installed = l2; PluginManager.refresh(); });
      });
    });
  },
  install(id) {
    PluginManager.busy.add(id);
    PluginManager.renderList();
    cfDesktopPlugins().install(id).then(PluginManager.afterInstall).catch(function (e) {
      pushToastLike("Couldn’t install: " + String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    }).then(function () { PluginManager.busy.delete(id); PluginManager.refresh(); });
  },
  remove(id) {
    const p = PluginHost.installed.find(function (x) { return x.id === id; }), name = p && p.manifest && p.manifest.name || id;
    Dialogs.confirm("Uninstall " + name + "? Its settings are removed too.").then(function (ok) {
      if (!ok) return null;
      PluginHost.unloadInstance(id);
      return cfDesktopPlugins().uninstall(id).then(function () { return cfDesktopPlugins().list(); }).then(function (list) { PluginHost.installed = list; PluginManager.refresh(); });
    });
  },
  fromFolder() {
    cfDesktopPlugins().installFolder().then(function (r) { if (r) return PluginManager.afterInstall(r); return null; })
      .catch(function (e) { pushToastLike("Couldn’t install: " + String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")); });
  },
  /* plugins already in the vault (installed there by Obsidian): copy each into the app */
  fromVault() {
    if (state.backend !== "folder" || !state.dirHandle) return;
    const read = function (dir, name) { return dir.getFileHandle(name).then(function (h) { return h.getFile(); }).then(function (f) { return f.text(); }).catch(function () { return null; }); };
    state.dirHandle.getDirectoryHandle(".obsidian").then(function (o) { return o.getDirectoryHandle("plugins"); }).then(function (pdir) {
      const found = [];
      return (async function () { for await (const e of pdir.values()) if (e.kind === "directory") found.push(e); })().then(function () { return found; });
    }).then(function (dirs) {
      if (!dirs.length) { pushToastLike("This vault’s .obsidian/plugins folder is empty."); return null; }
      let done = 0, chain = Promise.resolve();
      dirs.forEach(function (d) {
        chain = chain.then(function () {
          return Promise.all([read(d, "manifest.json"), read(d, "main.js"), read(d, "styles.css"), read(d, "data.json")]).then(function (f) {
            if (!f[0] || !f[1]) return null;
            return cfDesktopPlugins().importFiles(d.name, { manifest: f[0], main: f[1], styles: f[2], data: f[3] }).then(function () { done++; });
          }).catch(function (e) { console.error(e); });
        });
      });
      return chain.then(function () { return cfDesktopPlugins().list(); }).then(function (list) {
        PluginHost.installed = list;
        PluginManager.refresh();
        pushToastLike("Imported " + done + " plugin" + (done === 1 ? "" : "s") + " from this vault. Turn on the ones you want.");
      });
    }).catch(function () { pushToastLike("This vault has no .obsidian/plugins folder."); });
  },

  /* a plugin's own settings page, inside this window */
  openSettings(id) {
    PluginManager.build();
    const tab = PluginHost.settingTabs.get(id);
    if (!tab) { PluginManager.open("installed"); return; }
    PluginManager.leaveSettings();
    PluginManager.el.hidden = false;
    PluginManager.settingsOf = id;
    const inst = PluginHost.instances.get(id), name = inst && inst.manifest ? inst.manifest.name : id;
    const body = PluginManager.el.querySelector(".cfp-body");
    body.innerHTML = '<div class="cfp-settings-head"><button class="cfp-btn" data-cfptab="installed">' + PluginIcons.svg("arrow-left", 14) + " Plugins</button><h3>" + esc(String(name)) + "</h3></div>";
    const wrap = document.createElement("div");
    wrap.className = "cfp-settings vertical-tab-content-container";
    wrap.appendChild(tab.containerEl);
    body.appendChild(wrap);
    tab.containerEl.textContent = "";
    PluginApp.app.setting.activeTab = tab;
    try { const r = tab.display(); if (r && r.catch) r.catch(function (e) { console.error(e); }); } catch (e) {
      console.error(e);
      const d = document.createElement("p"); d.className = "cfp-err"; d.textContent = "This plugin’s settings page failed: " + e.message; wrap.appendChild(d);
    }
  },
  leaveSettings() {
    const id = PluginManager.settingsOf;
    if (!id) return;
    PluginManager.settingsOf = null;
    const tab = PluginHost.settingTabs.get(id);
    if (tab) { try { tab.hide(); } catch (e) { console.error(e); } tab.containerEl.remove(); }
    if (PluginApp.app) PluginApp.app.setting.activeTab = null;
  }
};
