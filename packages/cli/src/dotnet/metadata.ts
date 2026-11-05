// A bounded reader for the ECMA-335 metadata of a .NET assembly (a PE file with a CLI header):
// the PE section map, the metadata root, the #Strings, #US, #Blob and #GUID heaps and the
// compressed #~ table stream.
//
// The file is untrusted. Every offset, index and length is checked against the file (or the heap
// or table it points into) before it is used; sizes come from the file only after they are
// checked, so nothing is allocated from an unchecked length. Anything malformed throws a
// DotnetError, never a RangeError from a Buffer read.

export type DotnetErrorCode = "not-pe" | "not-dotnet" | "corrupt" | "unsupported";

export class DotnetError extends Error {
  constructor(
    readonly code: DotnetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DotnetError";
  }
}

/** Largest assembly accepted (the game's sts2.dll is about 9 MB). */
export const MAX_ASSEMBLY = 256 * 1024 * 1024;
/** Largest row count accepted for one table (coded indices cannot address more). */
const MAX_ROWS = 1 << 24;
/** Longest #Strings entry read (identifiers; the game's longest is under 200 bytes). */
const MAX_STRING = 1024;
const MAX_SECTIONS = 96;
const MAX_STREAMS = 16;

/** Metadata table numbers (ECMA-335 II.22). */
export const T = {
  Module: 0x00, TypeRef: 0x01, TypeDef: 0x02, Field: 0x04, MethodDef: 0x06, Param: 0x08, MemberRef: 0x0a,
  Constant: 0x0b, TypeSpec: 0x1b, FieldRVA: 0x1d, NestedClass: 0x29, MethodSpec: 0x2b,
} as const;

// Column kinds: a fixed width ("1" | "2" | "4"), a heap index ("s" strings, "g" guid, "b" blob),
// a simple index into another table ("t<n>") or a coded index ("c:<Kind>").
const SCHEMA: Record<number, string[]> = {
  0: ["2", "s", "g", "g", "g"],
  1: ["c:ResolutionScope", "s", "s"],
  2: ["4", "s", "s", "c:TypeDefOrRef", "t4", "t6"],
  4: ["2", "s", "b"],
  6: ["4", "2", "2", "s", "b", "t8"],
  8: ["2", "2", "s"],
  9: ["t2", "c:TypeDefOrRef"],
  10: ["c:MemberRefParent", "s", "b"],
  11: ["1", "1", "c:HasConstant", "b"],
  12: ["c:HasCustomAttribute", "c:CustomAttributeType", "b"],
  13: ["c:HasFieldMarshal", "b"],
  14: ["2", "c:HasDeclSecurity", "b"],
  15: ["2", "4", "t2"],
  16: ["4", "t4"],
  17: ["b"],
  18: ["t2", "t20"],
  20: ["2", "s", "c:TypeDefOrRef"],
  21: ["t2", "t23"],
  23: ["2", "s", "b"],
  24: ["2", "t6", "c:HasSemantics"],
  25: ["t2", "c:MethodDefOrRef", "c:MethodDefOrRef"],
  26: ["s"],
  27: ["b"],
  28: ["2", "c:MemberForwarded", "s", "t26"],
  29: ["4", "t4"],
  30: ["4", "4"],
  31: ["4"],
  32: ["4", "2", "2", "2", "2", "4", "b", "s", "s"],
  33: ["4"],
  34: ["4", "4", "4"],
  35: ["2", "2", "2", "2", "4", "b", "s", "s", "b"],
  36: ["4", "t35"],
  37: ["4", "4", "4", "t35"],
  38: ["4", "s", "b"],
  39: ["4", "4", "s", "s", "c:Implementation"],
  40: ["4", "4", "s", "c:Implementation"],
  41: ["t2", "t2"],
  42: ["2", "2", "c:TypeOrMethodDef", "s"],
  43: ["c:MethodDefOrRef", "b"],
  44: ["t42", "c:TypeDefOrRef"],
};

