import { APIRequestContext } from '@playwright/test';
import { Api3rdPartyServices } from './api3rdPartyServices';

export type ShippingMockMode =
  | 'success'
  | 'http-500'
  | 'rate-limit'
  | 'timeout-before-accept'
  | 'ambiguous-timeout'
  | 'unavailable';

export type ProviderDeliveryStatus =
  | 'LABEL_CREATED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELIVERY_FAILED';

export class ShippingMockService extends Api3rdPartyServices {
  constructor(request: APIRequestContext, private readonly baseUrl: string = 'http://localhost:3002') {
    super(request);
  }

  async checkHealth() {
    return this.request.get(`${this.baseUrl}/health`);
  }

  async setMode(mode: ShippingMockMode) {
    const res = await this.request.put(`${this.baseUrl}/__test/mode`, {
      data: { mode },
    });
    if (!res.ok()) {
      throw new Error(`Failed to set mock mode to ${mode}: ${res.status()} ${await res.text()}`);
    }
    return res.json();
  }

  async updateDeliveryStatus(providerShipmentId: string, status: ProviderDeliveryStatus) {
    const res = await this.request.patch(`${this.baseUrl}/__test/shipments/${providerShipmentId}/status`, {
      data: { status },
    });
    return res;
  }

  async getRequests() {
    const res = await this.request.get(`${this.baseUrl}/__test/requests`);
    return res.json();
  }

  async reset() {
    const res = await this.request.post(`${this.baseUrl}/__test/reset`);
    return res.json();
  }

  async getShipment(providerShipmentId: string) {
    return this.request.get(`${this.baseUrl}/shipments/${providerShipmentId}`);
  }
}
