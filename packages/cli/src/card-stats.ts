// Card stats read statically from the game's own code (sts2.dll), without running it.
//
// Every card is a class deriving from CardModel. Its numbers live in a few small, straight-line
// members that a tiny symbolic IL evaluator can follow:
//   .ctor()                     base(cost, CardType, CardRarity, TargetType, showInLibrary)
//   get_HasEnergyCostX, get_CanonicalStarCost, get_MaxUpgradeLevel, get_TargetType: constants
//   get_CanonicalKeywords       a collection of CardKeyword values
//   get_CanonicalVars           a collection of `new XxxVar(...)`: the numbers the text shows
//   OnUpgrade()                 DynamicVars.X.UpgradeValueBy(d), EnergyCost.UpgradeBy(n),
//                               AddKeyword(k), RemoveKeyword(k)
// Types and members are matched by full name, never by token. Anything that is not one of these
// patterns (a branch, an unknown call, a value computed at runtime) is not guessed at: the field is
// left out and named in the card's `unknown` list, or a var whose value only exists at runtime is
// marked `computed`.
import { renderCardText } from "./card-text";
import { decodeIl, type Instruction, methodCode } from "./dotnet/il";
import { DotnetError } from "./dotnet/metadata";
import { type MethodDefInfo, type MethodRef, type Model, shortName, type TypeDefInfo } from "./dotnet/model";
import type { CardStats } from "./manifest";

const NS = "MegaCrit.Sts2.Core";
const CARD_MODEL = `${NS}.Models.CardModel`;
const CARD_POOL_MODEL = `${NS}.Models.CardPoolModel`;
const CARDS_NS = `${NS}.Models.Cards`;
const MODEL_DB = `${NS}.Models.ModelDb`;
const VARS_NS = `${NS}.Localization.DynamicVars`;
const DYNAMIC_VAR = `${VARS_NS}.DynamicVar`;
const DYNAMIC_VAR_SET = `${VARS_NS}.DynamicVarSet`;
const ENUMS = {
  type: `${NS}.Entities.Cards.CardType`,
  rarity: `${NS}.Entities.Cards.CardRarity`,
  target: `${NS}.Entities.Cards.TargetType`,
  keyword: `${NS}.Entities.Cards.CardKeyword`,
} as const;
const CARD_CTOR_PARAMS = ["System.Int32", ENUMS.type, ENUMS.rarity, ENUMS.target, "System.Boolean"];
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

export interface CardVarFacts {
  base?: number;
  upgraded?: number;
  computed?: true;
}

/** What the game's code says about one card. Text is rendered later from localization. */
export interface CardFacts {
  /** Class name, e.g. "BladeDance". */
  className: string;
  cost: number | "X" | null;
  upgradedCost?: number;
  starCost?: number;
  type: string;
  rarity: string;
  target?: string;
  pool?: string;
  frame?: string;
  keywords?: string[];
  upgradedKeywords?: string[];
  vars: Record<string, CardVarFacts>;
  /** Whether the card can be upgraded (and OnUpgrade was understood). */
  upgradable: boolean;
  unknown: string[];
  /** Why each unknown field was not understood (for diagnostics; not written to the manifest). */
  reasons: string[];
}

// --- symbolic values -------------------------------------------------------------------------

type Val =
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

type Effect = { var: string; delta: number } | { cost: number } | { add: number } | { remove: number };

class Unknown extends Error {}

/** A card pool's title (e.g. "ironclad") and card frame name. */
interface PoolInfo {
  pool: string;
  frame?: string;
}

const ldcI4 = (ins: Instruction): number | undefined => {
  if (ins.op >= 0x15 && ins.op <= 0x1e) return ins.op - 0x16;
  if (ins.op === 0x1f || ins.op === 0x20) return ins.int;
  return undefined;
};
const isNum = (v: Val | undefined): v is { k: "int"; v: number } | { k: "dec"; v: number } => v?.k === "int" || v?.k === "dec";
const key = (r: MethodRef) => `${r.owner}::${r.name}`;
const sameParams = (r: MethodRef, names: string[]) => r.sig.params.length === names.length && r.sig.params.every((p, i) => p.name === names[i]);

