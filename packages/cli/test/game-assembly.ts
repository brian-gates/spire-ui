// A synthetic stand-in for the game's sts2.dll: the types the card reader looks up, by the same
// names, and a handful of invented cards whose members use each IL pattern the reader understands
// (and some it must refuse). No game code or data.
import { AsmBuilder, code, ET, type FieldSpec, il, type MethodSpecDef, methodVar, prim, type SigType, szarray, typeVar } from "./dotnet-fixtures";

const CORE = "MegaCrit.Sts2.Core";

export interface GameAssemblyOptions {
  /** Give CardModel's constructor a different signature (an "unsupported build"). */
  changedCardModelCtor?: boolean;
  /** Add a card that calls known methods through references declaring too few parameters. */
  arityTrap?: boolean;
}

export function buildGameAssembly(o: GameAssemblyOptions = {}): Buffer {
  const b = new AsmBuilder();
  const sys = (name: string) => b.typeRef("System", name);
  const object = sys("Object");
  const enumRef = sys("Enum");
  const decimalRef = sys("Decimal");
  const typeRef = sys("Type");
  const handle = sys("RuntimeTypeHandle");
  const fieldHandle = sys("RuntimeFieldHandle");
  const arrayRef = sys("Array");
  const memberInfo = b.typeRef("System.Reflection", "MemberInfo");
  const helpers = b.typeRef("System.Runtime.CompilerServices", "RuntimeHelpers");
  const func3 = sys("Func`3");
  const dict = b.typeRef("System.Collections.Generic", "Dictionary`2");
  const enumerable = b.typeRef("System.Collections.Generic", "IEnumerable`1");
  const dec = b.valueType(decimalRef);

  const decCtor = b.memberRef(decimalRef, ".ctor", { instance: true, params: [prim(ET.i4)] });
  const decCtor5 = b.memberRef(decimalRef, ".ctor", { instance: true, params: [prim(ET.i4), prim(ET.i4), prim(ET.i4), prim(ET.bool), prim(0x05)] });
  const decImplicit = b.memberRef(decimalRef, "op_Implicit", { params: [prim(ET.i4)], ret: dec });
  const decOne = b.fieldRef(decimalRef, "One", dec);
  const getTypeFromHandle = b.memberRef(typeRef, "GetTypeFromHandle", { params: [b.valueType(handle)], ret: b.classType(typeRef) });
  const getName = b.memberRef(memberInfo, "get_Name", { instance: true, ret: prim(ET.string) });
  const initArray = b.memberRef(helpers, "InitializeArray", { params: [b.classType(arrayRef), b.valueType(fieldHandle)] });

  // Enums.
  const enumType = (ns: string, name: string, members: [string, number][]) => {
    const t = b.typeDef(ns, name, {
      extends: enumRef,
      flags: 0x00000101,
      fields: [{ name: "value__", sig: prim(ET.i4), flags: 0x0606 }, ...members.map(([n, v]) => ({ name: n, sig: prim(ET.i4), flags: 0x8056, constant: v }))],
    });
    return t.token;
  };
  const cardType = enumType(`${CORE}.Entities.Cards`, "CardType", [["None", 0], ["Attack", 1], ["Skill", 2], ["Power", 3], ["Curse", 5]]);
  const rarity = enumType(`${CORE}.Entities.Cards`, "CardRarity", [["None", 0], ["Basic", 1], ["Common", 2], ["Uncommon", 3], ["Rare", 4], ["Curse", 7]]);
  const target = enumType(`${CORE}.Entities.Cards`, "TargetType", [["None", 0], ["Self", 1], ["AnyEnemy", 2], ["AllEnemies", 3]]);
  const keyword = enumType(`${CORE}.Entities.Cards`, "CardKeyword", [["None", 0], ["Fleeting", 1], ["Fragile", 2], ["Opening", 3], ["Kept", 4]]);
  const valueProp = enumType(`${CORE}.ValueProps`, "ValueProp", [["None", 0], ["Move", 1]]);

  const energyCost = b.typeDef(`${CORE}.Entities.Cards`, "CardEnergyCost", { extends: object, methods: [{ name: "UpgradeBy", params: [prim(ET.i4)], body: () => il.ret }] });

  // Vars.
  const VARS = `${CORE}.Localization.DynamicVars`;
  const dynamicVar = b.typeDef(VARS, "DynamicVar", {
    extends: object,
    methods: [
      { name: ".ctor", params: [prim(ET.string), dec], body: () => il.ret },
      { name: "UpgradeValueBy", params: [dec], body: () => il.ret },
    ],
  });
  const [dvCtor, upgradeValueBy] = dynamicVar.methods as [number, number];
  // A var whose constructor passes its default name to the base: ldarg.0; ldstr "Name"; ldarg.1; call base; ret.
  const namedVar = (name: string, valueType: SigType, extra: SigType[] = [], conv?: number) =>
    b.typeDef(VARS, `${name}Var`, {
      extends: dynamicVar.token,
      methods: [
        { name: ".ctor", params: [valueType, ...extra], body: () => code(il.ldarg0, il.ldstr(b.userString(name)), [0x03], conv ? il.call(conv) : [], il.call(dvCtor), il.ret) },
        { name: ".ctor", params: [prim(ET.string), valueType, ...extra], body: () => code(il.ldarg0, [0x03, 0x04], il.call(dvCtor), il.ret) },
      ],
    });
  const damageVar = namedVar("Damage", dec, [b.valueType(valueProp)]);
  const cardsVar = namedVar("Cards", prim(ET.i4), [], decImplicit);
  const ifUpgradedVar = namedVar("IfUpgraded", prim(ET.i4), [], decImplicit);
  const powerVar = b.typeDef(VARS, "PowerVar`1", {
    extends: dynamicVar.token,
    methods: [
      {
        name: ".ctor",
        params: [dec],
        body: () => code(il.ldarg0, il.ldtoken(b.typeSpec(typeVar(0))), il.call(getTypeFromHandle), il.callvirt(getName), [0x03], il.call(dvCtor), il.ret),
      },
    ],
  });
  const calculatedVar = b.typeDef(VARS, "CalculatedVar", {
    extends: dynamicVar.token,
    methods: [
      { name: ".ctor", params: [prim(ET.string)], body: () => code(il.ldarg0, [0x03], il.ldsfld(decOne), il.call(dvCtor), il.ret) },
      { name: "WithMultiplier", params: [b.genericInst(func3, [prim(ET.object), prim(ET.object), dec])], ret: prim(ET.object), body: () => code(il.ldarg0, il.ret) },
    ],
  });
  const calculatedDamageVar = b.typeDef(VARS, "CalculatedDamageVar", {
    extends: calculatedVar.token,
    methods: [{ name: ".ctor", params: [b.valueType(valueProp)], body: () => code(il.ldarg0, il.ldstr(b.userString("CalculatedDamage")), il.call(calculatedVar.methods[0]!), il.ret) }],
  });
  const dictSpec = b.typeSpec(b.genericInst(dict, [prim(ET.string), b.classType(dynamicVar.token)]));
  const dictGetItem = b.memberRef(dictSpec, "get_Item", { instance: true, params: [typeVar(0)], ret: typeVar(1) });
  const dynamicVarSet = b.typeDef(VARS, "DynamicVarSet", {
    extends: object,
    fields: [{ name: "_vars", sig: b.classType(dictSpec), flags: 0x0001 }],
    methods: [
      { name: "get_Item", params: [prim(ET.string)], ret: b.classType(dynamicVar.token), body: () => code(il.ldarg0, il.ret) },
      {
        name: "get_Damage",
        ret: b.classType(damageVar.token),
        body: () => code(il.ldarg0, il.ldfld(dynamicVarSet.fields[0]!), il.ldstr(b.userString("Damage")), il.callvirt(dictGetItem), il.castclass(damageVar.token), il.ret),
      },
    ],
  });
  const [setGetItem, setGetDamage] = dynamicVarSet.methods as [number, number];
  // Compiler-generated collections.
  const single = b.typeDef("", "<>z__ReadOnlySingleElementList`1", { extends: object, methods: [{ name: ".ctor", params: [typeVar(0)], body: () => il.ret }] });
  const readOnlyArray = b.typeDef("", "<>z__ReadOnlyArray`1", { extends: object, methods: [{ name: ".ctor", params: [szarray(typeVar(0))], body: () => il.ret }] });
  const listOf = (owner: number, elem: SigType, array: boolean) => b.memberRef(b.typeSpec(b.genericInst(owner, [elem])), ".ctor", { instance: true, params: [array ? szarray(typeVar(0)) : typeVar(0)] });
  const varT = b.classType(dynamicVar.token);
  const singleVar = listOf(single.token, varT, false);
  const arrayVar = listOf(readOnlyArray.token, varT, true);
  const singleKeyword = listOf(single.token, b.valueType(keyword), false);
  const arrayKeyword = listOf(readOnlyArray.token, b.valueType(keyword), true);

  // Models.
  const MODELS = `${CORE}.Models`;
  const ctorParams = o.changedCardModelCtor
    ? [prim(ET.i4), b.valueType(cardType), b.valueType(rarity), b.valueType(target)]
    : [prim(ET.i4), b.valueType(cardType), b.valueType(rarity), b.valueType(target), prim(ET.bool)];
  const cardModel = b.typeDef(MODELS, "CardModel", {
    extends: object,
    flags: 0x00100081,
    methods: [
      { name: ".ctor", params: ctorParams, body: () => il.ret },
      { name: "get_HasEnergyCostX", ret: prim(ET.bool), body: () => code(il.ldc(0), il.ret) },
      { name: "get_CanonicalStarCost", ret: prim(ET.i4), body: () => code(il.ldc(-1), il.ret) },
      { name: "get_MaxUpgradeLevel", ret: prim(ET.i4), body: () => code(il.ldc(1), il.ret) },
      { name: "get_DynamicVars", ret: b.classType(dynamicVarSet.token), body: () => code(il.ldnull, il.ret) },
      { name: "get_EnergyCost", ret: b.classType(energyCost.token), body: () => code(il.ldnull, il.ret) },
      { name: "AddKeyword", params: [b.valueType(keyword)], body: () => il.ret },
      { name: "RemoveKeyword", params: [b.valueType(keyword)], body: () => il.ret },
      { name: "OnUpgrade", body: () => il.ret },
    ],
  });
  const [cmCtor, , , , getDynamicVars, getEnergyCost, addKeyword, removeKeyword] = cardModel.methods as [number, number, number, number, number, number, number, number];
  const cardPoolModel = b.typeDef(MODELS, "CardPoolModel", { extends: object, flags: 0x00100081, methods: [{ name: "get_Title", ret: prim(ET.string) }] });
  const modelDb = b.typeDef(MODELS, "ModelDb", {
    extends: object,
    methods: [
      { name: "Card", instance: false, genericParams: 1, ret: methodVar(0), body: () => code(il.ldnull, il.ret) },
      { name: "CardPool", instance: false, genericParams: 1, ret: methodVar(0), body: () => code(il.ldnull, il.ret) },
    ],
  });
  const [dbCard, dbCardPool] = modelDb.methods as [number, number];
  const strength = b.typeDef(`${MODELS}.Powers`, "MightPower", { extends: object });
  const powerVarStrength = b.memberRef(b.typeSpec(b.genericInst(powerVar.token, [b.classType(strength.token)])), ".ctor", { instance: true, params: [dec] });

  // Cards.
  const CARDS = `${MODELS}.Cards`;
  const ctorBody = (cost: number, type: number, rar: number, tgt: number) => () => code(il.ldarg0, il.ldc(cost), il.ldc(type), il.ldc(rar), il.ldc(tgt), il.ldc(1), il.call(cmCtor), il.ret);
  const card = (name: string, ctor: () => number[], methods: MethodSpecDef[] = [], fields: FieldSpec[] = []) =>
    b.typeDef(CARDS, name, { extends: cardModel.token, fields, methods: [{ name: ".ctor", body: ctor }, ...methods] });
  const getter = (name: string, body: () => number[], ret: SigType = prim(ET.i4)) => ({ name, ret, body });
  const vars = (body: () => number[]) => getter("get_CanonicalVars", body, b.genericInst(enumerable, [varT]));
  const keywords = (body: () => number[]) => getter("get_CanonicalKeywords", body, b.genericInst(enumerable, [b.valueType(keyword)]));
  const onUpgrade = (body: () => number[]) => ({ name: "OnUpgrade", body });
  const upgradeVar = (getVar: number[], delta: number[]) => code(il.ldarg0, il.call(getDynamicVars), getVar, delta, il.callvirt(upgradeValueBy));

  const strike = card("HammerTest", ctorBody(1, 1, 1, 2), [
    vars(() => code(il.ldc(6), il.newobj(decCtor), il.ldc(0), il.newobj(damageVar.methods[0]!), il.newobj(singleVar), il.ret)),
    onUpgrade(() => code(upgradeVar(il.callvirt(setGetDamage), code(il.ldc(3), il.newobj(decCtor))), il.ret)),
  ]);
  const blade = card("SparkTest", ctorBody(1, 2, 2, 1), [
    keywords(() => code(il.ldc(1), il.newobj(singleKeyword), il.ret)),
    vars(() => code(il.ldc(3), il.newobj(cardsVar.methods[0]!), il.newobj(singleVar), il.ret)),
    onUpgrade(() => code(upgradeVar(code(il.ldstr(b.userString("Cards")), il.callvirt(setGetItem)), il.ldsfld(decOne)), il.ret)),
  ]);
  const whirl = card(
    "SpinTest",
    ctorBody(0, 1, 3, 3),
    [
      getter("get_HasEnergyCostX", () => code(il.ldc(1), il.ret), prim(ET.bool)),
      vars(() =>
        code(
          il.ldc(3),
          il.newarr(dynamicVar.token),
          il.dup,
          il.ldc(0),
          il.ldc(5),
          il.call(decImplicit),
          il.ldc(0),
          il.newobj(damageVar.methods[0]!),
          il.stelemRef,
          il.dup,
          il.ldc(1),
          il.ldstr(b.userString("Ratio")),
          il.ldc(15),
          il.ldc(0),
          il.ldc(0),
          il.ldc(0),
          il.ldc(1),
          il.newobj(decCtor5),
          il.newobj(dvCtor),
          il.stelemRef,
          il.dup,
          il.ldc(2),
          il.ldc(1),
          il.newobj(ifUpgradedVar.methods[0]!),
          il.stelemRef,
          il.newobj(arrayVar),
          il.ret,
        ),
      ),
      keywords(() => code(il.ldc(2), il.newarr(keyword), il.dup, il.ldtoken(whirlData()), il.call(initArray), il.newobj(arrayKeyword), il.ret)),
      onUpgrade(() =>
        code(il.ldarg0, il.ldc(2), il.call(removeKeyword), il.ldarg0, il.ldc(4), il.call(addKeyword), upgradeVar(il.callvirt(setGetDamage), code(il.ldc(3), il.newobj(decCtor))), il.ret),
      ),
    ],
    [{ name: "<keywords>", sig: prim(ET.i4), flags: 0x0113, data: [3, 0, 0, 0, 2, 0, 0, 0] }],
  );
  const whirlData = () => whirl.fields[0]!;

  const otherPool = b.typeDef(`${MODELS}.CardPools`, "OtherCardPool", {
    extends: cardPoolModel.token,
    methods: [
      getter("get_Title", () => code(il.ldstr(b.userString("azure")), il.ret), prim(ET.string)),
      getter("get_CardFrameMaterialPath", () => code(il.ldstr(b.userString("frame_azure")), il.ret), prim(ET.string)),
    ],
  });
  const power = card("PowerTest", ctorBody(2, 3, 4, 1), [
    getter("get_CanonicalStarCost", () => code(il.ldc(3), il.ret)),
    getter("get_VisualCardPool", () => code(il.call(b.methodSpec(dbCardPool, [b.classType(otherPool.token)])), il.ret), b.classType(cardPoolModel.token)),
    vars(() => code(il.ldc(2), il.newobj(decCtor), il.newobj(powerVarStrength), il.newobj(singleVar), il.ret)),
    onUpgrade(() =>
      code(il.ldarg0, il.call(getEnergyCost), il.ldc(-1), il.callvirt(energyCost.methods[0]!), upgradeVar(code(il.ldstr(b.userString("MightPower")), il.callvirt(setGetItem)), il.ldsfld(decOne)), il.ret),
    ),
  ]);

  // A lambda in a compiler-generated nested class, cached in a static field.
  const calc = card("CalcTest", ctorBody(1, 1, 4, 2), [
    vars(() => {
      const [inst, cache] = calcLambda.fields as [number, number];
      return code(
        il.ldc(0),
        il.newobj(calculatedDamageVar.methods[0]!),
        il.ldsfld(cache),
        il.dup,
        il.brtrueS(23),
        il.pop,
        il.ldsfld(inst),
        il.ldftn(calcLambda.methods[0]!),
        il.newobj(funcCtor),
        il.dup,
        il.stsfld(cache),
        il.callvirt(calculatedVar.methods[1]!),
        il.newobj(singleVar),
        il.ret,
      );
    }),
  ]);
  const calcLambda = b.typeDef("", "<>c", {
    extends: object,
    nestedIn: calc.token,
    fields: [
      { name: "<>9", sig: prim(ET.object), flags: 0x0016 },
      { name: "<>9__0_0", sig: prim(ET.object), flags: 0x0016 },
    ],
    methods: [{ name: "<get_CanonicalVars>b__0_0", params: [prim(ET.object), prim(ET.object)], ret: dec, body: () => code(il.ldsfld(decOne), il.ret) }],
  });
  const funcCtor = b.memberRef(b.typeSpec(b.genericInst(func3, [prim(ET.object), prim(ET.object), dec])), ".ctor", { instance: true, params: [prim(ET.object), prim(0x18)] });

  // A var whose value is instance state.
  const scythe = card(
    "GrowthTest",
    ctorBody(1, 1, 4, 2),
    [
      getter("get_CurrentDamage", () => code(il.ldarg0, il.ldfld(scytheField()), il.ret)),
      vars(() => code(il.ldarg0, il.call(scythe.methods[1]!), il.call(decImplicit), il.ldc(0), il.newobj(damageVar.methods[0]!), il.newobj(singleVar), il.ret)),
      onUpgrade(() => code(upgradeVar(il.callvirt(setGetDamage), il.ldsfld(decOne)), il.ret)),
    ],
    [{ name: "_damage", sig: prim(ET.i4), flags: 0x0001 }],
  );
  const scytheField = () => scythe.fields[0]!;

  // Patterns the reader must refuse rather than guess.
  const odd = card("OddTest", ctorBody(1, 2, 2, 1), [
    getter("get_TargetType", () => code(il.ldarg0, il.brfalseS(2), il.ldc(1), il.ret, il.ldc(2), il.ret)),
    keywords(() => code(il.ldc(99), il.newobj(singleKeyword), il.ret)),
    vars(() => code(il.ldloc0, il.newobj(singleVar), il.ret)),
    onUpgrade(() => code(il.ldarg0, il.brfalseS(0), il.ret)),
  ]);
  const badCtor = card("BadCtorTest", () => code(il.ldarg0, il.ldarg0, il.call(getEnergyCost), il.pop, il.ldc(1), il.ldc(1), il.ldc(1), il.ldc(1), il.call(cmCtor), il.ret));
  card("CurseTest", ctorBody(-1, 5, 7, 0), [getter("get_MaxUpgradeLevel", () => code(il.ldc(0), il.ret))]);
  if (o.arityTrap) {
    const noArgsInit = b.memberRef(helpers, "InitializeArray", {});
    const noArgsUpgrade = b.memberRef(dynamicVar.token, "UpgradeValueBy", { instance: false });
    const noArgsVar = b.memberRef(damageVar.token, ".ctor", { instance: true });
    card("TrapTest", ctorBody(1, 2, 2, 1), [
      keywords(() => code(il.call(noArgsInit), il.ldnull, il.ret)),
      vars(() => code(il.newobj(noArgsVar), il.newobj(singleVar), il.ret)),
      onUpgrade(() => code(il.call(noArgsUpgrade), il.ret)),
    ]);
  }

  b.typeDef(`${MODELS}.CardPools`, "TestCardPool", {
    extends: cardPoolModel.token,
    methods: [
      getter("get_Title", () => code(il.ldstr(b.userString("crimson")), il.ret), prim(ET.string)),
      getter("get_CardFrameMaterialPath", () => code(il.ldstr(b.userString("frame_crimson")), il.ret), prim(ET.string)),
      {
        name: "GenerateAllCards",
        ret: szarray(b.classType(cardModel.token)),
        body: () => {
          const listed = [strike, blade, whirl, power, calc, scythe, odd, badCtor];
          return code(
            il.ldc(listed.length),
            il.newarr(cardModel.token),
            ...listed.map((c, i) => code(il.dup, il.ldc(i), il.call(b.methodSpec(dbCard, [b.classType(c.token)])), il.stelemRef)),
            il.ret,
          );
        },
        fat: true,
      },
    ],
  });
  return b.build();
}
