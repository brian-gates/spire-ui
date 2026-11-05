// Names, signatures and members on top of the raw metadata tables: what a type, method or field
// token refers to, by full name. Consumers match on these names, never on token values, which
// change from build to build.
import { type Assembly, compressedUInt, DotnetError, T } from "./metadata";

/** A type in a signature: a full name ("System.Int32", "Ns.Outer/Inner", "!0" for a type parameter), generic arguments, or an array element. */
export interface TypeDesc {
  name: string;
  args?: TypeDesc[];
  /** Element type of an array ("[]") or pointer/byref ("*", "&"). */
  elem?: TypeDesc;
}

export interface MethodSig {
  hasThis: boolean;
  genericParams: number;
  ret: TypeDesc;
  params: TypeDesc[];
}

export interface TypeDefInfo {
  row: number;
  flags: number;
  name: string;
  ns: string;
  fullName: string;
  /** Base type's full name, or null for none (interfaces, System.Object). */
  extends: string | null;
  fields: [start: number, end: number];
  methods: [start: number, end: number];
}

export interface MethodDefInfo {
  row: number;
  rva: number;
  flags: number;
  name: string;
  sig: MethodSig;
  owner: TypeDefInfo;
}

/** What a call/newobj/ldftn token refers to. */
export interface MethodRef {
  /** Declaring type's full name, without generic arguments. */
  owner: string;
  /** Generic arguments of the declaring type (from a TypeSpec parent). */
  ownerArgs: TypeDesc[];
  name: string;
  sig: MethodSig;
  /** Generic arguments of the method itself (from a MethodSpec). */
  methodArgs: TypeDesc[];
  /** The MethodDef row when the method is defined in this assembly. */
  def: MethodDefInfo | null;
}

export interface FieldRef {
  owner: string;
  name: string;
  /** The Field row when defined in this assembly. */
  def: number | null;
}

const PRIMS: Record<number, string> = {
  0x01: "System.Void", 0x02: "System.Boolean", 0x03: "System.Char", 0x04: "System.SByte", 0x05: "System.Byte",
  0x06: "System.Int16", 0x07: "System.UInt16", 0x08: "System.Int32", 0x09: "System.UInt32", 0x0a: "System.Int64",
  0x0b: "System.UInt64", 0x0c: "System.Single", 0x0d: "System.Double", 0x0e: "System.String", 0x16: "System.TypedReference",
  0x18: "System.IntPtr", 0x19: "System.UIntPtr", 0x1c: "System.Object",
};

const MAX_SIG_DEPTH = 32;
const MAX_SIG_ITEMS = 256;
const MAX_NESTING = 16;

export class Model {
  readonly asm: Assembly;
  readonly types: TypeDefInfo[] = [];
  private readonly byFullName = new Map<string, TypeDefInfo>();
  private readonly methodOwner: TypeDefInfo[] = [];
  private readonly enclosing = new Map<number, number>();
  private readonly fieldConstants = new Map<number, number | null>();
  private fieldRvas: Map<number, number> | null = null;
  private readonly typeSpecCache = new Map<number, TypeDesc>();
  private readonly typeSpecsInProgress = new Set<number>();