class CardReader {
  private readonly enums: Record<keyof typeof ENUMS, Map<number, string>>;
  private readonly varNames = new Map<number, string | "<typeArg>">();
  private readonly setGetters = new Map<number, string>();
  private readonly bodies = new Map<number, Instruction[] | DotnetError>();

  constructor(private readonly m: Model) {
    const cardModel = m.type(CARD_MODEL);
    const ctor = cardModel && m.methodsOf(cardModel).find((x) => x.name === ".ctor" && x.sig.params.length === 5);
    if (!cardModel || !ctor || !CARD_CTOR_PARAMS.every((p, i) => ctor.sig.params[i]?.name === p)) {
      throw new UnsupportedBuildError("CardModel..ctor(int, CardType, CardRarity, TargetType, bool) not found");
    }
    const enums = {} as Record<keyof typeof ENUMS, Map<number, string>>;
    for (const [k, full] of Object.entries(ENUMS) as [keyof typeof ENUMS, string][]) {
      const t = m.type(full);
      if (!t) throw new UnsupportedBuildError(`${full} not found`);
      enums[k] = m.enumMembers(t);
    }
    this.enums = enums;
    if (!m.type(DYNAMIC_VAR) || !m.type(DYNAMIC_VAR_SET) || !m.type(CARD_POOL_MODEL)) throw new UnsupportedBuildError("DynamicVar, DynamicVarSet or CardPoolModel not found");
    for (const t of m.types) if (t.ns === VARS_NS) this.learnVarType(t);
  }

