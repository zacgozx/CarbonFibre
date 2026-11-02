/* ============================================================
   IndexedDB (folder handle persistence)
   ============================================================ */

function idbOpen() {
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open("myobsidian-db", 1);
    req.onupgradeneeded = function () { req.result.createObjectStore("kv"); };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}
/* one transaction wrapper; run(store) returns a request for reads, nothing for writes */
function idb(mode, run) {
  return idbOpen().then(function (db) {
    return new Promise(function (res, rej) {
      const tx = db.transaction("kv", mode);
      const rq = run(tx.objectStore("kv"));
      if (rq) rq.onsuccess = function () { res(rq.result); };
      else tx.oncomplete = res;
      tx.onerror = function () { rej(tx.error); };
    });
  });
}
function idbSet(k, v) { return idb("readwrite", function (st) { st.put(v, k); }); }
function idbGet(k) { return idb("readonly", function (st) { return st.get(k); }); }
function idbDel(k) { return idb("readwrite", function (st) { st.delete(k); }); }

