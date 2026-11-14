/* ============================================================
   ZIP (store only) - a .docx is a zip of a few XML parts
   ============================================================ */

const CRC_TABLE = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(files) {                 /* files: [{ name, bytes }] */
  const chunks = [], central = [];
  let offset = 0;
  function u16(n) { return [n & 255, (n >>> 8) & 255]; }
  function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

  files.forEach(function (f) {
    const nameBytes = new TextEncoder().encode(f.name);
    const crc = crc32(f.bytes), size = f.bytes.length;
    const local = [].concat([0x50, 0x4B, 0x03, 0x04], u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0));
    chunks.push(new Uint8Array(local), nameBytes, f.bytes);
    central.push([].concat([0x50, 0x4B, 0x01, 0x02], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), Array.prototype.slice.call(nameBytes)));
    offset += local.length + nameBytes.length + size;
  });

  let centralBytes = [];
  central.forEach(function (c) { centralBytes = centralBytes.concat(c); });
  const end = [].concat([0x50, 0x4B, 0x05, 0x06], u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBytes.length), u32(offset), u16(0));
  chunks.push(new Uint8Array(centralBytes), new Uint8Array(end));

  const total = chunks.reduce(function (n, c) { return n + c.length; }, 0);
  const out = new Uint8Array(total);
  let at = 0;
  chunks.forEach(function (c) { out.set(c, at); at += c.length; });
  return out;
}

