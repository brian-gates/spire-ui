// A small symbolic IL evaluator over the game's model classes (cards, relics, potions), shared by
// the stats readers. It follows straight-line getters that build constants, DynamicVar lists and
// OnUpgrade effects; anything else throws Unknown, which the readers turn into an `unknown` field.
// Types and members are matched by full name, never by token.
import { decodeIl, type Instruction, methodCode } from "./dotnet/il";
import { DotnetError } from "./dotnet/metadata";
import { type MethodDefInfo, type MethodRef, type Model, shortName, type TypeDefInfo } from "./dotnet/model";

export const NS = "MegaCrit.Sts2.Core";
export const CARD_MODEL = `${NS}.Models.CardModel`;
export const MODEL_DB = `${NS}.Models.ModelDb`;
const VARS_NS = `${NS}.Localization.DynamicVars`;
const DYNAMIC_VAR = `${VARS_NS}.DynamicVar`;
const DYNAMIC_VAR_SET = `${VARS_NS}.DynamicVarSet`;
const DECIMAL = "System.Decimal";

/** Fluent var methods that make a var's value depend on game state (its base stays meaningful). */
const COMPUTED_MODIFIERS = new Set([`${VARS_NS}.CalculatedVar::WithMultiplier`, `${VARS_NS}.CalculatedDamageVar::FromOsty`, `${VARS_NS}.ExtraDamageVar::FromOsty`]);
/** Var classes that are display switches, not numbers. */
const SKIPPED_VARS = new Set(["IfUpgradedVar"]);

const MAX_STACK = 64;
const MAX_ARRAY = 64;
const MAX_INLINE = 4;

/** Thrown when this build lacks the types/signatures the reader depends on. */
export class UnsupportedBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedBuildError";
  }
}

/** One of a model's numbers: its base value, upgraded value, or `computed` when only known at runtime. */
export interface VarFacts {
  base?: number;
  upgraded?: number;
  computed?: true;
}

// --- symbolic values -------------------------------------------------------------------------

export type Val =
  | { k: "int"; v: number }
  | { k: "dec"; v: number }
  | { k: "str"; v: string }
  | { k: "this" }
  | { k: "null" }
  | { k: "runtime" }
  | { k: "arr"; items: (Val | undefined)[]; elem: string }
  | { k: "list"; items: Val[] }
  | { k: "var"; name: string | null; cls: string; base?: number; computed: boolean }
  | { k: "lambda" }
  | { k: "fieldtoken"; row: number }
  | { k: "typetoken"; name: string }
  | { k: "pool"; type: string }
  | { k: "varset" }
  | { k: "varref"; name: string }
  | { k: "cost" };

export type Effect = { var: string; delta: number } | { cost: number } | { add: number } | { remove: number };

/** A pattern the evaluator does not understand; the field it was reading becomes unknown. */
export class Unknown extends Error {}

export const ldcI4 = (ins: Instruction): number | undefined => {
  if (ins.op >= 0x15 && ins.op <= 0x1e) return ins.op - 0x16;
  if (ins.op === 0x1f || ins.op === 0x20) return ins.int;
  return undefined;
};
const isNum = (v: Val | undefined): v is { k: "int"; v: number } | { k: "dec"; v: number } => v?.k === "int" || v?.k === "dec";
export const key = (r: MethodRef) => `${r.owner}::${r.name}`;
export const sameParams = (r: MethodRef, names: string[]) => r.sig.params.length === names.length && r.sig.params.every((p, i) => p.name === names[i]);

/** Records a field that could not be read, and why. */
export type Note = (field: string, e: unknown) => void;

/** A `note` that collects into `unknown` (field names, once each) and `reasons`. */
export function noter(unknown: string[], reasons: string[]): Note {
  return (field, e) => {
    if (!unknown.includes(field)) unknown.push(field);
    reasons.push(`${field}: ${e instanceof Error ? (e instanceof Unknown || e instanceof DotnetError ? e.message : `${e.name}: ${e.message}`) : String(e)}`);
  };
}

/**
 * The evaluator, for subclasses of one model class (`root`, e.g. CardModel): getters are looked up
 * on a class and its bases below `root`, and `root`'s own DynamicVars getter is the var set.
 */
