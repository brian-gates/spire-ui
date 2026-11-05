/*! @license
 * Block-compressed texture decoders (BC1/DXT1, BC3/DXT5, BC7/BPTC) to RGBA8.
 *
 * A TypeScript port of the BC1, BC3 and BC7 paths of bcdec by Sergii Kudlai
 * (https://github.com/iOrange/bcdec), used under its MIT licence:
 *
 *   Copyright (c) 2022 Sergii Kudlai
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy of
 *   this software and associated documentation files (the "Software"), to deal in
 *   the Software without restriction, including without limitation the rights to
 *   use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 *   of the Software, and to permit persons to whom the Software is furnished to do
 *   so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *   SOFTWARE.
 */

export type BlockFormat = "bc1" | "bc3" | "bc7";

/** Bytes per 4x4 block. */
export const BLOCK_BYTES: Record<BlockFormat, number> = { bc1: 8, bc3: 16, bc7: 16 };

/**
 * Decodes the first `ceil(w/4) * ceil(h/4)` blocks of `src` into a w x h RGBA8 image.
 * The caller guarantees `src` holds at least that many blocks.
 */
export function decodeBlocks(format: BlockFormat, src: Uint8Array, w: number, h: number): Buffer {
  const bw = Math.ceil(w / 4);
  const bh = Math.ceil(h / 4);
  const size = BLOCK_BYTES[format];
  const out = Buffer.alloc(w * h * 4);
  const block = new Uint8Array(64);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const at = (by * bw + bx) * size;
      if (format === "bc1") colorBlock(src, at, block, false);
      else if (format === "bc3") {
        colorBlock(src, at + 8, block, true);
        smoothAlphaBlock(src, at, block);
      } else bc7Block(src, at, block);
      for (let y = 0; y < 4 && by * 4 + y < h; y++) {
        const cols = Math.min(4, w - bx * 4);
        out.set(block.subarray(y * 16, y * 16 + cols * 4), ((by * 4 + y) * w + bx * 4) * 4);
      }
    }
  }
  return out;
}

// --- BC1 / BC3 ---------------------------------------------------------------------------------

function u16(src: Uint8Array, at: number): number {
  return src[at]! | (src[at + 1]! << 8);
}

function u32(src: Uint8Array, at: number): number {
  return (u16(src, at) | (u16(src, at + 2) << 16)) >>> 0;
}

function colorBlock(src: Uint8Array, at: number, dst: Uint8Array, onlyOpaqueMode: boolean): void {
  const c0 = u16(src, at);
  const c1 = u16(src, at + 2);
  const r0 = (c0 >> 11) & 0x1f;
  const g0 = (c0 >> 5) & 0x3f;
  const b0 = c0 & 0x1f;
  const r1 = (c1 >> 11) & 0x1f;
  const g1 = (c1 >> 5) & 0x3f;
  const b1 = c1 & 0x1f;

  const ref: number[][] = [
    [(r0 * 527 + 23) >> 6, (g0 * 259 + 33) >> 6, (b0 * 527 + 23) >> 6, 255],
    [(r1 * 527 + 23) >> 6, (g1 * 259 + 33) >> 6, (b1 * 527 + 23) >> 6, 255],
  ];
  if (c0 > c1 || onlyOpaqueMode) {
    ref.push([((2 * r0 + r1) * 351 + 61) >> 7, ((2 * g0 + g1) * 2763 + 1039) >> 11, ((2 * b0 + b1) * 351 + 61) >> 7, 255]);
    ref.push([((r0 + r1 * 2) * 351 + 61) >> 7, ((g0 + g1 * 2) * 2763 + 1039) >> 11, ((b0 + b1 * 2) * 351 + 61) >> 7, 255]);
  } else {
    ref.push([((r0 + r1) * 1053 + 125) >> 8, ((g0 + g1) * 4145 + 1019) >> 11, ((b0 + b1) * 1053 + 125) >> 8, 255]);
    ref.push([0, 0, 0, 0]);
  }

  let indices = u32(src, at + 4);
  for (let p = 0; p < 16; p++) {
    dst.set(ref[indices & 3]!, p * 4);
    indices >>>= 2;
  }
}

