/* ============================================================
   editing aids - flip these off if they get in the way
   ============================================================ */

const SPELLCHECK = true;      /* Edge's spellchecker on note text (not in code fences) */
const AUTOCORRECT_ON = true;  /* fix words in AUTOCORRECT when you type the next space / punctuation */
const COMPLETE_ON = true;     /* popup: [[ suggests note titles, 3+ letters suggests words from the vault */

/* typo -> fix. Case of the first letter is kept. */
const AUTOCORRECT = {
  "teh": "the", "adn": "and", "hte": "the", "taht": "that", "waht": "what", "wiht": "with",
  "recieve": "receive", "seperate": "separate", "occured": "occurred", "definately": "definitely",
  "untill": "until", "wich": "which", "becuase": "because", "thier": "their", "beleive": "believe",
  "accomodate": "accommodate", "enviroment": "environment", "reccomend": "recommend",
  "i": "I", "im": "I'm", "ive": "I've", "dont": "don't", "cant": "can't", "didnt": "didn't", "wont": "won't"
};

/* words the completion popup can offer: every 5+ letter word in the vault, with how often it's used
   and whether it's in a note edited in the last three days; rebuilt at most every 1.5s */
const vocabCache = { key: "", at: 0, words: [], freq: new Map(), recent: new Set() };
function vocabulary() {
  const now = Date.now();
  if (now - vocabCache.at < 1500) return vocabCache.words;
  syncAllPanes();
  const key = state.notes.length + ":" + state.notes.reduce(function (a, n) { return a + n.content.length; }, 0);
  vocabCache.at = now;
  if (key === vocabCache.key) return vocabCache.words;
  const freq = new Map(), form = new Map(), recent = new Set(), out = [];
  const fresh = now - 3 * 864e5;
  state.notes.forEach(function (n) {
    const isNew = noteStamp(n) > fresh;
    (n.content.match(/[A-Za-z][A-Za-z0-9_-]{4,}/g) || []).forEach(function (w) {
      const k = w.toLowerCase();
      freq.set(k, (freq.get(k) || 0) + 1);
      if (!form.has(k)) { form.set(k, w); out.push(w); }
      if (isNew) recent.add(k);
    });
  });
  out.sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
  vocabCache.key = key; vocabCache.words = out; vocabCache.freq = freq; vocabCache.recent = recent;
  return out;
}

/* ============================================================
   Completion ranking and snippets, for the popup in the editor (js/pane/10-edited-line-completion.js).
   - matches: the start of the word first, then the start of a part ("vault" finds "ObsidianVault",
     "my-vault"), then the letters in order from the first ("splk" finds "Splunk")
   - then: words you picked before (recently more), words used often, words in notes edited lately
   - snippets: "/" at the start of a word offers /date, /time, /todo...
   ============================================================ */