  constructor(asm: Assembly) {
    this.asm = asm;
    for (let i = 1; i <= asm.rowCount(T.NestedClass); i++) {
      const [nested, outer] = asm.row(T.NestedClass, i) as [number, number];
      this.enclosing.set(nested, outer);
    }
    const nTypes = asm.rowCount(T.TypeDef);
    const nFields = asm.rowCount(T.Field);
    const nMethods = asm.rowCount(T.MethodDef);
    const raw = Array.from({ length: nTypes }, (_, k) => asm.row(T.TypeDef, k + 1));
    for (let k = 0; k < nTypes; k++) {
      const [flags, name, ns, , fieldList, methodList] = raw[k] as [number, number, number, number, number, number];
      const next = raw[k + 1];
      const fieldEnd = next ? next[4]! : nFields + 1;
      const methodEnd = next ? next[5]! : nMethods + 1;
      if (fieldList < 1 || fieldList > fieldEnd || fieldEnd > nFields + 1 || methodList < 1 || methodList > methodEnd || methodEnd > nMethods + 1)
        throw new DotnetError("corrupt", `type ${k + 1} has an invalid field or method list`);
      this.types.push({ row: k + 1, flags, name: asm.str(name), ns: asm.str(ns), fullName: "", extends: null, fields: [fieldList, fieldEnd], methods: [methodList, methodEnd] });
    }
    for (const t of this.types) {
      t.fullName = this.typeDefName(t.row);
      if (!this.byFullName.has(t.fullName)) this.byFullName.set(t.fullName, t);
      for (let m = t.methods[0]; m < t.methods[1]; m++) this.methodOwner[m] = t;
    }
    for (const t of this.types) {
      const ext = asm.decodeCoded("TypeDefOrRef", raw[t.row - 1]![3]!);
      t.extends = ext.index === 0 ? null : this.typeDefOrRefName(ext.table, ext.index);
    }
    for (let i = 1; i <= asm.rowCount(T.Constant); i++) {
      const [type, , parent, value] = asm.row(T.Constant, i) as [number, number, number, number];
      const p = asm.decodeCoded("HasConstant", parent);
      if (p.table !== T.Field) continue;
      this.fieldConstants.set(p.index, constantInt(type, asm.blob(value)));
    }
  }

  type(fullName: string): TypeDefInfo | undefined {
    return this.byFullName.get(fullName);
  }

  private typeDefName(row: number, depth = 0): string {
    if (depth > MAX_NESTING) throw new DotnetError("corrupt", "type nesting is too deep");
    const [, name, ns] = this.asm.row(T.TypeDef, row) as [number, number, number];
    const outer = this.enclosing.get(row);
    if (outer !== undefined) return `${this.typeDefName(outer, depth + 1)}/${this.asm.str(name)}`;
    const n = this.asm.str(ns);
    return n ? `${n}.${this.asm.str(name)}` : this.asm.str(name);
  }

  private typeRefName(row: number, depth = 0): string {
    if (depth > MAX_NESTING) throw new DotnetError("corrupt", "type reference nesting is too deep");
    const [scope, name, ns] = this.asm.row(T.TypeRef, row) as [number, number, number];
    const s = this.asm.decodeCoded("ResolutionScope", scope);
    if (s.table === T.TypeRef && s.index > 0) return `${this.typeRefName(s.index, depth + 1)}/${this.asm.str(name)}`;
    const n = this.asm.str(ns);
    return n ? `${n}.${this.asm.str(name)}` : this.asm.str(name);
  }

  /** Full name of a TypeDef, TypeRef or TypeSpec row (a TypeSpec by its generic type's name). */
  typeDefOrRefName(table: number, index: number): string {
    if (table === T.TypeDef) return this.typeDefName(index);
    if (table === T.TypeRef) return this.typeRefName(index);
    if (table === T.TypeSpec) return this.typeSpec(index).name;
    throw new DotnetError("corrupt", `table 0x${table.toString(16)} is not a type`);
  }

  typeSpec(row: number): TypeDesc {
    let d = this.typeSpecCache.get(row);
    if (!d) {
      // Signatures name types only by TypeDef/TypeRef (II.23.2.12), so a TypeSpec never needs
      // another; the guard is defence in depth against a cycle.
      if (this.typeSpecsInProgress.has(row)) throw new DotnetError("corrupt", `TypeSpec ${row} refers to itself`);
      this.typeSpecsInProgress.add(row);
      try {
        const blob = this.asm.blob(this.asm.row(T.TypeSpec, row)[0]!);
        d = new SigReader(this, blob).type();
      } finally {
        this.typeSpecsInProgress.delete(row);
      }
      this.typeSpecCache.set(row, d);
    }
    return d;
  }

