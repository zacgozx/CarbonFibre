/* ============================================================
   Your own theme: an accent colour, and optionally a stylesheet of your own.
   Both become one stylesheet kept in browser storage ("carbonfibre-user-css"). The script in
   the page's head puts it in <style id="cfUserTheme"> before anything is drawn, so the page
   never flashes the default colours first. The page's security policy lets a stylesheet load
   nothing from outside (images and fonts from data: only, no requests), so pasted CSS can
   restyle the app but can't send anything anywhere.
   Opened from the command palette: "Theme: accent colour and custom CSS".
   ============================================================ */
const UserTheme = {
  KEY: "carbonfibre-user-css", ACCENT: "carbonfibre-accent", SNIPPET: "carbonfibre-user-snippet",
  MAX: 200000,                                   /* characters of CSS: plenty for a theme, small for storage */
  el: null,
  /* the variables worth setting, as listed in the window and in carbonfibre-src/README.md */
  VARS: [
    ["--bg", "page background (notes, sheets)"], ["--panel", "side bars, dialogs, cards"], ["--chrome", "title bar and activity bar"],
    ["--txt", "text"], ["--dim", "secondary text, icons"], ["--line", "borders and dividers"],
    ["--acc", "accent: buttons, focus, the active tab"], ["--acc-text", "accent text: links, headings marks"], ["--acc-soft", "accent background: hover, selected rows"],
    ["--sel", "selected text and lines"], ["--h1c / --h2c", "heading colours"], ["--sans / --mono", "fonts (installed ones only)"]
  ],

  read(key) { try { return localStorage.getItem(key) || ""; } catch (e) { return ""; } },
  accent() { const a = UserTheme.read(UserTheme.ACCENT); return /^#[0-9a-f]{6}$/i.test(a) ? a.toLowerCase() : ""; },
  snippet() { return UserTheme.read(UserTheme.SNIPPET); },

  /* ---- colour arithmetic: enough to keep a chosen accent readable in both themes ---- */
  rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; },
  hex(c) { return "#" + c.map(function (v) { return Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0"); }).join(""); },
  mix(c, to, k) { return c.map(function (v, i) { return v + (to[i] - v) * k; }); },
  lum(c) {
    const f = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  },
  contrast(a, b) { const x = UserTheme.lum(a), y = UserTheme.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); },
  /* step c toward `to` until it reads at `need`:1 against `against` */
  until(c, to, against, need) {
    for (let k = 0; k <= 1.0001; k += 0.04) { const m = UserTheme.mix(c, to, k); if (UserTheme.contrast(m, against) >= need) return m; }
    return to;
  },
  /* the accent's variables for the dark and the light theme */
  accentVars(hex) {
    const U = UserTheme, a = U.rgb(hex), white = [255, 255, 255], black = [0, 0, 0];
    const darkBg = U.rgb("#18181b"), r = function (c, al) { return "rgba(" + c.map(Math.round).join(",") + "," + al + ")"; };
    const dText = U.until(a, white, darkBg, 4.5);
    const lAcc = U.until(a, black, white, 4.5);       /* white button text stays readable on it */
    const lText = U.until(lAcc, black, white, 5);
    return {
      dark: { "--acc": hex, "--acc-text": U.hex(dText), "--acc-soft": r(a, 0.18), "--acc-rgb": a.join(","),
              "--sel": r(a, 0.24), "--sel-soft": r(a, 0.12) },
      light: { "--acc": U.hex(lAcc), "--acc-text": U.hex(lText), "--acc-soft": U.hex(U.mix(lAcc, white, 0.88)), "--acc-rgb": lAcc.map(Math.round).join(","),
               "--sel": U.hex(U.mix(lAcc, white, 0.82)), "--sel-soft": U.hex(U.mix(lAcc, white, 0.92)) },
      icon: { dark: { mid: hex, deep: U.hex(U.mix(a, black, 0.25)), lite: U.hex(dText), hi: U.hex(U.mix(a, white, 0.65)) },
              light: { mid: U.hex(lAcc), deep: U.hex(lText), lite: U.hex(U.mix(a, white, 0.35)), hi: U.hex(U.mix(a, white, 0.65)) } }
    };
  },
  /* the butterfly's wing colours when an accent is chosen (js/44-shortcuts.js draws it) */
  iconColours(light) { const a = UserTheme.accent(); return a ? UserTheme.accentVars(a).icon[light ? "light" : "dark"] : {}; },

  css(accent, snippet) {
    let out = "";
    if (accent) {
      const v = UserTheme.accentVars(accent);
      const block = function (o) { return Object.keys(o).map(function (k) { return k + ":" + o[k]; }).join(";"); };
      out += "/* accent */\n:root{" + block(v.dark) + "}\n:root[data-theme=\"light\"]{" + block(v.light) + "}\n";
    }
    if (snippet.trim()) out += "/* your CSS */\n" + snippet + "\n";
    return out;
  },
  /* store both parts and the stylesheet made from them, then show it */
  save(accent, snippet, quick) {
    if (snippet.length > UserTheme.MAX) { pushToastLike("That stylesheet is too long (over " + UserTheme.MAX / 1000 + "k characters)."); return false; }
    const all = UserTheme.css(accent, snippet);
    const put = function (k, v) { if (v) return storeSet(k, v); try { localStorage.removeItem(k); } catch (e) { /* storage off */ } return true; };
    put(UserTheme.ACCENT, accent); put(UserTheme.SNIPPET, snippet); put(UserTheme.KEY, all);
    UserTheme.apply(all, quick);
    return true;
  },
  apply(all, quick) {
    let st = document.getElementById("cfUserTheme");
    if (!all) { if (st) st.remove(); }
    else {
      if (!st) { st = document.createElement("style"); st.id = "cfUserTheme"; document.head.appendChild(st); }
      st.textContent = all;
    }
    if (!quick && typeof setTheme === "function") setTheme(isLight() ? "light" : "dark");   /* canvases and the icon pick up the colours */
  },

  /* ---- the window ---- */
  build() {
    if (UserTheme.el) return;
    const w = document.createElement("div");
    w.className = "cfp-win cfth-win";
    w.hidden = true;
    w.innerHTML =
      '<div class="cfp-dialog cfth-dialog" role="dialog" aria-modal="true" aria-labelledby="cfthTitle">' +
        '<div class="cfp-head"><h2 id="cfthTitle">Theme</h2><span class="cfth-gap"></span>' +
          '<button class="cfp-x" data-cfth="close" title="Close (Esc)" aria-label="Close">&times;</button></div>' +
        '<div class="cfp-body">' +
          '<h3 class="cfth-h">Accent colour</h3>' +
          '<div class="cfth-row"><input type="color" id="cfthAccent" aria-label="Accent colour">' +
            '<span class="cfth-swatch" id="cfthAccentHex"></span>' +
            '<button class="cfp-btn" data-cfth="default">Default</button></div>' +
          '<p class="cfp-count">Adjusted for each theme so text on it stays readable.</p>' +
          '<h3 class="cfth-h">Your CSS</h3>' +
          '<textarea id="cfthCss" class="cfth-css" spellcheck="false" placeholder=":root { --bg: #101014; }&#10;:root[data-theme=&quot;light&quot;] { --bg: #fdfdfd; }"></textarea>' +
          '<div class="cfth-row"><button class="cfp-btn cfp-primary" data-cfth="apply">Apply</button>' +
            '<button class="cfp-btn" data-cfth="load">Load .css file…</button>' +
            '<button class="cfp-btn" data-cfth="clear">Clear</button>' +
            '<input type="file" id="cfthFile" accept=".css,text/css" hidden></div>' +
          '<details class="cfp-details cfth-vars"><summary>Variables you can set</summary><ul></ul>' +
            '<p class="cfp-count">Set them in <code>:root { }</code> for the dark theme and <code>:root[data-theme="light"] { }</code> for the light one. ' +
            'Stylesheets can\'t load anything from the internet here: images and fonts only from <code>data:</code>.</p></details>' +
        "</div></div>";
    w.querySelector(".cfth-vars ul").innerHTML = UserTheme.VARS.map(function (v) { return "<li><code>" + esc(v[0]) + "</code> " + esc(v[1]) + "</li>"; }).join("");
    document.body.appendChild(w);
    UserTheme.el = w;
    const acc = w.querySelector("#cfthAccent"), ta = w.querySelector("#cfthCss"), file = w.querySelector("#cfthFile");
    w.addEventListener("mousedown", function (e) { if (e.target === w) UserTheme.close(); });
    w.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); UserTheme.close(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target === ta) { e.preventDefault(); UserTheme.save(UserTheme.accent(), ta.value); }
    });
    /* while dragging: the stylesheet only; on letting go: canvases and the icon too */
    acc.addEventListener("input", function () { UserTheme.save(acc.value.toLowerCase(), UserTheme.snippet(), true); UserTheme.showAccent(); });
    acc.addEventListener("change", function () { UserTheme.save(acc.value.toLowerCase(), UserTheme.snippet()); });
    file.addEventListener("change", function () {
      const f = file.files && file.files[0];
      if (!f) return;
      f.text().then(function (t) { ta.value = t; UserTheme.save(UserTheme.accent(), t); file.value = ""; });
    });
    w.addEventListener("click", function (e) {
      const b = e.target.closest("[data-cfth]");
      if (!b) return;
      const what = b.dataset.cfth;
      if (what === "close") UserTheme.close();
      else if (what === "default") { UserTheme.save("", UserTheme.snippet()); UserTheme.showAccent(); }
      else if (what === "apply") UserTheme.save(UserTheme.accent(), ta.value);
      else if (what === "load") file.click();
      else if (what === "clear") { ta.value = ""; UserTheme.save(UserTheme.accent(), ""); }
    });
  },
  showAccent() {
    const a = UserTheme.accent(), acc = UserTheme.el.querySelector("#cfthAccent");
    acc.value = a || (isLight() ? "#2563eb" : "#5b8def");
    UserTheme.el.querySelector("#cfthAccentHex").textContent = a ? a : "default";
  },
  open() {
    UserTheme.build();
    UserTheme.el.querySelector("#cfthCss").value = UserTheme.snippet();
    UserTheme.showAccent();
    UserTheme.el.hidden = false;
    UserTheme.el.querySelector("#cfthAccent").focus();
  },
  close() { if (UserTheme.el) UserTheme.el.hidden = true; },
  reset() { UserTheme.save("", ""); pushToastLike("Back to the default theme."); },
  paletteCommands() {
    return [
      { label: "Theme: accent colour and custom CSS", run: UserTheme.open },
      { label: "Theme: back to the default colours", run: UserTheme.reset }
    ];
  }
};
