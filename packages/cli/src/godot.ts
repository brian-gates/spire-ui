// Small Godot 4 text and resource formats found in the game's pack: texture `.import` remaps,
// AtlasTexture `.tres` files, localization strings, RSCC-compressed resources and the font file
// embedded in an imported FontFile. All input is untrusted pack data: parsers return null for
// shapes they do not recognise and bound every size they read before allocating.
import { decompress as zstdDecompress } from "fzstd";
import { gunzipSync, inflateSync } from "node:zlib";

/** Texture variants the decoder handles, in preference order (desktop BC formats or uncompressed). */
const IMPORT_KEYS = ["path", "path.bptc", "path.s3tc"];

/** The imported resource a `<file>.import` remap points at (pack path, without `res://`). */
export function importTarget(text: string): string | null {
  for (const key of IMPORT_KEYS) {
    const m = new RegExp(`^${key.replace(".", "\\.")}="res://([^"]+)"`, "m").exec(text);
    if (m?.[1]) return m[1];
  }
  return null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An AtlasTexture `.tres`: which atlas image (pack path) and which region of it. */
export function parseAtlasTres(text: string): { atlas: string; region: Rect } | null {
  const atlas = /\[ext_resource [^\]]*path="res:\/\/([^"]+)"/.exec(text)?.[1];
  const r = /^region = Rect2\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/m.exec(text);
  if (!atlas || !r) return null;
  const [x, y, w, h] = r.slice(1, 5).map((v) => Math.round(Number(v))) as [number, number, number, number];
  if (![x, y, w, h].every(Number.isSafeInteger) || w <= 0 || h <= 0) return null;
  return { atlas, region: { x, y, w, h } };
}

/**
 * Turns a localization string into plain display text: BBCode-style tags dropped, plural
 * selectors resolved to their plural form, and runtime values (unknown here) shown as "X".
 */
/** Longest localization string processed; longer (untrusted) input is cut to bound the regexes. */
const MAX_TEXT = 8 * 1024;

/** Removes the game's BBCode-style markup: inline images entirely, other tags keeping their text. */
export function stripMarkup(s: string): string {
  return s.replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/g, "").replace(/\[\/?[a-z_]+(?:=[^\]]*)?\]/gi, "");
}

export function plainText(s: string): string {
  return stripMarkup(s.slice(0, MAX_TEXT))
    .replace(/\{[^{}:]*:plural:([^{}|]*)\|([^{}]*)\}/g, "$2")
    .replace(/\{[^{}]*:(?:cond|choose)[^{}]*\}/g, "")
    .replace(/\{[^{}]*\}/g, "X")
    .replace(/\s+/g, " ")
    .trim();
}

export class ResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceError";
  }
}

const RSCC_MODE = { DEFLATE: 1, ZSTD: 2, GZIP: 3 } as const;
/** Largest decompressed resource accepted (the game's biggest font resource is a few MB). */
const MAX_RESOURCE = 256 * 1024 * 1024;

/** Frame content size from a zstd frame header, or null if the frame does not declare it. */
function zstdContentSize(b: Uint8Array): number | null {
  if (b.length < 6 || b[0] !== 0x28 || b[1] !== 0xb5 || b[2] !== 0x2f || b[3] !== 0xfd) return null;
  const fhd = b[4]!;
  const fcsFlag = fhd >> 6;
  const single = (fhd >> 5) & 1;
  const at = 5 + (single ? 0 : 1) + [0, 1, 2, 4][fhd & 3]!;
  const size = fcsFlag === 0 ? (single ? 1 : 0) : [1, 2, 4, 8][fcsFlag]!;
  if (size === 0 || at + size > b.length) return null;
  const v = Buffer.from(b.buffer, b.byteOffset + at, size);
  if (size === 1) return v.readUInt8(0);
  if (size === 2) return v.readUInt16LE(0) + 256;
  if (size === 4) return v.readUInt32LE(0);
  const big = v.readBigUInt64LE(0);
  return big > BigInt(MAX_RESOURCE) ? Number.MAX_SAFE_INTEGER : Number(big);
}

function inflateBlock(mode: number, chunk: Buffer, expected: number): Buffer {
  if (mode === RSCC_MODE.ZSTD) {
    // fzstd sizes its output from the frame header; check it before letting it allocate.
    if (zstdContentSize(chunk) !== expected) throw new ResourceError("compressed resource block has an unexpected size");
    const out = zstdDecompress(chunk, new Uint8Array(expected));
    return Buffer.from(out.buffer, out.byteOffset, out.length);
  }
  if (mode === RSCC_MODE.DEFLATE) return inflateSync(chunk, { maxOutputLength: expected });
  if (mode === RSCC_MODE.GZIP) return gunzipSync(chunk, { maxOutputLength: expected });
  throw new ResourceError(`unsupported resource compression mode ${mode}`);
}

/** Unpacks a Godot RSCC (block-compressed) resource; returns the input if it is not compressed. */
export function unwrapRscc(buf: Buffer): Buffer {
  if (buf.length < 4 || buf.toString("latin1", 0, 4) !== "RSCC") return buf;
  if (buf.length < 16) throw new ResourceError("compressed resource is truncated");
  const mode = buf.readUInt32LE(4);
  const blockSize = buf.readUInt32LE(8);
  const total = buf.readUInt32LE(12);
  if (blockSize === 0 || total > MAX_RESOURCE) throw new ResourceError("compressed resource has an invalid size");
  const blocks = Math.ceil(total / blockSize);
  let p = 16 + blocks * 4;
  if (p > buf.length) throw new ResourceError("compressed resource is truncated");
  const out: Buffer[] = [];
  for (let i = 0; i < blocks; i++) {
    const len = buf.readUInt32LE(16 + i * 4);
    if (p + len > buf.length) throw new ResourceError("compressed resource is truncated");
    const expected = Math.min(blockSize, total - i * blockSize);
    const block = inflateBlock(mode, buf.subarray(p, p + len), expected);
    if (block.length !== expected) throw new ResourceError("compressed resource block has an unexpected size");
    out.push(block);
    p += len;
  }
  return Buffer.concat(out, total);
}

const REQUIRED_TABLES = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "post"];

/**
 * Finds the sfnt (TTF/OTF) embedded inside an imported FontFile resource. Its extent comes from
 * the font's own table directory (end of the furthest table), which must include the tables
 * every font has.
 */
export function embeddedSfnt(res: Buffer): Buffer | null {
  for (let i = 0; i + 12 <= res.length; i++) {
    const version = res.readUInt32BE(i);
    if (version !== 0x00010000 && version !== 0x4f54544f) continue;
    const tables = res.readUInt16BE(i + 4);
    if (tables < REQUIRED_TABLES.length || tables > 64 || i + 12 + tables * 16 > res.length) continue;
    const tags = new Set<string>();
    let end = 0;
    let ok = true;
    for (let t = 0; t < tables; t++) {
      const rec = i + 12 + t * 16;
      const tag = res.toString("latin1", rec, rec + 4);
      const off = res.readUInt32BE(rec + 8);
      const len = res.readUInt32BE(rec + 12);
      if (!/^[\x20-\x7e]{4}$/.test(tag) || i + off + len > res.length) {
        ok = false;
        break;
      }
      tags.add(tag);
      end = Math.max(end, off + len);
    }
    if (!ok || !REQUIRED_TABLES.every((t) => tags.has(t))) continue;
    return res.subarray(i, Math.min(res.length, i + ((end + 3) & ~3)));
  }
  return null;
}
