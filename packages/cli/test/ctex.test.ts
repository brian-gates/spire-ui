import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { CtexError, decodeCtex } from "../src/ctex";

// Godot 4 Image::Format and CompressedTexture2D data formats used below.
const FORMAT = { RGB8: 4, RGBA8: 5, DXT1: 17, DXT5: 19, BPTC_RGBA: 22, BPTC_RGBF: 23 } as const;
const DATA = { IMAGE: 0, PNG: 1, WEBP: 2, BASIS: 3 } as const;

interface CtexOpts {
  /** Size the texture is shown at. */
  w: number;
  h: number;
  dataFormat: number;
  /** Stored image size (VRAM formats pad to whole 4x4 blocks). */
  iw?: number;
  ih?: number;
  mipmaps?: number;
  format: number;
}

/** A Godot 4 CompressedTexture2D (GST2) header up to the image data. */
function ctexHeader(o: CtexOpts): Buffer {
  const b = Buffer.alloc(52);
  b.write("GST2", 0, "latin1");
  b.writeUInt32LE(1, 4);
  b.writeUInt32LE(o.w, 8);
  b.writeUInt32LE(o.h, 12);
  b.writeUInt32LE(0, 16);
  b.writeUInt32LE(0, 20);
  b.writeUInt32LE(o.dataFormat, 36);
  b.writeUInt16LE(o.iw ?? o.w, 40);
  b.writeUInt16LE(o.ih ?? o.h, 42);
  b.writeUInt32LE(o.mipmaps ?? 0, 44);
  b.writeUInt32LE(o.format, 48);
  return b;
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

/** A 4x4 RGBA test image: distinct colours, varied alpha. */
function pattern(): Buffer {
  const px = Buffer.alloc(4 * 4 * 4);
  for (let i = 0; i < 16; i++) px.set([i * 16, 255 - i * 16, (i * 37) % 256, i % 2 ? 255 : 128], i * 4);
  return px;
}

async function rgba(png: Buffer): Promise<{ data: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function isPng(b: Buffer): boolean {
  return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

/** Packs BC7 fields LSB-first into a 16-byte block. */
function bits(fields: [value: number, width: number][]): Buffer {
  let v = 0n;
  let at = 0n;
  for (const [value, width] of fields) {
    v |= BigInt(value) << at;
    at += BigInt(width);
  }
  expect(at).toBe(128n);
  const b = Buffer.alloc(16);
  b.writeBigUInt64LE(v & 0xffff_ffff_ffff_ffffn, 0);
  b.writeBigUInt64LE(v >> 64n, 8);
  return b;
}

const WEIGHTS4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];
const lerp = (a: number, b: number, w: number) => (a * (64 - w) + b * w + 32) >> 6;

describe("decodeCtex", () => {
  test("round-trips a lossless PNG ctex", async () => {
    const src = await sharp(pattern(), { raw: { width: 4, height: 4, channels: 4 } }).png().toBuffer();
    const ctex = Buffer.concat([ctexHeader({ w: 4, h: 4, dataFormat: DATA.PNG, format: FORMAT.RGBA8 }), u32(src.length), src]);
    const out = await decodeCtex(ctex);
    expect([out.w, out.h]).toEqual([4, 4]);
    expect(isPng(out.png)).toBe(true);
    expect((await rgba(out.png)).data.equals(pattern())).toBe(true);
  });

  test("round-trips a lossless WebP ctex to PNG", async () => {
    const src = await sharp(pattern(), { raw: { width: 4, height: 4, channels: 4 } }).webp({ lossless: true }).toBuffer();
    const ctex = Buffer.concat([ctexHeader({ w: 4, h: 4, dataFormat: DATA.WEBP, format: FORMAT.RGBA8 }), u32(src.length), src]);
    const out = await decodeCtex(ctex);
    expect([out.w, out.h]).toEqual([4, 4]);
    expect(isPng(out.png)).toBe(true);
    expect((await rgba(out.png)).data.equals(pattern())).toBe(true);
  });

  test("decodes a known BC7 (BPTC_RGBA) mode 6 block to the expected RGBA", async () => {
    // Mode 6: one subset, 7-bit RGBA endpoints plus a p-bit each (so 8 bits, no replication),
    // 4-bit indices with the anchor (pixel 0) stored in 3 bits.
    // Endpoint 0 has p-bit 0 (even channels), endpoint 1 has p-bit 1 (odd channels).
    const p0 = 0;
    const p1 = 1;
    const e0 = [10 << 1, 100 << 1, 30 << 1, 127 << 1];
    const e1 = [(120 << 1) | 1, (5 << 1) | 1, (64 << 1) | 1, (20 << 1) | 1];
    const indices = [0, 15, 1, 14, 2, 13, 3, 12, 4, 11, 5, 10, 6, 9, 7, 8];
    const block = bits([
      [1 << 6, 7],
      [e0[0]! >> 1, 7],
      [e1[0]! >> 1, 7],
      [e0[1]! >> 1, 7],
      [e1[1]! >> 1, 7],
      [e0[2]! >> 1, 7],
      [e1[2]! >> 1, 7],
      [e0[3]! >> 1, 7],
      [e1[3]! >> 1, 7],
      [p0, 1],
      [p1, 1],
      [indices[0]!, 3],
      ...indices.slice(1).map((i): [number, number] => [i, 4]),
    ]);
    const expected = Buffer.alloc(64);
    indices.forEach((idx, p) => {
      for (let c = 0; c < 4; c++) expected[p * 4 + c] = lerp(e0[c]!, e1[c]!, WEIGHTS4[idx]!);
    });

    const out = await decodeCtex(Buffer.concat([ctexHeader({ w: 4, h: 4, dataFormat: DATA.IMAGE, format: FORMAT.BPTC_RGBA }), block]));
    expect([out.w, out.h]).toEqual([4, 4]);
    const got = await rgba(out.png);
    expect([...got.data]).toEqual([...expected]);
  });

  test("crops VRAM block padding to the texture size and ignores smaller mips", async () => {
    // A 3x2 texture stored as one 4x4 BC7 block, followed by junk standing in for further mips.
    const block = bits([
      [1 << 6, 7],
      ...Array.from({ length: 8 }, (_, i): [number, number] => [i % 2 ? 127 : 0, 7]),
      [1, 1],
      [1, 1],
      [0, 3],
      ...Array.from({ length: 15 }, (): [number, number] => [15, 4]),
    ]);
    const ctex = Buffer.concat([ctexHeader({ w: 3, h: 2, iw: 4, ih: 4, mipmaps: 2, dataFormat: DATA.IMAGE, format: FORMAT.BPTC_RGBA }), block, Buffer.alloc(32, 0x5a)]);
    const out = await decodeCtex(ctex);
    expect([out.w, out.h]).toEqual([3, 2]);
    const got = await rgba(out.png);
    expect([got.w, got.h]).toEqual([3, 2]);
    expect([...got.data.subarray(0, 4)]).toEqual([1, 1, 1, 1]); // index 0: endpoint 0 with p-bit 1
    expect([...got.data.subarray(4, 8)]).toEqual([255, 255, 255, 255]); // index 15: endpoint 1
  });

  test("decodes DXT1 and DXT5 blocks", async () => {
    // DXT1: red (0xF800) and blue (0x001F), first row index 0, rest index 1.
    const dxt1 = Buffer.alloc(8);
    dxt1.writeUInt16LE(0xf800, 0);
    dxt1.writeUInt16LE(0x001f, 2);
    dxt1.writeUInt32LE(0x5555_5500, 4);
    const a = await rgba((await decodeCtex(Buffer.concat([ctexHeader({ w: 4, h: 4, dataFormat: DATA.IMAGE, format: FORMAT.DXT1 }), dxt1]))).png);
    expect([...a.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...a.data.subarray(16, 20)]).toEqual([0, 0, 255, 255]);

    // DXT5: alpha endpoints 255 and 0, every alpha index 1 (so alpha 0); colour as above.
    const alpha = Buffer.alloc(8);
    alpha[0] = 255;
    alpha[1] = 0;
    let idx = 0n;
    for (let i = 0; i < 16; i++) idx |= 1n << BigInt(i * 3);
    alpha.writeUIntLE(Number(idx & 0xffff_ffffn), 2, 4);
    alpha.writeUInt16LE(Number(idx >> 32n), 6);
    const b = await rgba((await decodeCtex(Buffer.concat([ctexHeader({ w: 4, h: 4, dataFormat: DATA.IMAGE, format: FORMAT.DXT5 }), alpha, dxt1]))).png);
    expect([...b.data.subarray(0, 4)]).toEqual([255, 0, 0, 0]);
  });

  test("decodes uncompressed RGBA8 and RGB8", async () => {
    const px = pattern();
    const a = await rgba((await decodeCtex(Buffer.concat([ctexHeader({ w: 4, h: 4, dataFormat: DATA.IMAGE, format: FORMAT.RGBA8 }), px]))).png);
    expect(a.data.equals(px)).toBe(true);
    const rgb = Buffer.from([10, 20, 30, 40, 50, 60]);
    const b = await rgba((await decodeCtex(Buffer.concat([ctexHeader({ w: 2, h: 1, dataFormat: DATA.IMAGE, format: FORMAT.RGB8 }), rgb]))).png);
    expect([...b.data]).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
  });

  const code = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(CtexError);
      return (e as CtexError).code;
    }
    throw new Error("expected a CtexError");
  };

  test("unsupported formats throw unsupported-format", async () => {
    expect(await code(decodeCtex(Buffer.concat([ctexHeader({ w: 4, h: 4, dataFormat: DATA.IMAGE, format: FORMAT.BPTC_RGBF }), Buffer.alloc(16)])))).toBe("unsupported-format");
    expect(await code(decodeCtex(Buffer.concat([ctexHeader({ w: 4, h: 4, dataFormat: DATA.BASIS, format: FORMAT.RGBA8 }), u32(4), Buffer.alloc(4)])))).toBe("unsupported-format");
  });

  test("non-ctex and truncated input are rejected", async () => {
    expect(await code(decodeCtex(Buffer.from("nope")))).toBe("not-a-ctex");
    expect(await code(decodeCtex(Buffer.concat([ctexHeader({ w: 8, h: 8, dataFormat: DATA.IMAGE, format: FORMAT.BPTC_RGBA }), Buffer.alloc(16)])))).toBe("corrupt");
    expect(await code(decodeCtex(Buffer.concat([ctexHeader({ w: 4, h: 4, dataFormat: DATA.PNG, format: FORMAT.RGBA8 }), u32(1000), Buffer.alloc(10)])))).toBe("corrupt");
    // A zero stored size, even with enough bytes for the texture it claims to be.
    expect(await code(decodeCtex(Buffer.concat([ctexHeader({ w: 4, h: 4, iw: 0, ih: 4, dataFormat: DATA.IMAGE, format: FORMAT.RGBA8 }), Buffer.alloc(64)])))).toBe("corrupt");
    expect(await code(decodeCtex(Buffer.concat([ctexHeader({ w: 4, h: 4, iw: 4, ih: 0, dataFormat: DATA.IMAGE, format: FORMAT.BPTC_RGBA }), Buffer.alloc(16)])))).toBe("corrupt");
    // Stored image smaller than the texture it claims to be, with data for the stored size.
    expect(await code(decodeCtex(Buffer.concat([ctexHeader({ w: 4, h: 4, iw: 2, ih: 4, dataFormat: DATA.IMAGE, format: FORMAT.RGBA8 }), Buffer.alloc(32)])))).toBe("corrupt");
    expect(await code(decodeCtex(Buffer.concat([ctexHeader({ w: 8, h: 8, iw: 4, ih: 4, dataFormat: DATA.IMAGE, format: FORMAT.BPTC_RGBA }), Buffer.alloc(16)])))).toBe("corrupt");
  });
});
