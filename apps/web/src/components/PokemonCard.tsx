import React, { useState } from "react";
import Image from "next/image";
import { CatalogItem } from "../types/api";
import { TypeBadge } from "./TypeBadge";
import { PlusIcon, MinusIcon, PokeballIcon } from "./icons";

interface PokemonCardProps {
  item: CatalogItem;
  onInitiatePurchase: (item: CatalogItem, quantity: number) => void;
  disabled?: boolean;
}

export function PokemonCard({ item, onInitiatePurchase, disabled = false }: PokemonCardProps) {
  const { pokemon, listing } = item;
  const [quantity, setQuantity] = useState(1);
  const isOutOfStock = listing.availableStock <= 0;
  const maxPurchase = Math.min(listing.availableStock, 99);

  const handleIncrement = () => {
    if (quantity < maxPurchase) setQuantity((prev) => prev + 1);
  };

  const handleDecrement = () => {
    if (quantity > 1) setQuantity((prev) => prev - 1);
  };

  const formattedId = `#${String(pokemon.id).padStart(3, "0")}`;
  const capitalizedName = pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1);

  return (
    <div className="flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
      {/* Top Banner: ID & Stock Badge */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/50">
        <span className="font-mono text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          {formattedId}
        </span>
        <div className="flex items-center space-x-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isOutOfStock ? "bg-red-500" : listing.availableStock < 5 ? "bg-amber-500" : "bg-emerald-500"
            }`}
          />
          <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
            {isOutOfStock ? "Out of Stock" : `${listing.availableStock} in stock`}
          </span>
        </div>
      </div>

      {/* Visual Sprite Container */}
      <div className="relative h-36 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-center p-2 border-b border-zinc-100 dark:border-zinc-800">
        {pokemon.spriteUrl ? (
          <Image
            src={pokemon.spriteUrl}
            alt={pokemon.name}
            width={96}
            height={96}
            className="w-24 h-24 object-contain pixelated rendering-pixelated"
            unoptimized
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
            <PokeballIcon className="w-8 h-8" />
          </div>
        )}
      </div>

      {/* Card Content & Details */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-zinc-950 dark:text-zinc-100 text-base leading-tight">
              {capitalizedName}
            </h3>
            <span className="font-mono font-bold text-sm text-zinc-900 dark:text-zinc-100 tabular-nums whitespace-nowrap">
              ₽ {listing.price.toLocaleString()}
            </span>
          </div>

          {/* Types */}
          <div className="flex flex-wrap gap-1 mt-2">
            {pokemon.types.map((type) => (
              <TypeBadge key={type} type={type} />
            ))}
          </div>
        </div>

        {/* Purchase Controls */}
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
          {!isOutOfStock && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500 dark:text-zinc-400 font-medium">Quantity</span>
              <div className="flex items-center border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-800/50">
                <button
                  type="button"
                  onClick={handleDecrement}
                  disabled={quantity <= 1 || disabled}
                  className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Decrease quantity"
                >
                  <MinusIcon className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={handleIncrement}
                  disabled={quantity >= maxPurchase || disabled}
                  className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Increase quantity"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => onInitiatePurchase(item, quantity)}
            disabled={isOutOfStock || disabled}
            className={`w-full py-2 px-3 rounded text-xs font-semibold tracking-wide uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1 ${
              isOutOfStock
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                : "bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm"
            }`}
          >
            {isOutOfStock ? "Out of Stock" : `Buy ${quantity > 1 ? `(${quantity}) • ₽ ${(listing.price * quantity).toLocaleString()}` : `• ₽ ${listing.price.toLocaleString()}`}`}
          </button>
        </div>
      </div>
    </div>
  );
}