export class ModelReader {
  private readonly varNames = new Map<number, string | "<typeArg>">();
  private readonly setGetters = new Map<number, string>();
  private readonly bodies = new Map<number, Instruction[] | DotnetError>();

  constructor(
    protected readonly m: Model,
    protected readonly root: string,
  ) {
    if (!m.type(root)) throw new UnsupportedBuildError(`${root} not found`);
    if (!m.type(DYNAMIC_VAR) || !m.type(DYNAMIC_VAR_SET)) throw new UnsupportedBuildError("DynamicVar or DynamicVarSet not found");
    for (const t of m.types) if (t.ns === VARS_NS) this.learnVarType(t);
  }

  /** An enum's members by value; throws UnsupportedBuildError when the enum is missing. */
  protected enumOf(full: string): Map<number, string> {
    const t = this.m.type(full);
    if (!t) throw new UnsupportedBuildError(`${full} not found`);
    return this.m.enumMembers(t);
  }

  protected body(md: MethodDefInfo): Instruction[] {
    let b = this.bodies.get(md.row);
    if (!b) {
      try {
        if (md.rva === 0) throw new DotnetError("unsupported", `${md.owner.name}.${md.name} has no body`);
        b = decodeIl(methodCode(this.m.asm, md.rva));
      } catch (e) {
        if (!(e instanceof DotnetError)) throw e;
        b = e;
      }
      this.bodies.set(md.row, b);
    }
    if (b instanceof DotnetError) throw new Unknown(b.message);
    return b;
  }

  /** The string an ldstr loads; its operand must be a #US token (table 0x70). */
  protected literal(ins: Instruction): string {
    if (ins.op !== 0x72 || ins.int === undefined || ins.int >>> 24 !== 0x70) throw new Unknown("ldstr operand is not a string token");
    return this.m.asm.userString(ins.int & 0xffffff);
  }

  /** Default var names (from each var constructor's `base("Name", ...)`) and DynamicVarSet getters. */
  private learnVarType(t: TypeDefInfo): void {
    for (const md of this.m.methodsOf(t)) {
      try {
        if (md.name === ".ctor" && md.sig.params[0]?.name !== "System.String") {
          const b = this.body(md);
          // ldarg.0; ldstr "Name"; ...; call <base ctor>(string, ...)
          if (b[0]?.op === 0x02 && b[1]?.op === 0x72) {
            const call = b.slice(2).find((x) => x.op === 0x28 && this.m.method(x.int!).name === ".ctor");
            const target = call && this.m.method(call.int!);
            if (target && target.sig.params[0]?.name === "System.String") this.varNames.set(md.row, this.literal(b[1]));
          }
          // ldarg.0; ldtoken !0; call Type.GetTypeFromHandle; callvirt MemberInfo.get_Name: typeof(T).Name
          if (b[0]?.op === 0x02 && b[1]?.op === 0xd0 && b[2]?.op === 0x28 && b[3]?.op === 0x6f) {
            const tok = this.m.typeToken(b[1].int!);
            const a = this.m.method(b[2].int!);
            const c = this.m.method(b[3].int!);
            if (tok.name === "!0" && key(a) === "System.Type::GetTypeFromHandle" && c.name === "get_Name") this.varNames.set(md.row, "<typeArg>");
          }
        }
        if (t.fullName === DYNAMIC_VAR_SET && md.name.startsWith("get_") && md.sig.params.length === 0) {
          // ldarg.0; ldfld _vars; ldstr "Name"; callvirt Dictionary.get_Item; [castclass]; ret
          const b = this.body(md);
          const ops = b.map((x) => x.op);
          const shape = ops.join(",");
          if ((shape === "2,123,114,111,116,42" || shape === "2,123,114,111,42") && this.m.method(b[3]!.int!).name === "get_Item") {
            this.setGetters.set(md.row, this.literal(b[2]!));
          }
        }
      } catch {
        // A var type that cannot be read just has no default name (its vars become unknown).
      }
    }
  }

