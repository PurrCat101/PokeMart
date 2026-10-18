"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api, ApiError } from "../lib/api";
import {
  CatalogItem,
  AuthUser,
  WalletData,
  InventoryItem,
  PurchaseItem,
  CartItem,
} from "../types/api";
import { Header } from "../components/Header";
import { PokemonCard } from "../components/PokemonCard";
import { CartDrawer } from "../components/CartDrawer";
import { CheckoutModal } from "../components/CheckoutModal";
import { LoginModal } from "../components/LoginModal";
import { InventoryView } from "../components/InventoryView";
import { PurchasesView } from "../components/PurchasesView";
import { Toast, ToastMessage } from "../components/Toast";
import {
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RefreshIcon,
  AlertCircleIcon,
  FilterIcon,
  XIcon,
} from "../components/icons";

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

export default function PokemartCommerceTerminal() {
  // Navigation & View Tab
  const [activeTab, setActiveTab] = useState<"catalog" | "inventory" | "purchases">("catalog");

  // Authentication & Trainer State
  const [user, setUser] = useState<AuthUser | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Complete Catalog Data (All 151 Pokémon)
  const [allCatalog, setAllCatalog] = useState<CatalogItem[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);

  // Filter & Search Controls
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
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
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setCart(parsed);
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
      const me = await api.getMe();
      setUser(me.user);
      const walletRes = await api.getWallet();
      setWallet(walletRes.wallet);
    } catch {
      setUser(null);
      setWallet(null);
    }
  }, []);

  // 3. Fetch Full Catalog (Loads all 151 Generation 1 Pokémon)
  const fetchFullCatalog = useCallback(async () => {
    setIsCatalogLoading(true);
    setBffStatusError(null);
    try {
      const items = await api.getAllPokemon();
      setAllCatalog(items);
    } catch (err: any) {
      setBffStatusError(
        err instanceof ApiError && err.code === "DEPENDENCY_UNAVAILABLE"
          ? "BFF service or upstream PokéMart API is currently offline. Ensure docker containers or bff/api are running."
          : err.message || "Failed to load shop catalog."
      );
    } finally {
      setIsCatalogLoading(false);
    }
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

  // Cart operations
  const handleAddToCart = (item: CatalogItem, quantity: number) => {
    const existingIndex = cart.findIndex((c) => c.item.pokemon.id === item.pokemon.id);
    let updatedCart: CartItem[];

    if (existingIndex >= 0) {
      const current = cart[existingIndex];
      const newQty = Math.min(current.quantity + quantity, item.listing.availableStock);
      updatedCart = [...cart];
      updatedCart[existingIndex] = { ...current, quantity: newQty };
    } else {
      updatedCart = [...cart, { item, quantity: Math.min(quantity, item.listing.availableStock) }];
    }

    saveCart(updatedCart);
    setToast({
      id: crypto.randomUUID(),
      type: "success",
      title: `Added ${item.pokemon.name} × ${quantity} to Bag`,
      message: `Total items in bag: ${updatedCart.reduce((a, b) => a + b.quantity, 0)}`,
    });
  };

  const handleUpdateCartQuantity = (pokemonId: number, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(pokemonId);
      return;
    }
    const updated = cart.map((c) => {
      if (c.item.pokemon.id === pokemonId) {
        return { ...c, quantity: Math.min(quantity, c.item.listing.availableStock) };
      }
      return c;
    });
    saveCart(updated);
  };

  const handleRemoveFromCart = (pokemonId: number) => {
    const updated = cart.filter((c) => c.item.pokemon.id !== pokemonId);
    saveCart(updated);
  };

  const handleClearCart = () => {
    saveCart([]);
  };

  // Login handler
  const handleLogin = async (credentials: { email: string; password: string }) => {
    const res = await api.login(credentials);
    setUser(res.user);
    const walletRes = await api.getWallet();
    setWallet(walletRes.wallet);
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
    setInventoryItems([]);
    setPurchaseHistory([]);
    setToast({
      id: crypto.randomUUID(),
      type: "info",
      title: "Session Terminated",
      message: "Trainer logged out safely.",
    });
  };

  // Multi-item Cart Checkout Execution
  const handleExecuteCheckout = async (
    items: CartItem[],
    onProgress: (current: number, total: number, itemName: string) => void
  ) => {
    const completed: PurchaseItem[] = [];
    const errors: Array<{ pokemonId: number; name: string; error: string }> = [];

    for (let i = 0; i < items.length; i++) {
      const line = items[i];
      onProgress(i + 1, items.length, line.item.pokemon.name);

      try {
        const purchaseId = crypto.randomUUID();
        const purchase = await api.createPurchase({
          purchaseId,
          pokemonId: line.item.pokemon.id,
          quantity: line.quantity,
        });
        completed.push(purchase);
      } catch (err: any) {
        errors.push({
          pokemonId: line.item.pokemon.id,
          name: line.item.pokemon.name,
          error: err.message || "Purchase rejected by server.",
        });
      }
    }

    // Refresh application state
    try {
      const walletRes = await api.getWallet();
      setWallet(walletRes.wallet);
      await Promise.all([fetchInventory(), fetchFullCatalog()]);
    } catch {
      // ignore
    }

    // Remove successfully purchased items from cart
    if (completed.length > 0) {
      const completedIds = new Set(completed.map((p) => p.pokemon.id));
      const remainingCart = cart.filter((c) => !completedIds.has(c.item.pokemon.id));
      saveCart(remainingCart);
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
    setStockOnly(false);
    setSortBy("id-asc");
    setCurrentPage(1);
  };

  // Filter & Sort Pipeline across complete 151 Pokémon catalog
  const filteredCatalog = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = allCatalog.filter((item) => {
      // 1. Search Query: matches name or numerical ID
      const matchesName = item.pokemon.name.toLowerCase().includes(query);
      const matchesId = String(item.pokemon.id).includes(query);
      if (query && !matchesName && !matchesId) return false;

      // 2. Type Filter: check if Pokémon possesses the selected type
      if (selectedType !== "all") {
        const hasType = item.pokemon.types.some(
          (t) => t.toLowerCase() === selectedType.toLowerCase()
        );
        if (!hasType) return false;
      }

      // 3. Stock Filter: in stock only
      if (stockOnly && item.listing.availableStock <= 0) {
        return false;
      }

      return true;
    });

    // 4. Sorting
    return filtered.sort((a, b) => {
      if (sortBy === "id-asc") return a.pokemon.id - b.pokemon.id;
      if (sortBy === "id-desc") return b.pokemon.id - a.pokemon.id;
      if (sortBy === "price-asc") return a.listing.price - b.listing.price;
      if (sortBy === "price-desc") return b.listing.price - a.listing.price;
      if (sortBy === "name-asc") return a.pokemon.name.localeCompare(b.pokemon.name);
      return 0;
    });
  }, [allCatalog, searchQuery, selectedType, stockOnly, sortBy]);

  // Pagination calculation
  const totalFilteredCount = filteredCatalog.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedCatalog = filteredCatalog.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const cartTotalQuantity = cart.reduce((acc, c) => acc + c.quantity, 0);

  // Cart item quantity lookup helper
  const cartQuantityMap = useMemo(() => {
    const map = new Map<number, number>();
    cart.forEach((c) => map.set(c.item.pokemon.id, c.quantity));
    return map;
  }, [cart]);

  const hasActiveFilters = searchQuery !== "" || selectedType !== "all" || stockOnly || sortBy !== "id-asc";

  return (
    <div data-testid="app-shell" className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col font-sans">
      {/* Header */}
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

      {/* Main Container */}
      <main data-testid="app-main" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Offline / Error Diagnostic Banner */}
        {bffStatusError && (
          <div data-testid="catalog-service-error" role="alert" className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-start space-x-3 text-red-900 dark:text-red-200 text-xs">
            <AlertCircleIcon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">System Status Warning: </span>
              {bffStatusError}
            </div>
            <button
              type="button"
              onClick={fetchFullCatalog}
              data-testid="catalog-retry"
              className="px-2.5 py-1 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded transition-colors shrink-0"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Tab 1: Shop Catalog */}
        {activeTab === "catalog" && (
          <div className="space-y-6">
            {/* Toolbar: Search, Filters, Sort, Count */}
            <div className="space-y-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Search Bar */}
                <div className="relative max-w-sm w-full">
                  <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    data-testid="catalog-search"
                    placeholder="Search by Pokémon name or #ID..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full pl-9 pr-8 py-1.5 text-xs font-mono rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => handleSearchChange("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Secondary Controls: In Stock Only, Sort, Refresh */}
                <div className="flex items-center flex-wrap gap-2 text-xs">
                  {/* Stock Filter Toggle */}
                  <button
                    type="button"
                    onClick={handleStockToggle}
                    data-testid="catalog-in-stock-filter"
                    className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors flex items-center space-x-1.5 ${
                      stockOnly
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                        : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${stockOnly ? "bg-emerald-400" : "bg-zinc-400"}`} />
                    <span>In Stock Only</span>
                  </button>

                  {/* Sort Selector */}
                  <div className="flex items-center space-x-1.5 border border-zinc-200 dark:border-zinc-700 rounded px-2.5 py-1 bg-white dark:bg-zinc-900">
                    <span className="text-zinc-400 text-[11px]">Sort:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => handleSortChange(e.target.value as any)}
                      data-testid="catalog-sort"
                      aria-label="Sort catalog items"
                      className="bg-transparent text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none font-medium cursor-pointer"
                    >
                      <option value="id-asc" className="dark:bg-zinc-900">Pokedex # (Low to High)</option>
                      <option value="id-desc" className="dark:bg-zinc-900">Pokedex # (High to Low)</option>
                      <option value="price-asc" className="dark:bg-zinc-900">Price (Lowest first)</option>
                      <option value="price-desc" className="dark:bg-zinc-900">Price (Highest first)</option>
                      <option value="name-asc" className="dark:bg-zinc-900">Name (A to Z)</option>
                    </select>
                  </div>

                  {/* Refresh Button */}
                  <button
                    type="button"
                    onClick={fetchFullCatalog}
                    disabled={isCatalogLoading}
                    data-testid="catalog-refresh"
                    className="p-1.5 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    aria-label="Refresh Catalog"
                  >
                    <RefreshIcon className={`w-3.5 h-3.5 ${isCatalogLoading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Type Filter Chips */}
              <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-xs scrollbar-thin">
                <span className="text-zinc-400 text-[11px] font-semibold uppercase tracking-wider shrink-0 mr-1 flex items-center space-x-1">
                  <FilterIcon className="w-3 h-3" />
                  <span>Type:</span>
                </span>
                {POKEMON_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTypeChange(type)}
                    data-testid={`catalog-type-${type}`}
                    className={`px-2.5 py-1 rounded text-xs font-medium uppercase tracking-wider transition-colors shrink-0 ${
                      selectedType === type
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-xs"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Results Count & Active Filter Indicator */}
              <div data-testid="catalog-results-summary" className="flex items-center justify-between text-xs font-mono pt-1 text-zinc-500">
                <div>
                  Showing <span className="font-bold text-zinc-800 dark:text-zinc-200">{paginatedCatalog.length}</span> of{" "}
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">{totalFilteredCount}</span> Pokémon
                  {hasActiveFilters && (
                    <span className="ml-1 text-zinc-400">
                      ({allCatalog.length} total in shop)
                    </span>
                  )}
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    data-testid="catalog-clear-filters"
                    className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 underline text-[11px] transition-colors"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            </div>

            {/* Catalog Grid */}
            {isCatalogLoading ? (
              <div data-testid="catalog-loading" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
                  <div
                    key={i}
                    className="h-80 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div data-testid="catalog-empty" className="p-16 text-center bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg space-y-2">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  No Pokémon matched your current filters.
                </p>
                <p className="text-xs text-zinc-500">
                  Try searching for another species or clear the active type/stock filters.
                </p>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  data-testid="catalog-reset-filters"
                  className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 rounded hover:bg-zinc-800 transition-colors"
                >
                  Reset Catalog Filters
                </button>
              </div>
            ) : (
              <div data-testid="catalog-grid" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {paginatedCatalog.map((item) => (
                  <PokemonCard
                    key={item.pokemon.id}
                    item={item}
                    onAddToCart={handleAddToCart}
                    inCartQuantity={cartQuantityMap.get(item.pokemon.id) || 0}
                  />
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div data-testid="catalog-pagination" className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-4 text-xs font-mono">
                <span className="text-zinc-500">
                  Page <span className="font-bold text-zinc-900 dark:text-zinc-100">{safeCurrentPage}</span> of {totalPages}
                </span>

                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safeCurrentPage <= 1}
                    data-testid="catalog-page-previous"
                    className="px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center space-x-1"
                  >
                    <ChevronLeftIcon className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  {/* Page Number Chips */}
                  <div className="hidden sm:flex items-center space-x-1">
                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      if (
                        pageNum === 1 ||
                        pageNum === totalPages ||
                        Math.abs(pageNum - safeCurrentPage) <= 1
                      ) {
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setCurrentPage(pageNum)}
                            data-testid={`catalog-page-${pageNum}`}
                            className={`w-7 h-7 rounded text-xs font-semibold ${
                              safeCurrentPage === pageNum
                                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      }
                      if (
                        pageNum === safeCurrentPage - 2 ||
                        pageNum === safeCurrentPage + 2
                      ) {
                        return (
                          <span key={pageNum} className="px-1 text-zinc-400">
                            …
                          </span>
                        );
                      }
                      return null;
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage >= totalPages}
                    data-testid="catalog-page-next"
                    className="px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center space-x-1"
                  >
                    <span>Next</span>
                    <ChevronRightIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Trainer Backpack / Inventory */}
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

        {/* Tab 3: Purchase Audit Ledger */}
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

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        wallet={wallet}
        user={user}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveFromCart}
        onClearCart={handleClearCart}
        onProceedToCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
        onOpenLogin={() => {
          setIsCartOpen(false);
          setIsLoginOpen(true);
        }}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cart={cart}
        wallet={wallet}
        onExecuteCheckout={handleExecuteCheckout}
        onCheckoutSuccess={() => {
          setActiveTab("inventory");
        }}
      />

      {/* Sign In Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={handleLogin}
      />

      {/* Toast Feedback */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
