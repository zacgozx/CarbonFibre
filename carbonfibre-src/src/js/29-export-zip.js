/* ============================================================
   ZIP (store only) - a .docx is a zip of a few XML parts
   ============================================================ */

var CRC_TABLE = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(files) {                 /* files: [{ name, bytes }] */
  var chunks = [], central = [], offset = 0;
  function u16(n) { return [n & 255, (n >>> 8) & 255]; }
  function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

  files.forEach(function (f) {
    var nameBytes = new TextEncoder().encode(f.name);
    var crc = crc32(f.bytes), size = f.bytes.length;
    var local = [].concat([0x50, 0x4B, 0x03, 0x04], u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0));
    chunks.push(new Uint8Array(local), nameBytes, f.bytes);
    central.push([].concat([0x50, 0x4B, 0x01, 0x02], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), Array.prototype.slice.call(nameBytes)));
    offset += local.length + nameBytes.length + size;
  });

  var centralBytes = [];
  central.forEach(function (c) { centralBytes = centralBytes.concat(c); });
  var end = [].concat([0x50, 0x4B, 0x05, 0x06], u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBytes.length), u32(offset), u16(0));
  chunks.push(new Uint8Array(centralBytes), new Uint8Array(end));

  var total = chunks.reduce(function (n, c) { return n + c.length; }, 0);
  var out = new Uint8Array(total), at = 0;
  chunks.forEach(function (c) { out.set(c, at); at += c.length; });
  return out;
}

