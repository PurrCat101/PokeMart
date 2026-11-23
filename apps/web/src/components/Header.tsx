"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PokeballIcon, LedgerIcon, CartIcon, SunIcon, MoonIcon, UserIcon } from "./icons";
import { AuthUser, WalletData } from "../types/api";
import { useTheme } from "../contexts/ThemeContext";
import { Button, IconButton, cx } from "./ui";
import { WalletMenu } from "./WalletMenu";

interface HeaderProps {
  user: AuthUser | null;
  wallet: WalletData | null;
  cartCount: number;
  /** Called when a nav link is followed, e.g. to leave the verification screen. */
  onNavigate: () => void;
  onOpenCart: () => void;
  onOpenLogin: () => void;
  onLogout: () => void;
}

const TABS: Array<{ id: "catalog" | "orders"; href: string; label: string; Icon: typeof PokeballIcon }> = [
  { id: "catalog", href: "/", label: "Catalog", Icon: PokeballIcon },
  { id: "orders", href: "/orders", label: "Orders", Icon: LedgerIcon },
];

export function Header({
  user,
  wallet,
  cartCount,
  onNavigate,
  onOpenCart,
  onOpenLogin,
  onLogout,
}: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const activeTab = pathname.startsWith("/orders") ? "orders" : pathname.startsWith("/profile") ? null : "catalog";

  return (
    <>
      <header data-testid="app-header" className="sticky top-0 z-30 border-b border-line bg-surface">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-fg"
        >
          Skip to content
        </a>

        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-fg">
              <PokeballIcon className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">PokéMart</span>
          </div>

          {/* Primary navigation (desktop) */}
          <nav aria-label="Primary" className="ml-4 hidden h-full items-stretch gap-1 md:flex">
            {TABS.map(({ id, href, label, Icon }) => {
              const active = activeTab === id;
              return (
                <Link
                  key={id}
                  href={href}
                  onClick={onNavigate}
                  data-testid={`nav-${id}`}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "relative flex items-center gap-2 px-3 text-sm font-medium transition-colors",
                    active ? "text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                  <span
                    aria-hidden="true"
                    className={cx("absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-colors", active ? "bg-brand" : "bg-transparent")}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {user && <WalletMenu wallet={wallet} onNavigate={onNavigate} />}

            <button
              type="button"
              onClick={onOpenCart}
              data-testid="open-cart"
              aria-label={cartCount > 0 ? `Open bag, ${cartCount} ${cartCount === 1 ? "item" : "items"}` : "Open bag, empty"}
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-md border border-line bg-surface text-fg transition-colors hover:bg-surface-2 sm:h-9 sm:w-auto sm:gap-2 sm:px-3"
            >
              <CartIcon className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden text-sm font-medium sm:inline">Bag</span>
              {cartCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 font-mono text-xs font-bold tabular-nums text-brand-fg sm:static sm:h-auto sm:min-w-0 sm:px-1.5">
                  {cartCount}
                </span>
              )}
            </button>

            <IconButton
              label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              onClick={toggleTheme}
              data-testid="theme-toggle"
              className="border border-line"
            >
              {theme === "light" ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
            </IconButton>

            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/profile"
                  onClick={onNavigate}
                  data-testid="nav-profile"
                  aria-label="Profile"
                  aria-current={pathname.startsWith("/profile") ? "page" : undefined}
                  className="inline-flex h-11 items-center gap-2 rounded-md px-2 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:h-9"
                >
                  <UserIcon className="h-4 w-4 shrink-0" />
                  <span className="hidden max-w-32 truncate lg:inline">{user.displayName}</span>
                </Link>
                <Button variant="secondary" size="sm" onClick={onLogout} data-testid="sign-out">
                  Sign out
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={onOpenLogin} data-testid="sign-in">
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Primary navigation (mobile): bottom tab bar, icon + label */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TABS.map(({ id, href, label, Icon }) => {
          const active = activeTab === id;
          return (
            <Link
              key={id}
              href={href}
              onClick={onNavigate}
              data-testid={`nav-${id}-mobile`}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
                active ? "text-brand-text" : "text-fg-muted",
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