const Complete = {
  PICKS_KEY: "carbonfibre-complete-picks",
  picks: null,                              /* lower-case word -> [times picked, last picked] */
  MAX_PICKS: 400,

  loadPicks() {
    if (Complete.picks) return Complete.picks;
    let o = null;
    try { o = JSON.parse(localStorage.getItem(Complete.PICKS_KEY) || "null"); } catch (e) { /* storage off */ }
    Complete.picks = o && typeof o === "object" && !Array.isArray(o) ? o : {};
    return Complete.picks;
  },
  remember(word) {
    const pk = Complete.loadPicks(), k = String(word).toLowerCase(), had = pk[k];
    pk[k] = [(had ? had[0] : 0) + 1, Date.now()];
    const keys = Object.keys(pk);
    if (keys.length > Complete.MAX_PICKS) {
      keys.sort(function (a, b) { return pk[a][1] - pk[b][1]; }).slice(0, keys.length - Complete.MAX_PICKS).forEach(function (x) { delete pk[x]; });
    }
    storeSet(Complete.PICKS_KEY, JSON.stringify(pk));
  },

  /* how well what you typed matches a word: { score, hits: [indexes of matched letters] } or null */
  match(typed, word) {
    const q = typed.toLowerCase(), w = word.toLowerCase();
    if (!q) return null;
    const run = function (from) { const h = []; for (let k = 0; k < q.length; k++) h.push(from + k); return h; };
    if (w.indexOf(q) === 0) return { score: 100, hits: run(0) };
    /* the start of a later part: after - _ or a lower-to-upper change */
    for (let k = 1; k < word.length; k++) {
      const part = /[-_]/.test(word.charAt(k - 1)) || (/[a-z]/.test(word.charAt(k - 1)) && /[A-Z]/.test(word.charAt(k)));
      if (part && w.indexOf(q, k) === k) return { score: 75, hits: run(k) };
    }
    /* the letters in order, from the first: fewer and shorter gaps score higher */
    if (w.charAt(0) !== q.charAt(0)) return null;
    const hits = [0];
    let at = 1, gaps = 0;
    for (let k = 1; k < q.length; k++) {
      const f = w.indexOf(q.charAt(k), at);
      if (f < 0) return null;
      if (f !== at) gaps++;
      hits.push(f); at = f + 1;
    }
    const spread = hits[hits.length - 1] - q.length + 1;
    return { score: Math.max(10, 60 - gaps * 8 - spread * 2), hits: hits };
  },

  /* the best words for what's typed, best first */
  rank(typed, words, max, keepCase) {
    const q = typed.toLowerCase(), pk = Complete.loadPicks(), now = Date.now(), out = [];
    words.forEach(function (w) {
      const k = w.toLowerCase();
      if (k === q || w.length < typed.length) return;
      const m = Complete.match(typed, w);
      if (!m) return;
      const f = vocabCache.freq.get(k) || 0, p = pk[k];
      let s = m.score + 6 * Math.log2(1 + f);
      if (p) s += 12 * Math.log2(1 + p[0]) + 30 * Math.exp(-(now - p[1]) / (7 * 864e5));
      if (vocabCache.recent.has(k)) s += 8;
      out.push({ word: keepCase ? w : Complete.caseLike(typed, w), score: s, hits: m.hits });
    });
    out.sort(function (a, b) { return b.score - a.score || a.word.length - b.word.length || a.word.localeCompare(b.word); });
    return out.slice(0, max || 6);
  },
  /* typed with a capital first letter: the pick starts with one too ("Splk" -> "Splunk") */
  caseLike(typed, word) {
    const c = typed.charAt(0);
    return c !== c.toLowerCase() && word.charAt(0) === word.charAt(0).toLowerCase() ? c + word.slice(1) : word;
  },

  pad(n) { return (n < 10 ? "0" : "") + n; },
  ymd(d) { return d.getFullYear() + "-" + Complete.pad(d.getMonth() + 1) + "-" + Complete.pad(d.getDate()); },
  hm(d) { return Complete.pad(d.getHours()) + ":" + Complete.pad(d.getMinutes()); },
  dayOff(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; },
  SNIPPETS: [
    { key: "date", label: "Today's date", text: function () { return Complete.ymd(new Date()); } },
    { key: "time", label: "The time now", text: function () { return Complete.hm(new Date()); } },
    { key: "now", label: "Date and time", text: function () { const d = new Date(); return Complete.ymd(d) + " " + Complete.hm(d); } },
    { key: "today", label: "Link to today's note", text: function () { return "[[" + Complete.ymd(new Date()) + "]]"; } },
    { key: "tomorrow", label: "Tomorrow's date", text: function () { return Complete.ymd(Complete.dayOff(1)); } },
    { key: "yesterday", label: "Yesterday's date", text: function () { return Complete.ymd(Complete.dayOff(-1)); } },
    { key: "todo", label: "A checkbox", text: function () { return "- [ ] "; }, lineStart: true },
    { key: "done", label: "A ticked checkbox", text: function () { return "- [x] "; }, lineStart: true },
    { key: "h1", label: "Heading", text: function () { return "# "; }, lineStart: true },
    { key: "h2", label: "Subheading", text: function () { return "## "; }, lineStart: true },
    { key: "quote", label: "Quote", text: function () { return "> "; }, lineStart: true },
    { key: "code", label: "Code block", text: function () { return "```"; }, lineStart: true },
    { key: "divider", label: "A line across", text: function () { return "---"; }, lineStart: true }
  ],
  /* "/da" -> the snippets whose name starts with "da" (all of them for "/") */
  snippets(q) {
    const l = q.toLowerCase();
    return Complete.SNIPPETS.filter(function (s) { return s.key.indexOf(l) === 0; });
  }
};
