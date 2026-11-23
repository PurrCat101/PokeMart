import {
  CatalogResponse,
  CatalogItem,
  LoginResponse,
  AuthUser,
  WalletData,
  InventoryResponse,
  PurchasesPageResponse,
  PurchaseItem,
  CreatePurchaseRequest,
  ApiErrorResponse,
  ShipmentItem,
  ItemCatalogResponse,
  CreateItemPurchaseRequest,
  ItemPurchase,
  ItemInventoryEntry,
  AccountInfo,
  KycStatus,
  KycSubmission,
} from "../types/api";

/** Codes the user can act on themselves (fix input, add funds, sign in, verify). Everything else is a system fault. */
const USER_ACTIONABLE_CODES = new Set([
  "VALIDATION_ERROR",
  "UNKNOWN_QUERY_PARAMETER",
  "INVALID_JSON",
  "UNAUTHORIZED",
  "INVALID_CREDENTIALS",
  "INSUFFICIENT_FUNDS",
  "INSUFFICIENT_STOCK",
  "PURCHASE_DUPLICATE",
  "POKEMON_NOT_FOR_SALE",
  "ITEM_NOT_FOR_SALE",
  "POKEMON_NOT_FOUND",
  "ITEM_NOT_FOUND",
  "KYC_LEVEL_REQUIRED",
  "KYC_PENDING_REVIEW",
  "KYC_ALREADY_PENDING",
  "KYC_ALREADY_VERIFIED",
  "PAYMENT_FAILED",
  "TOP_UP_DUPLICATE",
]);

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public details: Array<{ field?: string; message: string }> = [],
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The user did nothing wrong and cannot fix it: 5xx, or a code the app does not recognise. */
  get isSystemFault(): boolean {
    if (this.code === "NETWORK_ERROR") return false; // never reached the server; nothing to look up
    return this.status >= 500 || !USER_ACTIONABLE_CODES.has(this.code);
  }

  /**
   * The only diagnostic a person needs: a reference to quote to support. Present for system faults
   * only. Business errors (wallet, stock, KYC, sign-in) are explained in plain words instead.
   */
  get reference(): string | undefined {
    return this.isSystemFault ? this.requestId : undefined;
  }
}

/** Reference to show next to an error message, or undefined when the user does not need one. */
export function errorReference(err: unknown): string | undefined {
  return err instanceof ApiError ? err.reference : undefined;
}

function userMessage(code: string, fallback: string): string {
  const messages: Record<string, string> = {
    DEPENDENCY_UNAVAILABLE: "Service is temporarily unavailable. Please try again later.",
    INTERNAL_ERROR: "Something went wrong. Please try again later.",
    INSUFFICIENT_FUNDS: "Your wallet balance is insufficient.",
    INSUFFICIENT_STOCK: "Not enough stock available.",
    KYC_LEVEL_REQUIRED: "Additional account verification is required to buy this item.",
    KYC_PENDING_REVIEW: "Your verification is under review, so you can't buy this item right now.",
    KYC_ALREADY_PENDING: "Your verification request is already under review.",
    KYC_ALREADY_VERIFIED: "This account is already verified.",
    UNAUTHORIZED: "Please sign in to continue.",
    INVALID_CREDENTIALS: "Incorrect email or password.",
    NETWORK_ERROR: "We can't reach the server. Check your connection and try again.",
    HTTP_ERROR: "Something went wrong. Please try again later.",
  };
  return messages[code] ?? fallback;
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("pokemart_token");
}

export function hasStoredToken(): boolean {
  return getStoredToken() !== null;
}

export function saveToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("pokemart_token", token);
  }
}

export function clearToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("pokemart_token");
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const requestId = crypto.randomUUID();

  const headers: Record<string, string> = {
    "X-Request-Id": requestId,
    ...(options.headers as Record<string, string>),
  };

  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
    });
  } catch {
    // Offline, DNS failure or the browser blocked the call. The request never reached the BFF,
    // so there is no log line to look up and no reference to show.
    throw new ApiError(0, "NETWORK_ERROR", userMessage("NETWORK_ERROR", ""), undefined, [], true);
  }

  const resRequestId = response.headers.get("x-request-id") || requestId;

  if (!response.ok) {
    let payload: ApiErrorResponse | undefined;
    try {
      payload = await response.json();
    } catch {
      // payload not JSON
    }

    if (payload?.error) {
      throw new ApiError(
        response.status,
        payload.error.code || "REQUEST_FAILED",
        userMessage(payload.error.code || "REQUEST_FAILED", payload.error.message || `Request failed with status ${response.status}`),
        payload.error.requestId || resRequestId,
        payload.error.details || [],
        payload.error.retryable === true
      );
    }

    // Not our error envelope (a proxy page, a crash). Never show the raw status text to the user.
    throw new ApiError(
      response.status,
      "HTTP_ERROR",
      userMessage("HTTP_ERROR", ""),
      resRequestId,
      [],
      response.status >= 500
    );
  }

  return response.json();
}

