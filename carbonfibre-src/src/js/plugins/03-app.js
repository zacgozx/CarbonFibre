/* ============================================================
   Obsidian plugins 3/5: the app a plugin talks to: app.vault (notes as files), app.metadataCache,
   app.workspace (panes, and a side panel for plugin views), the Editor over a pane,
   app.fileManager, plus Obsidian's helpers (moment, YAML, links, front matter).
   Notes stay CarbonFibre's own: every change goes through the same functions the app uses.
   ============================================================ */

/* ---- events and components ---- */
class PluginEvents {
  constructor() { this._ev = {}; }
  on(name, cb, ctx) { const ref = { e: this, name: name, fn: cb, ctx: ctx }; (this._ev[name] = this._ev[name] || []).push(ref); return ref; }
  off(name, cb) { const l = this._ev[name]; if (l) this._ev[name] = l.filter(function (r) { return r.fn !== cb; }); }
  offref(ref) { const l = ref && this._ev[ref.name]; if (l) this._ev[ref.name] = l.filter(function (r) { return r !== ref; }); }
  trigger(name) {
    const args = Array.prototype.slice.call(arguments, 1), l = (this._ev[name] || []).slice();
    l.forEach(function (r) { this.tryTrigger(r, args); }, this);
  }
  tryTrigger(ref, args) { try { ref.fn.apply(ref.ctx, args); } catch (e) { console.error(e); } }
}

class PluginComponent {
  constructor() { this._loaded = false; this._children = []; this._cleanup = []; }
  load() {
    if (this._loaded) return undefined;
    this._loaded = true;
    let r;
    try { r = this.onload(); } catch (e) { console.error(e); }
    this._children.slice().forEach(function (c) { c.load(); });
    return r;
  }
  onload() {}
  unload() {
    if (!this._loaded) return;
    this._loaded = false;
    this._children.slice().forEach(function (c) { c.unload(); });
    this._children = [];
    const fns = this._cleanup.splice(0).reverse();
    fns.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    try { this.onunload(); } catch (e) { console.error(e); }
  }
  onunload() {}
  addChild(c) { this._children.push(c); if (this._loaded) c.load(); return c; }
  removeChild(c) { const i = this._children.indexOf(c); if (i !== -1) { this._children.splice(i, 1); c.unload(); } return c; }
  register(fn) { this._cleanup.push(fn); }
  registerEvent(ref) { this.register(function () { if (ref && ref.e) ref.e.offref(ref); }); }
  registerDomEvent(el, type, cb, opts) { el.addEventListener(type, cb, opts); this.register(function () { el.removeEventListener(type, cb, opts); }); }
  registerScopeEvent(h) { this.register(function () { if (h && h.scope) h.scope.unregister(h); }); }
  registerInterval(id) { this.register(function () { clearInterval(id); }); return id; }
}

