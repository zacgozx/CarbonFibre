  /* ---- insert a block of text (agent answers) ---- */
  p.insertBlock = function (text) {
    var n = p.note();
    if (!n) return;
    histBreak(p);
    var ls = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
    if (p.mode !== "live") {
      p.sync();
      n.content = n.content.replace(/\n*$/, "") + "\n\n" + ls.join("\n") + "\n";
      p.reload();
      p.render();
      markDirty(n);
      return;
    }
    var at = p.activeLine !== null ? p.activeLine + 1 : p.lines.length;
    var block = ls.slice();
    if (at > 0 && p.lines[at - 1].trim() !== "") block.unshift("");
    Array.prototype.splice.apply(p.lines, [at, 0].concat(block));
    p.commit(true);
    p.deactivate();
    p.activeLine = null;
    renderAllLines();
    var node = nodeAt(at);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: "center" });
    node && node.classList.add("flash");
  };

  /* ---- backlinks ---- */

  col.querySelector(".bl-head").addEventListener("click", function () {
    p.blCollapsed = !p.blCollapsed;
    p.blEl.classList.toggle("collapsed", p.blCollapsed);
  });

  p.renderBacklinks = function () {
    var n = p.note();
    p.blBody.innerHTML = "";
    if (!n) { p.blEl.style.display = "none"; return; }
    p.blEl.style.display = "";
    var refs = backlinksFor(n.title);
    p.blCount.textContent = refs.length ? String(refs.length) : "0";
    if (!refs.length) {
      var e0 = document.createElement("div");
      e0.className = "bl-empty";
      e0.textContent = "No other note links here yet. Use [[" + n.title + "]] elsewhere to create one.";
      p.blBody.appendChild(e0);
      return;
    }
    refs.forEach(function (r) {
      var it = document.createElement("div");
      it.className = "bl-item";
      var src = document.createElement("div");
      src.className = "bl-src";
      src.textContent = r.note.title;
      var ln = document.createElement("div");
      ln.className = "bl-line";
      ln.textContent = r.text.trim() || "(empty line)";
      it.appendChild(src); it.appendChild(ln);
      it.addEventListener("click", function () {
        focusThis();
        jumpTo(r.note.id, r.line, 0, 0, p);
      });
      p.blBody.appendChild(it);
    });
  };

  /* ---- mode + render ---- */

  p.setMode = function (m) {
    if (p.mode === m) return;
    p.sync();
    p.deactivate();
    p.mode = m;
    p.render();
    scheduleSession();
  };
  p.liveBtn.addEventListener("click", function () { focusThis(); p.setMode("live"); });
  p.splitBtn.addEventListener("click", function () { focusThis(); p.setMode("split"); });
  p.closeBtn.addEventListener("click", function () { closePane(p); });
  p.moreBtn.addEventListener("click", function () { addPane(p); });
  p.sheetBtn.addEventListener("click", function () {
    focusThis();
    if (!editTableAsSheet(p)) pushToastLike("Put the cursor inside a table first.");
  });

  /* what each pane type shows. The note entry is the original code, unchanged. */
  /* a pane showing something other than a note: keep the tabs, hide the note's parts */
  function showNonNote() {
    p.renderTabs();
    p.emptyEl.classList.remove("show");
    p.editorEl.classList.remove("show");
    p.splitEl.classList.remove("show");
    p.blEl.style.display = "none";
    p.closeBtn.style.display = panes.length > 1 ? "" : "none";
  }
  var PANE_RENDER = {
    note: function () { p.renderNote(); renderCrumbs(p); },
    sheet: function () {
      showNonNote();
      if (p.grid) p.grid.root.classList.add("show");
    },
    sketch: function () {
      if (p.parked) { p.root.classList.add("is-sketch"); skRenderParked(p); }
      else if (p.parkEl) p.parkEl.classList.remove("show");
      showNonNote();
    }
  };

  PANE_RENDER.taskboard = function () { showNonNote(); };
  p.render = function () {
    if (p.tbRoot) p.tbRoot.classList.toggle("show", p.type === "taskboard");
    if (p.crumbEl) p.crumbEl.style.display = p.type === "taskboard" ? "none" : "";   /* the note's breadcrumbs don't belong on the board */
    (PANE_RENDER[p.type] || PANE_RENDER.note)();
    var ab = document.getElementById("actBoard");
    if (ab) ab.classList.toggle("on", panes.some(function (q) { return q.type === "taskboard"; }));
  };

  p.renderNote = function () {
    if (p.grid) p.grid.root.classList.remove("show");
    if (p.parkEl) p.parkEl.classList.remove("show");
    var n = p.note();
    p.liveBtn.classList.toggle("on", p.mode === "live");
    p.splitBtn.classList.toggle("on", p.mode === "split");
    p.renderTabs();
    p.emptyEl.classList.toggle("show", !n);
    p.editorEl.classList.toggle("show", !!n && p.mode === "live");
    p.splitEl.classList.toggle("show", !!n && p.mode === "split");
    p.closeBtn.style.display = panes.length > 1 ? "" : "none";
    if (!n) { p.linesEl.innerHTML = ""; p.prevEl.innerHTML = ""; p.blEl.style.display = "none"; return; }
    if (p.mode === "live") renderAllLines();
    else {
      if (p.srcEl.value !== n.content) p.srcEl.value = n.content;
      renderPreview();
    }
    p.renderBacklinks();
  };

  return p;
}