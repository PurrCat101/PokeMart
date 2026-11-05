"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api, ApiError } from "../lib/api";
import {
  CatalogItem,
  ItemCatalogItem,
  AuthUser,
  WalletData,
  InventoryItem,
  PurchaseItem,
  CartItem,
  CheckoutReceipt,
  CheckoutFailure,
} from "../types/api";
import { type KycLevel, lineKey, lineMaxQuantity, normalizeCart } from "../lib/cart";
import { Header } from "../components/Header";
import { PokemonCard } from "../components/PokemonCard";
import { ItemCard } from "../components/ItemCard";
import { CartDrawer } from "../components/CartDrawer";
import { CheckoutModal } from "../components/CheckoutModal";
import { LoginModal } from "../components/LoginModal";
import { InventoryView } from "../components/InventoryView";
import { PurchasesView } from "../components/PurchasesView";
import { Toast, ToastMessage } from "../components/Toast";
import { SearchIcon, ChevronLeftIcon, ChevronRightIcon, RefreshIcon, FilterIcon, XIcon } from "../components/icons";
import { Alert, Button, EmptyState, IconButton, Skeleton, cx, inputClass } from "../components/ui";

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

export default function PokeMartApp() {
  // Navigation & View Tab
  const [activeTab, setActiveTab] = useState<"catalog" | "inventory" | "purchases">("catalog");

  // Authentication & Trainer State
  const [user, setUser] = useState<AuthUser | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  // null = checkout closed. Holds the whole bag, or one line for "Buy now".
  const [checkoutLines, setCheckoutLines] = useState<CartItem[] | null>(null);
  const [buyNowAfterLogin, setBuyNowAfterLogin] = useState<CartItem | null>(null);
  // null = unknown (signed out, or the KYC service is unavailable).
  const [kycLevel, setKycLevel] = useState<KycLevel | null>(null);

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

  // Inventory & Purchases
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isInventoryLoading, setIsInventoryLoading] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseItem[]>([]);
  const [purchasesTotal, setPurchasesTotal] = useState(0);
  const [purchasesOffset, setPurchasesOffset] = useState(0);
  const [purchasesLimit] = useState(10);
  const [isPurchasesLoading, setIsPurchasesLoading] = useState(false);

  // Feedback & Diagnostics
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [bffStatusError, setBffStatusError] = useState<string | null>(null);

  // 1. Load cart from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("pokemart_cart");
      if (stored) {
        // Bags saved before items existed have no `kind`; normalizeCart treats those as Pokemon.
        setCart(normalizeCart(JSON.parse(stored)));
      }
    } catch {
      // ignore JSON parse error
    }
  }, []);

  // Save cart to localStorage
  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart);
    try {
      localStorage.setItem("pokemart_cart", JSON.stringify(newCart));
    } catch {
      // ignore storage quota error
    }
  };

  // 2. Check existing session
  const syncSession = useCallback(async () => {
    try {
      const account = await api.getAccountInfo();
      setUser(account.user);
      setWallet(account.wallet);
      setKycLevel(account.kyc?.levelValue ?? null);
    } catch {
      setUser(null);
      setWallet(null);
      setKycLevel(null);
    }
  }, []);

  // 3. Fetch just the current server-filtered catalog page.
  const fetchFullCatalog = useCallback(async () => {
    setIsCatalogLoading(true);
    setBffStatusError(null);
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
    } catch (err: any) {
      setBffStatusError(
        err instanceof ApiError && err.code === "DEPENDENCY_UNAVAILABLE"
          ? "BFF service or upstream PokéMart API is currently offline. Ensure docker containers or bff/api are running."
          : err.message || "Failed to load shop catalog."
      );
    } finally {
      setIsCatalogLoading(false);
    }
  }, [catalogKind, currentPage, searchQuery, selectedType, selectedItemCategory, stockOnly]);

  useEffect(() => {
    api.getItemCategories().then((categories) => setItemCategories(["all", ...categories])).catch(() => setItemCategories(["all"]));
  }, []);

  // 4. Fetch Inventory
  const fetchInventory = useCallback(async () => {
    if (!user) return;
    setIsInventoryLoading(true);
    try {
      const data = await api.getInventory();
      setInventoryItems(data.items);
    } catch {
      // ignore
    } finally {
      setIsInventoryLoading(false);
    }
  }, [user]);

  // 5. Fetch Purchases
  const fetchPurchases = useCallback(async (offset = 0) => {
    if (!user) return;
    setIsPurchasesLoading(true);
    try {
      const data = await api.getPurchases(purchasesLimit, offset);
      setPurchaseHistory(data.items);
      setPurchasesTotal(data.totalCount);
      setPurchasesOffset(data.page.offset);
    } catch {
      // ignore
    } finally {
      setIsPurchasesLoading(false);
    }
  }, [user, purchasesLimit]);

  // Initial load
  useEffect(() => {
    syncSession();
    fetchFullCatalog();
  }, [syncSession, fetchFullCatalog]);

  // Tab change handlers
  useEffect(() => {
    if (activeTab === "inventory" && user) fetchInventory();
    if (activeTab === "purchases" && user) fetchPurchases(0);
  }, [activeTab, user, fetchInventory, fetchPurchases]);

  // Cart operations (Pokémon and item lines share one bag)
  const handleAddLine = (line: CartItem) => {
    const key = lineKey(line);
    const max = lineMaxQuantity(line);
    const existing = cart.find((c) => lineKey(c) === key);
    const updatedCart: CartItem[] = existing
      ? cart.map((c) => (lineKey(c) === key ? { ...c, quantity: Math.min(c.quantity + line.quantity, max) } : c))
      : [...cart, { ...line, quantity: Math.min(line.quantity, max) }];

    saveCart(updatedCart);
    const name = line.kind === "pokemon" ? line.item.pokemon.name : line.item.name.replaceAll("-", " ");
    setToast({
      id: crypto.randomUUID(),
      type: "success",
      title: `Added ${name} × ${line.quantity} to bag`,
      message: `Total items in bag: ${updatedCart.reduce((a, b) => a + b.quantity, 0)}`,
    });
  };

  const handleUpdateCartQuantity = (line: CartItem, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(line);
      return;
    }
    const key = lineKey(line);
    saveCart(cart.map((c) => (lineKey(c) === key ? { ...c, quantity: Math.min(quantity, lineMaxQuantity(c)) } : c)));
  };

  const handleRemoveFromCart = (line: CartItem) => {
    const key = lineKey(line);
    saveCart(cart.filter((c) => lineKey(c) !== key));
  };

  const handleClearCart = () => {
    saveCart([]);
  };

  // "Buy now" pays for one line without touching the bag.
  const handleBuyNow = (line: CartItem) => {
    if (!user) {
      setBuyNowAfterLogin(line);
      setIsLoginOpen(true);
      return;
    }
    setCheckoutLines([line]);
  };

  // Login handler
  const handleLogin = async (credentials: { email: string; password: string }) => {
    const res = await api.login(credentials);
    setUser(res.user);
    const account = await api.getAccountInfo();
    setWallet(account.wallet);
    setKycLevel(account.kyc?.levelValue ?? null);
    if (buyNowAfterLogin) {
      setCheckoutLines([buyNowAfterLogin]);
      setBuyNowAfterLogin(null);
    }
    setToast({
      id: crypto.randomUUID(),
      type: "success",
      title: "Trainer Authenticated",
      message: `Signed in as ${res.user.displayName}`,
    });
    fetchInventory();
  };

  // Logout handler
  const handleLogout = () => {
    api.logout();
    setUser(null);
    setWallet(null);
    setKycLevel(null);
    setInventoryItems([]);
    setPurchaseHistory([]);
    setToast({
      id: crypto.randomUUID(),
      type: "info",
      title: "Session Terminated",
      message: "Trainer logged out safely.",
    });
  };

  // Pays for each line against its own endpoint. A failed line never blocks the others.
  const handleExecuteCheckout = async (
    lines: CartItem[],
    onProgress: (current: number, total: number, itemName: string) => void,
  ) => {
    const completed: CheckoutReceipt[] = [];
    const errors: CheckoutFailure[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const name = line.kind === "pokemon" ? line.item.pokemon.name : line.item.name.replaceAll("-", " ");
      onProgress(i + 1, lines.length, name);

      try {
        if (line.kind === "pokemon") {
          const purchase = await api.createPurchase({
            purchaseId: crypto.randomUUID(),
            pokemonId: line.item.pokemon.id,
            quantity: line.quantity,
          });
          completed.push({
            purchaseId: purchase.purchaseId,
            kind: "pokemon",
            name: purchase.pokemon.name,
            quantity: purchase.quantity,
            totalPrice: purchase.pricing.totalPrice,
          });
        } else {
          const purchase = await api.createItemPurchase({
            purchaseId: crypto.randomUUID(),
            itemId: line.item.id,
            quantity: line.quantity,
          });
          completed.push({
            purchaseId: purchase.purchaseId,
            kind: "item",
            name: purchase.itemName.replaceAll("-", " "),
            quantity: purchase.quantity,
            totalPrice: purchase.totalPrice,
          });
        }
      } catch (err) {
        const message =
          err instanceof ApiError && err.code === "KYC_LEVEL_REQUIRED" && line.kind === "item"
            ? `ต้องใช้ KYC ระดับ ${line.item.requiredKycLevel}`
            : err instanceof Error && err.message
              ? err.message
              : "Purchase rejected by server.";
        errors.push({ key: lineKey(line), name, error: message });
      }
    }

    // Refresh application state
    try {
      const account = await api.getAccountInfo();
      setWallet(account.wallet);
      setKycLevel(account.kyc?.levelValue ?? null);
      await Promise.all([fetchInventory(), fetchFullCatalog()]);
    } catch {
      // ignore
    }

    // Remove successfully purchased lines from the bag (a no-op for "Buy now" lines)
    if (completed.length > 0) {
      const failedKeys = new Set(errors.map((e) => e.key));
      const boughtKeys = new Set(lines.map(lineKey).filter((k) => !failedKeys.has(k)));
      saveCart(cart.filter((c) => !boughtKeys.has(lineKey(c))));
    }

    return { completed, errors };
  };

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

  const cartTotalQuantity = cart.reduce((acc, c) => acc + c.quantity, 0);

  // Cart item quantity lookup helper
  const cartQuantityMap = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach((c) => map.set(lineKey(c), c.quantity));
    return map;
  }, [cart]);

  const hasActiveFilters = searchQuery !== "" || selectedType !== "all" || selectedItemCategory !== "all" || stockOnly || sortBy !== "id-asc";

  const kindLabel = catalogKind === "pokemon" ? "Pokémon" : "items";

  const pageNumbers = Array.from({ length: totalPages }, (_, idx) => idx + 1).filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - safeCurrentPage) <= 1,
  );

  return (
    <div data-testid="app-shell" className="flex min-h-dvh flex-col">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        wallet={wallet}
        inventoryCount={inventoryItems.reduce((acc, i) => acc + i.quantity, 0)}
        cartCount={cartTotalQuantity}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
      />

      {/* pb-24 clears the fixed mobile tab bar */}
      <main id="main" tabIndex={-1} data-testid="app-main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 outline-none sm:px-6 md:pb-10 lg:px-8">
        {bffStatusError && (
          <Alert
            tone="danger"
            title="Catalog unavailable"
            data-testid="catalog-service-error"
            className="mb-6"
            action={
              <Button variant="secondary" size="sm" onClick={fetchFullCatalog} data-testid="catalog-retry">
                Try again
              </Button>
            }
          >
            {bffStatusError}
          </Alert>
        )}

        {activeTab === "catalog" && (
          <section aria-labelledby="catalog-heading" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 id="catalog-heading" className="text-2xl font-bold tracking-tight">
                  Catalog
                </h1>
                <p className="mt-1 text-sm text-fg-muted">
                  {catalogKind === "pokemon" ? "Choose a Pokémon, set a quantity, and add it to your bag." : "Items for your trainer. Some need identity verification."}
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
                  ? (paginatedCatalog as CatalogItem[]).map((item) => (
                      <PokemonCard
                        key={item.pokemon.id}
                        item={item}
                        onAddToCart={(it, quantity) => handleAddLine({ kind: "pokemon", item: it, quantity })}
                        onBuyNow={(it, quantity) => handleBuyNow({ kind: "pokemon", item: it, quantity })}
                        inCartQuantity={cartQuantityMap.get(`pokemon-${item.pokemon.id}`) || 0}
                      />
                    ))
                  : (paginatedCatalog as ItemCatalogItem[]).map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onAddToCart={(it, quantity) => handleAddLine({ kind: "item", item: it, quantity })}
                        onBuyNow={(it, quantity) => handleBuyNow({ kind: "item", item: it, quantity })}
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

        {activeTab === "inventory" && (
          <InventoryView
            items={inventoryItems}
            isLoading={isInventoryLoading}
            user={user}
            onRefresh={fetchInventory}
            onGoToCatalog={() => setActiveTab("catalog")}
            onOpenLogin={() => setIsLoginOpen(true)}
          />
        )}

        {activeTab === "purchases" && (
          <PurchasesView
            items={purchaseHistory}
            totalCount={purchasesTotal}
            limit={purchasesLimit}
            offset={purchasesOffset}
            isLoading={isPurchasesLoading}
            user={user}
            onRefresh={() => fetchPurchases(purchasesOffset)}
            onPageChange={(newOffset) => fetchPurchases(newOffset)}
            onOpenLogin={() => setIsLoginOpen(true)}
          />
        )}
      </main>

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        wallet={wallet}
        user={user}
        kycLevel={kycLevel}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveFromCart}
        onClearCart={handleClearCart}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          setCheckoutLines(cart);
        }}
        onOpenLogin={() => {
          setIsCartOpen(false);
          setIsLoginOpen(true);
        }}
      />

      <CheckoutModal
        isOpen={checkoutLines !== null}
        onClose={() => setCheckoutLines(null)}
        lines={checkoutLines ?? []}
        wallet={wallet}
        kycLevel={kycLevel}
        onExecuteCheckout={handleExecuteCheckout}
        onCheckoutSuccess={(completed) => {
          // Only Pokémon land in the inventory view.
          if (completed.some((r) => r.kind === "pokemon")) setActiveTab("inventory");
        }}
      />

      {isLoginOpen && <LoginModal isOpen={isLoginOpen} onClose={() => {
              setIsLoginOpen(false);
              setBuyNowAfterLogin(null);
            }} onLoginSuccess={handleLogin} />}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
