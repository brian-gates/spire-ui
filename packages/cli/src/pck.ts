// Reader for Godot 4 resource packs (.pck), directory format v3 (Godot 4.4+).
//
// Layout (all little endian):
//   "GDPC", u32 format version, u32 engine major/minor/patch, u32 pack flags,
//   u64 file base, u64 directory offset, 16 reserved u32;
//   directory: u32 count, then per entry u32 path length, path (NUL padded to 4 bytes),
//   u64 offset (relative to file base), u64 size, 16-byte md5, u32 entry flags.
//
// Pack flags follow Godot's PACK_* constants: bit 0 PACK_DIR_ENCRYPTED, bit 1 PACK_REL_FILEBASE,
// bit 2 PACK_SPARSE_BUNDLE. PACK_REL_FILEBASE means file base (and, in v3, the directory offset)
// are relative to where the pack starts inside its container. Godot adds file base to every entry
// offset regardless of that flag, so for a standalone .pck (which starts at byte 0) the absolute
// offset is always file base + entry offset. Packs embedded in an executable are not supported.
//
// Only the header and directory are read up front; file data is read on demand by offset.
import { open, type FileHandle } from "node:fs/promises";

export type PckErrorCode = "not-a-pck" | "unsupported-version" | "encrypted" | "unsupported-feature" | "corrupt";

export class PckError extends Error {
  constructor(
    readonly code: PckErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PckError";
  }
}

export interface PckEntry {
  /** Path inside the pack, without a `res://` prefix. */
  path: string;
  /** Absolute byte offset in the pack file. */
  offset: bigint;
  size: bigint;
  /** Godot PACK_FILE_* flags: bit 0 encrypted, bit 1 removal (patch packs). */
  flags: number;
}

export interface PckIndex {
  formatVersion: number;
  engine: [number, number, number];
  entries: PckEntry[];
}

const MAGIC = "GDPC";
const SUPPORTED_VERSION = 3;
const HEADER_SIZE = 4 + 4 + 12 + 4 + 8 + 8 + 16 * 4;
const PACK_DIR_ENCRYPTED = 1 << 0;
const PACK_REL_FILEBASE = 1 << 1;
const KNOWN_PACK_FLAGS = PACK_DIR_ENCRYPTED | PACK_REL_FILEBASE;
const PACK_FILE_ENCRYPTED = 1 << 0;
/** u64 offset, u64 size, md5, u32 flags. */
const ENTRY_TAIL = 8 + 8 + 16 + 4;
/** Smallest possible entry: a zero-length path. */
const MIN_ENTRY = 4 + ENTRY_TAIL;
/** Directory bytes read per syscall. */
const CHUNK = 1 << 20;

async function readExactly(fh: FileHandle, pos: bigint, len: number): Promise<Buffer | null> {
  const buf = Buffer.alloc(len);
  let got = 0;
  while (got < len) {
    const { bytesRead } = await fh.read(buf, got, len - got, Number(pos) + got);
    if (bytesRead === 0) return null;
    got += bytesRead;
  }
  return buf;
}

/** Sequential reader over a bounded region of the file, buffered in chunks. */
class Cursor {
  private buf = Buffer.alloc(0);
  private at = 0;

  constructor(
    private readonly fh: FileHandle,
    private pos: bigint,
    private readonly end: bigint,
  ) {}

  get remaining(): bigint {
    return this.end - this.pos + BigInt(this.buf.length - this.at);
  }

  async take(n: number): Promise<Buffer> {
    if (BigInt(n) > this.remaining) throw new PckError("corrupt", "pck directory is truncated");
    if (this.buf.length - this.at < n) {
      const want = Math.max(n - (this.buf.length - this.at), Math.min(CHUNK, Number(this.end - this.pos)));
      const more = await readExactly(this.fh, this.pos, want);
      if (!more) throw new PckError("corrupt", "pck directory is truncated");
      this.pos += BigInt(want);
      this.buf = Buffer.concat([this.buf.subarray(this.at), more]);
      this.at = 0;
    }
    const out = this.buf.subarray(this.at, this.at + n);
    this.at += n;
    return out;
  }
}

