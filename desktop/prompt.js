"use strict";
/* the same light or dark as the app: the window it was opened from passes it along */
const form = document.getElementById("f");
const input = document.getElementById("val");
window.cfPrompt.init().then((d) => {
  if (!d) { window.cfPrompt.done(null); return; }
  if (d.theme === "light") document.documentElement.setAttribute("data-theme", "light");
  if (/^#[0-9a-f]{6}$/i.test(d.accent || "")) document.documentElement.style.setProperty("--acc", d.accent);
  document.getElementById("msg").textContent = d.message;
  input.value = d.value;
  window.cfPrompt.size(document.body.scrollHeight);
  input.focus();
  input.select();
});
form.addEventListener("submit", (e) => { e.preventDefault(); window.cfPrompt.done(input.value); });
document.getElementById("cancel").addEventListener("click", () => window.cfPrompt.done(null));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") window.cfPrompt.done(null); });
