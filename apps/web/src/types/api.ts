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

export interface ItemCatalogItem {
  id: number;
  name: string;
  category: string | null;
  spriteUrl: string | null;
  price: number;
  stock: number;
  requiredKycLevel: 0 | 1 | 2;
}

export interface ItemCatalogResponse {
  count: number;
  limit: number;
  offset: number;
  results: ItemCatalogItem[];
}

export interface CreateItemPurchaseRequest {
  purchaseId: string;
  itemId: number;
  quantity: number;
}

export interface ItemPurchase {
  purchaseId: string;
  itemId: number;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: string;
}

/** One owned item, flattened from the BFF `{ item: { id, name }, quantity }` shape. */
export interface ItemInventoryEntry {
  itemId: number;
  name: string;
  quantity: number;
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

export interface KycStatus {
  /** 0 = not verified, 1 = basic, 2 = advanced. */
  level: 0 | 1 | 2;
  status: "ACTIVE" | "PENDING_REVIEW" | "REJECTED";
  updatedAt: string;
}

export interface KycSubmission {
  fullName: string;
  nationalId: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  phone: string;
  address: string;
}

export interface AccountInfo {
  user: AuthUser;
  wallet: WalletData;
  /** null when the KYC service is unavailable. */
  kyc: KycStatus | null;
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

/** One purchase, Pokémon or item. `kind` says which of `pokemon` / `item` is present. */
export interface PurchaseItem {
  purchaseId: string;
  kind: "POKEMON" | "ITEM";
  pokemon?: {
    id: number;
    name: string;
  };
  item?: {
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

export interface ShipmentItem {
  purchaseId: string;
  orderStatus: string;
  processingStatus: string;
  deliveryStatus: string;
  trackingNumber: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
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

/** A line in the bag: either a Pokémon listing or an item listing. */
export type CartItem =
  | { kind: "pokemon"; item: CatalogItem; quantity: number }
  | { kind: "item"; item: ItemCatalogItem; quantity: number };

/** What a completed checkout line looks like, whichever endpoint produced it. */
export interface CheckoutReceipt {
  purchaseId: string;
  kind: "pokemon" | "item";
  name: string;
  quantity: number;
  totalPrice: number;
}

export interface CheckoutFailure {
  key: string;
  name: string;
  error: string;
}
