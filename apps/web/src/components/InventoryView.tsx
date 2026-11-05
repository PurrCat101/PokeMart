import React from "react";
import { InventoryItem, AuthUser } from "../types/api";
import { BackpackIcon, RefreshIcon, PokeballIcon } from "./icons";
import { Button, EmptyState, Skeleton, formatPokemonId } from "./ui";

interface InventoryViewProps {
  items: InventoryItem[];
  isLoading: boolean;
  user: AuthUser | null;
  onRefresh: () => void;
  onGoToCatalog: () => void;
  onOpenLogin: () => void;
}

export function InventoryView({ items, isLoading, user, onRefresh, onGoToCatalog, onOpenLogin }: InventoryViewProps) {
  if (!user) {
    return (
      <EmptyState
        data-testid="inventory-auth-required"
        icon={<BackpackIcon className="h-6 w-6" />}
        title="Sign in to see your inventory"
        description="Your Pokémon collection is tied to your trainer account."
        action={
          <Button variant="primary" onClick={onOpenLogin} data-testid="inventory-sign-in">
            Sign in
          </Button>
        }
        className="mx-auto my-8 max-w-lg"
      />
    );
  }

  const totalUnits = items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <section data-testid="inventory-view" aria-labelledby="inventory-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="inventory-heading" className="text-2xl font-bold tracking-tight">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            <span className="font-mono tabular-nums">{items.length}</span> species ·{" "}
            <span className="font-mono tabular-nums">{totalUnits}</span> Pokémon owned
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isLoading} data-testid="inventory-refresh">
          <RefreshIcon className={`h-4 w-4 ${isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div data-testid="inventory-loading" role="status" aria-label="Loading inventory" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          data-testid="inventory-empty"
          icon={<BackpackIcon className="h-6 w-6" />}
          title="No Pokémon yet"
          description="Pokémon you buy will appear here."
          action={
            <Button variant="primary" onClick={onGoToCatalog}>
              Browse the catalog
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {items.map((item) => (
            <li
              key={item.pokemon.id}
              data-testid={`inventory-item-${item.pokemon.id}`}
              className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs tabular-nums text-fg-subtle">{formatPokemonId(item.pokemon.id)}</span>
                <span className="rounded-full bg-brand-soft px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-brand-text">
                  ×{item.quantity}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <PokeballIcon className="h-4 w-4 shrink-0 text-brand-text" />
                <span className="truncate font-semibold capitalize">{item.pokemon.name}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
