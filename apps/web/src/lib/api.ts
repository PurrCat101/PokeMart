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
  AccountInfo,
} from "../types/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public details: Array<{ field?: string; message: string }> = []
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function userMessage(code: string, fallback: string): string {
  const messages: Record<string, string> = {
    DEPENDENCY_UNAVAILABLE: "บริการชั่วคราวไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง",
    INTERNAL_ERROR: "เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่ภายหลัง",
    INSUFFICIENT_FUNDS: "ยอดเงินในกระเป๋าไม่เพียงพอ",
    INSUFFICIENT_STOCK: "สินค้าในสต็อกไม่เพียงพอ",
    KYC_LEVEL_REQUIRED: "ระดับ KYC ของคุณยังไม่เพียงพอสำหรับสินค้านี้",
    UNAUTHORIZED: "กรุณาเข้าสู่ระบบก่อนดำเนินการ",
    INVALID_CREDENTIALS: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  };
  return messages[code] ?? fallback;
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("pokemart_token");
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

  const response = await fetch(path, {
    ...options,
    headers,
  });

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
        payload.error.details || []
      );
    }

    throw new ApiError(
      response.status,
      "HTTP_ERROR",
        `Request failed with status ${response.status} (${response.statusText})`,
      resRequestId
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
    const result = await request<{ purchaseId: string; item: { id: number; name: string }; quantity: number; pricing: { unitPrice: number; totalPrice: number }; createdAt: string }>("/api/items/purchases", {
      method: "POST",
      body: JSON.stringify(purchase),
    });
    return { purchaseId: result.purchaseId, itemId: result.item.id, itemName: result.item.name, quantity: result.quantity, unitPrice: result.pricing.unitPrice, totalPrice: result.pricing.totalPrice, createdAt: result.createdAt };
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
  async getPurchases(limit = 10, offset = 0): Promise<PurchasesPageResponse> {
    return request<PurchasesPageResponse>(`/api/purchases?limit=${limit}&offset=${offset}`);
  },

  async createPurchase(purchase: CreatePurchaseRequest): Promise<PurchaseItem> {
    return request<PurchaseItem>("/api/purchases", {
      method: "POST",
      body: JSON.stringify(purchase),
    });
  },

  async getShipment(purchaseId: string): Promise<ShipmentItem> {
    return request<ShipmentItem>(`/api/purchases/${purchaseId}/shipment`);
  },
};