function smoothAlphaBlock(src: Uint8Array, at: number, dst: Uint8Array): void {
  const a0 = src[at]!;
  const a1 = src[at + 1]!;
  const alpha =
    a0 > a1
      ? [a0, a1, ((6 * a0 + a1) / 7) | 0, ((5 * a0 + 2 * a1) / 7) | 0, ((4 * a0 + 3 * a1) / 7) | 0, ((3 * a0 + 4 * a1) / 7) | 0, ((2 * a0 + 5 * a1) / 7) | 0, ((a0 + 6 * a1) / 7) | 0]
      : [a0, a1, ((4 * a0 + a1) / 5) | 0, ((3 * a0 + 2 * a1) / 5) | 0, ((2 * a0 + 3 * a1) / 5) | 0, ((a0 + 4 * a1) / 5) | 0, 0, 255];
  // 48 bits of 3-bit indices; split to stay within 32-bit integer maths.
  let lo = u32(src, at + 2);
  let hi = u16(src, at + 6);
  for (let p = 0; p < 16; p++) {
    dst[p * 4 + 3] = alpha[lo & 7]!;
    lo = ((lo >>> 3) | ((hi & 7) << 29)) >>> 0;
    hi >>>= 3;
  }
}

// --- BC7 -------------------------------------------------------------------------------------

/** Reads a 128-bit block LSB first, a few bits at a time (never more than 8 per call). */
class Bits {
  private readonly words = new Uint32Array(4);
  private pos = 0;

  constructor(src: Uint8Array, at: number) {
    for (let i = 0; i < 4; i++) this.words[i] = u32(src, at + i * 4);
  }

  read(n: number): number {
    const word = this.pos >>> 5;
    const off = this.pos & 31;
    let v = this.words[word]! >>> off;
    if (off + n > 32 && word < 3) v |= this.words[word + 1]! << (32 - off);
    this.pos += n;
    return v & ((1 << n) - 1);
  }
}

/** Stored endpoint bits per mode, before p-bits. */
const COLOR_BITS = [4, 6, 5, 7, 5, 7, 7, 5];
const ALPHA_BITS = [0, 0, 0, 0, 6, 8, 7, 5];

/**
 * Partition sets for 2- and 3-subset BC7 modes, 64 shapes of 16 texels each (row major).
 * Bit 7 marks each subset's fix-up (anchor) texel, whose index is stored with one less bit.
 */
