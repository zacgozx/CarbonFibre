  /* ---- DOM ---- */
  var col = document.createElement("div");
  col.className = "pane-col";
  col.innerHTML =
    '<div class="pane-bar">' +
      '<div class="tabs"></div>' +
      '<span class="pane-tools">' +
        '<button class="mini-pill md-live on" title="In-place live preview">Live</button>' +
        '<button class="mini-pill md-split" title="Raw source next to a rendered preview">Source</button>' +
        '<button class="mini-pill pb-ico md-sheet" title="Edit the table under the cursor as a sheet (Ctrl+Shift+S)">' +
          '<svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/>' +
          '<rect class="fill" x="2" y="2.5" width="12" height="3.2" rx="1.5"/>' +
          '<path d="M2 9.2h12M6.3 5.7v7.8M10.1 5.7v7.8"/></svg></button>' +
        '<button class="mini-pill pb-ico md-more" title="Split this pane to the right (Ctrl+\\)">' +
          '<svg viewBox="0 0 16 16"><rect x="1.8" y="2.5" width="12.4" height="11" rx="1.5"/>' +
          '<path d="M8 2.5v11"/></svg></button>' +
        '<button class="mini-pill pb-ico md-close" title="Close this pane" aria-label="Close this pane">' + ico("x") + '</button>' +
      "</span>" +
    "</div>" +
    '<div class="crumbs" aria-label="Location in note"></div>' +
    '<div class="pane-empty"><p>No note open.</p></div>' +
    '<div class="editor"><div class="editor-inner"></div><div class="editor-tail"></div></div>' +
    '<div class="split"><textarea class="split-src" spellcheck="false"></textarea><div class="split-prev"></div></div>' +
    '<div class="backlinks">' +
      '<div class="bl-head"><span class="bl-chev">' + ico("chevronDown") + '</span><span class="bl-label">Linked mentions</span> <span class="bl-count"></span></div>' +
      '<div class="bl-body"></div>' +
    "</div>";

  p.root = col;
  p.crumbEl = col.querySelector(".crumbs");
  p.tabsEl = col.querySelector(".tabs");
  p.moreBtn = col.querySelector(".md-more");
  p.sheetBtn = col.querySelector(".md-sheet");
  p.emptyEl = col.querySelector(".pane-empty");
  p.editorEl = col.querySelector(".editor");
  p.linesEl = col.querySelector(".editor-inner");
  p.tailEl = col.querySelector(".editor-tail");
  p.splitEl = col.querySelector(".split");
  p.srcEl = col.querySelector(".split-src");
  p.prevEl = col.querySelector(".split-prev");
  p.blEl = col.querySelector(".backlinks");
  p.blBody = col.querySelector(".bl-body");
  p.blCount = col.querySelector(".bl-count");
  p.closeBtn = col.querySelector(".md-close");
  p.liveBtn = col.querySelector(".md-live");
  p.splitBtn = col.querySelector(".md-split");
  p.srcEl.spellcheck = SPELLCHECK;

