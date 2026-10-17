import { APIRequestContext } from '@playwright/test';

export class BffService {
  constructor(private readonly request: APIRequestContext) {}

  getCatalog(limit = 20, offset = 0) {
    return this.request.get(`/api/pokemon?limit=${limit}&offset=${offset}`);
  }

  getWallet() {
    return this.request.get('/api/wallet');
  }
}