  private body(md: MethodDefInfo): Instruction[] {
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
            if (target && target.sig.params[0]?.name === "System.String") this.varNames.set(md.row, this.m.asm.userString(b[1].int! & 0xffffff));
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
            this.setGetters.set(md.row, this.m.asm.userString(b[2]!.int! & 0xffffff));
          }
        }
      } catch (e) {
        if (!(e instanceof Unknown) && !(e instanceof DotnetError)) throw e;
      }
    }
  }

  /** The parameterless, non-generic method `name` declared by `t` or its nearest base below `stop`. */
  private override(t: TypeDefInfo, name: string, stop = CARD_MODEL): MethodDefInfo | null {
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
  private evaluate(ins: Instruction[], depth = 0): { ret: Val | null; effects: Effect[] } {
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
          push({ k: "str", v: this.m.asm.userString(x.int! & 0xffffff) });
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
    const a = (i: number) => args[i]!;
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
    if (k === "System.Runtime.CompilerServices.RuntimeHelpers::InitializeArray") {
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
    if (COMPUTED_MODIFIERS.has(k)) {
      const v = a(0);
      if (v.k !== "var" || args.slice(1).some((x) => x.k !== "lambda")) throw new Unknown(`call ${k}`);
      return { ...v, computed: true };
    }
    if (k === `${MODEL_DB}::CardPool` && r.methodArgs.length === 1 && args.length === 0) return { k: "pool", type: r.methodArgs[0]!.name };
    if (op !== 0x73 && args.length === 1 && a(0).k === "this" && r.name.startsWith("get_")) {
      if (k === `${CARD_MODEL}::get_DynamicVars`) return { k: "varset" };
      if (k === `${CARD_MODEL}::get_EnergyCost`) return { k: "cost" };
      // A getter the card class itself adds reads instance state: a value that exists only at runtime.
      if (r.owner !== CARD_MODEL && r.def && this.m.derivesFrom(r.def.owner, CARD_MODEL)) return { k: "runtime" };
    }
    if (r.owner === DYNAMIC_VAR_SET && op === 0x6f) {
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

  private isInt32Enum(full: string): boolean {
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
      if (p !== DECIMAL && p !== "System.Int32" && p !== "System.Boolean") continue;
      const v = args[i]!;
      if (isNum(v)) base = p === "System.Boolean" ? (v.v ? 1 : 0) : v.v;
      else if (v.k === "runtime") runtime = true;
      else throw new Unknown(`${cls} value is not a constant`);
      break;
    }
    return { k: "var", name, cls, ...(base !== undefined ? { base } : {}), computed: runtime || cls.startsWith("Calculated") };
  }

  // --- per-card facts -------------------------------------------------------------------------

  private evalGetter(t: TypeDefInfo, name: string): { found: false } | { found: true; value: Val | null } {
    const md = this.override(t, name);
    if (!md) return { found: false };
    return { found: true, value: this.evaluate(this.body(md)).ret };
  }

  /** A getter that returns an int constant: its value, null when not overridden, undefined (noted) otherwise. */
  private constInt(t: TypeDefInfo, name: string, note: (field: string, e: unknown) => void, field: string): number | undefined | null {
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

  /** Pools: CardPoolModel subclasses, their title and frame, and the cards GenerateAllCards lists. */
  pools(): Map<string, PoolInfo[]> {
    const out = new Map<string, PoolInfo[]>();
    for (const t of this.poolTypes()) {
      const info = this.poolInfo(t);
      if (!info) continue;
      const gen = this.override(t, "GenerateAllCards", CARD_POOL_MODEL);
      if (!gen) continue;
      let ins: Instruction[];
      try {
        ins = this.body(gen);
      } catch (e) {
        if (e instanceof Unknown) continue;
        throw e;
      }
      for (const x of ins) {
        if (x.op !== 0x28) continue;
        const r = this.m.method(x.int!);
        if (key(r) !== `${MODEL_DB}::Card` || r.methodArgs.length !== 1) continue;
        const card = r.methodArgs[0]!.name;
        const list = out.get(card) ?? [];
        list.push(info);
        out.set(card, list);
      }
    }
    return out;
  }

  private poolTypes(): TypeDefInfo[] {
    return this.m.types.filter((t) => this.m.derivesFrom(t, CARD_POOL_MODEL));
  }

  private poolInfoCache = new Map<string, PoolInfo | null>();
  private poolInfo(t: TypeDefInfo): PoolInfo | null {
    if (this.poolInfoCache.has(t.fullName)) return this.poolInfoCache.get(t.fullName)!;
    const text = (name: string): string | undefined => {
      try {
        const r = this.evalGetter(t, name);
        if (r.found && r.value?.k === "str" && /^[a-z0-9_]{1,64}$/.test(r.value.v)) return r.value.v;
      } catch (e) {
        if (!(e instanceof Unknown) && !(e instanceof DotnetError)) throw e;
      }
      return undefined;
    };
    const pool = text("get_Title");
    const frame = text("get_CardFrameMaterialPath");
    const info = pool ? { pool, ...(frame ? { frame } : {}) } : null;
    this.poolInfoCache.set(t.fullName, info);
    return info;
  }

  /** Every concrete card class in the game, by class name. */
  cardTypes(): TypeDefInfo[] {
    return this.m.types.filter((t) => t.ns === CARDS_NS && !(t.flags & 0x80) && this.m.derivesFrom(t, CARD_MODEL));
  }

  /** Facts for one card class, or null if its constructor is not the recognised shape. */
  card(t: TypeDefInfo, pools: Map<string, PoolInfo[]>): CardFacts | null {
    const unknown: string[] = [];
    const reasons: string[] = [];
    const note = (field: string, e: unknown) => {
      if (!(e instanceof Unknown) && !(e instanceof DotnetError)) throw e;
      if (!unknown.includes(field)) unknown.push(field);
      reasons.push(`${field}: ${e.message}`);
    };
    // .ctor(): ... ldarg.0; ldc cost; ldc type; ldc rarity; ldc target; ldc show; call CardModel::.ctor(5 args); ret
    const ctor = this.m.methodsOf(t).find((x) => x.name === ".ctor" && x.sig.params.length === 0);
    if (!ctor) return null;
    let five: number[];
    try {
      const b = this.body(ctor);
      const at = b.findIndex((x) => x.op === 0x28 && (() => {
        const r = this.m.method(x.int!);
        return key(r) === `${CARD_MODEL}::.ctor` && sameParams(r, CARD_CTOR_PARAMS);
      })());
      if (at < 6 || b[at - 6]!.op !== 0x02 || b[at + 1]?.op !== 0x2a || b.slice(at + 1).length !== 1) return null;
      const vals = b.slice(at - 5, at).map(ldcI4);
      if (vals.some((v) => v === undefined)) return null;
      five = vals as number[];
    } catch (e) {
      if (e instanceof Unknown) return null;
      throw e;
    }
    const [cost, type, rarity, target] = five as [number, number, number, number];
    const typeName = this.enums.type.get(type);
    const rarityName = this.enums.rarity.get(rarity);
    let targetName = this.enums.target.get(target);
    if (!typeName || !rarityName) return null;

    const costX = this.constInt(t, "get_HasEnergyCostX", note, "cost");
    if (costX === undefined) return null; // cannot tell X from a number: no stats rather than a wrong cost
    const facts: CardFacts = {
      className: t.name,
      cost: costX ? "X" : cost < 0 ? null : cost,
      type: typeName,
      rarity: rarityName,
      vars: {},
      upgradable: false,
      unknown,
      reasons,
    };

    const targetOverride = this.constInt(t, "get_TargetType", note, "target");
    if (targetOverride === undefined) targetName = undefined;
    else if (targetOverride !== null) targetName = this.enums.target.get(targetOverride);
    if (targetName) facts.target = targetName;
    else note("target", new Unknown("not a TargetType member"));

    const star = this.constInt(t, "get_CanonicalStarCost", note, "starCost");
    if (typeof star === "number" && star >= 0) facts.starCost = star;

    // Pool: the pool that lists the card; event cards show another pool's frame (VisualCardPool).
    const inPools = pools.get(t.fullName) ?? [];
    const home = inPools.length === 1 ? inPools[0] : undefined;
    if (home) facts.pool = home.pool;
    else note("pool", new Unknown(`listed by ${inPools.length} pools`));
    let frame = home?.frame;
    try {
      const v = this.evalGetter(t, "get_VisualCardPool");
      if (v.found) {
        const pt = v.value?.k === "pool" ? this.m.type(v.value.type) : undefined;
        frame = pt ? this.poolInfo(pt)?.frame : undefined;
        if (!frame) throw new Unknown("VisualCardPool is not a known pool");
      }
    } catch (e) {
      frame = undefined;
      note("frame", e);
    }
    if (frame) facts.frame = frame;

    let keywords: number[] = [];
    try {
      const r = this.evalGetter(t, "get_CanonicalKeywords");
      if (r.found) {
        if (r.value?.k !== "list" || r.value.items.some((x) => x.k !== "int" || !this.enums.keyword.has(x.v))) throw new Unknown("not a list of CardKeyword constants");
        keywords = r.value.items.map((x) => (x as { v: number }).v);
        facts.keywords = keywords.map((v) => this.enums.keyword.get(v)!);
      }
    } catch (e) {
      note("keywords", e);
      keywords = [];
    }

    let varsKnown = true;
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
          facts.vars[v.name] = { ...(v.base !== undefined ? { base: v.base } : {}), ...(v.computed ? { computed: true as const } : {}) };
        }
      }
    } catch (e) {
      note("vars", e);
      facts.vars = {};
      varsKnown = false;
    }

    const maxUpgrade = this.constInt(t, "get_MaxUpgradeLevel", note, "upgrade");
    if (maxUpgrade !== 0 && maxUpgrade !== undefined) {
      try {
        const md = this.override(t, "OnUpgrade");
        const effects = md ? this.evaluate(this.body(md)).effects : [];
        const kw = new Set(keywords);
        let kwChanged = false;
        const upgraded = new Map<string, number>();
        let upgradedCost: number | undefined;
        for (const e of effects) {
          if ("var" in e) {
            const v = facts.vars[e.var];
            if (!v) throw new Unknown(varsKnown ? `upgrade of unknown var ${e.var}` : "vars unknown");
            if (v.base !== undefined) upgraded.set(e.var, Number(((upgraded.get(e.var) ?? v.base) + e.delta).toFixed(6)));
          } else if ("cost" in e) {
            if (typeof facts.cost !== "number") throw new Unknown("cost upgrade of a non-numeric cost");
            upgradedCost = Math.max(0, (upgradedCost ?? facts.cost) + e.cost);
          } else {
            const v = "add" in e ? e.add : e.remove;
            if (!this.enums.keyword.has(v)) throw new Unknown("not a CardKeyword member");
            if ("add" in e) kw.add(v);
            else kw.delete(v);
            kwChanged = true;
          }
        }
        // Only applied once the whole of OnUpgrade is understood.
        for (const [name, value] of upgraded) facts.vars[name]!.upgraded = value;
        if (upgradedCost !== undefined) facts.upgradedCost = upgradedCost;
        if (kwChanged) facts.upgradedKeywords = [...kw].map((v) => this.enums.keyword.get(v)!);
        facts.upgradable = true;
      } catch (e) {
        note("upgrade", e);
      }
    }
    return facts;
  }
}

