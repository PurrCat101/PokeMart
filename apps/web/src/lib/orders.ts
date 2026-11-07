import type { PurchaseItem } from "../types/api";
import { formatPokemonId, titleCase } from "../components/ui";

export type OrderKind = "pokemon" | "item";

/** One order line, whether it was a Pokémon or an item. Both ship the same way. */
export interface OrderRow {
  kind: OrderKind;
  purchaseId: string;
  createdAt: string;
  /** "#025" for Pokémon, "#0042" for items. */
  idLabel: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

/** Flattens one purchase from the API, whichever kind it is. */
export function orderRow(p: PurchaseItem): OrderRow {
  const common = { purchaseId: p.purchaseId, createdAt: p.createdAt, quantity: p.quantity, unitPrice: p.pricing.unitPrice, totalPrice: p.pricing.totalPrice };
  if (p.kind === "ITEM" && p.item) {
    return { ...common, kind: "item", idLabel: `#${String(p.item.id).padStart(4, "0")}`, name: titleCase(p.item.name) };
  }
  const pokemon = p.pokemon;
  if (!pokemon) throw new Error("Unexpected purchase: no product");
  return { ...common, kind: "pokemon", idLabel: formatPokemonId(pokemon.id), name: pokemon.name };
}