  /** The parameterless, non-generic method `name` declared by `t` or its nearest base below `stop`. */
  protected override(t: TypeDefInfo, name: string, stop = this.root): MethodDefInfo | null {
    let cur: TypeDefInfo | undefined = t;
    for (let k = 0; k < 16 && cur && cur.fullName !== stop; k++) {
      const md = this.m.methodsOf(cur).find((x) => x.name === name && x.sig.params.length === 0 && x.sig.genericParams === 0);
      if (md) return md;
      cur = cur.extends ? this.m.type(cur.extends) : undefined;
    }
    return null;
  }

  // --- evaluator -------------------------------------------------------------------------------

  /**
   * Runs straight-line IL symbolically. Returns the value returned (if any) and the side effects
   * OnUpgrade performs. Throws Unknown for anything outside the recognised patterns.
   */
  protected evaluate(ins: Instruction[], depth = 0): { ret: Val | null; effects: Effect[] } {
    const st: Val[] = [];
    const effects: Effect[] = [];
    const pop = (): Val => {
      const v = st.pop();
      if (!v) throw new Unknown("stack underflow");
      return v;
    };
    const push = (v: Val) => {
      if (st.length >= MAX_STACK) throw new Unknown("stack too deep");
      st.push(v);
    };
    for (let i = 0; i < ins.length; i++) {
      const x = ins[i]!;
      const c = ldcI4(x);
      if (c !== undefined) {
        push({ k: "int", v: c });
        continue;
      }
      switch (x.op) {
        case 0x00: // nop
          break;
        case 0x02:
          push({ k: "this" });
          break;
        case 0x14:
          push({ k: "null" });
          break;
        case 0x72:
          push({ k: "str", v: this.literal(x) });
          break;
        case 0x25: {
          const v = pop();
          push(v);
          push(v);
          break;
        }
        case 0x26:
          pop();
          break;
        case 0xd0: {
          const table = x.int! >>> 24;
          if (table === 0x04) push({ k: "fieldtoken", row: x.int! & 0xffffff });
          else push({ k: "typetoken", name: this.m.typeToken(x.int!).name });
          break;
        }
        case 0x7e: {
          const f = this.m.field(x.int!);
          if (f.owner === DECIMAL && (f.name === "One" || f.name === "Zero" || f.name === "MinusOne")) {
            push({ k: "dec", v: f.name === "One" ? 1 : f.name === "Zero" ? 0 : -1 });
            break;
          }
          // C# lambda cache: ldsfld <>9__N; dup; brtrue.s L; pop; ldsfld <>9; ldftn; newobj Func; dup; stsfld <>9__N; L:
          const seq = ins.slice(i + 1, i + 9);
          if (
            f.name.startsWith("<>9__") &&
            seq.map((s) => s.op).join(",") === [0x25, 0x2d, 0x26, 0x7e, 0xfe06, 0x73, 0x25, 0x80].join(",") &&
            seq[1]!.target === seq[7]!.at + 5 &&
            this.m.field(seq[7]!.int!).name === f.name &&
            this.m.method(seq[5]!.int!).owner.startsWith("System.Func`")
          ) {
            push({ k: "lambda" });
            i += 8;
            break;
          }
          throw new Unknown(`ldsfld ${f.owner}::${f.name}`);
        }
        case 0x8d: {
          const n = pop();
          if (n.k !== "int" || n.v < 0 || n.v > MAX_ARRAY) throw new Unknown("newarr size");
          push({ k: "arr", items: new Array<Val | undefined>(n.v).fill(undefined), elem: this.m.typeToken(x.int!).name });
          break;
        }
        case 0x9e: // stelem.i4
        case 0xa2: // stelem.ref
        case 0xa4: {
          // stelem <T>
          const v = pop();
          const idx = pop();
          const arr = pop();
          if (arr.k !== "arr" || idx.k !== "int" || idx.v < 0 || idx.v >= arr.items.length) throw new Unknown("stelem");
          arr.items[idx.v] = v;
          break;
        }
        case 0x2a:
          if (depth === 0 && i !== ins.length - 1) throw new Unknown("early return");
          return { ret: st.length ? pop() : null, effects };
        case 0x28:
        case 0x6f:
        case 0x73: {
          const r = this.m.method(x.int!);
          const nargs = r.sig.params.length + (x.op !== 0x73 && r.sig.hasThis ? 1 : 0);
          if (st.length < nargs) throw new Unknown("stack underflow");
          const args = st.splice(st.length - nargs, nargs);
          const out = this.call(x.op, r, args, effects, depth);
          if (out) push(out);
          break;
        }
        case 0xfe06: // ldftn outside the lambda cache pattern
        default:
          throw new Unknown(`opcode 0x${x.op.toString(16)}`);
      }
    }
    throw new Unknown("no ret");
  }

