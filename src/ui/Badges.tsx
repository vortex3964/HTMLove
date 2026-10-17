/**
 * Tiny shared badge/icon building blocks used across the gallery and the
 * detail playground.
 */
import { FileCode2, FileText } from "lucide-react";
import type { Component } from "../core/types";

export function KindBadge({ kind }: { kind: Component["kind"] }) {
  const label = kind === "tsx" ? "react" : kind;
  return <span className="badge accent">{label}</span>;
}

export function KindIcon({ kind }: { kind: Component["kind"] }) {
  return kind === "tsx" ? (
    <FileCode2 size={14} className="faint" />
  ) : (
    <FileText size={14} className="faint" />
  );
}
