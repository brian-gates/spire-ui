// Relic and potion stats read statically from the game's own code (sts2.dll), without running it.
//
// Every relic is a class deriving from RelicModel, every potion one deriving from PotionModel:
//   get_Rarity          a RelicRarity / PotionRarity constant
//   get_CanonicalVars   a collection of `new XxxVar(...)`: the numbers the description shows
// and the pools that list them are RelicPoolModel / PotionPoolModel subclasses whose
// GenerateAllRelics / GenerateAllPotions call ModelDb.Relic<T>() / ModelDb.Potion<T>(). The same
// symbolic evaluator as card stats (model-reader.ts) reads them: anything outside its patterns is
// left out and named in `unknown`, never guessed.
import { renderCardText } from "./card-text";
import type { Model, TypeDefInfo } from "./dotnet/model";
import type { ItemStats } from "./manifest";
import { ModelReader, modelId, NS, noter, Unknown, UnsupportedBuildError, type VarFacts } from "./model-reader";

export type ItemKind = "relic" | "potion";

interface KindSpec {
  prefix: string;
  root: string;
  ns: string;
  rarity: string;
  poolBase: string;
  generator: string;
  dbMethod: string;
  /** Pool class name suffix: "IroncladRelicPool" is pool "ironclad". */
  poolSuffix: string;
}

const KINDS: Record<ItemKind, KindSpec> = {
  relic: {
    prefix: "RELIC",
    root: `${NS}.Models.RelicModel`,
    ns: `${NS}.Models.Relics`,
    rarity: `${NS}.Entities.Relics.RelicRarity`,
    poolBase: `${NS}.Models.RelicPoolModel`,
    generator: "GenerateAllRelics",
    dbMethod: "Relic",
    poolSuffix: "RelicPool",
  },
  potion: {
    prefix: "POTION",
    root: `${NS}.Models.PotionModel`,
    ns: `${NS}.Models.Potions`,
    rarity: `${NS}.Entities.Potions.PotionRarity`,
    poolBase: `${NS}.Models.PotionPoolModel`,
    generator: "GenerateAllPotions",
    dbMethod: "Potion",
    poolSuffix: "PotionPool",
  },
};

/** What the game's code says about one relic or potion. Text is rendered later from localization. */
export interface ItemFacts {
  className: string;
  rarity?: string;
  pool?: string;
  vars: Record<string, VarFacts>;
  unknown: string[];
  /** Why each unknown field was not understood (for diagnostics; not written to the manifest). */
  reasons: string[];
}

class ItemReader extends ModelReader {
  private readonly rarities: Map<number, string>;

  constructor(
    m: Model,
    private readonly spec: KindSpec,
  ) {
    super(m, spec.root);
    this.rarities = this.enumOf(spec.rarity);
    if (!m.type(spec.poolBase)) throw new UnsupportedBuildError(`${spec.poolBase} not found`);
  }

  /** Pool name per listed class: the pool class name without its suffix, lower case. */
  pools(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const [cls, types] of this.listedBy(this.spec.poolBase, this.spec.generator, this.spec.dbMethod)) {
      out.set(
        cls,
        types.map((t) => (t.name.endsWith(this.spec.poolSuffix) && t.name.length > this.spec.poolSuffix.length ? t.name.slice(0, -this.spec.poolSuffix.length) : t.name).toLowerCase()),
      );
    }
    return out;
  }

  types(): TypeDefInfo[] {
    return this.concreteTypes(this.spec.ns);
  }

  item(t: TypeDefInfo, pools: Map<string, string[]>): ItemFacts {
    const unknown: string[] = [];
    const reasons: string[] = [];
    const note = noter(unknown, reasons);
    const facts: ItemFacts = { className: t.name, vars: Object.create(null) as Record<string, VarFacts>, unknown, reasons };

    const rarity = this.constInt(t, "get_Rarity", note, "rarity");
    if (typeof rarity === "number" && this.rarities.has(rarity)) facts.rarity = this.rarities.get(rarity)!;
    else if (rarity !== undefined) note("rarity", new Unknown(rarity === null ? "get_Rarity not overridden" : "not a rarity member"));

    const listed = [...new Set(pools.get(t.fullName) ?? [])];
    if (listed.length === 1) facts.pool = listed[0]!;
    else note("pool", new Unknown(`listed by ${listed.length} pools`));

    facts.vars = this.canonicalVars(t, note).vars;
    return facts;
  }
}

/** Facts for every relic or potion class in the assembly, by id. Throws UnsupportedBuildError or DotnetError. */
export function readItems(model: Model, kind: ItemKind): Map<string, ItemFacts> {
  const spec = KINDS[kind];
  const reader = new ItemReader(model, spec);
  const pools = reader.pools();
  const out = new Map<string, ItemFacts>();
  for (const t of reader.types()) {
    try {
      out.set(modelId(spec.prefix, t.name), reader.item(t, pools));
    } catch {
      // One malformed class (whatever the failure) costs only that item its stats.
    }
  }
  return out;
}

/** The manifest's `relic` / `potion` object: the facts plus text rendered from the localization template. */
export function toItemStats(f: ItemFacts, template: string | undefined): ItemStats {
  const unknown = [...f.unknown];
  const out: ItemStats = { ...(f.rarity ? { rarity: f.rarity } : {}), ...(f.pool ? { pool: f.pool } : {}) };
  if (template !== undefined) {
    const r = renderCardText(template, { vars: f.vars, upgraded: false });
    if (r.text) {
      out.description = r.text;
      out.descriptionRuns = r.runs;
    }
    if (r.unresolved.length) unknown.push("description");
  } else unknown.push("description");
  if (unknown.length) out.unknown = [...new Set(unknown)];
  return out;
}
