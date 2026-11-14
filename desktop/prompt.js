"use strict";
const form = document.getElementById("f");
const input = document.getElementById("val");
window.cfPrompt.init().then((d) => {
  if (!d) { window.cfPrompt.done(null); return; }
  document.getElementById("msg").textContent = d.message;
  input.value = d.value;
  window.cfPrompt.size(document.body.scrollHeight);
  input.focus();
  input.select();
});
form.addEventListener("submit", (e) => { e.preventDefault(); window.cfPrompt.done(input.value); });
document.getElementById("cancel").addEventListener("click", () => window.cfPrompt.done(null));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") window.cfPrompt.done(null); });