  private call(op: number, r: MethodRef, args: Val[], effects: Effect[], depth: number): Val | null {
    const k = key(r);
    const a = (i: number): Val => {
      const v = args[i];
      if (!v) throw new Unknown(`call ${k}: missing argument ${i}`);
      return v;
    };
    if (r.owner === DECIMAL) {
      if (op === 0x73 && r.name === ".ctor") {
        if (args.length === 1 && isNum(a(0))) return { k: "dec", v: (a(0) as { v: number }).v };
        if (args.length === 5 && args.every((x) => x.k === "int")) {
          const [lo, mid, hi, neg, scale] = args.map((x) => (x as { v: number }).v) as [number, number, number, number, number];
          if (mid !== 0 || hi !== 0 || scale < 0 || scale > 28) throw new Unknown("decimal out of range");
          return { k: "dec", v: Number((((neg ? -1 : 1) * (lo >>> 0)) / 10 ** scale).toFixed(scale)) };
        }
      }
      if (r.name === "op_Implicit" && args.length === 1 && isNum(a(0))) return { k: "dec", v: (a(0) as { v: number }).v };
      // A conversion of a runtime value is still a runtime value.
      if ((r.name === "op_Implicit" || r.name === ".ctor") && args.length === 1 && a(0).k === "runtime") return { k: "runtime" };
      throw new Unknown(`call ${k}`);
    }
    if (k === "System.Runtime.CompilerServices.RuntimeHelpers::InitializeArray" && args.length === 2) {
      const arr = a(0);
      const f = a(1);
      if (arr.k !== "arr" || f.k !== "fieldtoken" || !this.isInt32Enum(arr.elem)) throw new Unknown("InitializeArray");
      const rva = this.m.fieldRva(f.row);
      if (rva === null) throw new Unknown("InitializeArray without data");
      const off = this.m.asm.rvaToOffset(rva, arr.items.length * 4);
      for (let i = 0; i < arr.items.length; i++) arr.items[i] = { k: "int", v: this.m.asm.i32(off + i * 4) };
      return null;
    }
    // Collections the compiler emits for collection expressions and `new[] { ... }`.
    if (op === 0x73 && r.name === ".ctor" && (r.owner === "<>z__ReadOnlySingleElementList`1" || r.owner === "<>z__ReadOnlyArray`1") && args.length === 1) {
      const v = a(0);
      if (r.owner === "<>z__ReadOnlyArray`1") {
        if (v.k !== "arr" || v.items.some((x) => x === undefined)) throw new Unknown("array not filled");
        return { k: "list", items: v.items as Val[] };
      }
      return { k: "list", items: [v] };
    }
    if (op === 0x73 && r.owner === "System.Collections.Generic.List`1" && r.name === ".ctor" && args.length === 0) return { k: "list", items: [] };
    if (r.owner === "System.Collections.Generic.List`1" && r.name === "Add" && args.length === 2) {
      const list = a(0);
      if (list.k !== "list" || list.items.length >= MAX_ARRAY) throw new Unknown("List.Add");
      list.items.push(a(1));
      return null;
    }
    if (k === "System.Array::Empty" && args.length === 0) return { k: "list", items: [] };
    if (op === 0x73 && r.owner.startsWith("System.Func`") && r.name === ".ctor") return { k: "lambda" };
    if (op === 0x73 && r.name === ".ctor" && this.isVarType(r.owner)) return this.newVar(r, args);
    if (COMPUTED_MODIFIERS.has(k) && args.length >= 1) {
      const v = a(0);
      if (v.k !== "var" || args.slice(1).some((x) => x.k !== "lambda")) throw new Unknown(`call ${k}`);
      return { ...v, computed: true };
    }
    if (k === `${MODEL_DB}::CardPool` && r.methodArgs.length === 1 && args.length === 0) return { k: "pool", type: r.methodArgs[0]!.name };
    if (op !== 0x73 && args.length === 1 && a(0).k === "this" && r.name.startsWith("get_")) {
      if (k === `${this.root}::get_DynamicVars`) return { k: "varset" };
      if (k === `${CARD_MODEL}::get_EnergyCost`) return { k: "cost" };
      // A getter the model class itself adds reads instance state: a value that exists only at runtime.
      if (r.owner !== this.root && r.def && this.m.derivesFrom(r.def.owner, this.root)) return { k: "runtime" };
    }
    if (r.owner === DYNAMIC_VAR_SET && op === 0x6f && args.length >= 1) {
      if (a(0).k !== "varset") throw new Unknown(`call ${k}`);
      if (r.name === "get_Item" && args.length === 2 && a(1).k === "str") return { k: "varref", name: (a(1) as { v: string }).v };
      const name = r.def ? this.setGetters.get(r.def.row) : undefined;
      if (name !== undefined && args.length === 1) return { k: "varref", name };
      throw new Unknown(`call ${k}`);
    }
    if (k === `${DYNAMIC_VAR}::UpgradeValueBy` && args.length === 2) {
      const ref = a(0);
      const d = a(1);
      if (ref.k !== "varref" || !isNum(d)) throw new Unknown("UpgradeValueBy operands");
      effects.push({ var: ref.name, delta: d.v });
      return null;
    }
    if (r.name === "UpgradeBy" && r.owner.endsWith(".CardEnergyCost") && args.length === 2) {
      const d = a(1);
      if (a(0).k !== "cost" || d.k !== "int") throw new Unknown("UpgradeBy operands");
      effects.push({ cost: d.v });
      return null;
    }
    if ((k === `${CARD_MODEL}::AddKeyword` || k === `${CARD_MODEL}::RemoveKeyword`) && args.length === 2 && a(0).k === "this") {
      const kw = a(1);
      if (kw.k !== "int") throw new Unknown(`${r.name} operand`);
      effects.push(r.name === "AddKeyword" ? { add: kw.v } : { remove: kw.v });
      return null;
    }
    // base.OnUpgrade(): CardModel's is empty; an intermediate base class's is evaluated in place.
    if (op === 0x28 && r.name === "OnUpgrade" && args.length === 1 && a(0).k === "this" && r.def) {
      if (depth >= MAX_INLINE) throw new Unknown("OnUpgrade nests too deeply");
      effects.push(...this.evaluate(this.body(r.def), depth + 1).effects);
      return null;
    }
    throw new Unknown(`call ${k}`);
  }

