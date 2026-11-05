// Decoder for Godot 4 CompressedTexture2D files (.ctex, magic "GST2") to PNG.
//
// Layout (little endian):
//   0  "GST2"            4  u32 version         8  u32 width          12 u32 height
//   16 u32 format flags  20 u32 mipmap limit    24 3 x u32 reserved
//   36 u32 data format (0 image, 1 PNG, 2 WebP, 3 Basis Universal)
//   40 u16 stored width  42 u16 stored height   44 u32 mipmap count  48 u32 Image::Format
//   52 data: for PNG/WebP one u32 size + encoded bytes per mip level; for raw images every mip
//      level back to back, largest first.
//
// width x height is the size the texture is shown at. VRAM-compressed images are stored padded to
// whole 4x4 blocks, so the stored size can be larger; the padding is cropped off. Only the first
// (largest) mip level is decoded.
import sharp, { type Sharp } from "sharp";
import { BLOCK_BYTES, type BlockFormat, decodeBlocks } from "./bcn";

export type CtexErrorCode = "not-a-ctex" | "unsupported-format" | "corrupt";

export class CtexError extends Error {
  constructor(
    readonly code: CtexErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CtexError";
  }
}

const HEADER_SIZE = 52;
const SUPPORTED_VERSION = 1;
const DATA_FORMAT = { IMAGE: 0, PNG: 1, WEBP: 2 } as const;

/** Godot 4 Image::Format values this decoder handles. */
const RAW_CHANNELS: Record<number, 3 | 4> = { 4: 3 /* RGB8 */, 5: 4 /* RGBA8 */ };
const BLOCK_FORMATS: Record<number, BlockFormat> = { 17: "bc1" /* DXT1 */, 19: "bc3" /* DXT5 */, 22: "bc7" /* BPTC_RGBA */ };

export async function decodeCtex(buf: Buffer): Promise<{ png: Buffer; w: number; h: number }> {
  if (buf.length < HEADER_SIZE || buf.toString("latin1", 0, 4) !== "GST2") throw new CtexError("not-a-ctex", "not a Godot 4 CompressedTexture2D (GST2)");
  const version = buf.readUInt32LE(4);
  if (version !== SUPPORTED_VERSION) throw new CtexError("unsupported-format", `ctex version ${version} is not supported`);
  const w = buf.readUInt32LE(8);
  const h = buf.readUInt32LE(12);
  const dataFormat = buf.readUInt32LE(36);
  const iw = buf.readUInt16LE(40);
  const ih = buf.readUInt16LE(42);
  const format = buf.readUInt32LE(48);
  if (w === 0 || h === 0) throw new CtexError("corrupt", "ctex has an empty size");

  let image: Sharp;
  let stored: { width: number; height: number };
  if (dataFormat === DATA_FORMAT.PNG || dataFormat === DATA_FORMAT.WEBP) {
    if (buf.length < HEADER_SIZE + 4) throw new CtexError("corrupt", "ctex is truncated");
    const size = buf.readUInt32LE(HEADER_SIZE);
    const start = HEADER_SIZE + 4;
    if (start + size > buf.length) throw new CtexError("corrupt", "ctex image data is truncated");
    const encoded = buf.subarray(start, start + size);
    try {
      const meta = await sharp(encoded).metadata();
      const expected = dataFormat === DATA_FORMAT.PNG ? "png" : "webp";
      if (meta.format !== expected) throw new Error(`expected ${expected}, found ${meta.format}`);
      stored = { width: meta.width, height: meta.height };
    } catch (e) {
      throw new CtexError("corrupt", `ctex image data is not a readable ${dataFormat === DATA_FORMAT.PNG ? "PNG" : "WebP"}: ${(e as Error).message}`);
    }
    image = sharp(encoded);
  } else if (dataFormat === DATA_FORMAT.IMAGE) {
    const data = buf.subarray(HEADER_SIZE);
    stored = { width: iw, height: ih };
    const block = BLOCK_FORMATS[format];
    const channels = RAW_CHANNELS[format];
    if (block) {
      const need = Math.ceil(iw / 4) * Math.ceil(ih / 4) * BLOCK_BYTES[block];
      if (data.length < need) throw new CtexError("corrupt", `ctex image data is truncated (${data.length} of ${need} bytes)`);
      image = sharp(decodeBlocks(block, data, iw, ih), { raw: { width: iw, height: ih, channels: 4 } });
    } else if (channels) {
      const need = iw * ih * channels;
      if (data.length < need) throw new CtexError("corrupt", `ctex image data is truncated (${data.length} of ${need} bytes)`);
      image = sharp(data.subarray(0, need), { raw: { width: iw, height: ih, channels } });
    } else {
      throw new CtexError("unsupported-format", `ctex image format ${format} is not supported`);
    }
  } else {
    throw new CtexError("unsupported-format", `ctex data format ${dataFormat} is not supported`);
  }

  if (stored.width < w || stored.height < h) {
    throw new CtexError("corrupt", `ctex stores ${stored.width}x${stored.height} for a ${w}x${h} texture`);
  }
  if (stored.width !== w || stored.height !== h) image = image.extract({ left: 0, top: 0, width: w, height: h });
  return { png: await image.png().toBuffer(), w, h };
}
