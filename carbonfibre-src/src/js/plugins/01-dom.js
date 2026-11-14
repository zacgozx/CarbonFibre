/* ============================================================
   Obsidian plugins 1/5: the DOM helpers plugins expect (desktop app only).
   Obsidian adds methods such as createEl, empty and addClass to every element, and globals such
   as createDiv and sleep. They are added only when the first plugin is about to run, which never
   happens in the browser build, and never over a name that already exists.
   ============================================================ */
const PluginDom = {
  installed: false,

  /* createEl's options: a class string, or { cls, text, attr, title, value, type, placeholder, href, parent, prepend } */
  apply(el, o) {
    if (typeof o === "string") o = { cls: o };
    if (!o) return el;
    if (o.cls) {
      const cls = Array.isArray(o.cls) ? o.cls : String(o.cls).split(/\s+/);
      cls.forEach(function (c) { if (c) el.classList.add(c); });
    }
    if (o.text !== undefined && o.text !== null) {
      if (o.text instanceof Node) el.appendChild(o.text); else el.textContent = String(o.text);
    }
    if (o.attr) Object.keys(o.attr).forEach(function (k) {
      const v = o.attr[k];
      if (v === null || v === undefined || v === false) return;
      el.setAttribute(k, v === true ? "" : String(v));
    });
    if (o.title !== undefined) el.title = o.title;
    if (o.value !== undefined && "value" in el) el.value = o.value;
    if (o.type !== undefined) el.setAttribute("type", o.type);
    if (o.placeholder !== undefined) el.setAttribute("placeholder", o.placeholder);
    if (o.href !== undefined) el.setAttribute("href", o.href);
    if (o.parent) { if (o.prepend) o.parent.insertBefore(el, o.parent.firstChild); else o.parent.appendChild(el); }
    return el;
  },
  make(tag, o, cb, parent, ns) {
    const el = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    PluginDom.apply(el, o);
    if (parent && !el.parentNode) {
      if (o && typeof o === "object" && o.prepend) parent.insertBefore(el, parent.firstChild); else parent.appendChild(el);
    }
    if (typeof cb === "function") cb(el);
    return el;
  },

  install() {
    if (PluginDom.installed) return;
    PluginDom.installed = true;
    const SVG = "http://www.w3.org/2000/svg";
    const def = function (target, name, value) {
      if (name in target) return;
      Object.defineProperty(target, name, { value: value, writable: true, configurable: true, enumerable: false });
    };
    const getter = function (target, name, get) {
      if (name in target) return;
      Object.defineProperty(target, name, { get: get, configurable: true, enumerable: false });
    };
    const N = Node.prototype, E = Element.prototype, W = window;

    /* ---- building ---- */
    def(N, "createEl", function (tag, o, cb) { return PluginDom.make(tag, o, cb, this); });
    def(N, "createDiv", function (o, cb) { return PluginDom.make("div", o, cb, this); });
    def(N, "createSpan", function (o, cb) { return PluginDom.make("span", o, cb, this); });
    def(N, "createSvg", function (tag, o, cb) { return PluginDom.make(tag, o, cb, this, SVG); });
    def(N, "empty", function () { while (this.firstChild) this.removeChild(this.firstChild); });
    def(N, "detach", function () { if (this.parentNode) this.parentNode.removeChild(this); });
    def(N, "appendText", function (t) { this.appendChild(document.createTextNode(String(t))); });
    def(N, "insertAfter", function (node, child) { this.insertBefore(node, child ? child.nextSibling : this.firstChild); return node; });
    def(N, "indexOf", function (other) { return Array.prototype.indexOf.call(this.childNodes, other); });
    def(N, "setChildrenInPlace", function (kids) {
      const want = new Set(kids);
      Array.from(this.childNodes).forEach(function (c) { if (!want.has(c)) c.parentNode.removeChild(c); });
      kids.forEach(function (k) { this.appendChild(k); }, this);
    });
    def(N, "instanceOf", function (type) { return this instanceof type; });
    def(N, "constructorWin", W);
    getter(N, "doc", function () { return this.ownerDocument || document; });
    getter(N, "win", function () { return (this.ownerDocument || document).defaultView || window; });

    /* ---- classes, text, attributes ---- */
    def(E, "getText", function () { return this.textContent || ""; });
    def(E, "setText", function (v) {
      if (v instanceof Node) { this.empty(); this.appendChild(v); } else this.textContent = v === undefined || v === null ? "" : String(v);
    });
    def(E, "addClass", function () { for (let i = 0; i < arguments.length; i++) String(arguments[i]).split(/\s+/).forEach(function (c) { if (c) this.classList.add(c); }, this); });
    def(E, "addClasses", function (list) { (list || []).forEach(function (c) { this.addClass(c); }, this); });
    def(E, "removeClass", function () { for (let i = 0; i < arguments.length; i++) String(arguments[i]).split(/\s+/).forEach(function (c) { if (c) this.classList.remove(c); }, this); });
    def(E, "removeClasses", function (list) { (list || []).forEach(function (c) { this.removeClass(c); }, this); });
    def(E, "toggleClass", function (cls, on) {
      (Array.isArray(cls) ? cls : String(cls).split(/\s+/)).forEach(function (c) { if (c) this.classList.toggle(c, on === undefined ? undefined : !!on); }, this);
    });
    def(E, "hasClass", function (c) { return this.classList.contains(c); });
    def(E, "setAttr", function (k, v) { if (v === null || v === undefined || v === false) this.removeAttribute(k); else this.setAttribute(k, v === true ? "" : String(v)); });
    def(E, "setAttrs", function (o) { Object.keys(o || {}).forEach(function (k) { this.setAttr(k, o[k]); }, this); });
    def(E, "getAttr", function (k) { return this.getAttribute(k); });
    def(E, "matchParent", function (sel, last) {
      let el = this;
      while (el && el !== last) { if (el.matches && el.matches(sel)) return el; el = el.parentElement; }
      return null;
    });
    def(E, "getCssPropertyValue", function (prop, pseudo) { return getComputedStyle(this, pseudo).getPropertyValue(prop); });
    def(E, "isActiveElement", function () { return document.activeElement === this; });
    def(E, "find", function (sel) { return this.querySelector(sel); });
    def(E, "findAll", function (sel) { return Array.from(this.querySelectorAll(sel)); });
    def(E, "findAllSelf", function (sel) { const out = Array.from(this.querySelectorAll(sel)); if (this.matches(sel)) out.unshift(this); return out; });

    /* ---- showing, styles, events ---- */
    def(E, "show", function () { this.style.display = ""; });
    def(E, "hide", function () { this.style.display = "none"; });
    def(E, "toggle", function (on) { this.style.display = on ? "" : "none"; });
    def(E, "toggleVisibility", function (on) { this.style.visibility = on ? "" : "hidden"; });
    def(E, "isShown", function () { return this.isConnected && getComputedStyle(this).display !== "none"; });
    def(E, "setCssStyles", function (o) { Object.keys(o || {}).forEach(function (k) { this.style[k] = o[k]; }, this); });
    def(E, "setCssProps", function (o) { Object.keys(o || {}).forEach(function (k) { this.style.setProperty(k, o[k]); }, this); });
    getter(E, "innerWidth", function () { return this.clientWidth; });
    getter(E, "innerHeight", function () { return this.clientHeight; });
    def(E, "onClickEvent", function (fn, opts) { this.addEventListener("click", fn, opts); this.addEventListener("auxclick", fn, opts); });
    def(N, "on", function (type, sel, fn, opts) {
      if (!this._cfDelegates) Object.defineProperty(this, "_cfDelegates", { value: [], enumerable: false });
      const wrapped = function (e) {
        const t = e.target && e.target.closest ? e.target.closest(sel) : null;
        if (t && this.contains(t)) fn.call(this, e, t);
      };
      this._cfDelegates.push({ type: type, sel: sel, fn: fn, wrapped: wrapped });
      this.addEventListener(type, wrapped, opts);
    });
    def(N, "off", function (type, sel, fn, opts) {
      (this._cfDelegates || []).filter(function (d) { return d.type === type && d.sel === sel && d.fn === fn; }).forEach(function (d) {
        this.removeEventListener(type, d.wrapped, opts);
        this._cfDelegates.splice(this._cfDelegates.indexOf(d), 1);
      }, this);
    });
    def(N, "trigger", function (type) { this.dispatchEvent(new Event(type, { bubbles: true })); });
    def(E, "onNodeInserted", function (fn, once) {
      const el = this;
      let done = false;
      const check = function () { if (done) return; if (el.isConnected) { fn(); if (once) { done = true; return; } } requestAnimationFrame(check); };
      requestAnimationFrame(check);
      return function () { done = true; };
    });
    def(E, "onWindowMigrated", function () { return function () {}; });

    /* ---- globals ---- */
    def(W, "createEl", function (tag, o, cb) { return PluginDom.make(tag, o, cb, null); });
    def(W, "createDiv", function (o, cb) { return PluginDom.make("div", o, cb, null); });
    def(W, "createSpan", function (o, cb) { return PluginDom.make("span", o, cb, null); });
    def(W, "createSvg", function (tag, o, cb) { return PluginDom.make(tag, o, cb, null, SVG); });
    def(W, "createFragment", function (cb) { const f = document.createDocumentFragment(); if (typeof cb === "function") cb(f); return f; });
    def(W, "sleep", function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); });
    def(W, "nextFrame", function () { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); });
    def(W, "activeWindow", W);
    def(W, "activeDocument", document);
    def(W, "fish", function (sel) { return document.querySelector(sel); });
    def(W, "fishAll", function (sel) { return Array.from(document.querySelectorAll(sel)); });
    def(W, "isBoolean", function (v) { return typeof v === "boolean"; });
    def(W, "ready", function (fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); });
    def(W, "DomElementInfo", Object);

    /* ---- small additions to built-in types ---- */
    const A = Array.prototype;
    def(A, "contains", function (x) { return this.indexOf(x) !== -1; });
    def(A, "remove", function (x) { const i = this.indexOf(x); if (i !== -1) this.splice(i, 1); });
    def(A, "first", function () { return this[0]; });
    def(A, "last", function () { return this[this.length - 1]; });
    def(A, "unique", function () { return Array.from(new Set(this)); });
    def(A, "shuffle", function () {
      for (let i = this.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = this[i]; this[i] = this[j]; this[j] = t; }
      return this;
    });
    def(Array, "combine", function (arrays) { return [].concat.apply([], arrays); });
    def(String.prototype, "contains", function (s) { return this.indexOf(s) !== -1; });
    def(String.prototype, "format", function () { const args = arguments; return this.replace(/\{(\d+)\}/g, function (m, i) { return args[i] !== undefined ? args[i] : m; }); });
    def(String, "isString", function (v) { return typeof v === "string"; });
    def(Number, "isNumber", function (v) { return typeof v === "number"; });
    def(Math, "clamp", function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); });
    def(Math, "square", function (v) { return v * v; });
    def(Object, "isEmpty", function (o) { return !o || Object.keys(o).length === 0; });
    def(Object, "each", function (o, fn, ctx) { Object.keys(o || {}).forEach(function (k) { fn.call(ctx, o[k], k); }); });
  }
};