/** Card id the game uses for a class name: "BladeDance" -> "CARD.BLADE_DANCE". */
export function cardId(className: string): string {
  return `CARD.${className.replace(/(?<=.)([A-Z])/g, "_$1").toUpperCase()}`;
}

/** Facts for every card class in the assembly, by card id. Throws UnsupportedBuildError or DotnetError. */
export function readCards(model: Model): Map<string, CardFacts> {
  const reader = new CardReader(model);
  const pools = reader.pools();
  const out = new Map<string, CardFacts>();
  for (const t of reader.cardTypes()) {
    let facts: CardFacts | null;
    try {
      facts = reader.card(t, pools);
    } catch (e) {
      // One malformed card class costs only that card its stats.
      if (e instanceof DotnetError || e instanceof Unknown) continue;
      throw e;
    }
    if (facts) out.set(cardId(t.name), facts);
  }
  return out;
}

/** The manifest's `card` object: the facts plus text rendered from the localization template. */
export function toCardStats(f: CardFacts, template: string | undefined): CardStats {
  const unknown = [...f.unknown];
  const vars = Object.keys(f.vars).length ? f.vars : undefined;
  const out: CardStats = {
    cost: f.cost,
    ...(f.upgradedCost !== undefined && f.upgradedCost !== f.cost ? { upgradedCost: f.upgradedCost } : {}),
    ...(f.starCost !== undefined ? { starCost: f.starCost } : {}),
    type: f.type,
    rarity: f.rarity,
    ...(f.target ? { target: f.target } : {}),
    ...(f.pool ? { pool: f.pool } : {}),
    ...(f.frame ? { frame: f.frame } : {}),
    ...(f.keywords?.length ? { keywords: f.keywords } : {}),
    ...(f.upgradedKeywords ? { upgradedKeywords: f.upgradedKeywords } : {}),
    ...(vars ? { vars } : {}),
  };
  if (template !== undefined) {
    const ctx = { vars: f.vars, type: f.type, ...(f.target ? { target: f.target } : {}) };
    const base = renderCardText(template, { ...ctx, upgraded: false });
    if (base.text) out.description = base.text;
    let unresolved = base.unresolved.length > 0;
    if (f.upgradable) {
      const up = renderCardText(template, { ...ctx, upgraded: true });
      if (up.text) out.upgradedDescription = up.text;
      unresolved ||= up.unresolved.length > 0;
    }
    if (unresolved) unknown.push("description");
  }
  if (unknown.length) out.unknown = [...new Set(unknown)];
  return out;
}
