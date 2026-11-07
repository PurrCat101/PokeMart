import type { ItemPurchase, PurchaseItem } from "../types/api";
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

export function pokemonOrderRow(p: PurchaseItem): OrderRow {
  return {
    kind: "pokemon",
    purchaseId: p.purchaseId,
    createdAt: p.createdAt,
    idLabel: formatPokemonId(p.pokemon.id),
    name: p.pokemon.name,
    quantity: p.quantity,
    unitPrice: p.pricing.unitPrice,
    totalPrice: p.pricing.totalPrice,
  };
}

export function itemOrderRow(p: ItemPurchase): OrderRow {
  return {
    kind: "item",
    purchaseId: p.purchaseId,
    createdAt: p.createdAt,
    idLabel: `#${String(p.itemId).padStart(4, "0")}`,
    name: titleCase(p.itemName),
    quantity: p.quantity,
    unitPrice: p.unitPrice,
    totalPrice: p.totalPrice,
  };
}