// prettier-ignore
const PARTITION_SETS: readonly (readonly number[])[] = [
  [
  128,0,1,1,0,0,1,1,0,0,1,1,0,0,1,129,
  128,0,0,1,0,0,0,1,0,0,0,1,0,0,0,129,
  128,1,1,1,0,1,1,1,0,1,1,1,0,1,1,129,
  128,0,0,1,0,0,1,1,0,0,1,1,0,1,1,129,
  128,0,0,0,0,0,0,1,0,0,0,1,0,0,1,129,
  128,0,1,1,0,1,1,1,0,1,1,1,1,1,1,129,
  128,0,0,1,0,0,1,1,0,1,1,1,1,1,1,129,
  128,0,0,0,0,0,0,1,0,0,1,1,0,1,1,129,
  128,0,0,0,0,0,0,0,0,0,0,1,0,0,1,129,
  128,0,1,1,0,1,1,1,1,1,1,1,1,1,1,129,
  128,0,0,0,0,0,0,1,0,1,1,1,1,1,1,129,
  128,0,0,0,0,0,0,0,0,0,0,1,0,1,1,129,
  128,0,0,1,0,1,1,1,1,1,1,1,1,1,1,129,
  128,0,0,0,0,0,0,0,1,1,1,1,1,1,1,129,
  128,0,0,0,1,1,1,1,1,1,1,1,1,1,1,129,
  128,0,0,0,0,0,0,0,0,0,0,0,1,1,1,129,
  128,0,0,0,1,0,0,0,1,1,1,0,1,1,1,129,
  128,1,129,1,0,0,0,1,0,0,0,0,0,0,0,0,
  128,0,0,0,0,0,0,0,129,0,0,0,1,1,1,0,
  128,1,129,1,0,0,1,1,0,0,0,1,0,0,0,0,
  128,0,129,1,0,0,0,1,0,0,0,0,0,0,0,0,
  128,0,0,0,1,0,0,0,129,1,0,0,1,1,1,0,
  128,0,0,0,0,0,0,0,129,0,0,0,1,1,0,0,
  128,1,1,1,0,0,1,1,0,0,1,1,0,0,0,129,
  128,0,129,1,0,0,0,1,0,0,0,1,0,0,0,0,
  128,0,0,0,1,0,0,0,129,0,0,0,1,1,0,0,
  128,1,129,0,0,1,1,0,0,1,1,0,0,1,1,0,
  128,0,129,1,0,1,1,0,0,1,1,0,1,1,0,0,
  128,0,0,1,0,1,1,1,129,1,1,0,1,0,0,0,
  128,0,0,0,1,1,1,1,129,1,1,1,0,0,0,0,
  128,1,129,1,0,0,0,1,1,0,0,0,1,1,1,0,
  128,0,129,1,1,0,0,1,1,0,0,1,1,1,0,0,
  128,1,0,1,0,1,0,1,0,1,0,1,0,1,0,129,
  128,0,0,0,1,1,1,1,0,0,0,0,1,1,1,129,
  128,1,0,1,1,0,129,0,0,1,0,1,1,0,1,0,
  128,0,1,1,0,0,1,1,129,1,0,0,1,1,0,0,
  128,0,129,1,1,1,0,0,0,0,1,1,1,1,0,0,
  128,1,0,1,0,1,0,1,129,0,1,0,1,0,1,0,
  128,1,1,0,1,0,0,1,0,1,1,0,1,0,0,129,
  128,1,0,1,1,0,1,0,1,0,1,0,0,1,0,129,
  128,1,129,1,0,0,1,1,1,1,0,0,1,1,1,0,
  128,0,0,1,0,0,1,1,129,1,0,0,1,0,0,0,
  128,0,129,1,0,0,1,0,0,1,0,0,1,1,0,0,
  128,0,129,1,1,0,1,1,1,1,0,1,1,1,0,0,
  128,1,129,0,1,0,0,1,1,0,0,1,0,1,1,0,
  128,0,1,1,1,1,0,0,1,1,0,0,0,0,1,129,
  128,1,1,0,0,1,1,0,1,0,0,1,1,0,0,129,
  128,0,0,0,0,1,129,0,0,1,1,0,0,0,0,0,
  128,1,0,0,1,1,129,0,0,1,0,0,0,0,0,0,
  128,0,129,0,0,1,1,1,0,0,1,0,0,0,0,0,
  128,0,0,0,0,0,129,0,0,1,1,1,0,0,1,0,
  128,0,0,0,0,1,0,0,129,1,1,0,0,1,0,0,
  128,1,1,0,1,1,0,0,1,0,0,1,0,0,1,129,
  128,0,1,1,0,1,1,0,1,1,0,0,1,0,0,129,
  128,1,129,0,0,0,1,1,1,0,0,1,1,1,0,0,
  128,0,129,1,1,0,0,1,1,1,0,0,0,1,1,0,
  128,1,1,0,1,1,0,0,1,1,0,0,1,0,0,129,
  128,1,1,0,0,0,1,1,0,0,1,1,1,0,0,129,
  128,1,1,1,1,1,1,0,1,0,0,0,0,0,0,129,
  128,0,0,1,1,0,0,0,1,1,1,0,0,1,1,129,
  128,0,0,0,1,1,1,1,0,0,1,1,0,0,1,129,
  128,0,129,1,0,0,1,1,1,1,1,1,0,0,0,0,
  128,0,129,0,0,0,1,0,1,1,1,0,1,1,1,0,
  128,1,0,0,0,1,0,0,0,1,1,1,0,1,1,129,
  ],
  [
  128,0,1,129,0,0,1,1,0,2,2,1,2,2,2,130,
  128,0,0,129,0,0,1,1,130,2,1,1,2,2,2,1,
  128,0,0,0,2,0,0,1,130,2,1,1,2,2,1,129,
  128,2,2,130,0,0,2,2,0,0,1,1,0,1,1,129,
  128,0,0,0,0,0,0,0,129,1,2,2,1,1,2,130,
  128,0,1,129,0,0,1,1,0,0,2,2,0,0,2,130,
  128,0,2,130,0,0,2,2,1,1,1,1,1,1,1,129,
  128,0,1,1,0,0,1,1,130,2,1,1,2,2,1,129,
  128,0,0,0,0,0,0,0,129,1,1,1,2,2,2,130,
  128,0,0,0,1,1,1,1,129,1,1,1,2,2,2,130,
  128,0,0,0,1,1,129,1,2,2,2,2,2,2,2,130,
  128,0,1,2,0,0,129,2,0,0,1,2,0,0,1,130,
  128,1,1,2,0,1,129,2,0,1,1,2,0,1,1,130,
  128,1,2,2,0,129,2,2,0,1,2,2,0,1,2,130,
  128,0,1,129,0,1,1,2,1,1,2,2,1,2,2,130,
  128,0,1,129,2,0,0,1,130,2,0,0,2,2,2,0,
  128,0,0,129,0,0,1,1,0,1,1,2,1,1,2,130,
  128,1,1,129,0,0,1,1,130,0,0,1,2,2,0,0,
  128,0,0,0,1,1,2,2,129,1,2,2,1,1,2,130,
  128,0,2,130,0,0,2,2,0,0,2,2,1,1,1,129,
  128,1,1,129,0,1,1,1,0,2,2,2,0,2,2,130,
  128,0,0,129,0,0,0,1,130,2,2,1,2,2,2,1,
  128,0,0,0,0,0,129,1,0,1,2,2,0,1,2,130,
  128,0,0,0,1,1,0,0,130,2,129,0,2,2,1,0,
  128,1,2,130,0,129,2,2,0,0,1,1,0,0,0,0,
  128,0,1,2,0,0,1,2,129,1,2,2,2,2,2,130,
  128,1,1,0,1,2,130,1,129,2,2,1,0,1,1,0,
  128,0,0,0,0,1,129,0,1,2,130,1,1,2,2,1,
  128,0,2,2,1,1,0,2,129,1,0,2,0,0,2,130,
  128,1,1,0,0,129,1,0,2,0,0,2,2,2,2,130,
  128,0,1,1,0,1,2,2,0,1,130,2,0,0,1,129,
  128,0,0,0,2,0,0,0,130,2,1,1,2,2,2,129,
  128,0,0,0,0,0,0,2,129,1,2,2,1,2,2,130,
  128,2,2,130,0,0,2,2,0,0,1,2,0,0,1,129,
  128,0,1,129,0,0,1,2,0,0,2,2,0,2,2,130,
  128,1,2,0,0,129,2,0,0,1,130,0,0,1,2,0,
  128,0,0,0,1,1,129,1,2,2,130,2,0,0,0,0,
  128,1,2,0,1,2,0,1,130,0,129,2,0,1,2,0,
  128,1,2,0,2,0,1,2,129,130,0,1,0,1,2,0,
  128,0,1,1,2,2,0,0,1,1,130,2,0,0,1,129,
  128,0,1,1,1,1,130,2,2,2,0,0,0,0,1,129,
  128,1,0,129,0,1,0,1,2,2,2,2,2,2,2,130,
  128,0,0,0,0,0,0,0,130,1,2,1,2,1,2,129,
  128,0,2,2,1,129,2,2,0,0,2,2,1,1,2,130,
  128,0,2,130,0,0,1,1,0,0,2,2,0,0,1,129,
  128,2,2,0,1,2,130,1,0,2,2,0,1,2,2,129,
  128,1,0,1,2,2,130,2,2,2,2,2,0,1,0,129,
  128,0,0,0,2,1,2,1,130,1,2,1,2,1,2,129,
  128,1,0,129,0,1,0,1,0,1,0,1,2,2,2,130,
  128,2,2,130,0,1,1,1,0,2,2,2,0,1,1,129,
  128,0,0,2,1,129,1,2,0,0,0,2,1,1,1,130,
  128,0,0,0,2,129,1,2,2,1,1,2,2,1,1,130,
  128,2,2,2,0,129,1,1,0,1,1,1,0,2,2,130,
  128,0,0,2,1,1,1,2,129,1,1,2,0,0,0,130,
  128,1,1,0,0,129,1,0,0,1,1,0,2,2,2,130,
  128,0,0,0,0,0,0,0,2,1,129,2,2,1,1,130,
  128,1,1,0,0,129,1,0,2,2,2,2,2,2,2,130,
  128,0,2,2,0,0,1,1,0,0,129,1,0,0,2,130,
  128,0,2,2,1,1,2,2,129,1,2,2,0,0,2,130,
  128,0,0,0,0,0,0,0,0,0,0,0,2,129,1,130,
  128,0,0,130,0,0,0,1,0,0,0,2,0,0,0,129,
  128,2,2,2,1,2,2,2,0,2,2,2,129,2,2,130,
  128,1,0,129,2,2,2,2,2,2,2,2,2,2,2,130,
  128,1,1,129,2,0,1,1,130,2,0,1,2,2,2,0,
  ],
];

