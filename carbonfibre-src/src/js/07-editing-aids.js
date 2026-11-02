/* ============================================================
   editing aids - flip these off if they get in the way
   ============================================================ */

var SPELLCHECK = true;      /* Edge's spellchecker on note text (not in code fences) */
var AUTOCORRECT_ON = true;  /* fix words in AUTOCORRECT when you type the next space / punctuation */
var COMPLETE_ON = true;     /* popup: [[ suggests note titles, 3+ letters suggests words from the vault */

/* typo -> fix. Case of the first letter is kept. */
var AUTOCORRECT = {
  "teh": "the", "adn": "and", "hte": "the", "taht": "that", "waht": "what", "wiht": "with",
  "recieve": "receive", "seperate": "separate", "occured": "occurred", "definately": "definitely",
  "untill": "until", "wich": "which", "becuase": "because", "thier": "their", "beleive": "believe",
  "accomodate": "accommodate", "enviroment": "environment", "reccomend": "recommend",
  "i": "I", "im": "I'm", "ive": "I've", "dont": "don't", "cant": "can't", "didnt": "didn't", "wont": "won't"
};

/* words the completion popup can offer: every 5+ letter word in the vault, rebuilt at most every 1.5s */
var vocabCache = { key: "", at: 0, words: [] };
function vocabulary() {
  var now = Date.now();
  if (now - vocabCache.at < 1500) return vocabCache.words;
  syncAllPanes();
  var key = state.notes.length + ":" + state.notes.reduce(function (a, n) { return a + n.content.length; }, 0);
  vocabCache.at = now;
  if (key === vocabCache.key) return vocabCache.words;
  var seen = {}, out = [];
  state.notes.forEach(function (n) {
    (n.content.match(/[A-Za-z][A-Za-z0-9_-]{4,}/g) || []).forEach(function (w) {
      var k = w.toLowerCase();
      if (!seen[k]) { seen[k] = 1; out.push(w); }
    });
  });
  out.sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
  vocabCache.key = key; vocabCache.words = out;
  return out;
}

