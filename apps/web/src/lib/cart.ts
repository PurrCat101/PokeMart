import type { CartItem } from "../types/api";

export type KycLevel = 0 | 1 | 2;

/** Stable identity of a bag line. Pokémon and item IDs live in different number spaces. */
export function lineKey(line: CartItem): string {
  return line.kind === "pokemon" ? `pokemon-${line.item.pokemon.id}` : `item-${line.item.id}`;
}

export function lineId(line: CartItem): number {
  return line.kind === "pokemon" ? line.item.pokemon.id : line.item.id;
}

export function lineName(line: CartItem): string {
  return line.kind === "pokemon" ? line.item.pokemon.name : line.item.name.replaceAll("-", " ");
}

export function lineUnitPrice(line: CartItem): number {
  return line.kind === "pokemon" ? line.item.listing.price : line.item.price;
}

export function lineStock(line: CartItem): number {
  return line.kind === "pokemon" ? line.item.listing.availableStock : line.item.stock;
}

export function lineSprite(line: CartItem): string | null {
  return (line.kind === "pokemon" ? line.item.pokemon.spriteUrl : line.item.spriteUrl) ?? null;
}

export function lineTotal(line: CartItem): number {
  return lineUnitPrice(line) * line.quantity;
}

export function lineRequiredKyc(line: CartItem): KycLevel {
  return line.kind === "item" ? line.item.requiredKycLevel : 0;
}

/** Highest quantity a single line may hold. */
export function lineMaxQuantity(line: CartItem): number {
  return Math.max(1, Math.min(lineStock(line), 99));
}

/**
 * Pokémon keep their original selectors (`cart-item-{pokemonId}`); item lines get an
 * `item-` infix so the two ID spaces can never collide.
 */
export function cartTestId(line: CartItem, part?: "quantity" | "remove" | "kyc"): string {
  const prefix = line.kind === "pokemon" ? "cart-item" : "cart-item-item";
  return part ? `${prefix}-${part}-${lineId(line)}` : `${prefix}-${lineId(line)}`;
}

/**
 * "blocked": the signed-in trainer's KYC level is known and too low.
 * "unknown": the listing needs KYC but the level could not be loaded (KYC service down).
 * The API stays the source of truth; this only warns early.
 */
export function kycIssue(line: CartItem, kycLevel: KycLevel | null): "blocked" | "unknown" | null {
  const required = lineRequiredKyc(line);
  if (required === 0) return null;
  if (kycLevel === null) return "unknown";
  return kycLevel < required ? "blocked" : null;
}

export const KYC_LEVEL_NAMES: Record<number, string> = { 0: "None", 1: "Basic", 2: "Full" };

/**
 * Reads whatever is in localStorage. Older carts have no `kind`; those lines are Pokémon.
 * Anything malformed is dropped rather than crashing the page.
 */
export function normalizeCart(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const lines: CartItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { kind, item, quantity } = entry as { kind?: string; item?: Record<string, unknown>; quantity?: unknown };
    if (!item || typeof quantity !== "number" || quantity < 1) continue;
    const isPokemon = kind === "pokemon" || (kind === undefined && "pokemon" in item);
    const isItem = kind === "item" || (kind === undefined && !("pokemon" in item) && typeof item.id === "number");
    if (isPokemon && item.pokemon && item.listing) {
      lines.push({ kind: "pokemon", item: item as unknown as Extract<CartItem, { kind: "pokemon" }>["item"], quantity });
    } else if (isItem && typeof item.id === "number") {
      lines.push({ kind: "item", item: item as unknown as Extract<CartItem, { kind: "item" }>["item"], quantity });
    }
  }
  return lines;
}