  /** The type a TypeDef/TypeRef/TypeSpec token (e.g. from ldtoken or newarr) names. */
  typeToken(token: number): TypeDesc {
    const table = token >>> 24;
    const index = token & 0xffffff;
    if (table === T.TypeSpec) return this.typeSpec(index);
    return { name: this.typeDefOrRefName(table, index) };
  }

  methodsOf(t: TypeDefInfo): MethodDefInfo[] {
    const out: MethodDefInfo[] = [];
    for (let m = t.methods[0]; m < t.methods[1]; m++) out.push(this.methodDef(m));
    return out;
  }

  methodDef(row: number): MethodDefInfo {
    const [rva, , flags, name, sig] = this.asm.row(T.MethodDef, row) as [number, number, number, number, number];
    const owner = this.methodOwner[row];
    if (!owner) throw new DotnetError("corrupt", `method ${row} has no declaring type`);
    return { row, rva, flags, name: this.asm.str(name), sig: parseMethodSig(this, this.asm.blob(sig)), owner };
  }

  /** What a MethodDef, MemberRef or MethodSpec token refers to. */
  method(token: number): MethodRef {
    return this.methodAt(token >>> 24, token & 0xffffff);
  }

  private methodAt(table: number, index: number): MethodRef {
    if (table === T.MethodDef) {
      const def = this.methodDef(index);
      return { owner: def.owner.fullName, ownerArgs: [], name: def.name, sig: def.sig, methodArgs: [], def };
    }
    if (table === T.MemberRef) {
      const [parent, name, sig] = this.asm.row(T.MemberRef, index) as [number, number, number];
      const p = this.asm.decodeCoded("MemberRefParent", parent);
      let owner: string;
      let ownerArgs: TypeDesc[] = [];
      if (p.table === T.TypeSpec) {
        const d = this.typeSpec(p.index);
        owner = d.name;
        ownerArgs = d.args ?? [];
      } else if (p.table === T.TypeDef || p.table === T.TypeRef) owner = this.typeDefOrRefName(p.table, p.index);
      else if (p.table === T.MethodDef) return this.methodAt(T.MethodDef, p.index);
      else owner = "<module>";
      const blob = this.asm.blob(sig);
      if (blob.length === 0 || (blob[0]! & 0x0f) === 0x06) throw new DotnetError("corrupt", "member reference is not a method");
      // A MemberRef to a method of this assembly's own (non-generic) type points at its MethodDef.
      let def: MethodDefInfo | null = null;
      if (p.table === T.TypeDef) def = this.findMethod(p.index, this.asm.str(name), blob);
      else if (p.table === T.TypeSpec) {
        // A method of an instantiated generic type of this assembly (e.g. PowerVar<T>): its
        // MemberRef signature is the definition's, written with the type's parameters.
        const generic = this.byFullName.get(owner);
        if (generic) def = this.findMethod(generic.row, this.asm.str(name), blob);
      }
      return { owner, ownerArgs, name: this.asm.str(name), sig: parseMethodSig(this, blob), methodArgs: [], def };
    }
    if (table === T.MethodSpec) {
      const [m, inst] = this.asm.row(T.MethodSpec, index) as [number, number];
      const c = this.asm.decodeCoded("MethodDefOrRef", m);
      // MethodDefOrRef only decodes to MethodDef or MemberRef rows, so this never recurses into a MethodSpec.
      const base = this.methodAt(c.table, c.index);
      const blob = this.asm.blob(inst);
      if (blob[0] !== 0x0a) throw new DotnetError("corrupt", "bad method instantiation");
      const r = new SigReader(this, blob, 1);
      const n = r.count();
      const methodArgs: TypeDesc[] = [];
      for (let i = 0; i < n; i++) methodArgs.push(r.type());
      return { ...base, methodArgs };
    }
    throw new DotnetError("corrupt", `table 0x${table.toString(16)} is not a method table`);
  }

