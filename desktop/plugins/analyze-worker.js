/* Runs compat.analyze off the main thread: large plugins take a while to read. */
"use strict";
const { parentPort } = require("node:worker_threads");
const { analyze } = require("./compat");

parentPort.on("message", (job) => {
  let result;
  try { result = analyze(job.code, job.manifest, job.info); }
  catch (e) { result = { level: "no", reasons: ["Couldn't check this plugin: " + e.message], notes: [] }; }
  parentPort.postMessage({ id: job.id, result });
});
