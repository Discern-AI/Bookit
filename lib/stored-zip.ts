// ZIP stored entries, based on PKWARE APPNOTE 4.3:
// https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
// Fixed ASCII filenames and bounded entries; no compression or ZIP64.
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function storedZip(entries: { name: string; data: Uint8Array }[]) {
  if (!entries.length || entries.length > 20)
    throw Error("Invalid archive size");
  const names = new Set<string>();
  const parts: Uint8Array[] = [],
    directory: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (
      !/^[a-z0-9][a-z0-9_.-]{0,79}$/.test(entry.name) ||
      names.has(entry.name)
    )
      throw Error("Invalid archive filename");
    names.add(entry.name);
    if (
      entry.data.length > 30 * 1024 * 1024 ||
      offset + entry.data.length > 32 * 1024 * 1024
    )
      throw Error("Archive too large");
    const name = Buffer.from(entry.name, "ascii"),
      checksum = crc32(entry.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    parts.push(local, entry.data);
    directory.push(central);
    offset += local.length + entry.data.length;
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  parts.push(...directory, end);
  return { parts, size: offset + directorySize + end.length };
}
