import React from "react";
import { PokeballIcon, WalletIcon, BackpackIcon, LedgerIcon, UserIcon } from "./icons";
import { AuthUser, WalletData } from "../types/api";

interface HeaderProps {
  activeTab: "catalog" | "inventory" | "purchases";
  onTabChange: (tab: "catalog" | "inventory" | "purchases") => void;
  user: AuthUser | null;
  wallet: WalletData | null;
  inventoryCount: number;
  onOpenLogin: () => void;
  onLogout: () => void;
}

export function Header({
  activeTab,
  onTabChange,
  user,
  wallet,
  inventoryCount,
  onOpenLogin,
  onLogout,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/95 border-b border-zinc-200 dark:border-zinc-800 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Identity */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded bg-red-600 text-white flex items-center justify-center shadow-sm">
                <PokeballIcon className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold tracking-tight text-zinc-950 dark:text-zinc-50 text-base leading-none">
                  POKÉMART
                </span>
                <span className="text-[10px] font-mono tracking-widest text-zinc-600 dark:text-zinc-400 uppercase mt-0.5">
                  COMMERCE TERMINAL
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="hidden md:flex space-x-1 border-l border-zinc-200 dark:border-zinc-800 pl-6">
              <button
                type="button"
                onClick={() => onTabChange("catalog")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center space-x-2 ${
                  activeTab === "catalog"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <PokeballIcon className="w-4 h-4" />
                <span>Shop Catalog</span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange("inventory")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center space-x-2 ${
                  activeTab === "inventory"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <BackpackIcon className="w-4 h-4" />
                <span>Trainer Bag</span>
                {inventoryCount > 0 && (
                  <span className="ml-1 text-xs font-mono font-semibold px-1.5 py-0.2 bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded">
                    {inventoryCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => onTabChange("purchases")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center space-x-2 ${
                  activeTab === "purchases"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <LedgerIcon className="w-4 h-4" />
                <span>Audit Ledger</span>
              </button>
            </nav>
          </div>

          {/* Right Status & Trainer Profile */}
          <div className="flex items-center space-x-4">
            {/* Wallet Balance Display */}
            {user && (
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <WalletIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">Balance:</span>
                <span className="text-sm font-mono font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                  ₽ {wallet ? wallet.balance.toLocaleString() : "---"}
                </span>
              </div>
            )}

            {/* Auth Actions */}
            {user ? (
              <div className="flex items-center space-x-3">
                <div className="hidden sm:flex items-center space-x-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                  <UserIcon className="w-3.5 h-3.5 text-zinc-600" />
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{user.displayName}</span>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenLogin}
                className="px-3.5 py-1.5 text-xs font-semibold rounded bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
              >
                Sign In as Trainer
              </button>
            )}
          </div>
        </div>

        {/* Mobile Nav Tabs */}
        <div className="flex md:hidden border-t border-zinc-200 dark:border-zinc-800 py-2 space-x-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => onTabChange("catalog")}
            className={`px-3 py-1 rounded text-xs font-medium ${
              activeTab === "catalog"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            Catalog
          </button>
          <button
            type="button"
            onClick={() => onTabChange("inventory")}
            className={`px-3 py-1 rounded text-xs font-medium ${
              activeTab === "inventory"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            Trainer Bag ({inventoryCount})
          </button>
          <button
            type="button"
            onClick={() => onTabChange("purchases")}
            className={`px-3 py-1 rounded text-xs font-medium ${
              activeTab === "purchases"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            Audit Ledger
          </button>
        </div>
      </div>
    </header>
  );
}
