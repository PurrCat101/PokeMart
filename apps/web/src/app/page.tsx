"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api, ApiError } from "../lib/api";
import {
  CatalogItem,
  AuthUser,
  WalletData,
  InventoryItem,
  PurchaseItem,
} from "../types/api";
import { Header } from "../components/Header";
import { PokemonCard } from "../components/PokemonCard";
import { PurchaseModal } from "../components/PurchaseModal";
import { LoginModal } from "../components/LoginModal";
import { InventoryView } from "../components/InventoryView";
import { PurchasesView } from "../components/PurchasesView";
import { Toast, ToastMessage } from "../components/Toast";
import { SearchIcon, ChevronLeftIcon, ChevronRightIcon, RefreshIcon, AlertCircleIcon } from "../components/icons";

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
];

export default function PokemartCommerceTerminal() {
  // Navigation & View Tab
  const [activeTab, setActiveTab] = useState<"catalog" | "inventory" | "purchases">("catalog");

  // Authentication & Trainer State
  const [user, setUser] = useState<AuthUser | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  // Catalog State
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLimit] = useState(12);
  const [catalogOffset, setCatalogOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);

  // Inventory & Purchases
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isInventoryLoading, setIsInventoryLoading] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseItem[]>([]);
  const [purchasesTotal, setPurchasesTotal] = useState(0);
  const [purchasesOffset, setPurchasesOffset] = useState(0);
  const [purchasesLimit] = useState(10);
  const [isPurchasesLoading, setIsPurchasesLoading] = useState(false);

  // Active Transaction State
  const [pendingPurchaseItem, setPendingPurchaseItem] = useState<CatalogItem | null>(null);
  const [pendingQuantity, setPendingQuantity] = useState(1);

  // Feedback & Diagnostics
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [bffStatusError, setBffStatusError] = useState<string | null>(null);

  // 1. Check existing session
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

  // 2. Fetch Catalog
  const fetchCatalog = useCallback(async (offset = 0) => {
    setIsCatalogLoading(true);
    setBffStatusError(null);
    try {
      const data = await api.getPokemonList(catalogLimit, offset);
      setCatalogItems(data.items);
      setCatalogTotal(data.totalCount);
      setCatalogOffset(data.page.offset);
    } catch (err: any) {
      setBffStatusError(
        err instanceof ApiError && err.code === "DEPENDENCY_UNAVAILABLE"
          ? "BFF service or upstream PokéMart API is currently offline. Ensure docker containers or bff/api are running."
          : err.message || "Failed to load shop catalog."
      );
    } finally {
      setIsCatalogLoading(false);
    }
  }, [catalogLimit]);

  // 3. Fetch Inventory
  const fetchInventory = useCallback(async () => {
    if (!user) return;
    setIsInventoryLoading(true);
    try {
      const data = await api.getInventory();
      setInventoryItems(data.items);
    } catch {
      // ignore if unauthorized
    } finally {
      setIsInventoryLoading(false);
    }
  }, [user]);

  // 4. Fetch Purchases
  const fetchPurchases = useCallback(async (offset = 0) => {
    if (!user) return;
    setIsPurchasesLoading(true);
    try {
      const data = await api.getPurchases(purchasesLimit, offset);
      setPurchaseHistory(data.items);
      setPurchasesTotal(data.totalCount);
      setPurchasesOffset(data.page.offset);
    } catch {
      // ignore if unauthorized
    } finally {
      setIsPurchasesLoading(false);
    }
  }, [user, purchasesLimit]);

  // Initial load
  useEffect(() => {
    syncSession();
    fetchCatalog(0);
  }, [syncSession, fetchCatalog]);

  // When user changes or tab switches
  useEffect(() => {
    if (activeTab === "inventory" && user) fetchInventory();
    if (activeTab === "purchases" && user) fetchPurchases(0);
  }, [activeTab, user, fetchInventory, fetchPurchases]);

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

  // Initiate purchase
  const handleInitiatePurchase = (item: CatalogItem, quantity: number) => {
    if (!user) {
      setIsLoginOpen(true);
      return;
    }
    setPendingPurchaseItem(item);
    setPendingQuantity(quantity);
  };

  // Confirm Purchase Execution
  const handleConfirmPurchase = async (purchaseId: string, pokemonId: number, quantity: number) => {
    const result = await api.createPurchase({
      purchaseId,
      pokemonId,
      quantity,
    });

    // Refresh wallet balance, inventory, and catalog listing
    const walletRes = await api.getWallet();
    setWallet(walletRes.wallet);
    fetchInventory();
    fetchCatalog(catalogOffset);

    setPendingPurchaseItem(null);
    setToast({
      id: crypto.randomUUID(),
      type: "success",
      title: `Order Complete: ${result.pokemon.name} × ${result.quantity}`,
      message: `Tx: ${result.purchaseId.substring(0, 8)}... | Paid: ₽ ${result.pricing.totalPrice.toLocaleString()}`,
    });
  };

  // Filtered Catalog Items (Client search & type filter)
  const filteredCatalog = useMemo(() => {
    return catalogItems.filter((item) => {
      const matchesSearch =
        item.pokemon.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(item.pokemon.id).includes(searchQuery);
      const matchesType =
        selectedType === "all" ||
        item.pokemon.types.map((t) => t.toLowerCase()).includes(selectedType);
      return matchesSearch && matchesType;
    });
  }, [catalogItems, searchQuery, selectedType]);

  const hasCatalogNext = catalogOffset + catalogLimit < catalogTotal;
  const hasCatalogPrev = catalogOffset > 0;
  const catalogPageNum = Math.floor(catalogOffset / catalogLimit) + 1;
  const catalogTotalPages = Math.max(1, Math.ceil(catalogTotal / catalogLimit));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans selection:bg-red-600 selection:text-white">
      {/* App Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        wallet={wallet}
        inventoryCount={inventoryItems.reduce((acc, i) => acc + i.quantity, 0)}
        onOpenLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* BFF / Upstream Connectivity Banner */}
        {bffStatusError && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-start space-x-3 text-red-900 dark:text-red-200 text-xs">
            <AlertCircleIcon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">System Status Warning: </span>
              {bffStatusError}
            </div>
            <button
              type="button"
              onClick={() => fetchCatalog(catalogOffset)}
              className="px-2.5 py-1 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded transition-colors shrink-0"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Tab 1: Shop Catalog */}
        {activeTab === "catalog" && (
          <div className="space-y-6">
            {/* Toolbar: Search, Type Filter, Pagination */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              {/* Search Bar */}
              <div className="relative max-w-xs w-full">
                <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filter name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs font-mono rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
                />
              </div>

              {/* Type Filter Chips */}
              <div className="flex items-center space-x-1 overflow-x-auto pb-1 md:pb-0 text-xs">
                {POKEMON_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={`px-2.5 py-1 rounded text-xs font-medium uppercase tracking-wider transition-colors shrink-0 ${
                      selectedType === type
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center space-x-2 text-xs font-mono self-end md:self-auto shrink-0">
                <span className="text-zinc-500 text-[11px]">
                  Pg {catalogPageNum}/{catalogTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => fetchCatalog(catalogOffset - catalogLimit)}
                  disabled={!hasCatalogPrev || isCatalogLoading}
                  className="p-1.5 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous Page"
                >
                  <ChevronLeftIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => fetchCatalog(catalogOffset + catalogLimit)}
                  disabled={!hasCatalogNext || isCatalogLoading}
                  className="p-1.5 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next Page"
                >
                  <ChevronRightIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => fetchCatalog(catalogOffset)}
                  disabled={isCatalogLoading}
                  className="p-1.5 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  aria-label="Refresh Catalog"
                >
                  <RefreshIcon className={`w-3.5 h-3.5 ${isCatalogLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Catalog Grid */}
            {isCatalogLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-80 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="p-16 text-center bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  No Pokémon matched your current filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedType("all");
                  }}
                  className="mt-3 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded hover:bg-zinc-200"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredCatalog.map((item) => (
                  <PokemonCard
                    key={item.pokemon.id}
                    item={item}
                    onInitiatePurchase={handleInitiatePurchase}
                  />
                ))}
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

      {/* Transaction Confirmation Modal */}
      <PurchaseModal
        item={pendingPurchaseItem}
        initialQuantity={pendingQuantity}
        wallet={wallet}
        onClose={() => setPendingPurchaseItem(null)}
        onConfirm={handleConfirmPurchase}
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
