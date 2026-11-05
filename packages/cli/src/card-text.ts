// Renders a card's localization template with its real numbers, as plain text.
//
// The game formats card text with SmartFormat. Its English card templates use this subset, all of
// which is supported (checked against every template in localization/eng/cards.json):
//   {Var}                         the value (a number, or an icon placeholder)
//   {Var:diff()} {Var:inverseDiff()}   the value (the game colours it when upgraded)
//   {Var:plural:one|many}         English plural; `{}` / `{:diff()}` inside means the value
//   {Var:energyIcons()} {energyPrefix:energyIcons(n)}  energy icons, as "N Energy"
//   {Var:starIcons()} {singleStarIcon}                 star icons, as "N Stars" / "Star"
//   {IfUpgraded:show:yes|no}      upgraded or not
//   {Var:cond:>1?a|b} {Var:cond:a|b}   comparisons / truthiness
//   {Var:choose(A|B|C):a|b|c|other}    match a string value
//   {Flag:a|b}                    implicit conditional on a boolean
// Templates nest. For `text`, markup tags ([gold]...[/gold] etc.) are removed and whitespace
// collapsed, as in the manifest's other descriptions; nothing is passed through as markup. `runs`
// is the same text as styled runs, line breaks kept: the game's colour tags (gold, blue, purple)
// and the numbers it colours (diff/inverseDiff values), marked "upgraded" when the upgrade changed
// the value.

import { stripMarkup } from "./godot";

export interface TextVar {
  base?: number;
  upgraded?: number;
  computed?: boolean;
}

export interface TextContext {
  vars: Readonly<Record<string, TextVar>>;
  /** Render the upgraded card's text. */
  upgraded: boolean;
  /** CardType / TargetType enum names, for `choose` on them. */
  type?: string;
  target?: string;
}

/** A run of card text: plain, a number the game colours, or one of its colour tags. */
export interface TextRun {
  text: string;
  style?: "number" | "upgraded" | "gold" | "blue" | "purple";
}

export interface RenderedText {
  text: string;
  runs: TextRun[];
  /** Placeholders that could not be resolved (rendered as "X" or a default branch). */
  unresolved: string[];
}

const MAX_TEMPLATE = 8192;
const MAX_DEPTH = 16;
const MAX_OUTPUT = 16384;
const FORMATTERS = new Set(["diff", "inverseDiff", "plural", "energyIcons", "starIcons", "show", "cond", "choose"]);
/** Context flags that are false outside combat (the card library / a deck view). */
const OUT_OF_COMBAT = new Set(["InCombat", "IsTargeting"]);

type Value = number | boolean | string | { icon: "star" } | { energy: true } | null;

class TemplateError extends Error {}

/** Index of the `}` closing the `{` at `open`, or -1. */
function closing(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Splits on `|` outside nested braces. */
function splitOptions(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "|" && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(2)));
}

// Style markers in the rendered string, turned into runs at the end: OPEN + style code ... CLOSE.
const OPEN = "\u0001";
const CLOSE = "\u0002";
const STYLE_CODES: Record<string, NonNullable<TextRun["style"]>> = { n: "number", u: "upgraded", g: "gold", b: "blue", p: "purple" };
const TAG_CODES: Record<string, string> = { gold: "g", blue: "b", purple: "p" };

/** Splits a marked string into runs, innermost style winning; unbalanced markers are ignored. */
function toRuns(marked: string): TextRun[] {
  const runs: TextRun[] = [];
  const stack: string[] = [];
  let buf = "";
  const flush = () => {
    if (!buf) return;
    const style = stack.length ? STYLE_CODES[stack[stack.length - 1]!] : undefined;
    const last = runs[runs.length - 1];
    if (last && last.style === style) last.text += buf;
    else runs.push(style ? { text: buf, style } : { text: buf });
    buf = "";
  };
  for (let i = 0; i < marked.length; i++) {
    const c = marked[i]!;
    if (c === OPEN) {
      flush();
      const code = marked[++i];
      if (code !== undefined) stack.push(code);
    } else if (c === CLOSE) {
      flush();
      stack.pop();
    } else buf += c;
  }
  flush();
  return runs;
}

const truthy = (v: Value) => (typeof v === "number" ? v !== 0 : typeof v === "boolean" ? v : typeof v === "string" ? v.length > 0 : v !== null);

export function renderCardText(template: string, ctx: TextContext): RenderedText {
  const unresolved = new Set<string>();
  let out: string;
  try {
    if (template.length > MAX_TEMPLATE) throw new TemplateError("template too long");
    // Marker characters in the template itself would be read as styles; drop them first.
    out = render(template.replace(/[\u0001\u0002]/g, ""), ctx, null, 0, unresolved);
  } catch (e) {
    if (!(e instanceof TemplateError)) throw e;
    return { text: "", runs: [], unresolved: ["<template>"] };
  }
  const tagged = out.replace(/\[(\/?)(gold|blue|purple)\]/g, (_, close: string, tag: string) => (close ? CLOSE : OPEN + TAG_CODES[tag]));
  const marked = stripMarkup(tagged)
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n[\s]*/g, "\n")
    .trim();
  const text = marked.replace(/\u0001./g, "").replaceAll(CLOSE, "").replace(/\s+/g, " ").trim();
  return { text, runs: toRuns(marked), unresolved: [...unresolved] };
}

