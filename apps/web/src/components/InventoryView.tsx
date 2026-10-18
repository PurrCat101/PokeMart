import React from "react";
import { InventoryItem, AuthUser } from "../types/api";
import { BackpackIcon, RefreshIcon, PokeballIcon } from "./icons";

interface InventoryViewProps {
  items: InventoryItem[];
  isLoading: boolean;
  user: AuthUser | null;
  onRefresh: () => void;
  onGoToCatalog: () => void;
  onOpenLogin: () => void;
}

export function InventoryView({
  items,
  isLoading,
  user,
  onRefresh,
  onGoToCatalog,
  onOpenLogin,
}: InventoryViewProps) {
  if (!user) {
    return (
      <div className="p-8 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg max-w-lg mx-auto my-8">
        <BackpackIcon className="w-10 h-10 mx-auto text-zinc-400 mb-3" />
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
          Trainer Authentication Required
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-4">
          Sign in to access your trainer inventory and managed Pokémon collection.
        </p>
        <button
          type="button"
          onClick={onOpenLogin}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded transition-colors"
        >
          Sign In Now
        </button>
      </div>
    );
  }

  const totalPokemonCount = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="space-y-4">
      {/* View Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
            <span>Trainer Backpack</span>
            <span className="text-xs font-mono font-normal text-zinc-500">
              ({items.length} species, {totalPokemonCount} total units)
            </span>
          </h2>
          <p className="text-xs text-zinc-500">
            Current inventory synced with PokéMart central storage ledger.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded transition-colors"
        >
          <RefreshIcon className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Sync Bag</span>
        </button>
      </div>

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded border border-zinc-200 dark:border-zinc-700" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg">
          <BackpackIcon className="w-8 h-8 mx-auto text-zinc-400 mb-2" />
          <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            No Pokémon in Backpack
          </div>
          <p className="text-xs text-zinc-500 mt-1 mb-4">
            You have not purchased any Pokémon yet. Explore available listings in the catalog.
          </p>
          <button
            type="button"
            onClick={onGoToCatalog}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 rounded transition-colors"
          >
            Browse Shop Catalog
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {items.map((item) => (
            <div
              key={item.pokemon.id}
              className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between text-xs font-mono text-zinc-500 mb-2">
                <span>#{String(item.pokemon.id).padStart(3, "0")}</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                  ×{item.quantity}
                </span>
              </div>
              <div className="flex items-center space-x-2 my-1">
                <PokeballIcon className="w-4 h-4 text-red-600 shrink-0" />
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 capitalize truncate">
                  {item.pokemon.name}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
