import React from "react";

/** Dot colours identify a type; the type name is always printed beside it. */
export const TYPE_COLORS: Record<string, string> = {
  normal: "#9ca3af",
  fire: "#f0642f",
  water: "#3b82f6",
  electric: "#eab308",
  grass: "#22a05a",
  ice: "#38bdf8",
  fighting: "#c2410c",
  poison: "#a855f7",
  ground: "#b8892b",
  flying: "#6d8dea",
  psychic: "#ec4899",
  bug: "#84a516",
  rock: "#a39a7c",
  ghost: "#6b5fb5",
  dragon: "#4f46e5",
  fairy: "#f472b6",
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase().trim()] ?? "#9ca3af";
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium capitalize text-fg-muted">
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: typeColor(type) }} />
      {type}
    </span>
  );
}