  private isVarType(full: string): boolean {
    const t = this.m.type(full);
    return !!t && t.ns === VARS_NS && (t.fullName === DYNAMIC_VAR || this.m.derivesFrom(t, DYNAMIC_VAR));
  }

  protected isInt32Enum(full: string): boolean {
    if (full === "System.Int32") return true;
    const t = this.m.type(full);
    if (!t || t.extends !== "System.Enum") return false;
    for (let f = t.fields[0]; f < t.fields[1]; f++) {
      if (this.m.fieldName(f) !== "value__") continue;
      const sig = this.m.asm.blob(this.m.asm.row(0x04, f)[2]!);
      return sig.length === 2 && sig[0] === 0x06 && sig[1] === 0x08;
    }
    return false;
  }

  /** `new XxxVar(args)`: its placeholder name and base value. */
  private newVar(r: MethodRef, args: Val[]): Val {
    const cls = shortName(r.owner);
    const params = r.sig.params;
    let name: string | null = null;
    let first = 0;
    if (args.length !== params.length) throw new Unknown(`${cls} constructor arity`);
    if (params[0]?.name === "System.String") {
      const n = args[0];
      if (n?.k !== "str") throw new Unknown(`${cls} name is not a constant`);
      name = n.v;
      first = 1;
    } else {
      const d = r.def ? this.varNames.get(r.def.row) : undefined;
      if (d === "<typeArg>") name = r.ownerArgs[0] ? shortName(r.ownerArgs[0].name) : null;
      else name = d ?? null;
    }
    let base: number | undefined;
    let runtime = false;
    for (let i = first; i < params.length; i++) {
      const p = params[i]!.name;
      if (p !== DECIMAL && p !== "System.Int32") continue;
      const v = args[i];
      if (!v) throw new Unknown(`${cls} constructor arity`);
      if (isNum(v)) base = v.v;
      else if (v.k === "runtime") runtime = true;
      else throw new Unknown(`${cls} value is not a constant`);
      break;
    }
    return { k: "var", name, cls, ...(base !== undefined ? { base } : {}), computed: runtime || cls.startsWith("Calculated") };
  }