/* ---- dates: the parts of moment.js plugins use ---- */
const PluginTime = (function () {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const LONG = { LT: "h:mm A", LTS: "h:mm:ss A", L: "MM/DD/YYYY", LL: "MMMM D, YYYY", LLL: "MMMM D, YYYY h:mm A", LLLL: "dddd, MMMM D, YYYY h:mm A",
    l: "M/D/YYYY", ll: "MMM D, YYYY", lll: "MMM D, YYYY h:mm A", llll: "ddd, MMM D, YYYY h:mm A" };
  const UNIT = { y: "year", year: "year", years: "year", Q: "quarter", quarter: "quarter", quarters: "quarter", M: "month", month: "month", months: "month",
    w: "week", week: "week", weeks: "week", W: "isoWeek", isoWeek: "isoWeek", isoWeeks: "isoWeek", d: "day", day: "day", days: "day", D: "date", date: "date", dates: "date",
    h: "hour", hour: "hour", hours: "hour", m: "minute", minute: "minute", minutes: "minute", s: "second", second: "second", seconds: "second",
    ms: "millisecond", millisecond: "millisecond", milliseconds: "millisecond" };
  const MS = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5 };
  const pad = function (n, w) { n = String(Math.abs(Math.trunc(n))); while (n.length < w) n = "0" + n; return n; };
  const ord = function (n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const unitOf = function (u) { return UNIT[u] || UNIT[String(u || "").toLowerCase()] || String(u || "").toLowerCase(); };
  /* ISO week: Monday start, week 1 holds the first Thursday */
  const isoWeekInfo = function (d) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()), day = (t.getDay() + 6) % 7;
    t.setDate(t.getDate() - day + 3);
    const y = t.getFullYear(), first = new Date(y, 0, 4);
    return { week: 1 + Math.round(((t - first) / 864e5 - 3 + ((first.getDay() + 6) % 7)) / 7), year: y };
  };
  /* locale week (en): Sunday start, week 1 holds January 1; the week's Saturday decides its year */
  const weekInfo = function (d) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const sun = new Date(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay());
    const y = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 6).getFullYear();
    const jan1 = new Date(y, 0, 1), firstSun = new Date(y, 0, 1 - jan1.getDay());
    return { week: Math.round((sun - firstSun) / 6048e5) + 1, year: y };
  };
  const TOKENS = /\[([^\]]*)\]|YYYYYY|YYYY|YY|Qo|Q|MMMM|MMM|MM|Mo|M|DDDD|DDDo|DDD|DD|Do|D|dddd|ddd|dd|do|d|E|e|gggg|gg|GGGG|GG|wo|ww|w|Wo|WW|W|HH|H|hh|h|kk|k|mm|m|ss|s|SSS|SS|S|A|a|X|x|ZZ|Z|LTS|LT|LLLL|LLL|LL|L|llll|lll|ll|l/g;

  class Moment {
    constructor(d, valid) { this._d = d; this._isValid = valid !== false && !isNaN(d.getTime()); this._isAMomentObject = true; }
    clone() { return new Moment(new Date(this._d.getTime()), this._isValid); }
    isValid() { return this._isValid; }
    toDate() { return new Date(this._d.getTime()); }
    valueOf() { return this._d.getTime(); }
    unix() { return Math.floor(this._d.getTime() / 1000); }
    toISOString() { return this._isValid ? this._d.toISOString() : null; }
    toJSON() { return this.toISOString(); }
    toString() { return this._isValid ? this._d.toString() : "Invalid date"; }
    locale() { return arguments.length ? this : "en"; }
    lang() { return this.locale.apply(this, arguments); }
    localeData() { return moment.localeData(); }
    utc() { return this; }
    local() { return this; }
    utcOffset() { return -this._d.getTimezoneOffset(); }
    isLeapYear() { const y = this.year(); return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
    daysInMonth() { return new Date(this.year(), this.month() + 1, 0).getDate(); }
    format(f) {
      if (!this._isValid) return "Invalid date";
      const d = this._d, self = this;
      f = f === undefined ? "YYYY-MM-DDTHH:mm:ssZ" : String(f);
      f = f.replace(/LTS|LT|LLLL|LLL|LL|L|llll|lll|ll|l/g, function (k) { return LONG[k]; });
      return f.replace(TOKENS, function (tok, lit) {
        if (lit !== undefined) return lit;
        const H = d.getHours(), off = -d.getTimezoneOffset();
        switch (tok) {
          case "YYYYYY": return (d.getFullYear() < 0 ? "-" : "+") + pad(d.getFullYear(), 6);
          case "YYYY": return pad(d.getFullYear(), 4);
          case "YY": return pad(d.getFullYear() % 100, 2);
          case "Q": return String(self.quarter());
          case "Qo": return ord(self.quarter());
          case "MMMM": return MONTHS[d.getMonth()];
          case "MMM": return MONTHS[d.getMonth()].slice(0, 3);
          case "MM": return pad(d.getMonth() + 1, 2);
          case "Mo": return ord(d.getMonth() + 1);
          case "M": return String(d.getMonth() + 1);
          case "DDDD": return pad(self.dayOfYear(), 3);
          case "DDDo": return ord(self.dayOfYear());
          case "DDD": return String(self.dayOfYear());
          case "DD": return pad(d.getDate(), 2);
          case "Do": return ord(d.getDate());
          case "D": return String(d.getDate());
          case "dddd": return DAYS[d.getDay()];
          case "ddd": return DAYS[d.getDay()].slice(0, 3);
          case "dd": return DAYS[d.getDay()].slice(0, 2);
          case "do": return ord(d.getDay());
          case "d": case "e": return String(d.getDay());
          case "E": return String(self.isoWeekday());
          case "gggg": return pad(self.weekYear(), 4);
          case "gg": return pad(self.weekYear() % 100, 2);
          case "GGGG": return pad(self.isoWeekYear(), 4);
          case "GG": return pad(self.isoWeekYear() % 100, 2);
          case "ww": return pad(self.week(), 2);
          case "wo": return ord(self.week());
          case "w": return String(self.week());
          case "WW": return pad(self.isoWeek(), 2);
          case "Wo": return ord(self.isoWeek());
          case "W": return String(self.isoWeek());
          case "HH": return pad(H, 2);
          case "H": return String(H);
          case "hh": return pad(H % 12 || 12, 2);
          case "h": return String(H % 12 || 12);
          case "kk": return pad(H || 24, 2);
          case "k": return String(H || 24);
          case "mm": return pad(d.getMinutes(), 2);
          case "m": return String(d.getMinutes());
          case "ss": return pad(d.getSeconds(), 2);
          case "s": return String(d.getSeconds());
          case "SSS": return pad(d.getMilliseconds(), 3);
          case "SS": return pad(Math.floor(d.getMilliseconds() / 10), 2);
          case "S": return String(Math.floor(d.getMilliseconds() / 100));
          case "A": return H < 12 ? "AM" : "PM";
          case "a": return H < 12 ? "am" : "pm";
          case "X": return String(self.unix());
          case "x": return String(d.getTime());
          case "Z": return (off >= 0 ? "+" : "-") + pad(off / 60, 2) + ":" + pad(off % 60, 2);
          case "ZZ": return (off >= 0 ? "+" : "-") + pad(off / 60, 2) + pad(off % 60, 2);
          default: return tok;
        }
      });
    }
    get(u) { u = unitOf(u); return typeof this[u] === "function" ? this[u]() : NaN; }
    set(u, v) {
      if (u && typeof u === "object") { Object.keys(u).forEach(function (k) { this.set(k, u[k]); }, this); return this; }
      u = unitOf(u);
      if (typeof this[u] === "function") this[u](v);
      return this;
    }
    year(v) { if (v === undefined) return this._d.getFullYear(); this._d.setFullYear(v); return this; }
    month(v) {
      if (v === undefined) return this._d.getMonth();
      if (typeof v === "string") { const k = MONTHS.findIndex(function (m) { return m.toLowerCase().indexOf(v.toLowerCase().slice(0, 3)) === 0; }); if (k !== -1) v = k; }
      const day = this._d.getDate(); this._d.setDate(1); this._d.setMonth(v); this._d.setDate(Math.min(day, this.daysInMonth())); return this;
    }
    quarter(v) { if (v === undefined) return Math.floor(this._d.getMonth() / 3) + 1; return this.month((v - 1) * 3 + (this._d.getMonth() % 3)); }
    date(v) { if (v === undefined) return this._d.getDate(); this._d.setDate(v); return this; }
    dates(v) { return this.date(v); }
    day(v) {
      if (v === undefined) return this._d.getDay();
      if (typeof v === "string") v = DAYS.findIndex(function (d) { return d.toLowerCase().indexOf(v.toLowerCase().slice(0, 2)) === 0; });
      this._d.setDate(this._d.getDate() + (v - this._d.getDay())); return this;
    }
    weekday(v) { return this.day(v); }
    isoWeekday(v) { if (v === undefined) return this._d.getDay() || 7; return this.day(this._d.getDay() === 0 && v !== 7 ? v - 7 : v % 7 === 0 && this._d.getDay() !== 0 ? 7 : v); }
    dayOfYear(v) {
      const start = new Date(this._d.getFullYear(), 0, 1), cur = Math.round((new Date(this._d.getFullYear(), this._d.getMonth(), this._d.getDate()) - start) / 864e5) + 1;
      if (v === undefined) return cur;
      this._d.setDate(this._d.getDate() + (v - cur)); return this;
    }
    week(v) { const w = weekInfo(this._d).week; if (v === undefined) return w; return this.add((v - w) * 7, "day"); }
    weeks(v) { return this.week(v); }
    isoWeek(v) { const w = isoWeekInfo(this._d).week; if (v === undefined) return w; return this.add((v - w) * 7, "day"); }
    isoWeeks(v) { return this.isoWeek(v); }
    weekYear() { return weekInfo(this._d).year; }
    isoWeekYear() { return isoWeekInfo(this._d).year; }
    weeksInYear() { return moment([this.year(), 11, 28]).week() === 1 ? 52 : moment([this.year(), 11, 31]).week() === 1 ? 52 : 53; }
    isoWeeksInYear() { return isoWeekInfo(new Date(this.year(), 11, 28)).week; }
    hour(v) { if (v === undefined) return this._d.getHours(); this._d.setHours(v); return this; }
    hours(v) { return this.hour(v); }
    minute(v) { if (v === undefined) return this._d.getMinutes(); this._d.setMinutes(v); return this; }
    minutes(v) { return this.minute(v); }
    second(v) { if (v === undefined) return this._d.getSeconds(); this._d.setSeconds(v); return this; }
    seconds(v) { return this.second(v); }
    millisecond(v) { if (v === undefined) return this._d.getMilliseconds(); this._d.setMilliseconds(v); return this; }
    milliseconds(v) { return this.millisecond(v); }
    add(n, u) {
      if (n && typeof n === "object" && !(n instanceof Duration)) { Object.keys(n).forEach(function (k) { this.add(n[k], k); }, this); return this; }
      if (n instanceof Duration) { this._d = new Date(this._d.getTime() + n._ms); return this; }
      if (typeof n === "string" && typeof u === "number") { const t = n; n = u; u = t; }
      n = Number(n) || 0; u = unitOf(u || "ms");
      const d = this._d;
      if (u === "year") this.month(d.getMonth() + 12 * n);
      else if (u === "quarter") this.month(d.getMonth() + 3 * n);
      else if (u === "month") {
        const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, this.daysInMonth()));
      } else if (u === "week" || u === "isoWeek") d.setDate(d.getDate() + 7 * n);
      else if (u === "day" || u === "date") d.setDate(d.getDate() + n);
      else this._d = new Date(d.getTime() + n * (MS[u] || 1));
      return this;
    }
    subtract(n, u) { if (n && typeof n === "object" && !(n instanceof Duration)) { const o = {}; Object.keys(n).forEach(function (k) { o[k] = -n[k]; }); return this.add(o); } return this.add(n instanceof Duration ? moment.duration(-n._ms) : -n, u); }
    startOf(u) {
      u = unitOf(u); const d = this._d;
      if (u === "year") { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); }
      else if (u === "quarter") { d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1); d.setHours(0, 0, 0, 0); }
      else if (u === "month") { d.setDate(1); d.setHours(0, 0, 0, 0); }
      else if (u === "week") { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); }
      else if (u === "isoWeek") { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0); }
      else if (u === "day" || u === "date") d.setHours(0, 0, 0, 0);
      else if (u === "hour") d.setMinutes(0, 0, 0);
      else if (u === "minute") d.setSeconds(0, 0);
      else if (u === "second") d.setMilliseconds(0);
      return this;
    }
    endOf(u) { u = unitOf(u); if (!u || u === "millisecond") return this; return this.startOf(u).add(1, u === "date" ? "day" : u).add(-1, "ms"); }
    cmp(o, u) { const b = moment(o); if (!u) return this.valueOf() - b.valueOf(); return this.clone().startOf(u).valueOf() - b.clone().startOf(u).valueOf(); }
    isBefore(o, u) { return this.cmp(o, u) < 0; }
    isAfter(o, u) { return this.cmp(o, u) > 0; }
    isSame(o, u) { return this.cmp(o, u) === 0; }
    isSameOrBefore(o, u) { return this.cmp(o, u) <= 0; }
    isSameOrAfter(o, u) { return this.cmp(o, u) >= 0; }
    isBetween(a, b, u, inc) {
      inc = inc || "()";
      const left = inc[0] === "[" ? this.isSameOrAfter(a, u) : this.isAfter(a, u), right = inc[1] === "]" ? this.isSameOrBefore(b, u) : this.isBefore(b, u);
      return left && right;
    }
    diff(o, u, float) {
      const b = moment(o); u = unitOf(u || "ms");
      let r;
      if (u === "year" || u === "month" || u === "quarter") {
        const months = (this.year() - b.year()) * 12 + (this.month() - b.month());
        const anchor = b.clone().add(months, "month");
        const frac = (this.valueOf() - anchor.valueOf()) / Math.abs(anchor.clone().add(this.valueOf() >= anchor.valueOf() ? 1 : -1, "month").valueOf() - anchor.valueOf());
        r = months + frac;
        if (u === "year") r /= 12; else if (u === "quarter") r /= 3;
      } else r = (this.valueOf() - b.valueOf() - (u === "day" || u === "week" ? (this.utcOffset() - b.utcOffset()) * -6e4 : 0)) / (MS[u === "isoWeek" ? "week" : u] || 1);
      return float ? r : (r < 0 ? Math.ceil(r) : Math.floor(r));
    }
    from(o, noSuffix) { return moment.duration(this.valueOf() - moment(o).valueOf()).humanize(!noSuffix); }
    fromNow(noSuffix) { return this.from(moment(), noSuffix); }
    to(o, noSuffix) { return moment(o).from(this, noSuffix); }
    toNow(noSuffix) { return this.to(moment(), noSuffix); }
    calendar() {
      const days = this.clone().startOf("day").diff(moment().startOf("day"), "day");
      const t = this.format("h:mm A");
      if (days === 0) return "Today at " + t;
      if (days === 1) return "Tomorrow at " + t;
      if (days === -1) return "Yesterday at " + t;
      if (days > 1 && days < 7) return this.format("dddd") + " at " + t;
      if (days < -1 && days > -7) return "Last " + this.format("dddd") + " at " + t;
      return this.format("L");
    }
  }

  class Duration {
    constructor(ms) { this._ms = ms; }
    asMilliseconds() { return this._ms; }
    asSeconds() { return this._ms / 1e3; }
    asMinutes() { return this._ms / 6e4; }
    asHours() { return this._ms / 36e5; }
    asDays() { return this._ms / 864e5; }
    asWeeks() { return this._ms / 6048e5; }
    asMonths() { return this._ms / (864e5 * 30.436875); }
    asYears() { return this._ms / (864e5 * 365.2425); }
    as(u) { u = unitOf(u); return { millisecond: this._ms, second: this.asSeconds(), minute: this.asMinutes(), hour: this.asHours(), day: this.asDays(), week: this.asWeeks(), month: this.asMonths(), year: this.asYears() }[u]; }
    milliseconds() { return Math.trunc(this._ms % 1e3); }
    seconds() { return Math.trunc(this._ms / 1e3) % 60; }
    minutes() { return Math.trunc(this._ms / 6e4) % 60; }
    hours() { return Math.trunc(this._ms / 36e5) % 24; }
    days() { return Math.trunc(this.asDays() % 30.436875); }
    months() { return Math.trunc(this.asMonths() % 12); }
    years() { return Math.trunc(this.asYears()); }
    get(u) { u = unitOf(u); return typeof this[u + "s"] === "function" ? this[u + "s"]() : NaN; }
    add(n, u) { this._ms += moment.duration(n, u)._ms; return this; }
    subtract(n, u) { this._ms -= moment.duration(n, u)._ms; return this; }
    isValid() { return !isNaN(this._ms); }
    toISOString() { return "PT" + this.asSeconds() + "S"; }
    toJSON() { return this.toISOString(); }
    humanize(suffix) {
      const s = Math.abs(this._ms) / 1e3, m = s / 60, h = m / 60, d = h / 24, mo = d / 30.4, y = d / 365;
      const t = s < 45 ? "a few seconds" : s < 90 ? "a minute" : m < 45 ? Math.round(m) + " minutes" : m < 90 ? "an hour" : h < 22 ? Math.round(h) + " hours"
        : h < 36 ? "a day" : d < 26 ? Math.round(d) + " days" : d < 45 ? "a month" : d < 320 ? Math.round(mo) + " months" : y < 1.5 ? "a year" : Math.round(y) + " years";
      if (!suffix) return t;
      return this._ms >= 0 ? "in " + t : t + " ago";
    }
  }

  /* parsing with a format string */
  function parseWith(str, fmt, strict) {
    fmt = String(fmt).replace(/LTS|LT|LLLL|LLL|LL|L|llll|lll|ll|l/g, function (k) { return LONG[k]; });
    const parts = { Y: null, M: 0, D: 1, H: 0, m: 0, s: 0, ms: 0, pm: null, X: null, x: null, wk: null, wy: null, iso: false };
    const caps = [];
    let re = "";
    let last = 0;
    fmt.replace(TOKENS, function (tok, lit, at) {
      re += fmt.slice(last, at).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      last = at + tok.length;
      if (lit !== undefined) { re += lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return tok; }
      const names = MONTHS.map(function (n) { return n; }).join("|"), short = MONTHS.map(function (n) { return n.slice(0, 3); }).join("|");
      const days = DAYS.join("|") + "|" + DAYS.map(function (n) { return n.slice(0, 3); }).join("|") + "|" + DAYS.map(function (n) { return n.slice(0, 2); }).join("|");
      const map = { YYYY: "(\\d{4})", YY: "(\\d{2})", Q: "(\\d)", MMMM: "(" + names + ")", MMM: "(" + short + ")", MM: "(\\d{2})", M: "(\\d{1,2})", Mo: "(\\d{1,2})(?:st|nd|rd|th)",
        DDDD: "(\\d{3})", DDD: "(\\d{1,3})", DD: "(\\d{2})", D: "(\\d{1,2})", Do: "(\\d{1,2})(?:st|nd|rd|th)", dddd: "(?:" + days + ")", ddd: "(?:" + days + ")", dd: "(?:" + days + ")",
        d: "(?:\\d)", E: "(?:\\d)", e: "(?:\\d)", gggg: "(\\d{4})", GGGG: "(\\d{4})", gg: "(\\d{2})", GG: "(\\d{2})", ww: "(\\d{2})", WW: "(\\d{2})", w: "(\\d{1,2})", W: "(\\d{1,2})",
        HH: "(\\d{2})", H: "(\\d{1,2})", hh: "(\\d{2})", h: "(\\d{1,2})", kk: "(\\d{2})", k: "(\\d{1,2})", mm: "(\\d{2})", m: "(\\d{1,2})", ss: "(\\d{2})", s: "(\\d{1,2})",
        SSS: "(\\d{3})", SS: "(\\d{2})", S: "(\\d)", A: "(AM|PM|am|pm)", a: "(am|pm|AM|PM)", X: "(-?\\d+(?:\\.\\d+)?)", x: "(-?\\d+)", Z: "(?:[+-]\\d{2}:?\\d{2}|Z)", ZZ: "(?:[+-]\\d{2}:?\\d{2}|Z)" };
      const r = map[tok];
      if (!r) { re += tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return tok; }
      re += r;
      if (r.indexOf("(?:") !== 0) caps.push(tok);
      return tok;
    });
    re += fmt.slice(last).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp("^" + re + (strict ? "$" : ""), "i").exec(String(str).trim());
    if (!m) return null;
    caps.forEach(function (tok, i) {
      const v = m[i + 1];
      switch (tok) {
        case "YYYY": parts.Y = +v; break;
        case "YY": parts.Y = +v + (+v > 68 ? 1900 : 2000); break;
        case "Q": parts.M = (+v - 1) * 3; break;
        case "MMMM": case "MMM": parts.M = MONTHS.findIndex(function (n) { return n.toLowerCase().indexOf(v.toLowerCase()) === 0; }); break;
        case "MM": case "M": case "Mo": parts.M = +v - 1; break;
        case "DDDD": case "DDD": parts.doy = +v; break;
        case "DD": case "D": case "Do": parts.D = +v; break;
        case "gggg": case "GGGG": parts.wy = +v; parts.iso = tok === "GGGG"; break;
        case "gg": case "GG": parts.wy = +v + 2000; parts.iso = tok === "GG"; break;
        case "ww": case "w": parts.wk = +v; break;
        case "WW": case "W": parts.wk = +v; parts.iso = true; break;
        case "HH": case "H": case "hh": case "h": case "kk": case "k": parts.H = +v % 24; break;
        case "mm": case "m": parts.m = +v; break;
        case "ss": case "s": parts.s = +v; break;
        case "SSS": parts.ms = +v; break;
        case "SS": parts.ms = +v * 10; break;
        case "S": parts.ms = +v * 100; break;
        case "A": case "a": parts.pm = /pm/i.test(v); break;
        case "X": parts.X = +v; break;
        case "x": parts.x = +v; break;
        default: break;
      }
    });
    if (parts.X !== null) return new Date(parts.X * 1000);
    if (parts.x !== null) return new Date(parts.x);
    if (parts.pm !== null) { if (parts.pm && parts.H < 12) parts.H += 12; if (!parts.pm && parts.H === 12) parts.H = 0; }
    if (parts.wk !== null) {
      const y = parts.wy !== null ? parts.wy : parts.Y !== null ? parts.Y : new Date().getFullYear();
      let d;
      if (parts.iso) { d = new Date(y, 0, 4); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + (parts.wk - 1) * 7); }
      else { d = new Date(y, 0, 1); d.setDate(d.getDate() - d.getDay() + (parts.wk - 1) * 7); }
      d.setHours(parts.H, parts.m, parts.s, parts.ms);
      return d;
    }
    const Y = parts.Y !== null ? parts.Y : new Date().getFullYear();
    if (parts.doy) return new Date(Y, 0, parts.doy, parts.H, parts.m, parts.s, parts.ms);
    const d = new Date(Y, parts.M, parts.D, parts.H, parts.m, parts.s, parts.ms);
    if (strict && (d.getMonth() !== parts.M || d.getDate() !== parts.D)) return new Date(NaN);
    return d;
  }

  function moment(input, fmt, strict) {
    if (typeof fmt === "boolean") { strict = fmt; fmt = undefined; }
    if (input === undefined || input === null && arguments.length === 0) return new Moment(new Date());
    if (input === null) return new Moment(new Date(NaN), false);
    if (input instanceof Moment) return input.clone();
    if (input instanceof Date) return new Moment(new Date(input.getTime()));
    if (typeof input === "number") return new Moment(new Date(input));
    if (Array.isArray(input)) return new Moment(new Date(input[0], input[1] || 0, input[2] === undefined ? 1 : input[2], input[3] || 0, input[4] || 0, input[5] || 0, input[6] || 0));
    if (typeof input === "object") {
      const g = function (a, b, def) { return input[a] !== undefined ? input[a] : input[b] !== undefined ? input[b] : def; };
      return new Moment(new Date(g("year", "y", new Date().getFullYear()), g("month", "M", 0), g("date", "day", 1), g("hour", "h", 0), g("minute", "m", 0), g("second", "s", 0), g("millisecond", "ms", 0)));
    }
    const s = String(input);
    if (fmt) {
      const list = Array.isArray(fmt) ? fmt : [fmt];
      for (let i = 0; i < list.length; i++) {
        if (list[i] === moment.ISO_8601) { const iso = moment(s); if (iso.isValid()) return iso; continue; }
        const d = parseWith(s, list[i], strict);
        if (d && !isNaN(d.getTime())) return new Moment(d);
      }
      return new Moment(new Date(NaN), false);
    }
    const ymd = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(s.trim());
    if (ymd) return new Moment(new Date(+ymd[1], +ymd[2] - 1, +ymd[3], +(ymd[4] || 0), +(ymd[5] || 0), +(ymd[6] || 0), +((ymd[7] || "0") + "00").slice(0, 3)));
    return new Moment(new Date(s));
  }
  moment.ISO_8601 = function () {};
  moment.fn = Moment.prototype;
  moment.isMoment = function (m) { return m instanceof Moment; };
  moment.isDate = function (d) { return d instanceof Date; };
  moment.isDuration = function (d) { return d instanceof Duration; };
  moment.unix = function (s) { return new Moment(new Date(s * 1000)); };
  moment.utc = function () { return moment.apply(null, arguments); };
  moment.parseZone = moment.utc;
  moment.invalid = function () { return new Moment(new Date(NaN), false); };
  moment.now = function () { return Date.now(); };
  moment.locale = function () { return "en"; };
  moment.locales = function () { return ["en"]; };
  moment.lang = moment.locale;
  moment.defineLocale = function () { return "en"; };
  moment.updateLocale = function () { return "en"; };
  moment.months = function () { return MONTHS.slice(); };
  moment.monthsShort = function () { return MONTHS.map(function (m) { return m.slice(0, 3); }); };
  moment.weekdays = function () { return DAYS.slice(); };
  moment.weekdaysShort = function () { return DAYS.map(function (d) { return d.slice(0, 3); }); };
  moment.weekdaysMin = function () { return DAYS.map(function (d) { return d.slice(0, 2); }); };
  moment.localeData = function () {
    return { firstDayOfWeek: function () { return 0; }, firstDayOfYear: function () { return 6; }, months: moment.months, monthsShort: moment.monthsShort,
      weekdays: moment.weekdays, weekdaysShort: moment.weekdaysShort, weekdaysMin: moment.weekdaysMin, longDateFormat: function (k) { return LONG[k]; },
      ordinal: ord, _week: { dow: 0, doy: 6 }, _config: { week: { dow: 0, doy: 6 } } };
  };
  moment.min = function () { const l = Array.prototype.slice.call(arguments).flat(); return l.reduce(function (a, b) { return moment(b).isBefore(a) ? moment(b) : a; }); };
  moment.max = function () { const l = Array.prototype.slice.call(arguments).flat(); return l.reduce(function (a, b) { return moment(b).isAfter(a) ? moment(b) : a; }); };
  moment.duration = function (n, u) {
    if (n instanceof Duration) return new Duration(n._ms);
    if (n && typeof n === "object") { let ms = 0; Object.keys(n).forEach(function (k) { ms += moment.duration(n[k], k)._ms; }); return new Duration(ms); }
    u = unitOf(u || "ms");
    const per = { millisecond: 1, second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, date: 864e5, week: 6048e5, isoWeek: 6048e5, month: 864e5 * 30.436875, quarter: 864e5 * 91.310625, year: 864e5 * 365.2425 };
    return new Duration((Number(n) || 0) * (per[u] || 1));
  };
  moment.Moment = Moment;
  return { moment: moment, Moment: Moment, Duration: Duration };
})();

