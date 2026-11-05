import { describe, expect, test } from "vitest";
import { decodeIl, MAX_BODY, methodCode } from "../src/dotnet/il";
import { Assembly, compressedUInt, DotnetError, T } from "../src/dotnet/metadata";
import { Model } from "../src/dotnet/model";
import { AsmBuilder, code, compressed, ET, il, prim, szarray, typeVar } from "./dotnet-fixtures";
import { buildGameAssembly } from "./game-assembly";

const dotnetError = (fn: () => unknown, code?: string) => {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(DotnetError);
  if (code) expect((err as DotnetError).code).toBe(code);
};

/** A small assembly exercising each table, heap and body format the reader uses. */
function sample() {
  const b = new AsmBuilder();
  const object = b.typeRef("System", "Object");
  const outerRef = b.typeRef("Other", "Outer");
  const innerRef = b.nestedTypeRef(outerRef, "Inner");
  const color = b.typeDef("Ns", "Color", {
    extends: b.typeRef("System", "Enum"),
    fields: [
      { name: "value__", sig: prim(ET.i4), flags: 0x0606 },
      { name: "Red", sig: prim(ET.i4), flags: 0x8056, constant: 1 },
      { name: "Blue", sig: prim(ET.i4), flags: 0x8056, constant: -2 },
    ],
  });
  const box = b.typeDef("Ns", "Box`1", {
    extends: object,
    fields: [{ name: "Data", sig: prim(ET.i4), flags: 0x0113, data: [1, 2, 3, 4, 5, 6, 7, 8] }],
    methods: [
      { name: ".ctor", params: [typeVar(0)], body: () => il.ret },
      { name: "Tiny", ret: prim(ET.i4), body: () => code(il.ldc(42), il.ret) },
      { name: "Fat", ret: prim(ET.i4), body: () => code(il.ldc(1000), il.ret), fat: true },
      { name: "Generic", instance: false, genericParams: 1, params: [szarray(prim(ET.string))], body: () => il.ret },
      { name: "Abstract" },
    ],
  });
  const nested = b.typeDef("", "Nested", { extends: object, nestedIn: box.token });
  const boxOfColor = b.typeSpec(b.genericInst(box.token, [b.valueType(color.token)]));
  const ctorRef = b.memberRef(boxOfColor, ".ctor", { instance: true, params: [typeVar(0)] });
  const externalRef = b.memberRef(innerRef, "Go", { instance: true, params: [prim(ET.string)], ret: prim(ET.bool) });
  const spec = b.methodSpec(box.methods[3]!, [b.classType(object)]);
  const fieldRef = b.fieldRef(innerRef, "Value", prim(ET.i4));
  const hello = b.userString("héllo");
  return { asm: b.build(), color, box, nested, ctorRef, externalRef, spec, fieldRef, hello };
}

