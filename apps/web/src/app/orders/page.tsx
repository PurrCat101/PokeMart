"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { orderRow, type OrderKind, type OrderRow } from "../../lib/orders";
import { useApp } from "../../contexts/AppContext";
import { OrdersView } from "../../components/OrdersView";
import { LedgerIcon } from "../../components/icons";
import { Button, EmptyState, Skeleton } from "../../components/ui";

const PAGE_SIZE = 10;

interface OrdersPage {
  rows: OrderRow[];
  totalCount: number;
  offset: number;
}

const EMPTY: OrdersPage = { rows: [], totalCount: 0, offset: 0 };

export default function OrdersRoute() {
  const { user, sessionReady, openLogin, purchaseVersion } = useApp();
  const [kind, setKind] = useState<OrderKind>("pokemon");
  const [page, setPage] = useState<OrdersPage>(EMPTY);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const signedIn = !!user;

  const load = useCallback(
    async (offset: number) => {
      if (!signedIn) {
        setPage(EMPTY); // never keep one account's orders on screen after sign-out
        return;
      }
      setIsLoading(true);
      try {
        const data = await api.getPurchases(PAGE_SIZE, offset, kind === "pokemon" ? "POKEMON" : "ITEM");
        setPage({ rows: data.items.map(orderRow), totalCount: data.totalCount, offset: data.page.offset });
        setHasError(false);
      } catch {
        // Keep the rows already on screen; the view shows a non-blocking notice.
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    },
    [signedIn, kind],
  );

  // First page whenever the account, the order type or the purchase count changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the list when the page opens; the fetch sets its own loading flag first
    void load(0);
  }, [load, purchaseVersion]);

  const changeKind = (next: OrderKind) => {
    if (next === kind) return;
    setPage(EMPTY);
    setHasError(false);
    setKind(next);
  };

  if (!sessionReady) {
    return (
      <div data-testid="orders-session-loading" role="status" aria-label="Loading orders" className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState
        data-testid="purchases-auth-required"
        icon={<LedgerIcon className="h-6 w-6" />}
        title="Sign in to see your orders"
        description="Your order history and delivery status live in your trainer account."
        action={
          <Button variant="primary" onClick={openLogin} data-testid="purchases-sign-in">
            Sign in
          </Button>
        }
        className="mx-auto my-8 max-w-lg"
      />
    );
  }

  return (
    <OrdersView
      kind={kind}
      onKindChange={changeKind}
      rows={page.rows}
      totalCount={page.totalCount}
      limit={PAGE_SIZE}
      offset={page.offset}
      isLoading={isLoading}
      hasError={hasError}
      onRefresh={() => load(page.offset)}
      onPageChange={(offset) => load(offset)}
    />
  );
}
