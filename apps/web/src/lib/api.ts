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
        payload.error.message || `Request failed with status ${response.status}`,
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

  logout(): void {
    clearToken();
  },

  // Catalog
  async getPokemonList(limit = 12, offset = 0): Promise<CatalogResponse> {
    return request<CatalogResponse>(`/api/pokemon?limit=${limit}&offset=${offset}`);
  },

  async getAllPokemon(): Promise<CatalogItem[]> {
    const firstPage = await request<CatalogResponse>("/api/pokemon?limit=100&offset=0");
    const allItems = [...firstPage.items];
    if (firstPage.totalCount > 100) {
      const remainingPages = Math.ceil((firstPage.totalCount - 100) / 100);
      const requests = [];
      for (let i = 1; i <= remainingPages; i++) {
        requests.push(request<CatalogResponse>(`/api/pokemon?limit=100&offset=${i * 100}`));
      }
      const additionalPages = await Promise.all(requests);
      for (const page of additionalPages) {
        allItems.push(...page.items);
      }
    }
    return allItems;
  },

  async getPokemonDetail(id: number): Promise<CatalogItem> {
    return request<CatalogItem>(`/api/pokemon/${id}`);
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
};
