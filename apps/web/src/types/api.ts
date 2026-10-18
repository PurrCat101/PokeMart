export interface PokemonInfo {
  id: number;
  name: string;
  types: string[];
  spriteUrl?: string;
}

export interface PokemonListing {
  price: number;
  availableStock: number;
}

export interface CatalogItem {
  pokemon: PokemonInfo;
  listing: PokemonListing;
}

export interface CatalogResponse {
  totalCount: number;
  page: {
    limit: number;
    offset: number;
  };
  items: CatalogItem[];
}

export interface AuthUser {
  userId: string;
  email: string;
  displayName: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
}

export interface WalletData {
  userId: string;
  balance: number;
}

export interface InventoryItem {
  pokemon: {
    id: number;
    name: string;
  };
  quantity: number;
}

export interface InventoryResponse {
  items: InventoryItem[];
}

export interface PurchaseItem {
  purchaseId: string;
  pokemon: {
    id: number;
    name: string;
  };
  quantity: number;
  pricing: {
    unitPrice: number;
    totalPrice: number;
  };
  createdAt: string;
}

export interface PurchasesPageResponse {
  totalCount: number;
  page: {
    limit: number;
    offset: number;
  };
  items: PurchaseItem[];
}

export interface CreatePurchaseRequest {
  purchaseId: string;
  pokemonId: number;
  quantity: number;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details: ApiErrorDetail[];
  };
}

export interface CartItem {
  item: CatalogItem;
  quantity: number;
}
