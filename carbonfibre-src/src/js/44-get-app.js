/* ============================================================
   Getting the desktop app, and keeping it up to date.
   - The website: "Get the app" in the status bar, with the download for this computer first
     (macOS Apple silicon or Intel, Windows x64 or ARM, Linux), from the latest GitHub release.
     Every push to main publishes one (.github/workflows/desktop.yml), so it's always the newest.
     Links only: the page still makes no requests (connect-src 'none').
   - The desktop app: no download button. When a newer release is out, "Update available" shows in
     the status bar; clicking it asks in the app's own dialog, then the app updates itself and
     restarts (desktop/updater.js).
   - Phones and tablets: nothing (the app is for macOS, Windows and Linux).
   ============================================================ */
const GetApp = {
  RELEASE: "https://github.com/zacgozx/CarbonFibre/releases/latest",
  FILES: [
    { id: "mac-arm64", label: "macOS, Apple silicon (M1 and later)", file: "CarbonFibre-mac-arm64.dmg" },
    { id: "mac-x64", label: "macOS, Intel", file: "CarbonFibre-mac-x64.dmg" },
    { id: "win-x64", label: "Windows", file: "CarbonFibre-win-x64-setup.exe" },
    { id: "win-arm64", label: "Windows on ARM", file: "CarbonFibre-win-arm64-setup.exe" },
    { id: "linux-x86_64", label: "Linux (AppImage)", file: "CarbonFibre-linux-x86_64.AppImage" },
    { id: "linux-arm64", label: "Linux on ARM (AppImage)", file: "CarbonFibre-linux-arm64.AppImage" }
  ],
  btn: null, pop: null, guess: null, upd: null,

  url(f) { return GetApp.RELEASE + "/download/" + f.file; },
  /* which system this is, from what the browser says; the processor where the browser tells */
  system() {
    const ua = navigator.userAgent || "", plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    if (/iPhone|iPad|iPod|Android/i.test(ua) || (/Mac/.test(plat) && navigator.maxTouchPoints > 1)) return null;   /* iPadOS says Mac */
    if (/Mac/i.test(plat) || /Mac OS X/.test(ua)) return "mac";
    if (/Win/i.test(plat) || /Windows/.test(ua)) return "win";
    if (/Linux|X11|CrOS/i.test(plat + " " + ua)) return "linux";
    return null;
  },
  /* Apple silicon or Intel: Chromium says so when asked; Safari and Firefox don't, but the
     graphics chip's name does (an Intel Mac never has an Apple GPU) */
  arm(sys) {
    const d = navigator.userAgentData;
    const ask = d && d.getHighEntropyValues ? d.getHighEntropyValues(["architecture"]).then(function (v) { return v.architecture === "arm" ? true : v.architecture === "x86" ? false : null; }).catch(function () { return null; }) : Promise.resolve(null);
    return ask.then(function (a) {
      if (a !== null || sys !== "mac") return !!a;
      try {
        const gl = document.createElement("canvas").getContext("webgl");
        const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
        const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
        if (/Intel|AMD|Radeon|NVIDIA/i.test(r)) return false;
      } catch (e) { /* no WebGL: most Macs sold since 2020 are Apple silicon */ }
      return true;
    });
  },

  init() {
    const right = document.querySelector("#statusbar .sb-right");
    if (!right) return;
    if (Dialogs.desktop) { GetApp.initUpdates(right); return; }
    const sys = GetApp.system();
    if (!sys) return;
    const wrap = document.createElement("span");
    wrap.className = "menu-wrap ga-wrap";
    wrap.innerHTML = '<button class="sb-btn" id="btnGetApp" aria-haspopup="true" aria-expanded="false" title="Download CarbonFibre for this computer">' +
      '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg><span>Get the app</span></button>' +
      '<div class="ga-pop" id="gaPop" role="menu" hidden></div>';
    right.insertBefore(wrap, right.firstChild);
    GetApp.btn = wrap.querySelector("#btnGetApp");
    GetApp.pop = wrap.querySelector("#gaPop");
    GetApp.btn.addEventListener("click", function (e) { e.stopPropagation(); GetApp.toggle(); });
    document.addEventListener("mousedown", function (e) { if (GetApp.pop && !GetApp.pop.hidden && !e.target.closest(".ga-wrap")) GetApp.close(); });
    GetApp.pop.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); GetApp.close(); GetApp.btn.focus(); } });
    GetApp.arm(sys).then(function (arm) {
      GetApp.guess = sys + "-" + (sys === "linux" ? (arm ? "arm64" : "x86_64") : (arm ? "arm64" : "x64"));
    });
  },
  render() {
    const best = GetApp.FILES.find(function (f) { return f.id === GetApp.guess; }) || null;
    const others = GetApp.FILES.filter(function (f) { return f !== best; });
    const link = function (f, cls) { return '<a class="' + cls + '" role="menuitem" href="' + escAttr(GetApp.url(f)) + '">' + esc(f.label) + '<span>' + esc(f.file.replace(/^.*\./, ".")) + "</span></a>"; };
    GetApp.pop.innerHTML = '<div class="ga-head">CarbonFibre desktop app</div>' +
      '<p class="ga-lede">The same app, with your notes as files and Obsidian plugins. It updates itself when there\'s a new version.</p>' +
      (best ? '<div class="ga-best-label">For this computer</div>' + link(best, "ga-best") : "") +
      '<div class="ga-others">' + others.map(function (f) { return link(f, "ga-link"); }).join("") + "</div>" +
      '<a class="ga-all" href="' + escAttr(GetApp.RELEASE) + '" target="_blank" rel="noopener">All downloads and what\'s new</a>' +
      '<p class="ga-note">Not signed yet. macOS: open it once, then System Settings, Privacy &amp; Security, Open Anyway. Windows: More info, then Run anyway.</p>';
    GetApp.pop.addEventListener("click", function (e) { if (e.target.closest("a")) setTimeout(GetApp.close, 50); }, { once: true });
  },
  toggle() { if (GetApp.pop.hidden) GetApp.open(); else GetApp.close(); },
  open() {
    GetApp.render();
    GetApp.pop.hidden = false;
    GetApp.btn.setAttribute("aria-expanded", "true");
    const first = GetApp.pop.querySelector("a");
    if (first) first.focus();
  },
  close() { if (!GetApp.pop) return; GetApp.pop.hidden = true; GetApp.btn.setAttribute("aria-expanded", "false"); },

  /* ---- the desktop app: "Update available" ---- */
  initUpdates(right) {
    const u = Dialogs.desktop.updates;
    if (!u) return;
    const b = document.createElement("button");
    b.className = "sb-btn ga-update";
    b.id = "btnUpdate";
    b.hidden = true;
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg><span></span>';
    b.addEventListener("click", function () { u.install().catch(function () {}); });
    right.insertBefore(b, right.firstChild);
    GetApp.upd = b;
    u.onChange(GetApp.showUpdate);
    u.state().then(GetApp.showUpdate).catch(function () {});
  },
  showUpdate(st) {
    const b = GetApp.upd;
    if (!b || !st) return;
    const label = b.querySelector("span");
    if (st.status === "available") {
      label.textContent = "Update available (" + st.latest + ")";
      b.title = (st.error ? st.error + " " : "") + (st.canInstall ? "Click to update CarbonFibre and restart" : "Click to download it from GitHub");
    } else if (st.status === "downloading") {
      label.textContent = "Downloading update… " + (st.progress || 0) + "%";
      b.title = "CarbonFibre restarts when it's ready";
    } else if (st.status === "installing") {
      label.textContent = "Restarting to update…";
    }
    b.hidden = ["available", "downloading", "installing"].indexOf(st.status) === -1;
    b.disabled = st.status !== "available";
  },
  paletteCommands() {
    if (Dialogs.desktop || !GetApp.btn) return [];
    return [{ label: "Get the desktop app", run: GetApp.open }];
  }
};
GetApp.init();