const WEIGHTS2 = [0, 21, 43, 64];
const WEIGHTS3 = [0, 9, 18, 27, 37, 46, 55, 64];
const WEIGHTS4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];
const MODE_HAS_P_BITS = 0b11001011;

function interpolate(a: number, b: number, weights: readonly number[], index: number): number {
  return (a * (64 - weights[index]!) + b * weights[index]! + 32) >> 6;
}

function bc7Block(src: Uint8Array, at: number, dst: Uint8Array): void {
  const bits = new Bits(src, at);
  let mode = 0;
  while (mode < 8 && bits.read(1) === 0) mode++;

  // Reserved mode: transparent black.
  if (mode >= 8) {
    dst.fill(0);
    return;
  }

  let partition = 0;
  let numPartitions = 1;
  let rotation = 0;
  let indexSelectionBit = 0;

  if (mode === 0 || mode === 1 || mode === 2 || mode === 3 || mode === 7) {
    numPartitions = mode === 0 || mode === 2 ? 3 : 2;
    partition = bits.read(mode === 0 ? 4 : 6);
  }
  const numEndpoints = numPartitions * 2;

  if (mode === 4 || mode === 5) {
    rotation = bits.read(2);
    if (mode === 4) indexSelectionBit = bits.read(1);
  }

  const colorBits = COLOR_BITS[mode]!;
  const alphaBits = ALPHA_BITS[mode]!;
  const endpoints = Array.from({ length: numEndpoints }, () => [0, 0, 0, 0]);
  for (let c = 0; c < 3; c++) for (let e = 0; e < numEndpoints; e++) endpoints[e]![c] = bits.read(colorBits);
  if (alphaBits > 0) for (let e = 0; e < numEndpoints; e++) endpoints[e]![3] = bits.read(alphaBits);

  if (mode === 0 || mode === 1 || mode === 3 || mode === 6 || mode === 7) {
    for (const ep of endpoints) for (let c = 0; c < 4; c++) ep[c] = ep[c]! << 1;
    if (mode === 1) {
      // Shared p-bit per subset.
      const p0 = bits.read(1);
      const p1 = bits.read(1);
      endpoints.forEach((ep, e) => {
        for (let c = 0; c < 3; c++) ep[c] = ep[c]! | (e < 2 ? p0 : p1);
      });
    } else if (MODE_HAS_P_BITS & (1 << mode)) {
      // Unique p-bit per endpoint.
      for (const ep of endpoints) {
        const p = bits.read(1);
        for (let c = 0; c < 4; c++) ep[c] = ep[c]! | p;
      }
    }
  }

  const pbit = (MODE_HAS_P_BITS >> mode) & 1;
  for (const ep of endpoints) {
    // Move each component's MSB to bit 7 and replicate its high bits into the gap.
    for (let c = 0; c < 4; c++) {
      const n = (c < 3 ? colorBits : alphaBits) + pbit;
      const v = ep[c]! << (8 - n);
      ep[c] = v | (v >> n);
    }
  }
  if (!alphaBits) for (const ep of endpoints) ep[3] = 0xff;

  const baseIndexBits = mode === 0 || mode === 1 ? 3 : mode === 6 ? 4 : 2;
  const indexBits2 = mode === 4 ? 3 : mode === 5 ? 2 : 0;
  const weights = baseIndexBits === 2 ? WEIGHTS2 : baseIndexBits === 3 ? WEIGHTS3 : WEIGHTS4;
  const weights2 = indexBits2 === 2 ? WEIGHTS2 : WEIGHTS3;
  const subsetOf = (p: number) => (numPartitions === 1 ? (p ? 0 : 128) : PARTITION_SETS[numPartitions - 2]![partition * 16 + p]!);

  // Colour indices for all texels come first, then the secondary (alpha) indices if any.
  const indices = new Array<number>(16);
  for (let p = 0; p < 16; p++) indices[p] = bits.read(subsetOf(p) & 0x80 ? baseIndexBits - 1 : baseIndexBits);

  for (let p = 0; p < 16; p++) {
    const s = subsetOf(p) & 0x03;
    const e0 = endpoints[s * 2]!;
    const e1 = endpoints[s * 2 + 1]!;
    const index = indices[p]!;
    let r: number, g: number, b: number, a: number;
    if (!indexBits2) {
      r = interpolate(e0[0]!, e1[0]!, weights, index);
      g = interpolate(e0[1]!, e1[1]!, weights, index);
      b = interpolate(e0[2]!, e1[2]!, weights, index);
      a = interpolate(e0[3]!, e1[3]!, weights, index);
    } else {
      const index2 = bits.read(p ? indexBits2 : indexBits2 - 1);
      // With the index selection bit set, colour uses the secondary indices and alpha the primary.
      const [ci, cw, ai, aw] = indexSelectionBit ? [index2, weights2, index, weights] : [index, weights, index2, weights2];
      r = interpolate(e0[0]!, e1[0]!, cw, ci);
      g = interpolate(e0[1]!, e1[1]!, cw, ci);
      b = interpolate(e0[2]!, e1[2]!, cw, ci);
      a = interpolate(e0[3]!, e1[3]!, aw, ai);
    }
    if (rotation === 1) [a, r] = [r, a];
    else if (rotation === 2) [a, g] = [g, a];
    else if (rotation === 3) [a, b] = [b, a];
    dst[p * 4] = r;
    dst[p * 4 + 1] = g;
    dst[p * 4 + 2] = b;
    dst[p * 4 + 3] = a;
  }
}
