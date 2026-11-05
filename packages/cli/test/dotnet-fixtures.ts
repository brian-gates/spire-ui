// Builds tiny synthetic .NET assemblies (PE32 + ECMA-335 metadata) for the reader's tests. Only
// what the reader uses is written; nothing here comes from the game.

// --- signatures --------------------------------------------------------------------------------

export const ET = { void: 0x01, bool: 0x02, i4: 0x08, string: 0x0e, object: 0x1c, valuetype: 0x11, class: 0x12, var: 0x13, mvar: 0x1e, genericinst: 0x15, szarray: 0x1d } as const;

export function compressed(n: number): number[] {
  if (n < 0x80) return [n];
  if (n < 0x4000) return [0x80 | (n >> 8), n & 0xff];
  return [0xc0 | (n >>> 24), (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** A type in a signature, already encoded. */
export type SigType = number[];
export const prim = (et: number): SigType => [et];
export const typeVar = (n: number): SigType => [ET.var, ...compressed(n)];
export const methodVar = (n: number): SigType => [ET.mvar, ...compressed(n)];
export const szarray = (t: SigType): SigType => [ET.szarray, ...t];

// --- IL ----------------------------------------------------------------------------------------

const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
export const il = {
  ldarg0: [0x02],
  ldloc0: [0x06],
  ldnull: [0x14],
  dup: [0x25],
  pop: [0x26],
  ret: [0x2a],
  stelemRef: [0xa2],
  stelemI4: [0x9e],
  ldc: (n: number): number[] => (n >= -1 && n <= 8 ? [0x16 + n] : n >= -128 && n <= 127 ? [0x1f, n & 0xff] : [0x20, ...le32(n)]),
  ldcLong: (n: number): number[] => [0x20, ...le32(n)],
  ldstr: (tok: number) => [0x72, ...le32(tok)],
  call: (tok: number) => [0x28, ...le32(tok)],
  callvirt: (tok: number) => [0x6f, ...le32(tok)],
  newobj: (tok: number) => [0x73, ...le32(tok)],
  newarr: (tok: number) => [0x8d, ...le32(tok)],
  ldsfld: (tok: number) => [0x7e, ...le32(tok)],
  stsfld: (tok: number) => [0x80, ...le32(tok)],
  ldfld: (tok: number) => [0x7b, ...le32(tok)],
  stfld: (tok: number) => [0x7d, ...le32(tok)],
  ldtoken: (tok: number) => [0xd0, ...le32(tok)],
  ldftn: (tok: number) => [0xfe, 0x06, ...le32(tok)],
  castclass: (tok: number) => [0x74, ...le32(tok)],
  brtrueS: (delta: number) => [0x2d, delta & 0xff],
  brfalseS: (delta: number) => [0x2c, delta & 0xff],
};
export const code = (...parts: number[][]) => parts.flat();

// --- assembly builder --------------------------------------------------------------------------

export interface FieldSpec {
  name: string;
  sig: SigType;
  flags?: number;
  /** An int32 Constant (enum members). */
  constant?: number;
  /** Initial data (FieldRVA). */
  data?: number[];
}

export interface MethodSpecDef {
  name: string;
  params?: SigType[];
  ret?: SigType;
  instance?: boolean;
  genericParams?: number;
  flags?: number;
  /** IL code; a function so it can use tokens created later. Absent: abstract (RVA 0). */
  body?: () => number[];
  /** Force a fat header. */
  fat?: boolean;
}

export const TOKEN = { TypeRef: 0x01000000, TypeDef: 0x02000000, Field: 0x04000000, MethodDef: 0x06000000, MemberRef: 0x0a000000, TypeSpec: 0x1b000000, MethodSpec: 0x2b000000, String: 0x70000000 };

export class AsmBuilder {
  private strings: number[] = [0];
  private stringIndex = new Map<string, number>();
  private us: number[] = [0];
  private blobs: number[] = [0];
  readonly rows = new Map<number, number[][]>();
  private methodBodies: { row: number; body: () => number[]; fat: boolean }[] = [];
  private fieldData: { row: number; data: number[] }[] = [];

  private add(table: number, cols: number[]): number {
    const list = this.rows.get(table) ?? [];
    list.push(cols);
    this.rows.set(table, list);
    return list.length;
  }

  str(s: string): number {
    if (s === "") return 0;
    let i = this.stringIndex.get(s);
    if (i === undefined) {
      i = this.strings.length;
      this.strings.push(...Buffer.from(s, "utf8"), 0);
      this.stringIndex.set(s, i);
    }
    return i;
  }

  /** A #US string; returns its ldstr token. */
  userString(s: string): number {
    const i = this.us.length;
    const bytes = [...Buffer.from(s, "utf16le"), 0];
    this.us.push(...compressed(bytes.length), ...bytes);
    return TOKEN.String | i;
  }

  blob(bytes: number[]): number {
    const i = this.blobs.length;
    this.blobs.push(...compressed(bytes.length), ...bytes);
    return i;
  }

  typeRef(ns: string, name: string, scope = 0): number {
    return TOKEN.TypeRef | this.add(0x01, [scope, this.str(name), this.str(ns)]);
  }

  /** Nested type reference: `outer` is a TypeRef token. */
  nestedTypeRef(outer: number, name: string): number {
    return this.typeRef("", name, ((outer & 0xffffff) << 2) | 3);
  }

  /** TypeDefOrRef coded index of a TypeDef/TypeRef/TypeSpec token. */
  static typeDefOrRef(tok: number): number {
    const tag = { 0x02: 0, 0x01: 1, 0x1b: 2 }[tok >>> 24]!;
    return ((tok & 0xffffff) << 2) | tag;
  }

  classType(tok: number): SigType {
    return [ET.class, ...compressed(AsmBuilder.typeDefOrRef(tok))];
  }
  valueType(tok: number): SigType {
    return [ET.valuetype, ...compressed(AsmBuilder.typeDefOrRef(tok))];
  }
  genericInst(tok: number, args: SigType[], valueType = false): SigType {
    return [ET.genericinst, ...(valueType ? this.valueType(tok) : this.classType(tok)), ...compressed(args.length), ...args.flat()];
  }

  typeSpec(sig: SigType): number {
    return TOKEN.TypeSpec | this.add(0x1b, [this.blob(sig)]);
  }

  static methodSig(m: { instance?: boolean; genericParams?: number; params?: SigType[]; ret?: SigType }): number[] {
    const conv = (m.instance ? 0x20 : 0) | (m.genericParams ? 0x10 : 0);
    return [conv, ...(m.genericParams ? compressed(m.genericParams) : []), ...compressed(m.params?.length ?? 0), ...(m.ret ?? prim(ET.void)), ...(m.params ?? []).flat()];
  }

  /** A method reference on a TypeDef, TypeRef or TypeSpec parent. */
  memberRef(parent: number, name: string, m: { instance?: boolean; genericParams?: number; params?: SigType[]; ret?: SigType }): number {
    const tag = { 0x02: 0, 0x01: 1, 0x06: 3, 0x1b: 4 }[parent >>> 24]!;
    return TOKEN.MemberRef | this.add(0x0a, [((parent & 0xffffff) << 3) | tag, this.str(name), this.blob(AsmBuilder.methodSig(m))]);
  }

  fieldRef(parent: number, name: string, type: SigType): number {
    const tag = { 0x02: 0, 0x01: 1, 0x1b: 4 }[parent >>> 24]!;
    return TOKEN.MemberRef | this.add(0x0a, [((parent & 0xffffff) << 3) | tag, this.str(name), this.blob([0x06, ...type])]);
  }

  methodSpec(method: number, args: SigType[]): number {
    const coded = ((method & 0xffffff) << 1) | ((method >>> 24) === 0x0a ? 1 : 0);
    return TOKEN.MethodSpec | this.add(0x2b, [coded, this.blob([0x0a, ...compressed(args.length), ...args.flat()])]);
  }

  /**
   * Defines a type with its fields and methods. Returns its token and the tokens of its fields and
   * methods, in order.
   */
  typeDef(
    ns: string,
    name: string,
    o: { extends?: number; flags?: number; fields?: FieldSpec[]; methods?: MethodSpecDef[]; nestedIn?: number } = {},
  ): { token: number; fields: number[]; methods: number[] } {
    const fieldStart = (this.rows.get(0x04)?.length ?? 0) + 1;
    const methodStart = (this.rows.get(0x06)?.length ?? 0) + 1;
    const row = this.add(0x02, [o.flags ?? 0x00100001, this.str(name), this.str(ns), o.extends ? AsmBuilder.typeDefOrRef(o.extends) : 0, fieldStart, methodStart]);
    const fields = (o.fields ?? []).map((f) => {
      const fr = this.add(0x04, [f.flags ?? 0x0006, this.str(f.name), this.blob([0x06, ...f.sig])]);
      if (f.constant !== undefined) this.add(0x0b, [0x08, 0, (fr << 2) | 0, this.blob(le32(f.constant))]);
      if (f.data) this.fieldData.push({ row: fr, data: f.data });
      return TOKEN.Field | fr;
    });
    const methods = (o.methods ?? []).map((m) => {
      const flags = m.flags ?? (m.instance === false ? 0x0096 : 0x0086) | (m.body ? 0 : 0x0400);
      const mr = this.add(0x06, [0, 0, flags, this.str(m.name), this.blob(AsmBuilder.methodSig({ ...m, instance: m.instance ?? true })), 1]);
      if (m.body) this.methodBodies.push({ row: mr, body: m.body, fat: m.fat ?? false });
      return TOKEN.MethodDef | mr;
    });
    if (o.nestedIn) this.add(0x29, [row, o.nestedIn & 0xffffff]);
    return { token: TOKEN.TypeDef | row, fields, methods };
  }

  build(o: { corruptHeader?: boolean } = {}): Buffer {
    const SECTION_RVA = 0x2000;
    const FILE_ALIGN = 0x200;
    // Section layout: CLI header, method bodies, field data, metadata.
    const section: number[] = new Array(72).fill(0);
    const methodRows = this.rows.get(0x06) ?? [];
    for (const m of this.methodBodies) {
      const codeBytes = m.body();
      while (section.length % 4) section.push(0);
      methodRows[m.row - 1]![0] = SECTION_RVA + section.length;
      if (!m.fat && codeBytes.length < 64) section.push((codeBytes.length << 2) | 2);
      else section.push(0x13, 0x30, 8, 0, ...le32(codeBytes.length), 0, 0, 0, 0);
      section.push(...codeBytes);
    }
    for (const f of this.fieldData) {
      while (section.length % 4) section.push(0);
      this.add(0x1d, [SECTION_RVA + section.length, f.row]);
      section.push(...f.data);
    }
    while (section.length % 4) section.push(0);
    const mdStart = section.length;
    const md = this.metadata();
    section.push(...md);
    // CLI header
    const cli = Buffer.alloc(72);
    cli.writeUInt32LE(72, 0);
    cli.writeUInt16LE(2, 4);
    cli.writeUInt16LE(5, 6);
    cli.writeUInt32LE(SECTION_RVA + mdStart, 8);
    cli.writeUInt32LE(md.length, 12);
    cli.writeUInt32LE(1, 16);
    for (let i = 0; i < 72; i++) section[i] = cli[i]!;

    const headers = Buffer.alloc(FILE_ALIGN);
    headers.write("MZ", 0, "latin1");
    headers.writeUInt32LE(0x80, 0x3c);
    headers.writeUInt32LE(o.corruptHeader ? 0x1234 : 0x4550, 0x80);
    const coff = 0x84;
    headers.writeUInt16LE(0x14c, coff);
    headers.writeUInt16LE(1, coff + 2);
    headers.writeUInt16LE(224, coff + 16);
    headers.writeUInt16LE(0x2102, coff + 18);
    const opt = coff + 20;
    headers.writeUInt16LE(0x10b, opt);
    headers.writeUInt32LE(16, opt + 92);
    const dirs = opt + 96;
    headers.writeUInt32LE(SECTION_RVA, dirs + 14 * 8);
    headers.writeUInt32LE(72, dirs + 14 * 8 + 4);
    const sec = opt + 224;
    headers.write(".text", sec, "latin1");
    const rawSize = Math.ceil(section.length / FILE_ALIGN) * FILE_ALIGN;
    headers.writeUInt32LE(section.length, sec + 8);
    headers.writeUInt32LE(SECTION_RVA, sec + 12);
    headers.writeUInt32LE(rawSize, sec + 16);
    headers.writeUInt32LE(FILE_ALIGN, sec + 20);
    const body = Buffer.alloc(rawSize);
    Buffer.from(section).copy(body);
    return Buffer.concat([headers, body]);
  }

  private metadata(): number[] {
    const pad4 = (a: number[]) => {
      while (a.length % 4) a.push(0);
      return a;
    };
    // #~ with every index 2 bytes wide (all heaps and tables are small here).
    const present = [...this.rows.keys()].sort((a, b) => a - b);
    let lo = 0;
    let hi = 0;
    for (const t of present) {
      if (t < 32) lo |= 1 << t;
      else hi |= 1 << (t - 32);
    }
    const widths: Record<number, number[]> = {
      1: [2, 2, 2], 2: [4, 2, 2, 2, 2, 2], 4: [2, 2, 2], 6: [4, 2, 2, 2, 2, 2], 10: [2, 2, 2], 11: [1, 1, 2, 2],
      27: [2], 29: [4, 2], 41: [2, 2], 43: [2, 2],
    };
    const tables: number[] = [0, 0, 0, 0, 2, 0, 0, 1, ...le32(lo >>> 0), ...le32(hi >>> 0), ...le32(0), ...le32(0)];
    for (const t of present) tables.push(...le32(this.rows.get(t)!.length));
    for (const t of present) {
      const w = widths[t];
      if (!w) throw new Error(`no widths for table ${t}`);
      for (const row of this.rows.get(t)!) {
        row.forEach((v, i) => {
          const n = w[i]!;
          if (n === 1) tables.push(v & 0xff);
          else if (n === 2) tables.push(v & 0xff, (v >> 8) & 0xff);
          else tables.push(...le32(v));
        });
      }
    }
    const streams: [string, number[]][] = [
      ["#~", pad4(tables)],
      ["#Strings", pad4([...this.strings])],
      ["#US", pad4([...this.us])],
      ["#GUID", new Array(16).fill(1)],
      ["#Blob", pad4([...this.blobs])],
    ];
    const version = pad4([...Buffer.from("v4.0.30319"), 0]);
    const header: number[] = [...le32(0x424a5342), 1, 0, 1, 0, ...le32(0), ...le32(version.length), ...version, 0, 0, streams.length, 0];
    let headerSize = header.length;
    for (const [name] of streams) headerSize += 8 + pad4([...Buffer.from(name), 0]).length;
    let offset = headerSize;
    const body: number[] = [];
    for (const [name, data] of streams) {
      header.push(...le32(offset), ...le32(data.length), ...pad4([...Buffer.from(name), 0]));
      body.push(...data);
      offset += data.length;
    }
    return [...header, ...body];
  }
}
