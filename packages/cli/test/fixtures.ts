// Synthetic Godot inputs built in-test. Nothing here comes from the game.
import sharp from "sharp";

export interface FakeFile {
  path: string;
  data: Buffer;
  flags?: number;
}

export interface FakePck {
  magic?: string;
  version?: number;
  engine?: [number, number, number];
  packFlags?: number;
  /** Bytes between the header and file base, to prove offsets are relative to it. */
  gap?: number;
  files: FakeFile[];
  /** Overrides the directory's entry count. */
  count?: number;
  /** Cuts the finished pack to this many bytes. */
  truncate?: number;
  /** Overrides one entry's stored offset (relative to file base). */
  badOffset?: bigint;
}

/** Builds a Godot 4 PCK (format v3 layout): header, file data from file base, directory at the end. */
export function buildPck(o: FakePck): Buffer {
  const header = Buffer.alloc(4 + 4 * 4 + 4 + 8 + 8 + 16 * 4);
  header.write(o.magic ?? "GDPC", 0, "latin1");
  header.writeUInt32LE(o.version ?? 3, 4);
  const [major, minor, patch] = o.engine ?? [4, 5, 1];
  header.writeUInt32LE(major, 8);
  header.writeUInt32LE(minor, 12);
  header.writeUInt32LE(patch, 16);
  header.writeUInt32LE(o.packFlags ?? 2, 20);
  const fileBase = header.length + (o.gap ?? 0);
  header.writeBigUInt64LE(BigInt(fileBase), 24);

  const bodies: Buffer[] = [];
  const offsets: bigint[] = [];
  let at = 0n;
  for (const f of o.files) {
    offsets.push(at);
    bodies.push(f.data);
    at += BigInt(f.data.length);
  }
  header.writeBigUInt64LE(BigInt(fileBase) + at, 32);

  const dir: Buffer[] = [];
  const count = Buffer.alloc(4);
  count.writeUInt32LE(o.count ?? o.files.length);
  dir.push(count);
  o.files.forEach((f, i) => {
    const raw = Buffer.from(f.path, "utf8");
    const padded = Buffer.alloc(Math.ceil((raw.length + 1) / 4) * 4);
    raw.copy(padded);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(padded.length);
    const rest = Buffer.alloc(8 + 8 + 16 + 4);
    rest.writeBigUInt64LE(i === 0 && o.badOffset !== undefined ? o.badOffset : offsets[i]!, 0);
    rest.writeBigUInt64LE(BigInt(f.data.length), 8);
    rest.fill(0xab, 16, 32);
    rest.writeUInt32LE(f.flags ?? 0, 32);
    dir.push(len, padded, rest);
  });

  const pck = Buffer.concat([header, Buffer.alloc(o.gap ?? 0, 0xee), ...bodies, ...dir]);
  return o.truncate === undefined ? pck : pck.subarray(0, o.truncate);
}

/** A solid-colour RGBA PNG. */
export function solidPng(w: number, h: number, rgb: [number, number, number]): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: rgb[0], g: rgb[1], b: rgb[2], alpha: 1 } } })
    .png()
    .toBuffer();
}

/** Wraps an encoded PNG in a Godot 4 CompressedTexture2D (GST2, data format PNG). */
export function pngCtex(png: Buffer, w: number, h: number): Buffer {
  const b = Buffer.alloc(56);
  b.write("GST2", 0, "latin1");
  b.writeUInt32LE(1, 4);
  b.writeUInt32LE(w, 8);
  b.writeUInt32LE(h, 12);
  b.writeUInt32LE(1, 36); // PNG
  b.writeUInt16LE(w, 40);
  b.writeUInt16LE(h, 42);
  b.writeUInt32LE(5, 48); // RGBA8
  b.writeUInt32LE(png.length, 52);
  return Buffer.concat([b, png]);
}

/** A texture's `.import` remap pointing at an imported ctex (desktop BPTC variant, as the game ships). */
export function importFile(ctexPath: string, key = "path.bptc"): Buffer {
  return Buffer.from(`[remap]\n\nimporter="texture"\ntype="CompressedTexture2D"\n${key}="res://${ctexPath}"\nmetadata={\n"vram_texture": true\n}\n`);
}

/** An AtlasTexture `.tres` for a region of an atlas image. */
export function atlasTres(atlasImage: string, x: number, y: number, w: number, h: number): Buffer {
  return Buffer.from(
    `[gd_resource type="AtlasTexture" load_steps=2 format=3]\n\n[ext_resource type="Texture2D" path="res://${atlasImage}" id="1"]\n\n[resource]\natlas = ExtResource("1")\nregion = Rect2(${x}, ${y}, ${w}, ${h})\nmargin = Rect2(1, 2, 3, 4)\n`,
  );
}

/** Minimal sfnt with the tables every font has, each 4 bytes long. */
export function fakeSfnt(fill = 0x11): Buffer {
  const tags = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "post"];
  const dirLen = 12 + tags.length * 16;
  const b = Buffer.alloc(dirLen + tags.length * 4, fill);
  b.writeUInt32BE(0x00010000, 0);
  b.writeUInt16BE(tags.length, 4);
  tags.forEach((t, i) => {
    b.write(t, 12 + i * 16, "latin1");
    b.writeUInt32BE(0, 16 + i * 16);
    b.writeUInt32BE(dirLen + i * 4, 20 + i * 16);
    b.writeUInt32BE(4, 24 + i * 16);
  });
  return b;
}

/**
 * A zstd frame holding `data` in raw (stored) blocks: valid zstd that needs no compressor, so the
 * tests do not depend on a zstd encoder being available in the Node version running them.
 */
export function zstdStored(data: Buffer): Buffer {
  const parts: Buffer[] = [];
  const magic = Buffer.alloc(4);
  magic.writeUInt32LE(0xfd2fb528);
  // Frame header descriptor: single segment, 4-byte frame content size, no checksum, no dict.
  const fhd = Buffer.from([(2 << 6) | (1 << 5)]);
  const fcs = Buffer.alloc(4);
  fcs.writeUInt32LE(data.length);
  parts.push(magic, fhd, fcs);
  const MAX = 128 * 1024;
  let at = 0;
  do {
    const n = Math.min(MAX, data.length - at);
    const last = at + n >= data.length ? 1 : 0;
    const h = (n << 3) | (0 << 1) | last; // block type 0: raw
    parts.push(Buffer.from([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff]), data.subarray(at, at + n));
    at += n;
  } while (at < data.length);
  return Buffer.concat(parts);
}

/** A Godot RSCC (compressed resource) file: header, per-block sizes, then blocks. */
export function rscc(plain: Buffer, mode: 1 | 2, blockSize: number, compress: (b: Buffer) => Buffer): Buffer {
  const blocks: Buffer[] = [];
  for (let i = 0; i < plain.length; i += blockSize) blocks.push(compress(plain.subarray(i, i + blockSize)));
  const head = Buffer.alloc(16 + blocks.length * 4);
  head.write("RSCC", 0, "latin1");
  head.writeUInt32LE(mode, 4);
  head.writeUInt32LE(blockSize, 8);
  head.writeUInt32LE(plain.length, 12);
  blocks.forEach((b, i) => head.writeUInt32LE(b.length, 16 + i * 4));
  return Buffer.concat([head, ...blocks]);
}