/** Coded index kinds: the tables each tag selects (-1 for unused tags). */
export const CODED = {
  TypeDefOrRef: [2, 1, 27],
  HasConstant: [4, 8, 23],
  HasCustomAttribute: [6, 4, 1, 2, 8, 9, 10, 0, 14, 23, 20, 17, 26, 27, 32, 35, 38, 39, 40, 42, 44, 43],
  HasFieldMarshal: [4, 8],
  HasDeclSecurity: [2, 6, 32],
  MemberRefParent: [2, 1, 26, 6, 27],
  HasSemantics: [20, 23],
  MethodDefOrRef: [6, 10],
  MemberForwarded: [4, 6],
  Implementation: [38, 35, 39],
  CustomAttributeType: [-1, -1, 6, 10, -1],
  ResolutionScope: [0, 26, 35, 1],
  TypeOrMethodDef: [2, 6],
} as const satisfies Record<string, readonly number[]>;
export type CodedKind = keyof typeof CODED;

export interface CodedIndex {
  table: number;
  /** 1-based row; 0 is a null reference. */
  index: number;
}

interface Section {
  va: number;
  size: number;
  raw: number;
}

interface Heap {
  off: number;
  size: number;
}

interface TableInfo {
  base: number;
  rowSize: number;
  widths: number[];
  count: number;
}

const tagBits = (n: number) => Math.ceil(Math.log2(n));