/** Reads a pack's header and directory. */
export async function readPckIndex(file: string): Promise<PckIndex> {
  const fh = await open(file, "r");
  try {
    const fileSize = BigInt((await fh.stat()).size);
    const h = await readExactly(fh, 0n, HEADER_SIZE);
    if (!h || h.toString("latin1", 0, 4) !== MAGIC) throw new PckError("not-a-pck", `${file}: not a Godot PCK`);
    const formatVersion = h.readUInt32LE(4);
    if (formatVersion !== SUPPORTED_VERSION) {
      throw new PckError("unsupported-version", `${file}: PCK format ${formatVersion} is not supported (expected ${SUPPORTED_VERSION})`);
    }
    const engine: [number, number, number] = [h.readUInt32LE(8), h.readUInt32LE(12), h.readUInt32LE(16)];
    const packFlags = h.readUInt32LE(20);
    if (packFlags & PACK_DIR_ENCRYPTED) throw new PckError("encrypted", `${file}: the PCK directory is encrypted`);
    if (packFlags & ~KNOWN_PACK_FLAGS) {
      throw new PckError("unsupported-feature", `${file}: unsupported PCK flags 0x${packFlags.toString(16)}`);
    }
    const fileBase = h.readBigUInt64LE(24);
    const dirOffset = h.readBigUInt64LE(32);
    if (fileBase > fileSize || dirOffset + 4n > fileSize) throw new PckError("corrupt", `${file}: PCK header points past the end of the file`);

    const dir = new Cursor(fh, dirOffset, fileSize);
    const count = (await dir.take(4)).readUInt32LE(0);
    if (BigInt(count) * BigInt(MIN_ENTRY) > dir.remaining) throw new PckError("corrupt", `${file}: PCK directory claims ${count} entries`);

    const entries: PckEntry[] = [];
    for (let i = 0; i < count; i++) {
      const len = (await dir.take(4)).readUInt32LE(0);
      if (BigInt(len) + BigInt(ENTRY_TAIL) > dir.remaining) throw new PckError("corrupt", `${file}: PCK directory entry ${i} is truncated`);
      const raw = await dir.take(len);
      const nul = raw.indexOf(0);
      let p = raw.toString("utf8", 0, nul < 0 ? raw.length : nul);
      if (p.startsWith("res://")) p = p.slice("res://".length);
      const tail = await dir.take(ENTRY_TAIL);
      const offset = fileBase + tail.readBigUInt64LE(0);
      const size = tail.readBigUInt64LE(8);
      if (offset + size > fileSize) throw new PckError("corrupt", `${file}: PCK entry ${p} lies outside the file`);
      entries.push({ path: p, offset, size, flags: tail.readUInt32LE(32) });
    }
    return { formatVersion, engine, entries };
  } finally {
    await fh.close();
  }
}

/** Reads one entry's bytes by offset (never the whole pack). */
export async function readPckFile(file: string, e: PckEntry): Promise<Buffer> {
  if (e.flags & PACK_FILE_ENCRYPTED) throw new PckError("encrypted", `${e.path}: the file is encrypted`);
  if (e.flags !== 0) throw new PckError("unsupported-feature", `${e.path}: unsupported PCK file flags 0x${e.flags.toString(16)}`);
  if (e.size > BigInt(2 ** 31 - 1)) throw new PckError("unsupported-feature", `${e.path}: ${e.size} bytes is too large to read into memory`);
  const fh = await open(file, "r");
  try {
    const buf = await readExactly(fh, e.offset, Number(e.size));
    if (!buf) throw new PckError("corrupt", `${e.path}: the pack ends before this file does`);
    return buf;
  } finally {
    await fh.close();
  }
}
