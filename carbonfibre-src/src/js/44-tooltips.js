/* ============================================================
   Tooltips. Every title="..." in the app becomes one of these instead of the browser's slow
   built-in tooltip:
   - shows after a short pause on hover, or when you Tab to the control; once one has shown, the
     next control's shows at once, so you can sweep along a toolbar
   - a trailing shortcut ("Graph (Ctrl+G)") shows as keys, as Mac keys on a Mac (Cmd, Option)
   - you can move the pointer onto it without it going (WCAG 1.4.13), Esc closes it (that Esc does
     nothing else), and it opens beside the left icon bar's icons so it never covers the next one
   - screen readers: a tooltip that says more than the control's name becomes its description; one
     that only repeats the name isn't read twice; a control with no name of its own takes it as name
   The title stays readable and writable from code (el.title); only the attribute goes, which is
   what makes the browser show its own tooltip. No libraries: the app is one file that works offline.
   ============================================================ */
const Tips = {
  el: null, descBox: null, descIds: new Map(), cur: null, showT: 0, hideT: 0, warmUntil: 0,
  DELAY: 450, WARM: 800, LINGER: 120,
  mac: /Mac|iPhone|iPad/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ""),
  INTERACTIVE: "button, a[href], input, select, textarea, summary, [tabindex], [role=button], [role=tab], [role=menuitem], [role=checkbox], [role=switch]",

  init() {
    const t = document.createElement("div");
    t.id = "cfTip"; t.className = "cf-tip"; t.setAttribute("role", "tooltip"); t.hidden = true;
    if (Object.prototype.hasOwnProperty.call(HTMLElement.prototype, "popover")) t.setAttribute("popover", "manual");   /* top layer: above dialogs too */
    document.body.appendChild(t);
    Tips.el = t;
    const box = document.createElement("div");
    box.id = "cfTipDescs"; box.hidden = true;
    document.body.appendChild(box);
    Tips.descBox = box;
    Tips.adopt(document.body);
    new MutationObserver(function (records) {
      records.forEach(function (m) {
        if (m.type === "attributes") { if (m.target.hasAttribute && m.target.hasAttribute("title")) Tips.adopt(m.target); }
        else m.addedNodes.forEach(function (n) { if (n.nodeType === 1) Tips.adopt(n); });
      });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["title"] });

    document.addEventListener("pointerover", function (e) {
      if (e.pointerType === "touch") return;
      if (Tips.el.contains(e.target)) { clearTimeout(Tips.hideT); return; }   /* onto the tooltip itself: it stays */
      const host = e.target.closest && e.target.closest("[data-tip]");
      if (host === Tips.cur && host) { clearTimeout(Tips.hideT); return; }
      if (host) Tips.want(host); else Tips.leave();
    }, true);
    document.documentElement.addEventListener("pointerleave", function () { Tips.leave(); });
    document.addEventListener("focusin", function (e) {
      const host = e.target.closest && e.target.closest("[data-tip]");
      if (host && e.target.matches(":focus-visible")) Tips.want(host);
    });
    document.addEventListener("focusout", function () { if (Tips.cur && !Tips.cur.matches(":hover")) Tips.hide(); });
    document.addEventListener("pointerdown", function (e) { if (!Tips.el.contains(e.target)) Tips.hide(); }, true);
    window.addEventListener("scroll", function () { Tips.hide(); }, true);
    window.addEventListener("blur", function () { Tips.hide(); });
    /* Esc: closes the tooltip, and only that, the first time */
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && Tips.shown()) { e.preventDefault(); e.stopImmediatePropagation(); Tips.hide(); }
      else if (Tips.shown() && e.key !== "Shift") Tips.hide();
    }, true);
  },

  /* title -> data-tip, with the accessible name or description it carried */
  adopt(root) {
    const list = root.hasAttribute && root.hasAttribute("title") ? [root] : [];
    if (root.querySelectorAll) Array.prototype.push.apply(list, root.querySelectorAll("[title]"));
    list.forEach(function (el) {
      if (el === Tips.el || el.closest("svg") || el.tagName === "IFRAME" || el.closest(".graph-side")) return;
      const t = el.getAttribute("title");
      el.removeAttribute("title");
      Tips.set(el, t);
    });
  },
  set(el, text) {
    const t = String(text == null ? "" : text);
    if (!Object.prototype.hasOwnProperty.call(el, "title")) {
      Object.defineProperty(el, "title", { configurable: true, get: function () { return el.dataset.tip || ""; }, set: function (v) { Tips.set(el, v); } });
    }
    const old = el.dataset.tip;
    if (t) el.dataset.tip = t; else delete el.dataset.tip;
    if (Tips.cur === el && Tips.shown()) { if (t) Tips.fill(el); else Tips.hide(); }
    if (!el.matches(Tips.INTERACTIVE)) return;
    const plain = Tips.parse(t).text, oldPlain = old ? Tips.parse(old).text : "";
    if (el.getAttribute("aria-label") === oldPlain && el.dataset.tipLabel) el.removeAttribute("aria-label");
    const ids = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (id) { return id && id.indexOf("cfTipD") !== 0; });
    const name = Tips.nameOf(el);
    if (!plain) { /* nothing to add */ }
    else if (!name) { el.setAttribute("aria-label", plain); el.dataset.tipLabel = "1"; }
    else if (Tips.norm(name) !== Tips.norm(plain) && Tips.norm(name) !== Tips.norm(t)) ids.push(Tips.descId(t));
    if (ids.length) el.setAttribute("aria-describedby", ids.join(" ")); else el.removeAttribute("aria-describedby");
  },
  nameOf(el) {
    const lb = el.getAttribute("aria-labelledby");
    if (lb) return lb.split(/\s+/).map(function (id) { const x = document.getElementById(id); return x ? x.textContent : ""; }).join(" ");
    if (el.getAttribute("aria-label") && !el.dataset.tipLabel) return el.getAttribute("aria-label");
    let s = el.textContent || "";
    el.querySelectorAll("img[alt]").forEach(function (i) { s += " " + i.alt; });
    return s.trim();
  },
  norm(s) { return String(s || "").replace(/\s+/g, " ").trim().toLowerCase(); },
  /* one hidden description per distinct text, shared by every control that says it */
  descId(text) {
    if (Tips.descIds.has(text)) return Tips.descIds.get(text);
    const id = "cfTipD" + (Tips.descIds.size + 1), s = document.createElement("span");
    s.id = id; s.textContent = text;
    Tips.descBox.appendChild(s);
    Tips.descIds.set(text, id);
    return id;
  },
  /* "Graph (Ctrl+G)" -> text "Graph", keys ["Ctrl", "G"] */
  parse(t) {
    const m = /\s*\(((?:(?:Ctrl|Alt|Shift|Cmd|Meta|Option)\+)+(?:[^()\s]|[A-Za-z0-9]+)|F\d{1,2}|[A-Z0-9]|Shift\+\d|Del|Esc)\)\s*$/.exec(t);
    if (!m) return { text: t, keys: [] };
    const keys = m[1].replace(/\+\+$/, "+Plus").split("+").map(function (k) { return k === "Plus" ? "+" : k; });
    return { text: t.slice(0, m.index), keys: keys };
  },
  keyLabel(k) {
    if (!Tips.mac) return k;
    return { Ctrl: "⌘", Cmd: "⌘", Meta: "⌘", Alt: "⌥", Option: "⌥", Shift: "⇧" }[k] || k;
  },
  shown() { return !!Tips.el && !Tips.el.hidden; },

  want(host) {
    clearTimeout(Tips.hideT); clearTimeout(Tips.showT);
    if (Tips.cur !== host && Tips.shown()) Tips.hide(true);
    Tips.cur = host;
    if (performance.now() < Tips.warmUntil) Tips.show(host);
    else Tips.showT = setTimeout(function () { if (Tips.cur === host && host.isConnected) Tips.show(host); }, Tips.DELAY);
  },
  leave() {
    clearTimeout(Tips.showT);
    if (!Tips.shown()) { Tips.cur = null; return; }
    clearTimeout(Tips.hideT);
    Tips.hideT = setTimeout(function () { Tips.hide(); }, Tips.LINGER);   /* the gap between control and tooltip doesn't close it */
  },
  fill(host) {
    const p = Tips.parse(host.dataset.tip || "");
    Tips.el.textContent = p.text;
    if (p.keys.length) {
      const k = document.createElement("span");
      k.className = "cf-tip-keys";
      p.keys.forEach(function (key) { const kb = document.createElement("kbd"); kb.textContent = Tips.keyLabel(key); k.appendChild(kb); });
      Tips.el.appendChild(k);
    }
  },
  show(host) {
    if (!host.dataset.tip) return;
    Tips.fill(host);
    const t = Tips.el;
    t.hidden = false;
    if (t.showPopover && !t.matches(":popover-open")) { try { t.showPopover(); } catch (e) { /* not in the document */ } }
    const r = host.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight, vw = innerWidth, vh = innerHeight, gap = 6;
    let x, y;
    if (host.closest("#activity")) {                    /* the left icon bar: beside the icon, never over the next one */
      x = r.right + gap + 2; y = r.top + (r.height - h) / 2;
    } else {
      x = r.left + (r.width - w) / 2; y = r.bottom + gap;
      if (y + h > vh - 4) y = r.top - gap - h;          /* no room below: above */
    }
    t.style.left = Math.round(Math.max(4, Math.min(vw - w - 4, x))) + "px";
    t.style.top = Math.round(Math.max(4, Math.min(vh - h - 4, y))) + "px";
  },
  hide(keepWarm) {
    clearTimeout(Tips.showT); clearTimeout(Tips.hideT);
    if (Tips.shown()) {
      Tips.warmUntil = performance.now() + Tips.WARM;
      if (Tips.el.hidePopover && Tips.el.matches(":popover-open")) { try { Tips.el.hidePopover(); } catch (e) { /* closed already */ } }
      Tips.el.hidden = true;
    }
    if (!keepWarm) Tips.cur = null;
  }
};
Tips.init();
