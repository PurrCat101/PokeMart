"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api, ApiError } from "../lib/api";
import { CatalogItem, ItemCatalogItem } from "../types/api";
import { useApp } from "../contexts/AppContext";
import { PokemonCard } from "../components/PokemonCard";
import { ItemCard } from "../components/ItemCard";
import { SearchIcon, ChevronLeftIcon, ChevronRightIcon, RefreshIcon, FilterIcon, XIcon } from "../components/icons";
import { ErrorPage } from "../components/ErrorPage";
import { Button, EmptyState, IconButton, Skeleton, cx, inputClass } from "../components/ui";

const POKEMON_TYPES = [
  "all",
  "grass",
  "fire",
  "water",
  "electric",
  "poison",
  "bug",
  "normal",
  "ground",
  "fairy",
  "psychic",
  "fighting",
  "rock",
  "ghost",
  "dragon",
  "ice",
];

const ITEMS_PER_PAGE = 12;

export default function CatalogPage() {
  const { addLine, buyNow, cartQuantityMap, purchaseVersion } = useApp();

  // Current catalog page only: never download the full product snapshot to browse.
  const [allCatalog, setAllCatalog] = useState<CatalogItem[]>([]);
  const [allItems, setAllItems] = useState<ItemCatalogItem[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [itemCategories, setItemCategories] = useState<string[]>(["all"]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [catalogKind, setCatalogKind] = useState<"pokemon" | "items">("pokemon");

  // Filter & Search Controls
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedItemCategory, setSelectedItemCategory] = useState("all");
  const [stockOnly, setStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"id-asc" | "id-desc" | "price-asc" | "price-desc" | "name-asc">("id-asc");
  const [currentPage, setCurrentPage] = useState(1);

  const [catalogError, setCatalogError] = useState<{ message: string; status?: number; code?: string; requestId?: string } | null>(null);

  // 3. Fetch just the current server-filtered catalog page.
  const fetchFullCatalog = useCallback(async () => {
    setIsCatalogLoading(true);
    setCatalogError(null);
    try {
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      if (catalogKind === "pokemon") {
        const page = await api.getPokemonList(ITEMS_PER_PAGE, offset, { q: searchQuery.trim(), type: selectedType, inStock: stockOnly });
        setAllCatalog(page.items);
        setCatalogTotal(page.totalCount);
      } else {
        const page = await api.getItemList(ITEMS_PER_PAGE, offset, { q: searchQuery.trim(), category: selectedItemCategory, inStock: stockOnly });
        setAllItems(page.results);
        setCatalogTotal(page.count);
      }
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setCatalogError({
        message:
          apiErr?.code === "DEPENDENCY_UNAVAILABLE"
            ? "BFF service or upstream PokéMart API is currently offline. Ensure docker containers or bff/api are running."
            : (err instanceof Error && err.message) || "Failed to load shop catalog.",
        status: apiErr?.status,
        code: apiErr?.code,
        requestId: apiErr?.requestId,
      });
    } finally {
      setIsCatalogLoading(false);
    }
  }, [catalogKind, currentPage, searchQuery, selectedType, selectedItemCategory, stockOnly]);

  useEffect(() => {
    api.getItemCategories().then((categories) => setItemCategories(["all", ...categories])).catch(() => setItemCategories(["all"]));
  }, []);

  // Initial load, and again whenever a filter changes or a checkout has used up some stock.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount and whenever a filter changes; the fetch sets its own loading flag first
    fetchFullCatalog();
  }, [fetchFullCatalog, purchaseVersion]);

  // Reset pagination when filter criteria changes
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    setCurrentPage(1);
  };

  const handleItemCategoryChange = (category: string) => {
    setSelectedItemCategory(category);
    setCurrentPage(1);
  };

  const handleCatalogKindChange = (kind: "pokemon" | "items") => {
    setCatalogKind(kind);
    setSearchQuery("");
    setSelectedType("all");
    setSelectedItemCategory("all");
    setStockOnly(false);
    setCurrentPage(1);
  };

  const handleStockToggle = () => {
    setStockOnly((prev) => !prev);
    setCurrentPage(1);
  };

  const handleSortChange = (newSort: typeof sortBy) => {
    setSortBy(newSort);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedType("all");
    setSelectedItemCategory("all");
    setStockOnly(false);
    setSortBy("id-asc");
    setCurrentPage(1);
  };

  // The server has already filtered the current page; client sorting is page-local.
  const filteredCatalog = useMemo(() => {
    return [...allCatalog].sort((a, b) => {
      if (sortBy === "id-asc") return a.pokemon.id - b.pokemon.id;
      if (sortBy === "id-desc") return b.pokemon.id - a.pokemon.id;
      if (sortBy === "price-asc") return a.listing.price - b.listing.price;
      if (sortBy === "price-desc") return b.listing.price - a.listing.price;
      if (sortBy === "name-asc") return a.pokemon.name.localeCompare(b.pokemon.name);
      return 0;
    });
  }, [allCatalog, sortBy]);

  const filteredItems = useMemo(() => {
    return [...allItems].sort((a, b) => {
      if (sortBy === "id-asc") return a.id - b.id;
      if (sortBy === "id-desc") return b.id - a.id;
      if (sortBy === "price-asc") return a.price - b.price;
      if (sortBy === "price-desc") return b.price - a.price;
      return a.name.localeCompare(b.name);
    });
  }, [allItems, sortBy]);

  // Pagination calculation
  const activeCatalog = catalogKind === "pokemon" ? filteredCatalog : filteredItems;
  const totalFilteredCount = catalogTotal;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCatalog = activeCatalog;

  const hasActiveFilters = searchQuery !== "" || selectedType !== "all" || selectedItemCategory !== "all" || stockOnly || sortBy !== "id-asc";

  const kindLabel = catalogKind === "pokemon" ? "Pokémon" : "items";

  const pageNumbers = Array.from({ length: totalPages }, (_, idx) => idx + 1).filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - safeCurrentPage) <= 1,
  );

  return (
    <>
      {catalogError && !isCatalogLoading && (
        <ErrorPage
          title="Catalog unavailable"
          message={catalogError.message}
          status={catalogError.status}
          code={catalogError.code}
          requestId={catalogError.requestId}
          onRetry={fetchFullCatalog}
          retryTestId="catalog-retry"
          testId="catalog-service-error"
        />
      )}

      {!(catalogError && !isCatalogLoading) && (
        <section aria-labelledby="catalog-heading" className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 id="catalog-heading" className="text-2xl font-bold tracking-tight">
                Catalog
              </h1>
              <p className="mt-1 text-sm text-fg-muted">
                {catalogKind === "pokemon" ? "Choose a Pokémon, set a quantity, and add it to your bag." : "Items for your trainer. Some need extra verification."}
              </p>
            </div>

            {/* Product family */}
            <div role="group" aria-label="Product type" className="inline-flex rounded-lg border border-line-strong bg-surface p-1">
              {(["pokemon", "items"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={catalogKind === kind}
                  onClick={() => handleCatalogKindChange(kind)}
                  data-testid={`catalog-kind-${kind}`}
                  className={cx(
                    "min-h-11 rounded-md px-4 text-sm font-semibold transition-colors sm:min-h-9",
                    catalogKind === kind ? "bg-brand text-brand-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {kind === "pokemon" ? "Pokémon" : "Items"}
                </button>
              ))}
            </div>
          </div>

          {/* One filter panel, identical controls for Pokemon and items:
              search on top, then Type/Category, Sort and Availability as equal labelled fields. */}
          <div className="space-y-4 rounded-xl border border-line bg-surface p-3 shadow-card sm:p-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <label htmlFor="catalog-search" className="sr-only">
                  Search {kindLabel}
                </label>
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
                <input
                  id="catalog-search"
                  type="search"
                  data-testid="catalog-search"
                  placeholder={catalogKind === "pokemon" ? "Search by name or number" : "Search items by name or number"}
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className={`${inputClass} pl-9 pr-11 [&::-webkit-search-cancel-button]:appearance-none`}
                />
                {searchQuery && (
                  <IconButton label="Clear search" onClick={() => handleSearchChange("")} className="absolute right-0 top-1/2 -translate-y-1/2">
                    <XIcon className="h-4 w-4" />
                  </IconButton>
                )}
              </div>
              <IconButton
                label="Refresh catalog"
                onClick={fetchFullCatalog}
                disabled={isCatalogLoading}
                data-testid="catalog-refresh"
                className="border border-line-strong sm:h-10 sm:w-10"
              >
                <RefreshIcon className={cx("h-4 w-4", isCatalogLoading && "animate-spin motion-reduce:animate-none")} />
              </IconButton>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="catalog-filter" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                  <FilterIcon className="h-3.5 w-3.5" />
                  {catalogKind === "pokemon" ? "Type" : "Category"}
                </label>
                <select
                  id="catalog-filter"
                  value={catalogKind === "pokemon" ? selectedType : selectedItemCategory}
                  onChange={(e) => (catalogKind === "pokemon" ? handleTypeChange(e.target.value) : handleItemCategoryChange(e.target.value))}
                  data-testid={catalogKind === "pokemon" ? "catalog-type" : "catalog-item-category"}
                  className={`${inputClass} font-medium capitalize`}
                >
                  {(catalogKind === "pokemon" ? POKEMON_TYPES : itemCategories).map((option) => (
                    <option key={option} value={option}>
                      {option === "all"
                        ? catalogKind === "pokemon"
                          ? "All types"
                          : "All categories"
                        : option.replaceAll("-", " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="catalog-sort" className="mb-1.5 block text-xs font-medium text-fg-muted">
                  Sort by
                </label>
                <select
                  id="catalog-sort"
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value as typeof sortBy)}
                  data-testid="catalog-sort"
                  className={`${inputClass} font-medium`}
                >
                  <option value="id-asc">{catalogKind === "pokemon" ? "Pokédex" : "Item"} number: low to high</option>
                  <option value="id-desc">{catalogKind === "pokemon" ? "Pokédex" : "Item"} number: high to low</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="name-asc">Name: A to Z</option>
                </select>
              </div>

              <div>
                <span id="stock-filter-label" className="mb-1.5 block text-xs font-medium text-fg-muted">
                  Availability
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={stockOnly}
                  aria-labelledby="stock-filter-label stock-filter-text"
                  onClick={handleStockToggle}
                  data-testid="catalog-in-stock-filter"
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-line-strong bg-surface px-3 text-base font-medium transition-colors hover:border-fg-subtle sm:min-h-10 sm:text-sm"
                >
                  <span id="stock-filter-text">In stock only</span>
                  <span
                    aria-hidden="true"
                    className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors", stockOnly ? "bg-ok" : "bg-line-strong")}
                  >
                    <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-card transition-transform", stockOnly ? "translate-x-4.5" : "translate-x-0.5")} />
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Results summary */}
          <div data-testid="catalog-results-summary" aria-live="polite" className="flex items-center justify-between text-sm text-fg-muted">
            <p>
              Showing <span className="font-mono font-semibold tabular-nums text-fg">{paginatedCatalog.length}</span> of{" "}
              <span className="font-mono font-semibold tabular-nums text-fg">{totalFilteredCount}</span> {kindLabel}
            </p>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters} data-testid="catalog-clear-filters" className="-mr-3">
                Clear filters
              </Button>
            )}
          </div>

          {/* Grid */}
          {isCatalogLoading ? (
            <div data-testid="catalog-loading" role="status" aria-label="Loading catalog" className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
                  <Skeleton className="h-40 rounded-none" />
                  <div className="space-y-3 p-4">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-11 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : activeCatalog.length === 0 ? (
            <EmptyState
              data-testid="catalog-empty"
              icon={<SearchIcon className="h-6 w-6" />}
              title={`No ${kindLabel} match your filters`}
              description="Try a different search, or clear the type and stock filters."
              action={
                <Button variant="primary" onClick={handleClearFilters} data-testid="catalog-reset-filters">
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div data-testid="catalog-grid" className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {catalogKind === "pokemon"
                ? (paginatedCatalog as CatalogItem[]).map((item, index) => (
                    <PokemonCard
                      key={item.pokemon.id}
                      item={item}
                      eager={index < 4}
                      onAddToCart={(it, quantity) => addLine({ kind: "pokemon", item: it, quantity })}
                      onBuyNow={(it, quantity) => buyNow({ kind: "pokemon", item: it, quantity })}
                      inCartQuantity={cartQuantityMap.get(`pokemon-${item.pokemon.id}`) || 0}
                    />
                  ))
                : (paginatedCatalog as ItemCatalogItem[]).map((item, index) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      eager={index < 4}
                      onAddToCart={(it, quantity) => addLine({ kind: "item", item: it, quantity })}
                      onBuyNow={(it, quantity) => buyNow({ kind: "item", item: it, quantity })}
                      inCartQuantity={cartQuantityMap.get(`item-${item.id}`) || 0}
                    />
                  ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <nav aria-label="Catalog pages" data-testid="catalog-pagination" className="flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
              <span className="text-fg-muted">
                Page <span className="font-mono font-semibold tabular-nums text-fg">{safeCurrentPage}</span> of{" "}
                <span className="font-mono tabular-nums">{totalPages}</span>
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                  data-testid="catalog-page-previous"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Previous</span>
                  <span className="sr-only sm:hidden">Previous page</span>
                </Button>

                <div className="hidden items-center gap-1 sm:flex">
                  {pageNumbers.map((pageNum, i) => (
                    <React.Fragment key={pageNum}>
                      {i > 0 && pageNum - pageNumbers[i - 1] > 1 && (
                        <span aria-hidden="true" className="px-1 text-fg-subtle">
                          …
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        data-testid={`catalog-page-${pageNum}`}
                        aria-label={`Page ${pageNum}`}
                        aria-current={safeCurrentPage === pageNum ? "page" : undefined}
                        className={cx(
                          "h-9 min-w-9 rounded-md px-2 font-mono text-sm font-semibold tabular-nums transition-colors",
                          safeCurrentPage === pageNum ? "bg-fg text-bg" : "text-fg-muted hover:bg-surface-2",
                        )}
                      >
                        {pageNum}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  data-testid="catalog-page-next"
                >
                  <span className="hidden sm:inline">Next</span>
                  <span className="sr-only sm:hidden">Next page</span>
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </div>
            </nav>
          )}
        </section>
      )}
    </>
  );
}
