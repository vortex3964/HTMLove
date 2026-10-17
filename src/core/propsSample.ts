/**
 * propsSample — read the props type out of a component's own source and
 * write starter JSON for the props editor. Covers the shapes snippets
 * actually use: primitives, arrays of local interfaces, literal unions,
 * function props and generics. Optional fields are left alone so the
 * component's own defaults apply.
 */

export interface SampleProps {
  props: Record<string, unknown>;
  /** Required fields that could not be sampled from their type. */
  skipped: string[];
}

interface Field {
  name: string;
  optional: boolean;
  type: string;
}

interface Decl {
  name: string;
  generic: string[];
  fields: Field[];
}

interface Ctx {
  decls: Map<string, Decl>;
  generic: Set<string>;
  depth: number;
}

const MISS = Symbol("miss");

/* ---------- tiny source reader ---------- */

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Index just past a quoted string that starts at `from`. */
function skipString(source: string, from: number): number {
  const quote = source[from];
  let i = from + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i;
    i += 1;
  }
  return i;
}

/** Index of the bracket that closes the one at `from`. */
function matchBracket(source: string, from: number, open: string, close: string): number {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split on separators that sit outside quotes and brackets. */
function splitTopLevel(body: string, separators: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = skipString(body, i);
      current += body.slice(i, end + 1);
      i = end;
      continue;
    }
    if ("{[(".includes(ch)) depth += 1;
    if ("}])".includes(ch)) depth -= 1;
    if (depth === 0 && separators.includes(ch)) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseFields(body: string): Field[] {
  const fields: Field[] = [];
  for (const part of splitTopLevel(body, ";\n")) {
    const match = /^([A-Za-z_$][\w$]*)\s*(\?)?\s*:\s*([\s\S]+)$/.exec(part);
    if (!match) continue;
    fields.push({
      name: match[1],
      optional: match[2] === "?",
      type: match[3].replace(/\s+/g, " ").trim(),
    });
  }
  return fields;
}

/** Every object-shaped interface / type alias in the file. */
function collectDecls(source: string): Map<string, Decl> {
  const out = new Map<string, Decl>();
  const re = /\b(?:interface|type)\s+([A-Za-z_$][\w$]*)\s*(<[^<>]*>)?\s*=?\s*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const rest = source.slice(re.lastIndex);
    if (!rest.trimStart().startsWith("{")) continue;
    const braceAt = source.length - rest.trimStart().length;
    const end = matchBracket(source, braceAt, "{", "}");
    if (end < 0) continue;
    const generic = match[2]
      ? match[2]
          .replace(/[<>]/g, "")
          .split(",")
          .map((part) => part.trim().split(/[=\s]/)[0])
          .filter((part) => /^[A-Za-z_$][\w$]*$/.test(part))
      : [];
    out.set(match[1], {
      name: match[1],
      generic,
      fields: parseFields(source.slice(braceAt + 1, end)),
    });
  }
  return out;
}