/* ---- YAML: the front matter subset notes use ---- */
const PluginYaml = {
  scalar(s) {
    s = String(s).trim();
    if (s === "" || s === "~" || s === "null" || s === "Null" || s === "NULL") return null;
    if (/^(true|True|TRUE)$/.test(s)) return true;
    if (/^(false|False|FALSE)$/.test(s)) return false;
    if (s[0] === '"') { try { return JSON.parse(s); } catch (e) { return s.slice(1, -1); } }
    if (s[0] === "'") return s.slice(1, s.lastIndexOf("'")).replace(/''/g, "'");
    if (s[0] === "[" || s[0] === "{") return PluginYaml.flow(s);
    if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) && !/^0\d/.test(s)) return Number(s);
    const hash = s.search(/\s#/);
    return hash !== -1 ? s.slice(0, hash).trim() : s;
  },
  flow(s) {
    let i = 0;
    const ws = function () { while (i < s.length && /\s/.test(s[i])) i++; };
    const val = function () {
      ws();
      if (s[i] === "[") { i++; const a = []; ws(); if (s[i] === "]") { i++; return a; } for (;;) { a.push(val()); ws(); if (s[i] === ",") { i++; continue; } if (s[i] === "]") i++; return a; } }
      if (s[i] === "{") {
        i++; const o = {}; ws(); if (s[i] === "}") { i++; return o; }
        for (;;) { ws(); let k = ""; while (i < s.length && s[i] !== ":" && s[i] !== "}" && s[i] !== ",") k += s[i++]; if (s[i] === ":") i++; o[PluginYaml.scalar(k)] = val(); ws(); if (s[i] === ",") { i++; continue; } if (s[i] === "}") i++; return o; }
      }
      if (s[i] === '"' || s[i] === "'") { const q = s[i]; let j = i + 1; while (j < s.length && (s[j] !== q || s[j - 1] === "\\")) j++; const t = s.slice(i, j + 1); i = j + 1; return PluginYaml.scalar(t); }
      let t = ""; while (i < s.length && s[i] !== "," && s[i] !== "]" && s[i] !== "}") t += s[i++];
      return PluginYaml.scalar(t);
    };
    try { return val(); } catch (e) { return s; }
  },
  parse(src) {
    const lines = String(src || "").replace(/\r\n?/g, "\n").split("\n").map(function (t) { return { ind: t.match(/^ */)[0].length, text: t.trim(), raw: t }; })
      .filter(function (l) { return l.text !== "" && l.text[0] !== "#" && l.text !== "---" && l.text !== "..."; });
    let i = 0;
    const keyRe = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:#][^:]*?|[^:]+?)\s*:(?:\s+(.*)|$)/;
    const block = function (ind) {
      if (i >= lines.length) return null;
      if (lines[i].text[0] === "-" && (lines[i].text.length === 1 || lines[i].text[1] === " ")) return seq(lines[i].ind);
      return map(lines[i].ind);
    };
    const blockScalar = function (ind, style) {
      const out = [];
      while (i < lines.length && lines[i].ind > ind) { out.push(lines[i].raw.slice(lines[i].ind > ind ? ind + 2 : 0)); i++; }
      return style[0] === ">" ? out.join(" ") + "\n" : out.join("\n") + "\n";
    };
    const valueAfter = function (rest, ind) {
      if (rest === undefined || rest === "") {
        if (i < lines.length && (lines[i].ind > ind || (lines[i].ind === ind && lines[i].text[0] === "-" && (lines[i].text.length === 1 || lines[i].text[1] === " ")))) return block(lines[i].ind);
        return null;
      }
      if (/^[|>][-+]?$/.test(rest)) return blockScalar(ind, rest);
      return PluginYaml.scalar(rest);
    };
    const map = function (ind) {
      const o = {};
      while (i < lines.length && lines[i].ind === ind) {
        const m = keyRe.exec(lines[i].text);
        if (!m) { i++; continue; }
        i++;
        o[String(PluginYaml.scalar(m[1]))] = valueAfter(m[2], ind);
      }
      return o;
    };
    const seq = function (ind) {
      const a = [];
      while (i < lines.length && lines[i].ind === ind && lines[i].text[0] === "-" && (lines[i].text.length === 1 || lines[i].text[1] === " ")) {
        const rest = lines[i].text.slice(1).trim();
        i++;
        if (!rest) { a.push(i < lines.length && lines[i].ind > ind ? block(lines[i].ind) : null); continue; }
        const m = rest[0] !== "[" && rest[0] !== "{" && rest[0] !== '"' && rest[0] !== "'" ? keyRe.exec(rest) : null;
        if (m) {
          const o = {}, inner = ind + 2;
          o[String(PluginYaml.scalar(m[1]))] = valueAfter(m[2], inner);
          if (i < lines.length && lines[i].ind === inner) Object.assign(o, map(inner));
          a.push(o);
        } else a.push(PluginYaml.scalar(rest));
      }
      return a;
    };
    const r = block(0);
    return r === null ? {} : r;
  },
  quote(s) {
    if (s === "") return '""';
    if (/^[\s]|[\s]$|^[-?:,[\]{}#&*!|>'"%@`]|: |\s#|^(true|false|null|yes|no|on|off|~)$|^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$|\n/i.test(s)) return JSON.stringify(s);
    return s;
  },
  stringify(obj, ind) {
    ind = ind || 0;
    const pad = " ".repeat(ind), out = [];
    const one = function (v) {
      if (v === null || v === undefined) return "";
      if (v instanceof Date) return v.toISOString();
      if (typeof v === "string") return PluginYaml.quote(v);
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    };
    if (Array.isArray(obj)) {
      obj.forEach(function (v) {
        if (v && typeof v === "object" && !(v instanceof Date)) {
          const inner = PluginYaml.stringify(v, ind + 2).replace(/^\s+/, "");
          out.push(pad + "- " + inner.replace(/\n$/, ""));
        } else out.push(pad + "- " + one(v));
      });
      return out.join("\n") + (out.length ? "\n" : "");
    }
    Object.keys(obj || {}).forEach(function (k) {
      const v = obj[k], key = PluginYaml.quote(k);
      if (Array.isArray(v)) {
        if (!v.length) out.push(pad + key + ": []");
        else { out.push(pad + key + ":"); out.push(PluginYaml.stringify(v, ind + 2).replace(/\n$/, "")); }
      } else if (v && typeof v === "object" && !(v instanceof Date)) {
        if (!Object.keys(v).length) out.push(pad + key + ": {}");
        else { out.push(pad + key + ":"); out.push(PluginYaml.stringify(v, ind + 2).replace(/\n$/, "")); }
      } else out.push(pad + key + ":" + (v === null || v === undefined ? "" : " " + one(v)));
    });
    return out.join("\n") + (out.length ? "\n" : "");
  }
};

/* ---- links, front matter, paths ---- */
const PluginText = {
  normalizePath(p) {
    p = String(p === undefined || p === null ? "" : p).replace(/[\\/]+/g, "/").replace(/[  ]/g, " ").replace(/^\/+|\/+$/g, "");
    p = p.split("/").filter(function (s) { return s !== "."; }).join("/");
    try { p = p.normalize("NFC"); } catch (e) { /* old engines */ }
    return p === "" ? "/" : p;
  },
  parseLinktext(t) {
    t = String(t || "");
    const i = t.indexOf("#");
    return i === -1 ? { path: t, subpath: "" } : { path: t.slice(0, i), subpath: t.slice(i) };
  },
  stripHeading(h) { return String(h || "").replace(/[!"#$%&()*+,.:;<=>?@^`{|}~/[\]\\]/g, " ").replace(/\s+/g, " ").trim(); },
  stripHeadingForLink(h) { return String(h || "").replace(/[#|^\\%[\]:]/g, " ").replace(/\s+/g, " ").trim(); },
  frontMatterInfo(content) {
    const s = String(content || "");
    const m = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(s);
    if (!m) { const e = /^---\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(s); if (e) return { exists: true, frontmatter: "", from: 4, to: 4, contentStart: e[0].length }; return { exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 }; }
    const from = s.indexOf("\n") + 1;
    return { exists: true, frontmatter: m[1], from: from, to: from + m[1].length + 1, contentStart: m[0].length };
  },
  tagsFrom(fm) {
    if (!fm) return null;
    const raw = fm.tags !== undefined ? fm.tags : fm.tag;
    if (raw === undefined || raw === null) return null;
    const list = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/);
    const out = list.map(function (t) { return String(t).trim(); }).filter(Boolean).map(function (t) { return t[0] === "#" ? t : "#" + t; });
    return out.length ? out : null;
  },
  aliasesFrom(fm) {
    if (!fm) return null;
    const raw = fm.aliases !== undefined ? fm.aliases : fm.alias;
    if (raw === undefined || raw === null) return null;
    const list = Array.isArray(raw) ? raw : String(raw).split(",");
    const out = list.map(function (t) { return String(t).trim(); }).filter(Boolean);
    return out.length ? out : null;
  },
  entry(fm, key) {
    if (!fm) return null;
    if (key instanceof RegExp) { const k = Object.keys(fm).find(function (x) { return key.test(x); }); return k === undefined ? null : fm[k]; }
    return fm[key] === undefined ? null : fm[key];
  },
  stringArray(fm, key, nospaces) {
    const v = PluginText.entry(fm, key);
    if (v === null) return null;
    const list = Array.isArray(v) ? v.map(String) : String(v).split(nospaces ? /[,\s]+/ : /,/);
    const out = list.map(function (x) { return x.trim(); }).filter(Boolean);
    return out.length ? out : null;
  },
  htmlToMarkdown(html) {
    const root = typeof html === "string" ? new DOMParser().parseFromString(html, "text/html").body : html;
    const walk = function (node, ctx) {
      if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, " ");
      if (node.nodeType !== 1) return "";
      const tag = node.tagName.toLowerCase(), kids = function (c) { return Array.from(node.childNodes).map(function (n) { return walk(n, c || ctx); }).join(""); };
      switch (tag) {
        case "script": case "style": case "head": return "";
        case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": return "\n\n" + "#".repeat(+tag[1]) + " " + kids().trim() + "\n\n";
        case "p": case "div": case "section": case "article": return "\n\n" + kids().trim() + "\n\n";
        case "br": return "\n";
        case "hr": return "\n\n---\n\n";
        case "strong": case "b": return "**" + kids() + "**";
        case "em": case "i": return "*" + kids() + "*";
        case "del": case "s": case "strike": return "~~" + kids() + "~~";
        case "mark": return "==" + kids() + "==";
        case "code": return ctx.pre ? node.textContent : "`" + node.textContent + "`";
        case "pre": return "\n\n```\n" + node.textContent.replace(/\n$/, "") + "\n```\n\n";
        case "a": return "[" + kids() + "](" + (node.getAttribute("href") || "") + ")";
        case "img": return "![" + (node.getAttribute("alt") || "") + "](" + (node.getAttribute("src") || "") + ")";
        case "blockquote": return "\n\n" + kids().trim().split("\n").map(function (l) { return "> " + l; }).join("\n") + "\n\n";
        case "ul": case "ol": {
          let n = 0;
          return "\n" + Array.from(node.children).map(function (li) {
            n++;
            const body = Array.from(li.childNodes).map(function (c) { return walk(c, { depth: (ctx.depth || 0) + 1 }); }).join("").trim();
            return "  ".repeat(ctx.depth || 0) + (tag === "ol" ? n + ". " : "- ") + body;
          }).join("\n") + "\n";
        }
        case "table": {
          const rows = Array.from(node.querySelectorAll("tr")).map(function (tr) { return Array.from(tr.children).map(function (c) { return c.textContent.trim().replace(/\|/g, "\\|"); }); });
          if (!rows.length) return "";
          return "\n\n" + rows.map(function (r, k) { return "| " + r.join(" | ") + " |" + (k === 0 ? "\n|" + r.map(function () { return " --- "; }).join("|") + "|" : ""); }).join("\n") + "\n\n";
        }
        default: return kids(tag === "pre" ? { pre: true } : ctx);
      }
    };
    return walk(root, {}).replace(/\n{3,}/g, "\n\n").trim();
  },
  sanitize(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    doc.querySelectorAll("script, iframe, object, embed, style, link, meta, base, form").forEach(function (n) { n.remove(); });
    doc.querySelectorAll("*").forEach(function (el) {
      Array.from(el.attributes).forEach(function (a) {
        if (/^on/i.test(a.name) || (/^(href|src|xlink:href|action)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
      });
    });
    const frag = document.createDocumentFragment();
    Array.from(doc.body.childNodes).forEach(function (n) { frag.appendChild(document.importNode(n, true)); });
    return frag;
  },
  b64(buf) { const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); },
  unb64(s) { const bin = atob(String(s || "")), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; },
  hex(buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); },
  debounce(fn, wait, reset) {
    let t = null, lastArgs = null, ctx = null;
    const d = function () {
      lastArgs = arguments; ctx = this;
      if (t && !reset) return d;
      clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(ctx, lastArgs); }, wait || 0);
      return d;
    };
    d.cancel = function () { clearTimeout(t); t = null; return d; };
    d.run = function () { if (t) { clearTimeout(t); t = null; return fn.apply(ctx, lastArgs); } return undefined; };
    return d;
  }
};

/* ---- files: notes are TFiles, folders TFolders ---- */
class PluginTAbstractFile {}
class PluginTFile extends PluginTAbstractFile {
  constructor(vault, note, path) { super(); this.vault = vault; this.note = note || null; this.fixedPath = path || null; this.saving = false; this.deleted = false; }
  get path() { return this.note ? PluginApp.notePath(this.note) : this.fixedPath; }
  set path(v) { this.fixedPath = v; }
  get name() { return this.path.split("/").pop(); }
  get basename() { return this.name.replace(/\.[^.]*$/, ""); }
  get extension() { const m = /\.([^./]+)$/.exec(this.name); return m ? m[1].toLowerCase() : ""; }
  get parent() { return PluginApp.folder(folderOf(this.path)); }
  get stat() {
    const n = this.note, t = n ? noteStamp(n) || Date.now() : Date.now();
    return { ctime: (n && n.ctime) || t, mtime: t, size: n ? (n.content || "").length : 0 };
  }
}
class PluginTFolder extends PluginTAbstractFile {
  constructor(vault, path) { super(); this.vault = vault; this.path = path; }
  get name() { return this.path === "/" ? "" : this.path.split("/").pop(); }
  get parent() { return this.path === "/" ? null : PluginApp.folder(folderOf(this.path)); }
  get children() { return PluginApp.childrenOf(this.path); }
  isRoot() { return this.path === "/"; }
}

/* ---- the editor: an Obsidian Editor over a CarbonFibre pane ---- */
class PluginEditor {
  constructor(pane) { this.pane = pane; this.cm = undefined; }
  lines() { const p = this.pane; return p && p.type === "note" && p.lines ? p.lines : [""]; }
  getValue() { return this.lines().join("\n"); }
  setValue(v) { const ls = this.lines(); this.apply(0, ls.length - 1, String(v).replace(/\r\n?/g, "\n").split("\n"), { line: 0, col: 0 }); }
  getLine(n) { return this.lines()[n] || ""; }
  setLine(n, text) { this.replaceRange(text, { line: n, ch: 0 }, { line: n, ch: this.getLine(n).length }); }
  lineCount() { return this.lines().length; }
  lastLine() { return this.lines().length - 1; }
  getDoc() { return this; }
  clamp(pos) {
    const ls = this.lines();
    const line = Math.max(0, Math.min(ls.length - 1, (pos && pos.line) || 0));
    return { line: line, ch: Math.max(0, Math.min(ls[line].length, (pos && pos.ch) || 0)) };
  }
  sel() {
    const p = this.pane;
    if (p.allSelected && p.selCols) { const R = p.selRange(); return { from: { line: R.from, ch: R.a }, to: { line: R.to, ch: R.b } }; }
    if (p.allSelected) return { from: { line: p.selFrom, ch: 0 }, to: { line: p.selTo, ch: (p.lines[p.selTo] || "").length } };
    if (p.ta && p.activeLine !== null) return { from: { line: p.activeLine, ch: p.ta.selectionStart }, to: { line: p.activeLine, ch: p.ta.selectionEnd } };
    const last = PluginApp.lastCursor.get(p);
    if (last) { const c = this.clamp(last); return { from: c, to: c }; }
    const c0 = this.clamp({ line: 0, ch: 0 });
    return { from: c0, to: c0 };
  }
  getCursor(which) { const s = this.sel(); return which === "from" || which === "anchor" ? s.from : s.to; }
  listSelections() { const s = this.sel(); return [{ anchor: s.from, head: s.to }]; }
  getSelection() {
    const p = this.pane;
    if (p.allSelected) return p.selectedText();
    if (p.ta && p.activeLine !== null) return p.ta.value.slice(p.ta.selectionStart, p.ta.selectionEnd);
    return "";
  }
  somethingSelected() { return this.getSelection() !== ""; }
  getRange(from, to) {
    const ls = this.lines(); from = this.clamp(from); to = this.clamp(to);
    if (from.line === to.line) return ls[from.line].slice(from.ch, to.ch);
    return [ls[from.line].slice(from.ch)].concat(ls.slice(from.line + 1, to.line), [ls[to.line].slice(0, to.ch)]).join("\n");
  }
  apply(from, to, fresh, after) {
    const p = this.pane;
    if (!p || p.type !== "note" || !p.note()) return;
    p.applyLines(from, to, fresh, after);
    PluginHost.editorChanged(p);
  }
  replaceRange(text, from, to) {
    from = this.clamp(from); to = to ? this.clamp(to) : from;
    if (to.line < from.line || (to.line === from.line && to.ch < from.ch)) { const t = from; from = to; to = t; }
    const ls = this.lines(), pre = ls[from.line].slice(0, from.ch), post = ls[to.line].slice(to.ch);
    const ins = String(text === undefined ? "" : text).replace(/\r\n?/g, "\n").split("\n");
    const fresh = ins.slice();
    fresh[0] = pre + fresh[0];
    const endCol = fresh[fresh.length - 1].length;
    fresh[fresh.length - 1] += post;
    this.apply(from.line, to.line, fresh, { line: from.line + ins.length - 1, col: endCol });
  }
  replaceSelection(text) { const s = this.sel(); this.replaceRange(text, s.from, s.to); }
  setCursor(pos, ch) {
    if (typeof pos === "number") pos = { line: pos, ch: ch || 0 };
    const c = this.clamp(pos), p = this.pane;
    if (p.mode !== "live" && p.setMode) p.setMode("live");
    p.setActive(c.line, c.ch);
    if (p.keepVisible) p.keepVisible(c.line);
    PluginApp.lastCursor.set(p, c);
  }
  setSelection(anchor, head) {
    head = head || anchor;
    const a = this.clamp(anchor), h = this.clamp(head), p = this.pane;
    if (a.line === h.line) {
      p.setActive(a.line, Math.min(a.ch, h.ch));
      if (p.ta) p.ta.setSelectionRange(Math.min(a.ch, h.ch), Math.max(a.ch, h.ch));
    } else p.setPartial(a.line, a.ch, h.line, h.ch);
    if (p.keepVisible) p.keepVisible(h.line);
  }
  setSelections(ranges) { if (ranges && ranges.length) this.setSelection(ranges[0].anchor, ranges[0].head); }
  posToOffset(pos) { const ls = this.lines(); const c = this.clamp(pos); let o = 0; for (let i = 0; i < c.line; i++) o += ls[i].length + 1; return o + c.ch; }
  offsetToPos(off) { const ls = this.lines(); let o = Math.max(0, off); for (let i = 0; i < ls.length; i++) { if (o <= ls[i].length) return { line: i, ch: o }; o -= ls[i].length + 1; } return { line: ls.length - 1, ch: ls[ls.length - 1].length }; }
  wordAt(pos) {
    const c = this.clamp(pos), line = this.getLine(c.line), re = /[\p{L}\p{N}_'-]+/gu;
    let m;
    while ((m = re.exec(line))) if (m.index <= c.ch && m.index + m[0].length >= c.ch) return { from: { line: c.line, ch: m.index }, to: { line: c.line, ch: m.index + m[0].length } };
    return null;
  }
  transaction(tx) {
    if (!tx) return;
    const changes = (tx.changes || []).slice().sort(function (a, b) { return this.posToOffset(b.from) - this.posToOffset(a.from); }.bind(this));
    changes.forEach(function (c) { this.replaceRange(c.text || "", c.from, c.to); }, this);
    if (tx.replaceSelection !== undefined) this.replaceSelection(tx.replaceSelection);
    if (tx.selection) this.setSelection(tx.selection.from, tx.selection.to || tx.selection.from);
    else if (tx.selections && tx.selections.length) this.setSelection(tx.selections[0].from, tx.selections[0].to || tx.selections[0].from);
  }
  processLines(read, write) {
    const ls = this.lines().slice(), out = [];
    ls.forEach(function (l, i) { const s = read(i, l); const r = write(i, l, s); out.push(r === undefined || r === null ? l : typeof r === "string" ? r : r.text !== undefined ? r.text : l); });
    this.setValue(out.join("\n"));
  }
  exec(cmd) {
    const p = this.pane;
    const map = {
      indentMore: function () { p.indentRange(false); }, indentLess: function () { p.indentRange(true); },
      swapLineUp: function () { p.moveLines(-1); }, swapLineDown: function () { p.moveLines(1); }, deleteLine: function () { p.deleteLines(); },
      undo: function () { histUndo(p); }, redo: function () { histRedo(p); }, selectAll: function () { p.selectAll(); },
      goStart: function () { this.setCursor(0, 0); }.bind(this), goEnd: function () { this.setCursor(this.lastLine(), this.getLine(this.lastLine()).length); }.bind(this),
      newlineAndIndent: function () { this.replaceSelection("\n"); }.bind(this)
    };
    if (map[cmd]) map[cmd]();
  }
  undo() { histUndo(this.pane); }
  redo() { histRedo(this.pane); }
  focus() { const p = this.pane; if (p.activeLine === null) { const c = this.sel().to; p.setActive(c.line, c.ch); } else if (p.ta) p.ta.focus(); }
  blur() { if (this.pane.ta) this.pane.ta.blur(); }
  hasFocus() { return !!this.pane.ta && document.activeElement === this.pane.ta; }
  refresh() { if (this.pane.rerenderLines) this.pane.rerenderLines(); }
  getScrollInfo() { const e = this.pane.editorEl; return { top: e.scrollTop, left: e.scrollLeft, height: e.scrollHeight, width: e.scrollWidth, clientHeight: e.clientHeight, clientWidth: e.clientWidth }; }
  scrollTo(x, y) { const e = this.pane.editorEl; if (x !== null && x !== undefined) e.scrollLeft = x; if (y !== null && y !== undefined) e.scrollTop = y; }
  scrollIntoView(range, center) {
    const line = range && range.from ? range.from.line : 0, node = this.pane.nodeAt && this.pane.nodeAt(line);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: center ? "center" : "nearest" });
  }
}

/* ---- views and leaves ---- */
class PluginView extends PluginComponent {
  constructor(leaf) {
    super();
    this.app = PluginApp.app;
    this.leaf = leaf;
    this.icon = "";
    this.navigation = false;
    this.scope = null;
    this.containerEl = document.createElement("div");
    this.containerEl.className = "workspace-leaf-content";
  }
  getViewType() { return ""; }
  getDisplayText() { return ""; }
  getIcon() { return this.icon || "file"; }
  getState() { return {}; }
  setState() { return Promise.resolve(); }
  getEphemeralState() { return {}; }
  setEphemeralState() {}
  onOpen() { return Promise.resolve(); }
  onClose() { return Promise.resolve(); }
  onResize() {}
  onPaneMenu() {}
  onHeaderMenu() {}
}
class PluginItemView extends PluginView {
  constructor(leaf) {
    super(leaf);
    this.headerEl = document.createElement("div"); this.headerEl.className = "view-header";
    this.titleEl = document.createElement("div"); this.titleEl.className = "view-header-title";
    this.actionsEl = document.createElement("div"); this.actionsEl.className = "view-actions";
    this.headerEl.appendChild(this.titleEl); this.headerEl.appendChild(this.actionsEl);
    this.contentEl = document.createElement("div"); this.contentEl.className = "view-content";
    this.containerEl.appendChild(this.headerEl);
    this.containerEl.appendChild(this.contentEl);
  }
  addAction(icon, title, cb) {
    const a = document.createElement("a");
    a.className = "clickable-icon view-action";
    pluginTooltip(a, title);
    PluginIcons.set(a, icon, 16);
    a.addEventListener("click", cb);
    this.actionsEl.insertBefore(a, this.actionsEl.firstChild);
    return a;
  }
}
class PluginFileView extends PluginItemView {
  constructor(leaf) { super(leaf); this.file = null; this.allowNoFile = false; this.navigation = true; }
  getDisplayText() { return this.file ? this.file.basename : "No file"; }
  onLoadFile() { return Promise.resolve(); }
  onUnloadFile() { return Promise.resolve(); }
  onRename() { return Promise.resolve(); }
  canAcceptExtension(ext) { return ext === "md"; }
  loadFile(file) { const old = this.file; this.file = file; return Promise.resolve(old ? this.onUnloadFile(old) : null).then(function () { return this.onLoadFile(file); }.bind(this)); }
}
class PluginEditableFileView extends PluginFileView {}
class PluginTextFileView extends PluginEditableFileView {
  constructor(leaf) { super(leaf); this.data = ""; this.requestSave = PluginText.debounce(this.save.bind(this), 2000); }
  onLoadFile(file) { return PluginApp.app.vault.read(file).then(function (t) { this.data = t; this.setViewData(t, true); }.bind(this)); }
  save() { if (!this.file) return Promise.resolve(); this.data = this.getViewData(); return PluginApp.app.vault.modify(this.file, this.data); }
  getViewData() { return this.data; }
  setViewData(data) { this.data = data; }
  clear() {}
}
/* the view of a note pane */
class PluginMarkdownView extends PluginTextFileView {
  constructor(leaf) {
    super(leaf);
    this.pane = leaf.pane;
    this.editor = new PluginEditor(this.pane);
    this.containerEl = this.pane.root;
    this.contentEl = this.pane.editorEl;
    this.previewMode = { rerender: function () { this.pane.render(); }.bind(this), containerEl: this.pane.prevEl, renderer: { rerender: function () { this.pane.render(); }.bind(this) } };
    this.currentMode = this.editor;
    this.sourceMode = { cmEditor: null };
    this.hoverPopover = null;
    /* the Properties block above a note in Obsidian; CarbonFibre shows front matter as text */
    const mel = document.createElement("div");
    this.metadataEditor = { containerEl: mel, contentEl: mel, propertyListEl: mel, rendered: [], properties: [], owner: this, synchronize: function () {}, load: function () {}, unload: function () {}, focusKey: function () {}, insertProperties: function () {} };
    this.inlineTitleEl = document.createElement("div");
  }
  get file() { const n = this.pane.type === "note" && this.pane.note(); return n ? PluginApp.fileFor(n) : null; }
  set file(v) { /* the pane decides */ }
  get data() { return this.getViewData(); }
  set data(v) { /* see setViewData */ }
  getViewType() { return "markdown"; }
  getDisplayText() { const f = this.file; return f ? f.basename : ""; }
  getMode() { return this.pane.mode === "preview" ? "preview" : "source"; }
  getViewData() { this.pane.sync(); const n = this.pane.note(); return n ? n.content : ""; }
  setViewData(data) { const n = this.pane.note(); if (n) PluginApp.setContent(n, String(data)); }
  getState() { const f = this.file; return { file: f ? f.path : null, mode: this.getMode(), source: false }; }
  save() { this.pane.sync(); return Promise.resolve(); }
  showSearch() { palOpen("@"); }
}

class PluginWorkspaceItem extends PluginEvents {
  getRoot() { return PluginApp.app.workspace.rootSplit; }
  getContainer() { return PluginApp.app.workspace.rootSplit; }
}
class PluginWorkspaceParent extends PluginWorkspaceItem {
  constructor() { super(); this.children = []; this.containerEl = document.createElement("div"); }
}
class PluginWorkspaceSplit extends PluginWorkspaceParent {
  constructor(side) { super(); this.side = side; this.collapsed = side !== "root"; this.children = []; this.containerEl = document.createElement("div"); }
  get doc() { return document; }
  get win() { return window; }
  collapse() { this.collapsed = true; if (this.side === "right") PluginDock.hide(); }
  expand() { this.collapsed = false; if (this.side === "right") PluginDock.show(); }
  toggle() { if (this.collapsed) this.expand(); else this.collapse(); }
  getRoot() { return this; }
}
class PluginWorkspaceTabs extends PluginWorkspaceParent {}
/* the main area: its children are the note panes' leaves (Obsidian nests them in tab groups) */
class PluginWorkspaceRoot extends PluginWorkspaceSplit {
  get children() { return PluginApp.app ? panes.map(PluginApp.app.workspace.leafFor, PluginApp.app.workspace) : []; }
  set children(v) { /* fixed: follows CarbonFibre's panes */ }
}
class PluginWorkspaceSidedock extends PluginWorkspaceSplit {}
class PluginWorkspaceContainer extends PluginWorkspaceSplit {}
class PluginWorkspaceWindow extends PluginWorkspaceContainer {}
class PluginWorkspaceFloating extends PluginWorkspaceParent {}
class PluginWorkspaceRibbon {
  constructor() { this.items = []; this.containerEl = document.getElementById("activity") || document.createElement("div"); }
  addRibbonItemButton() { return document.createElement("div"); }
  removeRibbonAction() {}
}
class PluginWorkspaceMobileDrawer extends PluginWorkspaceParent {}

class PluginWorkspaceLeaf extends PluginWorkspaceItem {}

/* a leaf showing a CarbonFibre note pane */
class PluginPaneLeaf extends PluginWorkspaceLeaf {
  constructor(pane) {
    super();
    this.pane = pane;
    this.id = "pane-" + Math.random().toString(36).slice(2, 9);
    this.tabHeaderEl = document.createElement("div");
    this.tabHeaderInnerIconEl = document.createElement("div");
    this.tabHeaderInnerTitleEl = document.createElement("div");
    this.isDeferred = false;
  }
  get view() { if (!this._view) this._view = new PluginMarkdownView(this); return this._view; }
  get containerEl() { return this.pane.root; }
  get parent() { return PluginApp.app.workspace.rootSplit; }
  openFile(file, state) {
    const n = file && file.note;
    if (!n) return Promise.resolve();
    this.pane.open(n.id);
    if (state && state.eState && typeof state.eState.line === "number") this.view.editor.setCursor(state.eState.line, 0);
    if (state && state.active !== false) PluginApp.focusPane(this.pane);
    return Promise.resolve();
  }
  setViewState(vs) {
    if (!vs) return Promise.resolve();
    if (vs.type === "markdown" && vs.state && vs.state.file) { const f = PluginApp.app.vault.getAbstractFileByPath(vs.state.file); return this.openFile(f, vs); }
    if (vs.type && vs.type !== "markdown" && vs.type !== "empty") return PluginDock.newLeaf().setViewState(vs);
    return Promise.resolve();
  }
  getViewState() { const f = this.view.file; return { type: "markdown", state: { file: f ? f.path : null, mode: this.view.getMode() } }; }
  getEphemeralState() { return { cursor: this.view.editor.getCursor() }; }
  setEphemeralState(s) { if (s && typeof s.line === "number") this.view.editor.setCursor(s.line, 0); }
  getDisplayText() { return this.view.getDisplayText(); }
  getIcon() { return "file-text"; }
  getRoot() { return PluginApp.app.workspace.rootSplit; }
  getContainer() { return PluginApp.app.workspace.rootSplit; }
  detach() { if (panes.length > 1) closePane(this.pane); }
  setPinned() {}
  togglePinned() {}
  setGroup() {}
  setGroupMember() {}
  loadIfDeferred() { return Promise.resolve(); }
  onResize() {}
}

/* the side panel where plugin views (calendars, outlines, ...) open */
const PluginDock = {
  el: null, tabsEl: null, bodyEl: null, leaves: [], active: null,
  build() {
    if (PluginDock.el) return;
    const body = document.querySelector(".mo-body");
    PluginDock.el = document.createElement("aside");
    PluginDock.el.className = "cfp-dock";
    PluginDock.el.hidden = true;
    PluginDock.el.setAttribute("aria-label", "Plugin panel");
    PluginDock.el.innerHTML = '<div class="cfp-dock-head"><div class="cfp-dock-tabs" role="tablist"></div><button class="cfp-dock-x" title="Hide the plugin panel" aria-label="Hide the plugin panel">' + PluginIcons.svg("x", 14) + "</button></div><div class=\"cfp-dock-body\"></div>";
    body.appendChild(PluginDock.el);
    PluginDock.tabsEl = PluginDock.el.querySelector(".cfp-dock-tabs");
    PluginDock.bodyEl = PluginDock.el.querySelector(".cfp-dock-body");
    PluginDock.el.querySelector(".cfp-dock-x").addEventListener("click", PluginDock.hide);
    PluginDock.el.addEventListener("focusin", function () { PluginApp.activeDockFocus = true; });
    PluginDock.el.addEventListener("focusout", function () { PluginApp.activeDockFocus = false; });
  },
  newLeaf() { PluginDock.build(); const l = new PluginDockLeaf(); PluginDock.leaves.push(l); return l; },
  show() { PluginDock.build(); if (PluginDock.leaves.some(function (l) { return l.view; })) PluginDock.el.hidden = false; if (PluginApp.app) PluginApp.app.workspace.rightSplit.collapsed = PluginDock.el.hidden; },
  hide() { if (PluginDock.el) PluginDock.el.hidden = true; if (PluginApp.app) PluginApp.app.workspace.rightSplit.collapsed = true; },
  select(leaf) {
    PluginDock.active = leaf;
    PluginDock.leaves.forEach(function (l) {
      if (l.tabEl) { l.tabEl.classList.toggle("on", l === leaf); l.tabEl.setAttribute("aria-selected", String(l === leaf)); }
      if (l.view) l.view.containerEl.hidden = l !== leaf;
    });
    if (leaf && leaf.view) try { leaf.view.onResize(); } catch (e) { console.error(e); }
  },
  remove(leaf) {
    const i = PluginDock.leaves.indexOf(leaf);
    if (i !== -1) PluginDock.leaves.splice(i, 1);
    if (PluginDock.active === leaf) PluginDock.select(PluginDock.leaves.find(function (l) { return l.view; }) || null);
    if (!PluginDock.leaves.some(function (l) { return l.view; })) PluginDock.hide();
  }
};
class PluginDockLeaf extends PluginWorkspaceLeaf {
  constructor() {
    super();
    this.id = "dock-" + Math.random().toString(36).slice(2, 9);
    this.view = null;
    this.tabEl = null;
    this.containerEl = document.createElement("div");
    this.containerEl.className = "workspace-leaf";
    this.isDeferred = false;
  }
  get parent() { return PluginApp.app.workspace.rightSplit; }
  setViewState(vs) {
    vs = vs || {};
    const reg = PluginHost.views[vs.type];
    if (!reg) return Promise.reject(new Error("No view of type " + vs.type));
    const old = this.view;
    const ready = old ? Promise.resolve(old.onClose()).catch(function () {}).then(function () { old.unload(); old.containerEl.remove(); }) : Promise.resolve();
    return ready.then(function () {
      const v = reg.creator(this);
      this.view = v;
      v.leaf = this;
      v.plugin = reg.plugin;
      reg.plugin.leaves.add(this);
      PluginDock.bodyEl.appendChild(v.containerEl);
      if (!this.tabEl) {
        this.tabEl = document.createElement("button");
        this.tabEl.className = "cfp-dock-tab";
        this.tabEl.setAttribute("role", "tab");
        this.tabEl.addEventListener("click", function () { PluginDock.select(this); }.bind(this));
        PluginDock.tabsEl.appendChild(this.tabEl);
      }
      this.refreshTab();
      v.load();
      return Promise.resolve(v.onOpen()).then(function () { return vs.state ? v.setState(vs.state, { history: false }) : null; });
    }.bind(this)).then(function () {
      this.refreshTab();
      if (vs.active !== false || !PluginDock.active) PluginDock.select(this);
      PluginDock.show();
      PluginApp.app.workspace.trigger("layout-change");
    }.bind(this));
  }
  refreshTab() {
    if (!this.tabEl || !this.view) return;
    let title = "", icon = "puzzle";
    try { title = this.view.getDisplayText(); icon = this.view.getIcon(); } catch (e) { console.error(e); }
    this.tabEl.innerHTML = PluginIcons.svg(icon, 15) + "<span>" + esc(String(title || "")) + "</span>";
    this.tabEl.title = title;
    if (this.view.titleEl) this.view.titleEl.textContent = title;
  }
  getViewState() { return this.view ? { type: this.view.getViewType(), state: this.view.getState() } : { type: "empty", state: {} }; }
  getEphemeralState() { return this.view ? this.view.getEphemeralState() : {}; }
  setEphemeralState(s) { if (this.view) this.view.setEphemeralState(s); }
  openFile(file, state) { return PluginApp.app.workspace.getLeaf(false).openFile(file, state); }
  getDisplayText() { return this.view ? this.view.getDisplayText() : ""; }
  getIcon() { return this.view ? this.view.getIcon() : "puzzle"; }
  getRoot() { return PluginApp.app.workspace.rightSplit; }
  getContainer() { return PluginApp.app.workspace.rightSplit; }
  detach() {
    const v = this.view;
    this.view = null;
    if (v) {
      if (v.plugin) v.plugin.leaves.delete(this);
      Promise.resolve(v.onClose()).catch(function (e) { console.error(e); });
      v.unload();
      v.containerEl.remove();
    }
    if (this.tabEl) { this.tabEl.remove(); this.tabEl = null; }
    PluginDock.remove(this);
    if (PluginApp.app) PluginApp.app.workspace.trigger("layout-change");
  }
  setPinned() {}
  togglePinned() {}
  setGroup() {}
  loadIfDeferred() { return Promise.resolve(); }
  onResize() { if (this.view) this.view.onResize(); }
}

/* ---- the vault ---- */
class PluginAdapter {
  constructor(vault) { this.vault = vault; }
  getName() { return this.vault.getName(); }
  split(path) {
    const p = PluginText.normalizePath(path);
    const m = /^\.obsidian\/plugins\/([^/]+)(?:\/(.*))?$/.exec(p);
    return { path: p === "/" ? "" : p, plugin: m ? m[1] : null, rel: m ? m[2] || "" : "" };
  }
  note(path) { const f = this.vault.getAbstractFileByPath(path); return f instanceof PluginTFile && f.note ? f : null; }
  /* files outside the notes: real files in a folder vault, a small store in browser storage otherwise */
  local() { try { return JSON.parse(localStorage.getItem("carbonfibre-plugin-files") || "{}"); } catch (e) { return {}; } }
  saveLocal(o) { storeSet("carbonfibre-plugin-files", JSON.stringify(o)); }
  dirFor(path, create) {
    const parts = path.split("/").filter(Boolean);
    let chain = Promise.resolve(state.dirHandle);
    parts.forEach(function (seg) { chain = chain.then(function (h) { return h.getDirectoryHandle(seg, { create: !!create }); }); });
    return chain;
  }
  fileHandle(path, create) {
    const dir = folderOf(path), base = path.split("/").pop();
    return this.dirFor(dir, create).then(function (h) { return h.getFileHandle(base, { create: !!create }); });
  }
  exists(path) {
    const s = this.split(path);
    if (s.plugin) return cfDesktopPlugins().fs("exists", s.plugin, s.rel);
    if (!s.path) return Promise.resolve(true);
    if (this.vault.getAbstractFileByPath(s.path)) return Promise.resolve(true);
    if (state.backend !== "folder") return Promise.resolve(Object.prototype.hasOwnProperty.call(this.local(), s.path) || Object.keys(this.local()).some(function (k) { return k.indexOf(s.path + "/") === 0; }));
    return this.fileHandle(s.path).then(function () { return true; }, function () { return this.dirFor(s.path).then(function () { return true; }, function () { return false; }); }.bind(this));
  }
  stat(path) {
    const s = this.split(path), f = this.vault.getAbstractFileByPath(s.path);
    if (f instanceof PluginTFile && f.note) return Promise.resolve(Object.assign({ type: "file" }, f.stat));
    if (f instanceof PluginTFolder) return Promise.resolve({ type: "folder", ctime: 0, mtime: 0, size: 0 });
    return this.exists(path).then(function (ok) { return ok ? { type: "file", ctime: Date.now(), mtime: Date.now(), size: 0 } : null; });
  }
  read(path) {
    const s = this.split(path);
    if (s.plugin) return cfDesktopPlugins().fs("read", s.plugin, s.rel);
    const n = this.note(s.path);
    if (n) return this.vault.read(n);
    if (state.backend !== "folder") { const o = this.local(); return Object.prototype.hasOwnProperty.call(o, s.path) ? Promise.resolve(o[s.path]) : Promise.reject(new Error("ENOENT: no such file, " + s.path)); }
    return this.fileHandle(s.path).then(function (h) { return h.getFile(); }).then(function (f) { return f.text(); });
  }
  readBinary(path) {
    const s = this.split(path);
    if (state.backend === "folder" && !s.plugin && !this.note(s.path)) return this.fileHandle(s.path).then(function (h) { return h.getFile(); }).then(function (f) { return f.arrayBuffer(); });
    return this.read(path).then(function (t) { return /^b64:/.test(t) ? PluginText.unb64(t.slice(4)) : new TextEncoder().encode(t).buffer; });
  }
  write(path, data) {
    const s = this.split(path);
    data = String(data);
    if (s.plugin) return cfDesktopPlugins().fs("write", s.plugin, s.rel, data);
    const n = this.note(s.path);
    if (n) return this.vault.modify(n, data);
    if (/\.md$/i.test(s.path)) return this.vault.create(s.path, data).then(function () {});
    if (state.backend !== "folder") { const o = this.local(); o[s.path] = data; this.saveLocal(o); return Promise.resolve(); }
    return this.dirFor(folderOf(s.path), true).then(function (dir) { return writeFile(dir, s.path.split("/").pop(), data); }).then(function () {});
  }
  writeBinary(path, buf) {
    const s = this.split(path);
    if (state.backend === "folder" && !s.plugin) return this.dirFor(folderOf(s.path), true).then(function (dir) { return writeFile(dir, s.path.split("/").pop(), new Blob([buf])); }).then(function () {});
    return this.write(path, "b64:" + PluginText.b64(buf));
  }
  append(path, data) { return this.read(path).catch(function () { return ""; }).then(function (t) { return this.write(path, t + data); }.bind(this)); }
  process(path, fn) { return this.read(path).then(function (t) { const out = fn(t); return this.write(path, out).then(function () { return out; }); }.bind(this)); }
  list(path) {
    const s = this.split(path);
    if (s.plugin) return cfDesktopPlugins().fs("list", s.plugin, s.rel).then(function (r) {
      const base = PluginText.normalizePath(path);
      return { files: r.files.map(function (f) { return base + "/" + f; }), folders: r.folders.map(function (f) { return base + "/" + f; }) };
    });
    if (state.backend !== "folder") {
      const prefix = s.path ? s.path + "/" : "", files = new Set(), folders = new Set();
      this.vault.getAllLoadedFiles().forEach(function (f) { if (f.path !== "/" && f.path.indexOf(prefix) === 0 && f.path.slice(prefix.length).indexOf("/") === -1) (f instanceof PluginTFolder ? folders : files).add(f.path); });
      Object.keys(this.local()).forEach(function (k) { if (k.indexOf(prefix) !== 0) return; const rest = k.slice(prefix.length), i = rest.indexOf("/"); if (i === -1) files.add(k); else folders.add(prefix + rest.slice(0, i)); });
      return Promise.resolve({ files: Array.from(files), folders: Array.from(folders) });
    }
    return this.dirFor(s.path).then(function (dir) {
      const out = { files: [], folders: [] }, prefix = s.path ? s.path + "/" : "";
      return (async function () { for await (const e of dir.values()) (e.kind === "directory" ? out.folders : out.files).push(prefix + e.name); })().then(function () { return out; });
    });
  }
  mkdir(path) {
    const s = this.split(path);
    if (s.plugin) return cfDesktopPlugins().fs("mkdir", s.plugin, s.rel);
    if (state.backend !== "folder") return Promise.resolve();
    return PluginApp.ensureFolder(s.path);
  }
  remove(path) {
    const s = this.split(path);
    if (s.plugin) return cfDesktopPlugins().fs("remove", s.plugin, s.rel);
    const n = this.note(s.path);
    if (n) return this.vault.delete(n);
    if (state.backend !== "folder") { const o = this.local(); delete o[s.path]; this.saveLocal(o); return Promise.resolve(); }
    return this.dirFor(folderOf(s.path)).then(function (dir) { return dir.removeEntry(s.path.split("/").pop()); });
  }
  rmdir(path, recursive) {
    const s = this.split(path);
    if (s.plugin) return cfDesktopPlugins().fs("remove", s.plugin, s.rel);
    if (state.backend !== "folder") { const o = this.local(); Object.keys(o).forEach(function (k) { if (k.indexOf(s.path + "/") === 0) delete o[k]; }); this.saveLocal(o); return Promise.resolve(); }
    return this.dirFor(folderOf(s.path)).then(function (dir) { return dir.removeEntry(s.path.split("/").pop(), { recursive: !!recursive }); });
  }
  trashSystem(path) { return this.remove(path).then(function () { return true; }); }
  trashLocal(path) { return this.remove(path); }
  rename(from, to) { return this.read(from).then(function (t) { return this.write(to, t); }.bind(this)).then(function () { return this.remove(from); }.bind(this)); }
  copy(from, to) { return this.read(from).then(function (t) { return this.write(to, t); }.bind(this)); }
  getResourcePath(path) { return PluginVaultFiles.url(path); }
  /* FileSystemAdapter's paths on disk: known only to plugins with Node.js (the app asks for the folder) */
  getBasePath() { return PluginNodeAccess.vault || ""; }
  get basePath() { return this.getBasePath(); }
  getFullPath(path) {
    const s = this.split(path), base = this.getBasePath();
    if (s.plugin) { const e = (PluginHost.installed || []).find(function (x) { return x.id === s.plugin; }); if (e && e.dir) return e.dir + (s.rel ? "/" + s.rel : ""); }
    return base ? base + (s.path ? "/" + s.path : "") : s.path;
  }
  getFilePath(path) { return "file://" + this.getFullPath(path); }
  getRealPath(path) { return path; }
  get fs() { return PluginNodeAccess.have() ? window.cfDesktop.node.require("fs") : undefined; }
  get fsPromises() { return PluginNodeAccess.have() ? window.cfDesktop.node.require("fs/promises") : undefined; }
  get path() { return PluginNodeAccess.have() ? window.cfDesktop.node.require("path") : PluginNode.path; }
  get url() { return PluginNodeAccess.have() ? window.cfDesktop.node.require("url") : PluginNode.url; }
}
function cfDesktopPlugins() { return (window.cfDesktop && window.cfDesktop.plugins) || null; }

class PluginVault extends PluginEvents {
  constructor() {
    super();
    this.adapter = new PluginAdapter(this);
    this.configDir = ".obsidian";
    this.config = { useMarkdownLinks: false, newLinkFormat: "shortest", attachmentFolderPath: "/", newFileLocation: "root", tabSize: 4, useTab: false,
      showLineNumber: false, readableLineLength: true, defaultViewMode: "source", livePreview: true, foldHeading: false, alwaysUpdateLinks: false, userIgnoreFilters: [],
      cssTheme: "", theme: "obsidian", baseFontSize: 16, accentColor: "", enabledCssSnippets: [], spellcheck: true, strictLineBreaks: false, showFrontmatter: true, propertiesInDocument: "visible",
      promptDelete: true, trashOption: "system", showInlineTitle: true, foldIndent: true, autoPairBrackets: true, autoPairMarkdown: true, vimMode: false };
  }
  getName() { return state.dirHandle ? state.dirHandle.name : "CarbonFibre"; }
  getConfig(k) { return k === "cssTheme" ? ThemeHost.active || "" : k === "theme" ? (document.documentElement.getAttribute("data-theme") === "light" ? "moonstone" : "obsidian") : this.config[k]; }
  setConfig(k, v) { this.config[k] = v; }
  getRoot() { return PluginApp.folder(""); }
  getMarkdownFiles() { return PluginApp.files(); }
  getFiles() { return PluginApp.files(); }
  getAllLoadedFiles() { return [this.getRoot()].concat(PluginApp.allFolders(), PluginApp.files()); }
  getAllFolders(includeRoot) { return (includeRoot ? [this.getRoot()] : []).concat(PluginApp.allFolders()); }
  getAbstractFileByPath(path) {
    const p = PluginText.normalizePath(path);
    if (p === "/") return this.getRoot();
    const f = PluginApp.fileByPath(p);
    if (f) return f;
    return PluginApp.folderExists(p) ? PluginApp.folder(p) : null;
  }
  getAbstractFileByPathInsensitive(path) {
    const p = PluginText.normalizePath(path).toLowerCase();
    return this.getAllLoadedFiles().find(function (f) { return f.path.toLowerCase() === p; }) || null;
  }
  getFileByPath(path) { const f = this.getAbstractFileByPath(path); return f instanceof PluginTFile ? f : null; }
  getFolderByPath(path) { const f = this.getAbstractFileByPath(path); return f instanceof PluginTFolder ? f : null; }
  read(file) { if (!file) return Promise.reject(new Error("No file")); if (!file.note) return this.adapter.read(file.path); syncAllPanes(); return Promise.resolve(file.note.content || ""); }
  cachedRead(file) { return this.read(file); }
  modify(file, data) { if (!file.note) return this.adapter.write(file.path, data); PluginApp.setContent(file.note, String(data)); return Promise.resolve(); }
  process(file, fn) { return this.read(file).then(function (t) { const out = fn(t); return this.modify(file, out).then(function () { return out; }); }.bind(this)); }
  append(file, data) { return this.read(file).then(function (t) { return this.modify(file, t + data); }.bind(this)); }
  create(path, data) { return PluginApp.createFile(PluginText.normalizePath(path), data === undefined ? "" : String(data)); }
  createBinary(path, buf) { const p = PluginText.normalizePath(path); return this.adapter.writeBinary(p, buf).then(function () { return new PluginTFile(this, null, p); }.bind(this)); }
  readBinary(file) { return this.adapter.readBinary(file.path); }
  modifyBinary(file, buf) { return this.adapter.writeBinary(file.path, buf); }
  createFolder(path) { const p = PluginText.normalizePath(path); return PluginApp.ensureFolder(p).then(function () { return PluginApp.folder(p); }); }
  delete(file) { return PluginApp.deleteFile(file); }
  trash(file) { return PluginApp.deleteFile(file); }
  rename(file, newPath) { return PluginApp.renameFile(file, PluginText.normalizePath(newPath)); }
  copy(file, newPath) { return this.read(file).then(function (t) { return this.create(newPath, t); }.bind(this)); }
  getResourcePath(file) { return this.adapter.getResourcePath(file && file.path); }
  exists(path) { const p = PluginText.normalizePath(path); return this.getAbstractFileByPath(p) ? Promise.resolve(true) : this.adapter.exists(p); }
  getAvailablePath(base, ext) { let p = base + "." + ext, k = 1; while (this.getAbstractFileByPath(p)) { p = base + " " + k + "." + ext; k++; } return p; }
  static recurseChildren(folder, cb) { cb(folder); (folder.children || []).forEach(function (c) { if (c instanceof PluginTFolder) PluginVault.recurseChildren(c, cb); else cb(c); }); }
}

/* ---- the metadata cache ---- */
class PluginMetadataCache extends PluginEvents {
  constructor() { super(); this.cache = new WeakMap(); this.resolvedCache = null; }
  pos(line, col, offset) { return { line: line, col: col, offset: offset }; }
  parse(text) {
    const lines = String(text || "").split("\n"), out = { headings: [], links: [], embeds: [], tags: [], listItems: [], sections: [], blocks: {} };
    const offs = []; let o = 0;
    lines.forEach(function (l) { offs.push(o); o += l.length + 1; });
    const P = function (line, col) { return { line: line, col: col, offset: offs[line] + col }; };
    let start = 0;
    const fm = PluginText.frontMatterInfo(text);
    if (fm.exists) {
      const endLine = String(text).slice(0, fm.contentStart).split("\n").length - (String(text).slice(0, fm.contentStart).endsWith("\n") ? 2 : 1);
      try { out.frontmatter = PluginYaml.parse(fm.frontmatter); } catch (e) { out.frontmatter = {}; }
      if (!out.frontmatter || typeof out.frontmatter !== "object" || Array.isArray(out.frontmatter)) out.frontmatter = {};
      out.frontmatterPosition = { start: P(0, 0), end: P(endLine, lines[endLine].length) };
      out.sections.push({ type: "yaml", position: out.frontmatterPosition });
      out.frontmatterLinks = [];
      Object.keys(out.frontmatter).forEach(function (k) {
        const v = out.frontmatter[k];
        (Array.isArray(v) ? v : [v]).forEach(function (x) { const m = /^\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]*))?\]\]$/.exec(String(x)); if (m) out.frontmatterLinks.push({ key: k, link: m[1] + (m[2] || ""), original: String(x), displayText: m[3] || m[1] }); });
      });
      start = endLine + 1;
    }
    let inFence = false, sec = null, fenceStart = 0;
    const indentStack = [];
    const closeSec = function (end) { if (sec) { sec.position.end = P(end, lines[end].length); out.sections.push(sec); sec = null; } };
    for (let i = start; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*(```|~~~)/.test(l)) {
        if (!inFence) { closeSec(Math.max(start, i - 1)); inFence = true; fenceStart = i; } else { inFence = false; out.sections.push({ type: "code", position: { start: P(fenceStart, 0), end: P(i, l.length) } }); }
        continue;
      }
      if (inFence) continue;
      const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
      let type = "paragraph";
      if (h) { out.headings.push({ heading: h[2], level: h[1].length, position: { start: P(i, 0), end: P(i, l.length) } }); type = "heading"; }
      else if (/^\s*$/.test(l)) type = null;
      else if (/^\s*([-*+]|\d+[.)])\s/.test(l)) type = "list";
      else if (/^\s*>/.test(l)) type = "blockquote";
      else if (/^\s*\|/.test(l)) type = "table";
      else if (/^\s*(---|\*\*\*|___)\s*$/.test(l)) type = "thematicBreak";
      if (!type) { closeSec(Math.max(start, i - 1)); continue; }
      if (sec && (sec.type !== type || type === "heading")) closeSec(i - 1);
      if (!sec) sec = { type: type, position: { start: P(i, 0), end: P(i, l.length) } };
      const li = /^(\s*)([-*+]|\d+[.)])\s+(?:\[(.)\]\s)?/.exec(l);
      if (li) {
        const ind = li[1].length;
        while (indentStack.length && indentStack[indentStack.length - 1].ind >= ind) indentStack.pop();
        const item = { position: { start: P(i, ind), end: P(i, l.length) }, parent: indentStack.length ? indentStack[indentStack.length - 1].line : -(sec ? sec.position.start.line : i) };
        if (li[3] !== undefined) item.task = li[3];
        const bid = /\s\^([\w-]+)\s*$/.exec(l);
        if (bid) item.id = bid[1];
        out.listItems.push(item);
        indentStack.push({ ind: ind, line: i });
      } else if (type !== "list") indentStack.length = 0;
      const wl = /(!?)\[\[([^\]|#^]*)((?:#[^\]|]*)?)(?:\|([^\]]*))?\]\]/g;
      let m;
      while ((m = wl.exec(l))) {
        const ref = { link: m[2] + m[3], original: m[0], displayText: m[4] || (m[2] + m[3]), position: { start: P(i, m.index), end: P(i, m.index + m[0].length) } };
        (m[1] ? out.embeds : out.links).push(ref);
      }
      const ml = /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g;
      while ((m = ml.exec(l))) {
        if (/^[a-z][\w+.-]*:/i.test(m[3])) continue;
        let target = m[3];
        try { target = decodeURIComponent(target); } catch (e) { /* keep as written */ }
        (m[1] ? out.embeds : out.links).push({ link: target.replace(/\.md(#|$)/, "$1"), original: m[0], displayText: m[2], position: { start: P(i, m.index), end: P(i, m.index + m[0].length) } });
      }
      const tg = /(^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
      while ((m = tg.exec(l))) { const c = m.index + m[1].length; out.tags.push({ tag: "#" + m[2], position: { start: P(i, c), end: P(i, c + m[2].length + 1) } }); }
      const b = /\s\^([\w-]+)\s*$/.exec(l);
      if (b) out.blocks[b[1].toLowerCase()] = { id: b[1], position: { start: P(i, 0), end: P(i, l.length) } };
    }
    if (sec) closeSec(lines.length - 1);
    ["headings", "links", "embeds", "tags", "listItems"].forEach(function (k) { if (!out[k].length) delete out[k]; });
    if (!Object.keys(out.blocks).length) delete out.blocks;
    return out;
  }
  getFileCache(file) {
    if (!file || !file.note) return null;
    const n = file.note, c = this.cache.get(n);
    if (c && c.text === n.content) return c.cache;
    const cache = this.parse(n.content || "");
    this.cache.set(n, { text: n.content, cache: cache });
    return cache;
  }
  getCache(path) { return this.getFileCache(PluginApp.app.vault.getFileByPath(path)); }
  fileToLinktext(file, sourcePath, omitMd) {
    const base = file.extension === "md" && omitMd !== false ? file.basename : file.name;
    const same = PluginApp.files().filter(function (f) { return f.basename.toLowerCase() === file.basename.toLowerCase(); });
    if (same.length <= 1) return base;
    return omitMd !== false ? file.path.replace(/\.md$/i, "") : file.path;
  }
  getFirstLinkpathDest(linkpath, sourcePath) {
    let p = PluginText.parseLinktext(String(linkpath || "")).path.trim();
    if (!p) return sourcePath ? PluginApp.app.vault.getFileByPath(sourcePath) : null;
    p = p.replace(/^\/+/, "");
    const files = PluginApp.files(), lower = p.toLowerCase(), withMd = /\.md$/i.test(lower) ? lower : lower + ".md";
    const exact = files.find(function (f) { return f.path.toLowerCase() === withMd || f.path.toLowerCase() === lower; });
    if (exact) return exact;
    const name = withMd.split("/").pop();
    const hits = files.filter(function (f) { return f.name.toLowerCase() === name && (lower.indexOf("/") === -1 || f.path.toLowerCase().endsWith("/" + withMd)); });
    if (!hits.length) return null;
    const dir = sourcePath ? folderOf(sourcePath) : "";
    return hits.find(function (f) { return folderOf(f.path) === dir; }) || hits.sort(function (a, b) { return a.path.length - b.path.length; })[0];
  }
  computeLinks() {
    if (this.resolvedCache) return this.resolvedCache;
    const resolved = {}, unresolved = {};
    PluginApp.files().forEach(function (f) {
      const c = this.getFileCache(f), r = (resolved[f.path] = {}), u = (unresolved[f.path] = {});
      ((c && c.links) || []).concat((c && c.embeds) || []).forEach(function (l) {
        const d = this.getFirstLinkpathDest(l.link, f.path);
        if (d) r[d.path] = (r[d.path] || 0) + 1; else { const k = PluginText.parseLinktext(l.link).path; if (k) u[k] = (u[k] || 0) + 1; }
      }, this);
    }, this);
    this.resolvedCache = { resolved: resolved, unresolved: unresolved };
    return this.resolvedCache;
  }
  resolveLinks() { this.resolvedCache = null; }
  get resolvedLinks() { return this.computeLinks().resolved; }
  get unresolvedLinks() { return this.computeLinks().unresolved; }
  getBacklinksForFile(file) {
    const data = new Map();
    PluginApp.files().forEach(function (f) {
      const c = this.getFileCache(f);
      const refs = ((c && c.links) || []).concat((c && c.embeds) || []).filter(function (l) { const d = this.getFirstLinkpathDest(l.link, f.path); return d === file; }, this);
      if (refs.length) data.set(f.path, refs);
    }, this);
    return { data: data, count: function () { return data.size; }, keys: function () { return Array.from(data.keys()); }, get: function (k) { return data.get(k); } };
  }
  getTags() {
    const out = {};
    PluginApp.files().forEach(function (f) { (PluginApi.getAllTags(this.getFileCache(f)) || []).forEach(function (t) { out[t] = (out[t] || 0) + 1; }); }, this);
    return out;
  }
  getFrontmatterPropertyValuesForKey(key) {
    const out = new Set();
    PluginApp.files().forEach(function (f) { const c = this.getFileCache(f); if (c && c.frontmatter && c.frontmatter[key] !== undefined) [].concat(c.frontmatter[key]).forEach(function (v) { out.add(String(v)); }); }, this);
    return Array.from(out);
  }
  getLinkSuggestions() { return PluginApp.files().map(function (f) { return { file: f, path: f.path }; }); }
  isUserIgnored() { return false; }
  getCachedFiles() { return PluginApp.files().map(function (f) { return f.path; }); }
  /* Obsidian's private parser hooks: some plugins patch these to add their own fields */
  computeFileMetadataAsync(file) { return Promise.resolve(this.getFileCache(file)); }
  computeMetadataAsync(buf) { return Promise.resolve(this.parse(typeof buf === "string" ? buf : new TextDecoder().decode(buf))); }
  get initialized() { return true; }
}

/* ---- the workspace ---- */
/* Obsidian's file explorer, as plugins find it (getLeavesOfType("file-explorer")): CarbonFibre's own
   note list, with fileItems built from its rows each time they're asked for. The list redraws as
   notes change, so what a plugin adds to a row lasts until the next redraw. */
const PluginExplorer = {
  leafObj: null,
  items() {
    const out = {}, app = PluginApp.app, list = document.getElementById("notesList");
    if (!list || !app) return out;
    list.querySelectorAll(".side-item[data-nid]").forEach(function (el) {
      const n = state.notes.find(function (x) { return String(x.id) === el.dataset.nid; });
      const f = n && PluginApp.fileFor(n);
      if (!f) return;
      const row = el.querySelector(".side-item-row") || el, title = el.querySelector(".side-item-title") || row;
      out[f.path] = { el: el, selfEl: row, titleEl: row, titleInnerEl: title, innerEl: title, coverEl: row, file: f, view: PluginExplorer.leafObj && PluginExplorer.leafObj.view,
        setCollapsed: function () { return Promise.resolve(); }, updateTitle: function () {} };
    });
    list.querySelectorAll(".fold-head").forEach(function (head) {
      const nm = head.querySelector(".fold-name"), dir = nm && nm.title;
      const f = dir && app.vault.getFolderByPath(dir);
      if (!f) return;
      const body = head.nextElementSibling;
      out[f.path] = { el: head, selfEl: head, titleEl: head, titleInnerEl: nm, innerEl: nm, coverEl: head, childrenEl: body, file: f, collapsed: head.classList.contains("collapsed"),
        setCollapsed: function (on) { collapsedFolders[f.path] = !!on; renderSidebar(); return Promise.resolve(); }, updateTitle: function () {} };
    });
    return out;
  },
  leaf() {
    if (PluginExplorer.leafObj) return PluginExplorer.leafObj;
    const leaf = new PluginWorkspaceLeaf();
    const view = new PluginView(leaf);
    Object.defineProperty(view, "fileItems", { get: PluginExplorer.items });
    Object.assign(view, {
      containerEl: document.getElementById("side") || document.body, tree: { infinityScroll: { compute: function () {} } },
      getViewType: function () { return "file-explorer"; }, getDisplayText: function () { return "Files"; },
      requestSort: function () { renderSidebar(); }, sort: function () { renderSidebar(); }, onRename: function () {}, onCreate: function () {}, onDelete: function () {},
      revealInFolder: function (file) {
        const it = PluginExplorer.items()[file && file.path];
        if (it) it.el.scrollIntoView({ block: "nearest" });
      },
      getSortedFolderItems: function (folder) { return (folder.children || []).map(function (c) { return PluginExplorer.items()[c.path]; }).filter(Boolean); }
    });
    view.navFileContainerEl = view.containerEl;
    leaf.view = view;
    leaf.getViewState = function () { return { type: "file-explorer", state: {} }; };
    PluginExplorer.leafObj = leaf;
    return leaf;
  }
};

class PluginWorkspace extends PluginEvents {
  constructor() {
    super();
    this.layoutReady = false;
    this.readyCbs = [];
    this.rootSplit = new PluginWorkspaceRoot("root");
    this.leftSplit = new PluginWorkspaceSidedock("left");
    this.rightSplit = new PluginWorkspaceSidedock("right");
    this.leftRibbon = new PluginWorkspaceRibbon();
    this.rightRibbon = new PluginWorkspaceRibbon();
    this.floatingSplit = new PluginWorkspaceFloating();
    this.leftSplit.collapsed = sideEl ? sideEl.classList.contains("side-closed") : false;
    this.containerEl = document.getElementById("workarea") || document.body;
    this.requestSaveLayout = PluginText.debounce(function () {}, 1000);
    this.protocolHandlers = new Map();
    this.editorSuggest = { suggests: PluginHost.suggests, currentSuggest: null, addSuggest: function (s) { PluginHost.suggests.push(s); }, removeSuggest: function (s) { const i = PluginHost.suggests.indexOf(s); if (i !== -1) PluginHost.suggests.splice(i, 1); }, close: function () {} };
    this.requestActiveLeafEvents = function () {};
    this.requestResize = function () {};
  }
  leafFor(p) { if (!p) return null; let l = PluginApp.leafOfPane.get(p); if (!l) { l = new PluginPaneLeaf(p); PluginApp.leafOfPane.set(p, l); } return l; }
  get activeLeaf() {
    if (PluginApp.activeDockFocus && PluginDock.active) return PluginDock.active;
    return this.leafFor(focusedPane || panes[0]);
  }
  set activeLeaf(v) { this.setActiveLeaf(v); }
  get activeEditor() {
    const p = focusedPane || panes[0];
    if (!p || p.type !== "note" || !p.note()) return null;
    const v = this.leafFor(p).view;
    return { editor: v.editor, file: v.file, app: PluginApp.app };
  }
  getActiveFile() { const p = focusedPane || panes[0]; const n = p && p.type === "note" && p.note(); return n ? PluginApp.fileFor(n) : null; }
  getActiveViewOfType(type) {
    const leaf = this.activeLeaf;
    if (leaf && leaf.view && leaf.view instanceof type) {
      if (leaf instanceof PluginPaneLeaf && (leaf.pane.type !== "note" || !leaf.pane.note())) return null;
      return leaf.view;
    }
    return null;
  }
  getMostRecentLeaf() { return this.leafFor(focusedPane || panes[0]); }
  getActiveLeaf() { return this.activeLeaf; }
  getUnpinnedLeaf() { return this.getLeaf(false); }
  getLeaf(newLeaf) {
    if (newLeaf === "split" || newLeaf === "window") return this.leafFor(addPane(focusedPane || panes[0]));
    return this.leafFor(focusedPane || panes[0]);
  }
  createLeafBySplit(leaf) { return this.leafFor(addPane(leaf && leaf.pane ? leaf.pane : focusedPane)); }
  splitActiveLeaf() { return this.createLeafBySplit(this.activeLeaf); }
  duplicateLeaf(leaf) { const n = leaf && leaf.pane && leaf.pane.note(); return Promise.resolve(this.leafFor(addPane(leaf && leaf.pane, n ? n.id : null))); }
  createLeafInParent() { return this.getLeaf(false); }
  getRightLeaf() { return PluginDock.newLeaf(); }
  getLeftLeaf() { return PluginDock.newLeaf(); }
  ensureSideLeaf(type, side, opts) {
    opts = opts || {};
    const have = this.getLeavesOfType(type)[0];
    if (have) { if (opts.reveal !== false) this.revealLeaf(have); return Promise.resolve(have); }
    const leaf = PluginDock.newLeaf();
    return leaf.setViewState({ type: type, active: opts.active, state: opts.state }).then(function () { return leaf; });
  }
  openPopoutLeaf() { return PluginDock.newLeaf(); }
  moveLeafToPopout(leaf) { return leaf; }
  getLeavesOfType(type) {
    if (type === "markdown") return panes.filter(function (p) { return p.type === "note" && p.note(); }).map(this.leafFor, this);
    if (type === "file-explorer") return [PluginExplorer.leaf()];
    return PluginDock.leaves.filter(function (l) { return l.view && l.view.getViewType() === type; });
  }
  getLeafById(id) { let found = null; this.iterateAllLeaves(function (l) { if (l.id === id) found = l; }); return found; }
  getGroupLeaves() { return []; }
  revealLeaf(leaf) {
    if (leaf instanceof PluginDockLeaf) { PluginDock.select(leaf); PluginDock.show(); }
    else if (leaf && leaf.pane) PluginApp.focusPane(leaf.pane);
    return Promise.resolve();
  }
  setActiveLeaf(leaf, opts) { if (leaf && leaf.pane) PluginApp.focusPane(leaf.pane, opts && opts.focus === false); else if (leaf instanceof PluginDockLeaf) PluginDock.select(leaf); }
  detachLeavesOfType(type) { this.getLeavesOfType(type).forEach(function (l) { l.detach(); }); }
  iterateAllLeaves(cb) { panes.forEach(function (p) { cb(this.leafFor(p)); }, this); PluginDock.leaves.slice().forEach(function (l) { if (l.view) cb(l); }); }
  iterateRootLeaves(cb) { panes.forEach(function (p) { cb(this.leafFor(p)); }, this); }
  iterateCodeMirrors() {}
  /* the sources of hover previews (Page preview settings) */
  registerHoverLinkSource(id, info) { this.hoverLinkSources = this.hoverLinkSources || {}; this.hoverLinkSources[id] = info; }
  unregisterHoverLinkSource(id) { if (this.hoverLinkSources) delete this.hoverLinkSources[id]; }
  onLayoutReady(cb) { if (this.layoutReady) setTimeout(function () { try { cb(); } catch (e) { console.error(e); } }, 0); else this.readyCbs.push(cb); }
  markReady() {
    if (this.layoutReady) return;
    this.layoutReady = true;
    const cbs = this.readyCbs.splice(0);
    cbs.forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } });
    this.trigger("layout-ready");
    this.trigger("layout-change");
  }
  openLinkText(linktext, sourcePath, newLeaf, state2) {
    const lt = PluginText.parseLinktext(linktext);
    const dest = PluginApp.app.metadataCache.getFirstLinkpathDest(lt.path, sourcePath || "");
    const leaf = this.getLeaf(newLeaf);
    let ready;
    if (dest) ready = leaf.openFile(dest, state2);
    else { openOrCreateByTitle(lt.path.replace(/\.md$/i, "").split("/").pop(), leaf.pane); ready = Promise.resolve(); }
    return ready.then(function () {
      if (!lt.subpath || !leaf.pane) return;
      const want = lt.subpath.replace(/^#\^?/, "").toLowerCase(), ls = leaf.pane.lines || [];
      for (let i = 0; i < ls.length; i++) {
        const h = /^#{1,6}\s+(.+?)\s*$/.exec(ls[i]);
        if ((h && h[1].toLowerCase() === want) || ls[i].toLowerCase().endsWith("^" + want)) { leaf.view.editor.setCursor(i, 0); break; }
      }
    });
  }
  getLastOpenFiles() { return state.notes.toSorted(function (a, b) { return noteStamp(b) - noteStamp(a); }).slice(0, 10).map(PluginApp.notePath); }
  getLayout() { return {}; }
  changeLayout() { return Promise.resolve(); }
  updateOptions() {}
}

/* ---- the file manager ---- */
class PluginFileManager {
  processFrontMatter(file, fn) {
    const vault = PluginApp.app.vault;
    return vault.read(file).then(function (text) {
      const info = PluginText.frontMatterInfo(text);
      let fm = {};
      if (info.exists) { try { fm = PluginYaml.parse(info.frontmatter) || {}; } catch (e) { throw new Error("The front matter of " + file.path + " couldn't be read"); } }
      if (typeof fm !== "object" || Array.isArray(fm)) fm = {};
      fn(fm);
      const body = info.exists ? text.slice(info.contentStart) : text;
      const yaml = PluginYaml.stringify(fm);
      return vault.modify(file, (yaml ? "---\n" + yaml + "---\n" : "") + body);
    });
  }
  renameFile(file, newPath) { return PluginApp.app.vault.rename(file, newPath); }
  trashFile(file) { return PluginApp.app.vault.trash(file); }
  generateMarkdownLink(file, sourcePath, subpath, alias) {
    const t = PluginApp.app.metadataCache.fileToLinktext(file, sourcePath, true);
    return (file.extension !== "md" ? "!" : "") + "[[" + t + (subpath || "") + (alias ? "|" + alias : "") + "]]";
  }
  getNewFileParent() { return PluginApp.app.vault.getRoot(); }
  getAvailablePathForAttachment(name) {
    const dot = name.lastIndexOf("."), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot + 1) : "";
    return Promise.resolve(PluginApp.app.vault.getAvailablePath(base, ext));
  }
  createNewMarkdownFile(folder, name, content) {
    const dir = folder && folder.path && folder.path !== "/" ? folder.path + "/" : "";
    let p = dir + (name || "Untitled") + ".md", k = 1;
    while (PluginApp.app.vault.getAbstractFileByPath(p)) { p = dir + (name || "Untitled") + " " + k + ".md"; k++; }
    return PluginApp.app.vault.create(p, content || "");
  }
  createNewFile(folder, name, ext, content) { return this.createNewMarkdownFile(folder, name, content); }
}

/* ---- glue between CarbonFibre's notes and the classes above ---- */
const PluginApp = {
  app: null,
  fileOf: new WeakMap(),
  folders: new Map(),
  leafOfPane: new WeakMap(),
  lastCursor: new WeakMap(),
  activeDockFocus: false,

  notePath(n) { return n.path || (sanitizeName(n.title) + ".md"); },
  fileFor(n) { let f = PluginApp.fileOf.get(n); if (!f) { f = new PluginTFile(PluginApp.app.vault, n); PluginApp.fileOf.set(n, f); } return f; },
  files() { syncAllPanes(); return state.notes.map(PluginApp.fileFor); },
  fileByPath(p) {
    for (let i = 0; i < state.notes.length; i++) if (PluginApp.notePath(state.notes[i]) === p) return PluginApp.fileFor(state.notes[i]);
    return null;
  },
  folder(path) {
    const p = !path || path === "/" ? "/" : path;
    let f = PluginApp.folders.get(p);
    if (!f) { f = new PluginTFolder(PluginApp.app.vault, p); PluginApp.folders.set(p, f); }
    return f;
  },
  folderPaths() {
    const set = new Set();
    state.folders.forEach(function (f) { set.add(f.path); });
    state.notes.forEach(function (n) { let d = folderOf(PluginApp.notePath(n)); while (d) { set.add(d); d = folderOf(d); } });
    return Array.from(set).sort();
  },
  folderExists(p) { return PluginApp.folderPaths().indexOf(p) !== -1; },
  allFolders() { return PluginApp.folderPaths().map(PluginApp.folder); },
  childrenOf(path) {
    const key = path === "/" ? "" : path;
    const kids = PluginApp.folderPaths().filter(function (d) { return folderOf(d) === key; }).map(PluginApp.folder);
    return kids.concat(PluginApp.files().filter(function (f) { return folderOf(f.path) === key; }));
  },
  focusPane(p, noFocus) {
    if (!p) return;
    panes.forEach(function (q) { q.root.classList.toggle("focused", q === p); });
    focusedPane = p;
    if (!noFocus && p.focusThis) p.focusThis();
  },

  /* change a note's text the way CarbonFibre's own bulk edits do */
  setContent(n, text) {
    syncAllPanes();
    if (n.content === text) return;
    n.content = text;
    markDirty(n);
    panes.forEach(function (p) {
      if (p.type !== "note" || !sameId(p.noteId, n.id)) return;
      const keep = p.activeLine !== null && p.ta ? { line: p.activeLine, ch: p.ta.selectionStart } : null;
      p.deactivate();
      p.activeLine = null;
      p.reload();
      p.render();
      if (keep && p === focusedPane && keep.line < p.lines.length) p.setActive(keep.line, Math.min(keep.ch, p.lines[keep.line].length));
    });
  },
  ensureFolder(path) {
    if (!path || path === "/" || state.backend !== "folder") return Promise.resolve();
    const parts = path.split("/").filter(Boolean);
    let dir = state.dirHandle, cur = "";
    let chain = Promise.resolve();
    parts.forEach(function (seg) {
      chain = chain.then(function () {
        const parentH = dir;
        cur = cur ? cur + "/" + seg : seg;
        const here = cur;
        return parentH.getDirectoryHandle(seg, { create: true }).then(function (h) {
          dir = h;
          if (!state.folders.some(function (f) { return f.path === here; })) state.folders.push({ path: here, handle: h, parent: parentH });
        });
      });
    });
    return chain.then(function () { renderSidebar(); });
  },
  createFile(path, data) {
    if (!/\.md$/i.test(path)) return PluginApp.app.vault.adapter.write(path, data).then(function () { return new PluginTFile(PluginApp.app.vault, null, path); });
    if (PluginApp.app.vault.getAbstractFileByPath(path)) return Promise.reject(new Error("File already exists."));
    let n;
    if (state.backend === "folder") {
      const dir = folderOf(path);
      return PluginApp.ensureFolder(dir).then(function () {
        n = { id: path, path: path, title: path.split("/").pop().replace(/\.md$/i, ""), content: data, handle: null, parent: folderHandle(dir), mtime: 0, touched: Date.now() };
        state.notes.push(n);
        sortNotes();
        return writeNoteFile(n);
      }).then(function () {
        renderSidebar();
        const f = PluginApp.fileFor(n);
        PluginHost.noteCreated(n);
        return f;
      });
    }
    n = { id: noteSeq++, title: sanitizeName(path.split("/").pop().replace(/\.md$/i, "")), content: data, path: null, handle: null, parent: null, touched: Date.now() };
    state.notes.push(n);
    schedulePersist();
    renderSidebar();
    PluginHost.noteCreated(n);
    return Promise.resolve(PluginApp.fileFor(n));
  },
  deleteFile(file) {
    if (file instanceof PluginTFolder) {
      const inside = state.notes.filter(function (n) { return PluginApp.notePath(n).indexOf(file.path + "/") === 0; });
      if (state.backend === "folder") deleteFolderNow(file.path, inside);
      else inside.forEach(function (n) { removeNoteNow(n.id); });
      return Promise.resolve();
    }
    if (file && file.note) { removeNoteNow(file.note.id); return Promise.resolve(); }
    return file ? PluginApp.app.vault.adapter.remove(file.path) : Promise.resolve();
  },
  renameFile(file, newPath) {
    if (!file || !file.note) return file ? PluginApp.app.vault.adapter.rename(file.path, newPath) : Promise.resolve();
    const n = file.note, title = newPath.split("/").pop().replace(/\.md$/i, ""), dir = folderOf(newPath);
    let chain = Promise.resolve();
    if (state.backend === "folder" && dir !== folderOf(n.path)) chain = chain.then(function () { return PluginApp.ensureFolder(dir); }).then(function () { return moveNote(n.id, dir); });
    return chain.then(function () { if (title !== n.title) return commitRename(n, title); return undefined; });
  }
};