describe("metadata reader", () => {
  test("reads names, nesting, signatures and member references by full name", () => {
    const s = sample();
    const m = new Model(new Assembly(s.asm));
    expect(m.types.map((t) => t.fullName)).toEqual(["Ns.Color", "Ns.Box`1", "Ns.Box`1/Nested"]);
    expect(m.type("Ns.Color")?.extends).toBe("System.Enum");
    expect([...m.enumMembers(m.type("Ns.Color")!)]).toEqual([[1, "Red"], [-2, "Blue"]]);

    const ctor = m.method(s.ctorRef);
    expect(ctor).toMatchObject({ owner: "Ns.Box`1", name: ".ctor", ownerArgs: [{ name: "Ns.Color" }] });
    // A MemberRef on an instantiated generic type of this assembly resolves to its definition.
    expect(ctor.def?.row).toBe(s.box.methods[0]! & 0xffffff);
    expect(ctor.sig.params).toEqual([{ name: "!0" }]);

    const ext = m.method(s.externalRef);
    expect(ext).toMatchObject({ owner: "Other.Outer/Inner", name: "Go", def: null });
    expect(ext.sig).toEqual({ hasThis: true, genericParams: 0, ret: { name: "System.Boolean" }, params: [{ name: "System.String" }] });

    const generic = m.method(s.spec);
    expect(generic).toMatchObject({ owner: "Ns.Box`1", name: "Generic", methodArgs: [{ name: "System.Object" }] });
    expect(generic.sig).toMatchObject({ hasThis: false, genericParams: 1, params: [{ name: "[]", elem: { name: "System.String" } }] });

    expect(m.field(s.fieldRef)).toEqual({ owner: "Other.Outer/Inner", name: "Value", def: null });
    expect(m.field(s.box.fields[0]!)).toEqual({ owner: "Ns.Box`1", name: "Data", def: s.box.fields[0]! & 0xffffff });
    expect(m.asm.userString(s.hello & 0xffffff)).toBe("héllo");

    const rva = m.fieldRva(s.box.fields[0]! & 0xffffff)!;
    expect([...m.asm.file.subarray(m.asm.rvaToOffset(rva, 8), m.asm.rvaToOffset(rva, 8) + 8)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("decodes tiny and fat method bodies; abstract methods have no body", () => {
    const s = sample();
    const m = new Model(new Assembly(s.asm));
    const [, tiny, fat, , abstract] = m.methodsOf(m.type("Ns.Box`1")!);
    expect(decodeIl(methodCode(m.asm, tiny!.rva))).toEqual([{ at: 0, op: 0x1f, int: 42 }, { at: 2, op: 0x2a }]);
    expect(decodeIl(methodCode(m.asm, fat!.rva))).toEqual([{ at: 0, op: 0x20, int: 1000 }, { at: 5, op: 0x2a }]);
    expect(abstract!.rva).toBe(0);
  });

  test("compressed integers in all three widths", () => {
    for (const n of [0, 0x7f, 0x80, 0x3fff, 0x4000, 0x1fffffff]) expect(compressedUInt(Uint8Array.from(compressed(n)), 0)).toEqual([n, compressed(n).length]);
    dotnetError(() => compressedUInt(Uint8Array.from([0x80]), 0), "corrupt");
    dotnetError(() => compressedUInt(Uint8Array.from([0xff, 0, 0, 0]), 0), "corrupt");
  });

  test("the game stand-in parses and has the types the card reader needs", () => {
    const m = new Model(new Assembly(buildGameAssembly()));
    expect(m.type("MegaCrit.Sts2.Core.Models.CardModel")).toBeDefined();
    expect(m.asm.rowCount(T.MethodSpec)).toBeGreaterThan(0);
  });
});

describe("malformed assemblies", () => {
  test("not a PE file, or a PE file without a CLI header", () => {
    dotnetError(() => new Assembly(Buffer.from("not an executable at all, just text padding it out to 64+ bytes......")), "not-pe");
    dotnetError(() => new Assembly(Buffer.alloc(0)), "not-pe");
    dotnetError(() => new Assembly(new AsmBuilder().build({ corruptHeader: true })), "not-pe");
    const noCli = Buffer.from(sample().asm);
    noCli.writeUInt32LE(0, 0x84 + 20 + 96 + 14 * 8);
    dotnetError(() => new Assembly(noCli), "not-dotnet");
  });

  test("offsets, lengths and indices pointing outside the file are errors, not crashes", () => {
    const good = sample().asm;
    const m = new Model(new Assembly(good));
    dotnetError(() => m.asm.str(1 << 20));
    dotnetError(() => m.asm.blob(1 << 20));
    dotnetError(() => m.asm.userString(1 << 20));
    dotnetError(() => m.asm.row(T.TypeDef, 0));
    dotnetError(() => m.asm.row(T.TypeDef, 99));
    dotnetError(() => m.asm.row(T.Param, 1));
    dotnetError(() => m.asm.rvaToOffset(0x10));
    dotnetError(() => m.method(0x06000000 | 999));
    dotnetError(() => m.method(0x01000001));
    // A truncated file: the metadata now runs past the end.
    dotnetError(() => new Assembly(good.subarray(0, good.length - 600)));
  });

  test("a TypeSpec naming itself is a DotnetError, not a stack overflow", () => {
    const b = new AsmBuilder();
    // TypeSpec row 1: CLASS TypeDefOrRef(TypeSpec 1) = (1 << 2) | 2.
    const self = b.typeSpec([ET.class, 6]);
    b.typeDef("N", "A", { extends: self });
    dotnetError(() => new Model(new Assembly(b.build())), "corrupt");
  });

  test("method bodies: bad headers, truncation and oversized code", () => {
    const b = new AsmBuilder();
    const t = b.typeDef("N", "T", { methods: [{ name: "M", body: () => code(il.ldc(1000), il.ret) }] });
    const asm = new Assembly(b.build());
    const m = new Model(asm);
    const rva = m.methodDef(t.methods[0]! & 0xffffff).rva;
    const off = asm.rvaToOffset(rva);
    const tamper = (fn: (buf: Buffer) => void) => {
      const copy = Buffer.from(asm.file);
      fn(copy);
      return new Assembly(copy);
    };
    dotnetError(() => methodCode(tamper((c) => (c[off] = 0x00)), rva), "corrupt");
    dotnetError(() => methodCode(tamper((c) => (c[off] = (60 << 2) | 2)), rva + 0x100000));
    const fat = tamper((c) => {
      c.writeUInt16LE(0x3013, off);
      c.writeUInt32LE(MAX_BODY + 1, off + 4);
    });
    dotnetError(() => methodCode(fat, rva), "unsupported");
    const runsOver = tamper((c) => {
      c.writeUInt16LE(0x3013, off);
      c.writeUInt32LE(0x8000, off + 4);
    });
    dotnetError(() => methodCode(runsOver, rva), "corrupt");
  });

  test("random corruption only ever yields a parsed assembly or a DotnetError", () => {
    const good = buildGameAssembly();
    let seed = 12345;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    let parsed = 0;
    let refused = 0;
    for (let i = 0; i < 5000; i++) {
      const copy = Buffer.from(good);
      for (let k = 0; k < 1 + rand(8); k++) copy[rand(copy.length)] = rand(256);
      try {
        const m = new Model(new Assembly(copy));
        for (const t of m.types) for (const md of m.methodsOf(t)) if (md.rva) decodeIl(methodCode(m.asm, md.rva));
        parsed++;
      } catch (e) {
        if (!(e instanceof DotnetError)) throw new Error(`iteration ${i}: ${(e as Error).stack}`);
        refused++;
      }
    }
    expect(parsed).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
  });
});

describe("IL decoder", () => {
  test("operand kinds: none, int8, int32, int64, floats, tokens, branches, switch, two-byte opcodes", () => {
    const f32 = Buffer.alloc(4);
    f32.writeFloatLE(1.5);
    const f64 = Buffer.alloc(8);
    f64.writeDoubleLE(-2.25);
    const i64 = Buffer.alloc(8);
    i64.writeBigInt64LE(-5n);
    const bytes = [
      0x00, // nop
      0x1f, 0xfe, // ldc.i4.s -2
      0x20, 0x00, 0x00, 0x00, 0x80, // ldc.i4 int.MinValue
      0x21, ...i64, // ldc.i8
      0x22, ...f32, // ldc.r4
      0x23, ...f64, // ldc.r8
      0x72, 0x01, 0x00, 0x00, 0x70, // ldstr
      0x2b, 0x02, // br.s +2
      0x45, 0x02, 0x00, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, // switch (2 targets)
      0xfe, 0x06, 0x01, 0x00, 0x00, 0x06, // ldftn
      0xfe, 0x0c, 0x03, 0x00, // ldloc 3
      0x2a,
    ];
    const ins = decodeIl(Uint8Array.from(bytes));
    expect(ins.map((x) => x.op)).toEqual([0x00, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x72, 0x2b, 0x45, 0xfe06, 0xfe0c, 0x2a]);
    expect(ins[1]!.int).toBe(-2);
    expect(ins[2]!.int).toBe(-2147483648);
    expect(ins[3]!.long).toBe(-5n);
    expect(ins[4]!.float).toBe(1.5);
    expect(ins[5]!.float).toBe(-2.25);
    expect(ins[6]!.int).toBe(0x70000001);
    expect(ins[7]!.target).toBe(ins[7]!.at + 2 + 2);
    expect(ins[9]!.int).toBe(0x06000001);
    expect(ins[10]!.int).toBe(3);
  });

  test("undefined opcodes and truncated operands are errors", () => {
    dotnetError(() => decodeIl(Uint8Array.from([0x24])), "unsupported");
    dotnetError(() => decodeIl(Uint8Array.from([0xfe, 0x08])), "unsupported");
    dotnetError(() => decodeIl(Uint8Array.from([0xfe])), "corrupt");
    dotnetError(() => decodeIl(Uint8Array.from([0x20, 1, 2])), "corrupt");
    dotnetError(() => decodeIl(Uint8Array.from([0x45, 0xff, 0xff, 0xff, 0x0f])), "corrupt");
  });
});
