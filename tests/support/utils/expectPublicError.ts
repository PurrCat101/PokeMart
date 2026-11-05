import { APIResponse, expect } from '@playwright/test';

type PublicError = {
  status: number;
  code: string;
  message: string;
  requestId: string;
  details: Array<{ field: string; message: string }>;
  retryable?: boolean;
};

export async function expectPublicError(response: APIResponse, expected: PublicError): Promise<void> {
  expect(response.status()).toBe(expected.status);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(response.headers()['x-request-id']).toBe(expected.requestId);
  // toMatchObject: the internal API envelope has no `retryable`; the public BFF envelope adds it.
  expect(await response.json()).toMatchObject({
    error: {
      code: expected.code,
      message: expected.message,
      requestId: expected.requestId,
      details: expected.details,
      ...(expected.retryable === undefined ? {} : { retryable: expected.retryable }),
    },
  });
}
