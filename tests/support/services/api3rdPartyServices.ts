import { APIRequestContext } from '@playwright/test';

/** Base wrapper for a dependency outside the PokéMart system boundary. */
export class Api3rdPartyServices {
  constructor(protected readonly request: APIRequestContext) {}
}
