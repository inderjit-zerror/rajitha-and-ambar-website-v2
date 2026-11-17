// Converts a WOFF (v1) font into a plain TTF/OTF so sharp/Pango can render it.
// Usage: node scripts/woff-to-ttf.mjs input.woff output.ttf
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const [, , input, output] = process.argv;
const woff = readFileSync(input);
if (woff.toString("ascii", 0, 4) !== "wOFF") throw new Error("Not a WOFF v1 file");

const flavor = woff.readUInt32BE(4);
const numTables = woff.readUInt16BE(12);
const tables = [];
for (let i = 0; i < numTables; i++) {
  const o = 44 + i * 20;
  const tag = woff.toString("ascii", o, o + 4);
  const offset = woff.readUInt32BE(o + 4);
  const compLength = woff.readUInt32BE(o + 8);
  const origLength = woff.readUInt32BE(o + 12);
  const checksum = woff.readUInt32BE(o + 16);
  const raw = woff.subarray(offset, offset + compLength);
  const data = compLength < origLength ? inflateSync(raw) : Buffer.from(raw);
  tables.push({ tag, checksum, data });
}

const pow2 = 2 ** Math.floor(Math.log2(numTables));
const header = Buffer.alloc(12 + numTables * 16);
header.writeUInt32BE(flavor, 0);
header.writeUInt16BE(numTables, 4);
header.writeUInt16BE(pow2 * 16, 6);
header.writeUInt16BE(Math.log2(pow2), 8);
header.writeUInt16BE(numTables * 16 - pow2 * 16, 10);

let offset = header.length;
const chunks = [];
tables.forEach((t, i) => {
  const r = 12 + i * 16;
  header.write(t.tag, r, 4, "ascii");
  header.writeUInt32BE(t.checksum, r + 4);
  header.writeUInt32BE(offset, r + 8);
  header.writeUInt32BE(t.data.length, r + 12);
  const padded = Buffer.alloc((t.data.length + 3) & ~3);
  t.data.copy(padded);
  chunks.push(padded);
  offset += padded.length;
});

writeFileSync(output, Buffer.concat([header, ...chunks]));
console.log(`wrote ${output}`);