/** The type that describes the default component's props. */
function pickPropsType(source: string, decls: Map<string, Decl>): Decl | null {
  const propsish = [...decls.values()].filter((decl) => /Props$/.test(decl.name));
  if (propsish.length === 1) return propsish[0];
  if (propsish.length > 1) {
    const at = source.indexOf("export default");
    const tail = source.slice(at >= 0 ? at : 0, (at >= 0 ? at : 0) + 500);
    const hit = propsish.find((decl) => tail.includes(decl.name));
    if (hit) return hit;
  }
  /* inline type on the default component: ({ label }: { label: string }) */
  const at = source.indexOf("export default");
  const open = source.indexOf("(", at >= 0 ? at : 0);
  if (open >= 0) {
    const close = matchBracket(source, open, "(", ")");
    if (close > open) {
      const params = source.slice(open + 1, close);
      const inline = /:\s*\{/.exec(params);
      if (inline) {
        const braceAt = open + 1 + inline.index + inline[0].length - 1;
        const end = matchBracket(source, braceAt, "{", "}");
        if (end > braceAt) {
          return { name: "props", generic: [], fields: parseFields(source.slice(braceAt + 1, end)) };
        }
      }
    }
  }
  return propsish[0] ?? null;
}

/* ---------- sampling ---------- */

function arrayElement(type: string): string | null {
  const wrapped = /^(?:Readonly)?Array<(.+)>$/.exec(type);
  if (wrapped) return wrapped[1];
  if (type.endsWith("[]")) return type.slice(0, -2);
  return null;
}

function sampleString(label: string, index: number): string {
  const n = index || 1;
  if (/(^|_)(src|image|img|photo|cover|thumb|poster|banner)/i.test(label)) {
    return `https://picsum.photos/seed/hv${n}/800/600`;
  }
  if (/(href|url|link)/i.test(label)) return "https://example.com";
  if (/(date|time)/i.test(label)) return "2026-01-01";
  if (/(^|_)(id|slug|key)/i.test(label)) return `item-${n}`;
  if (/(subtitle|description|desc|caption|summary)/i.test(label)) return `Sample subtitle ${n}`;
  if (/(title|name|label|heading)/i.test(label)) return `Item ${n}`;
  return "Sample text";
}

function sampleNumber(label: string, index: number): number {
  if (/(^|_)(id|order|index|count|number)/i.test(label)) return index || 1;
  if (/width/i.test(label)) return 600;
  if (/height/i.test(label)) return 400;
  return 1;
}

/** A list item for an unknown (generic) element type. */
function genericItem(index: number): Record<string, unknown> {
  return { id: index, title: `Item ${index}` };
}

/**
 * `label` is the field name the value belongs to (drives string and
 * number samples); `index` is the 1-based array slot, 0 for a scalar.
 */
function sampleFor(type: string, label: string, index: number, ctx: Ctx): unknown {
  let current = type.replace(/\s+/g, " ").trim();

  const union = splitTopLevel(current, "|");
  if (union.length > 1) {
    const meaningful = union
      .map((part) => part.trim())
      .filter((part) => part !== "undefined" && part !== "null" && part !== "void");
    if (meaningful.length === 0) return MISS;
    if (meaningful.every((part) => /^".*"$|^'.*'$/.test(part) || /^-?\d+(\.\d+)?$/.test(part))) {
      const first = meaningful[0];
      return /^-?\d/.test(first) ? Number(first) : first.slice(1, -1);
    }
    current = meaningful[0];
  }

  if (current.includes("=>")) {
    return "(item, index) => (item && (item.title || item.name || item.id)) || 'Item ' + (index + 1)";
  }

  const element = arrayElement(current);
  if (element !== null) {
    const inner = element.trim();
    const bare = inner.replace(/<.*>$/, "").trim();
    if (ctx.generic.has(bare)) {
      return Array.from({ length: 5 }, (_, i) => genericItem(i + 1));
    }
    if (inner === "string") return ["Sample 1", "Sample 2", "Sample 3"];
    if (inner === "number") return [1, 2, 3];
    if (inner === "boolean") return [true, false, true];
    return Array.from({ length: 5 }, (_, i) => {
      const value = sampleFor(inner, label, i + 1, ctx);
      return value === MISS ? null : value;
    });
  }

  if (current === "string") return sampleString(label, index);
  if (current === "number") return sampleNumber(label, index);
  if (current === "boolean") return true;
  if (/^(React\.)?(ReactNode|ReactElement)$|^JSX\.Element$/i.test(current)) return "Sample content";
  if (/^Date$/.test(current)) return "2026-01-01";

  if (current.startsWith("{")) {
    if (ctx.depth >= 3) return MISS;
    const out: Record<string, unknown> = {};
    for (const field of parseFields(current.slice(1, -1))) {
      if (field.optional) continue;
      const value = sampleFor(field.type, field.name, index, { ...ctx, depth: ctx.depth + 1 });
      if (value !== MISS) out[field.name] = value;
    }
    return out;
  }

  const name = current.replace(/<.*>$/, "").trim();
  if (ctx.generic.has(name)) return genericItem(index || 1);
  const decl = ctx.decls.get(name);
  if (decl && ctx.depth < 3) {
    const out: Record<string, unknown> = {};
    for (const field of decl.fields) {
      if (field.optional) continue;
      const value = sampleFor(field.type, field.name, index, { ...ctx, depth: ctx.depth + 1 });
      if (value !== MISS) out[field.name] = value;
    }
    return out;
  }

  return MISS;
}

/* ---------- entry point ---------- */

export function sampleProps(source: string): SampleProps {
  const clean = stripComments(source);
  const decls = collectDecls(clean);
  const chosen = pickPropsType(clean, decls);
  if (!chosen) return { props: {}, skipped: [] };

  const ctx: Ctx = {
    decls,
    generic: new Set(chosen.generic),
    depth: 0,
  };
  const props: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const field of chosen.fields) {
    if (field.optional) continue;
    const value = sampleFor(field.type, field.name, 0, ctx);
    if (value === MISS) {
      skipped.push(field.name);
      continue;
    }
    props[field.name] = value;
  }
  return { props, skipped };
}