  /** The MethodDef of type row `typeRow` with this name and exact signature blob, if any. */
  private findMethod(typeRow: number, name: string, sig: Buffer): MethodDefInfo | null {
    const t = this.types[typeRow - 1];
    if (!t) return null;
    for (let m = t.methods[0]; m < t.methods[1]; m++) {
      const [, , , n, s] = this.asm.row(T.MethodDef, m) as [number, number, number, number, number];
      if (this.asm.str(n) === name && this.asm.blob(s).equals(sig)) return this.methodDef(m);
    }
    return null;
  }

  /** What a Field or MemberRef (field) token refers to. */
  field(token: number): FieldRef {
    const table = token >>> 24;
    const index = token & 0xffffff;
    if (table === T.Field) {
      const [, name] = this.asm.row(T.Field, index) as [number, number];
      const owner = this.types.find((t) => index >= t.fields[0] && index < t.fields[1]);
      return { owner: owner?.fullName ?? "<module>", name: this.asm.str(name), def: index };
    }
    if (table === T.MemberRef) {
      const [parent, name, sig] = this.asm.row(T.MemberRef, index) as [number, number, number];
      const blob = this.asm.blob(sig);
      if (blob[0] !== 0x06) throw new DotnetError("corrupt", "member reference is not a field");
      const p = this.asm.decodeCoded("MemberRefParent", parent);
      const owner = p.table === T.TypeDef || p.table === T.TypeRef || p.table === T.TypeSpec ? this.typeDefOrRefName(p.table, p.index) : "<module>";
      return { owner, name: this.asm.str(name), def: null };
    }
    throw new DotnetError("corrupt", `token 0x${token.toString(16)} is not a field`);
  }

  fieldName(row: number): string {
    return this.asm.str(this.asm.row(T.Field, row)[1]!);
  }

  /** An enum's members: value -> name, from the Constant table. */
  enumMembers(t: TypeDefInfo): Map<number, string> {
    const out = new Map<number, string>();
    for (let f = t.fields[0]; f < t.fields[1]; f++) {
      const v = this.fieldConstants.get(f);
      if (v !== undefined && v !== null && !out.has(v)) out.set(v, this.fieldName(f));
    }
    return out;
  }

  /** The RVA of a field's initial data (FieldRVA), e.g. a static array initializer. */
  fieldRva(fieldRow: number): number | null {
    if (!this.fieldRvas) {
      this.fieldRvas = new Map();
      for (let i = 1; i <= this.asm.rowCount(T.FieldRVA); i++) {
        const [rva, field] = this.asm.row(T.FieldRVA, i) as [number, number];
        this.fieldRvas.set(field, rva);
      }
    }
    return this.fieldRvas.get(fieldRow) ?? null;
  }

  /** Whether `t` derives (directly or not) from the type named `base`. */
  derivesFrom(t: TypeDefInfo, base: string): boolean {
    return this.baseChain(t).some((b) => b === base);
  }

  /** Full names of `t`'s base types, nearest first (bounded). */
  baseChain(t: TypeDefInfo): string[] {
    const out: string[] = [];
    let cur: TypeDefInfo | undefined = t;
    for (let k = 0; k < MAX_NESTING && cur?.extends; k++) {
      out.push(cur.extends);
      cur = this.byFullName.get(cur.extends);
    }
    return out;
  }
}

/** Integer value of a Constant blob of an integer element type, else null. */
function constantInt(type: number, b: Buffer): number | null {
  const need = { 0x02: 1, 0x04: 1, 0x05: 1, 0x06: 2, 0x07: 2, 0x08: 4, 0x09: 4 }[type];
  if (need === undefined || b.length < need) return null;
  switch (type) {
    case 0x02:
    case 0x05:
      return b[0]!;
    case 0x04:
      return b.readInt8(0);
    case 0x06:
      return b.readInt16LE(0);
    case 0x07:
      return b.readUInt16LE(0);
    case 0x08:
      return b.readInt32LE(0);
    default:
      return b.readUInt32LE(0);
  }
}

