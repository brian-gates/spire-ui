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
import type { Model, TypeDefInfo } from "./dotnet/model";
import type { CardStats } from "./manifest";
import { CARD_MODEL, ldcI4, key, ModelReader, modelId, NS, noter, sameParams, Unknown, UnsupportedBuildError, type VarFacts } from "./model-reader";

export { UnsupportedBuildError };

const CARD_POOL_MODEL = `${NS}.Models.CardPoolModel`;
const CARDS_NS = `${NS}.Models.Cards`;
const ENUMS = {
  type: `${NS}.Entities.Cards.CardType`,
  rarity: `${NS}.Entities.Cards.CardRarity`,
  target: `${NS}.Entities.Cards.TargetType`,
  keyword: `${NS}.Entities.Cards.CardKeyword`,
} as const;
const CARD_CTOR_PARAMS = ["System.Int32", ENUMS.type, ENUMS.rarity, ENUMS.target, "System.Boolean"];

export type CardVarFacts = VarFacts;

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

/** A card pool's title (e.g. "ironclad") and card frame name. */
interface PoolInfo {
  pool: string;
  frame?: string;
}

class CardReader extends ModelReader {
  private readonly enums: Record<keyof typeof ENUMS, Map<number, string>>;

  constructor(m: Model) {
    const cardModel = m.type(CARD_MODEL);
    const ctor = cardModel && m.methodsOf(cardModel).find((x) => x.name === ".ctor" && x.sig.params.length === 5);
    if (!cardModel || !ctor || !CARD_CTOR_PARAMS.every((p, i) => ctor.sig.params[i]?.name === p)) {
      throw new UnsupportedBuildError("CardModel..ctor(int, CardType, CardRarity, TargetType, bool) not found");
    }
    super(m, CARD_MODEL);
    const enums = {} as Record<keyof typeof ENUMS, Map<number, string>>;
    for (const [k, full] of Object.entries(ENUMS) as [keyof typeof ENUMS, string][]) enums[k] = this.enumOf(full);
    this.enums = enums;
    if (!m.type(CARD_POOL_MODEL)) throw new UnsupportedBuildError("CardPoolModel not found");
  }

  /** Pools: CardPoolModel subclasses, their title and frame, and the cards GenerateAllCards lists. */
  pools(): Map<string, PoolInfo[]> {
    const out = new Map<string, PoolInfo[]>();
    for (const [card, types] of this.listedBy(CARD_POOL_MODEL, "GenerateAllCards", "Card")) {
      // A pool without a readable title is left out; its cards' pool becomes unknown.
      const infos = types.map((t) => this.poolInfo(t)).filter((p): p is PoolInfo => p !== null);
      if (infos.length) out.set(card, infos);
    }
    return out;
  }

  private poolInfoCache = new Map<string, PoolInfo | null>();
  private poolInfo(t: TypeDefInfo): PoolInfo | null {
    if (this.poolInfoCache.has(t.fullName)) return this.poolInfoCache.get(t.fullName)!;
    const text = (name: string): string | undefined => {
      try {
        const r = this.evalGetter(t, name);
        if (r.found && r.value?.k === "str" && /^[a-z0-9_]{1,64}$/.test(r.value.v)) return r.value.v;
      } catch {
        // Unreadable: no title or frame.
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
    return this.concreteTypes(CARDS_NS);
  }

  /** Facts for one card class, or null if its constructor is not the recognised shape. */
  card(t: TypeDefInfo, pools: Map<string, PoolInfo[]>): CardFacts | null {
    const unknown: string[] = [];
    const reasons: string[] = [];
    // Any failure reading a field (even an unexpected one) costs only that field.
    const note = noter(unknown, reasons);
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
    } catch {
      return null;
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
      vars: Object.create(null) as Record<string, CardVarFacts>,
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

    const canonical = this.canonicalVars(t, note);
    facts.vars = canonical.vars;
    const varsKnown = canonical.known;

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
            upgradedCost = (upgradedCost ?? facts.cost) + e.cost;
            if (upgradedCost < 0) throw new Unknown("upgraded cost below zero");
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
  return modelId("CARD", className);
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
    } catch {
      // One malformed card class (whatever the failure) costs only that card its stats.
      continue;
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
    if (base.text) {
      out.description = base.text;
      out.descriptionRuns = base.runs;
    }
    let unresolved = base.unresolved.length > 0;
    if (f.upgradable) {
      const up = renderCardText(template, { ...ctx, upgraded: true });
      if (up.text) {
        out.upgradedDescription = up.text;
        out.upgradedDescriptionRuns = up.runs;
      }
      unresolved ||= up.unresolved.length > 0;
    }
    if (unresolved) unknown.push("description");
  }
  if (unknown.length) out.unknown = [...new Set(unknown)];
  return out;
}