export const api = {
  // Auth
  async login(credentials: { email: string; password: string }): Promise<LoginResponse> {
    const data = await request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    saveToken(data.accessToken);
    return data;
  },

  async getMe(): Promise<{ user: AuthUser }> {
    return request<{ user: AuthUser }>("/api/auth/me");
  },

  async getAccountInfo(): Promise<AccountInfo> {
    return request<AccountInfo>("/api/account-info");
  },

  async submitKyc(submission: KycSubmission): Promise<KycStatus> {
    return request<KycStatus>("/api/kyc/submissions", { method: "POST", body: JSON.stringify(submission) });
  },

  logout(): void {
    clearToken();
  },

  // Catalog
  async getPokemonList(limit = 12, offset = 0, filters: { q?: string; type?: string; inStock?: boolean } = {}): Promise<CatalogResponse> {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (filters.q) query.set("q", filters.q);
    if (filters.type && filters.type !== "all") query.set("type", filters.type);
    if (filters.inStock) query.set("inStock", "true");
    return request<CatalogResponse>(`/api/pokemon?${query}`);
  },

  async getPokemonDetail(id: number): Promise<CatalogItem> {
    return request<CatalogItem>(`/api/pokemon/${id}`);
  },

  async getItemList(limit = 12, offset = 0, filters: { q?: string; category?: string; inStock?: boolean } = {}): Promise<ItemCatalogResponse> {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (filters.q) query.set("q", filters.q);
    if (filters.category && filters.category !== "all") query.set("category", filters.category);
    if (filters.inStock) query.set("inStock", "true");
    const page = await request<{ totalCount: number; page: { limit: number; offset: number }; items: Array<{ item: { id: number; name: string; category: string | null; spriteUrl: string | null }; listing: { price: number; availableStock: number; requiredKycLevel: 0 | 1 | 2 } }> }>(`/api/items?${query}`);
    // Public DTO groups item and listing like the Pokémon catalog; the item UI components use the flat view model.
    return {
      count: page.totalCount, limit: page.page.limit, offset: page.page.offset,
      results: page.items.map(({ item, listing }) => ({ ...item, price: listing.price, stock: listing.availableStock, requiredKycLevel: listing.requiredKycLevel })),
    };
  },

  async getItemCategories(): Promise<string[]> {
    const result = await request<{ categories: string[] }>("/api/item-categories");
    return result.categories;
  },

  async createItemPurchase(purchase: CreateItemPurchaseRequest): Promise<ItemPurchase> {
    const result = await request<PurchaseItem>("/api/purchases", {
      method: "POST",
      body: JSON.stringify(purchase),
    });
    const item = result.item;
    if (!item) throw new Error("Unexpected purchase response: missing item");
    return { purchaseId: result.purchaseId, itemId: item.id, itemName: item.name, quantity: result.quantity, unitPrice: result.pricing.unitPrice, totalPrice: result.pricing.totalPrice, createdAt: result.createdAt };
  },

  // Wallet
  async getWallet(): Promise<{ wallet: WalletData }> {
    return request<{ wallet: WalletData }>("/api/wallet");
  },

  // Inventory
  async getInventory(): Promise<InventoryResponse> {
    return request<InventoryResponse>("/api/inventory");
  },

  // Purchases
  // One history for both kinds; `kind` narrows it to Pokémon or item orders.
  async getPurchases(limit = 10, offset = 0, kind?: "POKEMON" | "ITEM"): Promise<PurchasesPageResponse> {
    return request<PurchasesPageResponse>(`/api/purchases?limit=${limit}&offset=${offset}${kind ? `&kind=${kind}` : ""}`);
  },

  async createPurchase(purchase: CreatePurchaseRequest): Promise<PurchaseItem> {
    return request<PurchaseItem>("/api/purchases", {
      method: "POST",
      body: JSON.stringify(purchase),
    });
  },

  /** Reads one purchase back. Used to confirm a purchase whose first answer was lost. */
  async getPurchase(purchaseId: string): Promise<PurchaseItem> {
    return request<PurchaseItem>(`/api/purchases/${encodeURIComponent(purchaseId)}`);
  },

  // Items have their own inventory; their orders live in the same purchase history and ship like Pokémon orders.
  async getItemInventory(): Promise<ItemInventoryEntry[]> {
    const result = await request<{ items: Array<{ item: { id: number; name: string }; quantity: number }> }>("/api/items/inventory");
    return result.items.map(({ item, quantity }) => ({ itemId: item.id, name: item.name, quantity }));
  },

  async getShipment(purchaseId: string): Promise<ShipmentItem> {
    return request<ShipmentItem>(`/api/purchases/${purchaseId}/shipment`);
  },
};
