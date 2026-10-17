/**
 * stubs — when a component imports something that does not exist here,
 * htmlove generates a stand-in module instead of failing. Stubs are
 * deliberately visible: components render as dashed placeholder boxes
 * and every use is listed in the dependency report.
 */
import type { ImportName } from "./imports";

export const STUB_MARKER = "__htmloveStub";

function stubKind(name: string): "component" | "hook" | "fn" {
  if (/^[A-Z]/.test(name)) return "component";
  if (/^use[A-Z_]/.test(name)) return "hook";
  return "fn";
}

const CLASS_JOINERS = new Set(["cn", "cx", "classNames", "clsx"]);

/**
 * Build the source of a stub module that satisfies `names`.
 * Every export is function-shaped so calling or rendering it is safe.
 */
export function generateStubModule(label: string, names: ImportName[]): string {
  const lines: string[] = [];
  lines.push(`/* htmlove stub for "${label}" — the real module is not in this folder */`);
  lines.push(`import React from "react";`);
  lines.push(`export const ${STUB_MARKER} = ${JSON.stringify(label)};`);
  lines.push(`
const __hvStubStyle = {
  border: "2px dashed #c9cdfb", borderRadius: "8px", padding: "10px 14px",
  color: "#4f46e5", background: "#eef0ff",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px",
  display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "4px",
  maxWidth: "100%", boxSizing: "border-box",
};
const __hvComponent = (name) => {
  const C = function (props) {
    const children = props && props.children;
    return React.createElement("div", { style: __hvStubStyle, "data-htmlove-stub": name },
      React.createElement("span", null, "[" + name + " stub]"),
      children ? React.createElement("span", { style: { opacity: 0.7 } }, children) : null);
  };
  C.displayName = name + " [htmlove stub]";
  return C;
};
const __hvHook = (name) => function () {
  if (typeof console !== "undefined") console.warn("[htmlove] stub hook called:", name);
  return undefined;
};
const __hvFn = (name) => function () {
  if (typeof console !== "undefined") console.warn("[htmlove] stub function called:", name);
  return undefined;
};
const __hvJoinClasses = (...args) =>
  args.flat(Infinity).filter((v) => typeof v === "string" && v.trim() !== "").join(" ");
`);
  if (names.length === 0) {
    lines.push(`export default __hvComponent(${JSON.stringify(label)});`);
  } else {
    for (const name of names) {
      const target = JSON.stringify(name.imported);
      /* namespace (`* as NS`) and default bindings are satisfied by the
         default export / namespace object below — nothing to emit. */
      if (name.kind === "namespace" || name.kind === "default") continue;
      if (CLASS_JOINERS.has(name.imported)) {
        lines.push(`export const ${name.imported} = __hvJoinClasses;`);
        continue;
      }
      switch (stubKind(name.imported)) {
        case "component":
          lines.push(`export const ${name.imported} = __hvComponent(${target});`);
          break;
        case "hook":
          lines.push(`export const ${name.imported} = __hvHook(${target});`);
          break;
        default:
          lines.push(`export const ${name.imported} = __hvFn(${target});`);
      }
    }
    lines.push(`export default __hvComponent(${JSON.stringify(label)});`);
  }
  return lines.join("\n");
}

/** Placeholder for an imported image/font that htmlove cannot read. */
export function generateAssetStub(path: string): string {
  const name = path.split("/").pop() ?? path;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="90">` +
    `<rect width="140" height="90" fill="#eef0ff" stroke="#c9cdfb" stroke-dasharray="6 4"/>` +
    `<text x="70" y="49" font-family="monospace" font-size="10" fill="#4f46e5" text-anchor="middle">${name}</text>` +
    `</svg>`;
  return (
    `/* htmlove asset placeholder for ${path} */\n` +
    `export default "data:image/svg+xml," + encodeURIComponent(${JSON.stringify(svg)});\n`
  );
}
