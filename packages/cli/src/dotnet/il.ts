// CIL method bodies (ECMA-335 II.25.4) decoded into instructions. Only the code is decoded; the
// exception clauses after a fat body's code are not needed and not read.
import { type Assembly, DotnetError } from "./metadata";

/** Largest method body decoded. Card getters are tens of bytes; anything huge is not one. */
export const MAX_BODY = 64 * 1024;

export interface Instruction {
  /** Offset of the instruction within the method's code. */
  at: number;
  /** One-byte opcode, or 0xfe00 | second byte for two-byte opcodes. */
  op: number;
  /** Integer or token operand (int8/int32 constants signed, tokens and branch targets unsigned). */
  int?: number;
  /** ldc.r4 / ldc.r8 operand. */
  float?: number;
  /** ldc.i8 operand. */
  long?: bigint;
  /** Absolute code offset a branch goes to. */
  target?: number;
}

// Operand kinds. "i1"/"i4" signed integers, "u1"/"u2" unsigned, "tok" metadata token, "br1"/"br4"
// branches, "r4"/"r8" floats, "i8" int64, "sw" switch table, "" none.
type Operand = "" | "i1" | "u1" | "u2" | "i4" | "tok" | "br1" | "br4" | "r4" | "r8" | "i8" | "sw";

const ONE = new Map<number, Operand>();
const TWO = new Map<number, Operand>();
const set = (m: Map<number, Operand>, from: number, to: number, kind: Operand) => {
  for (let o = from; o <= to; o++) m.set(o, kind);
};
set(ONE, 0x00, 0x0d, "");
set(ONE, 0x0e, 0x13, "u1"); // ldarg.s ldarga.s starg.s ldloc.s ldloca.s stloc.s
set(ONE, 0x14, 0x1e, ""); // ldnull, ldc.i4.m1..ldc.i4.8
ONE.set(0x1f, "i1");
ONE.set(0x20, "i4");
ONE.set(0x21, "i8");
ONE.set(0x22, "r4");
ONE.set(0x23, "r8");
set(ONE, 0x25, 0x26, ""); // dup pop
set(ONE, 0x27, 0x29, "tok"); // jmp call calli
ONE.set(0x2a, ""); // ret
set(ONE, 0x2b, 0x37, "br1");
set(ONE, 0x38, 0x44, "br4");
ONE.set(0x45, "sw");
set(ONE, 0x46, 0x6e, "");
set(ONE, 0x6f, 0x75, "tok"); // callvirt cpobj ldobj ldstr newobj castclass isinst
ONE.set(0x76, "");
ONE.set(0x79, "tok");
ONE.set(0x7a, "");
set(ONE, 0x7b, 0x81, "tok"); // field access, stobj
set(ONE, 0x82, 0x8b, "");
ONE.set(0x8c, "tok"); // box
ONE.set(0x8d, "tok"); // newarr
ONE.set(0x8e, "");
ONE.set(0x8f, "tok");
set(ONE, 0x90, 0xa2, "");
set(ONE, 0xa3, 0xa5, "tok");
set(ONE, 0xb3, 0xba, "");
ONE.set(0xc2, "tok");
ONE.set(0xc3, "");
ONE.set(0xc6, "tok");
ONE.set(0xd0, "tok"); // ldtoken
set(ONE, 0xd1, 0xdc, "");
ONE.set(0xdd, "br4"); // leave
ONE.set(0xde, "br1"); // leave.s
set(ONE, 0xdf, 0xe0, "");
set(TWO, 0x00, 0x05, "");
set(TWO, 0x06, 0x07, "tok"); // ldftn ldvirtftn
set(TWO, 0x09, 0x0e, "u2");
TWO.set(0x0f, "");
TWO.set(0x11, "");
TWO.set(0x12, "u1");
set(TWO, 0x13, 0x14, "");
set(TWO, 0x15, 0x16, "tok");
set(TWO, 0x17, 0x18, "");
TWO.set(0x19, "u1");
TWO.set(0x1a, "");
TWO.set(0x1c, "tok");
set(TWO, 0x1d, 0x1e, "");

const OPERAND_SIZE: Record<Operand, number> = { "": 0, i1: 1, u1: 1, br1: 1, u2: 2, i4: 4, tok: 4, br4: 4, r4: 4, r8: 8, i8: 8, sw: 4 };

/** Decodes IL code bytes. Throws on an undefined opcode or a truncated operand. */
export function decodeIl(code: Uint8Array): Instruction[] {
  const buf = Buffer.from(code.buffer, code.byteOffset, code.byteLength);
  const out: Instruction[] = [];
  let p = 0;
  while (p < buf.length) {
    const at = p;
    let op = buf[p++]!;
    let kind: Operand | undefined;
    if (op === 0xfe) {
      if (p >= buf.length) throw new DotnetError("corrupt", "truncated two-byte opcode");
      const op2 = buf[p++]!;
      kind = TWO.get(op2);
      op = 0xfe00 | op2;
    } else kind = ONE.get(op);
    if (kind === undefined) throw new DotnetError("unsupported", `undefined opcode 0x${op.toString(16)} at IL_${at.toString(16)}`);
    const size = OPERAND_SIZE[kind];
    if (p + size > buf.length) throw new DotnetError("corrupt", `truncated operand at IL_${at.toString(16)}`);
    const ins: Instruction = { at, op };
    switch (kind) {
      case "i1":
        ins.int = buf.readInt8(p);
        break;
      case "u1":
        ins.int = buf[p]!;
        break;
      case "u2":
        ins.int = buf.readUInt16LE(p);
        break;
      case "i4":
        ins.int = buf.readInt32LE(p);
        break;
      case "tok":
        ins.int = buf.readUInt32LE(p);
        break;
      case "br1":
        ins.target = p + 1 + buf.readInt8(p);
        break;
      case "br4":
        ins.target = p + 4 + buf.readInt32LE(p);
        break;
      case "r4":
        ins.float = buf.readFloatLE(p);
        break;
      case "r8":
        ins.float = buf.readDoubleLE(p);
        break;
      case "i8":
        ins.long = buf.readBigInt64LE(p);
        break;
      case "sw": {
        const n = buf.readUInt32LE(p);
        if (n > (buf.length - p - 4) / 4) throw new DotnetError("corrupt", `truncated switch table at IL_${at.toString(16)}`);
        p += 4 * n;
        break;
      }
    }
    p += size;
    out.push(ins);
  }
  return out;
}

/** The code bytes of the method body at `rva` (tiny or fat header). */
export function methodCode(asm: Assembly, rva: number): Buffer {
  const data = asm.rvaSlice(rva);
  if (data.length < 1) throw new DotnetError("corrupt", "empty method body");
  const h = data[0]!;
  let start: number;
  let size: number;
  if ((h & 3) === 2) {
    start = 1;
    size = h >> 2;
  } else if ((h & 3) === 3) {
    if (data.length < 12) throw new DotnetError("corrupt", "truncated fat method header");
    const headerSize = (data.readUInt16LE(0) >> 12) * 4;
    if (headerSize !== 12) throw new DotnetError("corrupt", "bad fat method header size");
    start = headerSize;
    size = data.readUInt32LE(4);
  } else throw new DotnetError("corrupt", "bad method header");
  if (size > MAX_BODY) throw new DotnetError("unsupported", `method body of ${size} bytes is larger than ${MAX_BODY}`);
  if (start + size > data.length) throw new DotnetError("corrupt", "method body runs past its section");
  return data.subarray(start, start + size);
}