  // --- per-card facts -------------------------------------------------------------------------

  protected evalGetter(t: TypeDefInfo, name: string): { found: false } | { found: true; value: Val | null } {
    const md = this.override(t, name);
    if (!md) return { found: false };
    return { found: true, value: this.evaluate(this.body(md)).ret };
  }

  /** A getter that returns an int constant: its value, null when not overridden, undefined (noted) otherwise. */
  protected constInt(t: TypeDefInfo, name: string, note: Note, field: string): number | undefined | null {
    try {
      const r = this.evalGetter(t, name);
      if (!r.found) return null;
      if (r.value?.k === "int") return r.value.v;
      throw new Unknown(`${name} is not an int constant`);
    } catch (e) {
      note(field, e);
      return undefined;
    }
  }

  /**
   * The vars `get_CanonicalVars` builds, by name (empty when not overridden). A var without a known
   * name is noted and skipped; a list that cannot be read is noted and gives `known: false`.
   */
  protected canonicalVars(t: TypeDefInfo, note: Note): { vars: Record<string, VarFacts>; known: boolean } {
    const vars = Object.create(null) as Record<string, VarFacts>;
    try {
      const r = this.evalGetter(t, "get_CanonicalVars");
      if (r.found) {
        if (r.value?.k !== "list") throw new Unknown("not a list");
        for (const v of r.value.items) {
          if (v.k !== "var") throw new Unknown(`list item is a ${v.k}`);
          if (SKIPPED_VARS.has(v.cls)) continue;
          if (!v.name || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(v.name)) {
            note("vars", new Unknown(`${v.cls} has no known name`));
            continue;
          }
          vars[v.name] = { ...(v.base !== undefined ? { base: v.base } : {}), ...(v.computed ? { computed: true as const } : {}) };
        }
      }
    } catch (e) {
      note("vars", e);
      return { vars: Object.create(null) as Record<string, VarFacts>, known: false };
    }
    return { vars, known: true };
  }

  /**
   * Which pools list each model: for every concrete subclass of `poolBase`, the `ModelDb.<dbMethod><T>()`
   * calls in its `generator` override, or in a static property getter the generator returns (the
   * character potion pools return an epoch's list). A pool whose generator cannot be read lists nothing.
   */
  protected listedBy(poolBase: string, generator: string, dbMethod: string): Map<string, TypeDefInfo[]> {
    const out = new Map<string, TypeDefInfo[]>();
    for (const t of this.m.types) {
      if (!this.m.derivesFrom(t, poolBase)) continue;
      const listed: string[] = [];
      try {
        const gen = this.override(t, generator, poolBase);
        if (!gen) continue;
        const scan = (body: Instruction[], depth: number) => {
          for (const x of body) {
            if (x.op !== 0x28) continue;
            const r = this.m.method(x.int!);
            if (key(r) === `${MODEL_DB}::${dbMethod}` && r.methodArgs.length === 1) listed.push(r.methodArgs[0]!.name);
            else if (depth === 0 && r.def && !r.sig.hasThis && r.name.startsWith("get_") && r.sig.params.length === 0) scan(this.body(r.def), 1);
          }
        };
        scan(this.body(gen), 0);
      } catch {
        continue;
      }
      for (const name of listed) {
        const list = out.get(name) ?? [];
        list.push(t);
        out.set(name, list);
      }
    }
    return out;
  }

  /** Concrete subclasses of `root` declared in namespace `ns`. */
  protected concreteTypes(ns: string): TypeDefInfo[] {
    return this.m.types.filter((t) => t.ns === ns && !(t.flags & 0x80) && this.m.derivesFrom(t, this.root));
  }
}

/** The id the game uses for a model class name: ("CARD", "BladeDance") -> "CARD.BLADE_DANCE". */
export function modelId(prefix: string, className: string): string {
  return `${prefix}.${className.replace(/(?<=.)([A-Z])/g, "_$1").toUpperCase()}`;
}