class SigReader {
  private items = 0;
  constructor(
    private readonly model: Model,
    private readonly b: Buffer,
    private o = 0,
  ) {}

  byte(): number {
    if (this.o >= this.b.length) throw new DotnetError("corrupt", "signature runs past its blob");
    return this.b[this.o++]!;
  }

  count(): number {
    const [v, n] = compressedUInt(this.b, this.o);
    this.o += n;
    if (v > MAX_SIG_ITEMS) throw new DotnetError("unsupported", `signature lists ${v} items`);
    return v;
  }

  type(depth = 0): TypeDesc {
    if (depth > MAX_SIG_DEPTH || ++this.items > MAX_SIG_ITEMS * 4) throw new DotnetError("unsupported", "signature is too deep");
    const et = this.byte();
    const prim = PRIMS[et];
    if (prim) return { name: prim };
    switch (et) {
      case 0x0f:
        return { name: "*", elem: this.type(depth + 1) };
      case 0x10:
        return { name: "&", elem: this.type(depth + 1) };
      case 0x11:
      case 0x12: {
        const [v, n] = compressedUInt(this.b, this.o);
        this.o += n;
        const c = this.model.asm.decodeCoded("TypeDefOrRef", v);
        if (c.table !== T.TypeDef && c.table !== T.TypeRef) throw new DotnetError("corrupt", "a signature names a type by TypeSpec");
        return { name: this.model.typeDefOrRefName(c.table, c.index) };
      }
      case 0x13:
        return { name: `!${this.count()}` };
      case 0x1e:
        return { name: `!!${this.count()}` };
      case 0x14: {
        const elem = this.type(depth + 1);
        this.count(); // rank
        const sizes = this.count();
        for (let i = 0; i < sizes; i++) this.count();
        const los = this.count();
        for (let i = 0; i < los; i++) this.count();
        return { name: "[,]", elem };
      }
      case 0x15: {
        const kind = this.byte();
        if (kind !== 0x11 && kind !== 0x12) throw new DotnetError("corrupt", "bad generic instantiation");
        this.o--;
        const generic = this.type(depth + 1);
        const n = this.count();
        const args: TypeDesc[] = [];
        for (let i = 0; i < n; i++) args.push(this.type(depth + 1));
        return { name: generic.name, args };
      }
      case 0x1b:
        parseMethodSigAt(this, depth + 1);
        return { name: "fnptr" };
      case 0x1d:
        return { name: "[]", elem: this.type(depth + 1) };
      case 0x1f:
      case 0x20: {
        const [, n] = compressedUInt(this.b, this.o); // custom modifier: skip its type
        this.o += n;
        return this.type(depth + 1);
      }
      case 0x45:
        return this.type(depth + 1);
      default:
        throw new DotnetError("unsupported", `unknown signature element 0x${et.toString(16)}`);
    }
  }
}

function parseMethodSigAt(r: SigReader, depth = 0): MethodSig {
  const conv = r.byte();
  const genericParams = conv & 0x10 ? r.count() : 0;
  const n = r.count();
  const ret = r.type(depth);
  const params: TypeDesc[] = [];
  for (let i = 0; i < n; i++) params.push(r.type(depth));
  return { hasThis: (conv & 0x20) !== 0, genericParams, ret, params };
}

export function parseMethodSig(model: Model, blob: Buffer): MethodSig {
  return parseMethodSigAt(new SigReader(model, blob));
}

/** Short name of a full type name: "Ns.Outer/Inner`1" -> "Inner`1". */
export function shortName(full: string): string {
  return full.slice(Math.max(full.lastIndexOf("."), full.lastIndexOf("/")) + 1);
}