/** Reads an ECMA-335 compressed unsigned integer at `o` of `b`; returns [value, bytes used]. */
export function compressedUInt(b: Uint8Array, o: number, end = b.length): [number, number] {
  if (o >= end) throw new DotnetError("corrupt", "compressed integer runs past its blob");
  const b0 = b[o]!;
  if ((b0 & 0x80) === 0) return [b0, 1];
  if ((b0 & 0xc0) === 0x80) {
    if (o + 2 > end) throw new DotnetError("corrupt", "compressed integer runs past its blob");
    return [((b0 & 0x3f) << 8) | b[o + 1]!, 2];
  }
  if ((b0 & 0xe0) === 0xc0) {
    if (o + 4 > end) throw new DotnetError("corrupt", "compressed integer runs past its blob");
    return [(((b0 & 0x1f) << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0, 4];
  }
  throw new DotnetError("corrupt", "invalid compressed integer");
}

/** A parsed assembly: bounded access to its tables, heaps and RVAs. */
export class Assembly {
  readonly file: Buffer;
  private readonly sections: Section[] = [];
  private readonly heaps: { strings: Heap; us: Heap | null; blob: Heap; guid: Heap | null };
  private readonly rows: number[] = new Array(64).fill(0);
  private readonly tables = new Map<number, TableInfo>();
  private readonly stringCache = new Map<number, string>();

  constructor(file: Buffer) {
    if (file.length > MAX_ASSEMBLY) throw new DotnetError("unsupported", `assembly is larger than ${MAX_ASSEMBLY} bytes`);
    this.file = file;
    if (file.length < 0x40 || this.u16(0) !== 0x5a4d) throw new DotnetError("not-pe", "not a PE file (no MZ header)");
    const pe = this.u32(0x3c);
    if (this.u32(pe) !== 0x4550) throw new DotnetError("not-pe", "not a PE file (no PE signature)");
    const nSections = this.u16(pe + 6);
    const optSize = this.u16(pe + 20);
    const opt = pe + 24;
    if (nSections === 0 || nSections > MAX_SECTIONS) throw new DotnetError("corrupt", `implausible section count ${nSections}`);
    const magic = this.u16(opt);
    if (magic !== 0x10b && magic !== 0x20b) throw new DotnetError("not-pe", "unknown optional header");
    const dirs = opt + (magic === 0x20b ? 112 : 96);
    const nDirs = this.u32(dirs - 4);
    if (nDirs < 15 || dirs + 15 * 8 > opt + optSize) throw new DotnetError("not-dotnet", "no CLI header data directory");
    for (let i = 0, s = opt + optSize; i < nSections; i++, s += 40) {
      const virtualSize = this.u32(s + 8);
      const va = this.u32(s + 12);
      const rawSize = this.u32(s + 16);
      const raw = this.u32(s + 20);
      // Only bytes present in the file are readable; a section's tail beyond its raw data is zeros
      // in memory, which nothing here needs.
      const size = Math.min(virtualSize || rawSize, rawSize);
      if (raw + size > file.length) throw new DotnetError("corrupt", "a section lies outside the file");
      this.sections.push({ va, size, raw });
    }
    const cliRva = this.u32(dirs + 14 * 8);
    if (cliRva === 0) throw new DotnetError("not-dotnet", "not a .NET assembly (no CLI header)");
    const cli = this.rvaToOffset(cliRva, 72);
    const mdRva = this.u32(cli + 8);
    const mdSize = this.u32(cli + 12);
    const md = this.rvaToOffset(mdRva, mdSize);
    if (this.u32(md) !== 0x424a5342) throw new DotnetError("corrupt", "bad metadata signature");
    const verLen = this.u32(md + 12);
    if (verLen > 255) throw new DotnetError("corrupt", "bad metadata version length");
    let p = md + 16 + verLen + 2;
    const nStreams = this.u16(p);
    p += 2;
    if (nStreams > MAX_STREAMS) throw new DotnetError("corrupt", `implausible stream count ${nStreams}`);
    const streams = new Map<string, Heap>();
    for (let i = 0; i < nStreams; i++) {
      const off = this.u32(p);
      const size = this.u32(p + 4);
      p += 8;
      let e = p;
      while (e < p + 32 && this.u8(e) !== 0) e++;
      if (this.u8(e) !== 0) throw new DotnetError("corrupt", "unterminated stream name");
      const name = file.toString("latin1", p, e);
      p = p + ((e - p + 4) & ~3);
      if (off > mdSize || size > mdSize - off) throw new DotnetError("corrupt", `stream ${name} lies outside the metadata`);
      streams.set(name, { off: md + off, size });
    }
    if (streams.has("#-")) throw new DotnetError("unsupported", "uncompressed (#-) metadata tables are not supported");
    const tablesStream = streams.get("#~");
    const strings = streams.get("#Strings");
    const blob = streams.get("#Blob");
    if (!tablesStream || !strings || !blob) throw new DotnetError("corrupt", "missing #~, #Strings or #Blob stream");
    this.heaps = { strings, blob, us: streams.get("#US") ?? null, guid: streams.get("#GUID") ?? null };
    this.readTables(tablesStream);
  }

  private readTables(ts: Heap): void {
    const end = ts.off + ts.size;
    const need = (o: number, n: number) => {
      if (o + n > end) throw new DotnetError("corrupt", "metadata tables run past their stream");
    };
    need(ts.off, 24);
    const heapSizes = this.u8(ts.off + 6);
    const lo = this.u32(ts.off + 8);
    const hi = this.u32(ts.off + 12);
    let q = ts.off + 24;
    for (let i = 0; i < 64; i++) {
      if (!(((i < 32 ? lo >>> i : hi >>> (i - 32)) & 1) === 1)) continue;
      if (!SCHEMA[i]) throw new DotnetError("unsupported", `unknown metadata table 0x${i.toString(16)}`);
      need(q, 4);
      const n = this.u32(q);
      if (n > MAX_ROWS) throw new DotnetError("corrupt", `table 0x${i.toString(16)} claims ${n} rows`);
      this.rows[i] = n;
      q += 4;
    }
    if (heapSizes & 0x40) q += 4; // extra data
    const heapWidth = { s: heapSizes & 1 ? 4 : 2, g: heapSizes & 2 ? 4 : 2, b: heapSizes & 4 ? 4 : 2 };
    const width = (col: string): number => {
      if (col === "1" || col === "2" || col === "4") return Number(col);
      if (col === "s" || col === "g" || col === "b") return heapWidth[col];
      if (col.startsWith("t")) return this.rows[Number(col.slice(1))]! < 0x10000 ? 2 : 4;
      const tabs = CODED[col.slice(2) as CodedKind];
      const max = Math.max(...tabs.map((t) => (t < 0 ? 0 : this.rows[t]!)));
      return max < 1 << (16 - tagBits(tabs.length)) ? 2 : 4;
    };
    for (let t = 0; t < 64; t++) {
      const count = this.rows[t]!;
      if (!count) continue;
      const widths = SCHEMA[t]!.map(width);
      const rowSize = widths.reduce((a, b) => a + b, 0);
      need(q, rowSize * count);
      this.tables.set(t, { base: q, rowSize, widths, count });
      q += rowSize * count;
    }
  }

  // --- bounded primitive reads ---------------------------------------------------------------

  private check(o: number, n: number): void {
    if (!Number.isInteger(o) || o < 0 || o + n > this.file.length) throw new DotnetError("corrupt", `read of ${n} bytes at 0x${o.toString(16)} lies outside the file`);
  }
  u8(o: number): number {
    this.check(o, 1);
    return this.file[o]!;
  }
  u16(o: number): number {
    this.check(o, 2);
    return this.file.readUInt16LE(o);
  }
  u32(o: number): number {
    this.check(o, 4);
    return this.file.readUInt32LE(o);
  }
  i32(o: number): number {
    this.check(o, 4);
    return this.file.readInt32LE(o);
  }

  /** File offset of `rva`, requiring `len` bytes of file data from there within one section. */
  rvaToOffset(rva: number, len = 0): number {
    for (const s of this.sections) {
      if (rva >= s.va && rva - s.va < s.size) {
        if (rva - s.va + len > s.size) throw new DotnetError("corrupt", `data at RVA 0x${rva.toString(16)} runs past its section`);
        return rva - s.va + s.raw;
      }
    }
    throw new DotnetError("corrupt", `RVA 0x${rva.toString(16)} is not in any section`);
  }

  /** File bytes from `rva` to the end of its section (for method bodies and field data). */
  rvaSlice(rva: number): Buffer {
    for (const s of this.sections) {
      if (rva >= s.va && rva - s.va < s.size) return this.file.subarray(rva - s.va + s.raw, s.raw + s.size);
    }
    throw new DotnetError("corrupt", `RVA 0x${rva.toString(16)} is not in any section`);
  }

  // --- tables --------------------------------------------------------------------------------

  rowCount(table: number): number {
    return this.rows[table] ?? 0;
  }

  /** The columns of row `index` (1-based) of `table`. */
  row(table: number, index: number): number[] {
    const t = this.tables.get(table);
    if (!t || !Number.isInteger(index) || index < 1 || index > t.count) throw new DotnetError("corrupt", `row ${index} of table 0x${table.toString(16)} does not exist`);
    let o = t.base + (index - 1) * t.rowSize;
    return t.widths.map((w) => {
      const v = w === 1 ? this.file[o]! : w === 2 ? this.file.readUInt16LE(o) : this.file.readUInt32LE(o);
      o += w;
      return v;
    });
  }

  decodeCoded(kind: CodedKind, value: number): CodedIndex {
    const tabs = CODED[kind];
    const bits = tagBits(tabs.length);
    const table = tabs[value & ((1 << bits) - 1)];
    if (table === undefined || table < 0) throw new DotnetError("corrupt", `invalid ${kind} coded index`);
    return { table, index: value >>> bits };
  }

  // --- heaps ---------------------------------------------------------------------------------

  /** A #Strings entry (UTF-8, NUL-terminated). */
  str(index: number): string {
    const cached = this.stringCache.get(index);
    if (cached !== undefined) return cached;
    const h = this.heaps.strings;
    if (index >= h.size) throw new DotnetError("corrupt", `#Strings index ${index} is outside the heap`);
    const start = h.off + index;
    const limit = Math.min(h.off + h.size, start + MAX_STRING);
    let e = start;
    while (e < limit && this.file[e] !== 0) e++;
    if (e >= limit) throw new DotnetError("corrupt", `#Strings entry at ${index} is unterminated or too long`);
    const s = this.file.toString("utf8", start, e);
    this.stringCache.set(index, s);
    return s;
  }

  /** A #Blob entry. */
  blob(index: number): Buffer {
    const h = this.heaps.blob;
    if (index >= h.size) throw new DotnetError("corrupt", `#Blob index ${index} is outside the heap`);
    const end = h.off + h.size;
    const [len, n] = compressedUInt(this.file, h.off + index, end);
    const start = h.off + index + n;
    if (len > end - start) throw new DotnetError("corrupt", `#Blob entry at ${index} runs past the heap`);
    return this.file.subarray(start, start + len);
  }

  /** A #US entry (a string literal from `ldstr`): UTF-16LE with a trailing flag byte. */
  userString(index: number): string {
    const h = this.heaps.us;
    if (!h || index >= h.size) throw new DotnetError("corrupt", `#US index ${index} is outside the heap`);
    const end = h.off + h.size;
    const [len, n] = compressedUInt(this.file, h.off + index, end);
    const start = h.off + index + n;
    if (len > end - start || len % 2 !== 1) throw new DotnetError("corrupt", `#US entry at ${index} is malformed`);
    return this.file.toString("utf16le", start, start + len - 1);
  }
}