function lookup(name: string, ctx: TextContext, current: Value, unresolved: Set<string>): Value {
  if (name === "") return current;
  if (name === "IfUpgraded") return ctx.upgraded;
  if (OUT_OF_COMBAT.has(name)) return false;
  if (name === "singleStarIcon") return { icon: "star" };
  if (name === "energyPrefix") return { energy: true };
  if (name === "CardType" && ctx.type) return ctx.type;
  if (name === "TargetType" && ctx.target) return ctx.target;
  const v = Object.hasOwn(ctx.vars, name) ? ctx.vars[name] : undefined;
  if (v) {
    const n = ctx.upgraded ? (v.upgraded ?? v.base) : v.base;
    if (n !== undefined) return n;
    if (!v.computed) unresolved.add(name);
    return null;
  }
  unresolved.add(name);
  return null;
}

function render(s: string, ctx: TextContext, current: Value, depth: number, unresolved: Set<string>): string {
  if (depth > MAX_DEPTH) throw new TemplateError("template nests too deeply");
  let out = "";
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("{", i);
    if (open < 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, open);
    const close = closing(s, open);
    if (close < 0) throw new TemplateError("unbalanced braces");
    out += placeholder(s.slice(open + 1, close), out, ctx, current, depth, unresolved);
    if (out.length > MAX_OUTPUT) throw new TemplateError("output too long");
    i = close + 1;
  }
  return out;
}

function placeholder(body: string, before: string, ctx: TextContext, current: Value, depth: number, unresolved: Set<string>): string {
  const colon = body.indexOf(":");
  const selector = colon < 0 ? body : body.slice(0, colon);
  if (!/^[A-Za-z0-9_]*$/.test(selector)) throw new TemplateError(`bad selector ${selector}`);
  const value = lookup(selector, ctx, current, unresolved);
  const rest = colon < 0 ? null : body.slice(colon + 1);
  const sub = (option: string | undefined, v: Value) => (option === undefined ? "" : render(option, ctx, v, depth + 1, unresolved));
  const afterDigit = /\d\u0002*$/.test(before);

  let name: string | null = null;
  let args: string | null = null;
  let format: string | null = rest;
  const m = rest === null ? null : /^([A-Za-z]+)(?:\(([^()]*)\))?(?::|$)/.exec(rest);
  if (m && FORMATTERS.has(m[1]!)) {
    name = m[1]!;
    args = m[2] ?? null;
    format = m[0].endsWith(":") ? rest!.slice(m[0].length) : null;
  }

  const numberText = (v: Value): string => {
    if (typeof v === "number") return formatNumber(v);
    if (v === null) return "X";
    if (typeof v === "object" && "icon" in v) return `${afterDigit ? " " : ""}Star`;
    if (typeof v === "object") return `${afterDigit ? " " : ""}Energy`;
    return String(v);
  };

  switch (name) {
    case null:
      if (format === null) return numberText(value);
      {
        // Implicit conditional: first option when true.
        const opts = splitOptions(format);
        if (value === null) return sub(opts[1], value);
        return sub(truthy(value) ? opts[0] : opts[1], value);
      }
    case "diff":
    case "inverseDiff": {
      const v = Object.hasOwn(ctx.vars, selector) ? ctx.vars[selector] : undefined;
      const changed = ctx.upgraded && v?.upgraded !== undefined && v.base !== undefined && v.upgraded !== v.base;
      return `${OPEN}${changed ? "u" : "n"}${numberText(value)}${CLOSE}`;
    }
    case "energyIcons": {
      const fixed = args !== null && args !== "" ? Number(args) : null;
      if (fixed !== null && !(Number.isInteger(fixed) && fixed >= 0 && fixed < 100)) throw new TemplateError("bad energyIcons count");
      const count = fixed ?? (typeof value === "number" ? value : null);
      const lead = afterDigit ? " " : "";
      if (fixed === 1) return `${lead}Energy`;
      return `${lead}${count === null ? "X" : formatNumber(count)} Energy`;
    }
    case "starIcons": {
      const n = typeof value === "number" ? value : null;
      return `${afterDigit ? " " : ""}${n === null ? "X" : formatNumber(n)} ${n === 1 ? "Star" : "Stars"}`;
    }
    case "plural": {
      const opts = splitOptions(format ?? "");
      return sub(value === 1 ? opts[0] : (opts[1] ?? opts[0]), value);
    }
    case "show": {
      const opts = splitOptions(format ?? "");
      return sub(value !== null && truthy(value) ? opts[0] : opts[1], value);
    }
    case "cond": {
      const opts = splitOptions(format ?? "");
      for (const o of opts) {
        const c = /^(>=|<=|!=|==|=|>|<)(-?\d+(?:\.\d+)?)\?/.exec(o);
        if (!c) {
          // An option without a comparison: truthiness (two options) or the default.
          if (opts.every((x) => !/^(>=|<=|!=|==|=|>|<)/.test(x))) return sub(value !== null && truthy(value) ? opts[0] : opts[1], value);
          return sub(o, value);
        }
        if (typeof value !== "number") continue;
        const n = Number(c[2]);
        const op = c[1];
        const hit = op === ">" ? value > n : op === "<" ? value < n : op === ">=" ? value >= n : op === "<=" ? value <= n : op === "!=" ? value !== n : value === n;
        if (hit) return sub(o.slice(c[0].length), value);
      }
      return "";
    }
    case "choose": {
      const choices = (args ?? "").split("|");
      const opts = splitOptions(format ?? "");
      const idx = value === null ? -1 : choices.indexOf(typeof value === "number" ? formatNumber(value) : String(value));
      return sub(idx >= 0 ? opts[idx] : opts[choices.length], value);
    }
  }
  throw new TemplateError(`unhandled formatter ${name}`);
}
